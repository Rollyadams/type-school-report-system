import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

requestAnimationFrame(() => {
  setTimeout(() => { if (window.__hideSplash) window.__hideSplash(); }, 400);
});

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              if (window.__showUpdateBanner) window.__showUpdateBanner();
            }
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      })
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}
