import { AccessType, DeliveryStatus, PersonType, BuildingSectionType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  accessSchema,
  deliveryStatusSchema,
  formatPhone,
  normalizeWhatsAppPhone,
  normalizeDocumentNumber,
  personSchema,
} from '../../src/validation.js';

describe('validación de reglas de dominio', () => {
  it('acepta accesos con identificadores válidos y rechaza valores inválidos', () => {
    expect(accessSchema.safeParse({ personId: 1, accessType: AccessType.ENTRADA }).success).toBe(true);
    expect(accessSchema.safeParse({ personId: 0, accessType: AccessType.ENTRADA }).success).toBe(false);
  });

  it('exige el nombre de quien recibe una encomienda entregada', () => {
    expect(deliveryStatusSchema.safeParse({ status: DeliveryStatus.ENTREGADA }).success).toBe(false);
    expect(deliveryStatusSchema.safeParse({ status: DeliveryStatus.ENTREGADA, deliveredToName: '  Ana  ' })).toMatchObject({
      success: true,
      data: { deliveredToName: 'Ana' },
    });
    expect(deliveryStatusSchema.safeParse({ status: DeliveryStatus.DEVUELTA }).success).toBe(true);
  });

  it('exige que tipo y número de documento se informen juntos', () => {
    const person = {
      type: PersonType.RESIDENTE,
      fullName: 'Ana Pérez',
      buildingSectionType: BuildingSectionType.TORRE,
      buildingSectionNumber: '1',
      apartmentNumber: '101',
    };

    expect(personSchema.safeParse({ ...person, documentNumber: '123' }).success).toBe(false);
    expect(personSchema.safeParse({ ...person, documentTypeId: 1 }).success).toBe(false);
    expect(personSchema.safeParse({ ...person, documentTypeId: 1, documentNumber: '123' }).success).toBe(true);
  });

  it('normaliza teléfonos colombianos y rechaza longitudes inválidas', () => {
    expect(formatPhone('+57 300-123-4567')).toBe('(+57) 300 123 4567');
    expect(() => formatPhone('123')).toThrow('El teléfono debe tener 10 dígitos para Colombia.');
  });

  it('normaliza números móviles colombianos para WhatsApp', () => {
    expect(normalizeWhatsAppPhone('300 123 4567')).toBe('+573001234567');
    expect(normalizeWhatsAppPhone('+57 300-123-4567')).toBe('+573001234567');
    expect(() => normalizeWhatsAppPhone('1234567890')).toThrow('Ingresa un número móvil colombiano válido de 10 dígitos.');
  });

  it('normaliza números de documento', () => {
    expect(normalizeDocumentNumber(' ab-123. 45 ')).toBe('AB12345');
  });
});
