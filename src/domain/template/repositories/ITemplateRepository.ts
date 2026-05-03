// src/domain/template/repositories/ITemplateRepository.ts

export interface TemplateInfo {
  id: number;
  name: string;    // Meta template name example "outreach_loja"
  channel: string; // "whatsapp"
  active: boolean;
}

export interface ITemplateRepository {
  findById(id: number): Promise<TemplateInfo | null>;
}
