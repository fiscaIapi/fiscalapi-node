# FiscalAPI — SDK Node.js / TypeScript

Cliente JavaScript/TypeScript da [FiscalAPI](https://fiscalapi.com.br): Inscrição Estadual nos 27 estados, CNPJ, certidões (CND estadual, CND Federal, CNDT, CRF/FGTS), XML de NF-e por chave, SIGEF, CNIR e perfil do produtor rural.

- Zero dependências: usa o `fetch` nativo (Node 18+, Bun, Deno, edge runtimes).
- Tipado em TypeScript, com ESM e CommonJS.
- Novas tentativas automáticas em `429` e em falhas temporárias.
- Erros tipados para chave inválida, falta de saldo e limite de requisições.

## Instalação

```bash
npm install fiscalapi-br
```

## Antes de começar

1. Crie sua conta em [app.fiscalapi.com.br](https://app.fiscalapi.com.br) e copie a chave de API no painel.
2. **O uso pela API exige um plano ativo ou créditos.** As consultas gratuitas do mês valem só no painel; pela API, uma conta sem plano recebe `402` (`InsufficientBalanceError`).
3. Planos e consumo de créditos: [docs.fiscalapi.com.br](https://docs.fiscalapi.com.br/docs/referencia/plans-and-limits).

> Não use a chave de API no navegador: ela daria acesso ao seu saldo a qualquer visitante. Chame a FiscalAPI a partir do seu servidor.

## Uso rápido

```ts
import { FiscalAPI } from 'fiscalapi-br';

const api = new FiscalAPI('sua-chave'); // ou defina FISCALAPI_API_KEY

const resp = await api.consultarIe({ uf: 'MT', cpf: '12345678909' });
for (const ie of resp.results) {
  console.log(ie.inscricao_estadual, ie.situacao_ie, ie.municipio);
}
```

CommonJS:

```js
const { FiscalAPI } = require('fiscalapi-br');
```

## Métodos

| Método | Endpoint | O que retorna |
|---|---|---|
| `consultarIe({ uf, cpf \| cnpj \| ie, secundarias? })` | `GET /api/consultar` | Inscrições estaduais em uma UF |
| `consultarIeTodos({ cpf \| cnpj \| ie, secundarias? })` | `GET /api/consultar-ie-todos` | Inscrições em todos os estados |
| `consultarCnpj({ cnpj, forceFresh? })` | `GET /api/consultar-cnpj` | Dados cadastrais da Receita Federal |
| `consultarCnd({ uf, cpf \| cnpj })` | `GET /api/consultar-cnd` | CND estadual (ICMS) com PDF |
| `consultarCndTodos({ cpf \| cnpj })` | `GET /api/consultar-cnd-todos` | CND estadual em todos os estados disponíveis |
| `consultarCndFederal({ cpf \| cnpj, emitirNova? })` | `GET /api/consultar-cnd-federal` | CND Federal (Receita Federal + PGFN) |
| `consultarCndt({ cpf \| cnpj })` | `GET /api/consultar-cndt` | Certidão de débitos trabalhistas |
| `consultarCrfFgts({ cpf \| cnpj })` | `GET /api/consultar-crf-fgts` | Regularidade do FGTS |
| `consultarCertidoesTodas({ cpf \| cnpj, skipEstaduais? })` | `GET /api/certidoes-todas` | Todas as certidões em uma chamada |
| `consultarNfeXml({ chave, certificado, senha, manifestar? })` | `POST /api/consultar-nfe-xml` | XML completo da NF-e |
| `consultarSigef({ cpf \| cnpj })` | `GET /api/consultar-sigef` | Parcelas certificadas no SIGEF/INCRA |
| `consultarSigefParcela({ uuid, forceFresh? })` | `GET /api/consultar-sigef-parcela` | Uma parcela com polígono, vértices e confrontantes |
| `consultarCnir({ cpf \| cnpj })` | `GET /api/consultar-cnir` | Imóveis rurais no CNIR/CAFIR |
| `perfilProdutor({ cpf \| cnpj })` | `GET /api/perfil-produtor` | Perfil consolidado do produtor |

Informe **um** documento por chamada. Pontuação é aceita. As respostas trazem o JSON completo da API, com tipos exportados (`ConsultaIEResponse`, `CNDResponse`, `NfeXmlResponse` etc.).

## Exemplos

### Inscrição Estadual em todos os estados

```ts
const resp = await api.consultarIeTodos({ cnpj: '12.345.678/0001-95' });
if (resp.complete === false) {
  console.warn('Algum estado não respondeu; tente de novo antes de concluir que não há IE.');
}
for (const uf of resp.results) {
  for (const ie of uf.results) console.log(uf.uf, ie.inscricao_estadual, ie.situacao_ie);
}
```

### CNPJ

```ts
const empresa = await api.consultarCnpj({ cnpj: '12345678000195' });
console.log(empresa.result?.razao_social, empresa.result?.situacao_cadastral);

// Dado atual, sem cache (consome mais créditos):
await api.consultarCnpj({ cnpj: '12345678000195', forceFresh: true });
```

### Certidões com PDF

```ts
import { writeFile } from 'node:fs/promises';

const cnd = await api.consultarCnd({ uf: 'MT', cpf: '12345678909' });
console.log(cnd.result?.status, cnd.result?.validade_iso);
if (cnd.result?.pdf_base64) {
  await writeFile('cnd-mt.pdf', Buffer.from(cnd.result.pdf_base64, 'base64'));
}

const federal = await api.consultarCndFederal({ cnpj: '12345678000195' });
const trabalhista = await api.consultarCndt({ cnpj: '12345678000195' });
const fgts = await api.consultarCrfFgts({ cnpj: '12345678000195' });
```

O campo `status` vem como `negativa`, `positiva`, `positiva_com_efeitos_de_negativa`, `nao_contribuinte`, `sem_certidao` ou `erro`.

### XML de NF-e por chave

```ts
import { readFile, writeFile } from 'node:fs/promises';

const resp = await api.consultarNfeXml({
  chave: '35260112345678000195550010000012341000012345',
  certificado: await readFile('certificado.pfx'), // bytes ou string base64
  senha: 'senha-do-certificado',
});
const nota = resp.resultados[0];
if (nota.status === 'ok' && nota.xml) {
  await writeFile(`${nota.chave}.xml`, nota.xml, 'utf8');
} else {
  console.log(nota.status, nota.mensagem);
}
```

O certificado A1 precisa ser de um participante da nota (emitente, destinatário, transportador ou autorizado) e **não é armazenado** pela API. Só há cobrança quando o XML é devolvido.

### Imóvel rural

```ts
const sigef = await api.consultarSigef({ cpf: '12345678909' });
for (const p of sigef.result?.parcelas ?? []) {
  console.log(p.denominacao, p.area_ha, p.municipio, p.uf);
}

const parcela = await api.consultarSigefParcela({ uuid: '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b' });
console.log(parcela.result?.geometria_wkt);

const cnir = await api.consultarCnir({ cpf: '12345678909' });
console.log(cnir.total_imoveis, 'imóveis');
```

### Perfil do produtor

```ts
const perfil = await api.perfilProdutor({ cpf: '12345678909' });
```

## Status da fonte

Uma resposta `200` pode trazer `source_status.status` diferente de `success` (por exemplo, `timeout` quando o órgão não respondeu a tempo). Confira esse campo antes de concluir que o documento não tem registro.

## Erros

```ts
import {
  FiscalAPIError, AuthenticationError, InsufficientBalanceError,
  RateLimitError, BadRequestError, ServerError, APIConnectionError,
} from 'fiscalapi-br';

try {
  await api.consultarIe({ uf: 'SP', cnpj: '12345678000195' });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // chave ausente, inválida ou revogada (401/403)
  } else if (err instanceof InsufficientBalanceError) {
    console.log(err.consultasRestantes); // sem plano ou saldo esgotado (402)
  } else if (err instanceof RateLimitError) {
    console.log(err.retryAfter); // limite por minuto do plano (429)
  } else if (err instanceof BadRequestError) {
    console.log(err.code, err.message); // parâmetro ausente ou inválido (400/422)
  } else if (err instanceof FiscalAPIError) {
    console.log(err.status, err.requestId); // informe o requestId ao suporte
  }
}
```

## Novas tentativas e timeout

```ts
const api = new FiscalAPI('sua-chave', { timeoutMs: 200_000, maxRetries: 3 });
```

- `429`: o SDK espera o tempo do cabeçalho `Retry-After` e tenta de novo.
- `500`, `502`, `503`, `504` e falhas de rede: novas tentativas com espera exponencial, **só em consultas GET**. A consulta de NF-e (POST) não é repetida automaticamente.
- Algumas consultas (NF-e, SIGEF) podem levar até 3 minutos; o timeout padrão é 200 s.

## Links

- Documentação: [docs.fiscalapi.com.br](https://docs.fiscalapi.com.br)
- Painel: [app.fiscalapi.com.br](https://app.fiscalapi.com.br)
- Suporte: contato@fiscalapi.com.br

## Licença

MIT
