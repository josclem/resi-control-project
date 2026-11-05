import { useState } from 'react';
import { apiBaseUrl } from './api';

export function ResidentEmailUnsubscribe({ token }: { token: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function unsubscribe() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/email-preferences/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'No se pudo procesar la solicitud.');
      setMessage(data.message);
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo procesar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page"><section className="login-card">
    <span className="eyebrow">RESI CONTROL</span>
    <h1>Correos promocionales</h1>
    {submitted ? <p>{message}</p> : <><p>Confirma si deseas dejar de recibir correos promocionales de esta residencia.</p>{error && <div className="notice">{error}</div>}<button type="button" disabled={saving} onClick={() => void unsubscribe()}>{saving ? 'Procesando…' : 'Darme de baja'}</button></>}
  </section></main>;
}
