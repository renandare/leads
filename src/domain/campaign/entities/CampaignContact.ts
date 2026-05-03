// src/domain/campaign/entities/CampaignContact.ts

export interface CampaignContact {
  id: string;
  phone: string;
  leadId: string;
  customerName: string | null;   // COALESCE(leads.trade_name, leads.name)
  lastPurchaseAt: Date | null;
  contactCount30d: number;
  lastContactAt: Date | null;
  whatsapp: boolean | null;
  status: string;
  unsubscribed: boolean;
}
