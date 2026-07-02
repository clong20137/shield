import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

const rootElement = document.getElementById('root');
const initialSplash = document.querySelector('.initial-splash');
const splashStartedAt = performance.now();
const MINIMUM_SPLASH_MS = 1500;
const SPLASH_EXIT_MS = 560;

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((error) => {
        console.error('Failed to unregister app service worker:', error);
      });
  });
}
