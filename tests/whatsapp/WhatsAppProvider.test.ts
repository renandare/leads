// tests/whatsapp/WhatsAppProvider.test.ts
// Unit tests no real HTTP calls = Global fetch is mocked

import { WhatsAppProvider } from '@infrastructure/services/whatsapp/WhatsAppProvider';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  } as Response);
}

function mockFetchTimeout(): void {
  global.fetch = jest.fn().mockImplementation(() =>
    new Promise((_, reject) => {
      const err = new Error('The operation was aborted');
      (err as Error & { name: string }).name = 'AbortError';
      reject(err);
    }),
  );
}

function captureLastFetchBody(): unknown {
  const calls = (global.fetch as jest.Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  return JSON.parse(lastCall[1].body as string);
}

const WAMID = 'wamid.HBgLNTUxNDk5NjE2ODg0';

// ─── setup ───────────────────────────────────────────────────────────────────

let provider: WhatsAppProvider;

beforeEach(() => {
  process.env.META_API_VERSION     = 'v25.0';
  process.env.META_PHONE_NUMBER_ID = '123456789012345'; // numeric Phone Number ID
  process.env.META_PERMANENT_TOKEN = 'test-token';
  provider = new WhatsAppProvider();
});

afterEach(() => jest.resetAllMocks());

// ─── sendText ────────────────────────────────────────────────────────────────

describe('sendText', () => {
  it('returns wamid on success', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    const result = await provider.sendText('5514996168848', 'Hello');

    expect(result.wamid).toBe(WAMID);
  });

  it('sends correct JSON payload', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    await provider.sendText('5514996168848', 'Test body');

    const body = captureLastFetchBody() as Record<string, unknown>;
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('5514996168848');
    expect(body.type).toBe('text');
    expect((body.text as Record<string, unknown>).body).toBe('Test body');
  });

  it('throws with Meta error message on HTTP error', async () => {
    mockFetch(
      { error: { code: 190, message: 'Invalid OAuth access token', type: 'OAuthException', fbtrace_id: 'abc123' } },
      401,
    );

    await expect(provider.sendText('5514996168848', 'Hi')).rejects.toThrow(
      'Meta API error 190: Invalid OAuth access token',
    );
  });

  it('throws on non-OK without error body', async () => {
    mockFetch({}, 500);

    await expect(provider.sendText('5514996168848', 'Hi')).rejects.toThrow('Meta API HTTP 500');
  });

  it('throws when response OK but messages array is missing', async () => {
    mockFetch({ messaging_product: 'whatsapp' }); // no messages field

    await expect(provider.sendText('5514996168848', 'Hi')).rejects.toThrow(
      'Meta API returned OK but no message ID in response',
    );
  });

  it('throws when response OK but messages array is empty', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [] });

    await expect(provider.sendText('5514996168848', 'Hi')).rejects.toThrow(
      'Meta API returned OK but no message ID in response',
    );
  });

  it('throws on timeout (AbortError)', async () => {
    mockFetchTimeout();

    await expect(provider.sendText('5514996168848', 'Hi')).rejects.toThrow();
  });

  it('uses Authorization Bearer header', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    await provider.sendText('5514', 'x');

    const calls = (global.fetch as jest.Mock).mock.calls;
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('constructs the correct URL with version and phoneNumberId', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    await provider.sendText('5514', 'x');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toBe('https://graph.facebook.com/v25.0/123456789012345/messages');
  });
});

// ─── sendTemplate ────────────────────────────────────────────────────────────

describe('sendTemplate', () => {
  it('builds the correct payload with parameters', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    await provider.sendTemplate('5514996168848', 'promo_offer', 'pt_BR', ['João', 'R$50,00']);

    const body = captureLastFetchBody() as Record<string, unknown>;
    const tmpl = body.template as Record<string, unknown>;

    expect(tmpl.name).toBe('promo_offer');
    expect((tmpl.language as Record<string, string>).code).toBe('pt_BR');

    const components = tmpl.components as Array<Record<string, unknown>>;
    expect(components).toHaveLength(1);
    expect(components[0]!.type).toBe('body');

    const params = components[0]!.parameters as Array<Record<string, unknown>>;
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({ type: 'text', text: 'João' });
    expect(params[1]).toEqual({ type: 'text', text: 'R$50,00' });
  });

  it('sends empty components array when no params', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    await provider.sendTemplate('5514996168848', 'welcome', 'pt_BR', []);

    const body = captureLastFetchBody() as Record<string, unknown>;
    const tmpl = body.template as Record<string, unknown>;
    expect(tmpl.components).toEqual([]);
  });

  it('returns wamid on success', async () => {
    mockFetch({ messaging_product: 'whatsapp', messages: [{ id: WAMID }] });

    const result = await provider.sendTemplate('5514996168848', 'w', 'pt_BR', []);
    expect(result.wamid).toBe(WAMID);
  });

  it('throws on HTTP error with Meta error detail', async () => {
    mockFetch(
      { error: { code: 132000, message: 'Template not found', type: 'GraphMethodException' } },
      400,
    );

    await expect(provider.sendTemplate('5514', 'missing_tmpl', 'pt_BR', [])).rejects.toThrow(
      'Meta API error 132000: Template not found',
    );
  });
});

// ─── constructor guards ───────────────────────────────────────────────────────

describe('constructor', () => {
  it('throws if META_PHONE_NUMBER_ID is not set', () => {
    delete process.env.META_PHONE_NUMBER_ID;
    expect(() => new WhatsAppProvider()).toThrow('META_PHONE_NUMBER_ID is not set');
  });

  it('throws if META_PERMANENT_TOKEN is not set', () => {
    process.env.META_PHONE_NUMBER_ID = '123';
    delete process.env.META_PERMANENT_TOKEN;
    expect(() => new WhatsAppProvider()).toThrow('META_PERMANENT_TOKEN is not set');
  });
});
