export function getTestDatabaseUrl(value: string | undefined) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Las pruebas de integración no se pueden ejecutar en producción.');
  }
  if (!value) {
    throw new Error('Define DATABASE_URL_TEST para ejecutar las pruebas de integración.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL_TEST no es una URL válida de PostgreSQL.');
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL_TEST no es una URL válida de PostgreSQL.');
  }
  if (databaseName !== 'resi_control_test') {
    throw new Error('DATABASE_URL_TEST debe apuntar exclusivamente a la base PostgreSQL resi_control_test.');
  }

  return value;
}
