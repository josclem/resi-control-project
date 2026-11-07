import { AccessType, BuildingSectionType, DeliveryStatus, DeliveryType, PersonType, VehicleType } from '@prisma/client';
import { z } from 'zod';
import { permissions } from './permissions.js';

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});
export const passwordResetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(128),
});
export const residentInvitationSchema = z.object({
  personId: z.number().int().positive(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});
export const residentInvitationAcceptanceSchema = z.object({
  token: z.string().min(40).max(200),
  password: z.string().min(12).max(128),
});
export const residentCommunicationResidentFilterSchema = z.object({
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).default('ALL'),
  search: z.string().trim().max(120).optional(),
  buildingSectionType: z.nativeEnum(BuildingSectionType).optional(),
  buildingSectionNumber: z.string().trim().max(30).optional(),
  apartmentNumber: z.string().trim().max(30).optional(),
});
export const residentEmailConsentSchema = z.object({
  consented: z.boolean(),
  reasonCode: z.string().trim().min(1).max(60).optional(),
}).superRefine((value, context) => {
  if (value.consented && !value.reasonCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonCode'], message: 'Selecciona una razón de autorización.' });
  }
});
export const residentCommunicationCreateSchema = z.object({
  type: z.enum(['ADMINISTRATIVE', 'PROMOTIONAL']),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  audienceStatus: z.enum(['ALL', 'ACTIVE', 'INACTIVE']),
  selectAll: z.boolean(),
  personIds: z.array(z.number().int().positive()).default([]),
  search: z.string().trim().max(120).optional(),
  buildingSectionType: z.nativeEnum(BuildingSectionType).optional(),
  buildingSectionNumber: z.string().trim().max(30).optional(),
  apartmentNumber: z.string().trim().max(30).optional(),
}).superRefine((value, context) => {
  if (!value.selectAll && value.personIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['personIds'], message: 'Selecciona al menos un residente.' });
  }
});
export const residentEmailUnsubscribeSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const accessSchema = z.object({
  personId: z.number().int().positive(),
  vehicleId: z.number().int().positive().optional(),
  accessType: z.nativeEnum(AccessType),
});
export const accessScanSchema = z.object({ code: z.string().trim().min(1) });
export const deliveryCreateSchema = z.object({
  personId: z.number().int().positive(),
  type: z.nativeEnum(DeliveryType),
  courier: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  trackingCode: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});
export const deliveryStatusSchema = z.object({
  status: z.nativeEnum(DeliveryStatus),
  deliveredToName: z.string().trim().max(120).optional(),
}).superRefine((value, context) => {
  if (value.status === DeliveryStatus.ENTREGADA && !value.deliveredToName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveredToName'], message: 'El nombre de quien recibe la encomienda es obligatorio.' });
  }
});
export const deliveryStatusFilterSchema = z.nativeEnum(DeliveryStatus);
const visitWindowBaseSchema = z.object({
  visitorName: z.string().trim().min(2).max(120),
  visitorDocumentNumber: z.string().trim().max(40).optional(),
  observations: z.string().trim().max(500).optional(),
  vehiclePlate: z.string().trim().max(10).optional(),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
});
function validateVisitWindow(value: z.infer<typeof visitWindowBaseSchema>, context: z.RefinementCtx) {
  if (new Date(value.validUntil) <= new Date(value.validFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'La vigencia debe terminar después de su inicio.' });
  }
  if (Boolean(value.vehiclePlate) !== Boolean(value.vehicleType)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleType'], message: 'Indica la placa y el tipo de vehículo, o deja ambos vacíos.' });
  }
}
export const residentVisitCreateSchema = visitWindowBaseSchema.superRefine(validateVisitWindow);
export const porterVisitCreateSchema = visitWindowBaseSchema.extend({
  residentPersonId: z.number().int().positive(),
  residentApprovalConfirmed: z.literal(true),
}).superRefine(validateVisitWindow);
export const personSchema = z.object({
  type: z.nativeEnum(PersonType),
  fullName: z.string().trim().min(2),
  buildingSectionType: z.nativeEnum(BuildingSectionType),
  buildingSectionNumber: z.string().trim().min(1).max(30),
  apartmentNumber: z.string().trim().min(1),
  documentTypeId: z.number().int().positive().optional(),
  documentNumber: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).nullable().optional(),
  biometricRef: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.documentNumber && !value.documentTypeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentTypeId'], message: 'El tipo de documento es obligatorio.' });
  }
  if (value.documentTypeId && !value.documentNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentNumber'], message: 'El número de documento es obligatorio.' });
  }
});
export const irregularAccessModeSchema = z.enum(['BLOCK', 'SUPERVISOR']);
export const accessCaptureModeSchema = z.enum(['MANUAL', 'BARCODE', 'QR', 'FINGERPRINT']);
export const supervisorSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const residenceSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const residenceCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'El código solo puede contener letras mayúsculas, números, guiones y guiones bajos.'),
});
const userRoleSchema = z.enum(['SUPER_ADMINISTRADOR', 'ADMINISTRADOR', 'VIGILANTE', 'PERSONALIZADO']);
const rolePermissionsSchema = z.array(z.enum(permissions)).max(permissions.length).refine(
  (values) => new Set(values).size === values.length,
  'No se pueden repetir permisos.',
);
export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: userRoleSchema,
  customRoleId: z.number().int().positive().optional(),
  residenceId: z.number().int().positive().optional(),
}).superRefine((value, context) => {
  if ((value.role === 'PERSONALIZADO') !== Boolean(value.customRoleId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customRoleId'], message: 'Selecciona un rol personalizado válido.' });
  }
});
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(12).max(128).optional(),
  role: userRoleSchema.optional(),
  customRoleId: z.number().int().positive().nullable().optional(),
}).superRefine((value, context) => {
  if (Object.keys(value).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Indica al menos un campo para actualizar.' });
  if (value.role === 'PERSONALIZADO' && !value.customRoleId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customRoleId'], message: 'Selecciona un rol personalizado válido.' });
  }
  if (value.role && value.role !== 'PERSONALIZADO' && value.customRoleId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customRoleId'], message: 'Los roles predefinidos no usan un rol personalizado.' });
  }
});
export const customRoleCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  permissions: rolePermissionsSchema,
  residenceId: z.number().int().positive().optional(),
});
export const customRoleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  permissions: rolePermissionsSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, 'Indica al menos un campo para actualizar.');
export const vehicleSchema = z.object({
  plate: z.string().trim().min(5).max(10),
  type: z.nativeEnum(VehicleType),
  personId: z.number().int().positive(),
  brand: z.string().trim().max(50).optional(),
  model: z.string().trim().max(50).optional(),
  color: z.string().trim().max(30).optional(),
});

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits;
  if (national.length !== 10) throw new Error('El teléfono debe tener 10 dígitos para Colombia.');
  return `(+57) ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

export function normalizeDocumentNumber(documentNumber: string) {
  return documentNumber.replace(/[\s.-]/g, '').toUpperCase();
}
