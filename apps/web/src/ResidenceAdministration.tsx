import { FormEvent, useEffect, useState } from 'react';
import { apiBaseUrl } from './api';

type Residence = { id: number; name: string; code: string; active: boolean };

function headers(json = false) {
  const result = new Headers({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  if (json) result.set('Content-Type', 'application/json');
  return result;
}

export function ResidenceAdministration({ onCreated }: { onCreated: (residence: Residence) => void }) {
  const [residences, setResidences] = useState<Residence[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch(`${apiBaseUrl}/api/admin/residences`, { headers: headers() });
    if (!response.ok) throw new Error('No se pudieron consultar las residencias.');
    setResidences(await response.json());
  }

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las residencias.'));
  }, []);

  async function createResidence(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/admin/residences`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ name, code }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo crear la residencia.');
      setName('');
      setCode('');
      setNotice('Residencia creada correctamente.');
      onCreated(data);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo crear la residencia.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel">
    <div className="panel-heading"><div><span className="eyebrow">SUPERADMINISTRADOR</span><h2>Administrar residencias</h2></div></div>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    <form className="form-grid" onSubmit={createResidence}>
      <label>Nombre de la residencia<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Residencial Los Álamos" /></label>
      <label>Código interno<input required minLength={2} maxLength={40} pattern="[A-Z0-9][A-Z0-9_-]*" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="RESI-ALAMOS" /><small>Usa mayúsculas, números, guiones o guiones bajos.</small></label>
      <div className="form-full"><button disabled={saving}>{saving ? 'Creando...' : 'Crear residencia'}</button></div>
    </form>
    <div className="table admin-user-table">
      <div className="row admin-user-row heading"><span>Residencia</span><span>Código</span><span>Estado</span></div>
      {residences.map((residence) => <div className="row admin-user-row" key={residence.id}><strong>{residence.name}</strong><span>{residence.code}</span><span>{residence.active ? 'Activa' : 'Inactiva'}</span></div>)}
    </div>
  </section>;
}
