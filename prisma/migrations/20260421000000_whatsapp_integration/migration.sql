-- ─────────────────────────────────────────────────────────────────────────────
-- conversations — rastreia janela de conversa Meta por contato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           UUID         NOT NULL REFERENCES contacts(id),
  meta_conversation_id VARCHAR(100) NOT NULL,
  origin               VARCHAR(30)  NOT NULL,            -- user_initiated | business_initiated | referral_conversion
  expires_at           TIMESTAMPTZ  NOT NULL,
  last_message_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_contact_id ON conversations (contact_id);
CREATE INDEX idx_conversations_expires_at ON conversations (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- messages — adiciona rastreabilidade Meta e idempotência de envio
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN wamid               VARCHAR(100) UNIQUE,          -- ID Meta retornado após send
  ADD COLUMN client_message_id   UUID         UNIQUE,          -- chave de idempotência gerada pelo caller
  ADD COLUMN body                TEXT,                         -- conteúdo da mensagem (free-form)
  ADD COLUMN conversation_id     UUID REFERENCES conversations(id);

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
