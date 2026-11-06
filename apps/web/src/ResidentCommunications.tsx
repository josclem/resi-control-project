import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiBaseUrl } from './api';

type Resident = {
  id: number;
  fullName: string;
  documentNumber: string | null;
  email: string | null;
  active: boolean;
  buildingSectionType: 'TORRE' | 'INTERIOR' | null;
  buildingSectionNumber: string | null;
  apartmentNumber: string;
  promotionalEmailConsentAt: string | null;
  promotionalEmailConsentSource: string | null;
  promotionalEmailConsentEmail: string | null;
  promotionalEmailUnsubscribedAt: string | null;
};

type Communication = {
  id: number;
  type: 'ADMINISTRATIVE' | 'PROMOTIONAL';
  subject: string;
  body: string;
  status: 'SENDING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  audienceStatus: 'ALL' | 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  createdBy: { name: string };
  recipients: {
    email: string;
    residentNames: string[];
    status: 'PENDING' | 'SENT' | 'FAILED';
    error: string | null;
    sentAt: string | null;
  }[];
};

type CommunicationStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type MessageType = 'ADMINISTRATIVE' | 'PROMOTIONAL';
type AuthorizationReason = { code: string; description: string };

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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: new Headers(init?.headers ?? headers()),
  });
  if (response.status === 401) window.dispatchEvent(new Event('accivia:session-expired'));
  return response;
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase();
}

function hasPromotionalConsent(resident: Resident) {
  return Boolean(
    resident.promotionalEmailConsentAt
    && !resident.promotionalEmailUnsubscribedAt
    && resident.promotionalEmailConsentEmail?.trim().toLowerCase() === resident.email?.trim().toLowerCase(),
  );
}

const communicationStatusLabels: Record<Communication['status'], string> = {
  SENDING: 'Enviando',
  COMPLETED: 'Completado',
  PARTIAL: 'Completado con fallos',
  FAILED: 'Fallido',
};

export function ResidentCommunications() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [history, setHistory] = useState<Communication[]>([]);
  const [audienceStatus, setAudienceStatus] = useState<CommunicationStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sectionType, setSectionType] = useState<'' | 'TORRE' | 'INTERIOR'>('');
  const [sectionNumber, setSectionNumber] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('ADMINISTRATIVE');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [consentTarget, setConsentTarget] = useState<{ resident: Resident; consented: boolean } | null>(null);
  const [consentSource, setConsentSource] = useState('');
  const [authorizationReasons, setAuthorizationReasons] = useState<AuthorizationReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadResidents() {
    const response = await request(`/api/admin/communications/residents?status=${audienceStatus}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'No se pudieron consultar los residentes.');
    setResidents(data);
  }

  async function loadHistory() {
    const response = await request('/api/admin/communications');
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'No se pudo consultar el historial de comunicados.');
    setHistory(data);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadResidents(), loadHistory(), loadAuthorizationReasons()])
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los comunicados.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [audienceStatus]);

  async function loadAuthorizationReasons() {
    const response = await request('/api/admin/communications/authorization-reasons');
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? 'No se pudieron cargar las razones de autorización.');
    setAuthorizationReasons(data);
  }

  const visibleResidents = useMemo(() => {
    const query = normalizeSearch(search.trim());
    const sectionQuery = normalizeSearch(sectionNumber.trim());
    const apartmentQuery = normalizeSearch(apartmentNumber.trim());
    return residents.filter((resident) => {
      const matchesQuery = !query || normalizeSearch([
        resident.fullName,
        resident.documentNumber ?? '',
        resident.email ?? '',
        resident.buildingSectionNumber ?? '',
        resident.apartmentNumber,
      ].join(' ')).includes(query);
      const matchesSectionType = !sectionType || resident.buildingSectionType === sectionType;
      const matchesSectionNumber = !sectionQuery || normalizeSearch(resident.buildingSectionNumber ?? '').includes(sectionQuery);
      const matchesApartment = !apartmentQuery || normalizeSearch(resident.apartmentNumber).includes(apartmentQuery);
      return matchesQuery && matchesSectionType && matchesSectionNumber && matchesApartment;
    });
  }, [residents, search, sectionType, sectionNumber, apartmentNumber]);

  const selectedResidents = visibleResidents.filter((resident) => selectAll || selectedIds.includes(resident.id));
  const eligibleSelected = messageType === 'PROMOTIONAL'
    ? selectedResidents.filter(hasPromotionalConsent)
    : selectedResidents;
  const excludedWithoutConsent = selectedResidents.length - eligibleSelected.length;

  function resetSelection() {
    setSelectedIds([]);
    setSelectAll(false);
  }

  function selectVisible() {
    setSelectAll(false);
    setSelectedIds(visibleResidents.map(({ id }) => id));
  }

  function toggleResident(id: number) {
    setSelectAll(false);
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function updateConsent(event: FormEvent) {
    event.preventDefault();
    if (!consentTarget) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await request(`/api/admin/communications/residents/${consentTarget.resident.id}/promotional-consent`, {
        method: 'PUT',
        headers: headers(true),
        body: JSON.stringify({ consented: consentTarget.consented, reasonCode: consentSource || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar la autorización.');
      await loadResidents();
      setConsentTarget(null);
      setConsentSource('');
      setNotice(consentTarget.consented ? 'Autorización promocional registrada.' : 'Autorización promocional retirada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la autorización.');
    } finally {
      setSaving(false);
    }
  }

  function sendCommunication(event: FormEvent) {
    event.preventDefault();
    if (!eligibleSelected.length) {
      setError(messageType === 'PROMOTIONAL'
        ? 'Selecciona residentes con autorización promocional vigente.'
        : 'Selecciona al menos un residente con correo.');
      return;
    }
    setSendConfirmationOpen(true);
  }

  async function confirmSendCommunication() {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await request('/api/admin/communications', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          type: messageType,
          subject,
          body,
          audienceStatus,
          selectAll,
          personIds: selectAll ? [] : eligibleSelected.map(({ id }) => id),
          search: search.trim() || undefined,
          buildingSectionType: sectionType || undefined,
          buildingSectionNumber: sectionNumber.trim() || undefined,
          apartmentNumber: apartmentNumber.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo enviar el comunicado.');
      const { sent, failed, excludedWithoutConsent: excluded = 0 } = data.counts;
      setNotice(`Envío terminado: ${sent} enviado(s), ${failed} fallido(s)${excluded ? ` y ${excluded} excluido(s) por falta de autorización` : ''}.`);
      setSubject('');
      setBody('');
      resetSelection();
      setSendConfirmationOpen(false);
      await loadHistory();
    } catch (reason) {
      setSendConfirmationOpen(false);
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar el comunicado.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel resident-communications">
    <div className="panel-heading"><div><span className="eyebrow">COMUNICACIONES</span><h2>Mensajes por correo</h2></div></div>
    <p>Envía avisos o promociones a residentes con correo registrado, tengan o no una cuenta del portal. Cada destinatario recibe un correo individual.</p>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    <form className="form-grid communication-form" onSubmit={sendCommunication}>
      <label>Tipo de mensaje<select value={messageType} onChange={(event) => { setMessageType(event.target.value as MessageType); resetSelection(); }}>
        <option value="ADMINISTRATIVE">Aviso administrativo</option>
        <option value="PROMOTIONAL">Promoción (requiere autorización vigente)</option>
      </select></label>
      <label>Destinatarios<select value={audienceStatus} onChange={(event) => { setAudienceStatus(event.target.value as CommunicationStatusFilter); resetSelection(); }}>
        <option value="ALL">Todos (activos e inactivos)</option>
        <option value="ACTIVE">Solo residentes activos</option>
        <option value="INACTIVE">Solo residentes inactivos</option>
      </select></label>
      <label>Buscar por nombre, documento, correo o apartamento<input value={search} onChange={(event) => { setSearch(event.target.value); resetSelection(); }} placeholder="Ej. Ana Pérez, 123456, correo o 301" /></label>
      <label>Tipo de sector<select value={sectionType} onChange={(event) => { setSectionType(event.target.value as '' | 'TORRE' | 'INTERIOR'); resetSelection(); }}>
        <option value="">Todas las torres e interiores</option>
        <option value="TORRE">Torre</option>
        <option value="INTERIOR">Interior</option>
      </select></label>
      <label>Número de torre/interior<input value={sectionNumber} onChange={(event) => { setSectionNumber(event.target.value); resetSelection(); }} /></label>
      <label>Apartamento<input value={apartmentNumber} onChange={(event) => { setApartmentNumber(event.target.value); resetSelection(); }} /></label>
      <div className="communication-selection form-full">
        <strong>{visibleResidents.length} residente(s) con correo en este filtro</strong>
        <div className="panel-actions">
          <button type="button" className="secondary" onClick={() => { setSelectAll(true); setSelectedIds([]); }}>Seleccionar todos los resultados</button>
          <button type="button" className="secondary" onClick={selectVisible}>Seleccionar visibles</button>
          <button type="button" className="secondary" onClick={resetSelection}>Limpiar selección</button>
        </div>
        <div className="communication-resident-list">
          {loading ? <div className="empty">Cargando residentes…</div> : visibleResidents.length ? visibleResidents.map((resident) => {
            const consented = hasPromotionalConsent(resident);
            return <label className="communication-resident" key={resident.id}>
              <input
                type="checkbox"
                checked={selectAll || selectedIds.includes(resident.id)}
                onChange={() => toggleResident(resident.id)}
                disabled={messageType === 'PROMOTIONAL' && !consented}
              />
              <span><strong>{resident.fullName}</strong><small>{resident.documentNumber ? `Doc. ${resident.documentNumber} · ` : ''}{resident.buildingSectionType === 'TORRE' ? 'Torre' : resident.buildingSectionType === 'INTERIOR' ? 'Interior' : 'Sector'} {resident.buildingSectionNumber ?? '—'} · Apto. {resident.apartmentNumber}</small><small>{resident.email}</small></span>
              <span className={resident.active ? 'communication-active' : 'communication-inactive'}>{resident.active ? 'Activo' : 'Inactivo'}</span>
              {consented ? <span className="communication-consent">Autorizó promociones</span> : <span className="communication-no-consent">Sin autorización</span>}
              <span className="communication-consent-actions">
                <button type="button" className="small-button secondary" onClick={(event) => { event.preventDefault(); setConsentTarget({ resident, consented: true }); setConsentSource(''); }}>{consented ? 'Actualizar autorización' : 'Registrar autorización'}</button>
                {consented && <button type="button" className="small-button secondary" onClick={(event) => { event.preventDefault(); setConsentTarget({ resident, consented: false }); setConsentSource(''); }}>Retirar</button>}
              </span>
            </label>;
          }) : <div className="empty">No hay residentes con correo que coincidan con el filtro.</div>}
        </div>
        <small>Seleccionados: {selectedResidents.length}. Elegibles para este mensaje: {eligibleSelected.length}{excludedWithoutConsent ? ` · Excluidos por falta de autorización: ${excludedWithoutConsent}` : ''}</small>
      </div>
      <label className="form-full">Asunto<input required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="form-full">Mensaje<textarea required rows={7} maxLength={10_000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escribe el mensaje para los residentes" /></label>
      {messageType === 'PROMOTIONAL' && <p className="form-full">El correo incluirá un enlace para darse de baja. Se enviará únicamente a direcciones con autorización registrada por administración.</p>}
      <button type="submit" disabled={saving || loading || !eligibleSelected.length}>{saving ? 'Enviando…' : `Enviar a ${eligibleSelected.length} destinatario(s)`}</button>
    </form>

    {sendConfirmationOpen && <div
      className="modal-backdrop"
      onClick={() => { if (!saving) setSendConfirmationOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) setSendConfirmationOpen(false);
      }}
    >
      <section
        className="form-panel modal-panel communication-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="communication-confirmation-title"
        aria-describedby="communication-confirmation-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div><span className="eyebrow">CONFIRMACIÓN</span><h2 id="communication-confirmation-title">Enviar comunicado</h2></div>
        </div>
        <p id="communication-confirmation-description">¿Enviar <strong>“{subject}”</strong> a <strong>{eligibleSelected.length}</strong> direcciones de correo?</p>
        {excludedWithoutConsent > 0 && <p className="communication-confirmation-warning">Se excluirán {excludedWithoutConsent} residentes sin autorización promocional vigente.</p>}
        <div className="communication-confirmation-actions">
          <button type="button" className="secondary" autoFocus disabled={saving} onClick={() => setSendConfirmationOpen(false)}>Cancelar</button>
          <button type="button" disabled={saving} onClick={() => void confirmSendCommunication()}>{saving ? 'Enviando…' : 'Confirmar envío'}</button>
        </div>
      </section>
    </div>}

    <div className="panel-heading communication-history-heading"><div><span className="eyebrow">HISTORIAL</span><h3>Últimos comunicados</h3></div></div>
    {history.length ? <div className="communication-history">{history.map((item) => {
      const sent = item.recipients.filter((recipient) => recipient.status === 'SENT').length;
      const failed = item.recipients.filter((recipient) => recipient.status === 'FAILED').length;
      return <details className="communication-history-item" key={item.id}>
        <summary><strong>{item.subject}</strong><span>{item.type === 'PROMOTIONAL' ? 'Promoción' : 'Aviso'}</span><span>{communicationStatusLabels[item.status]}</span><span>{sent} enviados · {failed} fallidos</span><time>{new Date(item.createdAt).toLocaleString()}</time></summary>
        <p>{item.body}</p>
        <ul>{item.recipients.map((recipient) => <li key={recipient.email}><strong>{recipient.email}</strong> · {recipient.residentNames.join(', ')} · {recipient.status === 'SENT' ? 'Enviado' : recipient.status === 'FAILED' ? `Falló: ${recipient.error ?? 'error SMTP'}` : 'Pendiente'}</li>)}</ul>
      </details>;
    })}</div> : <div className="empty">Todavía no hay comunicados enviados.</div>}

    {consentTarget && <div className="modal-backdrop" onClick={() => setConsentTarget(null)}>
      <section className="form-panel modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading"><div><span className="eyebrow">AUTORIZACIÓN PROMOCIONAL</span><h2>{consentTarget.consented ? 'Registrar autorización' : 'Retirar autorización'}</h2></div><button type="button" className="secondary" onClick={() => setConsentTarget(null)}>Cerrar</button></div>
        <p>{consentTarget.resident.fullName} · {consentTarget.resident.email}</p>
        <form className="form-grid" onSubmit={updateConsent}>
          {consentTarget.consented
            ? <label className="form-full">Fuente o evidencia<select required value={consentSource} onChange={(event) => setConsentSource(event.target.value)}><option value="">Selecciona una razón</option>{authorizationReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.description}</option>)}</select></label>
            : <p className="form-full">La autorización se retirará y quedará registrada en el historial.</p>}
          <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar'}</button>
        </form>
      </section>
    </div>}
  </section>;
}
