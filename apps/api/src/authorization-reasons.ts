export const defaultAuthorizationReasons = [
  { code: 'EMAIL_REQUEST', description: 'Solicitud enviada por correo y confirmada por el residente' },
  { code: 'SIGNED_FORM', description: 'Formulario físico firmado por el residente' },
  { code: 'RESIDENT_REQUEST', description: 'Solicitud directa del residente' },
  { code: 'DATA_UPDATE', description: 'Autorización registrada durante la actualización de datos' },
  { code: 'WHATSAPP_REQUEST', description: 'Solicitud del residente por WhatsApp' },
  { code: 'VERBAL_CONSENT', description: 'Consentimiento verbal registrado por administración' },
] as const;
