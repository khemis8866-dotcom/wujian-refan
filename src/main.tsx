import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(registration => {
        const ready = () => window.dispatchEvent(new CustomEvent('offline-ready'));
        if (registration.active) ready();
        registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', () => {
          if (registration.installing?.state === 'activated' || registration.active) ready();
        }));
        navigator.serviceWorker.ready.then(ready).catch(() => {});
      })
      .catch(() => window.dispatchEvent(new CustomEvent('offline-error')));
  });
}
