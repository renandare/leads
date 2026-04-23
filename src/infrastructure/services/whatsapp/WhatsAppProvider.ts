// src/infrastructure/services/whatsapp/WhatsAppProvider.ts
// Meta Cloud API — WhatsApp Business

import { IWhatsAppProvider, SendResult } from './IWhatsAppProvider';

// Meta API responses

interface MetaSendResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: MetaApiError;
}

interface MetaApiError {
  message: string;
  type:    string;
  code:    number;
  fbtrace_id?: string;
}

// Fetch helper with timeout using AbortController
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}


export class WhatsAppProvider implements IWhatsAppProvider {
  private readonly baseUrl:       string;
  private readonly phoneNumberId: string;
  private readonly token:         string;

  constructor() {
    const version       = process.env.META_API_VERSION    ?? 'v22.0';
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? '';
    const token         = process.env.META_PERMANENT_TOKEN  ?? '';

    if (!phoneNumberId) throw new Error('META_PHONE_NUMBER_ID is not set');
    if (!token)         throw new Error('META_PERMANENT_TOKEN is not set');

    this.phoneNumberId = phoneNumberId;
    this.token         = token;
    this.baseUrl       = `https://graph.facebook.com/${version}`;
  }

  // sendText 
  async sendText(to: string, body: string): Promise<SendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    };

    return this.sendMessage(payload);
  }

  // sendTemplate
  async sendTemplate(
    to:           string,
    templateName: string,
    languageCode: string,
    params:       string[],
  ): Promise<SendResult> {
    const bodyParameters = params.map(p => ({ type: 'text', text: p }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type: 'template',
      template: {
        name:     templateName,
        language: { code: languageCode },
        components: params.length
          ? [{ type: 'body', parameters: bodyParameters }]
          : [],
      },
    };

    return this.sendMessage(payload);
  }

  // Private
  private async sendMessage(payload: object): Promise<SendResult> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const res = await fetchWithTimeout(url, {
      method:  'POST',
      headers: this.headers(),
      body:    JSON.stringify(payload),
    });

    const data = (await res.json()) as MetaSendResponse;

    if (!res.ok) {
      const errMsg = data.error
        ? `Meta API error ${data.error.code}: ${data.error.message} (fbtrace: ${data.error.fbtrace_id ?? 'n/a'})`
        : `Meta API HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const wamid = data.messages?.[0]?.id;
    if (!wamid) {
      throw new Error('Meta API returned OK but no message ID in response');
    }

    return { wamid };
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }
}
