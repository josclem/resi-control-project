import express, { NextFunction, Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import multer from 'multer';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AccessType, PersonType, PrismaClient, UserRole, DeliveryStatus } from '@prisma/client';
import { z } from 'zod';
import { Permission, permissions, permissionsForRole } from './permissions.js';
import {
  accessSchema,
  accessScanSchema,
  accessCaptureModeSchema,
  deliveryCreateSchema,
  deliveryStatusFilterSchema,
  deliveryStatusSchema,
  irregularAccessModeSchema,
  loginSchema,
  personSchema,
  residentInvitationAcceptanceSchema,
  residentInvitationSchema,
  residenceSchema,
  supervisorSchema,
  vehicleSchema,
  userCreateSchema,
  userUpdateSchema,
  customRoleCreateSchema,
  customRoleUpdateSchema,
  formatPhone,
  normalizeDocumentNumber,
} from './validation.js';
import { createResidentInvitationMailer, ResidentInvitationMailer } from './resident-invitation-email.js';

type AuthenticatedRequest = Request & { user?: { id: number; role: UserRole; residenceId: number; residentPersonId: number | null; permissions: Permission[]; roleName: string } };


function createRequireAuth(prisma: PrismaClient, jwtSecret: string) {
  return async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Autenticación requerida' });
    try {
      const claims = jwt.verify(header.slice(7), jwtSecret) as { id?: number };
      if (!claims.id) return res.status(401).json({ message: 'Sesión inválida. Inicia sesión nuevamente.' });
      const user = await prisma.user.findUnique({
        where: { id: claims.id },
        select: {
          id: true,
          role: true,
          residenceId: true,
          residentPersonId: true,
          customRoleId: true,
          active: true,
          customRole: { select: { id: true, name: true, permissions: true, active: true } },
        },
      });
      if (!user?.active) return res.status(401).json({ message: 'Usuario inactivo o inexistente.' });
      if (user.role === UserRole.PERSONALIZADO && (!user.customRole?.active || user.customRole.id !== user.customRoleId)) {
        return res.status(401).json({ message: 'El rol de este usuario está inactivo.' });
      }
      let residenceId = user.residenceId;
      const requestedResidenceId = req.header('X-Residence-Id');
      if (user.role === UserRole.SUPER_ADMINISTRADOR) {
        if (requestedResidenceId !== undefined) {
          const parsedResidenceId = Number(requestedResidenceId);
          if (!Number.isSafeInteger(parsedResidenceId) || parsedResidenceId <= 0) {
            return res.status(400).json({ message: 'La residencia seleccionada no es válida.' });
          }
          const residence = await prisma.residence.findFirst({ where: { id: parsedResidenceId, active: true }, select: { id: true } });
          if (!residence) return res.status(404).json({ message: 'Residencia no encontrada o inactiva.' });
          residenceId = residence.id;
        }
      } else if (requestedResidenceId !== undefined && requestedResidenceId !== String(user.residenceId)) {
        return res.status(403).json({ message: 'No puedes operar fuera de tu residencia.' });
      }
      req.user = {
        id: user.id,
        role: user.role,
        residenceId,
        residentPersonId: user.residentPersonId,
        permissions: permissionsForRole(user.role, user.customRole?.permissions ?? []),
        roleName: user.customRole?.name ?? user.role,
      };
      return next();
    } catch {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }
  };
}

export function createApp(
  prisma: PrismaClient,
  jwtSecret: string,
  residentInvitationMailer: ResidentInvitationMailer = createResidentInvitationMailer(),
) {
  if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio');

  const app = express();
  const requireAuth = createRequireAuth(prisma, jwtSecret);

  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());
  app.use((_req, res, next) => {
    // Los datos de la API cambian (códigos de acceso, movimientos) y no deben servirse desde caché.
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

function photoData(file: Express.Multer.File) {
  return { data: new Uint8Array(file.buffer) as Uint8Array<ArrayBuffer>, mimeType: file.mimetype, fileName: file.originalname, size: file.size };
}

app.put('/api/people/:id', requireAuth, requirePermission('PEOPLE_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = personSchema.parse(req.body);
    const existing = await prisma.person.findFirst({ where: { id, residenceId: req.user!.residenceId, active: true } });
    if (!existing) return res.status(404).json({ message: 'Persona no encontrada.' });
    const documentNumber = input.documentNumber ? normalizeDocumentNumber(input.documentNumber) : undefined;
    const phone = input.phone ? formatPhone(input.phone) : undefined;
    return res.json(await prisma.person.update({ where: { id }, data: { ...input, documentNumber, phone }, include: { documentType: true } }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El teléfono')) return res.status(400).json({ message: error.message });
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe esa combinación de documento.' });
    return next(error);
  }
});

app.delete('/api/people/:id', requireAuth, requirePermission('PEOPLE_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await prisma.person.updateMany({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId }, data: { active: false } });
    if (!result.count) return res.status(404).json({ message: 'Persona no encontrada.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.put('/api/people/:id/photo', requireAuth, requirePermission('PEOPLE_MANAGE'), photoUpload.single('photo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG o WebP de máximo 2 MB.' });
    const person = await prisma.person.findFirst({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId, active: true } });
    if (!person) return res.status(404).json({ message: 'Persona no encontrada.' });
    return res.json(await prisma.personPhoto.upsert({ where: { personId: person.id }, update: photoData(req.file), create: { personId: person.id, ...photoData(req.file) }, select: { personId: true, mimeType: true, size: true } }));
  } catch (error) { return next(error); }
});

app.get('/api/people/:id/photo', requireAuth, requirePermission('PEOPLE_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const photo = await prisma.personPhoto.findFirst({ where: { personId: Number(req.params.id), person: { residenceId: req.user!.residenceId, active: true } } });
    if (!photo) return res.status(404).end();
    return res.type(photo.mimeType).send(photo.data);
  } catch (error) { return next(error); }
});

app.delete('/api/people/:id/photo', requireAuth, requirePermission('PEOPLE_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try { await prisma.personPhoto.deleteMany({ where: { personId: Number(req.params.id), person: { residenceId: req.user!.residenceId } } }); return res.status(204).end(); }
  catch (error) { return next(error); }
});
app.put('/api/vehicles/:id', requireAuth, requirePermission('VEHICLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = vehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.findFirst({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId, active: true } });
    if (!vehicle) return res.status(404).json({ message: 'Vehículo no encontrado.' });
    const person = await prisma.person.findFirst({ where: { id: input.personId, residenceId: req.user!.residenceId, active: true } });
    if (!person) return res.status(400).json({ message: 'La persona asociada no existe o está inactiva.' });
    const plate = input.plate.replace(/[\s-]/g, '').toUpperCase();
    return res.json(await prisma.vehicle.update({ where: { id: vehicle.id }, data: { ...input, plate }, include: { person: { select: { id: true, fullName: true, type: true, apartmentNumber: true } } } }));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe un vehículo con esa placa.' });
    return next(error);
  }
});

app.delete('/api/vehicles/:id', requireAuth, requirePermission('VEHICLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await prisma.vehicle.updateMany({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId }, data: { active: false } });
    if (!result.count) return res.status(404).json({ message: 'Vehículo no encontrado.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.put('/api/vehicles/:id/photo', requireAuth, requirePermission('VEHICLES_MANAGE'), photoUpload.single('photo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG o WebP de máximo 2 MB.' });
    const vehicle = await prisma.vehicle.findFirst({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId, active: true } });
    if (!vehicle) return res.status(404).json({ message: 'Vehículo no encontrado.' });
    return res.json(await prisma.vehiclePhoto.upsert({ where: { vehicleId: vehicle.id }, update: photoData(req.file), create: { vehicleId: vehicle.id, ...photoData(req.file) }, select: { vehicleId: true, mimeType: true, size: true } }));
  } catch (error) { return next(error); }
});

app.get('/api/vehicles/:id/photo', requireAuth, requirePermission('VEHICLES_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const photo = await prisma.vehiclePhoto.findFirst({ where: { vehicleId: Number(req.params.id), vehicle: { residenceId: req.user!.residenceId, active: true } } });
    if (!photo) return res.status(404).end();
    return res.type(photo.mimeType).send(photo.data);
  } catch (error) { return next(error); }
});

app.delete('/api/vehicles/:id/photo', requireAuth, requirePermission('VEHICLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try { await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: Number(req.params.id), vehicle: { residenceId: req.user!.residenceId } } }); return res.status(204).end(); }
  catch (error) { return next(error); }
});
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

function allowRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Permisos insuficientes' });
    return next();
  };
}

function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.permissions.includes(permission)) return res.status(403).json({ message: 'Permisos insuficientes.' });
    return next();
  };
}

function requireAnyPermission(...requestedPermissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !requestedPermissions.some((permission) => req.user!.permissions.includes(permission))) {
      return res.status(403).json({ message: 'Permisos insuficientes.' });
    }
    return next();
  };
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/residence', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const residence = await prisma.residence.findUnique({
      where: { id: req.user!.residenceId },
      select: { id: true, name: true, code: true, active: true, logoData: true, logoMimeType: true },
    });
    if (!residence) return res.status(404).json({ message: 'Residencia no encontrada.' });
    const { logoData, ...metadata } = residence;
    const logo = logoData && residence.logoMimeType
      ? `data:${residence.logoMimeType};base64,${Buffer.from(logoData).toString('base64')}`
      : null;
    return res.json({ ...metadata, hasLogo: Boolean(logo), logo, userRole: req.user!.role });
  } catch (error) { return next(error); }
});

app.get('/api/residence/logo', requireAuth, requirePermission('SETTINGS_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const residence = await prisma.residence.findUnique({ where: { id: req.user!.residenceId }, select: { logoData: true, logoMimeType: true } });
    if (!residence?.logoData || !residence.logoMimeType) return res.status(404).end();
    res.type(residence.logoMimeType).send(residence.logoData);
  } catch (error) { return next(error); }
});

app.put('/api/residence', requireAuth, requirePermission('SETTINGS_MANAGE'), logoUpload.single('logo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = residenceSchema.parse(req.body);
    const file = req.file;
    if (req.body.removeLogo === 'true') {
      await prisma.residence.update({ where: { id: req.user!.residenceId }, data: { name: input.name, logoData: null, logoMimeType: null } });
    } else {
      await prisma.residence.update({
        where: { id: req.user!.residenceId },
        data: { name: input.name, ...(file ? { logoData: new Uint8Array(file.buffer) as Uint8Array<ArrayBuffer>, logoMimeType: file.mimetype } : {}) },
      });
    }
    const residence = await prisma.residence.findUnique({ where: { id: req.user!.residenceId }, select: { id: true, name: true, code: true, active: true, logoMimeType: true } });
    return res.json({ ...residence, hasLogo: Boolean(residence?.logoMimeType) });
  } catch (error) {
    if (error instanceof multer.MulterError || error instanceof z.ZodError) return res.status(400).json({ message: 'El nombre o logo de la residencia no son válidos.' });
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, residenceId: user.residenceId }, jwtSecret, { expiresIn: '8h' });
    const availableResidences = user.role === UserRole.SUPER_ADMINISTRADOR
      ? await prisma.residence.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
      : [];
    const customRole = user.customRoleId
      ? await prisma.customRole.findUnique({ where: { id: user.customRoleId }, select: { name: true, permissions: true, active: true } })
      : null;
    if (user.role === UserRole.PERSONALIZADO && !customRole?.active) return res.status(401).json({ message: 'El rol de este usuario está inactivo.' });
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleName: customRole?.name ?? user.role,
        permissions: permissionsForRole(user.role, customRole?.permissions ?? []),
        residenceId: user.residenceId,
        availableResidences,
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/resident-invitation/accept', async (req, res, next) => {
  try {
    const parsed = residentInvitationAcceptanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'El enlace o la contraseña no son válidos.' });
    const { token, password } = parsed.data;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await prisma.residentInvitation.findFirst({
      where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { person: { include: { residence: true } } },
    });
    if (!invitation || invitation.person.type !== PersonType.RESIDENTE || !invitation.person.active || !invitation.person.residence.active) {
      return res.status(410).json({ message: 'La invitación venció o ya no está disponible. Solicita una nueva a la administración.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.residentInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw new Error('RESIDENT_INVITATION_ALREADY_USED');
      return transaction.user.create({
        data: {
          name: invitation.person.fullName,
          email: invitation.email,
          passwordHash,
          role: UserRole.RESIDENTE,
          residenceId: invitation.person.residenceId,
          residentPersonId: invitation.personId,
        },
        select: { id: true, name: true, email: true },
      });
    });
    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe una cuenta vinculada a este residente o correo.' });
    }
    if (error instanceof Error && error.message === 'RESIDENT_INVITATION_ALREADY_USED') {
      return res.status(410).json({ message: 'La invitación ya se utilizó. Inicia sesión o solicita una nueva.' });
    }
    return next(error);
  }
});

const userResponse = {
  id: true,
  name: true,
  email: true,
  role: true,
  customRoleId: true,
  active: true,
  residenceId: true,
  createdAt: true,
  customRole: { select: { id: true, name: true, active: true, permissions: true } },
  residentPerson: { select: { fullName: true, apartmentNumber: true } },
};

function isAdministratorRole(role: { role: UserRole; customRole?: { permissions: string[] } | null }) {
  return role.role !== UserRole.SUPER_ADMINISTRADOR
    && permissionsForRole(role.role, role.customRole?.permissions ?? []).includes('USERS_MANAGE');
}

function canAssignPermissions(available: Permission[], requested: Permission[]) {
  return requested.every((permission) => available.includes(permission));
}

app.get('/api/admin/residences', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR), async (_req, res, next) => {
  try {
    return res.json(await prisma.residence.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }));
  } catch (error) { return next(error); }
});

app.get('/api/admin/roles', requireAuth, requireAnyPermission('ROLES_MANAGE', 'USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const builtInRoles = [UserRole.ADMINISTRADOR, UserRole.VIGILANTE].map((role) => ({
      id: null,
      key: role,
      name: role === UserRole.ADMINISTRADOR ? 'Administrador' : 'Vigilante',
      active: true,
      system: true,
      permissions: permissionsForRole(role),
      assignable: canAssignPermissions(req.user!.permissions, permissionsForRole(role)),
    }));
    const customRoles = await prisma.customRole.findMany({
      where: { residenceId: req.user!.residenceId },
      select: { id: true, name: true, active: true, permissions: true, residenceId: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return res.json({
      permissions: permissions.filter((permission) => permission !== 'RESIDENCES_MANAGE'),
      roles: [...builtInRoles, ...customRoles.map((role) => ({
        ...role,
        key: `CUSTOM:${role.id}`,
        system: false,
        assignable: canAssignPermissions(req.user!.permissions, permissionsForRole(UserRole.PERSONALIZADO, role.permissions)),
      }))],
    });
  } catch (error) { return next(error); }
});

app.post('/api/admin/roles', requireAuth, requirePermission('ROLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = customRoleCreateSchema.parse(req.body);
    if (input.permissions.includes('RESIDENCES_MANAGE') || input.permissions.some((permission) => !req.user!.permissions.includes(permission))) {
      return res.status(403).json({ message: 'No puedes asignar permisos que no tienes.' });
    }
    const role = await prisma.customRole.create({
      data: { name: input.name, permissions: input.permissions, residenceId: req.user!.residenceId, createdById: req.user!.id },
      select: { id: true, name: true, permissions: true, active: true, residenceId: true },
    });
    return res.status(201).json(role);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe un rol con ese nombre en la residencia.' });
    return next(error);
  }
});

app.put('/api/admin/roles/:id', requireAuth, requirePermission('ROLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador de rol inválido.' });
    const input = customRoleUpdateSchema.parse(req.body);
    const existing = await prisma.customRole.findFirst({ where: { id, residenceId: req.user!.residenceId, active: true } });
    if (!existing) return res.status(404).json({ message: 'Rol personalizado no encontrado.' });
    if (input.permissions?.some((permission) => permission === 'RESIDENCES_MANAGE' || !req.user!.permissions.includes(permission))) {
      return res.status(403).json({ message: 'No puedes asignar permisos que no tienes.' });
    }
    const updatedPermissions = input.permissions ?? existing.permissions;
    if (existing.permissions.includes('USERS_MANAGE') && !updatedPermissions.includes('USERS_MANAGE')) {
      const activeUsers = await prisma.user.findMany({
        where: { residenceId: req.user!.residenceId, active: true },
        include: { customRole: { select: { permissions: true } } },
      });
      const remainingAdministrators = activeUsers
        .filter((user) => user.customRoleId !== id)
        .filter(isAdministratorRole);
      if (remainingAdministrators.length === 0) {
        return res.status(409).json({ message: 'La residencia debe conservar al menos un usuario con permiso de administrar usuarios.' });
      }
    }
    return res.json(await prisma.customRole.update({
      where: { id },
      data: input,
      select: { id: true, name: true, permissions: true, active: true, residenceId: true },
    }));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe un rol con ese nombre en la residencia.' });
    return next(error);
  }
});

app.delete('/api/admin/roles/:id', requireAuth, requirePermission('ROLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador de rol inválido.' });
    const role = await prisma.customRole.findFirst({ where: { id, residenceId: req.user!.residenceId, active: true } });
    if (!role) return res.status(404).json({ message: 'Rol personalizado no encontrado.' });
    const assignedUsers = await prisma.user.count({ where: { customRoleId: id } });
    if (assignedUsers > 0) return res.status(409).json({ message: 'No puedes desactivar un rol asignado a cuentas de usuario.' });
    await prisma.customRole.update({ where: { id }, data: { active: false } });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.get('/api/admin/users', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { residenceId: req.user!.residenceId },
      select: userResponse,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return res.json(users.filter((user) => canAssignPermissions(
      req.user!.permissions,
      permissionsForRole(user.role, user.customRole?.permissions ?? []),
    )));
  } catch (error) { return next(error); }
});

app.get('/api/admin/resident-invitations/candidates', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const people = await prisma.person.findMany({
      where: {
        residenceId: req.user!.residenceId,
        type: PersonType.RESIDENTE,
        active: true,
        residentUser: null,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        buildingSectionType: true,
        buildingSectionNumber: true,
        apartmentNumber: true,
        residentInvitations: {
          where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { email: true, expiresAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ buildingSectionNumber: 'asc' }, { apartmentNumber: 'asc' }, { fullName: 'asc' }],
    });
    return res.json(people.map(({ residentInvitations, ...person }) => ({
      ...person,
      pendingInvitation: residentInvitations[0] ?? null,
    })));
  } catch (error) { return next(error); }
});

app.post('/api/admin/resident-invitations', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = residentInvitationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Selecciona un residente e indica un correo válido.' });
    let configured: boolean;
    try {
      configured = residentInvitationMailer.isConfigured();
    } catch (error) {
      return next(error);
    }
    if (!configured) return res.status(503).json({ message: 'El correo aún no está configurado. Completa SMTP en apps/api/.env.' });

    const { personId, email } = parsed.data;
    const person = await prisma.person.findFirst({
      where: { id: personId, residenceId: req.user!.residenceId, type: PersonType.RESIDENTE, active: true },
      include: { residentUser: { select: { id: true } }, residence: { select: { name: true, active: true } } },
    });
    if (!person || !person.residence.active) return res.status(404).json({ message: 'Residente no encontrado o inactivo.' });
    if (person.residentUser) return res.status(409).json({ message: 'Este residente ya tiene una cuenta vinculada.' });
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return res.status(409).json({ message: 'Este correo ya está asociado a una cuenta.' });
    }
    const otherPendingInvitation = await prisma.residentInvitation.findFirst({
      where: { personId: { not: personId }, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (otherPendingInvitation) return res.status(409).json({ message: 'Este correo ya tiene una invitación pendiente para otro residente.' });

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const invitation = await prisma.$transaction(async (transaction) => {
      await transaction.residentInvitation.updateMany({
        where: { personId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.person.update({ where: { id: personId }, data: { email } });
      return transaction.residentInvitation.create({
        data: { personId, email, tokenHash, expiresAt, createdById: req.user!.id },
        select: { id: true, email: true, expiresAt: true },
      });
    });

    const appUrl = new URL(process.env.WEB_APP_URL ?? 'http://localhost:5173');
    appUrl.hash = new URLSearchParams({ invite: token }).toString();
    try {
      await residentInvitationMailer.sendInvitation({
        email,
        residentName: person.fullName,
        residenceName: person.residence.name,
        url: appUrl.toString(),
      });
    } catch (error) {
      console.error('No se pudo enviar una invitación de residente.', error);
      await prisma.residentInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
      return res.status(502).json({ message: 'No se pudo enviar el correo. Revisa la configuración y vuelve a intentar.' });
    }
    return res.status(201).json({ email: invitation.email, expiresAt: invitation.expiresAt });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/users', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = userCreateSchema.parse(req.body);
    if (input.role === 'SUPER_ADMINISTRADOR' && req.user!.role !== UserRole.SUPER_ADMINISTRADOR) {
      return res.status(403).json({ message: 'Solo el SuperAdministrador global puede crear otras cuentas globales.' });
    }
    if (input.role !== 'PERSONALIZADO' && !canAssignPermissions(req.user!.permissions, permissionsForRole(input.role))) {
      return res.status(403).json({ message: 'No puedes asignar un rol con permisos que no tienes.' });
    }
    if (input.role === 'PERSONALIZADO') {
      const role = await prisma.customRole.findFirst({ where: { id: input.customRoleId, residenceId: req.user!.residenceId, active: true } });
      if (!role) return res.status(400).json({ message: 'El rol personalizado no existe o está inactivo.' });
      if (!canAssignPermissions(req.user!.permissions, role.permissions as Permission[])) {
        return res.status(403).json({ message: 'No puedes asignar un rol con permisos que no tienes.' });
      }
    }
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role as UserRole,
        customRoleId: input.customRoleId ?? null,
        residenceId: req.user!.residenceId,
      },
      select: userResponse,
    });
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    return next(error);
  }
});

app.put('/api/admin/users/:id', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador de usuario inválido.' });
    const input = userUpdateSchema.parse(req.body);
    const existing = await prisma.user.findFirst({
      where: { id, residenceId: req.user!.residenceId, active: true },
      include: { customRole: { select: { permissions: true } } },
    });
    if (!existing || (existing.role === UserRole.SUPER_ADMINISTRADOR && req.user!.role !== UserRole.SUPER_ADMINISTRADOR)) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    if (existing.role === UserRole.SUPER_ADMINISTRADOR && (input.role !== undefined || input.customRoleId !== undefined)) {
      return res.status(400).json({ message: 'El rol global de SuperAdministrador no se puede cambiar desde esta pantalla.' });
    }
    if (!canAssignPermissions(req.user!.permissions, permissionsForRole(existing.role, existing.customRole?.permissions ?? []))) {
      return res.status(403).json({ message: 'No puedes administrar una cuenta con permisos superiores a los tuyos.' });
    }
    const nextRole = input.role ?? existing.role;
    const nextCustomRoleId = nextRole === UserRole.PERSONALIZADO ? input.customRoleId ?? existing.customRoleId : null;
    let nextPermissions: Permission[] = [];
    if (nextRole === UserRole.PERSONALIZADO) {
      const role = await prisma.customRole.findFirst({ where: { id: nextCustomRoleId ?? undefined, residenceId: req.user!.residenceId, active: true } });
      if (!role) return res.status(400).json({ message: 'El rol personalizado no existe o está inactivo.' });
      nextPermissions = permissionsForRole(UserRole.PERSONALIZADO, role.permissions);
      if (!canAssignPermissions(req.user!.permissions, nextPermissions)) {
        return res.status(403).json({ message: 'No puedes asignar un rol con permisos que no tienes.' });
      }
    } else {
      nextPermissions = permissionsForRole(nextRole);
      if (!canAssignPermissions(req.user!.permissions, nextPermissions)) {
        return res.status(403).json({ message: 'No puedes asignar un rol con permisos que no tienes.' });
      }
    }
    if (isAdministratorRole(existing) && !nextPermissions.includes('USERS_MANAGE')) {
      const admins = await prisma.user.findMany({
        where: { residenceId: req.user!.residenceId, active: true },
        include: { customRole: { select: { permissions: true } } },
      });
      if (admins.filter(isAdministratorRole).length <= 1) return res.status(409).json({ message: 'La residencia debe conservar al menos un administrador activo.' });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
        ...(input.role !== undefined ? { role: input.role as UserRole } : {}),
        ...(input.role !== undefined || input.customRoleId !== undefined ? { customRoleId: nextCustomRoleId } : {}),
      },
      select: userResponse,
    });
    return res.json(updated);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    return next(error);
  }
});

app.patch('/api/admin/users/:id/active', requireAuth, requirePermission('USERS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = z.object({ active: z.boolean() }).parse(req.body);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador de usuario inválido.' });
    if (id === req.user!.id) return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' });
    const target = await prisma.user.findFirst({
      where: { id, residenceId: req.user!.residenceId },
      include: { customRole: { select: { permissions: true, active: true } } },
    });
    if (!target) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (target.role !== UserRole.SUPER_ADMINISTRADOR
      && !canAssignPermissions(req.user!.permissions, permissionsForRole(target.role, target.customRole?.permissions ?? []))) {
      return res.status(403).json({ message: 'No puedes administrar una cuenta con permisos superiores a los tuyos.' });
    }
    if (input.active && target.role === UserRole.PERSONALIZADO && !target.customRole?.active) {
      return res.status(409).json({ message: 'El rol personalizado está inactivo. Asígnale otro rol antes de reactivar la cuenta.' });
    }
    if (!input.active && target.active && isAdministratorRole(target)) {
      const admins = await prisma.user.findMany({
        where: { residenceId: req.user!.residenceId, active: true },
        include: { customRole: { select: { permissions: true } } },
      });
      if (admins.filter(isAdministratorRole).length <= 1) return res.status(409).json({ message: 'La residencia debe conservar al menos un administrador activo.' });
    }
    if (target.role === UserRole.SUPER_ADMINISTRADOR) {
      if (req.user!.role !== UserRole.SUPER_ADMINISTRADOR) return res.status(403).json({ message: 'Solo el SuperAdministrador puede administrar otra cuenta global.' });
      if (!input.active) {
        const activeSuperAdmins = await prisma.user.count({ where: { role: UserRole.SUPER_ADMINISTRADOR, active: true } });
        if (activeSuperAdmins <= 1) return res.status(409).json({ message: 'El sistema debe conservar al menos un SuperAdministrador activo.' });
      }
    }
    const user = await prisma.user.update({ where: { id }, data: { active: input.active }, select: userResponse });
    return res.json(user);
  } catch (error) { return next(error); }
});

app.get('/api/dashboard', requireAuth, requirePermission('DASHBOARD_VIEW'), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const [latest, residents, visitors, today, pendingDeliveries] = await Promise.all([
      prisma.accessLog.findMany({ where: { residenceId: _req.user!.residenceId }, take: 10, orderBy: { occurredAt: 'desc' }, include: { person: { include: { photo: { select: { data: true, mimeType: true } } } }, vehicle: { include: { photo: { select: { data: true, mimeType: true } } } } } }),
      prisma.person.count({ where: { residenceId: _req.user!.residenceId, type: PersonType.RESIDENTE, active: true } }),
      prisma.person.count({ where: { residenceId: _req.user!.residenceId, type: PersonType.VISITANTE, active: true } }),
      prisma.accessLog.count({ where: { residenceId: _req.user!.residenceId, occurredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.delivery.count({ where: { residenceId: _req.user!.residenceId, status: DeliveryStatus.PENDIENTE } }),
    ]);
    return res.json({
      latest: latest.map(({ person, vehicle, ...log }) => ({
        ...log,
        person: {
          ...person,
          photoUrl: person.photo ? `data:${person.photo.mimeType};base64,${Buffer.from(person.photo.data).toString('base64')}` : null,
          photo: undefined,
        },
        vehicle: vehicle ? {
          ...vehicle,
          photoUrl: vehicle.photo ? `data:${vehicle.photo.mimeType};base64,${Buffer.from(vehicle.photo.data).toString('base64')}` : null,
          photo: undefined,
        } : null,
      })),
      totals: { residents, visitors, today, pendingDeliveries },
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/people', requireAuth, requirePermission('PEOPLE_VIEW'), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const people = await prisma.person.findMany({ where: { residenceId: _req.user!.residenceId, active: true }, orderBy: { fullName: 'asc' }, include: { documentType: true, photo: { select: { data: true, mimeType: true } } } });
    return res.json(people.map(({ photo, ...person }) => ({
      ...person,
      photoUrl: photo ? `data:${photo.mimeType};base64,${Buffer.from(photo.data).toString('base64')}` : null,
    })));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/vehicles', requireAuth, requirePermission('VEHICLES_VIEW'), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { residenceId: _req.user!.residenceId, active: true },
      orderBy: { plate: 'asc' },
      include: { person: { select: { id: true, fullName: true, type: true, buildingSectionType: true, buildingSectionNumber: true, apartmentNumber: true } }, photo: { select: { data: true, mimeType: true } } },
    });
    return res.json(vehicles.map(({ photo, ...vehicle }) => ({
      ...vehicle,
      photoUrl: photo ? `data:${photo.mimeType};base64,${Buffer.from(photo.data).toString('base64')}` : null,
    })));
  } catch (error) { return next(error); }
});

app.post('/api/vehicles', requireAuth, requirePermission('VEHICLES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = vehicleSchema.parse(req.body);
    const plate = input.plate.replace(/[\s-]/g, '').toUpperCase();
    const person = await prisma.person.findFirst({ where: { id: input.personId, residenceId: req.user!.residenceId, active: true } });
    if (!person) return res.status(400).json({ message: 'La persona asociada no existe o está inactiva.' });
    return res.status(201).json(await prisma.vehicle.create({
      data: { ...input, residenceId: req.user!.residenceId, plate },
      include: { person: { select: { id: true, fullName: true, type: true, buildingSectionType: true, buildingSectionNumber: true, apartmentNumber: true } } },
    }));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un vehículo con esa placa.' });
    }
    return next(error);
  }
});

const deliveryRelations = {
  person: { select: { id: true, fullName: true, buildingSectionType: true, buildingSectionNumber: true, apartmentNumber: true, type: true } },
  receivedBy: { select: { id: true, name: true } },
  deliveredBy: { select: { id: true, name: true } },
};

app.get('/api/deliveries', requireAuth, requirePermission('DELIVERIES_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    let status: DeliveryStatus | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') return res.status(400).json({ message: 'Estado de encomienda inválido.' });
      const parsedStatus = deliveryStatusFilterSchema.safeParse(req.query.status.toUpperCase());
      if (!parsedStatus.success) return res.status(400).json({ message: 'Estado de encomienda inválido.' });
      status = parsedStatus.data;
    }
    const deliveries = await prisma.delivery.findMany({
      where: { residenceId: req.user!.residenceId, ...(status ? { status } : {}) },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: deliveryRelations,
    });
    return res.json(deliveries);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/deliveries', requireAuth, requirePermission('DELIVERIES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = deliveryCreateSchema.parse(req.body);
    const person = await prisma.person.findFirst({
      where: { id: input.personId, residenceId: req.user!.residenceId, active: true },
      select: { id: true },
    });
    if (!person) return res.status(404).json({ message: 'El destinatario no existe o está inactivo.' });
    const delivery = await prisma.delivery.create({
      data: {
        personId: input.personId,
        type: input.type,
        courier: input.courier || null,
        description: input.description || null,
        trackingCode: input.trackingCode || null,
        notes: input.notes || null,
        residenceId: req.user!.residenceId,
        receivedById: req.user!.id,
      },
      include: deliveryRelations,
    });
    return res.status(201).json(delivery);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/deliveries/:id/status', requireAuth, requirePermission('DELIVERIES_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador inválido.' });
    const parsedInput = deliveryStatusSchema.safeParse(req.body);
    if (!parsedInput.success) {
      return res.status(400).json({
        message: parsedInput.error.issues[0]?.message ?? 'Datos inválidos.',
        issues: parsedInput.error.issues,
      });
    }
    const input = parsedInput.data;
    if (input.status === DeliveryStatus.PENDIENTE) return res.status(400).json({ message: 'La encomienda ya está pendiente.' });
    const delivered = input.status === DeliveryStatus.ENTREGADA;
    const result = await prisma.$transaction(async (transaction) => {
      const update = await transaction.delivery.updateMany({
        where: { id, residenceId: req.user!.residenceId, status: DeliveryStatus.PENDIENTE },
        data: {
          status: input.status,
          deliveredAt: delivered ? new Date() : null,
          deliveredById: delivered ? req.user!.id : null,
          deliveredToName: delivered ? input.deliveredToName ?? null : null,
        },
      });
      if (!update.count) {
        const existing = await transaction.delivery.findFirst({
          where: { id, residenceId: req.user!.residenceId },
          select: { id: true },
        });
        return existing ? { status: 409 as const } : { status: 404 as const };
      }

      const delivery = await transaction.delivery.findFirst({
        where: { id, residenceId: req.user!.residenceId },
        include: deliveryRelations,
      });
      if (!delivery) throw new Error('La encomienda desapareció durante su actualización.');
      return { status: 200 as const, delivery };
    });
    if (result.status === 404) return res.status(404).json({ message: 'Encomienda no encontrada.' });
    if (result.status === 409) return res.status(409).json({ message: 'La encomienda ya fue cerrada.' });
    return res.json(result.delivery);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/document-types', requireAuth, requirePermission('PEOPLE_VIEW'), async (_req, res, next) => {
  try {
    return res.json(await prisma.documentType.findMany({ where: { active: true }, orderBy: { code: 'asc' } }));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/settings/irregular-access', requireAuth, requirePermission('SETTINGS_VIEW'), async (_req: AuthenticatedRequest, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { residenceId_key: { residenceId: _req.user!.residenceId, key: 'irregular_access_mode' } } });
    return res.json({ mode: irregularAccessModeSchema.parse(setting?.value ?? 'BLOCK') });
  } catch (error) { return next(error); }
});

app.put('/api/settings/irregular-access', requireAuth, requirePermission('SETTINGS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const mode = irregularAccessModeSchema.parse(req.body.mode);
    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'irregular_access_mode' } },
      update: { value: mode },
      create: { residenceId: req.user!.residenceId, key: 'irregular_access_mode', value: mode },
    });

    return res.json({ mode });
  } catch (error) { return next(error); }
});

app.get('/api/settings/access-capture', requireAuth, requirePermission('SETTINGS_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'access_capture_mode' } } });
    return res.json({ mode: accessCaptureModeSchema.parse(setting?.value ?? 'MANUAL') });
  } catch (error) { return next(error); }
});

app.put('/api/settings/access-capture', requireAuth, requirePermission('SETTINGS_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const mode = accessCaptureModeSchema.parse(req.body.mode);
    await prisma.systemSetting.upsert({
      where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'access_capture_mode' } },
      update: { value: mode },
      create: { residenceId: req.user!.residenceId, key: 'access_capture_mode', value: mode },
    });
    return res.json({ mode });
  } catch (error) { return next(error); }
});

app.post('/api/people', requireAuth, requirePermission('PEOPLE_MANAGE'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = personSchema.parse(req.body);
    const phone = input.phone ? formatPhone(input.phone) : undefined;
    const documentNumber = input.documentNumber ? normalizeDocumentNumber(input.documentNumber) : undefined;
    if (input.documentTypeId) {
      const documentType = await prisma.documentType.findFirst({ where: { id: input.documentTypeId, active: true } });
      if (!documentType) return res.status(400).json({ message: 'Tipo de documento inválido.' });
    }
    return res.status(201).json(await prisma.person.create({
      data: { ...input, residenceId: req.user!.residenceId, documentNumber, phone },
      include: { documentType: true },
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El teléfono')) return res.status(400).json({ message: error.message });
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe una persona con ese tipo y número de documento.' });
    }
    return next(error);
  }
});

app.post('/api/access/scan', requireAuth, requirePermission('ACCESS_REGISTER'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { code } = accessScanSchema.parse(req.body);
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        accessCode: code,
        residenceId: req.user!.residenceId,
        active: true,
        person: { is: { residenceId: req.user!.residenceId, active: true } },
      },
      include: { person: true },
    });
    const person = vehicle ? vehicle.person : await prisma.person.findFirst({ where: { accessCode: code, residenceId: req.user!.residenceId, active: true } });
    if (!person) return res.status(404).json({ message: 'Código no reconocido.' });
    const lastAccess = await prisma.accessLog.findFirst({
      where: vehicle ? { residenceId: req.user!.residenceId, vehicleId: vehicle.id } : { residenceId: req.user!.residenceId, personId: person.id, vehicleId: null },
      orderBy: { occurredAt: 'desc' },
    });
    return res.json({
      personId: person.id,
      vehicleId: vehicle?.id ?? null,
      accessType: lastAccess?.accessType === AccessType.ENTRADA ? AccessType.SALIDA : AccessType.ENTRADA,
      person: { fullName: person.fullName, buildingSectionType: person.buildingSectionType, buildingSectionNumber: person.buildingSectionNumber, apartmentNumber: person.apartmentNumber },
      vehicle: vehicle ? { plate: vehicle.plate } : null,
    });
  } catch (error) { return next(error); }
});

app.post('/api/access', requireAuth, requirePermission('ACCESS_REGISTER'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = accessSchema.parse(req.body);
    const result = await prisma.$transaction(async (transaction) => {
      const lockedPerson = await transaction.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Person"
        WHERE "id" = ${input.personId} AND "residenceId" = ${req.user!.residenceId}
        FOR UPDATE
      `;
      if (!lockedPerson.length) return { status: 404, body: { message: 'Persona no encontrada o inactiva' } };

      const person = await transaction.person.findFirst({ where: { id: input.personId, residenceId: req.user!.residenceId, active: true } });
      if (!person) return { status: 404, body: { message: 'Persona no encontrada o inactiva' } };

      let vehicleId: number | undefined;
      if (input.vehicleId) {
        const vehicle = await transaction.vehicle.findFirst({ where: { id: input.vehicleId, personId: input.personId, residenceId: req.user!.residenceId, active: true } });
        if (!vehicle) return { status: 400, body: { message: 'El vehículo no pertenece a la persona seleccionada o está inactivo.' } };
        vehicleId = vehicle.id;
      }

      const lastAccess = await transaction.accessLog.findFirst({
        where: { residenceId: req.user!.residenceId, ...(vehicleId ? { vehicleId } : { personId: input.personId, vehicleId: null }) },
        orderBy: { occurredAt: 'desc' },
      });
      let overrideAuthorizedById: number | undefined;
      if (lastAccess?.accessType === input.accessType) {
        const setting = await transaction.systemSetting.findUnique({ where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'irregular_access_mode' } } });
        if ((setting?.value ?? 'BLOCK') === 'BLOCK') {
          return { status: 409, body: { code: 'IRREGULAR_ACCESS', message: `Movimiento irregular: la persona ya tiene una ${input.accessType === 'ENTRADA' ? 'entrada' : 'salida'} registrada.` } };
        }
        const supervisor = supervisorSchema.safeParse(req.body.supervisor);
        if (!supervisor.success) return { status: 409, body: { code: 'SUPERVISOR_REQUIRED', message: 'Se requiere autorización de supervisor para continuar.' } };
        const supervisorUser = await transaction.user.findFirst({ where: { email: supervisor.data.email, residenceId: req.user!.residenceId } });
        if (!supervisorUser || !supervisorUser.active || supervisorUser.role === UserRole.VIGILANTE || !(await bcrypt.compare(supervisor.data.password, supervisorUser.passwordHash))) {
          return { status: 403, body: { message: 'Las credenciales del supervisor no son válidas.' } };
        }
        overrideAuthorizedById = supervisorUser.id;
      }

      return {
        status: 201,
        body: await transaction.accessLog.create({
          data: { ...input, residenceId: req.user!.residenceId, registeredById: req.user!.id, overrideAuthorizedById },
          include: { person: true, vehicle: true },
        }),
      };
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/reports/access', requireAuth, requirePermission('REPORTS_VIEW'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    return res.json(await prisma.accessLog.findMany({
      where: { residenceId: req.user!.residenceId, occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: 'desc' },
      include: { person: true, vehicle: true, registeredBy: { select: { name: true } } },
    }));
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Datos inválidos', issues: error.issues });
  console.error(error);
  return res.status(500).json({ message: 'Error interno del servidor' });
});

  return app;
}
