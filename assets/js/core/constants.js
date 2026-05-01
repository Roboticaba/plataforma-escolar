export const ANOS_ESCOLARES = [
  { value: "1", label: "1º Ano" },
  { value: "2", label: "2º Ano" },
  { value: "3", label: "3º Ano" },
  { value: "4", label: "4º Ano" },
  { value: "5", label: "5º Ano" }
];

export const DISCIPLINAS = [
  { value: "portugues", label: "Português" },
  { value: "matematica", label: "Matemática" },
  { value: "ciencias", label: "Ciências" },
  { value: "historia", label: "História" },
  { value: "geografia", label: "Geografia" },
  { value: "arte", label: "Arte" },
  { value: "edfisica", label: "Ed. Física" },
  { value: "ingles", label: "Inglês" },
  { value: "robotica", label: "Robótica" }
];

function sanitizeBnccValue(value) {
  return String(value || "").trim();
}

function normalizeBnccMetadata(metadata = {}) {
  const raw = metadata?.bncc && typeof metadata.bncc === "object"
    ? metadata.bncc
    : metadata;

  return {
    codigoHabilidade: sanitizeBnccValue(raw.codigoHabilidade || raw.codigoHabilidadeBncc || raw.habilidadeCodigoBncc || raw.codigoBncc || raw.codigo || ""),
    habilidade: sanitizeBnccValue(raw.habilidade || raw.habilidadeBncc || ""),
    componenteCurricular: sanitizeBnccValue(raw.componenteCurricular || raw.componenteCurricularBncc || ""),
    unidadeTematica: sanitizeBnccValue(raw.unidadeTematica || raw.unidadeTematicaBncc || ""),
    objetoConhecimento: sanitizeBnccValue(raw.objetoConhecimento || raw.objetoConhecimentoBncc || ""),
    praticaLinguagem: sanitizeBnccValue(raw.praticaLinguagem || raw.praticaLinguagemBncc || ""),
    campoAtuacao: sanitizeBnccValue(raw.campoAtuacao || raw.campoAtuacaoBncc || ""),
    areaConhecimento: sanitizeBnccValue(raw.areaConhecimento || raw.areaConhecimentoBncc || "")
  };
}

function attachBnccFields(base, metadata = {}) {
  const bncc = normalizeBnccMetadata(metadata);
  return {
    ...base,
    bncc,
    codigoHabilidadeBncc: bncc.codigoHabilidade,
    habilidadeBncc: bncc.habilidade,
    componenteCurricularBncc: bncc.componenteCurricular,
    unidadeTematicaBncc: bncc.unidadeTematica,
    objetoConhecimentoBncc: bncc.objetoConhecimento,
    praticaLinguagemBncc: bncc.praticaLinguagem,
    campoAtuacaoBncc: bncc.campoAtuacao,
    areaConhecimentoBncc: bncc.areaConhecimento
  };
}

function criarDescritores(items) {
  return items.map(item => {
    if (Array.isArray(item)) {
      const [codigo, nome, metadata = {}] = item;
      return attachBnccFields({ codigo, nome }, metadata);
    }

    return attachBnccFields(
      {
        codigo: item?.codigo || "",
        nome: item?.nome || ""
      },
      item || {}
    );
  });
}

export const DESCRITORES = {
  portugues: {
    "1": criarDescritores([
      ["D01", "Relacionar elementos sonoros das palavras com sua representação escrita."],
      ["D02", "Ler palavras."],
      ["D09", "Escrever palavras."]
    ]),
    "2": criarDescritores([
      ["D01", "Relacionar elementos sonoros das palavras com sua representação escrita."],
      ["D02", "Ler palavras."],
      ["D03", "Ler frases."],
      ["D04", "Localizar informações explícitas em textos."],
      ["D05", "Reconhecer a finalidade de um texto."],
      ["D06", "Inferir o assunto de um texto."],
      ["D07", "Inferir informações em textos verbais."],
      ["D08", "Inferir informações em textos que articulam linguagem verbal e não verbal."],
      ["D09", "Escrever palavras."],
      ["D10", "Escrever textos."]
    ]),
    "3": criarDescritores([
      ["D02", "Estabelecer relações entre partes de um texto, identificando repetições ou substituições que contribuem para a continuidade de um texto."],
      ["D03", "Inferir o sentido de uma palavra ou expressão."],
      ["D04", "Localizar informações explícitas e iniciar inferências simples em textos."],
      ["D08", "Estabelecer relação causa/consequência entre partes e elementos do texto."]
    ]),
    "4": criarDescritores([
      ["D04", "Inferir uma informação implícita em um texto."],
      ["D05", "Interpretar texto com auxílio de material gráfico diverso."],
      ["D06", "Identificar o tema de um texto."],
      ["D07", "Identificar o conflito gerador do enredo e os elementos que constroem a narrativa."],
      ["D08", "Estabelecer relação causa/consequência entre partes e elementos do texto."],
      ["D12", "Estabelecer relações lógico-discursivas presentes no texto, marcadas por conjunções, advérbios, etc."]
    ]),
    "5": criarDescritores([
      ["D01", "Localizar informações explícitas em um texto."],
      ["D02", "Estabelecer relações entre partes de um texto, identificando repetições ou substituições que contribuem para a continuidade de um texto."],
      ["D03", "Inferir o sentido de uma palavra ou expressão."],
      ["D04", "Inferir uma informação implícita em um texto."],
      ["D05", "Interpretar texto com auxílio de material gráfico diverso (propagandas, quadrinhos, foto, etc.)."],
      ["D06", "Identificar o tema de um texto."],
      ["D07", "Identificar o conflito gerador do enredo e os elementos que constroem a narrativa."],
      ["D08", "Estabelecer relação causa/consequência entre partes e elementos do texto."],
      ["D09", "Identificar a finalidade de textos de diferentes gêneros."],
      ["D10", "Identificar as marcas linguísticas que evidenciam o locutor e o interlocutor de um texto."],
      ["D11", "Distinguir um fato da opinião relativa a esse fato."],
      ["D12", "Estabelecer relações lógico-discursivas presentes no texto, marcadas por conjunções, advérbios, etc."],
      ["D13", "Identificar efeitos de ironia ou humor em textos variados."],
      ["D14", "Identificar o efeito de sentido decorrente do uso da pontuação e de outras notações."],
      ["D15", "Reconhecer diferentes formas de tratar uma informação na comparação de textos que tratam do mesmo tema."]
    ])
  },
  matematica: {
    "1": criarDescritores([
      ["D01", "Reconhecer o que os números naturais indicam em diferentes situações: quantidade, ordem, medida ou código de identificação."],
      ["D02", "Identificar a posição ordinal de um objeto ou termo em uma sequência."],
      ["D04", "Comparar ou ordenar quantidades de objetos."],
      ["D12", "Classificar objetos por atributos como cor, forma e medida."]
    ]),
    "2": criarDescritores([
      ["D01", "Reconhecer o que os números naturais indicam em diferentes situações: quantidade, ordem, medida ou código de identificação."],
      ["D02", "Identificar a posição ordinal de um objeto ou termo em uma sequência (1º, 2º etc.)."],
      ["D03", "Escrever números naturais de até 3 ordens em sua representação por algarismos ou em língua materna."],
      ["D04", "Comparar ou ordenar quantidades de objetos (até 2 ordens)."],
      ["D05", "Comparar ou ordenar números naturais de até 3 ordens, com ou sem suporte da reta numérica."],
      ["D06", "Identificar a ordem ocupada por um algarismo ou seu valor posicional em um número natural de até 3 ordens."],
      ["D07", "Calcular o resultado de adições ou subtrações com números naturais de até 3 ordens."],
      ["D08", "Compor ou decompor números naturais de até 3 ordens por meio de diferentes adições."],
      ["D09", "Resolver problemas de adição ou subtração com os significados de juntar, acrescentar, separar ou retirar."],
      ["D10", "Resolver problemas de multiplicação ou divisão (2, 3, 4 ou 5), com ideias de grupos iguais ou proporcionalidade."],
      ["D11", "Analisar argumentações sobre resolução de operações com números naturais."],
      ["D12", "Classificar objetos por atributos como cor, forma e medida."],
      ["D13", "Inferir propriedades comuns em sequências de números naturais."],
      ["D14", "Inferir padrões em sequências de números, objetos ou figuras."],
      ["D15", "Inferir elementos ausentes em sequências."],
      ["D16", "Identificar localização ou deslocamento em representações bidimensionais (mapas, croquis etc.)."],
      ["D17", "Reconhecer figuras geométricas espaciais (cubo, pirâmide, cone, etc.)."],
      ["D18", "Reconhecer figuras geométricas planas (círculo, quadrado, retângulo, triângulo)."],
      ["D19", "Descrever ou representar deslocamentos em mapas ou plantas."],
      ["D20", "Comparar comprimentos, capacidades ou massas."],
      ["D21", "Estimar ou medir comprimento, capacidade ou massa."],
      ["D22", "Identificar medidas com base em instrumentos."],
      ["D23", "Reconhecer unidades e instrumentos de medida."],
      ["D24", "Identificar sequência de acontecimentos no dia."],
      ["D25", "Identificar ou escrever datas (dia, mês, ano)."],
      ["D26", "Relacionar valores de moedas e cédulas."],
      ["D27", "Determinar duração entre datas."],
      ["D28", "Determinar duração entre horários."],
      ["D29", "Resolver problemas com dinheiro."],
      ["D30", "Classificar eventos aleatórios (prováveis, improváveis, certos, impossíveis)."],
      ["D31", "Ler e comparar dados em tabelas."],
      ["D32", "Ler e comparar dados em gráficos."],
      ["D33", "Representar dados em listas, tabelas ou gráficos."]
    ]),
    "3": criarDescritores([
      ["D08", "Compor ou decompor números naturais por meio de diferentes adições."],
      ["D10", "Resolver problemas de multiplicação ou divisão com ideias de grupos iguais ou proporcionalidade."],
      ["D14", "Inferir padrões em sequências de números, objetos ou figuras."],
      ["D20", "Comparar comprimentos, capacidades ou massas."],
      ["D25", "Identificar ou escrever datas (dia, mês, ano)."]
    ]),
    "4": criarDescritores([
      ["D11", "Analisar argumentações sobre resolução de operações com números naturais."],
      ["D13", "Inferir propriedades comuns em sequências de números naturais."],
      ["D21", "Estimar ou medir comprimento, capacidade ou massa."],
      ["D22", "Identificar medidas com base em instrumentos."],
      ["D23", "Reconhecer unidades e instrumentos de medida."],
      ["D29", "Resolver problemas com dinheiro."],
      ["D31", "Ler e comparar dados em tabelas."],
      ["D32", "Ler e comparar dados em gráficos."]
    ]),
    "5": criarDescritores([
      ["D01", "Identificar a localização/movimentação de objeto em mapas, croquis e outras representações gráficas."],
      ["D02", "Identificar propriedades comuns e diferenças entre poliedros e corpos redondos, relacionando figuras tridimensionais com suas planificações."],
      ["D03", "Identificar propriedades comuns e diferenças entre figuras bidimensionais pelo número de lados e tipos de ângulos."],
      ["D04", "Identificar quadriláteros observando as posições relativas entre seus lados."],
      ["D05", "Reconhecer conservação ou modificação de medidas em ampliação/redução de figuras em malhas."],
      ["D06", "Estimar medida de grandezas com unidades convencionais ou não."],
      ["D07", "Resolver problemas com unidades de medida (comprimento, massa, capacidade)."],
      ["D08", "Estabelecer relações entre unidades de medida de tempo."],
      ["D09", "Relacionar horários de início, término e duração de eventos."],
      ["D10", "Realizar trocas entre cédulas e moedas."],
      ["D11", "Resolver problemas de perímetro em malhas quadriculadas."],
      ["D12", "Resolver problemas de área em malhas quadriculadas."],
      ["D13", "Reconhecer características do sistema de numeração decimal."],
      ["D14", "Identificar números naturais na reta numérica."],
      ["D15", "Reconhecer decomposição de números naturais."],
      ["D16", "Reconhecer composição/decomposição na forma polinomial."],
      ["D17", "Calcular adição ou subtração de números naturais."],
      ["D18", "Calcular multiplicação ou divisão de números naturais."],
      ["D19", "Resolver problemas de adição/subtração com diferentes significados."],
      ["D20", "Resolver problemas de multiplicação/divisão com diferentes significados."],
      ["D21", "Identificar diferentes representações de número racional."],
      ["D22", "Localizar números racionais (decimal) na reta numérica."],
      ["D23", "Resolver problemas com valores monetários em decimal."],
      ["D24", "Identificar fração com diferentes significados."],
      ["D25", "Resolver problemas com números racionais na forma decimal."],
      ["D26", "Resolver problemas com porcentagem (25%, 50%, 100%)."],
      ["D27", "Ler dados em tabelas."],
      ["D28", "Ler dados em gráficos (principalmente colunas)."]
    ])
  }
};

export function disciplinaPrecisaDescritor(disciplina) {
  return disciplina === "portugues" || disciplina === "matematica";
}

export function getDescritores(disciplina, anoEscolar) {
  if (!disciplina || !anoEscolar || !DESCRITORES[disciplina]) {
    return [];
  }

  return DESCRITORES[disciplina][anoEscolar] || [];
}

export function getDescritorDescricao(disciplina, anoEscolar, codigo) {
  const item = getDescritores(disciplina, anoEscolar).find(entry => entry.codigo === codigo);
  return item ? item.nome : "";
}

export function getDescritorBnccFields(disciplina, anoEscolar, codigo) {
  const item = getDescritores(disciplina, anoEscolar).find(entry => entry.codigo === codigo);
  return item?.bncc || {
    codigoHabilidade: "",
    habilidade: "",
    componenteCurricular: "",
    unidadeTematica: "",
    objetoConhecimento: "",
    praticaLinguagem: "",
    campoAtuacao: "",
    areaConhecimento: ""
  };
}

export function getDisciplinaLabel(value) {
  const disciplina = DISCIPLINAS.find(item => item.value === value);
  return disciplina ? disciplina.label : value || "";
}

export function getAnoLabel(value) {
  const ano = ANOS_ESCOLARES.find(item => item.value === value);
  return ano ? ano.label : value || "";
}
