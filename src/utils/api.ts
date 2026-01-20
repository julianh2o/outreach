const API_PORT = 2999;

export const getApiBaseUrl = (): string => {
  // In production, use the same origin as the frontend (no port, same protocol)
  // In development (localhost), use the API port
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalhost) {
    return `http://${window.location.hostname}:${API_PORT}`;
  }

  // In production, use the same origin (includes protocol and domain)
  return window.location.origin;
};
