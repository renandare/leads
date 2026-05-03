// src/application/message/dtos/SendTemplateDTO.ts

import { z } from 'zod';

export const SendTemplateSchema = z.object({
  to:              z.string().min(8).max(20), // +5514999... or 5514999...
  templateName:    z.string().min(1).max(100),
  languageCode:    z.string().min(2).max(10).default('pt_BR'),
  params:          z.object({
    header: z.record(z.string(), z.string()).optional(),
    body:   z.record(z.string(), z.string()).optional(),
  }).default({}),
  clientMessageId: z.string().uuid(),
});

export type SendTemplateInput  = z.output<typeof SendTemplateSchema>;
export type SendTemplateOutput = {
  messageId:  string | null;   // null when the number is not a CRM contact (direct send)
  contactId:  string | null;
  wamid:      string;
  created:    boolean;
};
