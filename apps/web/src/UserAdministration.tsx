import { FormEvent, useEffect, useState } from 'react';

type Permission = {
  key: string;
  name: string;
};

type Role = {
  id: number | null;
  key: string;
  name: string;
  active: boolean;
  system: boolean;
  assignable: boolean;
  permissions: string[];
};

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: 'SUPER_ADMINISTRADOR' | 'ADMINISTRADOR' | 'VIGILANTE' | 'RESIDENTE' | 'PERSONALIZADO';
  customRoleId: number | null;
  active: boolean;
  residenceId: number;
  customRole: { id: number; name: string; active: boolean; permissions: string[] } | null;
};

const roleLabels: Record<ManagedUser['role'], string> = {
  SUPER_ADMINISTRADOR: 'SuperAdministrador',
  ADMINISTRADOR: 'Administrador',
  VIGILANTE: 'Vigilante',
  RESIDENTE: 'Residente',
  PERSONALIZADO: 'Personalizado',
};

const permissionLabels: Record<string, string> = {
  DASHBOARD_VIEW: 'Ver tablero',
  PEOPLE_VIEW: 'Consultar personas',
  PEOPLE_MANAGE: 'Administrar personas',
  VEHICLES_VIEW: 'Consultar vehículos',
  VEHICLES_MANAGE: 'Administrar vehículos',
  ACCESS_VIEW: 'Consultar movimientos',
  ACCESS_REGISTER: 'Registrar accesos',
  DELIVERIES_VIEW: 'Consultar encomiendas',
  DELIVERIES_MANAGE: 'Administrar encomiendas',
  REPORTS_VIEW: 'Consultar reportes',
  SETTINGS_VIEW: 'Consultar configuración',
  SETTINGS_MANAGE: 'Administrar configuración',
  USERS_MANAGE: 'Administrar usuarios',
  ROLES_MANAGE: 'Administrar roles',
  RESIDENCES_MANAGE: 'Administrar residencias',
};

function headers(json = false) {
  const result = new Headers({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  if (json) result.set('Content-Type', 'application/json');
  if (localStorage.getItem('userRole') === 'SUPER_ADMINISTRADOR') {
    const residenceId = localStorage.getItem('activeResidenceId');
    if (residenceId) result.set('X-Residence-Id', residenceId);
  }
  return result;
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`http://localhost:4000${path}`, {
    ...init,
    headers: new Headers(init?.headers ?? headers()),
  });
  if (response.status === 401) window.dispatchEvent(new Event('resi-control:session-expired'));
  return response;
}

export function UserAdministration({
  canManageRoles,
  isSuperAdmin,
  currentUserId,
}: {
  canManageRoles: boolean;
  isSuperAdmin: boolean;
  currentUserId: number;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('VIGILANTE');
  const [customRoleId, setCustomRoleId] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const assignableCustomRoles = roles.filter((role) => !role.system && role.active && role.assignable && role.id !== null);
  const canAssignUserRole = roles.some((role) => role.system && role.assignable) || assignableCustomRoles.length > 0;
  const isEditingSuperAdmin = Boolean(editingUserId && users.find((user) => user.id === editingUserId)?.role === 'SUPER_ADMINISTRADOR');

  async function load() {
    const [usersResponse, rolesResponse] = await Promise.all([
      request('/api/admin/users'),
      request('/api/admin/roles'),
    ]);
    if (!usersResponse.ok) throw new Error('No se pudieron consultar los usuarios.');
    if (!rolesResponse.ok) throw new Error('No se pudieron consultar los roles.');
    const [loadedUsers, roleData] = await Promise.all([usersResponse.json(), rolesResponse.json()]);
    setUsers(loadedUsers);
    setRoles(roleData.roles);
    setPermissions(roleData.permissions.map((key: string) => ({ key, name: permissionLabels[key] ?? key })));
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo cargar la administración.'));
  }, []);

  async function submitUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const body = {
      name: userName,
      email: userEmail,
      ...(userPassword ? { password: userPassword } : {}),
      ...(isEditingSuperAdmin
        ? {}
        : {
          role: userRole,
          ...(userRole === 'PERSONALIZADO' ? { customRoleId: Number(customRoleId) } : {}),
        }),
    };
    try {
      const response = await request(`/api/admin/users${editingUserId ? `/${editingUserId}` : ''}`, {
        method: editingUserId ? 'PUT' : 'POST',
        headers: headers(true),
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar el usuario.');
      setEditingUserId(null);
      setUserName('');
      setUserEmail('');
      setUserPassword('');
      setUserRole('VIGILANTE');
      setCustomRoleId('');
      setNotice(editingUserId ? 'Usuario actualizado.' : 'Usuario creado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  }

  function editUser(user: ManagedUser) {
    setEditingUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword('');
    setUserRole(user.role);
    setCustomRoleId(user.customRoleId ? String(user.customRoleId) : '');
  }

  async function setUserActive(user: ManagedUser, active: boolean) {
    if (!active && !window.confirm(`¿Desactivar la cuenta de ${user.name}? Se conservará su historial.`)) return;
    setError('');
    setNotice('');
    try {
      const response = await request(`/api/admin/users/${user.id}/active`, {
        method: 'PATCH',
        headers: headers(true),
        body: JSON.stringify({ active }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo actualizar el estado del usuario.');
      setNotice(active ? 'Usuario reactivado.' : 'Usuario desactivado; su historial se conserva.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado del usuario.');
    }
  }

  async function submitRole(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await request(`/api/admin/roles${editingRoleId ? `/${editingRoleId}` : ''}`, {
        method: editingRoleId ? 'PUT' : 'POST',
        headers: headers(true),
        body: JSON.stringify({ name: roleName, permissions: rolePermissions }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar el rol.');
      setEditingRoleId(null);
      setRoleName('');
      setRolePermissions([]);
      setNotice(editingRoleId ? 'Rol actualizado.' : 'Rol creado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el rol.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRole(role: Role) {
    if (!role.id || !window.confirm(`¿Desactivar el rol ${role.name}?`)) return;
    setError('');
    setNotice('');
    try {
      const response = await request(`/api/admin/roles/${role.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo desactivar el rol.');
      setNotice('Rol desactivado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo desactivar el rol.');
    }
  }

  return <section className="panel vehicle-panel">
    <div className="panel-heading"><div><span className="eyebrow">ADMINISTRACIÓN</span><h2>Usuarios y roles</h2></div></div>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    <div className="delivery-filters">
      <button type="button" className={tab === 'users' ? 'active-nav' : 'secondary'} onClick={() => setTab('users')}>Usuarios</button>
      {canManageRoles && <button type="button" className={tab === 'roles' ? 'active-nav' : 'secondary'} onClick={() => setTab('roles')}>Roles</button>}
    </div>
    {tab === 'users' && <>
      {(canAssignUserRole || editingUserId) ? <form className="form-grid admin-user-form" onSubmit={submitUser}>
        <label>Nombre<input required minLength={2} maxLength={120} value={userName} onChange={(event) => setUserName(event.target.value)} /></label>
        <label>Correo<input required type="email" maxLength={254} value={userEmail} onChange={(event) => setUserEmail(event.target.value)} /></label>
        <label>Contraseña{editingUserId && ' nueva'}<input required={!editingUserId} type="password" minLength={12} maxLength={128} autoComplete="new-password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} placeholder={editingUserId ? 'Dejar vacía para conservarla' : 'Mínimo 12 caracteres'} /></label>
        {!isEditingSuperAdmin && <label>Rol<select value={userRole} onChange={(event) => { setUserRole(event.target.value); setCustomRoleId(''); }}>{isSuperAdmin && <option value="SUPER_ADMINISTRADOR">SuperAdministrador</option>}{roles.filter((role) => role.system && role.assignable).map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}{roles.some((role) => !role.system && role.active && role.assignable) && <option value="PERSONALIZADO">Personalizado</option>}</select></label>}
        {userRole === 'PERSONALIZADO' && <label>Rol personalizado<select required value={customRoleId} onChange={(event) => setCustomRoleId(event.target.value)}><option value="">Selecciona un rol</option>{assignableCustomRoles.map((role) => <option key={role.id} value={role.id!}>{role.name}</option>)}</select></label>}
        <div className="form-full admin-form-actions"><button disabled={saving}>{saving ? 'Guardando...' : editingUserId ? 'Guardar cambios' : 'Crear usuario'}</button>{editingUserId && <button type="button" className="secondary" onClick={() => { setEditingUserId(null); setUserName(''); setUserEmail(''); setUserPassword(''); setUserRole('VIGILANTE'); setCustomRoleId(''); }}>Cancelar edición</button>}<small>Las cuentas de residente se activan por invitación y no se crean manualmente aquí.</small></div>
      </form> : <div className="empty">No tienes un rol con permisos que puedas asignar. Puedes administrar las cuentas listadas abajo.</div>}
      <div className="table admin-user-table">
        <div className="row admin-user-row heading"><span>Usuario</span><span>Rol</span><span>Estado</span><span>Acciones</span></div>
        {users.map((user) => <div className="row admin-user-row" key={user.id}>
          <span><strong>{user.name}</strong><small>{user.email}</small></span>
          <span>{user.customRole?.name ?? roleLabels[user.role]}</span>
          <span>{user.active ? 'Activo' : 'Inactivo'}</span>
          <span className="admin-actions">{(user.role !== 'SUPER_ADMINISTRADOR' || isSuperAdmin) && <button type="button" className="small-button" onClick={() => editUser(user)}>Editar</button>}{(user.role !== 'SUPER_ADMINISTRADOR' || isSuperAdmin) && user.id !== currentUserId && <button type="button" className="small-button secondary" onClick={() => void setUserActive(user, !user.active)}>{user.active ? 'Desactivar' : 'Reactivar'}</button>}</span>
        </div>)}
      </div>
    </>}
    {tab === 'roles' && canManageRoles && <>
      <form className="form-grid" onSubmit={submitRole}>
        <label>Nombre del rol<input required minLength={2} maxLength={60} value={roleName} onChange={(event) => setRoleName(event.target.value)} /></label>
        <fieldset className="form-full permission-list"><legend>Permisos</legend><div className="permission-grid">{permissions.map((permission) => <label key={permission.key}><input type="checkbox" checked={rolePermissions.includes(permission.key)} onChange={(event) => setRolePermissions((current) => event.target.checked ? [...current, permission.key] : current.filter((value) => value !== permission.key))} />{permission.name}</label>)}</div></fieldset>
        <div className="form-full admin-form-actions"><button disabled={saving}>{saving ? 'Guardando...' : editingRoleId ? 'Guardar rol' : 'Crear rol'}</button>{editingRoleId && <button type="button" className="secondary" onClick={() => { setEditingRoleId(null); setRoleName(''); setRolePermissions([]); }}>Cancelar edición</button>}</div>
      </form>
      <div className="table admin-role-table">
        <div className="row admin-role-row heading"><span>Rol</span><span>Permisos</span><span>Estado</span><span>Acciones</span></div>
        {roles.map((role) => <div className="row admin-role-row" key={role.key}>
          <strong>{role.name}{role.system && <small> · Del sistema</small>}</strong>
          <span>{role.permissions.map((permission) => permissionLabels[permission] ?? permission).join(', ') || 'Sin permisos'}</span>
          <span>{role.active ? 'Activo' : 'Inactivo'}</span>
          <span className="admin-actions">{!role.system && role.active && role.id !== null && <><button type="button" className="small-button" onClick={() => { setEditingRoleId(role.id); setRoleName(role.name); setRolePermissions(role.permissions); }}>Editar</button><button type="button" className="small-button secondary" onClick={() => void deactivateRole(role)}>Desactivar</button></>}</span>
        </div>)}
      </div>
    </>}
  </section>;
}
