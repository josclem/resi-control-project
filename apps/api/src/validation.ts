import { AccessType, BuildingSectionType, DeliveryStatus, DeliveryType, PersonType, VehicleType } from '@prisma/client';
import { z } from 'zod';

export const loginSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), password: z.string().min(1) });
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
export const personSchema = z.object({
  type: z.nativeEnum(PersonType),
  fullName: z.string().trim().min(2),
  buildingSectionType: z.nativeEnum(BuildingSectionType),
  buildingSectionNumber: z.string().trim().min(1).max(30),
  apartmentNumber: z.string().trim().min(1),
  documentTypeId: z.number().int().positive().optional(),
  documentNumber: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
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
export const whatsappPhoneSchema = z.object({
  phone: z.string().trim().max(30),
});
export const residentInvitationSchema = z.object({
  personId: z.number().int().positive(),
  whatsappOptInConfirmed: z.boolean(),
});
export const residentActivationSchema = z.object({
  code: z.string().regex(/^\d{6}$/).optional(),
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  consentToWhatsapp: z.boolean(),
}).superRefine((value, context) => {
  if (Boolean(value.code) === Boolean(value.token)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: 'Ingresa un código o un enlace de activación válido.' });
  }
  if (value.code && !value.phone) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'El número que recibió el código es obligatorio.' });
  }
});
export const residentNotificationConsentSchema = z.object({
  consented: z.boolean(),
});
export const supervisorSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const residenceSchema = z.object({ name: z.string().trim().min(2).max(120) });
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

export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^3\d{9}$/.test(national)) {
    throw new Error('Ingresa un número móvil colombiano válido de 10 dígitos.');
  }
  return `+57${national}`;
}

export function normalizeWhatsAppBusinessPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (/^3\d{9}$/.test(digits)) return `+57${digits}`;
  if (/^57\d{10}$/.test(digits) && digits[2] === '3') return `+${digits}`;
  if ((phone.trim().startsWith('+') || digits.length !== 10) && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  throw new Error('Ingresa un número de WhatsApp válido en formato internacional.');
}

export function normalizeDocumentNumber(documentNumber: string) {
  return documentNumber.replace(/[\s.-]/g, '').toUpperCase();
}
