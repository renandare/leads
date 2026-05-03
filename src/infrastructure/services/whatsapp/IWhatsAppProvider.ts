// src/infrastructure/services/whatsapp/IWhatsAppProvider.ts

export interface SendResult {
  wamid: string;
}

// Named parameters split by template component.
// header: variables inside the Header component (e.g. {{customer_name}} in a text header)
// body:   variables inside the Body component
export interface TemplateParams {
  header?: Record<string, string>;
  body?:   Record<string, string>;
}

export interface IWhatsAppProvider {
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: TemplateParams,
  ): Promise<SendResult>;
}
