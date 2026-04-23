// src/infrastructure/http/controllers/WebhookController.ts
// Handles Meta webhook: GET verify + POST receive (HMAC-SHA256 + processing).

import crypto from 'crypto';
import { Request, Response } from 'express';
import { WebhookProcessor, MetaWebhookPayload } from '@application/webhook/WebhookProcessor';
import { logger } from '@shared/utils/logger';

export class WebhookController {
  private readonly webhookVerifyToken: string;
  private readonly appSecret:          string;

  constructor(private readonly processor: WebhookProcessor) {
    this.webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
    this.appSecret          = process.env.META_APP_SECRET ?? '';

    if (!this.appSecret) {
      logger.warn('[Webhook] META_APP_SECRET is not set — HMAC verification will reject all POSTs');
    }
  }

  // GET /webhook/meta — Meta verification handshake
  verify = (req: Request, res: Response): void => {
    const mode      = req.query['hub.mode']         as string | undefined;
    const token     = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge']    as string | undefined;

    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      logger.info('[Webhook] Verification handshake accepted');
      res.status(200).send(challenge);
      return;
    }

    logger.warn('[Webhook] Verification failed — wrong token or mode', { mode, token });
    res.status(403).json({ error: 'Forbidden' });
  };

  // POST /webhook/meta — incoming events
  receive = async (req: Request, res: Response): Promise<void> => {
    
    // HMAC guard must be mandatory
    if (!this.verifyHmac(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Acknowledge immediately, meta retries if 200 not received within 20s
    res.status(200).json({ status: 'ok' });

    // Process asynchronously to avoid blocking
    const payload = req.body as MetaWebhookPayload;
    if (payload?.object !== 'whatsapp_business_account') return;

    this.processor.process(payload).catch(err =>
      logger.error('[Webhook] processor unhandled error', { error: String(err) }),
    );
  };

 // HMAC-SHA256 verification of incoming POSTs using app secret and raw body
  private verifyHmac(req: Request): boolean {
    if (!this.appSecret) return false;

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return false;

    // get signature from header 
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) return false;

    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');

    try {
      // Use timingSafeEqual to prevent against timing attacks.
      // Both buffers must be of the same length, otherwise an error is thrown, which we catch and return false.
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // timingSafeEqual throws if buffers differ in length
    }
  }
}
