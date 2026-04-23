// src/application/message/dtos/SendTextDTO.ts

import { z } from 'zod';

export const SendTextSchema = z.object({
  to:              z.string().min(8).max(20),
  body:            z.string().min(1).max(4096),
  clientMessageId: z.string().uuid(),
});

export type SendTextInput  = z.output<typeof SendTextSchema>;
export type SendTextOutput = {
  messageId:  string | null;
  contactId:  string | null;
  wamid:      string;
  created:    boolean;
};
