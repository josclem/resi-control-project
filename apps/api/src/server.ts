import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AccessType, PersonType, PrismaClient, UserRole, DeliveryStatus } from '@prisma/client';
import { z } from 'zod';
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
  residenceSchema,
  supervisorSchema,
  vehicleSchema,
  whatsappPhoneSchema,
  formatPhone,
  normalizeDocumentNumber,
  normalizeWhatsAppPhone,
} from './validation.js';

type AuthenticatedRequest = Request & { user?: { id: number; role: UserRole; residenceId: number; personId: number | null } };

function createRequireAuth(prisma: PrismaClient, jwtSecret: string) {
  return async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Autenticación requerida' });
    try {
      const claims = jwt.verify(header.slice(7), jwtSecret) as { id?: number };
      if (!claims.id) return res.status(401).json({ message: 'Sesión inválida. Inicia sesión nuevamente.' });
      const user = await prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, role: true, residenceId: true, personId: true, active: true } });
      if (!user?.active) return res.status(401).json({ message: 'Usuario inactivo o inexistente.' });
      req.user = { id: user.id, role: user.role, residenceId: user.residenceId, personId: user.personId };
      return next();
    } catch {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }
  };
}

export function createApp(prisma: PrismaClient, jwtSecret: string) {
  if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio');

  const app = express();
  const requireAuth = createRequireAuth(prisma, jwtSecret);
  const requireStaff = allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR, UserRole.VIGILANTE);
  const requireResident = allowRoles(UserRole.RESIDENTE);

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

app.put('/api/people/:id', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.delete('/api/people/:id', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await prisma.person.updateMany({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId }, data: { active: false } });
    if (!result.count) return res.status(404).json({ message: 'Persona no encontrada.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.put('/api/people/:id/photo', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), photoUpload.single('photo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG o WebP de máximo 2 MB.' });
    const person = await prisma.person.findFirst({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId, active: true } });
    if (!person) return res.status(404).json({ message: 'Persona no encontrada.' });
    return res.json(await prisma.personPhoto.upsert({ where: { personId: person.id }, update: photoData(req.file), create: { personId: person.id, ...photoData(req.file) }, select: { personId: true, mimeType: true, size: true } }));
  } catch (error) { return next(error); }
});

app.get('/api/people/:id/photo', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
  try {
    const photo = await prisma.personPhoto.findFirst({ where: { personId: Number(req.params.id), person: { residenceId: req.user!.residenceId, active: true } } });
    if (!photo) return res.status(404).end();
    return res.type(photo.mimeType).send(photo.data);
  } catch (error) { return next(error); }
});

app.delete('/api/people/:id/photo', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
  try { await prisma.personPhoto.deleteMany({ where: { personId: Number(req.params.id), person: { residenceId: req.user!.residenceId } } }); return res.status(204).end(); }
  catch (error) { return next(error); }
});
app.put('/api/vehicles/:id', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.delete('/api/vehicles/:id', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await prisma.vehicle.updateMany({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId }, data: { active: false } });
    if (!result.count) return res.status(404).json({ message: 'Vehículo no encontrado.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.put('/api/vehicles/:id/photo', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), photoUpload.single('photo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen JPG, PNG o WebP de máximo 2 MB.' });
    const vehicle = await prisma.vehicle.findFirst({ where: { id: Number(req.params.id), residenceId: req.user!.residenceId, active: true } });
    if (!vehicle) return res.status(404).json({ message: 'Vehículo no encontrado.' });
    return res.json(await prisma.vehiclePhoto.upsert({ where: { vehicleId: vehicle.id }, update: photoData(req.file), create: { vehicleId: vehicle.id, ...photoData(req.file) }, select: { vehicleId: true, mimeType: true, size: true } }));
  } catch (error) { return next(error); }
});

app.get('/api/vehicles/:id/photo', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
  try {
    const photo = await prisma.vehiclePhoto.findFirst({ where: { vehicleId: Number(req.params.id), vehicle: { residenceId: req.user!.residenceId, active: true } } });
    if (!photo) return res.status(404).end();
    return res.type(photo.mimeType).send(photo.data);
  } catch (error) { return next(error); }
});

app.delete('/api/vehicles/:id/photo', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/residence/logo', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const residence = await prisma.residence.findUnique({ where: { id: req.user!.residenceId }, select: { logoData: true, logoMimeType: true } });
    if (!residence?.logoData || !residence.logoMimeType) return res.status(404).end();
    res.type(residence.logoMimeType).send(residence.logoData);
  } catch (error) { return next(error); }
});

app.put('/api/residence', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), logoUpload.single('logo'), async (req: AuthenticatedRequest, res, next) => {
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
    if (user.role === UserRole.RESIDENTE) {
      if (!user.personId) return res.status(401).json({ message: 'Credenciales inválidas' });
      const person = await prisma.person.findFirst({
        where: { id: user.personId, residenceId: user.residenceId, type: PersonType.RESIDENTE, active: true },
        select: { id: true },
      });
      if (!person) return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, residenceId: user.residenceId }, jwtSecret, { expiresIn: '8h' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, residenceId: user.residenceId } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/resident/profile', requireAuth, requireResident, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.personId) return res.status(403).json({ message: 'La cuenta no está asociada a un residente.' });
    const person = await prisma.person.findFirst({
      where: { id: req.user.personId, residenceId: req.user.residenceId, type: PersonType.RESIDENTE, active: true },
      select: {
        fullName: true,
        buildingSectionType: true,
        buildingSectionNumber: true,
        apartmentNumber: true,
        residence: { select: { name: true } },
      },
    });
    if (!person) return res.status(403).json({ message: 'La cuenta no está asociada a un residente activo.' });
    return res.json({
      fullName: person.fullName,
      buildingSectionType: person.buildingSectionType,
      buildingSectionNumber: person.buildingSectionNumber,
      apartmentNumber: person.apartmentNumber,
      residenceName: person.residence.name,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/resident/deliveries', requireAuth, requireResident, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.personId) return res.status(403).json({ message: 'La cuenta no está asociada a un residente.' });
    const person = await prisma.person.findFirst({
      where: { id: req.user.personId, residenceId: req.user.residenceId, type: PersonType.RESIDENTE, active: true },
      select: { id: true },
    });
    if (!person) return res.status(403).json({ message: 'La cuenta no está asociada a un residente activo.' });
    const deliveries = await prisma.delivery.findMany({
      where: { personId: person.id, residenceId: req.user.residenceId },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        status: true,
        courier: true,
        description: true,
        trackingCode: true,
        receivedAt: true,
        deliveredAt: true,
        deliveredToName: true,
      },
    });
    return res.json(deliveries);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/dashboard', requireAuth, requireStaff, async (_req: AuthenticatedRequest, res, next) => {
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

app.get('/api/people', requireAuth, requireStaff, async (_req: AuthenticatedRequest, res, next) => {
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

app.get('/api/vehicles', requireAuth, requireStaff, async (_req: AuthenticatedRequest, res, next) => {
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

app.post('/api/vehicles', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/deliveries', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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

app.post('/api/deliveries', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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

app.put('/api/deliveries/:id/status', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/document-types', requireAuth, requireStaff, async (_req, res, next) => {
  try {
    return res.json(await prisma.documentType.findMany({ where: { active: true }, orderBy: { code: 'asc' } }));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/settings/irregular-access', requireAuth, requireStaff, async (_req: AuthenticatedRequest, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { residenceId_key: { residenceId: _req.user!.residenceId, key: 'irregular_access_mode' } } });
    return res.json({ mode: irregularAccessModeSchema.parse(setting?.value ?? 'BLOCK') });
  } catch (error) { return next(error); }
});

app.put('/api/settings/irregular-access', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/settings/access-capture', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'access_capture_mode' } } });
    return res.json({ mode: accessCaptureModeSchema.parse(setting?.value ?? 'MANUAL') });
  } catch (error) { return next(error); }
});

app.put('/api/settings/access-capture', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/settings/whatsapp', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { residenceId_key: { residenceId: req.user!.residenceId, key: 'whatsapp_phone' } },
      select: { value: true },
    });
    return res.json({ phone: setting?.value ?? '' });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/settings/whatsapp', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsedInput = whatsappPhoneSchema.safeParse(req.body);
    if (!parsedInput.success) {
      return res.status(400).json({ message: 'El número debe tener máximo 30 caracteres.' });
    }

    const phone = parsedInput.data.phone ? normalizeWhatsAppPhone(parsedInput.data.phone) : '';
    const where = { residenceId_key: { residenceId: req.user!.residenceId, key: 'whatsapp_phone' } };
    if (phone) {
      await prisma.systemSetting.upsert({
        where,
        update: { value: phone },
        create: { ...where.residenceId_key, value: phone },
      });
    } else {
      await prisma.systemSetting.deleteMany({ where: where.residenceId_key });
    }
    return res.json({ phone });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Ingresa un número móvil')) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

app.post('/api/people', requireAuth, allowRoles(UserRole.SUPER_ADMINISTRADOR, UserRole.ADMINISTRADOR), async (req: AuthenticatedRequest, res, next) => {
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

app.post('/api/access/scan', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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

app.post('/api/access', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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

app.get('/api/reports/access', requireAuth, requireStaff, async (req: AuthenticatedRequest, res, next) => {
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
