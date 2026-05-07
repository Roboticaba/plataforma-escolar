# Registro da conversa - 2026-05-06

Este arquivo registra os pedidos e decisoes principais da conversa para retomada futura.

## Inicio do contexto

- Projeto informado na pasta local de trabalho.
- Pedido para abrir `docs-importacao-pdf/README.md` e continuar a partir do contexto salvo.
- Trabalho central: importacao de questoes por PDF, com foco no parser e na limpeza.

## Regras e problemas tratados ao longo da conversa

### Fonte como divisor

Foi solicitado que fontes/referencias fossem usadas como divisor entre texto de apoio/imagem e enunciado:

- fonte nao pode ficar dentro de `textoApoio`;
- fonte nao pode ficar dentro de `enunciado`;
- texto depois da fonte deve ser analisado como enunciado;
- URLs iniciadas por `Disponivel em:` nao podem engolir o enunciado;
- fontes de imagens devem ir para `fonteImagemApoio` quando houver imagem/tirinha.

Casos citados:

- Q4 com URL misturada ao apoio;
- Q8 com apoio misturado ao enunciado;
- Q11 com fonte de imagem indo para campo errado;
- Q14 e Q17 com enunciado ficando no apoio;
- Q21 com fonte `ROCHA, Ruth...` delimitando o fim do apoio;
- Q24 com fonte `O GLOBO...` como fonte de imagem.

### Parser mais conservador

Depois, a regra foi refinada para nao tratar palavras comuns como fonte:

- nao considerar fonte apenas por conter `jornal`, `revista`, `livro`, `autor`, `editora`;
- considerar fonte apenas com padroes fortes como `Disponivel em:`, `Fonte:`, URL, autor em formato bibliografico, `O GLOBO.`, `Folha de S.Paulo`, `In:`, data/ano junto de publicacao.

### Casos com imagem/tirinha

Foi reforcado:

- se ha `imagemApoio = "[imagem aqui]"`, fonte depois da imagem deve ir para `fonteImagemApoio`;
- Q11 esperada com `Alexandre Beck. Folha de S.Paulo...`;
- Q24 esperada com `O GLOBO. O Menino Maluquinho. Agosto de 2002.`;
- quando OCR nao trouxer texto util de tirinha/imagem, inferir imagem provavel e evitar deixar questao com alternativas mas sem enunciado.

### Debug

Foi pedido:

- imprimir no console os objetos brutos antes de renderizar;
- expor temporariamente `window.__importedQuestionsDebug = state.importedQuestions`.

### Ordem visual do card

Foi solicitado corrigir a ordem no card:

1. Leia / instrucao
2. Texto de apoio
3. Fonte do texto de apoio
4. Imagem de apoio
5. Fonte da imagem de apoio
6. Enunciado
7. Alternativas

Regra especifica: imagem de apoio sempre antes da fonte da imagem.

### Novo PDF: Simulado de Portugues 2 - 5o ano

Problemas observados:

- Q1: parte do texto de apoio foi para enunciado; enunciado correto comeca em `Considerando...`;
- Q2: fonte misturada ao apoio, enunciado cortado e alternativa D nao capturada;
- Q3: instrucao `Leia a frase a seguir:` nao detectada, apoio nao detectado, rodape virou enunciado.

Correcoes pedidas:

- remover cabecalhos/rodapes como `5o ANO - LINGUA PORTUGUESA E MATEMATICA | Pagina X`;
- aceitar marcadores de enunciado como `Considerando`, `Depois da resposta`, `A partir`, `Ao comparar`, `O uso`;
- preservar aspas, travessoes, negrito, parenteses e dialogos dentro do texto de apoio;
- capturar A), B), C), D) mesmo quebradas.

### Heuristica visual: colunas/imagem a direita

Foi observado que, em muitos PDFs escolares:

- imagem fica do lado direito dentro da borda;
- fonte da imagem fica abaixo da imagem;
- fonte aparece menor que o texto de apoio;
- texto de apoio fica a esquerda ou no centro.

Decisao implementada:

- extrair metadados de layout do texto;
- quando houver pagina com imagem e fonte forte a direita/menor, priorizar como `fonteImagemApoio`;
- se a fonte visual aparecer no meio da ordem textual, reposicionar para depois do texto principal e antes do enunciado.

### Heuristica visual: caixas/bordas

Ultimo pedido do dia:

- quando houver caixa/borda visual, texto acima tende a ser instrucao;
- conteudo dentro da caixa e bloco de apoio;
- texto abaixo tende a ser enunciado;
- implementar de modo flexivel, sem quebrar casos sem caixa.

Decisao implementada:

- detectar retangulos/caixas grandes no `operatorList`;
- usar linhas de layout para classificar acima/dentro/abaixo;
- aplicar reordenacao apenas quando ha evidencia de instrucao acima, conteudo dentro e enunciado abaixo;
- manter fallback textual atual quando nao houver caixa detectavel.

## Fechamento

- Foi criado `docs-importacao-pdf/FECHAMENTO-2026-05-06.md`.
- Foi criado este registro de conversa.
- A copia/clone local de seguranca foi criada fora do repositorio.
- A sincronizacao do clone local deve permanecer apenas na maquina local, sem arquivos versionados com caminhos pessoais.
