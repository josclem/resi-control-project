import { createHash, randomUUID } from 'node:crypto';
import { BuildingSectionType, PersonType, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'resident-invitation-integration-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let sentInvitation: { email: string; residentName: string; residenceName: string; url: string } | null = null;
const app = createApp(prisma, jwtSecret, {
  isConfigured: () => true,
  async sendInvitation(invitation) { sentInvitation = invitation; },
});
const suffix = randomUUID();
const password = 'Test-admin-password-123!';
const residentPassword = 'Resident-password-123!';
const adminEmail = `inviter-${suffix}@example.test`;
let residenceId: number;
let adminId: number;
let personId: number;
let adminToken: string;

describe('invitaciones de cuentas de residentes', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const residence = await prisma.residence.create({
      data: { code: `INVITE-${suffix}`, name: 'Residencia para invitaciones' },
    });
    residenceId = residence.id;
    const admin = await prisma.user.create({
      data: {
        name: 'Administradora de invitaciones',
        email: adminEmail,
        passwordHash: await bcrypt.hash(password, 4),
        role: UserRole.ADMINISTRADOR,
        residenceId,
      },
    });
    adminId = admin.id;
    personId = (await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Residente invitado',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '1',
        apartmentNumber: '101',
        residenceId,
      },
    })).id;
    adminToken = jwt.sign({ id: adminId }, jwtSecret);
  });

  afterAll(async () => {
    if (residenceId) {
      await prisma.residentInvitation.deleteMany({ where: { person: { residenceId } } });
      await prisma.user.deleteMany({ where: { residenceId } });
      await prisma.accessLog.deleteMany({ where: { residenceId } });
      await prisma.delivery.deleteMany({ where: { residenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId } });
      await prisma.person.deleteMany({ where: { residenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId } });
      await prisma.residence.delete({ where: { id: residenceId } });
    }
    await prisma.$disconnect();
  });

  it('envía una invitación, activa la cuenta vinculada y no permite reutilizar el enlace', async () => {
    const candidates = await request(app)
      .get('/api/admin/resident-invitations/candidates')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body).toHaveLength(1);
    expect(candidates.body[0].id).toBe(personId);

    const invited = await request(app)
      .post('/api/admin/resident-invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId, email: `resident-${suffix}@example.test` });
    expect(invited.status).toBe(201);
    expect(sentInvitation?.residentName).toBe('Residente invitado');
    expect(sentInvitation?.email).toBe(`resident-${suffix}@example.test`);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: personId } })).email).toBe(`resident-${suffix}@example.test`);

    const token = new URLSearchParams(new URL(sentInvitation!.url).hash.slice(1)).get('invite');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const invitation = await prisma.residentInvitation.findFirstOrThrow({ where: { personId } });
    expect(invitation.tokenHash).toBe(createHash('sha256').update(token!).digest('hex'));
    expect(invitation.tokenHash).not.toBe(token);

    const activated = await request(app)
      .post('/api/auth/resident-invitation/accept')
      .send({ token, password: residentPassword });
    expect(activated.status).toBe(201);
    expect(activated.body.user.email).toBe(`resident-${suffix}@example.test`);
    const resident = await prisma.user.findUniqueOrThrow({ where: { id: activated.body.user.id } });
    expect(resident.role).toBe(UserRole.RESIDENTE);
    expect(resident.residentPersonId).toBe(personId);
    expect(resident.residenceId).toBe(residenceId);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: resident.email, password: residentPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('RESIDENTE');

    const replay = await request(app)
      .post('/api/auth/resident-invitation/accept')
      .send({ token, password: residentPassword });
    expect(replay.status).toBe(410);

    const refreshedCandidates = await request(app)
      .get('/api/admin/resident-invitations/candidates')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(refreshedCandidates.body).toHaveLength(0);
  });

  it('no envía invitaciones a personas de otra residencia ni a correos ya utilizados', async () => {
    const additionalPerson = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Residente con correo existente',
        apartmentNumber: '102',
        residenceId,
      },
    });
    const duplicateEmail = await request(app)
      .post('/api/admin/resident-invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: additionalPerson.id, email: adminEmail });
    expect(duplicateEmail.status).toBe(409);

    const firstInvite = await request(app)
      .post('/api/admin/resident-invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: additionalPerson.id, email: `first-${suffix}@example.test` });
    expect(firstInvite.status).toBe(201);
    const firstToken = new URLSearchParams(new URL(sentInvitation!.url).hash.slice(1)).get('invite');
    const resent = await request(app)
      .post('/api/admin/resident-invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: additionalPerson.id, email: `second-${suffix}@example.test` });
    expect(resent.status).toBe(201);
    const secondToken = new URLSearchParams(new URL(sentInvitation!.url).hash.slice(1)).get('invite');
    expect(await prisma.residentInvitation.count({ where: { personId: additionalPerson.id, revokedAt: null, acceptedAt: null } })).toBe(1);
    const revokedTokenResponse = await request(app)
      .post('/api/auth/resident-invitation/accept')
      .send({ token: firstToken, password: residentPassword });
    expect(revokedTokenResponse.status).toBe(410);
    const acceptedResentInvite = await request(app)
      .post('/api/auth/resident-invitation/accept')
      .send({ token: secondToken, password: residentPassword });
    expect(acceptedResentInvite.status).toBe(201);

    const otherResidence = await prisma.residence.create({
      data: { code: `INVITE-OTHER-${suffix}`, name: 'Otra residencia' },
    });
    const otherPerson = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Residente ajeno',
        apartmentNumber: '202',
        residenceId: otherResidence.id,
      },
    });
    const denied = await request(app)
      .post('/api/admin/resident-invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personId: otherPerson.id, email: `other-${suffix}@example.test` });
    expect(denied.status).toBe(404);
    await prisma.person.delete({ where: { id: otherPerson.id } });
    await prisma.residence.delete({ where: { id: otherResidence.id } });
  });
});
