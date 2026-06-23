import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.REACT_APP_VERSION || '1.0.0',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    if (event.exception) {
      const err = event.exception.values?.[0];
      const msg = err?.value || '';
      // Ignore non-critical noise
      if (
        msg.includes('ResizeObserver') ||
        msg.includes('Network request failed') ||
        msg.includes('Load failed')
      ) return null;
    }
    return event;
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: '#1e293b', marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 300 }}>
          This error has been reported automatically. Please try again.
        </div>
        <button
          onClick={resetError}
          style={{
            background: '#1e3a8a', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 28px', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}>
          Try Again
        </button>
      </div>
    )}
  >
    <App />
  </Sentry.ErrorBoundary>
);

requestAnimationFrame(() => {
  setTimeout(() => { if (window.__hideSplash) window.__hideSplash(); }, 400);
});

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        // Check for a new SW version on every load, so a stale tab left
        // open in the background still picks up fixes promptly.
        reg.update().catch(() => {});

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.__showUpdateBanner) window.__showUpdateBanner();

              // Don't force it on someone mid-task. Apply automatically the
              // moment it's safe to do so: either the tab becomes hidden
              // (they've switched away/closed it) or after a grace period
              // if they just leave it open without tapping Update.
              const autoApply = () => { if (window.__applyUpdate) window.__applyUpdate(); };
              const onHide = () => {
                if (document.visibilityState === 'hidden') {
                  autoApply();
                  document.removeEventListener('visibilitychange', onHide);
                }
              };
              document.addEventListener('visibilitychange', onHide);
              setTimeout(autoApply, 5 * 60 * 1000); // safety net: 5 min grace period
            }
          });
        });

        window.__applyUpdate = function() {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            window.location.reload();
          }
        };

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      })
      .catch(err => {
        // SW registration failure is non-critical — don't alert Sentry
        console.warn('[SW] Registration failed:', err);
      });
  });
}
