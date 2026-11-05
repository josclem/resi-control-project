import nodemailer from 'nodemailer';

export type MailConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword: string;
  from: string;
};

export type ResidentInvitationMailer = {
  isConfigured(): boolean;
  sendInvitation(input: { email: string; residentName: string; residenceName: string; url: string }): Promise<void>;
};

export function getMailConfiguration(environment: NodeJS.ProcessEnv): MailConfiguration | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_APP_PASSWORD, EMAIL_FROM, WEB_APP_URL } = environment;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_APP_PASSWORD || !EMAIL_FROM || !WEB_APP_URL) return null;
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT debe ser un puerto válido.');
  if (SMTP_SECURE !== 'true' && SMTP_SECURE !== 'false') throw new Error('SMTP_SECURE debe ser true o false.');
  const appUrl = new URL(WEB_APP_URL);
  if (appUrl.protocol !== 'https:' && !(appUrl.protocol === 'http:' && appUrl.hostname === 'localhost')) {
    throw new Error('WEB_APP_URL debe usar HTTPS fuera de localhost.');
  }
  return {
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === 'true',
    user: SMTP_USER,
    appPassword: SMTP_APP_PASSWORD.replace(/\s/g, ''),
    from: EMAIL_FROM,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

export function createResidentInvitationMailer(environment: NodeJS.ProcessEnv = process.env): ResidentInvitationMailer {
  return {
    isConfigured: () => Boolean(getMailConfiguration(environment)),
    async sendInvitation({ email, residentName, residenceName, url }) {
      const configuration = getMailConfiguration(environment);
      if (!configuration) throw new Error('Configura el servicio SMTP antes de enviar invitaciones.');
      const transporter = nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: { user: configuration.user, pass: configuration.appPassword },
      });
      await transporter.sendMail({
        from: configuration.from,
        to: email,
        subject: `Activa tu cuenta de residente en ${residenceName}`,
        text: `Hola ${residentName},\n\nTe invitaron a activar tu cuenta de residente en ${residenceName}. Abre este enlace antes de que venza:\n${url}\n\nSi no esperabas esta invitación, puedes ignorar este mensaje.`,
        html: `<p>Hola ${escapeHtml(residentName)},</p><p>Te invitaron a activar tu cuenta de residente en <strong>${escapeHtml(residenceName)}</strong>.</p><p><a href="${escapeHtml(url)}">Activar mi cuenta</a></p><p>Este enlace vence en 48 horas y solo se puede usar una vez. Si no esperabas esta invitación, puedes ignorar este mensaje.</p>`,
      });
    },
  };
}
