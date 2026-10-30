import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { AccessType, BuildingSectionType, PersonType, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'integration-tests-only-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const app = createApp(prisma, jwtSecret);

const suffix = randomUUID();
const guardEmail = `guard-${suffix}@example.test`;
const supervisorEmail = `supervisor-${suffix}@example.test`;
const supervisorPassword = 'Test-supervisor-123!';
let residenceId: number;
let otherResidenceId: number;
let personId: number;
let otherPersonId: number;
let guardId: number;
let supervisorId: number;
let guardToken: string;

describe('POST /api/access', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const residence = await prisma.residence.create({
      data: { code: `TEST-${suffix}`, name: 'Residencia de pruebas' },
    });
    residenceId = residence.id;
    const otherResidence = await prisma.residence.create({
      data: { code: `TEST-OTHER-${suffix}`, name: 'Otra residencia de pruebas' },
    });
    otherResidenceId = otherResidence.id;

    const [guard, supervisor] = await Promise.all([
      prisma.user.create({
        data: {
          name: 'Vigilante de pruebas',
          email: guardEmail,
          passwordHash: 'unused',
          role: UserRole.VIGILANTE,
          residenceId,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Supervisor de pruebas',
          email: supervisorEmail,
          passwordHash: await bcrypt.hash(supervisorPassword, 4),
          role: UserRole.ADMINISTRADOR,
          residenceId,
        },
      }),
    ]);
    guardId = guard.id;
    supervisorId = supervisor.id;
    personId = (await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Persona de pruebas',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '1',
        apartmentNumber: '101',
        residenceId,
      },
    })).id;
    otherPersonId = (await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Persona de otra residencia',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '2',
        apartmentNumber: '202',
        residenceId: otherResidenceId,
      },
    })).id;
    guardToken = jwt.sign({ id: guardId }, jwtSecret);
  });

  afterAll(async () => {
    if (residenceId) {
      await prisma.accessLog.deleteMany({ where: { residenceId } });
      await prisma.delivery.deleteMany({ where: { residenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId } });
      await prisma.person.deleteMany({ where: { residenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId } });
      await prisma.user.deleteMany({ where: { residenceId } });
      await prisma.residence.delete({ where: { id: residenceId } });
    }
    if (otherResidenceId) {
      await prisma.accessLog.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.delivery.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.person.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.user.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.residence.delete({ where: { id: otherResidenceId } });
    }
    await prisma.$disconnect();
  });

  it('bloquea un movimiento consecutivo del mismo tipo', async () => {
    await prisma.accessLog.create({
      data: { accessType: AccessType.ENTRADA, personId, registeredById: guardId, residenceId },
    });

    const response = await request(app)
      .post('/api/access')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ personId, accessType: AccessType.ENTRADA });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IRREGULAR_ACCESS');
    expect(await prisma.accessLog.count({ where: { personId, residenceId } })).toBe(1);
  });

  it('registra una excepción solo con credenciales válidas de supervisor', async () => {
    await prisma.accessLog.deleteMany({ where: { residenceId } });
    await prisma.accessLog.create({
      data: { accessType: AccessType.SALIDA, personId, registeredById: guardId, residenceId },
    });
    await prisma.systemSetting.create({
      data: { key: 'irregular_access_mode', value: 'SUPERVISOR', residenceId },
    });

    const url = '/api/access';
    const payload = { personId, accessType: AccessType.SALIDA };
    const missingSupervisor = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${guardToken}`)
      .send(payload);
    expect(missingSupervisor.status).toBe(409);
    expect(missingSupervisor.body.code).toBe('SUPERVISOR_REQUIRED');

    const approved = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ ...payload, supervisor: { email: supervisorEmail, password: supervisorPassword } });

    expect(approved.status).toBe(201);
    expect(approved.body.overrideAuthorizedById).toBe(supervisorId);
    expect(await prisma.accessLog.count({ where: { personId, residenceId } })).toBe(2);
  });

  it('no permite registrar movimientos para una persona de otra residencia', async () => {
    const response = await request(app)
      .post('/api/access')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ personId: otherPersonId, accessType: AccessType.ENTRADA });

    expect(response.status).toBe(404);
    expect(await prisma.accessLog.count({ where: { personId: otherPersonId } })).toBe(0);
  });

  it('exige destinatario al entregar encomiendas y no permite cerrar dos veces', async () => {
    const created = await request(app)
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ personId, type: 'PAQUETE' });
    expect(created.status).toBe(201);

    const statusUrl = `/api/deliveries/${created.body.id}/status`;
    const missingName = await request(app)
      .put(statusUrl)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'ENTREGADA' });
    expect(missingName.status).toBe(400);

    const delivered = await request(app)
      .put(statusUrl)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'ENTREGADA', deliveredToName: 'Ana' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.deliveredToName).toBe('Ana');
    expect(delivered.body.deliveredById).toBe(guardId);

    const repeatedClose = await request(app)
      .put(statusUrl)
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ status: 'ENTREGADA', deliveredToName: 'Ana' });
    expect(repeatedClose.status).toBe(409);
  });

  it('rechaza filtros de encomiendas inválidos', async () => {
    const response = await request(app)
      .get('/api/deliveries?status=NO_VALIDO')
      .set('Authorization', `Bearer ${guardToken}`);

    expect(response.status).toBe(400);
  });
});
