import { randomUUID } from 'node:crypto';
import { BuildingSectionType, PersonType, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { ResidentCommunicationMailer } from '../../src/resident-communication-email.js';
import { ResidentInvitationMailer } from '../../src/resident-invitation-email.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'resident-communications-integration-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = randomUUID();
const sentMessages: { email: string; residenceName: string; subject: string; body: string; unsubscribeUrl?: string }[] = [];
const failEmails = new Set<string>();
const invitationMailer: ResidentInvitationMailer = {
  isConfigured: () => false,
  async sendInvitation() {},
};
const communicationMailer: ResidentCommunicationMailer = {
  isConfigured: () => true,
  async sendMessage(message) {
    if (failEmails.has(message.email)) throw new Error('SMTP rechazó el destinatario.');
    sentMessages.push(message);
  },
};
const app = createApp(prisma, jwtSecret, invitationMailer, communicationMailer);
let residenceId: number;
let otherResidenceId: number;
let adminId: number;
let customUserId: number;
let guardId: number;
let activeResidentIds: number[];
let inactiveResidentId: number;
let otherResidentId: number;
let adminToken: string;
let customToken: string;
let guardToken: string;

async function createResident(input: { name: string; email?: string; active?: boolean; apartment: string; buildingSectionNumber?: string; residenceId?: number }) {
  return prisma.person.create({
    data: {
      type: PersonType.RESIDENTE,
      fullName: input.name,
      documentNumber: `DOC${suffix.slice(0, 7)}${input.apartment}`,
      buildingSectionType: BuildingSectionType.TORRE,
      buildingSectionNumber: input.buildingSectionNumber ?? '4',
      apartmentNumber: input.apartment,
      email: input.email,
      active: input.active ?? true,
      residenceId: input.residenceId ?? residenceId,
    },
  });
}

describe('comunicados por correo a residentes', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const residence = await prisma.residence.create({ data: { code: `COMM-${suffix}`, name: 'Residencia de comunicados' } });
    const otherResidence = await prisma.residence.create({ data: { code: `COMM-OTHER-${suffix}`, name: 'Otra residencia' } });
    residenceId = residence.id;
    otherResidenceId = otherResidence.id;
    const passwordHash = await bcrypt.hash('Communications-test-password-123!', 4);
    const admin = await prisma.user.create({
      data: { name: 'Administradora de comunicados', email: `admin-${suffix}@example.test`, passwordHash, role: UserRole.ADMINISTRADOR, residenceId },
    });
    adminId = admin.id;
    adminToken = jwt.sign({ id: adminId }, jwtSecret);
    const customRole = await prisma.customRole.create({
      data: { name: `Gestor usuarios ${suffix}`, permissions: ['USERS_MANAGE'], residenceId, createdById: adminId },
    });
    const customUser = await prisma.user.create({
      data: { name: 'Usuario con rol personalizado', email: `custom-${suffix}@example.test`, passwordHash, role: UserRole.PERSONALIZADO, customRoleId: customRole.id, residenceId },
    });
    customUserId = customUser.id;
    customToken = jwt.sign({ id: customUserId }, jwtSecret);
    const guard = await prisma.user.create({
      data: { name: 'Vigilante', email: `guard-${suffix}@example.test`, passwordHash, role: UserRole.VIGILANTE, residenceId },
    });
    guardId = guard.id;
    guardToken = jwt.sign({ id: guardId }, jwtSecret);

    const activeOne = await createResident({ name: 'Residente Activo Uno', email: `shared-${suffix}@example.test`, apartment: '401' });
    const activeTwo = await createResident({ name: 'Residente Activo Dos', email: `shared-${suffix}@example.test`, apartment: '402' });
    const inactive = await createResident({ name: 'Residente Inactivo', email: `inactive-${suffix}@example.test`, apartment: '403', active: false });
    await createResident({ name: 'Residente sin consentimiento', email: `unconsented-${suffix}@example.test`, apartment: '407' });
    const noEmail = await createResident({ name: 'Residente sin correo', apartment: '404' });
    const other = await createResident({ name: 'Residente de otra residencia', email: `other-${suffix}@example.test`, apartment: '405', residenceId: otherResidenceId });
    activeResidentIds = [activeOne.id, activeTwo.id];
    inactiveResidentId = inactive.id;
    otherResidentId = other.id;

    const consentAt = new Date();
    await prisma.person.updateMany({
      where: { id: { in: activeResidentIds } },
      data: {
        promotionalEmailConsentAt: consentAt,
        promotionalEmailConsentSource: 'Formulario firmado',
        promotionalEmailConsentEmail: `shared-${suffix}@example.test`,
      },
    });
    await prisma.person.create({
      data: {
        type: PersonType.VISITANTE,
        fullName: 'Visitante con correo',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '4',
        apartmentNumber: '406',
        email: `visitor-${suffix}@example.test`,
        residenceId,
      },
    });
    void noEmail;
  });

  afterAll(async () => {
    if (residenceId) {
      await prisma.residentCommunication.deleteMany({ where: { residenceId } });
      await prisma.residentEmailConsentEvent.deleteMany({ where: { person: { residenceId: { in: [residenceId, otherResidenceId] } } } });
      await prisma.residentInvitation.deleteMany({ where: { person: { residenceId: { in: [residenceId, otherResidenceId] } } } });
      await prisma.customRole.deleteMany({ where: { residenceId } });
      await prisma.user.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.accessLog.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.delivery.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.vehicle.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.person.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.systemSetting.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
      await prisma.residence.deleteMany({ where: { id: { in: [residenceId, otherResidenceId] } } });
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sentMessages.length = 0;
    failEmails.clear();
  });

  it('lista residentes activos e inactivos por ubicación y restringe el envío a administradores', async () => {
    const allResidents = await request(app)
      .get('/api/admin/communications/residents?status=ALL&buildingSectionNumber=4&apartmentNumber=40')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(allResidents.status).toBe(200);
    expect(allResidents.body.map((resident: { id: number }) => resident.id)).toEqual(expect.arrayContaining([...activeResidentIds, inactiveResidentId]));
    expect(allResidents.body.find((resident: { id: number }) => resident.id === inactiveResidentId).active).toBe(false);
    expect(allResidents.body.some((resident: { fullName: string }) => resident.fullName.includes('Visitante'))).toBe(false);
    expect((await request(app).get('/api/admin/communications/residents?status=INVALID').set('Authorization', `Bearer ${adminToken}`)).status).toBe(400);

    expect((await request(app).get('/api/admin/communications').set('Authorization', `Bearer ${customToken}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/communications').set('Authorization', `Bearer ${guardToken}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/communications').set('Authorization', `Bearer ${jwt.sign({ id: (await prisma.user.create({
      data: { name: 'SuperAdministrador', email: `super-${suffix}@example.test`, passwordHash: 'x', role: UserRole.SUPER_ADMINISTRADOR, residenceId },
    })).id }, jwtSecret)}`)).status).toBe(200);
  });

  it('registra autorización promocional, agrupa correos repetidos y permite la baja sin cuenta', async () => {
    const consent = await request(app)
      .put(`/api/admin/communications/residents/${inactiveResidentId}/promotional-consent`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ consented: true, source: 'Autorización firmada en portería' });
    expect(consent.status).toBe(200);

    const response = await request(app)
      .post('/api/admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'PROMOTIONAL', subject: 'Promoción', body: 'Mensaje', audienceStatus: 'ALL', selectAll: true });
    expect(response.status).toBe(201);
    expect(response.body.counts).toEqual({ total: 2, sent: 2, failed: 0, excludedWithoutConsent: 1 });
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages.map(({ email }) => email)).toEqual(expect.arrayContaining([`shared-${suffix}@example.test`, `inactive-${suffix}@example.test`]));
    const shared = response.body.recipients.find((recipient: { email: string }) => recipient.email === `shared-${suffix}@example.test`);
    expect(shared.residentNames).toEqual(expect.arrayContaining(['Residente Activo Uno', 'Residente Activo Dos']));

    const inactiveMail = sentMessages.find(({ email }) => email === `inactive-${suffix}@example.test`)!;
    const token = new URLSearchParams(new URL(inactiveMail.unsubscribeUrl!).hash.slice(1)).get('email-unsubscribe');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const unsubscribed = await request(app).post('/api/email-preferences/unsubscribe').send({ token });
    expect(unsubscribed.status).toBe(200);
    const resident = await prisma.person.findUniqueOrThrow({ where: { id: inactiveResidentId } });
    expect(resident.promotionalEmailUnsubscribedAt).toBeInstanceOf(Date);
    expect(await prisma.residentEmailConsentEvent.count({ where: { personId: inactiveResidentId, action: 'WITHDRAWN' } })).toBe(1);
    expect((await request(app).post('/api/admin/communications').set('Authorization', `Bearer ${adminToken}`).send({
      type: 'PROMOTIONAL', subject: 'No enviar', body: 'Mensaje', audienceStatus: 'INACTIVE', selectAll: true,
    })).status).toBe(400);
  });

  it('envía avisos administrativos a residentes inactivos sin cuenta y registra fallos parciales', async () => {
    failEmails.add(`inactive-${suffix}@example.test`);
    const response = await request(app)
      .post('/api/admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'ADMINISTRATIVE',
        subject: 'Aviso',
        body: 'Aviso individual',
        audienceStatus: 'INACTIVE',
        selectAll: false,
        personIds: [inactiveResidentId],
      });
    expect(response.status).toBe(207);
    expect(response.body.counts).toEqual({ total: 1, sent: 0, failed: 1, excludedWithoutConsent: 0 });
    expect(response.body.recipients[0].status).toBe('FAILED');
    expect(response.body.recipients[0].error).toContain('SMTP rechazó');
  });

  it('rechaza residentes de otra residencia y no requiere cuenta del portal para enviar', async () => {
    const denied = await request(app)
      .post('/api/admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'ADMINISTRATIVE', subject: 'Aviso', body: 'Mensaje', audienceStatus: 'ALL', selectAll: false, personIds: [otherResidentId] });
    expect(denied.status).toBe(400);

    const accepted = await request(app)
      .post('/api/admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'ADMINISTRATIVE',
        subject: 'Individual',
        body: 'Hola',
        audienceStatus: 'INACTIVE',
        selectAll: false,
        personIds: [inactiveResidentId],
        search: `inactive-${suffix}`,
      });
    expect(accepted.status).toBe(201);
    expect(sentMessages[0].email).toBe(`inactive-${suffix}@example.test`);
    expect(await prisma.user.count({ where: { residentPersonId: inactiveResidentId } })).toBe(0);
  });

  it('no presenta como enviados los mensajes cuando SMTP no está configurado', async () => {
    const unconfiguredApp = createApp(prisma, jwtSecret, invitationMailer, { isConfigured: () => false, async sendMessage() {} });
    const response = await request(unconfiguredApp)
      .post('/api/admin/communications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'ADMINISTRATIVE', subject: 'Aviso', body: 'Mensaje', audienceStatus: 'ALL', selectAll: true });
    expect(response.status).toBe(503);
  });
});
