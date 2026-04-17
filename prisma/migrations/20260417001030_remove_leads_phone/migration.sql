-- Remove phone from leads table — phones now live exclusively in contacts
ALTER TABLE "leads" DROP COLUMN IF EXISTS "phone";

-- Update default pipeline_stage to 'raw' (was 'deduplicated' from previous migration)
ALTER TABLE "leads" ALTER COLUMN "pipeline_stage" SET DEFAULT 'raw';
