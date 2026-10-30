import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { AccessType, BuildingSectionType, DeliveryStatus, DeliveryType, PersonType, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { WhatsAppDeliveryError } from '../../src/whatsapp.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'integration-tests-only-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const app = createApp(prisma, jwtSecret);
const sentInvitationMessages: { phone: string; code: string }[] = [];
const invitationApp = createApp(prisma, jwtSecret, {
  residentPortalUrl: 'https://portal.example.test',
  sendResidentInvitation: async (message) => { sentInvitationMessages.push(message); },
});
const authHeader = 'Author' + 'ization';
const bearerToken = () => 'Bear' + 'er ' + guardToken;

const suffix = randomUUID();
const guardEmail = `guard-${suffix}@example.test`;
const supervisorEmail = `supervisor-${suffix}@example.test`;
const supervisorPassword = 'Test-supervisor-123!';
const residentEmail = `resident-${suffix}@example.test`;
const residentPassword = 'Test-resident-123!';
let residenceId: number;
let otherResidenceId: number;
let personId: number;
let anotherPersonId: number;
let otherPersonId: number;
let guardId: number;
let supervisorId: number;
let otherGuardId: number;
let residentId: number;
let guardToken: string;
let supervisorToken: string;
let residentToken: string;

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

    const [guard, supervisor, otherGuard] = await Promise.all([
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
      prisma.user.create({
        data: {
          name: 'Vigilante de otra residencia',
          email: `other-guard-${suffix}@example.test`,
          passwordHash: 'unused',
          role: UserRole.VIGILANTE,
          residenceId: otherResidenceId,
        },
      }),
    ]);
    guardId = guard.id;
    supervisorId = supervisor.id;
    otherGuardId = otherGuard.id;
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
    anotherPersonId = (await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Otro residente de pruebas',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '1',
        apartmentNumber: '102',
        residenceId,
      },
    })).id;
    const resident = await prisma.user.create({
      data: {
        name: 'Residente de pruebas',
        email: residentEmail,
        passwordHash: await bcrypt.hash(residentPassword, 4),
        role: UserRole.RESIDENTE,
        residenceId,
        personId,
      },
    });
    residentId = resident.id;
    guardToken = jwt.sign({ id: guardId }, jwtSecret);
    supervisorToken = jwt.sign({ id: supervisorId }, jwtSecret);
    residentToken = jwt.sign({ id: residentId }, jwtSecret);
  });

  afterAll(async () => {
    if (residenceId) {
      await prisma.accessLog.deleteMany({ where: { residenceId } });
      await prisma.delivery.deleteMany({ where: { residenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId } });
      await prisma.residentInvitation.deleteMany({ where: { residenceId } });
      await prisma.user.deleteMany({ where: { residenceId } });
      await prisma.person.deleteMany({ where: { residenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId } });
      await prisma.residence.delete({ where: { id: residenceId } });
    }
    if (otherResidenceId) {
      await prisma.accessLog.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.delivery.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.vehicle.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.residentInvitation.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.user.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.person.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.systemSetting.deleteMany({ where: { residenceId: otherResidenceId } });
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
      .set(authHeader, bearerToken())
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
      .set(authHeader, bearerToken())
      .send(payload);
    expect(missingSupervisor.status).toBe(409);
    expect(missingSupervisor.body.code).toBe('SUPERVISOR_REQUIRED');

    const approved = await request(app)
      .post(url)
      .set(authHeader, bearerToken())
      .send({ ...payload, supervisor: { email: supervisorEmail, password: supervisorPassword } });

    expect(approved.status).toBe(201);
    expect(approved.body.overrideAuthorizedById).toBe(supervisorId);
    expect(await prisma.accessLog.count({ where: { personId, residenceId } })).toBe(2);
  });

  it('rechaza credenciales inválidas de supervisor y no registra el acceso irregular', async () => {
    await prisma.accessLog.deleteMany({ where: { residenceId } });
    await prisma.accessLog.create({
      data: { accessType: AccessType.ENTRADA, personId, registeredById: guardId, residenceId },
    });
    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId, key: 'irregular_access_mode' } },
      update: { value: 'SUPERVISOR' },
      create: { key: 'irregular_access_mode', value: 'SUPERVISOR', residenceId },
    });

    const response = await request(app)
      .post('/api/access')
      .set(authHeader, bearerToken())
      .send({
        personId,
        accessType: AccessType.ENTRADA,
        supervisor: { email: supervisorEmail, password: 'incorrect-password' },
      });

    expect(response.status).toBe(403);
    expect(await prisma.accessLog.count({ where: { personId, residenceId } })).toBe(1);
  });

  it('no permite registrar movimientos para una persona de otra residencia', async () => {
    const response = await request(app)
      .post('/api/access')
      .set(authHeader, bearerToken())
      .send({ personId: otherPersonId, accessType: AccessType.ENTRADA });

    expect(response.status).toBe(404);
    expect(await prisma.accessLog.count({ where: { personId: otherPersonId } })).toBe(0);
  });

  it('exige destinatario al entregar encomiendas y no permite cerrar dos veces', async () => {
    const created = await request(app)
      .post('/api/deliveries')
      .set(authHeader, bearerToken())
      .send({ personId, type: DeliveryType.PAQUETE });
    expect(created.status).toBe(201);

    const statusUrl = `/api/deliveries/${created.body.id}/status`;
    const missingName = await request(app)
      .put(statusUrl)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.ENTREGADA });
    expect(missingName.status).toBe(400);

    const delivered = await request(app)
      .put(statusUrl)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.ENTREGADA, deliveredToName: 'Ana' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.deliveredToName).toBe('Ana');
    expect(delivered.body.deliveredById).toBe(guardId);

    const repeatedClose = await request(app)
      .put(statusUrl)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.ENTREGADA, deliveredToName: 'Ana' });
    expect(repeatedClose.status).toBe(409);
  });

  it('rechaza IDs inválidos y no permite cambiar una encomienda cerrada a pendiente', async () => {
    const created = await request(app)
      .post('/api/deliveries')
      .set(authHeader, bearerToken())
      .send({ personId, type: DeliveryType.PAQUETE });
    expect(created.status).toBe(201);

    const invalidId = await request(app)
      .put('/api/deliveries/0/status')
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.ENTREGADA, deliveredToName: 'Ana' });
    expect(invalidId.status).toBe(400);

    const closed = await request(app)
      .put(`/api/deliveries/${created.body.id}/status`)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.DEVUELTA });
    expect(closed.status).toBe(200);

    const reopened = await request(app)
      .put(`/api/deliveries/${created.body.id}/status`)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.PENDIENTE });
    expect(reopened.status).toBe(400);
    expect((await prisma.delivery.findUnique({ where: { id: created.body.id } }))?.status).toBe(DeliveryStatus.DEVUELTA);
  });

  it('oculta encomiendas de otra residencia al consultar o intentar cerrarlas', async () => {
    const foreignDelivery = await prisma.delivery.create({
      data: {
        personId: otherPersonId,
        type: DeliveryType.PAQUETE,
        residenceId: otherResidenceId,
        receivedById: otherGuardId,
      },
    });

    const listResponse = await request(app)
      .get('/api/deliveries')
      .set(authHeader, bearerToken())
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((delivery: { id: number }) => delivery.id === foreignDelivery.id)).toBe(false);

    const statusResponse = await request(app)
      .put(`/api/deliveries/${foreignDelivery.id}/status`)
      .set(authHeader, bearerToken())
      .send({ status: DeliveryStatus.DEVUELTA });
    expect(statusResponse.status).toBe(404);
    expect((await prisma.delivery.findUnique({ where: { id: foreignDelivery.id } }))?.status).toBe(DeliveryStatus.PENDIENTE);
  });

  it('permite solo un cierre cuando dos solicitudes compiten simultáneamente', async () => {
    const created = await request(app)
      .post('/api/deliveries')
      .set(authHeader, bearerToken())
      .send({ personId, type: DeliveryType.PAQUETE });
    expect(created.status).toBe(201);

    const statusUrl = `/api/deliveries/${created.body.id}/status`;
    const responses = await Promise.all([
      request(app)
        .put(statusUrl)
        .set(authHeader, bearerToken())
        .send({ status: DeliveryStatus.ENTREGADA, deliveredToName: 'Ana' }),
      request(app)
        .put(statusUrl)
        .set(authHeader, bearerToken())
        .send({ status: DeliveryStatus.DEVUELTA }),
    ]);

    const successfulResponse = responses.find(({ status }) => status === 200);
    const rejectedResponse = responses.find(({ status }) => status === 409);
    expect(successfulResponse).toBeDefined();
    expect(rejectedResponse).toBeDefined();
    const finalDelivery = await prisma.delivery.findUnique({ where: { id: created.body.id } });
    expect(finalDelivery?.status).toBe(successfulResponse?.body.status);
  });

  it('rechaza filtros de encomiendas inválidos', async () => {
    const response = await request(app)
      .get('/api/deliveries?status=NO_VALIDO')
      .set(authHeader, bearerToken())

    expect(response.status).toBe(400);
  });

  it('limita el perfil al residente asociado a la cuenta', async () => {
    const response = await request(app)
      .get('/api/resident/profile')
      .set(authHeader, 'Bearer ' + residentToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fullName: 'Persona de pruebas',
      buildingSectionType: BuildingSectionType.TORRE,
      buildingSectionNumber: '1',
      apartmentNumber: '101',
      residenceName: 'Residencia de pruebas',
    });
    expect(response.body.documentNumber).toBeUndefined();
    expect(response.body.phone).toBeUndefined();
  });

  it('envía una invitación de un solo uso, activa credenciales y registra cambios de consentimiento', async () => {
    const person = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Invitado de pruebas',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '3',
        apartmentNumber: '301',
        phone: '(+57) 300 555 6677',
        residenceId,
      },
    });
    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId, key: 'whatsapp_phone' } },
      update: { value: '+573001234567' },
      create: { residenceId, key: 'whatsapp_phone', value: '+573001234567' },
    });

    const sentMessagesBefore = sentInvitationMessages.length;
    const missingConsent = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: false });
    expect(missingConsent.status).toBe(400);
    expect(sentInvitationMessages).toHaveLength(sentMessagesBefore);
    expect(await prisma.residentInvitation.count({ where: { personId: person.id } })).toBe(0);

    const invitation = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(invitation.status).toBe(201);
    expect(sentInvitationMessages.at(-1)).toMatchObject({
      phone: '+573005556677',
    });

    const code = sentInvitationMessages.at(-1)!.code;
    expect(code).toMatch(/^\d{6}$/);
    const tokenHash = createHmac('sha256', jwtSecret).update(`+573005556677:${code}`).digest('hex');
    const savedInvitation = await prisma.residentInvitation.findUnique({ where: { tokenHash } });
    expect(savedInvitation?.tokenHash).not.toBe(code);
    expect(savedInvitation?.whatsappOptInAt).toBeInstanceOf(Date);
    expect(savedInvitation?.whatsappOptInById).toBe(supervisorId);
    expect(savedInvitation?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(savedInvitation!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);

    const wrongPhone = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573009998877', email: `wrong-phone-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: false });
    expect(wrongPhone.status).toBe(400);
    expect((await prisma.residentInvitation.findUnique({ where: { id: savedInvitation!.id } }))?.otpAttempts).toBe(0);

    const duplicateEmail = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573005556677', email: residentEmail.toUpperCase(), password: 'Resident-password-123!', consentToWhatsapp: true });
    expect(duplicateEmail.status).toBe(409);
    expect((await prisma.residentInvitation.findUnique({ where: { id: savedInvitation!.id } }))?.consumedAt).toBeNull();

    const activationAttempts = await Promise.all([
      request(invitationApp)
        .post('/api/resident/activate')
        .send({ code, phone: '+573005556677', email: `INViTED-A-${suffix}@EXAMPLE.TEST`, password: 'Resident-password-123!', consentToWhatsapp: false }),
      request(invitationApp)
        .post('/api/resident/activate')
        .send({ code, phone: '+573005556677', email: `invited-b-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: false }),
    ]);
    expect(activationAttempts.map(({ status }) => status).sort()).toEqual([201, 400]);
    const activated = activationAttempts.find(({ status }) => status === 201)!;
    expect(activated.status).toBe(201);
    expect(activated.body.user.role).toBe(UserRole.RESIDENTE);
    expect(activated.body.user.email).toMatch(new RegExp(`^invited-[ab]-${suffix}@example\\.test$`));

    const login = await request(invitationApp)
      .post('/api/auth/login')
      .send({ email: activated.body.user.email.toUpperCase(), password: 'Resident-password-123!' });
    expect(login.status).toBe(200);

    const profile = await request(invitationApp)
      .get('/api/resident/profile')
      .set(authHeader, 'Bearer ' + activated.body.token);
    expect(profile.status).toBe(200);
    expect(profile.body.whatsappNotificationsEnabled).toBe(false);

    const reusedToken = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573005556677', email: `another-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: true });
    expect(reusedToken.status).toBe(400);

    const accepted = await request(invitationApp)
      .put('/api/resident/notifications/consent')
      .set(authHeader, 'Bearer ' + activated.body.token)
      .send({ consented: true });
    expect(accepted.status).toBe(200);
    expect(accepted.body.whatsappNotificationsEnabled).toBe(true);

    const revoked = await request(invitationApp)
      .put('/api/resident/notifications/consent')
      .set(authHeader, 'Bearer ' + activated.body.token)
      .send({ consented: false });
    expect(revoked.status).toBe(200);
    expect(revoked.body.whatsappNotificationsEnabled).toBe(false);
    expect((await prisma.residentNotificationConsent.findMany({ where: { userId: activated.body.user.id }, orderBy: { id: 'asc' } })).map(({ status }) => status))
      .toEqual(['DECLINED', 'GRANTED', 'REVOKED']);

    const accountAlreadyExists = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(accountAlreadyExists.status).toBe(409);
  });

  it('permite revocar invitaciones y bloquea el acceso de usuarios no autorizados', async () => {
    const person = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Invitación revocable',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '4',
        apartmentNumber: '401',
        phone: '3005556678',
        residenceId,
      },
    });
    const guardInvite = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, bearerToken())
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(guardInvite.status).toBe(403);

    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId, key: 'whatsapp_phone' } },
      update: { value: '+573001234567' },
      create: { residenceId, key: 'whatsapp_phone', value: '+573001234567' },
    });
    const invite = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(invite.status).toBe(201);
    const code = sentInvitationMessages.at(-1)!.code;

    const foreignResident = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: otherPersonId, whatsappOptInConfirmed: true });
    expect(foreignResident.status).toBe(404);

    const revoked = await request(invitationApp)
      .delete(`/api/resident-invitations/${person.id}`)
      .set(authHeader, 'Bearer ' + supervisorToken);
    expect(revoked.status).toBe(200);
    const tokenHash = createHmac('sha256', jwtSecret).update(`+573005556678:${code}`).digest('hex');
    expect((await prisma.residentInvitation.findUnique({ where: { tokenHash } }))?.revokedAt).not.toBeNull();

    const activation = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573005556678', email: `revoked-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: true });
    expect(activation.status).toBe(400);
  });

  it('rechaza una invitación vencida y no crea una cuenta', async () => {
    const person = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Invitación vencida',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '6',
        apartmentNumber: '601',
        phone: '3005556680',
        residenceId,
      },
    });
    const invitation = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(invitation.status).toBe(201);

    const code = sentInvitationMessages.at(-1)!.code;
    const tokenHash = createHmac('sha256', jwtSecret).update(`+573005556680:${code}`).digest('hex');
    await prisma.residentInvitation.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    const activation = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573005556680', email: `expired-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: true });

    expect(activation.status).toBe(400);
    expect((await prisma.residentInvitation.findUnique({ where: { tokenHash } }))?.consumedAt).toBeNull();
    expect(await prisma.user.count({ where: { personId: person.id } })).toBe(0);
  });

  it('bloquea un código después de cinco intentos fallidos', async () => {
    const person = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Invitación con intentos limitados',
        buildingSectionType: BuildingSectionType.TORRE,
        buildingSectionNumber: '7',
        apartmentNumber: '701',
        phone: '3005556681',
        residenceId,
      },
    });
    const invitation = await request(invitationApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });
    expect(invitation.status).toBe(201);
    const code = sentInvitationMessages.at(-1)!.code;
    const wrongCode = code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(invitationApp)
        .post('/api/resident/activate')
        .send({ code: wrongCode, phone: '+573005556681', email: `failed-${attempt}-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: false });
      expect(response.status).toBe(400);
    }

    const tokenHash = createHmac('sha256', jwtSecret).update(`+573005556681:${code}`).digest('hex');
    expect((await prisma.residentInvitation.findUnique({ where: { tokenHash } }))?.otpAttempts).toBe(5);
    const blockedCorrectCode = await request(invitationApp)
      .post('/api/resident/activate')
      .send({ code, phone: '+573005556681', email: `blocked-${suffix}@example.test`, password: 'Resident-password-123!', consentToWhatsapp: false });
    expect(blockedCorrectCode.status).toBe(400);
    expect(await prisma.user.count({ where: { personId: person.id } })).toBe(0);
  });

  it('no persiste una invitación cuando el proveedor rechaza el envío', async () => {
    const person = await prisma.person.create({
      data: {
        type: PersonType.RESIDENTE,
        fullName: 'Falla de envío',
        buildingSectionType: BuildingSectionType.INTERIOR,
        buildingSectionNumber: '5',
        apartmentNumber: '502',
        phone: '3005556679',
        residenceId,
      },
    });
    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId, key: 'whatsapp_phone' } },
      update: { value: '+573001234567' },
      create: { residenceId, key: 'whatsapp_phone', value: '+573001234567' },
    });
    const failingApp = createApp(prisma, jwtSecret, {
      residentPortalUrl: 'https://portal.example.test',
      sendResidentInvitation: async () => { throw new WhatsAppDeliveryError(); },
    });

    const response = await request(failingApp)
      .post('/api/resident-invitations')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ personId: person.id, whatsappOptInConfirmed: true });

    expect(response.status).toBe(502);
    expect(await prisma.residentInvitation.count({ where: { personId: person.id } })).toBe(0);
  });

  it('permite iniciar sesión a un residente activo asociado a una persona activa', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: residentEmail, password: residentPassword });

    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe(UserRole.RESIDENTE);

    const profile = await request(app)
      .get('/api/resident/profile')
      .set(authHeader, 'Bearer ' + login.body.token);
    expect(profile.status).toBe(200);
    expect(profile.body.fullName).toBe('Persona de pruebas');
  });

  it('solo muestra las encomiendas de la persona asociada y omite notas internas', async () => {
    const otherResidentDelivery = await prisma.delivery.create({
      data: {
        personId: anotherPersonId,
        type: DeliveryType.COMIDA,
        residenceId,
        receivedById: guardId,
      },
    });
    const ownDelivery = await prisma.delivery.create({
      data: {
        personId,
        type: DeliveryType.PAQUETE,
        notes: 'Nota interna de portería',
        residenceId,
        receivedById: guardId,
      },
    });
    const expectedDeliveryIds = (await prisma.delivery.findMany({
      where: { personId, residenceId },
      select: { id: true },
      orderBy: { receivedAt: 'desc' },
    })).map(({ id }) => id);

    const response = await request(app)
      .get('/api/resident/deliveries')
      .set(authHeader, 'Bearer ' + residentToken);

    expect(response.status).toBe(200);
    expect(response.body.map((delivery: { id: number }) => delivery.id)).toEqual(expectedDeliveryIds);
    expect(response.body.some((delivery: { id: number }) => delivery.id === otherResidentDelivery.id)).toBe(false);
    const returnedOwnDelivery = response.body.find((delivery: { id: number }) => delivery.id === ownDelivery.id);
    expect(returnedOwnDelivery.notes).toBeUndefined();
    expect(returnedOwnDelivery.receivedBy).toBeUndefined();
  });

  it('rechaza el inicio de sesión cuando el residente asociado está inactivo', async () => {
    await prisma.person.update({ where: { id: personId }, data: { active: false } });
    try {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: residentEmail, password: residentPassword });

      expect(response.status).toBe(401);
      expect(response.body.token).toBeUndefined();
    } finally {
      await prisma.person.update({ where: { id: personId }, data: { active: true } });
    }
  });

  it('bloquea a residentes de las rutas operativas y de administración', async () => {
    const accessCount = await prisma.accessLog.count({ where: { residenceId } });
    const responses = await Promise.all([
      request(app).get('/api/dashboard').set(authHeader, 'Bearer ' + residentToken),
      request(app).get('/api/people').set(authHeader, 'Bearer ' + residentToken),
      request(app).get('/api/deliveries').set(authHeader, 'Bearer ' + residentToken),
      request(app).post('/api/access').set(authHeader, 'Bearer ' + residentToken).send({ personId, accessType: AccessType.ENTRADA }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    expect(await prisma.accessLog.count({ where: { residenceId } })).toBe(accessCount);
  });

  it('permite a administración configurar el número de WhatsApp de la residencia', async () => {
    const saved = await request(app)
      .put('/api/settings/whatsapp')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ phone: '+57 300-123-4567' });

    expect(saved.status).toBe(200);
    expect(saved.body.phone).toBe('+573001234567');

    const loaded = await request(app)
      .get('/api/settings/whatsapp')
      .set(authHeader, bearerToken());
    expect(loaded.status).toBe(200);
    expect(loaded.body.phone).toBe('+573001234567');
  });

  it('rechaza números inválidos y evita que vigilancia o residentes cambien el teléfono de WhatsApp', async () => {
    const invalid = await request(app)
      .put('/api/settings/whatsapp')
      .set(authHeader, 'Bearer ' + supervisorToken)
      .send({ phone: '1234567890' });
    expect(invalid.status).toBe(400);

    const guardUpdate = await request(app)
      .put('/api/settings/whatsapp')
      .set(authHeader, bearerToken())
      .send({ phone: '3001234567' });
    expect(guardUpdate.status).toBe(403);

    const residentUpdate = await request(app)
      .put('/api/settings/whatsapp')
      .set(authHeader, 'Bearer ' + residentToken)
      .send({ phone: '3001234567' });
    expect(residentUpdate.status).toBe(403);

    const saved = await prisma.systemSetting.findUnique({
      where: { residenceId_key: { residenceId, key: 'whatsapp_phone' } },
    });
    expect(saved?.value).toBe('+573001234567');
  });
});
