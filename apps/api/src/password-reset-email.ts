import nodemailer from 'nodemailer';
import { getMailConfiguration, MailConfiguration } from './resident-invitation-email.js';
import { getResendConfiguration, sendWithResend } from './resend-email.js';

export type PasswordResetMailer = {
  isConfigured(): boolean;
  sendPasswordReset(input: { email: string; userName: string; url: string }): Promise<void>;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

export function createPasswordResetMailer(environment: NodeJS.ProcessEnv = process.env): PasswordResetMailer {
  function configuration(): MailConfiguration {
    const result = getMailConfiguration(environment);
    if (!result) throw new Error('Configura el servicio SMTP antes de enviar recuperaciones de contraseña.');
    return result;
  }

  return {
    isConfigured: () => Boolean(getResendConfiguration(environment) || getMailConfiguration(environment)),
    async sendPasswordReset({ email, userName, url }) {
      const content = {
        subject: 'Restablece tu contraseña de Accivia',
        text: `Hola ${userName},\n\nRecibimos una solicitud para restablecer tu contraseña de Accivia. Abre este enlace antes de que venza:\n${url}\n\nSi no solicitaste este cambio, puedes ignorar este mensaje.`,
        html: `<p>Hola ${escapeHtml(userName)},</p><p>Recibimos una solicitud para restablecer tu contraseña de Accivia.</p><p><a href="${escapeHtml(url)}">Restablecer mi contraseña</a></p><p>Este enlace vence en una hora y solo se puede usar una vez. Si no solicitaste este cambio, puedes ignorar este mensaje.</p>`,
      };
      const resend = getResendConfiguration(environment);
      if (resend) {
        await sendWithResend(resend, { to: email, ...content });
        return;
      }
      const settings = configuration();
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: { user: settings.user, pass: settings.appPassword },
      });
      await transporter.sendMail({
        from: settings.from,
        to: email,
        ...content,
      });
    },
  };
}
