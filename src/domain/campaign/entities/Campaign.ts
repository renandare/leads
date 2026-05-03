// src/domain/campaign/entities/Campaign.ts

export interface Campaign {
  id: string;
  name: string;
  templateId: number;
  segment: string;
  status: string; // queued | running | done | failed
  startAt: Date | null;
  finishedAt: Date | null;
  totalSent: number;
  deletedAt: Date | null;
  createdAt: Date;
}
