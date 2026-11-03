import { UserRole } from '@prisma/client';

export const permissions = [
  'DASHBOARD_VIEW',
  'PEOPLE_VIEW',
  'PEOPLE_MANAGE',
  'VEHICLES_VIEW',
  'VEHICLES_MANAGE',
  'ACCESS_VIEW',
  'ACCESS_REGISTER',
  'DELIVERIES_VIEW',
  'DELIVERIES_MANAGE',
  'REPORTS_VIEW',
  'SETTINGS_VIEW',
  'SETTINGS_MANAGE',
  'USERS_MANAGE',
  'ROLES_MANAGE',
  'RESIDENCES_MANAGE',
] as const;

export type Permission = typeof permissions[number];
const permissionSet: ReadonlySet<string> = new Set(permissions);

const administratorPermissions: Permission[] = [...permissions].filter((permission) => permission !== 'RESIDENCES_MANAGE');

const rolePermissions: Partial<Record<UserRole, Permission[]>> = {
  [UserRole.ADMINISTRADOR]: administratorPermissions,
  [UserRole.VIGILANTE]: [
    'DASHBOARD_VIEW',
    'PEOPLE_VIEW',
    'VEHICLES_VIEW',
    'ACCESS_VIEW',
    'ACCESS_REGISTER',
    'DELIVERIES_VIEW',
    'DELIVERIES_MANAGE',
    'REPORTS_VIEW',
    'SETTINGS_VIEW',
  ],
  [UserRole.RESIDENTE]: [],
  [UserRole.PERSONALIZADO]: [],
};

export function permissionsForRole(role: UserRole, customPermissions: string[] = []): Permission[] {
  if (role === UserRole.SUPER_ADMINISTRADOR) return [...permissions];
  if (role === UserRole.PERSONALIZADO) {
    return customPermissions.filter((permission): permission is Permission => permissionSet.has(permission) && permission !== 'RESIDENCES_MANAGE');
  }
  return rolePermissions[role] ?? [];
}
