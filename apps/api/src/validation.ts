import { AccessType, BuildingSectionType, DeliveryStatus, DeliveryType, PersonType, VehicleType } from '@prisma/client';
import { z } from 'zod';

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
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

export function normalizeDocumentNumber(documentNumber: string) {
  return documentNumber.replace(/[\s.-]/g, '').toUpperCase();
}
