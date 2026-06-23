import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

const rootElement = document.getElementById('root');
const initialSplash = document.querySelector('.initial-splash');
const splashStartedAt = performance.now();
const MINIMUM_SPLASH_MS = 1250;
const SPLASH_EXIT_MS = 420;

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

function renderApp() {
  ReactDOM.createRoot(rootElement as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

function finishInitialSplash() {
  if (!initialSplash) {
    renderApp();
    return;
  }

  renderApp();
  initialSplash.classList.add('initial-splash-exiting');
  window.setTimeout(() => {
    initialSplash.remove();
  }, SPLASH_EXIT_MS);
}

const remainingSplashMs = Math.max(0, MINIMUM_SPLASH_MS - (performance.now() - splashStartedAt));
window.setTimeout(finishInitialSplash, remainingSplashMs);

if ('serviceWorker' in navigator && (window.isSecureContext || window.location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    const basePath = import.meta.env.BASE_URL || '/';
    const serviceWorkerUrl = `${basePath.replace(/\/?$/u, '/')}service-worker.js`;
    navigator.serviceWorker.register(serviceWorkerUrl).catch((error) => {
      console.error('Failed to register SHIELD service worker:', error);
    });
  });
}
