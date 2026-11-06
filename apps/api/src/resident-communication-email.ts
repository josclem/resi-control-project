import nodemailer from 'nodemailer';
import { getMailConfiguration, MailConfiguration } from './resident-invitation-email.js';
import { getResendConfiguration, sendWithResend } from './resend-email.js';

export type ResidentCommunicationMailer = {
  isConfigured(): boolean;
  sendMessage(input: {
    email: string;
    residenceName: string;
    subject: string;
    body: string;
    unsubscribeUrl?: string;
  }): Promise<void>;
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

export function createResidentCommunicationMailer(environment: NodeJS.ProcessEnv = process.env): ResidentCommunicationMailer {
  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

  function configuration(): MailConfiguration {
    const result = getMailConfiguration(environment);
    if (!result) throw new Error('Configura el servicio SMTP antes de enviar comunicados.');
    return result;
  }

  function getTransporter() {
    if (!transporter) {
      const settings = configuration();
      transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: { user: settings.user, pass: settings.appPassword },
      });
    }
    return transporter;
  }

  return {
    isConfigured: () => Boolean(getResendConfiguration(environment) || getMailConfiguration(environment)),
    async sendMessage({ email, residenceName, subject, body, unsubscribeUrl }) {
      const paragraphs = escapeHtml(body).replace(/\r?\n/g, '<br>');
      const unsubscribe = unsubscribeUrl
        ? `<p>Si no deseas recibir mensajes promocionales, <a href="${escapeHtml(unsubscribeUrl)}">puedes darte de baja aquí</a>.</p>`
        : '';
      const text = `Mensaje para residentes de ${residenceName}:\n\n${body}${unsubscribeUrl ? `\n\nPara dejar de recibir mensajes promocionales: ${unsubscribeUrl}` : ''}`;
      const html = `<p>Mensaje para residentes de <strong>${escapeHtml(residenceName)}</strong>:</p><p>${paragraphs}</p>${unsubscribe}`;
      const resend = getResendConfiguration(environment);
      if (resend) {
        await sendWithResend(resend, { to: email, subject, text, html });
      } else {
        const settings = configuration();
        await getTransporter().sendMail({ from: settings.from, to: email, subject, text, html });
      }
    },
  };
}
