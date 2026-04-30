# Roadmap - Importacao, Acervo e Descritores

## Decisao atual

Por enquanto, o sistema nao usara IA paga.

A evolucao sera feita com:

- analisador local de descritores;
- regras pedagogicas;
- banco de questoes revisadas;
- similaridade com o acervo;
- revisao obrigatoria pelo professor antes de salvar;
- curadoria administrativa antes de publicar no acervo geral.

IA real podera ser integrada no futuro se o projeto crescer, monetizar e houver controle de custos.

## Objetivo

Permitir que professores importem materiais prontos sem cadastrar questao por questao manualmente.

O sistema deve organizar automaticamente o material bruto e preencher os campos que ja existem no modelo atual de questoes, deixando o professor revisar antes de salvar.

## Fluxo do professor

1. Abrir area "Importar questoes".
2. Informar dados gerais:
   - titulo da importacao;
   - ano escolar;
   - disciplina;
   - fonte do material;
   - observacoes.
3. Colar texto bruto ou, futuramente, enviar arquivo.
4. Clicar em "Organizar questoes".
5. Sistema tenta:
   - separar questoes;
   - detectar alternativas;
   - limpar marcadores;
   - detectar gabarito, se houver;
   - detectar texto base compartilhado;
   - sugerir descritor com analisador local;
   - identificar se e questao individual ou bloco baseado em texto.
6. Professor revisa questao por questao.
7. Professor salva:
   - apenas no banco dele; ou
   - no banco dele e envia para acervo geral.

## Campos atuais reaproveitados

A importacao deve preencher o mesmo modelo ja usado na criacao manual:

```js
anoEscolar
disciplina
tituloTextoApoio
textoApoio
imagensApoio
enunciado
tipo
alternativas
resposta_correta
respostaEsperada
descritor
descritorDescricao
descritorConfirmadoPeloProfessor
descritorSugestaoIA
formatoAlternativas
blocoId
blocoTitulo
ordemBloco
origemCriacao
```

## Campos extras para importacao e acervo

Adicionar aos documentos de questao quando vierem de importacao:

```js
importacaoId
visibilidade
statusRevisao
fonte
```

Valores sugeridos:

```js
origemCriacao: "importacao_professor"
visibilidade: "privada" | "pendente_acervo" | "publica"
statusRevisao: "rascunho_importado" | "revisada_professor" | "pendente_acervo" | "aprovada_acervo" | "rejeitada_acervo"
```

Fonte:

```js
fonte: {
  nome: "",
  url: "",
  observacao: "",
  licenca: ""
}
```

## Colecao de lotes de importacao

Criar colecao:

```text
/importacoesQuestoes
```

Campos sugeridos:

```js
titulo
autorId
autorNome
anoEscolar
disciplina
fonte
textoOriginal
totalDetectadas
totalSalvas
status
criadoEm
atualizadoEm
```

## Revisao pelo professor

Nada importado deve entrar automaticamente como questao final.

O sistema cria uma previa organizada. O professor revisa e confirma.

Para salvar no banco pessoal:

```js
statusRevisao: "revisada_professor"
visibilidade: "privada"
```

Para enviar ao acervo:

```js
statusRevisao: "pendente_acervo"
visibilidade: "pendente_acervo"
```

## Acervo geral

Questoes enviadas ao acervo passam por curadoria administrativa.

Fluxo futuro:

1. Professor envia questao revisada para acervo.
2. Questao fica como `pendente_acervo`.
3. Admin revisa.
4. Admin aprova ou rejeita.
5. Se aprovada:

```js
statusRevisao: "aprovada_acervo"
visibilidade: "publica"
```

## Imagens

Manter o mesmo fluxo atual com Cloudinary.

### Imagens de apoio

Usar:

```js
imagensApoio: []
```

Na revisao, cada questao ou bloco deve permitir anexar imagens de apoio.

### Alternativas com imagem

Usar:

```js
alternativas: [
  { texto: "", imagemUrl: "...", correta: false, ordem: 0 },
  { texto: "", imagemUrl: "...", correta: true, ordem: 1 }
]
```

Na primeira versao, texto colado nao extrai imagens automaticamente. O professor adiciona as imagens nos campos corretos durante a revisao.

Extracao automatica de imagens de PDF/Word fica para etapa futura.

## Analisador de descritores sem IA paga

Evoluir o analisador local para usar:

- regras pedagogicas;
- descricoes dos descritores;
- comandos do enunciado;
- alternativas;
- resposta correta;
- tipo de questao;
- similaridade com questoes revisadas do acervo.

Resultado esperado:

```js
{
  descritor: "D01",
  descricao: "Localizar informacoes explicitas em um texto.",
  confianca: 0.82,
  justificativa: "O enunciado pede localizar uma informacao explicita no texto.",
  criteriosAnalisados: {},
  alternativas: [
    { descritor: "D01", confianca: 0.82 },
    { descritor: "D04", confianca: 0.61 },
    { descritor: "D06", confianca: 0.48 }
  ]
}
```

## Etapas de implementacao sugeridas

1. Criar pagina `professor-importar-questoes.html`.
2. Criar parser inicial para texto colado.
3. Separar questoes e alternativas.
4. Criar tela de revisao assistida.
5. Salvar questoes revisadas no banco do professor.
6. Adicionar opcao "Enviar para acervo geral".
7. Criar tela administrativa para aprovar/rejeitar questoes do acervo.
8. Melhorar analisador local usando similaridade com questoes revisadas.
9. Futuramente, adicionar importacao de PDF/DOCX/planilha.
10. Futuramente, considerar IA real apenas se houver monetizacao e controle de custos.
