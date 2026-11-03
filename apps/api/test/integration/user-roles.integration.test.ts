import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server.js';
import { getTestDatabaseUrl } from '../helpers/test-database.js';

const databaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const jwtSecret = 'user-roles-integration-test-secret';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const app = createApp(prisma, jwtSecret);
const suffix = randomUUID();
const password = 'Test-password-123!';
const adminEmail = `admin-${suffix}@example.test`;
const limitedEmail = `limited-${suffix}@example.test`;
const residenceCode = `ADMIN-TEST-${suffix}`;
const otherResidenceCode = `ADMIN-OTHER-${suffix}`;
let residenceId: number;
let otherResidenceId: number;
let adminId: number;
let limitedUserId: number;
let limitedRoleId: number;
let otherAdminId: number;
let otherRoleId: number;
let adminToken: string;
let limitedToken: string;
let superToken: string;
let otherRoleManagerToken: string;

describe('administración de usuarios y roles', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const staleResidences = await prisma.residence.findMany({
      where: { OR: [{ code: { startsWith: 'ADMIN-TEST-' } }, { code: { startsWith: 'ADMIN-OTHER-' } }] },
      select: { id: true },
    });
    const staleResidenceIds = staleResidences.map(({ id }) => id);
    if (staleResidenceIds.length) {
      await prisma.user.updateMany({ where: { residenceId: { in: staleResidenceIds } }, data: { customRoleId: null } });
      await prisma.customRole.deleteMany({ where: { residenceId: { in: staleResidenceIds } } });
      await prisma.user.deleteMany({ where: { residenceId: { in: staleResidenceIds } } });
      await prisma.residence.deleteMany({ where: { id: { in: staleResidenceIds } } });
    }
    const [residence, otherResidence] = await Promise.all([
      prisma.residence.create({ data: { code: residenceCode, name: 'Residencia de administración' } }),
      prisma.residence.create({ data: { code: otherResidenceCode, name: 'Residencia de aislamiento' } }),
    ]);
    residenceId = residence.id;
    otherResidenceId = otherResidence.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const admin = await prisma.user.create({
      data: { name: 'Administradora', email: adminEmail, passwordHash, role: UserRole.ADMINISTRADOR, residenceId },
    });
    adminId = admin.id;
    const limitedRole = await prisma.customRole.create({
      data: { name: 'Gestión limitada', permissions: ['USERS_MANAGE'], residenceId, createdById: adminId },
    });
    limitedRoleId = limitedRole.id;
    const limitedUser = await prisma.user.create({
      data: {
        name: 'Gestora limitada',
        email: limitedEmail,
        passwordHash,
        role: UserRole.PERSONALIZADO,
        customRoleId: limitedRoleId,
        residenceId,
      },
    });
    limitedUserId = limitedUser.id;
    await prisma.user.create({
      data: {
        name: 'SuperAdministrador de prueba',
        email: `super-${suffix}@example.test`,
        passwordHash,
        role: UserRole.SUPER_ADMINISTRADOR,
        residenceId,
      },
    });
    const otherAdmin = await prisma.user.create({
      data: {
        name: 'Usuario de otra residencia',
        email: `other-${suffix}@example.test`,
        passwordHash,
        role: UserRole.ADMINISTRADOR,
        residenceId: otherResidenceId,
      },
    });
    otherAdminId = otherAdmin.id;
    const otherRole = await prisma.customRole.create({
      data: {
        name: 'Administrador personalizado',
        permissions: ['USERS_MANAGE', 'ROLES_MANAGE', 'PEOPLE_VIEW'],
        residenceId: otherResidenceId,
        createdById: adminId,
      },
    });
    otherRoleId = otherRole.id;
    const otherRoleManager = await prisma.user.create({
      data: {
        name: 'Administrador personalizado',
        email: `custom-admin-${suffix}@example.test`,
        passwordHash,
        role: UserRole.PERSONALIZADO,
        customRoleId: otherRoleId,
        residenceId: otherResidenceId,
      },
    });
    adminToken = jwt.sign({ id: adminId }, jwtSecret);
    limitedToken = jwt.sign({ id: limitedUserId }, jwtSecret);
    const superUser = await prisma.user.findUniqueOrThrow({ where: { email: `super-${suffix}@example.test` } });
    superToken = jwt.sign({ id: superUser.id }, jwtSecret);
    otherRoleManagerToken = jwt.sign({ id: otherRoleManager.id }, jwtSecret);
  });

  afterAll(async () => {
    if (residenceId && otherResidenceId) {
      await prisma.user.updateMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } }, data: { customRoleId: null } });
      await prisma.customRole.deleteMany({ where: { residenceId: { in: [residenceId, otherResidenceId] } } });
    }
    if (residenceId) {
      await prisma.user.deleteMany({ where: { residenceId } });
      await prisma.residence.delete({ where: { id: residenceId } });
    }
    if (otherResidenceId) {
      await prisma.user.deleteMany({ where: { residenceId: otherResidenceId } });
      await prisma.residence.delete({ where: { id: otherResidenceId } });
    }
    await prisma.$disconnect();
  });

  it('limita la creación de cuentas al nivel de permisos del administrador', async () => {
    const response = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({
        name: 'Cuenta no autorizada',
        email: `unauthorized-${suffix}@example.test`,
        password,
        role: 'ADMINISTRADOR',
      });

    expect(response.status).toBe(403);
  });

  it('reserva la creación de cuentas globales al SuperAdministrador', async () => {
    const regularAdminAttempt = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'SuperAdministrador no autorizado',
        email: `unauthorized-super-${suffix}@example.test`,
        password,
        role: 'SUPER_ADMINISTRADOR',
      });
    expect(regularAdminAttempt.status).toBe(403);

    const superAdminCreation = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Residence-Id', String(residenceId))
      .send({
        name: 'SuperAdministrador adicional',
        email: `additional-super-${suffix}@example.test`,
        password,
        role: 'SUPER_ADMINISTRADOR',
      });
    expect(superAdminCreation.status).toBe(201);
    expect(superAdminCreation.body.role).toBe('SUPER_ADMINISTRADOR');
  });

  it('impide operar en otra residencia y permite que el SuperAdministrador la seleccione', async () => {
    const denied = await request(app)
      .get('/api/residence')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Residence-Id', String(otherResidenceId));
    expect(denied.status).toBe(403);

    const selected = await request(app)
      .get('/api/residence')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Residence-Id', String(otherResidenceId));
    expect(selected.status).toBe(200);
    expect(selected.body.name).toBe('Residencia de aislamiento');
  });

  it('no permite retirar el último permiso de gestión de usuarios en una residencia', async () => {
    const deactivateBaseAdmin = await request(app)
      .patch(`/api/admin/users/${otherAdminId}/active`)
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Residence-Id', String(otherResidenceId))
      .send({ active: false });
    expect(deactivateBaseAdmin.status).toBe(200);

    const demoteLastManager = await request(app)
      .put(`/api/admin/roles/${otherRoleId}`)
      .set('Authorization', `Bearer ${otherRoleManagerToken}`)
      .send({ permissions: ['PEOPLE_VIEW'] });
    expect(demoteLastManager.status).toBe(409);
  });

  it('conserva usuarios al desactivarlos y bloquea la desactivación del último administrador', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cuenta temporal',
        email: `temporary-${suffix}@example.test`,
        password,
        role: 'PERSONALIZADO',
        customRoleId: limitedRoleId,
      });
    expect(created.status).toBe(201);

    const deactivated = await request(app)
      .patch(`/api/admin/users/${created.body.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);

    await request(app)
      .patch(`/api/admin/users/${limitedUserId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });

    const demoteLastAdmin = await request(app)
      .put(`/api/admin/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'VIGILANTE' });
    expect(demoteLastAdmin.status).toBe(409);
  });
});
