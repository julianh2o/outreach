import React from 'react';
import { createRoot } from 'react-dom/client';
import { Helmet, HelmetProvider } from 'react-helmet-async';

import App from './App';

import { APP_TITLE, APP_DESCRIPTION } from './utils/constants';
import { reportError } from './utils/errorReporter';

window.onerror = (
  message: string | Event,
  _source?: string,
  _lineno?: number,
  _colno?: number,
  error?: Error,
): boolean => {
  reportError(error || String(message), 'runtime');
  return false;
};

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError(error, 'runtime');
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <Helmet>
        <title>{APP_TITLE}</title>
        <meta name='description' content={APP_DESCRIPTION} />
        <link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap' />
        <meta name='viewport' content='initial-scale=1, width=device-width' />
      </Helmet>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
