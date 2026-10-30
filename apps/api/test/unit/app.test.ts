import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://localhost:5432/resi_control_test' } },
});
const app = createApp(prisma, 'unit-tests-only-secret');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('aplicación HTTP', () => {
  it('responde healthcheck sin abrir un puerto ni conectarse a la base', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
