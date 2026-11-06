const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL es obligatoria en producción.');
}
if (import.meta.env.PROD && configuredApiUrl && !configuredApiUrl.startsWith('https://')) {
  throw new Error('VITE_API_URL debe usar HTTPS en producción.');
}

export const apiBaseUrl = (configuredApiUrl ?? 'http://localhost:4000').replace(/\/$/, '');
