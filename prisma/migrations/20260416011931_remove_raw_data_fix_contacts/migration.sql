-- Remove raw_data column (Google Maps capture no longer used; leads imported directly from Receita Federal)
ALTER TABLE "leads" DROP COLUMN IF EXISTS "raw_data";

-- Remove unique constraint on contacts.lead_id (one lead can now have multiple contacts)
DROP INDEX IF EXISTS "contacts_lead_id_key";

-- Track existing unique index on leads.document (created manually outside migrations)
CREATE UNIQUE INDEX IF NOT EXISTS "leads_document_key" ON "leads"("document");
