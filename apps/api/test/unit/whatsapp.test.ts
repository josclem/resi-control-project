import { describe, expect, it, vi } from 'vitest';
import { createWhatsAppInvitationSender, WhatsAppDeliveryError, WhatsAppNotConfiguredError } from '../../src/whatsapp.js';

const message = {
  phone: '+573005556677',
  code: '012345',
};

const environment = {
  WHATSAPP_ACCESS_TOKEN: 'test-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_INVITATION_TEMPLATE: 'resident_invitation',
  WHATSAPP_INVITATION_TEMPLATE_LANGUAGE: 'es',
  WHATSAPP_GRAPH_API_VERSION: 'v22.0',
};

describe('WhatsApp invitation sender', () => {
  it('requires an explicit Meta configuration', async () => {
    const sender = createWhatsAppInvitationSender({});
    await expect(sender(message)).rejects.toBeInstanceOf(WhatsAppNotConfiguredError);
  });

  it('sends the authentication template with the code in its body and copy-code button', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const sender = createWhatsAppInvitationSender(environment, fetcher);

    await sender(message);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v22.0/123456789/messages');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messaging_product: 'whatsapp',
      to: message.phone,
      template: {
        name: 'resident_invitation',
        language: { code: 'es' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: message.code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: message.code }],
          },
        ],
      },
    });
  });

  it('reports provider and transport failures without exposing credentials', async () => {
    const rejectedResponse = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const rejectedSender = createWhatsAppInvitationSender(environment, rejectedResponse);
    await expect(rejectedSender(message)).rejects.toBeInstanceOf(WhatsAppDeliveryError);

    const unavailableProvider = vi.fn<typeof fetch>().mockRejectedValue(new Error('network failure'));
    const unavailableSender = createWhatsAppInvitationSender(environment, unavailableProvider);
    await expect(unavailableSender(message)).rejects.toBeInstanceOf(WhatsAppDeliveryError);
  });
});
