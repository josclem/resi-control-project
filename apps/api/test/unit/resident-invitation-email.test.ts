import { describe, expect, it } from 'vitest';
import { createResidentInvitationMailer } from '../../src/resident-invitation-email.js';

describe('correo de invitación de residentes', () => {
  it('informa que SMTP está desconfigurado sin fingir que el correo fue enviado', async () => {
    const mailer = createResidentInvitationMailer({});

    expect(mailer.isConfigured()).toBe(false);
    await expect(mailer.sendInvitation({
      email: 'resident@example.test',
      residentName: 'Residente',
      residenceName: 'Residencia',
      url: 'http://localhost:5173/#invite=token',
    })).rejects.toThrow('Configura el servicio SMTP antes de enviar invitaciones.');
  });

  it('acepta los parámetros SMTP de Gmail y exige HTTPS fuera de localhost', () => {
    const mailer = createResidentInvitationMailer({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'resi@example.com',
      SMTP_APP_PASSWORD: 'app-password',
      EMAIL_FROM: 'Accivia <resi@example.com>',
      WEB_APP_URL: 'https://resi.example.com',
    });
    expect(mailer.isConfigured()).toBe(true);

    const insecureMailer = createResidentInvitationMailer({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'resi@example.com',
      SMTP_APP_PASSWORD: 'app-password',
      EMAIL_FROM: 'Accivia <resi@example.com>',
      WEB_APP_URL: 'http://resi.example.com',
    });
    expect(() => insecureMailer.isConfigured()).toThrow('WEB_APP_URL debe usar HTTPS fuera de localhost.');

    const unsafeLocalMailer = createResidentInvitationMailer({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'resi@example.com',
      SMTP_APP_PASSWORD: 'app-password',
      EMAIL_FROM: 'Accivia <resi@example.com>',
      WEB_APP_URL: 'ftp://localhost',
    });
    expect(() => unsafeLocalMailer.isConfigured()).toThrow('WEB_APP_URL debe usar HTTPS fuera de localhost.');
  });
});
