// src/infrastructure/repositories/PrismaContactRepository.ts

import { PrismaClient, Prisma } from "@prisma/client";
import { IContactRepository } from "@domain/contact/repositories/IContactRepository";
import { Contact } from "@domain/contact/entities/Contact";

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
}
