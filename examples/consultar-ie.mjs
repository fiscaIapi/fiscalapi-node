// Uso: FISCALAPI_API_KEY=... node examples/consultar-ie.mjs MT 12345678909
import { FiscalAPI, InsufficientBalanceError, FiscalAPIError } from 'fiscalapi-br';

const [uf, cpf] = process.argv.slice(2);
const api = new FiscalAPI(); // lê FISCALAPI_API_KEY

try {
  const resp = await api.consultarIe({ uf, cpf });
  for (const ie of resp.results) {
    console.log(ie.inscricao_estadual, ie.situacao_ie, ie.municipio);
  }
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.error('Sem saldo ou sem plano ativo:', err.message);
  } else if (err instanceof FiscalAPIError) {
    console.error('Erro:', err.status, err.code, err.message, err.requestId);
  } else {
    throw err;
  }
  process.exitCode = 1;
}
