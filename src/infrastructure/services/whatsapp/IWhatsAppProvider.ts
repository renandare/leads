// src/infrastructure/services/whatsapp/IWhatsAppProvider.ts

export interface SendResult {
  wamid: string;
}

export interface IWhatsAppProvider {
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
  ): Promise<SendResult>;
}
