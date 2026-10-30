import { describe, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

describe('protección de base de datos de integración', () => {
  it('exige una URL explícita', () => {
    expect(() => getTestDatabaseUrl(undefined)).toThrow('Define DATABASE_URL_TEST');
  });

  it('rechaza bases que no tengan el nombre reservado para pruebas', () => {
    expect(() => getTestDatabaseUrl('postgresql://localhost/resi_control')).toThrow('resi_control_test');
    expect(() => getTestDatabaseUrl('file:./dev.db')).toThrow('URL válida de PostgreSQL');
  });

  it('rechaza ejecuciones en producción', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => getTestDatabaseUrl('postgresql://localhost/resi_control_test')).toThrow('no se pueden ejecutar en producción');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
