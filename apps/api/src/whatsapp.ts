export type ResidentInvitationMessage = {
  phone: string;
  code: string;
};
export type ResidentInvitationSender = (message: ResidentInvitationMessage) => Promise<void>;

type WhatsAppEnvironment = Record<string, string | undefined>;

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super('La integración de WhatsApp Business no está configurada.');
    this.name = 'WhatsAppNotConfiguredError';
  }
}

export class WhatsAppDeliveryError extends Error {
  constructor() {
    super('WhatsApp Business no pudo completar el envío.');
    this.name = 'WhatsAppDeliveryError';
  }
}

function getConfiguration(environment: WhatsAppEnvironment) {
  const accessToken = environment.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = environment.WHATSAPP_INVITATION_TEMPLATE;
  const graphApiVersion = environment.WHATSAPP_GRAPH_API_VERSION;
  const languageCode = environment.WHATSAPP_INVITATION_TEMPLATE_LANGUAGE ?? 'es';

  if (!accessToken || !phoneNumberId || !/^\d+$/.test(phoneNumberId) || !templateName || !graphApiVersion || !/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new WhatsAppNotConfiguredError();
  }

  return { accessToken, phoneNumberId, templateName, graphApiVersion, languageCode };
}

export function assertWhatsAppConfigured(environment: WhatsAppEnvironment = process.env) {
  getConfiguration(environment);
}

export function createWhatsAppInvitationSender(
  environment: WhatsAppEnvironment = process.env,
  fetcher: typeof fetch = fetch,
) {
  return async (message: ResidentInvitationMessage): Promise<void> => {
    const configuration = getConfiguration(environment);
    let response: Response;
    try {
      response = await fetcher(
        `https://graph.facebook.com/${configuration.graphApiVersion}/${configuration.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${configuration.accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.phone,
            type: 'template',
            template: {
              name: configuration.templateName,
              language: { code: configuration.languageCode },
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: message.code }],
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: message.code }],
                },
              ],
            },
          }),
        },
      );
    } catch {
      throw new WhatsAppDeliveryError();
    }

    if (!response.ok) {
      throw new WhatsAppDeliveryError();
    }
  };
}
