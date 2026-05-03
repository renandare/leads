// src/infrastructure/repositories/PrismaContactRepository.ts

import { PrismaClient, Prisma } from "@prisma/client";
import { IContactRepository } from "@domain/contact/repositories/IContactRepository";
import { Contact } from "@domain/contact/entities/Contact";
import { CampaignContact } from "@domain/campaign/entities/CampaignContact";

export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Creates or updates the single contact for a lead.
  // contact_type   = 'import'         (always)
  // whatsapp       = null             (always — set to null even if was true)
  // preferred_channel: mobile phone = 'whatsapp'
  // landline / no phone = 'email'
  // priority: mobile = 'high' | landline = 'low' | no phone = 'medium'
  //
  // All fields are diff-only: skips individual field if already equal to stored value.
  // Skips entirely if there is nothing to store (no phone and no email).
  async upsertContact(
    leadId: string,
    phone: string | null,
    isMobile: boolean,
    email: string | null,
  ): Promise<void> {
    if (!phone && !email) return;

    const preferredChannel = phone && isMobile ? "whatsapp" : "email";
    const priority = phone ? (isMobile ? "high" : "low") : "medium";
    const normalizedEmail = email?.toLowerCase().trim() ?? null;

    const existing = await this.prisma.contact.findFirst({
      where: { leadId },
      select: {
        id: true,
        phone: true,
        email: true,
        preferredChannel: true,
        contactType: true,
        whatsapp: true,
        priority: true,
      },
    });

    if (existing) {
      const updates: Record<string, unknown> = {};

      if (phone && phone !== existing.phone) updates.phone = phone;
      if (normalizedEmail && !existing.email.includes(normalizedEmail))
        updates.email = [...new Set([...existing.email, normalizedEmail])];
      if (existing.preferredChannel !== preferredChannel)
        updates.preferredChannel = preferredChannel;
      if (existing.contactType !== "import") updates.contactType = "import";

      // Only invalidate whatsapp validation when the phone number actually changes —
      // preserves previously validated whatsapp=true/false across re-enrichment runs.
      const phoneChanged = !!phone && phone !== existing.phone;
      if (phoneChanged && existing.whatsapp !== null) updates.whatsapp = null;
      if (existing.priority !== priority) updates.priority = priority;

      if (Object.keys(updates).length === 0) return;

      try {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: updates,
        });
      } catch (err) {
        // P2002 is unique constraint violation
        // which can happen if another concurrent process created a contact with the same leadId.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        )
          return;
        throw err;
      }
    } else {
      try {
        await this.prisma.contact.create({
          data: {
            leadId,
            phone,
            email: normalizedEmail ? [normalizedEmail] : [],
            preferredChannel,
            whatsapp: null,
            contactType: "import",
            priority,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        )
          return;
        throw err;
      }
    }
  }

  async findByPhone(phone: string): Promise<Contact | null> {
    // Strip leading match both "+5514..." and "5514..." stored formats
    const normalized = phone.replace(/^\+/, "");
    const row = await this.prisma.contact.findFirst({
      where: { phone: { endsWith: normalized } },
    });
    return (row as unknown as Contact) ?? null;
  }

  // Finds a contact by ID
  async findById(id: string): Promise<Contact | null> {
    const row = await this.prisma.contact.findUnique({ where: { id } });
    return (row as unknown as Contact) ?? null;
  }

  // Sets the WhatsApp=true for a contact by lead ID
  async setWhatsappByLeadId(leadId: string, whatsapp: boolean): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { leadId },
      data: { whatsapp },
    });
  }

  // Updates the last reply timestamp for a contact by ID
  async touchLastReplyAt(id: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id },
      data: { lastReplyAt: new Date() },
    });
  }

  // Updates the last contact timestamp and increments the 30d contact count for a contact by ID
  async trackOutboundSent(id: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id },
      data: {
        lastContactAt:   new Date(),
        contactCount30d: { increment: 1 },
      },
    });
  }

  // Unsubscribes a contact by ID
  async unsubscribeById(id: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id },
      data: {
        unsubscribed:    true,
        unsubscribedAt:  new Date(),
        status:          'unsubscribed',
      },
    });
  }

  async findCampaignBatch(
    campaignId: string,
    segment: string,
    cursor: string | null,
    limit: number,
  ): Promise<CampaignContact[]> {

    const segmentClause =
      segment === 'new'              ? Prisma.sql`AND c.stage = 'new'` :
      segment === 'cold'             ? Prisma.sql`AND c.stage = 'cold'` :
      segment === 'reactivation'     ? Prisma.sql`AND c.last_purchase_at IS NOT NULL` :
      segment === 'engaged'          ? Prisma.sql`AND c.stage IN ('engaged', 'hot_lead', 'negotiation', 'replied')` :
      segment === 'core_eletrica'    ? Prisma.sql`AND l.type = 'core_eletrica'` :
      segment === 'core_engenharia'  ? Prisma.sql`AND l.type = 'core_engenharia'` :
      segment === 'core_construcao'  ? Prisma.sql`AND l.type = 'core_construcao'` :
      segment === 'parceria_obra'    ? Prisma.sql`AND l.type = 'parceria_obra'` :
      segment === 'condominio'       ? Prisma.sql`AND l.type = 'condominio'` :
      Prisma.sql``; // 'all' — no extra filter

    const cursorClause = cursor
      ? Prisma.sql`AND c.id > ${cursor}::uuid`
      : Prisma.sql``;

    return this.prisma.$queryRaw<CampaignContact[]>(Prisma.sql`
      SELECT
        c.id,
        c.phone,
        c.lead_id                AS "leadId",
        c.last_purchase_at       AS "lastPurchaseAt",
        c.contact_count_30d      AS "contactCount30d",
        c.last_contact_at        AS "lastContactAt",
        c.whatsapp,
        c.status,
        c.unsubscribed,
        COALESCE(l.trade_name, l.name) AS "customerName"
      FROM contacts c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.status       = 'active'
        AND c.unsubscribed  = false
        AND (c.whatsapp IS NULL OR c.whatsapp = true)
        AND c.phone        IS NOT NULL
        AND c.deleted_at   IS NULL
        ${segmentClause}
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.campaign_id = ${campaignId}::uuid
            AND m.contact_id  = c.id
            AND m.status     != 'failed'
        )
        ${cursorClause}
      ORDER BY c.id
      LIMIT ${limit}
    `);
  }
}
