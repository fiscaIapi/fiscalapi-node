/**
 * Tipos das respostas da FiscalAPI. Campos novos podem aparecer sem aviso;
 * o SDK devolve o JSON completo da API.
 */

export type StatusFonte = 'success' | 'error' | 'timeout' | 'skipped';

export type StatusCertidao =
  | 'negativa'
  | 'positiva'
  | 'positiva_com_efeitos_de_negativa'
  | 'nao_contribuinte'
  | 'sem_certidao'
  | 'erro';

export interface SourceStatus {
  status: StatusFonte;
  error_code?: string;
  error_message?: string;
}

export interface CnaeSecundario {
  codigo: string;
  descricao?: string;
}

export interface InscricaoEstadual {
  inscricao_estadual: string;
  razao_social?: string;
  nome_fantasia?: string;
  situacao_ie?: string;
  uf_ie?: string;
  tipo_ie?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  numero?: string;
  municipio?: string;
  municipio_ibge?: string;
  cep?: string;
  regime_pagamento?: string;
  data_situacao?: string;
  situacao_contribuinte?: string;
  data_inicio_atividade?: string;
  cnae_codigo?: string;
  cnae_descricao?: string;
  regime_apuracao_icms?: string;
  situacao_nfe?: string;
  cpf_cnpj?: string;
  situacao_cadastral?: string;
  cnaes_secundarios?: CnaeSecundario[] | null;
  [extra: string]: unknown;
}

export interface ConsultaIEResponse {
  request_id: string;
  document: string;
  document_type: string;
  uf?: string;
  cached?: boolean;
  results: InscricaoEstadual[];
}

export interface IEPorUF {
  uf: string;
  source_status: SourceStatus;
  results: InscricaoEstadual[];
}

export interface ConsultaIETodosResponse {
  request_id: string;
  document: string;
  document_type: string;
  cached_ufs?: string[];
  results: IEPorUF[];
  /** `false` quando algum estado falhou: resultado vazio não é "não encontrado". */
  complete?: boolean;
}

export interface CNPJResult {
  razao_social?: string;
  nome_fantasia?: string;
  situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  cnae_principal_codigo?: string;
  cnae_principal_descricao?: string;
  cnaes_secundarios?: Array<Record<string, string>>;
  natureza_juridica?: string;
  capital_social?: string;
  endereco?: Record<string, string>;
  qsa?: Array<Record<string, string>>;
  porte?: string;
  [extra: string]: unknown;
}

export interface CNPJResponse {
  request_id: string;
  cnpj: string;
  cached?: boolean;
  source_status: SourceStatus;
  result: CNPJResult | null;
}

export interface Certidao {
  status: StatusCertidao;
  status_raw?: string;
  validade?: string;
  validade_iso?: string;
  emissao?: string;
  emissao_iso?: string;
  protocolo?: string;
  pdf_base64?: string;
  url_verificacao?: string;
  codigo_autenticacao?: string;
  [extra: string]: unknown;
}

export interface CNDResponse {
  request_id: string;
  document: string;
  document_type: string;
  uf: string;
  cached?: boolean;
  source_status: SourceStatus;
  result: Certidao | null;
}

export interface CNDPorUF {
  uf: string;
  source_status: SourceStatus;
  result: Certidao | null;
}

export interface CNDTodosResponse {
  request_id: string;
  document: string;
  document_type: string;
  results: CNDPorUF[];
}

export interface CertidaoFederal extends Certidao {
  tipo: 'cndt' | 'cnd_federal' | 'crf_fgts';
  orgao?: string;
  modo?: 'consulta' | 'emissao';
}

export interface CertidaoFederalResponse {
  request_id: string;
  document: string;
  document_type: string;
  cached?: boolean;
  source_status: SourceStatus;
  result: CertidaoFederal | null;
}

export interface CertidoesTodasResponse {
  request_id: string;
  document: string;
  document_type: string;
  cnd_estaduais: CNDTodosResponse | null;
  certidoes_federais: CertidaoFederalResponse[];
}

export interface NfeXmlResultado {
  chave: string;
  /** ok | nao_autorizado | nao_encontrado | chave_invalida | cancelada | fora_prazo | somente_resumo | certificado_recusado | erro */
  status: string;
  cstat?: string;
  mensagem?: string;
  from_cache?: boolean;
  manifestacao?: string | null;
  /** XML completo (nfeProc), presente quando `status === 'ok'`. */
  xml?: string | null;
}

export interface NfeXmlResponse {
  request_id: string;
  total: number;
  com_dado: number;
  creditos_cobrados: number;
  resultados: NfeXmlResultado[];
}

export interface SigefParcela {
  parcel_id?: string;
  codigo_parcela?: string;
  denominacao?: string;
  area_ha?: number;
  municipio?: string;
  uf?: string;
  codigo_ibge?: string;
  detentor?: string;
  matricula?: string;
  cns?: string;
  status?: string;
  data_certificacao?: string;
  natureza?: string;
  codigo_sncr?: string;
  cartorio?: string;
  geometria_wkt?: string;
  vertices?: Array<Record<string, unknown>>;
  confrontantes?: Array<Record<string, unknown>>;
  [extra: string]: unknown;
}

export interface SigefResponse {
  request_id: string;
  document: string;
  document_type: string;
  cached?: boolean;
  source_status: SourceStatus;
  result: { total_parcelas: number; area_total_ha: number; parcelas: SigefParcela[] } | null;
}

export interface SigefParcelaResponse {
  request_id: string;
  parcel_id: string;
  cached?: boolean;
  consultado_em?: string;
  completo?: boolean;
  avisos?: string[];
  source_status: SourceStatus;
  result: SigefParcela | null;
}

export interface CnirResponse {
  request_id: string;
  document: string;
  document_type: string;
  source_status: SourceStatus;
  pessoa_fisica?: Record<string, unknown> | null;
  pessoa_juridica?: Record<string, unknown> | null;
  imoveis_cafir: Array<Record<string, unknown>>;
  total_imoveis: number;
  total_imoveis_ativos: number;
}

export interface PerfilProdutorResponse {
  request_id: string;
  document: string;
  receita_federal?: CNPJResponse | null;
  inscricoes_estaduais?: ConsultaIETodosResponse | null;
  cnd_estaduais?: CNDTodosResponse | null;
  certidoes_federais?: CertidaoFederalResponse[];
  cnir?: CnirResponse | null;
  [extra: string]: unknown;
}
