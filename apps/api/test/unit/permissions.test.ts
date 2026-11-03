import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { permissions, permissionsForRole } from '../../src/permissions.js';

describe('permisos por rol', () => {
  it('otorga permisos globales al SuperAdministrador y excluye la administración global a Administrador', () => {
    expect(permissionsForRole(UserRole.SUPER_ADMINISTRADOR)).toEqual([...permissions]);
    expect(permissionsForRole(UserRole.ADMINISTRADOR)).toContain('USERS_MANAGE');
    expect(permissionsForRole(UserRole.ADMINISTRADOR)).not.toContain('RESIDENCES_MANAGE');
  });

  it('limita roles personalizados a permisos locales válidos', () => {
    expect(permissionsForRole(UserRole.PERSONALIZADO, ['PEOPLE_VIEW', 'UNKNOWN', 'RESIDENCES_MANAGE']))
      .toEqual(['PEOPLE_VIEW']);
  });
});
