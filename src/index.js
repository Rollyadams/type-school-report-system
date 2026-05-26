import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Hide splash screen once React has painted
requestAnimationFrame(() => {
  setTimeout(() => {
    if (window.__hideSplash) window.__hideSplash();
  }, 300);
});

// ── Service Worker Registration ──────────────────────────────
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(reg => {
        console.log('[SW] Registered:', reg.scope);

        // Notify SW to skip waiting when a new version is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — could show a toast here
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              console.log('[SW] New version activated');
            }
          });
        });
      })
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}
