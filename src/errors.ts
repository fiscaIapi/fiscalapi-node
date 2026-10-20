/** Erro base: toda exceção do SDK herda desta classe. */
export class FiscalAPIError extends Error {
  /** Status HTTP (`undefined` em falha de conexão). */
  readonly status?: number;
  /** Código do erro devolvido pela API (ex.: `PARAMETRO_AUSENTE`). */
  readonly code?: string;
  /** Identificador da requisição — informe-o ao suporte. */
  readonly requestId?: string;
  /** Corpo da resposta (objeto JSON ou texto). */
  readonly body?: unknown;
  readonly headers: Record<string, string>;

  constructor(
    message: string,
    init: {
      status?: number;
      code?: string;
      requestId?: string;
      body?: unknown;
      headers?: Record<string, string>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.body = init.body;
    this.headers = init.headers ?? {};
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
  }
}

/** Chave de API ausente, inválida ou revogada (HTTP 401/403). */
export class AuthenticationError extends FiscalAPIError {}

/** Sem plano ativo ou saldo esgotado (HTTP 402). */
export class InsufficientBalanceError extends FiscalAPIError {
  /** Quantas consultas desse tipo o saldo ainda paga, quando informado. */
  get consultasRestantes(): number | undefined {
    const b = this.body as { consultas_restantes?: unknown } | undefined;
    return typeof b?.consultas_restantes === 'number' ? b.consultas_restantes : undefined;
  }
}

/** Limite de requisições por minuto do plano excedido (HTTP 429). */
export class RateLimitError extends FiscalAPIError {
  /** Segundos a esperar antes de tentar de novo, quando informado. */
  get retryAfter(): number | undefined {
    const raw =
      this.headers['retry-after'] ??
      (this.body as { retry_after?: unknown } | undefined)?.retry_after;
    const n = Number(raw);
    return raw !== undefined && Number.isFinite(n) ? n : undefined;
  }
}

/** Parâmetro ausente, conflitante ou inválido (HTTP 400/404/422). */
export class BadRequestError extends FiscalAPIError {}

/** Falha do lado da API ou tempo esgotado na fonte (HTTP 5xx). */
export class ServerError extends FiscalAPIError {}

/** Não foi possível falar com a API (DNS, TLS, conexão, timeout). */
export class APIConnectionError extends FiscalAPIError {}
