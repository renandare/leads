-- Ensure no nulls remain before adding NOT NULL constraints
UPDATE contacts SET preferred_channel = 'email'  WHERE preferred_channel IS NULL;
UPDATE contacts SET priority           = 'medium' WHERE priority           IS NULL;

-- Make preferred_channel and priority non-nullable on contacts
ALTER TABLE contacts ALTER COLUMN preferred_channel SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN priority           SET NOT NULL;

-- Composite indexes to speed up claim queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_processing
  ON leads (pipeline_stage, processing)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_enrichment_processing
  ON leads (pipeline_stage, enrichment_status, processing)
  WHERE deleted_at IS NULL AND retry_count < 3;
