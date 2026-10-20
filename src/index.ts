export {
  FiscalAPI,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from './client.js';
export type { Certificado, Documento, DocumentoIE, FiscalAPIOptions } from './client.js';
export {
  FiscalAPIError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitError,
  BadRequestError,
  ServerError,
  APIConnectionError,
} from './errors.js';
export type * from './types.js';
export { VERSION } from './version.js';
export { FiscalAPI as default } from './client.js';
