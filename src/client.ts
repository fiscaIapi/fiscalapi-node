import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  FiscalAPIError,
  InsufficientBalanceError,
  RateLimitError,
  ServerError,
} from './errors.js';
import type {
  CertidaoFederalResponse,
  CertidoesTodasResponse,
  CNDResponse,
  CNDTodosResponse,
  CnirResponse,
  CNPJResponse,
  ConsultaIEResponse,
  ConsultaIETodosResponse,
  NfeXmlResponse,
  PerfilProdutorResponse,
  SigefParcelaResponse,
  SigefResponse,
} from './types.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.fiscalapi.com.br';
/** Algumas consultas (NF-e, SIGEF) podem levar até 180 s no servidor. */
export const DEFAULT_TIMEOUT_MS = 200_000;
export const DEFAULT_MAX_RETRIES = 3;

const RETRYABLE_ANY_METHOD = new Set([429]);
const RETRYABLE_IDEMPOTENT = new Set([500, 502, 503, 504]);
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRY_AFTER_MS = 60_000;

export interface FiscalAPIOptions {
  /** Chave de API. Se omitida, lê `FISCALAPI_API_KEY` do ambiente (Node). */
  apiKey?: string;
  baseUrl?: string;
  /** Tempo máximo de cada tentativa, em milissegundos. */
  timeoutMs?: number;
  /** Novas tentativas em 429 e (para GET) em 5xx/falha de rede. */
  maxRetries?: number;
  /** Implementação de fetch alternativa (padrão: `globalThis.fetch`). */
  fetch?: typeof fetch;
  /** Sufixo opcional para o `User-Agent`. */
  userAgent?: string;
}

/** Um documento: CPF ou CNPJ (pontuação é aceita). */
export type Documento = { cpf: string; cnpj?: never } | { cnpj: string; cpf?: never };

/** Um documento: CPF, CNPJ ou o número da Inscrição Estadual. */
export type DocumentoIE =
  | { cpf: string; cnpj?: never; ie?: never }
  | { cnpj: string; cpf?: never; ie?: never }
  | { ie: string; cpf?: never; cnpj?: never };

/** Certificado A1: bytes do .pfx/.p12 ou o conteúdo já em base64. */
export type Certificado = Uint8Array | ArrayBuffer | string;

type QueryValue = string | boolean | undefined;

export class FiscalAPI {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(apiKeyOrOptions?: string | FiscalAPIOptions, options: FiscalAPIOptions = {}) {
    const opts: FiscalAPIOptions =
      typeof apiKeyOrOptions === 'string'
        ? { ...options, apiKey: apiKeyOrOptions }
        : { ...(apiKeyOrOptions ?? {}) };
    const key = opts.apiKey ?? readEnv('FISCALAPI_API_KEY');
    if (!key) {
      throw new Error(
        "Informe a chave de API: new FiscalAPI('sua-chave') ou a variável FISCALAPI_API_KEY.",
      );
    }
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch não disponível: use Node 18+ ou passe a opção `fetch`.');
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.fetchImpl = fetchImpl.bind(globalThis);
    const ua = `fiscalapi-br-node/${VERSION}`;
    this.userAgent = opts.userAgent ? `${ua} ${opts.userAgent}` : ua;
  }

  // ---------------------------------------------------------------- IE

  /** Inscrição Estadual em uma UF (`GET /api/consultar`). */
  consultarIe(
    params: { uf: string; secundarias?: boolean } & DocumentoIE,
  ): Promise<ConsultaIEResponse> {
    return this.get('/api/consultar', {
      uf: uf(params.uf),
      ...umDocumento(params, ['cpf', 'cnpj', 'ie']),
      secundarias: params.secundarias || undefined,
    });
  }

  /** Inscrição Estadual em todos os estados (`GET /api/consultar-ie-todos`). */
  consultarIeTodos(
    params: { secundarias?: boolean } & DocumentoIE,
  ): Promise<ConsultaIETodosResponse> {
    return this.get('/api/consultar-ie-todos', {
      ...umDocumento(params, ['cpf', 'cnpj', 'ie']),
      secundarias: params.secundarias || undefined,
    });
  }

  // -------------------------------------------------------------- CNPJ

  /** Dados cadastrais na Receita Federal (`GET /api/consultar-cnpj`). */
  consultarCnpj(params: { cnpj: string; forceFresh?: boolean }): Promise<CNPJResponse> {
    if (!params.cnpj?.trim()) throw new Error('Informe o CNPJ.');
    return this.get('/api/consultar-cnpj', {
      cnpj: params.cnpj.trim(),
      force_fresh: params.forceFresh || undefined,
    });
  }

  // --------------------------------------------------------- Certidões

  /** CND estadual (ICMS) em uma UF (`GET /api/consultar-cnd`). */
  consultarCnd(params: { uf: string } & Documento): Promise<CNDResponse> {
    return this.get('/api/consultar-cnd', {
      uf: uf(params.uf),
      ...umDocumento(params, ['cpf', 'cnpj']),
    });
  }

  /** CND estadual em todos os estados disponíveis (`GET /api/consultar-cnd-todos`). */
  consultarCndTodos(params: Documento): Promise<CNDTodosResponse> {
    return this.get('/api/consultar-cnd-todos', umDocumento(params, ['cpf', 'cnpj']));
  }

  /** CND Federal — Receita Federal + PGFN (`GET /api/consultar-cnd-federal`). */
  consultarCndFederal(
    params: { emitirNova?: boolean } & Documento,
  ): Promise<CertidaoFederalResponse> {
    return this.get('/api/consultar-cnd-federal', {
      ...umDocumento(params, ['cpf', 'cnpj']),
      emitir_nova: params.emitirNova || undefined,
    });
  }

  /** CNDT — débitos trabalhistas (`GET /api/consultar-cndt`). */
  consultarCndt(params: Documento): Promise<CertidaoFederalResponse> {
    return this.get('/api/consultar-cndt', umDocumento(params, ['cpf', 'cnpj']));
  }

  /** CRF — regularidade do FGTS (`GET /api/consultar-crf-fgts`). */
  consultarCrfFgts(params: Documento): Promise<CertidaoFederalResponse> {
    return this.get('/api/consultar-crf-fgts', umDocumento(params, ['cpf', 'cnpj']));
  }

  /** Todas as certidões em uma chamada (`GET /api/certidoes-todas`). */
  consultarCertidoesTodas(
    params: { skipEstaduais?: boolean } & Documento,
  ): Promise<CertidoesTodasResponse> {
    return this.get('/api/certidoes-todas', {
      ...umDocumento(params, ['cpf', 'cnpj']),
      skip_estaduais: params.skipEstaduais || undefined,
    });
  }

  // -------------------------------------------------------------- NF-e

  /**
   * XML completo de uma NF-e pela chave de acesso (`POST /api/consultar-nfe-xml`).
   * O certificado A1 precisa ser de um participante da nota e não é armazenado.
   * Não é repetido automaticamente em 5xx.
   */
  consultarNfeXml(params: {
    chave: string;
    certificado: Certificado;
    senha: string;
    manifestar?: boolean;
  }): Promise<NfeXmlResponse> {
    if (!params.chave) throw new Error('Informe a chave de acesso.');
    return this.request('POST', '/api/consultar-nfe-xml', undefined, {
      chave: params.chave.replace(/\D/g, ''),
      certificado: certificadoBase64(params.certificado),
      senha: params.senha,
      manifestar: params.manifestar ?? true,
    });
  }

  // ------------------------------------------------------ Imóvel rural

  /** Parcelas certificadas no SIGEF/INCRA (`GET /api/consultar-sigef`). */
  consultarSigef(params: Documento): Promise<SigefResponse> {
    return this.get('/api/consultar-sigef', umDocumento(params, ['cpf', 'cnpj']));
  }

  /** Uma parcela SIGEF pelo UUID (`GET /api/consultar-sigef-parcela`). */
  consultarSigefParcela(params: {
    uuid: string;
    forceFresh?: boolean;
  }): Promise<SigefParcelaResponse> {
    if (!params.uuid?.trim()) throw new Error('Informe o UUID da parcela.');
    return this.get('/api/consultar-sigef-parcela', {
      uuid: params.uuid.trim(),
      force_fresh: params.forceFresh || undefined,
    });
  }

  /** Imóveis rurais no CNIR/CAFIR (`GET /api/consultar-cnir`). */
  consultarCnir(params: Documento): Promise<CnirResponse> {
    return this.get('/api/consultar-cnir', umDocumento(params, ['cpf', 'cnpj']));
  }

  // ------------------------------------------------------------ Perfil

  /** Perfil consolidado do produtor rural (`GET /api/perfil-produtor`). */
  perfilProdutor(params: Documento): Promise<PerfilProdutorResponse> {
    return this.get('/api/perfil-produtor', umDocumento(params, ['cpf', 'cnpj']));
  }

  // -------------------------------------------------------- Transporte

  private get<T>(path: string, query: Record<string, QueryValue>): Promise<T> {
    return this.request<T>('GET', path, query);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    query?: Record<string, QueryValue>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = this.baseUrl + path + encodeQuery(query);
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const idempotent = method === 'GET';

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (idempotent && attempt < this.maxRetries) {
          await sleep(backoff(attempt, null));
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new APIConnectionError(`Falha ao conectar à FiscalAPI: ${reason}`, { cause: err });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (err) {
        clearTimeout(timer);
        if (idempotent && attempt < this.maxRetries) {
          await sleep(backoff(attempt, null));
          continue;
        }
        throw new APIConnectionError('Conexão interrompida ao ler a resposta.', { cause: err });
      }
      clearTimeout(timer);

      if (response.ok) {
        return parseJson(text) as T;
      }

      const status = response.status;
      const retryable =
        RETRYABLE_ANY_METHOD.has(status) || (idempotent && RETRYABLE_IDEMPOTENT.has(status));
      if (retryable && attempt < this.maxRetries) {
        await sleep(backoff(attempt, response.headers.get('retry-after')));
        continue;
      }
      throw errorFromResponse(status, text, response.headers);
    }
  }
}

// -------------------------------------------------------------- utilitários

function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

function uf(value: string): string {
  const v = (value ?? '').trim().toUpperCase();
  if (v.length !== 2) throw new Error('Informe a UF com 2 letras (ex.: MT).');
  return v;
}

function umDocumento(
  params: Partial<Record<'cpf' | 'cnpj' | 'ie', string>>,
  allowed: Array<'cpf' | 'cnpj' | 'ie'>,
): Record<string, string> {
  const informados: Record<string, string> = {};
  for (const key of allowed) {
    const v = params[key];
    if (typeof v === 'string' && v.trim()) informados[key] = v.trim();
  }
  const n = Object.keys(informados).length;
  const nomes = allowed.join(' ou ');
  if (n === 0) throw new Error(`Informe ${nomes}.`);
  if (n > 1) throw new Error(`Informe apenas um: ${nomes}.`);
  return informados;
}

function encodeQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    sp.append(k, typeof v === 'boolean' ? String(v) : v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function certificadoBase64(cert: Certificado): string {
  if (typeof cert === 'string') return cert.replace(/\s+/g, '');
  const bytes = cert instanceof Uint8Array ? cert : new Uint8Array(cert);
  const NodeBuffer = (
    globalThis as {
      Buffer?: { from(b: Uint8Array): { toString(enc: 'base64'): string } };
    }
  ).Buffer;
  if (NodeBuffer) return NodeBuffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function backoff(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const s = Number(retryAfter);
    if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, MAX_RETRY_AFTER_MS);
  }
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  return base + Math.random() * (base / 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new FiscalAPIError('Resposta da API não é JSON válido.', {
      body: text.slice(0, 500),
      cause: err,
    });
  }
}

function errorFromResponse(status: number, text: string, headers: Headers): FiscalAPIError {
  let body: unknown = text ? text.slice(0, 500) : undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // mantém o texto
  }

  let code: string | undefined;
  let message = `Erro HTTP ${status}`;
  let requestId: string | undefined;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const c = b.error ?? b.title;
    if (typeof c === 'string') code = c;
    const detail = b.message ?? b.detail;
    if (typeof detail === 'string' && detail) message = detail;
    else if (Array.isArray(detail) && detail.length)
      message = detail
        .map((d) =>
          d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d),
        )
        .join('; ');
    if (typeof b.request_id === 'string' && b.request_id) requestId = b.request_id;
  } else if (typeof body === 'string' && body) {
    message = body;
  }

  const h: Record<string, string> = {};
  headers.forEach((value, key) => {
    h[key.toLowerCase()] = value;
  });
  const init = { status, code, requestId, body, headers: h };

  if (status === 401 || status === 403) return new AuthenticationError(message, init);
  if (status === 402) return new InsufficientBalanceError(message, init);
  if (status === 429) return new RateLimitError(message, init);
  if (status >= 500) return new ServerError(message, init);
  if (status >= 400) return new BadRequestError(message, init);
  return new FiscalAPIError(message, init);
}
