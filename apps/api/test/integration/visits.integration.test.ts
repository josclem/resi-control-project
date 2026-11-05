import { randomUUID } from 'node:crypto';
import { BuildingSectionType, PersonType, PrismaClient, UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'visit-preregistration-integration-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = randomUUID();
const app = createApp(prisma, jwtSecret);
let residenceId: number;
let residentPersonId: number;
let otherResidentPersonId: number;
let residentId: number;
let guardId: number;
let residentToken: string;
let guardToken: string;

describe('prerregistros y control de visitas', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const residence = await prisma.residence.create({ data: { code: `VISIT-${suffix}`, name: 'Residencia de visitas' } });
    residenceId = residence.id;
    const residentPerson = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Residente de visitas',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '3',
        apartmentNumber: '301',
        residenceId,
      },
    });
    residentPersonId = residentPerson.id;
    const otherResidentPerson = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Otro residente',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '4',
        apartmentNumber: '401',
        residenceId,
      },
    });
    otherResidentPersonId = otherResidentPerson.id;
    const [resident, guard] = await Promise.all([
      prisma.user.create({
        data: {
          name: residentPerson.fullName,
          email: `resident-${suffix}@example.test`,
          passwordHash: 'unused',
          role: UserRole.RESIDENTE,
          residenceId,
          residentPersonId,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Vigilante de visitas',
          email: `guard-${suffix}@example.test`,
          passwordHash: 'unused',
          role: UserRole.VIGILANTE,
          residenceId,
        },
      }),
    ]);
    residentId = resident.id;
    guardId = guard.id;
    residentToken = jwt.sign({ id: residentId }, jwtSecret);
    guardToken = jwt.sign({ id: guardId }, jwtSecret);
  });

  afterAll(async () => {
    if (residenceId) {
      await prisma.accessLog.deleteMany({ where: { residenceId } });
      await prisma.visitPreRegistration.deleteMany({ where: { residenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId } });
      await prisma.person.deleteMany({ where: { residenceId } });
      await prisma.user.deleteMany({ where: { residenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId } });
      await prisma.residence.delete({ where: { id: residenceId } });
    }
    await prisma.$disconnect();
  });

  it('lets a resident authorize and cancel only their own not-yet-entered visits', async () => {
    const now = Date.now();
    const created = await request(app)
      .post('/api/resident/visits')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({
        visitorName: 'Visitante autorizado',
        visitorDocumentNumber: 'DOC-100',
        observations: '  Trae una caja  ',
        validFrom: new Date(now - 30_000).toISOString(),
        validUntil: new Date(now + 60 * 60 * 1000).toISOString(),
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'AUTORIZADA',
      origin: 'RESIDENTE',
      observations: 'Trae una caja',
      resident: { id: residentPersonId },
    });

    const unrelated = await prisma.visitPreRegistration.create({
      data: {
        visitorName: 'Visita de otro apartamento',
        validFrom: new Date(now - 30_000),
        validUntil: new Date(now + 60 * 60 * 1000),
        origin: 'RESIDENTE',
        residentPersonId: otherResidentPersonId,
        createdById: residentId,
        residenceId,
      },
    });
    const denied = await request(app)
      .patch(`/api/resident/visits/${unrelated.id}/cancel`)
      .set('Authorization', `Bearer ${residentToken}`);
    expect(denied.status).toBe(409);

    const canceled = await request(app)
      .patch(`/api/resident/visits/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${residentToken}`);
    expect(canceled.status).toBe(200);
    expect(canceled.body.status).toBe('CANCELADA');
  });

  it('records porter origin and external resident approval, then logs one entry and one exit', async () => {
    const now = Date.now();
    const payload = {
      residentPersonId,
      visitorName: 'Visitante llegado sin prerregistro',
      observations: 'Confirmado por llamada',
      vehiclePlate: `V${suffix.slice(0, 5).toUpperCase()}`,
      vehicleType: 'AUTOMOVIL',
      validFrom: new Date(now - 30_000).toISOString(),
      validUntil: new Date(now + 60 * 60 * 1000).toISOString(),
    };
    const unconfirmed = await request(app)
      .post('/api/visits/porter')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ ...payload, residentApprovalConfirmed: false });
    expect(unconfirmed.status).toBe(400);

    const created = await request(app)
      .post('/api/visits/porter')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({ ...payload, residentApprovalConfirmed: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'AUTORIZADA',
      origin: 'PORTERIA',
      residentApprovalConfirmed: true,
      observations: 'Confirmado por llamada',
    });

    const checkedIn = await request(app)
      .post(`/api/visits/${created.body.id}/check-in`)
      .set('Authorization', `Bearer ${guardToken}`);
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.status).toBe('EN_CURSO');
    expect(checkedIn.body.accessLogs).toHaveLength(1);
    expect(checkedIn.body.accessLogs[0].accessType).toBe('ENTRADA');

    const checkedOut = await request(app)
      .post(`/api/visits/${created.body.id}/check-out`)
      .set('Authorization', `Bearer ${guardToken}`);
    expect(checkedOut.status).toBe(200);
    expect(checkedOut.body.status).toBe('COMPLETADA');
    expect(checkedOut.body.accessLogs.map((log: { accessType: string }) => log.accessType)).toEqual(['ENTRADA', 'SALIDA']);

    const duplicateEntry = await request(app)
      .post(`/api/visits/${created.body.id}/check-in`)
      .set('Authorization', `Bearer ${guardToken}`);
    expect(duplicateEntry.status).toBe(409);
    expect(await prisma.accessLog.count({ where: { visitPreRegistrationId: created.body.id } })).toBe(2);
  });

  it('marks authorized visits NOSHOW after their valid-until time passes', async () => {
    const expired = await prisma.visitPreRegistration.create({
      data: {
        visitorName: 'Visitante que no llegó',
        validFrom: new Date(Date.now() - 2 * 60 * 60 * 1000),
        validUntil: new Date(Date.now() - 60_000),
        origin: 'RESIDENTE',
        residentPersonId,
        createdById: residentId,
        residenceId,
      },
    });
    const response = await request(app)
      .get('/api/visits')
      .set('Authorization', `Bearer ${guardToken}`);
    expect(response.status).toBe(200);
    expect((await prisma.visitPreRegistration.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe('NOSHOW');
  });
});
