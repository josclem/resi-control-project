import { AccessType, DeliveryStatus, PersonType, BuildingSectionType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  accessSchema,
  deliveryStatusSchema,
  formatPhone,
  normalizeDocumentNumber,
  personSchema,
  porterVisitCreateSchema,
  residentVisitCreateSchema,
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

  it('normaliza el correo de la persona y valida el formato', () => {
    const person = {
      type: PersonType.RESIDENTE,
      fullName: 'Ana Pérez',
      buildingSectionType: BuildingSectionType.TORRE,
      buildingSectionNumber: '1',
      apartmentNumber: '101',
    };

    expect(personSchema.parse({ ...person, email: '  ANA@example.com ' }).email).toBe('ana@example.com');
    expect(personSchema.safeParse({ ...person, email: 'correo-invalido' }).success).toBe(false);
    expect(personSchema.parse(person).email).toBeUndefined();
  });

  it('valida la vigencia, vehículo y confirmación de autorización de visitas', () => {
    const visit = {
      visitorName: 'Visita de prueba',
      validFrom: '2026-11-04T10:00:00-05:00',
      validUntil: '2026-11-05T10:00:00-05:00',
    };
    expect(residentVisitCreateSchema.safeParse(visit).success).toBe(true);
    expect(residentVisitCreateSchema.parse({ ...visit, observations: '  Llegará con equipaje  ' }).observations).toBe('Llegará con equipaje');
    expect(residentVisitCreateSchema.safeParse({ ...visit, observations: 'a'.repeat(501) }).success).toBe(false);
    expect(residentVisitCreateSchema.safeParse({ ...visit, validUntil: visit.validFrom }).success).toBe(false);
    expect(residentVisitCreateSchema.safeParse({ ...visit, vehiclePlate: 'ABC123' }).success).toBe(false);
    expect(porterVisitCreateSchema.safeParse({
      ...visit,
      residentPersonId: 1,
      residentApprovalConfirmed: false,
    }).success).toBe(false);
  });

  it('normaliza teléfonos colombianos y rechaza longitudes inválidas', () => {
    expect(formatPhone('+57 300-123-4567')).toBe('(+57) 300 123 4567');
    expect(() => formatPhone('123')).toThrow('El teléfono debe tener 10 dígitos para Colombia.');
  });

  it('normaliza números de documento', () => {
    expect(normalizeDocumentNumber(' ab-123. 45 ')).toBe('AB12345');
  });
});
