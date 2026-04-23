// src/domain/interaction/repositories/IInteractionRepository.ts

import { CreateInteractionData } from '@domain/interaction/entities/Interaction';

export interface IInteractionRepository {
  create(data: CreateInteractionData): Promise<void>;

  // Returns true if an interaction with this Meta message ID was already saved
  existsByMetaMessageId(metaMessageId: string): Promise<boolean>;
}
