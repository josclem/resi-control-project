export type ResendConfiguration = {
  apiKey: string;
  from: string;
};

export function getResendConfiguration(environment: NodeJS.ProcessEnv): ResendConfiguration | null {
  const { RESEND_API_KEY, EMAIL_FROM } = environment;
  if (!RESEND_API_KEY || !EMAIL_FROM) return null;
  return { apiKey: RESEND_API_KEY, from: EMAIL_FROM };
}

export async function sendWithResend(
  configuration: ResendConfiguration,
  input: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: configuration.from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Resend rechazó el correo (${response.status}): ${detail}`);
  }
}
