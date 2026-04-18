ALTER TABLE leads
  ADD COLUMN processing             BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN processing_started_at  TIMESTAMP;

CREATE INDEX idx_leads_processing ON leads (processing) WHERE processing = true;
