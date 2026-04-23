// tests/webhook/WebhookController.test.ts
// Unit tests for WebhookController no Express app needed
// Tests the verify handshake and HMAC guard directly

import crypto from 'crypto';
import { WebhookController } from '@infrastructure/http/controllers/WebhookController';
import { WebhookProcessor } from '@application/webhook/WebhookProcessor';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const APP_SECRET    = 'test-app-secret-32chars-minimum!!';
const VERIFY_TOKEN  = 'my-verify-token';

function makeProcessor(): jest.Mocked<WebhookProcessor> {
  return { process: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<WebhookProcessor>;
}

function makeSig(body: string | Buffer, secret = APP_SECRET): string {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

function makeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { query: {}, headers: {}, body: {}, rawBody: undefined, ...overrides };
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status: jest.fn().mockReturnThis() as jest.Mock,
    json:   jest.fn().mockReturnThis() as jest.Mock,
    send:   jest.fn().mockReturnThis() as jest.Mock,
  };
  res.status.mockImplementation((code: number) => { res.statusCode = code; return res; });
  return res;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let processor: jest.Mocked<WebhookProcessor>;
let controller: WebhookController;

beforeEach(() => {
  process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.META_APP_SECRET           = APP_SECRET;

  processor  = makeProcessor();
  controller = new WebhookController(processor);
});

afterEach(() => jest.resetAllMocks());

// ─── GET /webhook/meta — verify handshake ────────────────────────────────────

describe('verify (GET)', () => {
  it('responds 200 with challenge when token and mode match', () => {
    const req = makeReq({
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'abc123' },
    });
    const res = makeRes();

    controller.verify(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('abc123');
  });

  it('responds 403 when verify_token does not match', () => {
    const req = makeReq({
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc' },
    });
    const res = makeRes();

    controller.verify(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('responds 403 when hub.mode is not subscribe', () => {
    const req = makeReq({
      query: { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'x' },
    });
    const res = makeRes();

    controller.verify(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('responds 403 when query params are missing', () => {
    const req = makeReq({ query: {} });
    const res = makeRes();

    controller.verify(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ─── POST /webhook/meta — HMAC guard ─────────────────────────────────────────

describe('receive (POST) — HMAC', () => {
  const PAYLOAD = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const rawBody  = Buffer.from(PAYLOAD);

  it('responds 401 when X-Hub-Signature-256 header is missing', async () => {
    const req = makeReq({ headers: {}, rawBody, body: JSON.parse(PAYLOAD) });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('responds 401 when signature is invalid (tampered body)', async () => {
    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig('tampered body') },
      rawBody,
      body: JSON.parse(PAYLOAD),
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('responds 401 when signature uses wrong secret', async () => {
    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(rawBody, 'wrong-secret') },
      rawBody,
      body: JSON.parse(PAYLOAD),
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when rawBody is missing (body was double-parsed)', async () => {
    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(rawBody) },
      rawBody:  undefined,
      body:     JSON.parse(PAYLOAD),
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when META_APP_SECRET is not configured', async () => {
    delete process.env.META_APP_SECRET;
    controller = new WebhookController(processor);

    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(rawBody) },
      rawBody,
      body: JSON.parse(PAYLOAD),
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 200 and calls processor on valid HMAC', async () => {
    const validBody = { object: 'whatsapp_business_account', entry: [{ id: 'w', changes: [] }] };
    const buf       = Buffer.from(JSON.stringify(validBody));

    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(buf) },
      rawBody:  buf,
      body:     validBody,
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls processor.process with the parsed payload after valid HMAC', async () => {
    const validBody = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba', changes: [{ field: 'messages', value: {} }] }],
    };
    const buf = Buffer.from(JSON.stringify(validBody));

    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(buf) },
      rawBody:  buf,
      body:     validBody,
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);

    // Give async fire-and-forget a tick to execute
    await new Promise(resolve => setImmediate(resolve));

    expect(processor.process).toHaveBeenCalledWith(validBody);
  });

  it('does NOT call processor when object is not whatsapp_business_account', async () => {
    const body = { object: 'page', entry: [] };
    const buf  = Buffer.from(JSON.stringify(body));

    const req = makeReq({
      headers: { 'x-hub-signature-256': makeSig(buf) },
      rawBody:  buf,
      body,
    });
    const res = makeRes();

    await controller.receive(req as never, res as never);
    await new Promise(resolve => setImmediate(resolve));

    expect(processor.process).not.toHaveBeenCalled();
  });
});
