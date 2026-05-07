# Importacao de questoes por PDF - contexto salvo

Este documento resume as decisoes e alteracoes feitas no fluxo de importacao de questoes por PDF.
Use este arquivo como ponto de retomada quando quiser continuar o trabalho.

## Como chamar depois

Voce pode pedir ao Codex:

```text
Abra docs-importacao-pdf/README.md e continue a partir desse contexto.
```

Ou:

```text
Retome o trabalho da importacao de PDF usando o contexto salvo em docs-importacao-pdf/README.md.
```

## Objetivo geral

O professor deve importar PDF/DOCX ou colar texto e ver apenas cards limpos e editaveis.
O texto bruto do PDF nao deve aparecer na interface normal.

O parser deve separar:

- instrucao
- textoApoio
- fonteTextoApoio
- imagemApoio
- fonteImagemApoio
- enunciado
- alternativas

Nao criar nem usar `fonteQuestao`.

## Arquivos principais

- `assets/js/services/importacao-questoes-service.js`
  - Parser principal da importacao.
  - Limpeza de texto importado.
  - Separacao de instrucao, apoio, fonte, imagem e enunciado.

- `assets/js/services/pdf-import-service.js`
  - Extracao de PDF.
  - Limpeza avancada por pagina com `cleanPdfText`.
  - Timeout e logs para evitar travamento.

- `assets/js/pages/professor-importar-questoes.js`
  - Tela de revisao/importacao.
  - Renderizacao dos cards editaveis.
  - Sincronizacao dos novos campos em memoria.

- `professor-importar-questoes.html`
  - Cache-buster do script da pagina.
  - Texto do seletor de arquivo alinhado com a extracao real de PDF/DOCX.

- `tmp-import-tests/pdf-regression-tests.mjs`
  - Testes sinteticos para regressao dos casos do PDF real.

## Funcoes importantes

### `cleanTextoImportado(texto)`

Remove lixo administrativo antes do parser:

- escola/colegio/prefeitura/secretaria
- aluno/professor/turma/data quando parecem campos administrativos
- CNPJ, CEP, telefone, endereco
- cartao-resposta visual
- linhas so com simbolos/numeros

Preserva linhas de questao, alternativas, fontes e marcadores de apoio.

### `cleanPdfText(textoPorPagina)`

Entrada esperada:

```js
[
  { page: 1, text: "..." },
  { page: 2, text: "..." }
]
```

Saida:

```js
{
  text: "texto limpo final",
  pages: [
    { page: 1, cleanText: "..." }
  ],
  alertas: []
}
```

Ela:

- remove cabecalhos/rodapes repetidos por pagina;
- corrige alternativas grudadas;
- corrige questao grudada;
- corrige quebra de palavra com hifen;
- remove lixo administrativo;
- marca imagem como `[imagem aqui]`;
- nao renderiza imagem extraida automaticamente.

### `splitQuestionParts(texto)`

Retorna:

```js
{
  instrucao,
  textoApoio,
  fonteTextoApoio,
  imagemApoio,
  fonteImagemApoio,
  enunciado
}
```

Regras:

- `Leia`, `Observe`, `Analise` so viram `instrucao` quando apontam para apoio real.
- Comandos diretos como "Leia as alternativas abaixo e marque..." viram `enunciado`.
- Texto narrativo/literario antes de marcador forte vira `textoApoio`.
- `[imagem aqui]` vira `imagemApoio`.
- Fonte depois de imagem vira `fonteImagemApoio`.
- Fonte depois de texto vira `fonteTextoApoio`.
- Fonte nunca deve ir para `enunciado`.
- Enunciado comeca em marcadores fortes como:
  - `Qual`
  - `De acordo com`
  - `Com base no`
  - `No texto,`
  - `No trecho`
  - `Na frase`
  - `A palavra`
  - `A frase`
  - `A expressao`
  - `Durante a leitura`
  - `Apos concluir`
  - `Identifique`
  - `Marque`
  - `Assinale`

### `isLinhaCartaoResposta(line)`

Remove linhas falsas como:

```text
A B C D 7) A B C D 13) A B C D
1 A B C D 2 A B C D
(A) (B) (C) (D)
```

Essas linhas nao devem virar questao.

## UI atual dos cards

Ordem visual do card:

1. Leia / instrucao
2. Texto de apoio
3. Fonte do texto de apoio
4. Imagem de apoio
5. Fonte da imagem de apoio
6. Enunciado
7. Alternativas de texto
8. Alternativas com imagem

Cada parte aparece uma vez, em campo editavel quando faz sentido.

## Debug de PDF

Em `pdf-import-service.js`:

```js
export const DEBUG_PDF_IMPORT = false;
```

Quando `false`:

- nao mostra texto bruto;
- nao mostra painel tecnico;
- usa apenas texto limpo para gerar cards.

Quando `true`:

- pode exibir texto bruto, texto limpo e alertas para diagnostico.

## Logs do PDF

O fluxo do PDF registra no console:

- `PDF carregado`
- `Total de paginas:`
- `Lendo pagina X`
- `Texto da pagina extraido`
- `Finalizou leitura do PDF`

Tambem ha timeout para evitar travamento.

## Testes

Rodar:

```powershell
node tmp-import-tests\pdf-regression-tests.mjs
```

Tambem validar sintaxe:

```powershell
node --check assets\js\services\importacao-questoes-service.js
node --check assets\js\services\pdf-import-service.js
node --check assets\js\pages\professor-importar-questoes.js
```

## Casos cobertos nos testes sinteticos

- Q4: textoApoio + imagemApoio + fonteImagemApoio + enunciado.
- Q7: comando direto fica em enunciado, sem instrucao/apoio falso.
- Q8: textoApoio separado de "A frase...".
- Q9: fonte nao fica no enunciado.
- Q11: fonte de tirinha/imagem vai para fonteImagemApoio.
- Q12/Q16: comandos diretos ficam em enunciado.
- Q14/Q17/Q21: enunciado comeca no marcador forte correto.
- Q22: poema + fonte BANDEIRA separado.
- Q23: texto "Pulgas" separado do enunciado.

## Observacoes importantes

- Nao alterar salvamento no banco ate uma decisao explicita.
- Os novos campos sao preservados em memoria na revisao:
  - `instrucao`
  - `fonteTextoApoio`
  - `imagemApoio`
  - `fonteImagemApoio`
- O banco ainda deve ser revisado antes de persistir esses campos definitivamente.

## Retomada 2026-05-05

- A mensagem inicial do seletor de PDF/DOCX foi atualizada: nao diz mais que a extracao real esta pendente.
- O seletor agora aceita apenas PDF e DOCX, removendo `.doc`, que nao tem extracao automatica ativa.
- O cache-buster da pagina foi atualizado para `20260505pdfclean2`.
- A origem exibida na revisao agora distingue `arquivo PDF`, `arquivo DOCX`, `questao individual`, `bloco com texto base` e `texto bruto`.
- Validacoes rodadas:
  - `node tmp-import-tests\pdf-regression-tests.mjs`
  - `node --check assets\js\pages\professor-importar-questoes.js`

## Retomada salva 2026-05-05 noite

Estado atual para continuar amanha:

- O projeto usado nesta conversa esta em `E:\plataforma-escolar-main`.
- A tela visual de teste esta em `http://127.0.0.1:8765/professor-importar-questoes.html`.
- O servidor local foi mantido na porta `8765` durante os testes da sessao.
- O runner tecnico esta em `http://127.0.0.1:8765/tmp-import-tests/test-runner.html`, mas ele mostra JSON/codigo e nao a UI final.

### Parser/limpeza

- Fonte agora deve ser conservadora:
  - nao usar palavras soltas como `jornal`, `revista`, `livro`, `texto`, `autor`, `editora`;
  - considerar fonte so com padroes fortes como `Disponivel em:`, `Fonte:`, `Adaptado de:`, URL/http/www, `AUTOR, Nome.`, `O GLOBO.`, `Folha de S.Paulo`, `In:` ou referencia bibliografica clara.
- Em questoes com imagem/tirinha/figura ou `[imagem aqui]`, fonte posterior deve ir para `fonteImagemApoio`, nunca para `fonteTextoApoio`.
- URL/fonte no meio de texto em colunas nao pode engolir narrativa:
  - fonte/URL vai para o campo de fonte;
  - narrativa antes e depois da fonte continua em `textoApoio`;
  - enunciado so comeca em marcador forte.
- Marcadores fortes atuais incluem `Qual`, `Qual das`, `Qual seria`, `De acordo com`, `Com base no`, `No texto,`, `No trecho`, `No trecho acima`, `Na frase`, `A frase`, `A palavra`, `A expressao`, `Durante a leitura`, `Apos concluir`, `Identifique`, `Marque`, `Assinale`.
- Limpeza administrativa remove tambem `E DESENVOLVIMENTO PROFISSIONAL`, `EDUCACAO`, `SECRETARIA`, `AVALIACAO`, `SIMULADO` quando aparecem como lixo de topo/rodape.
- `tituloTextoApoio` institucional deve ser limpo quando nao houver `textoApoio` real.
- Se houver instrucao + alternativas + imagem provavel, mas o OCR nao trouxe enunciado, o parser nao deve deixar enunciado vazio; ele tenta inferir da ultima frase antes das alternativas e, em ultimo caso de imagem, usa fallback textual.
- `pdf-import-service.js` marca imagem provavel quando ocorre erro de decode como `Unable to decode image` ou `JpxError`.

### Casos importantes

- Q4: texto de apoio em coluna esquerda + imagem/fonte na direita. A URL/fonte da imagem nao deve interromper o texto narrativo; `fonteImagemApoio` separado.
- Q8: `jornal`/`jornao` dentro da narrativa nao vira fonte; enunciado comeca em `A frase ...`.
- Q11: tirinha/imagem com `Alexandre Beck. Folha de S.Paulo...`; fonte deve ficar em `fonteImagemApoio`, `textoApoio` vazio, enunciado em `De acordo com...`.
- Q21: texto de apoio vai ate antes de `ROCHA, Ruth...`, incluindo fala/travessao e citacao `Como pode o peixe vivo...`.
- Q24: tirinha/imagem com `O GLOBO. O Menino Maluquinho. Agosto de 2002.`; fonte deve ficar em `fonteImagemApoio`, enunciado em `Qual o sentido da palavra BATERIA...`.
- Q24 sem OCR util: se houver instrucao e alternativas com imagem provavel, nao deixar a questao sem enunciado nem sem `imagemApoio`.

### UI/debug temporario

- A ordem visual obrigatoria do card foi reforcada por classes/CSS:
  1. instrucao
  2. textoApoio
  3. fonteTextoApoio
  4. imagemApoio
  5. fonteImagemApoio
  6. enunciado
  7. alternativas
- Cache-busters recentes:
  - `20260505cardorder1` para ordem dos campos;
  - `20260505parserlog1` para log antes de renderizar;
  - `20260505debugwindow1` para expor debug no window.
- Debug temporario em `assets/js/pages/professor-importar-questoes.js`:
  - `console.log("[importacao-questoes] objetos antes de renderizar", JSON.parse(JSON.stringify(state.importedQuestions)));`
  - `window.__importedQuestionsDebug = state.importedQuestions;`
- Para inspecionar no console depois de clicar em Organizar:
  - `window.__importedQuestionsDebug`
- Lembrar de remover logs/debug temporarios antes de finalizar para producao.

### Validacoes que passaram

Rodadas com sucesso:

```powershell
node tmp-import-tests\pdf-regression-tests.mjs
node --check assets\js\services\importacao-questoes-service.js
node --check assets\js\services\pdf-import-service.js
node --check assets\js\pages\professor-importar-questoes.js
```

### Arquivos alterados nesta frente

- `assets/js/services/importacao-questoes-service.js`
- `assets/js/services/pdf-import-service.js`
- `assets/js/pages/professor-importar-questoes.js`
- `professor-importar-questoes.html`
- `tmp-import-tests/pdf-regression-tests.mjs`
- `docs-importacao-pdf/README.md`
