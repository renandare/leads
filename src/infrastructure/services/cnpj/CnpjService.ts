// src/infrastructure/services/cnpj/CnpjService.ts
// BrasilAPI (primary) → ReceitaWS (fallback, with 429 cooldown)

export interface CnpjData {
  razaoSocial:      string | null;
  fantasia:         string | null;
  naturezaJuridica: string | null;
  cnae:             string | null; // 7-digit e.g. "4321500"
  cnaeDescricao:    string | null;
  phone:            string | null;
  email:            string | null;
  logradouro:       string | null;
  numero:           string | null;
  bairro:           string | null;
  municipio:        string | null;
  uf:               string | null;
}

export type CnpjFetchResult =
  | { ok: true;  data: CnpjData }
  | { ok: false; terminal: boolean; bail: boolean; error: string };

// ─── Tipos internos das APIs ──────────────────────────────────────────────────

interface BrasilApiResponse {
  razao_social?:          string;
  nome_fantasia?:         string;
  natureza_juridica?:     string;
  cnae_fiscal?:           number;
  cnae_fiscal_descricao?: string;
  ddd_telefone_1?:        string;
  email?:                 string;
  logradouro?:            string;
  numero?:                string;
  bairro?:                string;
  municipio?:             string;
  uf?:                    string;
}

interface ReceitaWsResponse {
  nome?:               string;
  fantasia?:           string;
  natureza_juridica?:  string;
  atividade_principal?: Array<{ code?: string; text?: string }>;
  telefone?:           string;
  email?:              string;
  logradouro?:         string;
  numero?:             string;
  bairro?:             string;
  municipio?:          string;
  uf?:                 string;
  status?:             string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNaturezaJuridica(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/^\d+-\d+\s+-\s+/, '').trim().slice(0, 50) || null;
}

function parseCnaeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(0, 7) : null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CnpjService {
  private readonly brasilApiUrl:  string;
  private readonly receitaWsUrl:  string;

  // Timestamp (ms) until which each API should be skipped
  private receitaWsCooldownUntil = 0;
  private brasilApiCooldownUntil = 0;

  // Consecutive 403s from BrasilAPI — cooldown only activates after reaching threshold
  private brasilApi403Count = 0;
  private readonly BRASIL_API_403_THRESHOLD = 2;

  constructor() {
    this.brasilApiUrl = process.env.CNPJ_API_URL          ?? 'https://brasilapi.com.br/api/cnpj/v1';
    this.receitaWsUrl = process.env.CNPJ_API_FALLBACK_URL ?? 'https://receitaws.com.br/v1/cnpj';
  }

  private get brasilApiAvailable(): boolean { return Date.now() >= this.brasilApiCooldownUntil; }
  private get receitaWsAvailable():  boolean { return Date.now() >= this.receitaWsCooldownUntil; }

  // Priority: BrasilAPI when available → ReceitaWS when BrasilAPI is cooled down → bail when both cooled down
  async fetch(document: string): Promise<CnpjFetchResult> {
    const cnpj = document.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      return { ok: false, terminal: true, bail: false, error: 'CNPJ inválido — não tem 14 dígitos' };
    }

    if (this.brasilApiAvailable) {
      const result = await this.fetchBrasilApi(cnpj);
      if (result.ok)       return result;
      if (result.terminal) return result; // 404 — não tenta ReceitaWS

      // BrasilAPI em cooldown pós-chamada (403/429 recém ativou) — verifica ReceitaWS antes de bail
      if (!this.receitaWsAvailable) {
        return { ok: false, terminal: false, bail: true, error: `${result.error} | ReceitaWS em cooldown` };
      }
      if (result.bail) {
        // BrasilAPI entrou em cooldown agora — cai para ReceitaWS
        const receitaResult = await this.fetchReceitaWs(cnpj);
        if (receitaResult.ok) return receitaResult;
        return {
          ok:       false,
          terminal: receitaResult.terminal,
          bail:     receitaResult.bail,
          error:    `${result.error} | ReceitaWS: ${receitaResult.error}`,
        };
      }

      // Erro transiente (não cooldown) — tenta ReceitaWS como fallback
      const receitaResult = await this.fetchReceitaWs(cnpj);
      if (receitaResult.ok) return receitaResult;

      return {
        ok:       false,
        terminal: receitaResult.terminal,
        bail:     receitaResult.bail,
        error:    `BrasilAPI: ${result.error} | ReceitaWS: ${receitaResult.error}`,
      };
    }

    // BrasilAPI em cooldown — usa ReceitaWS diretamente se disponível
    if (this.receitaWsAvailable) {
      const result = await this.fetchReceitaWs(cnpj);
      if (result.ok) return result;
      if (result.bail) {
        // ReceitaWS também entrou em cooldown agora
        return { ok: false, terminal: false, bail: true, error: `BrasilAPI em cooldown | ${result.error}` };
      }
      return result;
    }

    // Ambas em cooldown — bail sem consumir retry
    const brasilUntil  = new Date(this.brasilApiCooldownUntil).toISOString().slice(11, 19);
    const receitaUntil = new Date(this.receitaWsCooldownUntil).toISOString().slice(11, 19);
    return {
      ok: false, terminal: false, bail: true,
      error: `Ambas as APIs em cooldown — BrasilAPI até ${brasilUntil}, ReceitaWS até ${receitaUntil}`,
    };
  }

  // ─── BrasilAPI ───────────────────────────────────────────────────────────────

  private async fetchBrasilApi(cnpj: string): Promise<CnpjFetchResult> {
    try {
      const res = await fetchWithTimeout(`${this.brasilApiUrl}/${cnpj}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CRM-Enrichment/1.0)',
          'Accept':     'application/json',
        },
      });

      if (res.status === 403 || res.status === 429) {
        this.brasilApi403Count++;
        if (this.brasilApi403Count >= this.BRASIL_API_403_THRESHOLD) {
          this.brasilApiCooldownUntil = Date.now() + 5 * 60 * 1000;
          console.warn(`[CnpjService] BrasilAPI ${res.status} (${this.brasilApi403Count}x consecutivo) — cooldown 5min até ${new Date(this.brasilApiCooldownUntil).toISOString()}`);
          return { ok: false, terminal: false, bail: true, error: `BrasilAPI HTTP ${res.status} — cooldown 5min` };
        }
        console.warn(`[CnpjService] BrasilAPI ${res.status} (${this.brasilApi403Count}/${this.BRASIL_API_403_THRESHOLD}) — abaixo do threshold, sem cooldown`);
        return { ok: false, terminal: false, bail: false, error: `BrasilAPI HTTP ${res.status}` };
      }
      if (res.status === 404) {
        this.brasilApi403Count = 0;
        return { ok: false, terminal: true, bail: false, error: 'BrasilAPI HTTP 404 — CNPJ inativo ou inexistente' };
      }
      if (!res.ok) {
        return { ok: false, terminal: false, bail: false, error: `BrasilAPI HTTP ${res.status}` };
      }

      this.brasilApi403Count = 0; // reset on success
      const body = (await res.json()) as BrasilApiResponse;
      return {
        ok:   true,
        data: {
          razaoSocial:      body.razao_social?.trim()          ?? null,
          fantasia:         body.nome_fantasia?.trim()  || null,
          naturezaJuridica: body.natureza_juridica?.trim().slice(0, 50) ?? null,
          cnae:             body.cnae_fiscal ? String(body.cnae_fiscal) : null,
          cnaeDescricao:    body.cnae_fiscal_descricao?.trim() ?? null,
          phone:            body.ddd_telefone_1?.trim()        ?? null,
          email:            body.email?.toLowerCase().trim()   ?? null,
          logradouro:       body.logradouro?.trim()            ?? null,
          numero:           body.numero?.trim()                ?? null,
          bairro:           body.bairro?.trim()                ?? null,
          municipio:        body.municipio?.trim()             ?? null,
          uf:               body.uf?.trim()                    ?? null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError' ? 'Timeout 8s' : String(err);
      return { ok: false, terminal: false, bail: false, error: `BrasilAPI ${msg}` };
    }
  }

  // ─── ReceitaWS ───────────────────────────────────────────────────────────────

  private async fetchReceitaWs(cnpj: string): Promise<CnpjFetchResult> {
    if (!this.receitaWsAvailable) {
      const until = new Date(this.receitaWsCooldownUntil).toISOString().slice(11, 19);
      return { ok: false, terminal: false, bail: true, error: `ReceitaWS em cooldown até ${until}` };
    }

    try {
      const res = await fetchWithTimeout(`${this.receitaWsUrl}/${cnpj}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CRM-Enrichment/1.0)',
          'Accept':     'application/json',
        },
      });

      if (res.status === 429) {
        this.receitaWsCooldownUntil = Date.now() + 2 * 60 * 1000;
        console.warn(`[CnpjService] ReceitaWS 429 — cooldown de 2min até ${new Date(this.receitaWsCooldownUntil).toISOString()}`);
        return { ok: false, terminal: false, bail: true, error: 'ReceitaWS HTTP 429 — cooldown 2min' };
      }
      if (res.status === 404) {
        return { ok: false, terminal: true, bail: false, error: 'ReceitaWS HTTP 404 — CNPJ inativo ou inexistente' };
      }
      if (!res.ok) {
        return { ok: false, terminal: false, bail: false, error: `ReceitaWS HTTP ${res.status}` };
      }

      const body = (await res.json()) as ReceitaWsResponse;
      if (body.status === 'ERROR') {
        return { ok: false, terminal: true, bail: false, error: 'ReceitaWS status ERROR — CNPJ inativo' };
      }

      return {
        ok:   true,
        data: {
          razaoSocial:      body.nome?.trim()      ?? null,
          fantasia:         body.fantasia?.trim() || null,
          naturezaJuridica: parseNaturezaJuridica(body.natureza_juridica),
          cnae:             parseCnaeCode(body.atividade_principal?.[0]?.code),
          cnaeDescricao:    body.atividade_principal?.[0]?.text?.trim() ?? null,
          phone:            body.telefone?.trim()  ?? null,
          email:            body.email?.toLowerCase().trim() ?? null,
          logradouro:       body.logradouro?.trim() ?? null,
          numero:           body.numero?.trim()    ?? null,
          bairro:           body.bairro?.trim()    ?? null,
          municipio:        body.municipio?.trim() ?? null,
          uf:               body.uf?.trim()        ?? null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError' ? 'Timeout 8s' : String(err);
      return { ok: false, terminal: false, bail: false, error: `ReceitaWS ${msg}` };
    }
  }
}
