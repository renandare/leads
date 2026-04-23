// src/infrastructure/http/controllers/MessageController.ts

import { Request, Response } from 'express';
import { SendTemplateUseCase } from '@application/message/use-cases/SendTemplateUseCase';
import { SendTextUseCase } from '@application/message/use-cases/SendTextUseCase';
import { SendTemplateSchema } from '@application/message/dtos/SendTemplateDTO';
import { SendTextSchema } from '@application/message/dtos/SendTextDTO';

export class MessageController {
  constructor(
    private readonly sendTemplateUseCase: SendTemplateUseCase,
    private readonly sendTextUseCase:     SendTextUseCase,
  ) {}

  sendTemplate = async (req: Request, res: Response): Promise<void> => {
    const input  = SendTemplateSchema.parse(req.body);
    const result = await this.sendTemplateUseCase.execute(input);
    res.status(result.created ? 201 : 200).json(result);
  };

  sendText = async (req: Request, res: Response): Promise<void> => {
    const input  = SendTextSchema.parse(req.body);
    const result = await this.sendTextUseCase.execute(input);
    res.status(result.created ? 201 : 200).json(result);
  };
}
