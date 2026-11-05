import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { FormEvent, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UserAdministration } from './UserAdministration';
import { ResidentCommunications } from './ResidentCommunications';
import { ResidentEmailUnsubscribe } from './ResidentEmailUnsubscribe';
import { apiBaseUrl } from './api';
import './access-search.css';
import './styles.css';

type BuildingSectionType = 'TORRE' | 'INTERIOR';
type PersonLocation = { buildingSectionType: BuildingSectionType | null; buildingSectionNumber: string | null; apartmentNumber: string };
type Log = { id: number; accessType: 'ENTRADA' | 'SALIDA'; occurredAt: string; person: { id: number; fullName: string; type: string; documentNumber?: string | null; phone?: string | null; photoUrl?: string | null } & PersonLocation; vehicle?: { id: number; plate: string; type: string; brand?: string | null; model?: string | null; color?: string | null; photoUrl?: string | null } | null };
type Person = { id: number; accessCode: string; type: 'RESIDENTE' | 'VISITANTE'; fullName: string; documentNumber?: string | null; email?: string | null; phone?: string | null; documentType?: { code: string; name: string } | null; photoUrl?: string | null } & PersonLocation;
type DocumentType = { id: number; code: string; name: string };
type Vehicle = { id: number; accessCode: string; personId: number; plate: string; type: 'AUTOMOVIL' | 'MOTOCICLETA' | 'BICICLETA' | 'OTRO'; brand?: string | null; model?: string | null; color?: string | null; photoUrl?: string | null; person: { fullName: string; type: string } & PersonLocation };
type Residence = { id: number; name: string; code: string; hasLogo: boolean; logo?: string | null; userRole?: string };
type AvailableResidence = { id: number; name: string; code: string };
type AccessCaptureMode = 'MANUAL' | 'BARCODE' | 'QR' | 'FINGERPRINT';
type VisitStatus = 'AUTORIZADA' | 'CANCELADA' | 'NOSHOW' | 'EN_CURSO' | 'COMPLETADA';
type Visit = {
  id: number;
  visitorName: string;
  visitorDocumentNumber: string | null;
  observations: string | null;
  vehiclePlate: string | null;
  vehicleType: Vehicle['type'] | null;
  validFrom: string;
  validUntil: string;
  status: VisitStatus;
  origin: 'RESIDENTE' | 'PORTERIA';
  residentApprovalConfirmed: boolean;
  resident: { id: number; fullName: string; apartmentNumber: string } & PersonLocation;
  visitor: { id: number; fullName: string; documentNumber: string | null } | null;
  createdBy: { id: number; name: string };
  accessLogs: { id: number; accessType: 'ENTRADA' | 'SALIDA'; occurredAt: string }[];
};
type DeliveryKind = 'COMIDA' | 'PAQUETE' | 'RECIBO' | 'CORREO' | 'OTRO';
type DeliveryState = 'PENDIENTE' | 'ENTREGADA' | 'DEVUELTA';
type Delivery = {
  id: number;
  type: DeliveryKind;
  status: DeliveryState;
  courier?: string | null;
  description?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
  receivedAt: string;
  deliveredAt?: string | null;
  deliveredToName?: string | null;
  person: { id: number; fullName: string; type: string } & PersonLocation;
  receivedBy: { id: number; name: string };
  deliveredBy?: { id: number; name: string } | null;
};
const deliveryTypeLabels: Record<DeliveryKind, string> = {
  COMIDA: 'Comida',
  PAQUETE: 'Paquete',
  RECIBO: 'Recibo de servicio',
  CORREO: 'Correo',
  OTRO: 'Otro',
};
const deliveryStatusLabels: Record<DeliveryState, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  DEVUELTA: 'Devuelta',
};
function formatBuildingSection(person: PersonLocation) {
  return person.buildingSectionType && person.buildingSectionNumber
    ? `${person.buildingSectionType === 'TORRE' ? 'Torre' : 'Interior'} ${person.buildingSectionNumber}`
    : 'Sector sin registrar';
}
function formatPersonLocation(person: PersonLocation) {
  return `${formatBuildingSection(person)} · Apto. ${person.apartmentNumber}`;
}
function toLocalDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function endOfLocalDay(value: string) {
  const date = new Date(value);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return toLocalDateTimeValue(date);
}
function defaultVisitWindow() {
  const now = new Date();
  return {
    validFrom: toLocalDateTimeValue(now),
    validUntil: endOfLocalDay(toLocalDateTimeValue(now)),
  };
}
const visitStatusLabels: Record<VisitStatus, string> = {
  AUTORIZADA: 'Autorizada',
  CANCELADA: 'Cancelada',
  NOSHOW: 'No se presentó',
  EN_CURSO: 'En residencia',
  COMPLETADA: 'Completada',
};
function normalizePersonSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const api = apiBaseUrl;
const getToken = () => localStorage.getItem('token') ?? '';
const sessionExpiredEvent = 'resi-control:session-expired';
const nativeFetch = window.fetch.bind(window);
const storedSessionKeys = ['token', 'userRole', 'userId', 'userPermissions', 'availableResidences', 'activeResidenceId'];

function clearStoredSession() {
  storedSessionKeys.forEach((key) => localStorage.removeItem(key));
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (localStorage.getItem('userRole') === 'SUPER_ADMINISTRADOR') {
    const residenceId = localStorage.getItem('activeResidenceId');
    if (residenceId) headers.set('X-Residence-Id', residenceId);
  }
  const response = await nativeFetch(input, { ...init, headers });
  if (response.status === 401 && new Headers(init?.headers).has('Authorization')) {
    window.dispatchEvent(new Event(sessionExpiredEvent));
  }
  return response;
}

function AccessCodeCard({ code, label }: { code: string; label: string }) {
  const [qrUrl, setQrUrl] = useState('');
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    QRCode.toDataURL(code, { width: 240, margin: 4, errorCorrectionLevel: 'M' }).then(setQrUrl).catch(() => setQrUrl(''));
    if (barcodeRef.current) JsBarcode(barcodeRef.current, code, { format: 'CODE128', width: 1.5, height: 48, displayValue: false, margin: 0 });
  }, [code]);

  const fileBase = `codigo-${label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}`;

  function printCode() {
    if (!qrUrl) return;
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) return;
    win.document.write(`<!doctype html><html lang="es"><head><title>${label}</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:24px"><h2 style="margin:0 0 16px">${label}</h2><img src="${qrUrl}" width="300" height="300" alt="Código QR" /><p style="font-family:monospace;font-size:13px;word-break:break-all;margin-top:14px">${code}</p></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  return <div className="access-code-card"><h3>{label}</h3><div className="access-code-previews">{qrUrl && <img src={qrUrl} alt={`Código QR de ${label}`} />}<svg ref={barcodeRef} aria-label={`Código de barras de ${label}`} /></div><p className="access-code-value">{code}</p><div className="access-code-actions">{qrUrl && <a className="access-code-download" href={qrUrl} download={`${fileBase}.png`}>Descargar QR</a>}{qrUrl && <button type="button" className="small-button" onClick={printCode}>Imprimir</button>}</div><small>Código seguro para lectura de acceso</small></div>;
}

function formatColombianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('57') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
  if (!national) return '';
  const groups = [national.slice(0, 3), national.slice(3, 6), national.slice(6, 10)].filter(Boolean);
  return `(+57) ${groups.join(' ')}`;
}

async function deletePerson(id: number) {
  if (!window.confirm('¿Desactivar esta persona?')) return;
  const response = await apiFetch(`${api}/api/people/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) { window.alert('No se pudo desactivar la persona.'); return; }
  window.location.reload();
}

async function deleteVehicle(id: number) {
  if (!window.confirm('¿Desactivar este vehículo?')) return;
  const response = await apiFetch(`${api}/api/vehicles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) { window.alert('No se pudo desactivar el vehículo.'); return; }
  window.location.reload();
}

async function uploadPhoto(kind: 'people' | 'vehicles', id: number, file: File | null) {
  if (!file) return;
  const body = new FormData(); body.append('photo', file);
  const response = await apiFetch(`${api}/api/${kind}/${id}/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body });
  if (!response.ok) window.alert('No se pudo guardar la foto.');
  else window.alert('Foto actualizada correctamente.');
}

function unformatColombianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('57') && digits.length > 10 ? digits.slice(2, 12) : digits.slice(0, 10);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo preparar el logo.'));
    reader.readAsDataURL(blob);
  });
}

function validateResidenceLogo(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(extension)) {
    return 'El logo debe ser un archivo JPG, PNG o WebP.';
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'El logo no puede superar los 2 MB.';
  }
  return '';
}

function validatePhoto(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(extension)) return 'La foto debe ser JPG, PNG o WebP.';
  if (file.size > 2 * 1024 * 1024) return 'La foto no puede superar los 2 MB.';
  return '';
}

function PasswordVisibilityButton({ visible, onToggle, label }: { visible: boolean; onToggle: () => void; label: string }) {
  return <button
    type="button"
    className="password-visibility-toggle"
    aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
    aria-pressed={visible}
    onClick={onToggle}
  >
    {visible ? (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
        <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1.1-1.2 2.3-2.3 3.4M6.2 6.2C3.9 7.6 2.8 9.7 2.5 12c.5 1.4 3.8 7 9.5 7 1.2 0 2.2-.2 3.2-.6" />
      </svg>
    ) : (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )}
  </button>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('token')));
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') ?? '');
  const [currentUserId, setCurrentUserId] = useState(Number(localStorage.getItem('userId') ?? 0));
  const [userPermissions, setUserPermissions] = useState<string[]>(JSON.parse(localStorage.getItem('userPermissions') ?? '[]'));
  const [availableResidences, setAvailableResidences] = useState<AvailableResidence[]>(JSON.parse(localStorage.getItem('availableResidences') ?? '[]'));
  const [activeResidenceId, setActiveResidenceId] = useState(localStorage.getItem('activeResidenceId') ?? '');
  const [email, setEmail] = useState('admin@resicontrol.local');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [invitationToken, setInvitationToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '');
  const [emailUnsubscribeToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('email-unsubscribe') ?? '');
  const [activationPassword, setActivationPassword] = useState('');
  const [activationPasswordConfirmation, setActivationPasswordConfirmation] = useState('');
  const [showActivationPassword, setShowActivationPassword] = useState(false);
  const [showActivationPasswordConfirmation, setShowActivationPasswordConfirmation] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSaving, setActivationSaving] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclePhotoUrls, setVehiclePhotoUrls] = useState<Record<number, string>>({});
  const [residence, setResidence] = useState<Residence | null>(null);
  const [residenceLogoUrl, setResidenceLogoUrl] = useState('');
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [totals, setTotals] = useState({ residents: 0, visitors: 0, today: 0, pendingDeliveries: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [showAccessForm, setShowAccessForm] = useState(false);
  const [personType, setPersonType] = useState<Person['type']>('RESIDENTE');
  const [fullName, setFullName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [buildingSectionType, setBuildingSectionType] = useState<BuildingSectionType | ''>('');
  const [buildingSectionNumber, setBuildingSectionNumber] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [personPhoto, setPersonPhoto] = useState<File | null>(null);
  const [personPhotoPreview, setPersonPhotoPreview] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [accessCaptureMode, setAccessCaptureMode] = useState<AccessCaptureMode>('MANUAL');
  const [scannerValue, setScannerValue] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [cameraDevices, setCameraDevices] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraZoom, setCameraZoom] = useState(1);
  const [cameraInfo, setCameraInfo] = useState('');
  const [cameraCaps, setCameraCaps] = useState('');
  const [scanAttempts, setScanAttempts] = useState(0);
  const [nativeZoomActive, setNativeZoomActive] = useState(false);
  const [cameraAspect, setCameraAspect] = useState(4 / 3);
  const cameraZoomRef = useRef(1);
  const nativeZoomRef = useRef(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const selectedCameraIdRef = useRef('');
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const scanInProgressRef = useRef(false);
  const [accessType, setAccessType] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
  const [saving, setSaving] = useState(false);
  const [irregularMode, setIrregularMode] = useState<'BLOCK' | 'SUPERVISOR'>('BLOCK');
  const [showSettings, setShowSettings] = useState(false);
  const [supervisorEmail, setSupervisorEmail] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [supervisorRequired, setSupervisorRequired] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<Vehicle['type']>('AUTOMOVIL');
  const [vehiclePersonId, setVehiclePersonId] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState('');
  const [residenceName, setResidenceName] = useState('');
  const [residenceLogo, setResidenceLogo] = useState<File | null>(null);
  const [residenceLogoPreview, setResidenceLogoPreview] = useState('');
  const [removeResidenceLogo, setRemoveResidenceLogo] = useState(false);
  const [activeView, setActiveView] = useState<'movements' | 'people' | 'vehicles' | 'deliveries' | 'visits' | 'settings' | 'users' | 'communications'>(() => {
    const storedPermissions: string[] = JSON.parse(localStorage.getItem('userPermissions') ?? '[]');
    if (storedPermissions.includes('ACCESS_VIEW') || storedPermissions.includes('ACCESS_REGISTER')) return 'movements';
    if (storedPermissions.includes('PEOPLE_VIEW')) return 'people';
    if (storedPermissions.includes('VEHICLES_VIEW')) return 'vehicles';
    if (storedPermissions.includes('DELIVERIES_VIEW')) return 'deliveries';
    if (storedPermissions.includes('USERS_MANAGE')) return 'users';
    return 'settings';
  });
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitSearch, setVisitSearch] = useState('');
  const [visitVisitorName, setVisitVisitorName] = useState('');
  const [visitVisitorDocument, setVisitVisitorDocument] = useState('');
  const [visitObservations, setVisitObservations] = useState('');
  const [visitVehiclePlate, setVisitVehiclePlate] = useState('');
  const [visitVehicleType, setVisitVehicleType] = useState<Vehicle['type']>('AUTOMOVIL');
  const [visitResidentPersonId, setVisitResidentPersonId] = useState('');
  const [visitResidentApprovalConfirmed, setVisitResidentApprovalConfirmed] = useState(false);
  const [visitWindow, setVisitWindow] = useState(defaultVisitWindow);
  const [visitStartEdited, setVisitStartEdited] = useState(false);
  const [visitEndEdited, setVisitEndEdited] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<'PENDIENTE' | 'DEVUELTA' | 'TODAS'>('PENDIENTE');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryPersonId, setDeliveryPersonId] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryKind>('PAQUETE');
  const [deliveryCourier, setDeliveryCourier] = useState('');
  const [deliveryDescription, setDeliveryDescription] = useState('');
  const [deliveryTrackingCode, setDeliveryTrackingCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [closingDelivery, setClosingDelivery] = useState<Delivery | null>(null);
  const [deliveredToName, setDeliveredToName] = useState('');
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [selectedPersonPhoto, setSelectedPersonPhoto] = useState('');
  const [selectedVehiclePhoto, setSelectedVehiclePhoto] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const token = () => localStorage.getItem('token') ?? '';
  const can = (permission: string) => userPermissions.includes(permission);

  async function loadDashboard() {
    const response = await apiFetch(`${api}/api/dashboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('No se pudo consultar el tablero.');
    const data = await response.json();
    setLogs(data.latest);
    setTotals(data.totals);
  }

  async function loadPeople() {
    const response = await apiFetch(`${api}/api/people`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('No se pudieron consultar las personas.');
    setPeople(await response.json());
  }

  async function loadDocumentTypes() {
    const response = await apiFetch(`${api}/api/document-types`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('No se pudieron consultar los tipos de documento.');
    setDocumentTypes(await response.json());
  }

  async function loadVehicles() {
    const response = await apiFetch(`${api}/api/vehicles`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('No se pudieron consultar los vehículos.');
    const loadedVehicles: Vehicle[] = await response.json();
    setVehicles(loadedVehicles);
    setVehiclePhotoUrls(Object.fromEntries(loadedVehicles.filter((vehicle) => vehicle.photoUrl).map((vehicle) => [vehicle.id, vehicle.photoUrl!])));
  }

  async function loadDeliveries() {
    const response = await apiFetch(`${api}/api/deliveries`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('No se pudieron consultar las encomiendas.');
    setDeliveries(await response.json());
  }

  async function loadVisits() {
    const response = await apiFetch(`${api}/api/visits`, { headers: { Authorization: 'Bearer ' + token() } });
    if (!response.ok) throw new Error('No se pudieron consultar las visitas.');
    setVisits(await response.json());
  }

  async function loadResidentVisits() {
    const response = await apiFetch(`${api}/api/resident/visits`, { headers: { Authorization: 'Bearer ' + token() } });
    if (!response.ok) throw new Error('No se pudieron consultar tus visitas.');
    setVisits(await response.json());
  }

  useEffect(() => {
    if (!authenticated) return;
    if (userRole === 'RESIDENTE') {
      loadResidentVisits().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron consultar tus visitas.'));
    } else if ((activeView === 'visits' || activeView === 'movements') && can('ACCESS_VIEW')) {
      loadVisits().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudieron consultar las visitas.'));
    }
  }, [authenticated, userRole, activeView, activeResidenceId]);

  async function loadSettings() {
    const response = await apiFetch(`${api}/api/settings/irregular-access`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error(`No se pudo consultar la configuración (HTTP ${response.status}).`);
    setIrregularMode((await response.json()).mode);
    const captureResponse = await apiFetch(`${api}/api/settings/access-capture`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!captureResponse.ok) throw new Error(`No se pudo consultar el modo de captura (HTTP ${captureResponse.status}).`);
    setAccessCaptureMode((await captureResponse.json()).mode);
  }

  async function resolveScan(value: string) {
    const code = value.trim().toLowerCase();
    if (!code || scanInProgressRef.current) return;
    scanInProgressRef.current = true;
    try {
      const scanResponse = await apiFetch(`${api}/api/access/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ code }),
      });
      const scan = await scanResponse.json().catch(() => null);
      if (!scanResponse.ok) throw new Error(`${scan?.message ?? 'Código no reconocido.'} · leído: "${code}" (${code.length} caracteres)`);
      const accessResponse = await apiFetch(`${api}/api/access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ personId: scan.personId, vehicleId: scan.vehicleId ?? undefined, accessType: scan.accessType }),
      });
      const access = await accessResponse.json().catch(() => null);
      if (!accessResponse.ok) {
        if (accessResponse.status === 409 && access?.code === 'SUPERVISOR_REQUIRED') {
          setSelectedPersonId(String(scan.personId));
          setSelectedVehicleId(scan.vehicleId ? String(scan.vehicleId) : '');
          setAccessType(scan.accessType);
          setSupervisorRequired(true);
          throw new Error('Se requiere autorización de supervisor para completar este movimiento escaneado.');
        }
        throw new Error(access?.message ?? 'No se pudo registrar el movimiento escaneado.');
      }
      setScannerValue('');
      setScannerError('');
      setNotice(`${scan.accessType === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada: ${scan.person.fullName}${scan.vehicle ? ` · ${scan.vehicle.plate}` : ''}.`);
      await loadDashboard();
    } catch (reason) {
      setScannerError(reason instanceof Error ? reason.message : 'No se pudo procesar el código.');
    } finally {
      scanInProgressRef.current = false;
    }
  }

  async function startCameraScanner() {
    setScannerError('');
    setScannerOpen(true);
  }

  function stopCameraScanner() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScannerOpen(false);
  }

  async function loadResidence() {
    const response = await apiFetch(`${api}/api/residence`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!response.ok) throw new Error(`No se pudo consultar la residencia (HTTP ${response.status}).`);
    const data = await response.json();
    setResidence(data);
    setResidenceName(data.name);
    if (data.userRole) {
      setUserRole(data.userRole);
      localStorage.setItem('userRole', data.userRole);
    }
    setResidenceLogoUrl(data.logo ?? '');
  }

  async function loadResidenceLogo(hasLogo: boolean) {
    if (!hasLogo) {
      setResidenceLogoUrl('');
      return;
    }
    const logoResponse = await apiFetch(`${api}/api/residence/logo`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!logoResponse.ok) throw new Error(`No se pudo cargar el logo (HTTP ${logoResponse.status}).`);
    setResidenceLogoUrl(await blobToDataUrl(await logoResponse.blob()));
  }

  async function uploadPhoto(kind: 'people' | 'vehicles', id: number, file: File | null) {
    if (!file) return;
    const body = new FormData();
    body.append('photo', file);
    const response = await apiFetch(`${api}/api/${kind}/${id}/photo`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token() }, body });
    if (!response.ok) {
      setError('No se pudo guardar la foto.');
      return;
    }
    if (kind === 'vehicles') await loadVehicles();
    else await loadPeople();
    setNotice('Foto actualizada correctamente.');
  }

  useEffect(() => {
    const handleSessionExpired = () => {
      if (!localStorage.getItem('token')) return;
      clearStoredSession();
      setAuthenticated(false);
      setUserRole('');
      setCurrentUserId(0);
      setUserPermissions([]);
      setAvailableResidences([]);
      setActiveResidenceId('');
      setLoginError('Tu sesión expiró o ya no es válida. Inicia sesión nuevamente.');
      setError('');
      setNotice('');
      setLogs([]);
      setPeople([]);
      setVehicles([]);
      setVehiclePhotoUrls({});
      setDocumentTypes([]);
      setTotals({ residents: 0, visitors: 0, today: 0, pendingDeliveries: 0 });
      setDeliveries([]);
      setResidence(null);
      setResidenceLogoUrl('');
      setSelectedPersonPhoto('');
      setSelectedVehiclePhoto('');
      setSelectedLog(null);
      setSelectedPerson(null);
      setSelectedVehicle(null);
      setPersonSearch('');
      setSelectedPersonId('');
      setSelectedVehicleId('');
      setFullName('');
      setBuildingSectionType('');
      setBuildingSectionNumber('');
      setApartmentNumber('');
      setDocumentTypeId('');
      setDocumentNumber('');
      setPhone('');
      setPersonPhoto(null);
      setPersonPhotoPreview('');
      setEditingPersonId(null);
      setVehiclePlate('');
      setVehiclePersonId('');
      setVehicleBrand('');
      setVehicleModel('');
      setVehicleColor('');
      setVehiclePhoto(null);
      setVehiclePhotoPreview('');
      setEditingVehicleId(null);
      setSupervisorEmail('');
      setSupervisorPassword('');
      setSupervisorRequired(false);
      setDeliveryPersonId('');
      setDeliveryCourier('');
      setDeliveryDescription('');
      setDeliveryTrackingCode('');
      setDeliveryNotes('');
      setDeliveredToName('');
      setShowAccessForm(false);
      setShowPersonForm(false);
      setShowVehicleForm(false);
      setShowDeliveryForm(false);
      setShowSettings(false);
      setClosingDelivery(null);
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      setScannerOpen(false);
      setScannerValue('');
    };
    window.addEventListener(sessionExpiredEvent, handleSessionExpired);
    return () => window.removeEventListener(sessionExpiredEvent, handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!authenticated || userRole === 'RESIDENTE') return;
    const tasks = [loadResidence()];
    if (can('DASHBOARD_VIEW')) tasks.push(loadDashboard());
    if (can('PEOPLE_VIEW')) tasks.push(loadPeople(), loadDocumentTypes());
    if (can('VEHICLES_VIEW')) tasks.push(loadVehicles());
    if (can('DELIVERIES_VIEW')) tasks.push(loadDeliveries());
    if (can('SETTINGS_VIEW')) tasks.push(loadSettings());
    Promise.all(tasks).catch((reason: Error) => setError(reason.message));
  }, [authenticated, userRole, userPermissions, activeResidenceId]);

  useEffect(() => () => {
    scannerControlsRef.current?.stop();
  }, []);

  useEffect(() => {
    const video = scannerVideoRef.current;
    if (!scannerOpen || !video) return;
    let cancelled = false;
    let rafId = 0;
    let lastAttempt = 0;
    let frameCount = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
    const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, never>);
    // Se limita el lector al formato configurado para no capturar códigos ajenos
    // (por ejemplo un EAN de un producto o un QR de otro sistema que aparezca en cámara).
    reader.possibleFormats =
      accessCaptureMode === 'BARCODE'
        ? [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.ITF,
            BarcodeFormat.CODABAR,
          ]
        : [BarcodeFormat.QR_CODE];

    const handle = {
      stop: () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        cameraTrackRef.current = null;
      },
    };
    scannerControlsRef.current = handle;

    const attempt = (zoom: number): string | null => {
      if (!context) return null;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;
      const cropWidth = Math.round(width / zoom);
      const cropHeight = Math.round(height / zoom);
      const sourceX = Math.round((width - cropWidth) / 2);
      const sourceY = Math.round((height - cropHeight) / 2);
      if (canvas.width !== cropWidth || canvas.height !== cropHeight) {
        canvas.width = cropWidth;
        canvas.height = cropHeight;
      }
      context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        // NotFoundException: frame sin código legible.
        return null;
      }
    };

    const tick = () => {      if (cancelled) return;
      const now = performance.now();
      if (video.readyState >= 2 && now - lastAttempt >= 120) {
        lastAttempt = now;
        // Con zoom nativo de la cámara no se recorta: el dispositivo hace la ampliación.
        const digitalZoom = nativeZoomRef.current ? 1 : Math.max(1, cameraZoomRef.current);
        const zooms = digitalZoom > 1.05 ? [1, digitalZoom] : [1];
        let text: string | null = null;
        for (const level of zooms) {
          text = attempt(level);
          if (text) break;
        }
        frameCount += 1;
        if (frameCount % 8 === 0) setScanAttempts(frameCount);
        const candidate = text ? text.trim().toLowerCase() : '';
        // Solo se aceptan códigos con el formato de accessCode (32 hex). Cualquier otra
        // lectura se ignora y el escaneo continúa.
        if (candidate && /^[a-f0-9]{32}$/.test(candidate)) {
          handle.stop();
          scannerControlsRef.current = null;
          setScannerOpen(false);
          resolveScan(candidate);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    void (async () => {
      const requestedId = selectedCameraIdRef.current;
      const attempts: MediaStreamConstraints[] = [];
      if (requestedId) attempts.push({ video: { deviceId: { exact: requestedId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      attempts.push({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      attempts.push({ video: true });
      let lastError: unknown = null;
      for (const constraints of attempts) {
        if (cancelled) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ ...constraints, audio: false });
          break;
        } catch (reason) {
          lastError = reason;
          stream = null;
        }
      }
      if (!stream) {
        if (!cancelled) {
          setScannerOpen(false);
          setScannerError(lastError instanceof Error ? lastError.message : 'No se pudo iniciar la cámara.');
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      cameraTrackRef.current = track ?? null;
      const settings = track?.getSettings();
      if (settings?.width && settings.height) setCameraAspect(settings.width / settings.height);
      setCameraInfo(`${settings?.width ?? '?'}×${settings?.height ?? '?'} · ${track?.label || 'cámara activa'}`);
      if (track) {
        const capabilities = (track.getCapabilities?.() ?? {}) as unknown as {
          focusMode?: string[];
          exposureMode?: string[];
          zoom?: { min: number; max: number; step?: number };
        };
        const advanced: MediaTrackConstraintSet[] = [];
        if (capabilities.focusMode?.includes('continuous')) {
          advanced.push({ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet);
        }
        if (capabilities.exposureMode?.includes('continuous')) {
          advanced.push({ exposureMode: 'continuous' } as unknown as MediaTrackConstraintSet);
        }
        if (advanced.length) await track.applyConstraints({ advanced }).catch(() => undefined);
        nativeZoomRef.current = Boolean(capabilities.zoom && capabilities.zoom.max > 1);
        setNativeZoomActive(nativeZoomRef.current);
        const zoomText = nativeZoomRef.current
          ? `zoom nativo ${capabilities.zoom?.min ?? 1}–${capabilities.zoom?.max ?? 1}`
          : 'zoom digital';
        const focusText = capabilities.focusMode?.length ? `enfoque ${capabilities.focusMode.join('/')}` : 'enfoque fijo';
        setCameraCaps(`${focusText} · ${zoomText}`);
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices
          .filter((device) => device.kind === 'videoinput')
          .map((device, index) => ({ id: device.deviceId, label: device.label || `Cámara ${index + 1}` }));
        setCameraDevices(cameras);
        const activeId = settings?.deviceId || cameras[0]?.id || '';
        if (activeId) {
          setSelectedCameraId(activeId);
          selectedCameraIdRef.current = activeId;
        }
      } catch {
        // enumerateDevices no está disponible: se mantiene la cámara activa.
      }
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      handle.stop();
      if (scannerControlsRef.current === handle) scannerControlsRef.current = null;
    };
  }, [scannerOpen, selectedCameraId]);

  useEffect(() => {
    if (!showAccessForm || accessCaptureMode === 'MANUAL' || accessCaptureMode === 'FINGERPRINT') return;
    setScannerError('');
    setScannerOpen(true);
  }, [showAccessForm, accessCaptureMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadMovementPhotos() {
      if (!selectedLog) {
        setSelectedPersonPhoto('');
        setSelectedVehiclePhoto('');
        return;
      }
      const fetchPhoto = async (path: string) => {
        const response = await apiFetch(`${api}${path}`, { headers: { Authorization: 'Bearer ' + token() } });
        if (!response.ok) return '';
        return blobToDataUrl(await response.blob());
      };
      const [personPhotoUrl, vehiclePhotoUrl] = await Promise.all([
        Promise.resolve(selectedLog.person.photoUrl ?? ''),
        Promise.resolve(selectedLog.vehicle?.photoUrl ?? ''),
      ]);
      if (!cancelled) {
        setSelectedPersonPhoto(personPhotoUrl);
        setSelectedVehiclePhoto(vehiclePhotoUrl);
      }
    }
    loadMovementPhotos().catch(() => {
      if (!cancelled) {
        setSelectedPersonPhoto('');
        setSelectedVehiclePhoto('');
      }
    });
    return () => { cancelled = true; };
  }, [selectedLog]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError('');
    setLoginNotice('');
    setError('');
    setNotice('');
    const response = await apiFetch(`${api}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!response.ok) { setLoginError('Correo o contraseña inválidos.'); return; }
    const data = await response.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('userRole', data.user.role);
    localStorage.setItem('userId', String(data.user.id));
    localStorage.setItem('userPermissions', JSON.stringify(data.user.permissions));
    localStorage.setItem('availableResidences', JSON.stringify(data.user.availableResidences));
    setUserPermissions(data.user.permissions);
    setAvailableResidences(data.user.availableResidences);
    setUserRole(data.user.role);
    setCurrentUserId(data.user.id);
    setActiveView(data.user.permissions.includes('ACCESS_VIEW') || data.user.permissions.includes('ACCESS_REGISTER') ? 'movements'
      : data.user.permissions.includes('PEOPLE_VIEW') ? 'people'
        : data.user.permissions.includes('VEHICLES_VIEW') ? 'vehicles'
          : data.user.permissions.includes('DELIVERIES_VIEW') ? 'deliveries'
            : data.user.permissions.includes('USERS_MANAGE') ? 'users' : 'settings');
    if (data.user.role === 'SUPER_ADMINISTRADOR' && data.user.availableResidences.length) {
      const currentSelection = data.user.availableResidences.some((item: AvailableResidence) => String(item.id) === activeResidenceId)
        ? activeResidenceId
        : String(data.user.availableResidences[0].id);
      localStorage.setItem('activeResidenceId', currentSelection);
      setActiveResidenceId(currentSelection);
    }
    setAuthenticated(true);
  }

  function logout() {
    clearStoredSession();
    setAuthenticated(false);
    setUserRole('');
    setCurrentUserId(0);
    setUserPermissions([]);
    setAvailableResidences([]);
    setActiveResidenceId('');
    setPassword('');
    setLoginError('');
    setLoginNotice('');
    setError('');
    setNotice('');
  }

  async function activateResident(event: FormEvent) {
    event.preventDefault();
    setActivationError('');
    if (activationPassword !== activationPasswordConfirmation) {
      setActivationError('Las contraseñas no coinciden.');
      return;
    }
    setActivationSaving(true);
    try {
      const response = await apiFetch(`${api}/api/auth/resident-invitation/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invitationToken, password: activationPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo activar la cuenta.');
      setEmail(data.user.email);
      setPassword('');
      setLoginError('');
      setLoginNotice('Cuenta activada. Inicia sesión con tu nueva contraseña.');
      setInvitationToken('');
      window.history.replaceState({}, '', '/');
      ['token', 'userRole', 'userId', 'userPermissions', 'availableResidences', 'activeResidenceId'].forEach((key) => localStorage.removeItem(key));
      setAuthenticated(false);
    } catch (reason) {
      setActivationError(reason instanceof Error ? reason.message : 'No se pudo activar la cuenta.');
    } finally {
      setActivationSaving(false);
    }
  }

  async function createPerson(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/people${editingPersonId ? `/${editingPersonId}` : ''}`, {
        method: editingPersonId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ type: personType, fullName, email: personEmail.trim() || null, buildingSectionType, buildingSectionNumber, apartmentNumber, documentTypeId: documentTypeId ? Number(documentTypeId) : undefined, documentNumber: documentNumber || undefined, phone: phone || undefined }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'No se pudo guardar la persona.');
      }
      const created = await response.json();
      if (personPhoto) {
        const body = new FormData(); body.append('photo', personPhoto);
        const photoResponse = await apiFetch(`${api}/api/people/${created.id}/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body });
        if (!photoResponse.ok) throw new Error('La persona se creó, pero no se pudo guardar su foto.');
      }
      setFullName(''); setPersonEmail(''); setBuildingSectionType(''); setBuildingSectionNumber(''); setApartmentNumber(''); setDocumentTypeId(''); setDocumentNumber(''); setPhone(''); setPersonPhoto(null); setPersonPhotoPreview('');
      setShowPersonForm(false); setEditingPersonId(null);
      setNotice(editingPersonId ? 'Persona actualizada correctamente.' : `${personType === 'RESIDENTE' ? 'Residente' : 'Visitante'} registrado correctamente.`);
      await Promise.all([loadDashboard(), loadPeople(), loadDocumentTypes()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la persona.');
    } finally { setSaving(false); }
  }

  async function saveVisit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const currentDefaults = defaultVisitWindow();
      const validFrom = visitStartEdited ? visitWindow.validFrom : currentDefaults.validFrom;
      const validUntil = visitEndEdited ? visitWindow.validUntil
        : visitStartEdited ? endOfLocalDay(validFrom) : currentDefaults.validUntil;
      setVisitWindow({ validFrom, validUntil });
      const base = {
        visitorName: visitVisitorName,
        visitorDocumentNumber: visitVisitorDocument || undefined,
        observations: visitObservations.trim() || undefined,
        vehiclePlate: visitVehiclePlate || undefined,
        vehicleType: visitVehiclePlate ? visitVehicleType : undefined,
        validFrom: new Date(validFrom).toISOString(),
        validUntil: new Date(validUntil).toISOString(),
      };
      const isResident = userRole === 'RESIDENTE';
      const response = await apiFetch(`${api}${isResident ? '/api/resident/visits' : '/api/visits/porter'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(isResident ? base : {
          ...base,
          residentPersonId: Number(visitResidentPersonId),
          residentApprovalConfirmed: visitResidentApprovalConfirmed,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo registrar la visita.');
      setVisitVisitorName('');
      setVisitVisitorDocument('');
      setVisitObservations('');
      setVisitVehiclePlate('');
      setVisitVehicleType('AUTOMOVIL');
      setVisitResidentPersonId('');
      setVisitResidentApprovalConfirmed(false);
      setVisitWindow(defaultVisitWindow());
      setVisitStartEdited(false);
      setVisitEndEdited(false);
      setNotice(isResident ? 'Visita prerregistrada y autorizada.' : 'Visita registrada desde portería con autorización del residente confirmada.');
      if (isResident) await loadResidentVisits();
      else await loadVisits();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo registrar la visita.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelVisit(visit: Visit) {
    if (!window.confirm(`¿Cancelar la visita de ${visit.visitorName}?`)) return;
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`${api}/api/resident/visits/${visit.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token() },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo cancelar la visita.');
      await loadResidentVisits();
      setNotice('Visita cancelada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cancelar la visita.');
    }
  }

  async function updateVisitAccess(visit: Visit, action: 'check-in' | 'check-out') {
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`${api}/api/visits/${visit.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token() },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo actualizar el acceso de la visita.');
      await Promise.all([loadVisits(), loadDashboard(), loadPeople(), loadVehicles()]);
      setNotice(action === 'check-in' ? 'Entrada de visita registrada.' : 'Salida de visita registrada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el acceso de la visita.');
    }
  }

  async function createAccess(event: FormEvent) {
    event.preventDefault();
    if (!selectedPersonId) { setError('Selecciona una persona.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ personId: Number(selectedPersonId), vehicleId: selectedVehicleId ? Number(selectedVehicleId) : undefined, accessType, ...(supervisorRequired ? { supervisor: { email: supervisorEmail, password: supervisorPassword } } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (response.status === 409 && data?.code === 'SUPERVISOR_REQUIRED') setSupervisorRequired(true);
        throw new Error(data?.message ?? 'No se pudo registrar el acceso.');
      }

      async function createVehicle(event: FormEvent) {
        event.preventDefault();
        setSaving(true); setError(''); setNotice('');
        try {
          const response = await apiFetch(`${api}/api/vehicles${editingVehicleId ? `/${editingVehicleId}` : ''}`, {
            method: editingVehicleId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ plate: vehiclePlate, type: vehicleType, personId: Number(vehiclePersonId), brand: vehicleBrand || undefined, model: vehicleModel || undefined, color: vehicleColor || undefined }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar el vehículo.');
          if (vehiclePhoto) {
            const body = new FormData(); body.append('photo', vehiclePhoto);
            const photoResponse = await apiFetch(`${api}/api/vehicles/${data.id}/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body });
            if (!photoResponse.ok) throw new Error('El vehículo se creó, pero no se pudo guardar su foto.');
          }
          setVehiclePlate(''); setVehiclePersonId(''); setVehicleBrand(''); setVehicleModel(''); setVehicleColor(''); setVehiclePhoto(null); setVehiclePhotoPreview('');
          setShowVehicleForm(false); setNotice('Vehículo registrado correctamente.');
          await loadVehicles();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'No se pudo guardar el vehículo.');
        } finally { setSaving(false); }
      }
      setShowAccessForm(false);
      setSelectedVehicleId('');
      setSupervisorRequired(false); setSupervisorEmail(''); setSupervisorPassword('');
      setNotice(`${accessType === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada correctamente.`);
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo registrar el acceso.');
    } finally { setSaving(false); }
  }

  async function createVehicle(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ plate: vehiclePlate, type: vehicleType, personId: Number(vehiclePersonId), brand: vehicleBrand || undefined, model: vehicleModel || undefined, color: vehicleColor || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar el vehículo.');
      if (vehiclePhoto) {
        const body = new FormData();
        body.append('photo', vehiclePhoto);
        const photoResponse = await apiFetch(`${api}/api/vehicles/${data.id}/photo`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token() }, body });
        if (!photoResponse.ok) throw new Error('El vehículo se creó, pero no se pudo guardar su foto.');
      }

      setVehiclePlate(''); setVehiclePersonId(''); setVehicleBrand(''); setVehicleModel(''); setVehicleColor('');
      setVehiclePhoto(null); setVehiclePhotoPreview('');
      setEditingVehicleId(null); setShowVehicleForm(false); setNotice(editingVehicleId ? 'Vehículo actualizado correctamente.' : 'Vehículo registrado correctamente.');
      await loadVehicles();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el vehículo.');
    } finally { setSaving(false); }
  }

  function openAccessForm() {
    setSelectedPersonId('');
    setSelectedVehicleId('');
    setPersonSearch('');
    setVehicleSearch('');
    setShowAccessForm(true);
  }

  const matchingAccessPeople = people.filter((person) =>
    normalizePersonSearch(`${person.fullName} ${person.documentNumber ?? ''}`).includes(normalizePersonSearch(personSearch.trim())),
  );
  const matchingAccessVehicles = vehicles.filter((vehicle) =>
    normalizePersonSearch(`${vehicle.plate} ${vehicle.person.fullName} ${formatPersonLocation(vehicle.person)}`)
      .includes(normalizePersonSearch(vehicleSearch.trim())),
  );
  const matchingVisits = visits.filter((visit) =>
    normalizePersonSearch([
      visit.visitorName,
      visit.visitorDocumentNumber ?? '',
      visit.vehiclePlate ?? '',
      visit.resident.fullName,
      visit.resident.apartmentNumber,
    ].join(' ')).includes(normalizePersonSearch(visitSearch.trim())),
  );
  const activeVisits = visits.filter((visit) => visit.status === 'EN_CURSO');

  async function createDelivery(event: FormEvent) {
    event.preventDefault();
    if (!deliveryPersonId) { setError('Selecciona el destinatario de la encomienda.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          personId: Number(deliveryPersonId),
          type: deliveryType,
          courier: deliveryCourier || undefined,
          description: deliveryDescription || undefined,
          trackingCode: deliveryTrackingCode || undefined,
          notes: deliveryNotes || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo registrar la encomienda.');
      setDeliveryPersonId(''); setDeliveryType('PAQUETE'); setDeliveryCourier('');
      setDeliveryDescription(''); setDeliveryTrackingCode(''); setDeliveryNotes('');
      setShowDeliveryForm(false);
      setNotice('Encomienda registrada correctamente.');
      await Promise.all([loadDeliveries(), loadDashboard()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo registrar la encomienda.');
    } finally { setSaving(false); }
  }

  async function updateDeliveryStatus(delivery: Delivery, status: 'ENTREGADA' | 'DEVUELTA', recipient = '') {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/deliveries/${delivery.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status, deliveredToName: recipient || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo actualizar la encomienda.');
      setClosingDelivery(null); setDeliveredToName('');
      setNotice(status === 'ENTREGADA' ? 'Encomienda entregada correctamente.' : 'Encomienda marcada como devuelta.');
      await Promise.all([loadDeliveries(), loadDashboard()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la encomienda.');
    } finally { setSaving(false); }
  }

  async function deliverEncomienda(event: FormEvent) {
    event.preventDefault();
    if (!closingDelivery) return;
    await updateDeliveryStatus(closingDelivery, 'ENTREGADA', deliveredToName.trim());
  }

  function editVehicle(vehicle: Vehicle) {
    setEditingVehicleId(vehicle.id);
    setVehiclePlate(vehicle.plate);
    setVehicleType(vehicle.type);
    setVehiclePersonId(String(vehicle.personId));
    setVehicleBrand(vehicle.brand ?? '');
    setVehicleModel(vehicle.model ?? '');
    setVehicleColor(vehicle.color ?? '');
    setVehiclePhoto(null);
    setVehiclePhotoPreview('');
    setShowVehicleForm(true);
  }

  function editPerson(person: Person) {
    setEditingPersonId(person.id);
    setPersonType(person.type);
    setFullName(person.fullName);
    setPersonEmail(person.email ?? '');
    setBuildingSectionType(person.buildingSectionType ?? '');
    setBuildingSectionNumber(person.buildingSectionNumber ?? '');
    setApartmentNumber(person.apartmentNumber);
    setDocumentTypeId('');
    setDocumentNumber('');
    setPhone('');
    setPersonPhoto(null);
    setPersonPhotoPreview('');
    setShowPersonForm(true);
  }

  async function deleteVehiclePhoto(id: number) {
    if (!window.confirm('¿Eliminar la foto de este vehículo?')) return;
    const response = await apiFetch(`${api}/api/vehicles/${id}/photo`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token() } });
    if (!response.ok) { setError('No se pudo eliminar la foto del vehículo.'); return; }
    await loadVehicles();
    setNotice('Foto del vehículo eliminada correctamente.');
  }

  async function deletePersonPhoto(id: number) {
    if (!window.confirm('¿Eliminar la foto de esta persona?')) return;
    const response = await apiFetch(`${api}/api/people/${id}/photo`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token() } });
    if (!response.ok) { setError('No se pudo eliminar la foto de la persona.'); return; }
    await loadPeople();
    setNotice('Foto de la persona eliminada correctamente.');
  }

  async function deleteVehicle(id: number) {
    if (!window.confirm('¿Desactivar este vehículo?')) return;
    const response = await apiFetch(`${api}/api/vehicles/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token() } });
    if (!response.ok) { setError('No se pudo desactivar el vehículo.'); return; }
    await loadVehicles();
    setNotice('Vehículo desactivado correctamente.');
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/settings/irregular-access`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ mode: irregularMode }),
      });
      if (!response.ok) throw new Error('No se pudo guardar la configuración.');
      setNotice('Configuración de movimientos irregulares guardada.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la configuración.'); }
    finally { setSaving(false); }
  }

  async function saveCaptureMode(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${api}/api/settings/access-capture`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ mode: accessCaptureMode }),
      });
      if (!response.ok) throw new Error('No se pudo guardar el modo de captura.');
      setNotice('Modo de captura guardado correctamente.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el modo de captura.'); }
    finally { setSaving(false); }
  }

  async function saveResidence(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const body = new FormData();
      body.append('name', residenceName);
      body.append('removeLogo', String(removeResidenceLogo));
      if (residenceLogo) body.append('logo', residenceLogo);
      const response = await apiFetch(`${api}/api/residence`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` }, body });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo guardar la residencia.');
      const updatedResidence = { ...data, hasLogo: Boolean(data.logoMimeType) };
      setResidence(updatedResidence);
      setResidenceLogo(null); setResidenceLogoPreview(''); setRemoveResidenceLogo(false); setShowSettings(false);
      await loadResidence();
      setNotice('Configuración de la residencia guardada correctamente.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la residencia.'); }
    finally { setSaving(false); }
  }

  if (emailUnsubscribeToken) return <ResidentEmailUnsubscribe token={emailUnsubscribeToken} />;

  if (invitationToken) return <main className="login-page"><form className="login-card" onSubmit={activateResident}>
    <span className="eyebrow">RESI CONTROL</span><h1>Activa tu cuenta</h1><p>Crea una contraseña para acceder como residente.</p>
    <label>Nueva contraseña<div className="password-input-wrap"><input type={showActivationPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required value={activationPassword} onChange={(event) => setActivationPassword(event.target.value)} /><PasswordVisibilityButton visible={showActivationPassword} onToggle={() => setShowActivationPassword((visible) => !visible)} label="nueva contraseña" /></div></label>
    <label>Confirma la contraseña<div className="password-input-wrap"><input type={showActivationPasswordConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required value={activationPasswordConfirmation} onChange={(event) => setActivationPasswordConfirmation(event.target.value)} /><PasswordVisibilityButton visible={showActivationPasswordConfirmation} onToggle={() => setShowActivationPasswordConfirmation((visible) => !visible)} label="confirmación de contraseña" /></div></label>
    {activationError && <div className="notice">{activationError}</div>}<button disabled={activationSaving} type="submit">{activationSaving ? 'Activando...' : 'Activar cuenta'}</button>
    <button className="secondary" type="button" onClick={() => { setInvitationToken(''); window.history.replaceState({}, '', '/'); }}>Volver al inicio de sesión</button>
  </form></main>;

  if (authenticated && userRole === 'RESIDENTE') return <main className="resident-portal">
    <header><div><span className="eyebrow">RESI CONTROL</span><h1>Portal de residente</h1><p>Prerregistra y administra tus visitas.</p>    </div><button type="button" className="secondary" onClick={logout}>Cerrar sesión</button></header>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    <section className="form-panel">
      <div className="panel-heading"><div><span className="eyebrow">NUEVA AUTORIZACIÓN</span><h2>Prerregistrar visita</h2></div></div>
      <p className="form-full visit-help">Al prerregistrar, autorizas la visita para la vigencia indicada. Por defecto es desde ahora hasta la medianoche de hoy; puedes editar ambos horarios. También puedes cancelar una visita que todavía no haya ingresado.</p>
      <form className="form-grid" onSubmit={saveVisit}>
        <label>Nombre del visitante<input required minLength={2} maxLength={120} value={visitVisitorName} onChange={(event) => setVisitVisitorName(event.target.value)} /></label>
        <label>Documento (opcional)<input maxLength={40} value={visitVisitorDocument} onChange={(event) => setVisitVisitorDocument(event.target.value)} /></label>
        <label className="form-full">Observaciones (opcional)<textarea rows={3} maxLength={500} value={visitObservations} onChange={(event) => setVisitObservations(event.target.value)} placeholder="Comentario adicional sobre la visita" /></label>
        <label>Válida desde<input type="datetime-local" required value={visitWindow.validFrom} onChange={(event) => { setVisitStartEdited(true); setVisitWindow((current) => ({ validFrom: event.target.value, validUntil: visitEndEdited ? current.validUntil : endOfLocalDay(event.target.value) })); }} /></label>
        <label>Válida hasta<input type="datetime-local" required min={visitWindow.validFrom} value={visitWindow.validUntil} onChange={(event) => { setVisitEndEdited(true); setVisitWindow((current) => ({ ...current, validUntil: event.target.value })); }} /></label>
        <label>Placa del vehículo (opcional)<input maxLength={10} value={visitVehiclePlate} onChange={(event) => setVisitVehiclePlate(event.target.value.toUpperCase())} /></label>
        {visitVehiclePlate && <label>Tipo de vehículo<select value={visitVehicleType} onChange={(event) => setVisitVehicleType(event.target.value as Vehicle['type'])}><option value="AUTOMOVIL">Automóvil</option><option value="MOTOCICLETA">Motocicleta</option><option value="BICICLETA">Bicicleta</option><option value="OTRO">Otro</option></select></label>}
        <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Autorizar visita'}</button>
      </form>
    </section>
    <section className="panel visit-panel">
      <div className="panel-heading"><div><span className="eyebrow">HISTORIAL</span><h2>Tus visitas</h2></div></div>
      {visits.length ? <div className="table"><div className="row resident-visit-row heading"><span>Visitante</span><span>Vigencia</span><span>Estado</span><span>Acción</span></div>{visits.map((visit) => <div className="row resident-visit-row" key={visit.id}>
        <strong>{visit.visitorName}{visit.visitorDocumentNumber ? <small>Documento: {visit.visitorDocumentNumber}</small> : null}{visit.vehiclePlate ? <small>Vehículo: {visit.vehiclePlate}</small> : null}{visit.observations ? <small>Observaciones: {visit.observations}</small> : null}</strong>
        <span>{new Date(visit.validFrom).toLocaleString()} – {new Date(visit.validUntil).toLocaleString()}</span>
        <span>{visitStatusLabels[visit.status]}</span>
        <span>{visit.status === 'AUTORIZADA' && <button type="button" className="small-button secondary" onClick={() => void cancelVisit(visit)}>Cancelar</button>}</span>
      </div>)}</div> : <div className="empty">Todavía no tienes visitas prerregistradas.</div>}
    </section>
  </main>;

  if (!authenticated) return <main className="login-page"><form className="login-card" onSubmit={login}>
    <span className="eyebrow">RESI CONTROL</span><h1>Iniciar sesión</h1><p>Ingresa para administrar el acceso residencial.</p>
    <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {loginError && <div className="notice">{loginError}</div>}{loginNotice && <div className="success">{loginNotice}</div>}<button type="submit">Ingresar</button>
  </form></main>;

  return <main>
    <header><div className="brand"><div className="residence-logo">{residenceLogoUrl ? <img src={residenceLogoUrl} alt={`Logo de ${residence?.name ?? 'la residencia'}`} /> : <span>RC</span>}</div><div><span className="eyebrow">RESI CONTROL</span><h1>{residence?.name ?? 'Control de acceso'}</h1><p>Supervisión del conjunto residencial en tiempo real.</p></div></div><div className="header-controls">
      {userRole === 'SUPER_ADMINISTRADOR' && <label className="residence-selector">Residencia<select aria-label="Residencia activa" value={activeResidenceId} onChange={(event) => { const selected = event.target.value; localStorage.setItem('activeResidenceId', selected); setActiveResidenceId(selected); }}><option value="">Selecciona residencia</option>{availableResidences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <div className="actions">{(can('ACCESS_VIEW') || can('ACCESS_REGISTER')) && <button className={activeView === 'movements' ? 'active-nav' : ''} onClick={() => { setActiveView('movements'); setShowAccessForm(false); }}>Movimientos</button>}{can('ACCESS_VIEW') && <button className={activeView === 'visits' ? 'active-nav' : ''} onClick={() => setActiveView('visits')}>Visitas</button>}{can('PEOPLE_VIEW') && <button className={activeView === 'people' ? 'active-nav' : ''} onClick={() => { setActiveView('people'); setShowAccessForm(false); }}>Personas</button>}{can('VEHICLES_VIEW') && <button className={activeView === 'vehicles' ? 'active-nav' : ''} onClick={() => { setActiveView('vehicles'); setShowAccessForm(false); }}>Vehículos</button>}{can('DELIVERIES_VIEW') && <button className={activeView === 'deliveries' ? 'active-nav' : ''} onClick={() => { setActiveView('deliveries'); setShowAccessForm(false); }}>Encomiendas{totals.pendingDeliveries ? ` · ${totals.pendingDeliveries}` : ''}</button>}{can('SETTINGS_MANAGE') && <button className={activeView === 'settings' ? 'active-nav' : ''} onClick={() => { setActiveView('settings'); setShowSettings(true); }}>Configuración</button>}{can('USERS_MANAGE') && <button className={activeView === 'users' ? 'active-nav' : ''} onClick={() => setActiveView('users')}>Usuarios y roles</button>}{(userRole === 'SUPER_ADMINISTRADOR' || userRole === 'ADMINISTRADOR') && <button className={activeView === 'communications' ? 'active-nav' : ''} onClick={() => setActiveView('communications')}>Comunicados</button>}</div>
      <button type="button" className="secondary" onClick={logout}>Cerrar sesión</button>
    </div></header>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="success">{notice}</div>}
    {activeView === 'vehicles' && showVehicleForm && can('VEHICLES_MANAGE') && <div className="modal-backdrop" onClick={() => { setShowVehicleForm(false); setEditingVehicleId(null); }}><section className="form-panel modal-panel" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">{editingVehicleId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</span><h2>{editingVehicleId ? 'Editar vehículo' : 'Registrar vehículo'}</h2></div><button type="button" className="secondary" onClick={() => { setShowVehicleForm(false); setEditingVehicleId(null); }}>Cerrar</button></div><form className="form-grid" onSubmit={createVehicle}>
      <label>Placa<input required maxLength={10} value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())} placeholder="ABC123" /></label>
      <label>Tipo<select value={vehicleType} onChange={(event) => setVehicleType(event.target.value as Vehicle['type'])}><option value="AUTOMOVIL">Automóvil</option><option value="MOTOCICLETA">Motocicleta</option><option value="BICICLETA">Bicicleta</option><option value="OTRO">Otro</option></select></label>
      <label>Persona asociada<select required value={vehiclePersonId} onChange={(event) => setVehiclePersonId(event.target.value)}><option value="">Selecciona una persona</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {formatPersonLocation(person)}</option>)}</select></label>
      <label>Marca<input value={vehicleBrand} onChange={(event) => setVehicleBrand(event.target.value)} /></label>
      <label>Modelo<input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} /></label>
      <label>Color<input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} /></label>
      <div className="photo-field"><label>Foto<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) return; const validationError = validatePhoto(file); if (validationError) { setError(validationError); event.target.value = ''; setVehiclePhoto(null); setVehiclePhotoPreview(''); return; } setError(''); setVehiclePhoto(file); setVehiclePhotoPreview(URL.createObjectURL(file)); }} /></label>
        {vehiclePhotoPreview && <div className="photo-preview"><span>Vista previa</span><img src={vehiclePhotoPreview} alt="Vista previa del vehículo" /></div>}
      </div>
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : editingVehicleId ? 'Actualizar vehículo' : 'Guardar vehículo'}</button>
    </form></section></div>}
    {activeView === 'settings' && showSettings && can('SETTINGS_MANAGE') && <section className="form-panel"><div className="panel-heading"><div><span className="eyebrow">CONFIGURACIÓN</span><h2>Movimientos irregulares</h2></div><button type="button" onClick={() => setShowSettings(false)}>Cancelar</button></div><div className="form-grid">
      <form style={{ display: 'grid', alignContent: 'start', gap: 16 }} onSubmit={saveSettings}>
        <label>Comportamiento<select value={irregularMode} onChange={(event) => setIrregularMode(event.target.value as 'BLOCK' | 'SUPERVISOR')}><option value="BLOCK">Bloquear movimiento repetido</option><option value="SUPERVISOR">Solicitar autorización de supervisor</option></select></label>
        <button style={{ width: '100%', alignSelf: 'stretch' }} disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar configuración'}</button>
      </form>
      <form style={{ display: 'grid', alignContent: 'start', gap: 16 }} onSubmit={saveCaptureMode}>
        <label>Forma de captura de movimientos<select value={accessCaptureMode} onChange={(event) => setAccessCaptureMode(event.target.value as AccessCaptureMode)}><option value="MANUAL">Búsqueda manual</option><option value="BARCODE">Código de barras</option><option value="QR">Código QR</option><option value="FINGERPRINT">Huella dactilar (próximamente)</option></select></label>
        <button style={{ width: '100%', alignSelf: 'stretch' }} disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar forma de captura'}</button>
      </form>
    </div></section>}
    {activeView === 'settings' && showSettings && can('SETTINGS_MANAGE') && <section className="form-panel"><div className="panel-heading"><div><span className="eyebrow">RESIDENCIA</span><h2>Personalización</h2></div></div><form className="form-grid" onSubmit={saveResidence}>
      <label>Nombre de la residencia<input required maxLength={120} value={residenceName} onChange={(event) => setResidenceName(event.target.value)} /></label>
      <div className="logo-field"><label>Logo<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) return; const validationError = validateResidenceLogo(file); if (validationError) { setError(validationError); event.target.value = ''; setResidenceLogo(null); setResidenceLogoPreview(''); return; } setError(''); setResidenceLogo(file); setResidenceLogoPreview(URL.createObjectURL(file)); setRemoveResidenceLogo(false); }} /></label>
        {(residenceLogoPreview || residenceLogoUrl) && <div className="logo-preview"><span>Vista previa</span><img src={residenceLogoPreview || residenceLogoUrl} alt="Vista previa del logo de la residencia" /></div>}
      </div>
      {residence?.hasLogo && <label className="checkbox-field"><input type="checkbox" checked={removeResidenceLogo} onChange={(event) => setRemoveResidenceLogo(event.target.checked)} /> Eliminar logo actual</label>}
      <small className="form-full">Formatos permitidos: JPG, PNG o WebP. Tamaño máximo: 2 MB.</small>
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar residencia'}</button>
    </form></section>}
    {activeView === 'people' && showPersonForm && can('PEOPLE_MANAGE') && <div className="modal-backdrop" onClick={() => { setShowPersonForm(false); setEditingPersonId(null); }}><section className="form-panel modal-panel" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">{editingPersonId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</span><h2>{editingPersonId ? 'Editar persona' : 'Registrar persona'}</h2></div><button type="button" className="secondary" onClick={() => { setShowPersonForm(false); setEditingPersonId(null); }}>Cerrar</button></div><form className="form-grid" onSubmit={createPerson}>
      <label>Tipo<select value={personType} onChange={(event) => setPersonType(event.target.value as Person['type'])}><option value="RESIDENTE">Residente</option><option value="VISITANTE">Visitante</option></select></label>
      <label>Nombre completo<input required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
      {personType === 'RESIDENTE' && <label>Correo electrónico<input type="email" maxLength={254} value={personEmail} onChange={(event) => setPersonEmail(event.target.value)} /></label>}
      <div style={{ gridColumn: '1 / -1', fontWeight: 700 }}>Ubicación residencial</div>
      <label>Tipo de sector<select required value={buildingSectionType} onChange={(event) => setBuildingSectionType(event.target.value as BuildingSectionType | '')}><option value="">Selecciona Torre o interior</option><option value="TORRE">Torre</option><option value="INTERIOR">Interior</option></select></label>
      <label>Número de torre o interior<input required maxLength={30} value={buildingSectionNumber} onChange={(event) => setBuildingSectionNumber(event.target.value)} placeholder="7" /></label>
      <label>Número de apartamento<input required value={apartmentNumber} onChange={(event) => setApartmentNumber(event.target.value)} placeholder="302" /></label>
      <label>Tipo de documento<select value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)}><option value="">Sin documento</option>{documentTypes.map((documentType) => <option key={documentType.id} value={documentType.id}>{documentType.code} - {documentType.name}</option>)}</select></label>
      <label>Número de documento<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.toUpperCase())} /></label>
      <label>Teléfono<input inputMode="tel" placeholder="3212811515" value={phone} onChange={(event) => setPhone(unformatColombianPhone(event.target.value))} onBlur={(event) => setPhone(formatColombianPhone(event.target.value))} onFocus={(event) => setPhone(unformatColombianPhone(event.target.value))} /></label>
      <div className="photo-field"><label>Foto<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) return; const validationError = validatePhoto(file); if (validationError) { setError(validationError); event.target.value = ''; setPersonPhoto(null); setPersonPhotoPreview(''); return; } setError(''); setPersonPhoto(file); setPersonPhotoPreview(URL.createObjectURL(file)); }} /></label>
        {personPhotoPreview && <div className="photo-preview"><span>Vista previa</span><img src={personPhotoPreview} alt="Vista previa de la persona" /></div>}
      </div>
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar persona'}</button>
    </form></section></div>}
    {activeView === 'movements' && showAccessForm && can('ACCESS_REGISTER') && <section className="form-panel"><div className="panel-heading"><div><span className="eyebrow">MOVIMIENTO</span><h2>Registrar acceso</h2></div><button className="secondary" onClick={() => setShowAccessForm(false)}>Cancelar</button></div>{people.length ? <form className="form-grid" onSubmit={createAccess}>
      <label>Persona<input role="combobox" aria-autocomplete="list" aria-controls="access-person-results" aria-expanded={personSearch.trim().length > 0 && !selectedPersonId} value={personSearch} onChange={(event) => { setPersonSearch(event.target.value); setSelectedPersonId(''); setSelectedVehicleId(''); setVehicleSearch(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && personSearch.trim() && !selectedPersonId && matchingAccessPeople.length > 0) { event.preventDefault(); const person = matchingAccessPeople[0]; setSelectedPersonId(String(person.id)); setPersonSearch(person.fullName); } }} placeholder="Buscar por nombre o documento" />{personSearch.trim() && !selectedPersonId && <div id="access-person-results" className="access-search-results" role="listbox">{matchingAccessPeople.length ? matchingAccessPeople.slice(0, 8).map((person) => <button key={person.id} type="button" role="option" aria-selected="false" className="access-search-result" onClick={() => { setSelectedPersonId(String(person.id)); setSelectedVehicleId(''); setPersonSearch(person.fullName); setVehicleSearch(''); }}>{person.fullName} · {person.documentNumber || 'Sin documento'} · {formatPersonLocation(person)}</button>) : <span className="access-search-empty">No se encontraron personas.</span>}</div>}</label>
      <label>Vehículo (opcional)<input role="combobox" aria-autocomplete="list" aria-controls="access-vehicle-results" aria-expanded={vehicleSearch.trim().length > 0 && !selectedVehicleId} value={vehicleSearch} onChange={(event) => { setVehicleSearch(event.target.value); setSelectedVehicleId(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && vehicleSearch.trim() && !selectedVehicleId && matchingAccessVehicles.length > 0) { event.preventDefault(); const vehicle = matchingAccessVehicles[0]; setSelectedVehicleId(String(vehicle.id)); setSelectedPersonId(String(vehicle.personId)); setPersonSearch(vehicle.person.fullName); setVehicleSearch(vehicle.plate); } }} placeholder="Buscar por placa o propietario" />{vehicleSearch.trim() && !selectedVehicleId && <div id="access-vehicle-results" className="access-search-results" role="listbox">{matchingAccessVehicles.length ? matchingAccessVehicles.slice(0, 8).map((vehicle) => <button key={vehicle.id} type="button" role="option" aria-selected="false" className="access-search-result" onClick={() => { setSelectedVehicleId(String(vehicle.id)); setSelectedPersonId(String(vehicle.personId)); setPersonSearch(vehicle.person.fullName); setVehicleSearch(vehicle.plate); }}>{vehicle.plate} · {vehicle.person.fullName} · {formatPersonLocation(vehicle.person)}</button>) : <span className="access-search-empty">No se encontraron vehículos.</span>}</div>}</label>
      <label>Movimiento<select value={accessType} onChange={(event) => setAccessType(event.target.value as 'ENTRADA' | 'SALIDA')}><option value="ENTRADA">Entrada</option><option value="SALIDA">Salida</option></select></label>
      {supervisorRequired && <><div className="notice form-full">Se requiere autorización de supervisor para este movimiento irregular.</div><label>Correo del supervisor<input type="email" required value={supervisorEmail} onChange={(event) => setSupervisorEmail(event.target.value)} /></label><label>Contraseña del supervisor<input type="password" required value={supervisorPassword} onChange={(event) => setSupervisorPassword(event.target.value)} /></label></>}
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar movimiento'}</button>
    </form> : <div className="empty">Primero registra un residente o visitante.</div>}</section>}
    {activeView === 'movements' && can('DASHBOARD_VIEW') && <section className="cards">
      <article><span>Residentes activos</span><strong>{totals.residents}</strong><small>Personas registradas</small></article>
      <article><span>Visitantes registrados</span><strong>{totals.visitors}</strong><small>Con acceso vigente</small></article>
      <article><span>Movimientos de hoy</span><strong>{totals.today}</strong><small>Entradas y salidas</small></article>
      <article><span>Encomiendas pendientes</span><strong>{totals.pendingDeliveries}</strong><small>Por entregar a residentes</small></article>
    </section>}
    {activeView === 'people' && can('PEOPLE_VIEW') && <section className="panel vehicle-panel"><div className="panel-heading"><div><span className="eyebrow">PERSONAS</span><h2>Personas registradas</h2></div><div className="panel-actions"><span>{people.length} activas</span>{can('PEOPLE_MANAGE') && <button onClick={() => { setEditingPersonId(null); setPersonEmail(''); setShowPersonForm(true); }}>Registrar persona</button>}</div></div>
      {people.length ? <div className="table"><div className="row people-row heading"><span>Nombre</span><span>Tipo</span><span>Ubicación</span><span>Documento</span><span>Acciones</span></div>{people.map((person) => <div className="row people-row record-clickable" key={person.id} role="button" tabIndex={0} onClick={() => setSelectedPerson(person)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedPerson(person); }}><div className="person-summary">{person.photoUrl && <img className="person-thumbnail" src={person.photoUrl} alt={`Foto de ${person.fullName}`} />}<strong>{person.fullName}</strong></div><span>{person.type === 'RESIDENTE' ? 'Residente' : 'Visitante'}</span><span>{formatPersonLocation(person)}</span><span>{person.documentNumber || 'No registrado'}</span>{can('PEOPLE_MANAGE') && <button type="button" className="small-button" onClick={(event) => { event.stopPropagation(); editPerson(person); }}>Editar</button>}</div>)}</div> : <div className="empty">Aún no hay personas registradas.</div>}
    </section>}
    {activeView === 'vehicles' && can('VEHICLES_VIEW') && <section className="panel vehicle-panel"><div className="panel-heading"><div><span className="eyebrow">INVENTARIO</span><h2>Vehículos registrados</h2></div><div className="panel-actions"><span>{vehicles.length} activos</span>{can('VEHICLES_MANAGE') && <button onClick={() => setShowVehicleForm(true)}>Registrar vehículo</button>}</div></div>
      {vehicles.length ? <div className="table vehicles-table"><div className="row vehicle-row heading"><span>Foto</span><span>Placa</span><span>Tipo</span><span>Marca</span><span>Modelo</span><span>Color</span><span>Persona</span><span>Ubicación</span><span>Acciones</span></div>{vehicles.map((vehicle) => <div className="row vehicle-row record-clickable" key={vehicle.id} role="button" tabIndex={0} onClick={() => setSelectedVehicle(vehicle)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedVehicle(vehicle); }}><div className="vehicle-photo-cell">{vehicle.photoUrl ? <img className="vehicle-thumbnail" src={vehicle.photoUrl} alt={`Foto de ${vehicle.plate}`} /> : <span className="vehicle-photo-placeholder">—</span>}</div><strong>{vehicle.plate}</strong><span>{vehicle.type === 'AUTOMOVIL' ? 'Automóvil' : vehicle.type === 'MOTOCICLETA' ? 'Motocicleta' : vehicle.type === 'BICICLETA' ? 'Bicicleta' : 'Otro'}</span><span>{vehicle.brand || '—'}</span><span>{vehicle.model || '—'}</span><span>{vehicle.color || '—'}</span><span>{vehicle.person.fullName}</span><span>{formatPersonLocation(vehicle.person)}</span><div className="vehicle-actions">{can('VEHICLES_MANAGE') && <button type="button" className="small-button" onClick={(event) => { event.stopPropagation(); editVehicle(vehicle); }}>Editar</button>}</div></div>)}</div> : <div className="empty">Aún no hay vehículos registrados.</div>}
    </section>}
    {activeView === 'deliveries' && showDeliveryForm && can('DELIVERIES_MANAGE') && <div className="modal-backdrop" onClick={() => setShowDeliveryForm(false)}><section className="form-panel modal-panel" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">NUEVA ENCOMIENDA</span><h2>Registrar encomienda</h2></div><button type="button" className="secondary" onClick={() => setShowDeliveryForm(false)}>Cerrar</button></div>{people.length ? <form className="form-grid" onSubmit={createDelivery}>
      <label>Destinatario<select required value={deliveryPersonId} onChange={(event) => setDeliveryPersonId(event.target.value)}><option value="">Selecciona un residente o visitante</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {formatPersonLocation(person)}</option>)}</select></label>
      <label>Tipo de encomienda<select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value as DeliveryKind)}>{(Object.keys(deliveryTypeLabels) as DeliveryKind[]).map((kind) => <option key={kind} value={kind}>{deliveryTypeLabels[kind]}</option>)}</select></label>
      <label>Mensajería o remitente<input maxLength={120} placeholder="Amazon, Rappi, Servientrega..." value={deliveryCourier} onChange={(event) => setDeliveryCourier(event.target.value)} /></label>
      <label>Descripción<input maxLength={300} placeholder="Caja mediana, sobre, comida..." value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} /></label>
      <label>Guía o número de factura<input maxLength={120} value={deliveryTrackingCode} onChange={(event) => setDeliveryTrackingCode(event.target.value)} /></label>
      <label>Observaciones<input maxLength={500} value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} /></label>
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar encomienda'}</button>
    </form> : <div className="empty">Primero registra un residente o visitante.</div>}</section></div>}
    {activeView === 'deliveries' && can('DELIVERIES_VIEW') && <section className="panel vehicle-panel"><div className="panel-heading"><div><span className="eyebrow">ENCOMIENDAS</span><h2>Control de encomiendas</h2></div><div className="panel-actions"><span>{totals.pendingDeliveries} pendientes</span>{can('DELIVERIES_MANAGE') && <button onClick={() => setShowDeliveryForm(true)}>Registrar encomienda</button>}</div></div>
      <div className="delivery-filters"><button type="button" className={deliveryFilter === 'PENDIENTE' ? 'active-nav' : 'secondary'} onClick={() => setDeliveryFilter('PENDIENTE')}>Pendientes</button><button type="button" className={deliveryFilter === 'DEVUELTA' ? 'active-nav' : 'secondary'} onClick={() => setDeliveryFilter('DEVUELTA')}>Devueltas</button><button type="button" className={deliveryFilter === 'TODAS' ? 'active-nav' : 'secondary'} onClick={() => setDeliveryFilter('TODAS')}>Todas</button></div>
      {deliveries.filter((delivery) => deliveryFilter === 'TODAS' || delivery.status === deliveryFilter).length ? <div className="table"><div className="row delivery-row heading"><span>Destinatario</span><span>Ubicación</span><span>Tipo</span><span>Detalle</span><span>Recibida</span><span>Estado</span><span>Acciones</span></div>{deliveries.filter((delivery) => deliveryFilter === 'TODAS' || delivery.status === deliveryFilter).map((delivery) => <div className="row delivery-row" key={delivery.id}><strong>{delivery.person.fullName}</strong><span>{formatPersonLocation(delivery.person)}</span><span>{deliveryTypeLabels[delivery.type]}</span><span>{delivery.description || delivery.courier || '—'}{delivery.trackingCode ? ` · ${delivery.trackingCode}` : ''}</span><span>{new Date(delivery.receivedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span><span className={`delivery-status ${delivery.status.toLowerCase()}`}>{deliveryStatusLabels[delivery.status]}</span><div className="delivery-actions">{can('DELIVERIES_MANAGE') && (delivery.status === 'PENDIENTE' ? <><button type="button" className="small-button" onClick={() => { setClosingDelivery(delivery); setDeliveredToName(delivery.person.fullName); }}>Entregar</button><button type="button" className="small-button secondary" onClick={() => { if (window.confirm('¿Marcar esta encomienda como devuelta?')) updateDeliveryStatus(delivery, 'DEVUELTA'); }}>Devolver</button></> : <span className="delivery-closed">{delivery.deliveredToName ? `Recibió: ${delivery.deliveredToName}` : delivery.deliveredBy?.name ?? 'Cerrada'}</span>)}</div></div>)}</div> : <div className="empty">{deliveryFilter === 'PENDIENTE' ? 'No hay encomiendas pendientes.' : deliveryFilter === 'DEVUELTA' ? 'No hay encomiendas devueltas.' : 'Aún no hay encomiendas registradas.'}</div>}
    </section>}
    {closingDelivery && can('DELIVERIES_MANAGE') && <div className="modal-backdrop" onClick={() => setClosingDelivery(null)}><section className="form-panel modal-panel" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">ENTREGA DE ENCOMIENDA</span><h2>{closingDelivery.person.fullName} · {formatPersonLocation(closingDelivery.person)}</h2></div><button type="button" className="secondary" onClick={() => setClosingDelivery(null)}>Cerrar</button></div><form className="form-grid" onSubmit={deliverEncomienda}>
      <p className="form-full">{deliveryTypeLabels[closingDelivery.type]}{closingDelivery.description ? ` · ${closingDelivery.description}` : ''}{closingDelivery.courier ? ` · ${closingDelivery.courier}` : ''}</p>
      <label>¿Quién recibe la encomienda?<input required maxLength={120} value={deliveredToName} onChange={(event) => setDeliveredToName(event.target.value)} placeholder="Nombre de quien retira" /></label>
      <button disabled={saving} type="submit">{saving ? 'Guardando...' : 'Confirmar entrega'}</button>
    </form></section></div>}
    {activeView === 'visits' && (can('ACCESS_VIEW') || can('ACCESS_REGISTER')) && <section className="panel vehicle-panel">
      <div className="panel-heading"><div><span className="eyebrow">PORTERÍA</span><h2>Control de visitas</h2></div></div>
      {can('ACCESS_REGISTER') && <div className="visit-registration">
        <p>Si la visita llegó sin prerregistro, contacta al residente por el proceso habitual. Solo después de que confirme la autorización, registra aquí la visita; el sistema dejará constancia de que se originó en portería.</p>
        <form className="form-grid" onSubmit={saveVisit}>
          <label>Residente que autoriza<select required value={visitResidentPersonId} onChange={(event) => setVisitResidentPersonId(event.target.value)}><option value="">Selecciona un residente</option>{people.filter((person) => person.type === 'RESIDENTE').map((person) => <option key={person.id} value={person.id}>{person.fullName} · {formatPersonLocation(person)}</option>)}</select></label>
          <label className="checkbox-field visit-approval"><input type="checkbox" required checked={visitResidentApprovalConfirmed} onChange={(event) => setVisitResidentApprovalConfirmed(event.target.checked)} /> Confirmo que el residente autorizó esta visita fuera del sistema (por ejemplo, por llamada).</label>
          <label>Nombre del visitante<input required minLength={2} maxLength={120} value={visitVisitorName} onChange={(event) => setVisitVisitorName(event.target.value)} /></label>
          <label>Documento (opcional)<input maxLength={40} value={visitVisitorDocument} onChange={(event) => setVisitVisitorDocument(event.target.value)} /></label>
          <label className="form-full">Observaciones (opcional)<textarea rows={3} maxLength={500} value={visitObservations} onChange={(event) => setVisitObservations(event.target.value)} placeholder="Comentario adicional sobre la visita" /></label>
          <label>Válida desde<input type="datetime-local" required value={visitWindow.validFrom} onChange={(event) => { setVisitStartEdited(true); setVisitWindow((current) => ({ validFrom: event.target.value, validUntil: visitEndEdited ? current.validUntil : endOfLocalDay(event.target.value) })); }} /></label>
          <label>Válida hasta<input type="datetime-local" required min={visitWindow.validFrom} value={visitWindow.validUntil} onChange={(event) => { setVisitEndEdited(true); setVisitWindow((current) => ({ ...current, validUntil: event.target.value })); }} /></label>
          <label>Placa del vehículo (opcional)<input maxLength={10} value={visitVehiclePlate} onChange={(event) => setVisitVehiclePlate(event.target.value.toUpperCase())} /></label>
          {visitVehiclePlate && <label>Tipo de vehículo<select value={visitVehicleType} onChange={(event) => setVisitVehicleType(event.target.value as Vehicle['type'])}><option value="AUTOMOVIL">Automóvil</option><option value="MOTOCICLETA">Motocicleta</option><option value="BICICLETA">Bicicleta</option><option value="OTRO">Otro</option></select></label>}
          <button disabled={saving || !visitResidentApprovalConfirmed || !visitResidentPersonId} type="submit">{saving ? 'Guardando...' : 'Registrar visita autorizada'}</button>
        </form>
      </div>}
      <label className="visit-search">Buscar visita<input type="search" aria-label="Buscar visita por nombre o documento" value={visitSearch} onChange={(event) => setVisitSearch(event.target.value)} placeholder="Buscar por nombre, documento o placa" /></label>
      {matchingVisits.length ? <div className="table"><div className="row staff-visit-row heading"><span>Visitante</span><span>Residente</span><span>Origen / vigencia</span><span>Estado / acción</span></div>{matchingVisits.map((visit) => <div className="row staff-visit-row" key={visit.id}>
        <strong>{visit.visitorName}{visit.visitorDocumentNumber ? <small>Documento: {visit.visitorDocumentNumber}</small> : null}{visit.vehiclePlate ? <small>Vehículo: {visit.vehiclePlate}</small> : null}{visit.observations ? <small>Observaciones: {visit.observations}</small> : null}</strong>
        <span>{visit.resident.fullName} · Apto. {visit.resident.apartmentNumber}</span>
        <span>{visit.origin === 'PORTERIA' ? `Portería · autorización confirmada por ${visit.createdBy.name}` : 'Prerregistro del residente'}<small>{new Date(visit.validFrom).toLocaleString()} – {new Date(visit.validUntil).toLocaleString()}</small></span>
        <span>{visitStatusLabels[visit.status]}{visit.status === 'AUTORIZADA' && Date.now() >= Date.parse(visit.validFrom) && Date.now() < Date.parse(visit.validUntil) && can('ACCESS_REGISTER') && <button type="button" className="small-button" onClick={() => void updateVisitAccess(visit, 'check-in')}>Registrar entrada</button>}{visit.status === 'EN_CURSO' && can('ACCESS_REGISTER') && <button type="button" className="small-button secondary" onClick={() => void updateVisitAccess(visit, 'check-out')}>Registrar salida</button>}</span>
      </div>)}</div> : <div className="empty">{visitSearch.trim() ? 'No se encontraron visitas con ese nombre, documento o placa.' : 'No hay visitas registradas.'}</div>}
    </section>}
    {activeView === 'users' && can('USERS_MANAGE') && <UserAdministration canManageRoles={can('ROLES_MANAGE')} isSuperAdmin={userRole === 'SUPER_ADMINISTRADOR'} currentUserId={currentUserId} />}
    {activeView === 'communications' && (userRole === 'SUPER_ADMINISTRADOR' || userRole === 'ADMINISTRADOR') && <ResidentCommunications />}
    {activeView === 'movements' && can('ACCESS_VIEW') && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Últimos movimientos</h2></div><div className="panel-actions"><span className="live">● En vivo</span>{can('ACCESS_REGISTER') && <button onClick={openAccessForm}>Registrar acceso</button>}</div></div>
      {logs.length ? <div className="table"><div className="row movement-row heading"><span>Persona responsable</span><span>Ubicación</span><span>Vehículo</span><span>Movimiento</span><span>Hora</span></div>{logs.map((log) => <div className="row movement-row movement-row-clickable" key={log.id} role="button" tabIndex={0} onClick={() => setSelectedLog(log)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedLog(log); }}><strong>{log.person.fullName}</strong><span>{formatPersonLocation(log.person)}</span><span>{log.vehicle ? `${log.vehicle.plate} · Vehículo` : 'Peatonal'}</span><span className={log.accessType === 'ENTRADA' ? 'entry' : 'exit'}>{log.accessType === 'ENTRADA' ? 'Entrada' : 'Salida'}</span><span>{new Date(log.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>)}</div> : <div className="empty">Aún no hay movimientos registrados.</div>}
    </section>}
    {activeView === 'movements' && can('ACCESS_VIEW') && <section className="panel visit-panel"><div className="panel-heading"><div><span className="eyebrow">VISITANTES</span><h2>Visitantes dentro de la residencia</h2></div></div>
      {activeVisits.length ? <div className="table"><div className="row staff-visit-row heading"><span>Visitante</span><span>Residente</span><span>Entrada</span><span>Acción</span></div>{activeVisits.map((visit) => {
        const entry = visit.accessLogs.find((log) => log.accessType === 'ENTRADA');
        return <div className="row staff-visit-row" key={visit.id}>
          <strong>{visit.visitorName}{visit.visitorDocumentNumber ? <small>Documento: {visit.visitorDocumentNumber}</small> : null}{visit.vehiclePlate ? <small>Vehículo: {visit.vehiclePlate}</small> : null}</strong>
          <span>{visit.resident.fullName} · {formatPersonLocation(visit.resident)}</span>
          <span>{entry ? new Date(entry.occurredAt).toLocaleString() : 'Sin hora registrada'}</span>
          <span>{can('ACCESS_REGISTER') && <button type="button" className="small-button secondary" onClick={() => void updateVisitAccess(visit, 'check-out')}>Registrar salida</button>}</span>
        </div>;
      })}</div> : <div className="empty">No hay visitantes registrados dentro de la residencia.</div>}
    </section>}
    {selectedLog && <div className="detail-backdrop" onClick={() => setSelectedLog(null)}><section className="movement-detail" role="dialog" aria-modal="true" aria-labelledby="movement-detail-title" onClick={(event) => event.stopPropagation()}>
      <div className="panel-heading"><div><span className="eyebrow">DETALLE DEL MOVIMIENTO</span><h2 id="movement-detail-title">{selectedLog.accessType === 'ENTRADA' ? 'Entrada' : 'Salida'} · {new Date(selectedLog.occurredAt).toLocaleString()}</h2></div><button className="secondary" onClick={() => setSelectedLog(null)}>Cerrar</button></div>
      <div className="detail-grid"><div className="detail-card"><h3>Persona</h3>{selectedPersonPhoto ? <img className="detail-photo" src={selectedPersonPhoto} alt={`Foto de ${selectedLog.person.fullName}`} /> : <div className="detail-photo-placeholder">Sin foto</div>}<p><strong>{selectedLog.person.fullName}</strong></p><p>{selectedLog.person.type === 'VISITANTE' ? 'Visitante' : 'Residente'} · {formatPersonLocation(selectedLog.person)}</p><p>Documento: {selectedLog.person.documentNumber || 'No registrado'}</p><p>Teléfono: {selectedLog.person.phone || 'No registrado'}</p></div>
        <div className="detail-card"><h3>Vehículo</h3>{selectedLog.vehicle ? <><div className="detail-photo-wrap">{selectedVehiclePhoto ? <img className="detail-photo" src={selectedVehiclePhoto} alt={`Foto del vehículo ${selectedLog.vehicle.plate}`} /> : <div className="detail-photo-placeholder">Sin foto</div>}</div><p><strong>{selectedLog.vehicle.plate}</strong></p><p>Tipo: {selectedLog.vehicle.type === 'AUTOMOVIL' ? 'Automóvil' : selectedLog.vehicle.type === 'MOTOCICLETA' ? 'Motocicleta' : selectedLog.vehicle.type === 'BICICLETA' ? 'Bicicleta' : 'Otro'}</p><p>Marca: {selectedLog.vehicle.brand || 'No registrada'}</p><p>Modelo: {selectedLog.vehicle.model || 'No registrado'}</p><p>Color: {selectedLog.vehicle.color || 'No registrado'}</p></> : <div className="empty">Este movimiento no está asociado a un vehículo.</div>}</div></div>
    </section></div>}
    {selectedPerson && <div className="detail-backdrop" onClick={() => setSelectedPerson(null)}><section className="movement-detail" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">DETALLE DE PERSONA</span><h2>{selectedPerson.fullName}</h2></div><button className="secondary" onClick={() => setSelectedPerson(null)}>Cerrar</button></div><div className="detail-grid"><div className="detail-card">{selectedPerson.photoUrl ? <img className="detail-photo" src={selectedPerson.photoUrl} alt={`Foto de ${selectedPerson.fullName}`} /> : <div className="detail-photo-placeholder">Sin foto</div>}<p><strong>{selectedPerson.type === 'RESIDENTE' ? 'Residente' : 'Visitante'}</strong></p><p>Sector: {formatBuildingSection(selectedPerson)}</p><p>Apartamento: {selectedPerson.apartmentNumber}</p><p>Documento: {selectedPerson.documentType?.code || 'No registrado'} {selectedPerson.documentNumber || ''}</p><p>Teléfono: {selectedPerson.phone || 'No registrado'}</p>{selectedPerson.type === 'RESIDENTE' && <p>Correo: {selectedPerson.email || 'No registrado'}</p>}</div><div className="detail-card"><h3>Acciones</h3>{can('PEOPLE_MANAGE') && <><button onClick={() => { setSelectedPerson(null); editPerson(selectedPerson); }}>Editar persona</button><label className="file-button detail-file-button">Subir o reemplazar foto<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0] ?? null; await uploadPhoto('people', selectedPerson.id, file); if (file) setSelectedPerson({ ...selectedPerson, photoUrl: URL.createObjectURL(file) }); }} /></label>{selectedPerson.photoUrl && <button className="small-button danger-button" onClick={async () => { await deletePersonPhoto(selectedPerson.id); setSelectedPerson({ ...selectedPerson, photoUrl: null }); }}>Eliminar foto</button>}</>}<AccessCodeCard code={selectedPerson.accessCode} label="Código de la persona" /></div></div></section></div>}
    {selectedVehicle && <div className="detail-backdrop" onClick={() => setSelectedVehicle(null)}><section className="movement-detail" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">DETALLE DE VEHÍCULO</span><h2>{selectedVehicle.plate}</h2></div><button className="secondary" onClick={() => setSelectedVehicle(null)}>Cerrar</button></div><div className="detail-grid"><div className="detail-card">{selectedVehicle.photoUrl ? <img className="detail-photo" src={selectedVehicle.photoUrl} alt={`Foto del vehículo ${selectedVehicle.plate}`} /> : <div className="detail-photo-placeholder">Sin foto</div>}<p><strong>{selectedVehicle.type === 'AUTOMOVIL' ? 'Automóvil' : selectedVehicle.type === 'MOTOCICLETA' ? 'Motocicleta' : selectedVehicle.type === 'BICICLETA' ? 'Bicicleta' : 'Otro'}</strong></p><p>Marca: {selectedVehicle.brand || 'No registrada'}</p><p>Modelo: {selectedVehicle.model || 'No registrado'}</p><p>Color: {selectedVehicle.color || 'No registrado'}</p><p>Propietario: {selectedVehicle.person.fullName}</p><p>Ubicación: {formatPersonLocation(selectedVehicle.person)}</p></div><div className="detail-card"><h3>Acciones</h3>{can('VEHICLES_MANAGE') && <><button onClick={() => { setSelectedVehicle(null); editVehicle(selectedVehicle); }}>Editar vehículo</button><label className="file-button detail-file-button">Subir o reemplazar foto<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0] ?? null; await uploadPhoto('vehicles', selectedVehicle.id, file); if (file) setSelectedVehicle({ ...selectedVehicle, photoUrl: URL.createObjectURL(file) }); }} /></label>{selectedVehicle.photoUrl && <button className="small-button danger-button" onClick={async () => { await deleteVehiclePhoto(selectedVehicle.id); setSelectedVehicle({ ...selectedVehicle, photoUrl: null }); }}>Eliminar foto</button>}</>}<AccessCodeCard code={selectedVehicle.accessCode} label="Código del vehículo" /></div></div></section></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
