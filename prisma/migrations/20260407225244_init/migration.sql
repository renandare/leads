-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255),
    "phone" VARCHAR(20),
    "address" TEXT,
    "city" VARCHAR(100),
    "state" CHAR(2),
    "source" VARCHAR(50) NOT NULL,
    "document" VARCHAR(20),
    "size" VARCHAR(20),
    "type" VARCHAR(30),
    "raw_data" JSONB,
    "enrichment_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "pipeline_stage" VARCHAR(30) NOT NULL DEFAULT 'raw',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "phone" VARCHAR(20),
    "email" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsapp" BOOLEAN,
    "preferred_channel" VARCHAR(20),
    "contact_type" VARCHAR(20),
    "priority" VARCHAR(10),
    "stage" VARCHAR(30) NOT NULL DEFAULT 'new',
    "score" INTEGER NOT NULL DEFAULT 0,
    "price_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "last_contact_at" TIMESTAMP(3),
    "last_reply_at" TIMESTAMP(3),
    "contact_count_30d" INTEGER NOT NULL DEFAULT 0,
    "last_purchase_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_message" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "template_id" INTEGER NOT NULL,
    "segment" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "start_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "campaign_id" UUID,
    "template_id" INTEGER,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "retry_after" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "error_reason" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "message_id" UUID,
    "order_id" UUID,
    "meta_message_id" VARCHAR(100),
    "type" VARCHAR(30) NOT NULL,
    "classification" VARCHAR(30),
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "payment" VARCHAR(20),
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" VARCHAR(50),
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_leads_pipeline_stage" ON "leads"("pipeline_stage");

-- CreateIndex
CREATE INDEX "idx_leads_processed" ON "leads"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_lead_id_key" ON "contacts"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_phone_key" ON "contacts"("phone");

-- CreateIndex
CREATE INDEX "idx_contacts_status" ON "contacts"("status", "unsubscribed");

-- CreateIndex
CREATE INDEX "idx_contacts_last_purchase" ON "contacts"("last_purchase_at");

-- CreateIndex
CREATE INDEX "idx_contacts_reactivation" ON "contacts"("last_purchase_at", "status", "unsubscribed");

-- CreateIndex
CREATE INDEX "idx_messages_status_retry" ON "messages"("status", "retry_after");

-- CreateIndex
CREATE INDEX "idx_messages_locked_at" ON "messages"("locked_at");

-- CreateIndex
CREATE UNIQUE INDEX "interactions_meta_message_id_key" ON "interactions"("meta_message_id");

-- CreateIndex
CREATE INDEX "idx_interactions_contact_id" ON "interactions"("contact_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
