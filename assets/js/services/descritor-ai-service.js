import { disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js";
import { classificarQuestao } from "./classificador-bncc-service.js";

const CLOUD_ANALYSIS_URL = "https://us-central1-plataforma-escolar-71635.cloudfunctions.net/analisarDescritorQuestao";
const ENABLE_PAID_DESCRIPTOR_AI = false;

const STOP_WORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "e", "ou",
  "com", "sem", "para", "por", "na", "no", "nas", "nos",
  "que", "se", "como", "qual", "quais", "quem", "onde", "quando",
  "mais", "menos", "ao", "aos", "em"
]);

const DESCRIPTOR_HINTS = {
  portugues: {
    D01: {
      frases: ["segundo o texto", "de acordo com o texto", "o texto informa", "o texto diz", "retire do texto", "localize no texto"],
      palavras: ["localizar", "explicita", "quem", "quando", "onde", "trecho"]
    },
    D02: {
      frases: ["essa palavra retoma", "a palavra destacada se refere", "substitui a palavra"],
      palavras: ["retoma", "substitui", "refere", "continuidade"]
    },
    D03: {
      frases: ["sentido da palavra", "sentido da expressao", "a palavra destacada significa", "o termo destacado"],
      palavras: ["sentido", "expressao", "palavra", "significa", "termo"]
    },
    D04: {
      frases: ["pode se concluir", "e possivel inferir", "o texto sugere", "da para perceber", "subentende se"],
      palavras: ["inferir", "concluir", "sugerir", "implicita"],
      antiFrases: ["segundo o texto", "de acordo com o texto", "por que", "por qual motivo"]
    },
    D05: {
      frases: ["observe a imagem", "analise a figura", "com base no grafico", "de acordo com a tirinha", "com auxilio do material grafico"],
      palavras: ["imagem", "figura", "grafico", "tirinha", "quadrinho", "cartaz", "propaganda", "foto"],
      visual: true
    },
    D06: {
      frases: ["tema do texto", "assunto do texto", "o texto fala principalmente sobre"],
      palavras: ["tema", "assunto", "principal"]
    },
    D07: {
      frases: ["personagem principal", "conflito da narrativa", "o que aconteceu com"],
      palavras: ["personagem", "narrativa", "enredo", "conflito", "historia"]
    },
    D08: {
      frases: ["por que", "por qual motivo", "o que causou", "qual foi a consequencia", "como consequencia"],
      palavras: ["causa", "consequencia", "porque", "motivo", "resultado"],
      antiFrases: ["segundo o texto", "de acordo com o texto"]
    },
    D09: {
      frases: ["finalidade do texto", "objetivo do texto", "para que serve o texto", "qual a funcao do texto"],
      palavras: ["finalidade", "objetivo", "serve", "funcao", "intencao", "bilhete", "convite", "anuncio"]
    },
    D10: {
      frases: ["quem esta falando", "para quem o texto foi escrito", "locutor e interlocutor"],
      palavras: ["linguagem", "registro", "formal", "informal", "locutor", "interlocutor"]
    },
    D11: {
      frases: ["fato ou opiniao", "qual trecho apresenta opiniao"],
      palavras: ["fato", "opiniao", "acha", "pensa"]
    },
    D12: {
      frases: ["sentido da conjuncao", "relacao entre as ideias", "marcadas por conjuncoes"],
      palavras: ["conjuncao", "adverbio", "portanto", "porque", "entretanto", "assim"]
    },
    D13: {
      frases: ["efeito de humor", "efeito de ironia", "provoca humor"],
      palavras: ["humor", "ironia", "engracado"]
    },
    D14: {
      frases: ["efeito da pontuacao", "uso das reticencias", "uso do ponto de exclamacao"],
      palavras: ["pontuacao", "reticencias", "exclamacao", "interrogacao", "virgula", "aspas"]
    },
    D15: {
      frases: ["compare os textos", "nos dois textos", "texto 1 e texto 2", "comparando os textos"],
      palavras: ["comparar", "diferenca", "semelhanca", "contraste", "textos"]
    },
    D23: {
      frases: ["qual o genero textual", "esse texto e um", "tipo de texto"],
      palavras: ["genero", "tipo de texto", "reportagem", "bilhete", "poema", "receita", "convite"]
    }
  },
  matematica: {
    D01: {
      frases: ["qual numero", "identifique o numero", "leia o numero"],
      palavras: ["numero", "quantidade", "ler", "numeral"]
    },
    D02: {
      frases: ["ordem crescente", "ordem decrescente", "coloque em ordem", "ordene os numeros"],
      palavras: ["ordenar", "sequencia", "crescente", "decrescente"]
    },
    D03: {
      frases: ["qual figura geometrica", "nome da figura", "forma geometrica"],
      palavras: ["figura", "forma", "geometrica", "circulo", "quadrado", "triangulo", "retangulo"]
    },
    D05: {
      frases: ["medida de", "comprimento de", "capacidade de", "massa de", "reta numerica"],
      palavras: ["medida", "comprimento", "altura", "metro", "ordenar", "comparar"]
    },
    D07: {
      frases: ["calcule o resultado", "quanto e", "resolva a conta"],
      palavras: ["unidade", "litro", "quilo", "grama", "metro", "calcule"]
    },
    D10: {
      frases: ["quanto custa", "qual o troco", "cedulas e moedas", "sistema monetario"],
      palavras: ["dinheiro", "valor", "preco", "troco", "real", "moeda"]
    },
    D11: {
      frases: ["calcule o perimetro", "qual o perimetro"],
      palavras: ["perimetro", "contorno", "volta"]
    },
    D12: {
      frases: ["calcule a area", "qual a area"],
      palavras: ["area", "superficie", "malha"]
    },
    D17: {
      frases: ["calcule o resultado", "quanto e", "resolva a conta"],
      palavras: ["soma", "adicao", "subtracao", "mais", "menos", "resultado"]
    },
    D18: {
      frases: ["multiplique", "divida", "quantas vezes", "dobro", "triplo"],
      palavras: ["multiplicacao", "vezes", "produto", "divisao", "dobro", "triplo"]
    },
    D19: {
      frases: ["resolva o problema", "problema envolvendo"],
      palavras: ["problema", "situacao", "resolver"]
    },
    D24: {
      frases: ["qual fracao", "representa a fracao", "parte do todo"],
      palavras: ["fracao", "metade", "parte", "terco", "quarto"]
    },
    D26: {
      frases: ["qual a porcentagem", "desconto de", "aumento de", "por cento"],
      palavras: ["porcentagem", "desconto", "aumento", "%", "percentual"]
    },
    D27: {
      frases: ["de acordo com a tabela", "observe a tabela", "na tabela"],
      palavras: ["tabela", "linha", "coluna", "dados"],
      visual: true
    },
    D28: {
      frases: ["de acordo com o grafico", "observe o grafico", "no grafico"],
      palavras: ["grafico", "barra", "coluna", "interpretar", "dados"],
      visual: true
    }
  }
};

function normalizeContent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizePlainText(value) {
  return normalizeContent(value)
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(token) {
  if (token.length <= 3) return token;
  if (token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenizeContent(value) {
  return normalizePlainText(value)
    .split(" ")
    .map(singularize)
    .filter(token => token && token.length > 1 && !STOP_WORDS.has(token));
}

function createNgrams(tokens, size) {
  const grams = new Set();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.add(tokens.slice(index, index + size).join(" "));
  }
  return grams;
}

function getAlternativasTexto(dadosQuestao) {
  return (dadosQuestao?.alternativas || [])
    .map(item => typeof item === "string" ? item : item?.texto || "")
    .filter(Boolean)
    .join(" ");
}

function getRespostaCorretaTexto(dadosQuestao) {
  const alternativas = dadosQuestao?.alternativas || [];
  const index = Number(dadosQuestao?.respostaCorreta);
  if (Number.isNaN(index) || !alternativas[index]) {
    return "";
  }

  const alternativa = alternativas[index];
  return typeof alternativa === "string" ? alternativa : alternativa?.texto || alternativa?.imagemUrl || "";
}

function getCorpusParts(dadosQuestao) {
  const alternativasTexto = getAlternativasTexto(dadosQuestao);
  const respostaCorretaTexto = getRespostaCorretaTexto(dadosQuestao);

  return {
    alternativasTexto,
    respostaCorretaTexto,
    rawText: [
      dadosQuestao?.tituloTextoApoio,
      dadosQuestao?.tituloTexto,
      dadosQuestao?.blocoTitulo,
      dadosQuestao?.textoApoio,
      dadosQuestao?.enunciado,
      alternativasTexto,
      respostaCorretaTexto,
      dadosQuestao?.respostaEsperada,
      dadosQuestao?.tipo,
      dadosQuestao?.disciplina,
      dadosQuestao?.anoEscolar
    ].filter(Boolean).join(" ")
  };
}

async function getFirebaseIdToken() {
  if (!window.firebase?.auth) {
    return "";
  }

  const auth = window.firebase.auth();
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }

  return new Promise(resolve => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user ? user.getIdToken() : "");
    });
    setTimeout(() => {
      unsubscribe();
      resolve("");
    }, 1200);
  });
}

async function analisarDescritorComOpenAI(dadosQuestao) {
  const disciplina = dadosQuestao?.disciplina;
  const anoEscolar = dadosQuestao?.anoEscolar;

  if (!disciplinaPrecisaDescritor(disciplina) || !anoEscolar) {
    return null;
  }

  const token = await getFirebaseIdToken();
  if (!token) {
    return null;
  }

  const descritoresPermitidos = getDescritores(disciplina, anoEscolar);
  if (!descritoresPermitidos.length) {
    return null;
  }

  const response = await fetch(CLOUD_ANALYSIS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...dadosQuestao,
      descritoresPermitidos
    })
  });

  if (!response.ok) {
    throw new Error("IA indisponivel no momento.");
  }

  return response.json();
}

function buildContext(dadosQuestao) {
  const { alternativasTexto, respostaCorretaTexto, rawText } = getCorpusParts(dadosQuestao);
  const normalized = normalizePlainText(rawText);
  const tokens = tokenizeContent(rawText);
  const tokenSet = new Set(tokens);

  return {
    alternativasTexto,
    respostaCorretaTexto,
    normalized,
    tokens,
    tokenSet,
    bigrams: createNgrams(tokens, 2),
    trigrams: createNgrams(tokens, 3),
    hasVisualSupport:
      normalized.includes("imagem") ||
      normalized.includes("figura") ||
      normalized.includes("grafico") ||
      normalized.includes("tabela") ||
      normalized.includes("tirinha") ||
      normalized.includes("quadrinho") ||
      normalized.includes("cartaz") ||
      normalized.includes("foto")
  };
}

function computeHintHits(context, hint) {
  const hitsFrases = (hint.frases || []).filter(frase => context.normalized.includes(normalizePlainText(frase)));
  const hitsPalavras = (hint.palavras || []).filter(keyword => {
    const normalizedKeyword = normalizePlainText(keyword);
    if (!normalizedKeyword) return false;
    if (normalizedKeyword.includes(" ")) {
      return context.normalized.includes(normalizedKeyword);
    }
    return context.tokenSet.has(singularize(normalizedKeyword));
  });

  return { hitsFrases, hitsPalavras };
}

function scoreDescritorByDescription(context, descritor) {
  const tokens = tokenizeContent(descritor.nome);
  const bigrams = createNgrams(tokens, 2);
  const trigrams = createNgrams(tokens, 3);
  let score = 0;

  tokens.forEach(token => {
    if (context.tokenSet.has(token)) score += 0.8;
  });
  bigrams.forEach(gram => {
    if (context.bigrams.has(gram)) score += 2;
  });
  trigrams.forEach(gram => {
    if (context.trigrams.has(gram)) score += 2.8;
  });

  return score;
}

function applyPortuguesDisambiguation(codigo, context, dadosQuestao) {
  let score = 0;
  const hasExplicit = context.normalized.includes("segundo o texto") || context.normalized.includes("de acordo com o texto");
  const hasCause = context.normalized.includes("por que") || context.normalized.includes("por qual motivo") || context.normalized.includes("consequencia");
  const hasPurpose = context.normalized.includes("finalidade") || context.normalized.includes("objetivo do texto") || context.normalized.includes("serve o texto");

  if (codigo === "D04" && hasExplicit) score -= 1.5;
  if (codigo === "D04" && hasCause) score -= 2;
  if (codigo === "D08" && !hasCause) score -= 3;
  if (codigo === "D09" && hasPurpose) score += 3.5;
  if (codigo === "D09" && dadosQuestao?.tipo === "resposta_escrita") score += 1.2;
  if (codigo === "D05" && !context.hasVisualSupport) score -= 3;
  if (codigo === "D01" && !hasExplicit) score -= 1;

  return score;
}

function applyMatematicaDisambiguation(codigo, context) {
  let score = 0;
  const hasTable = context.normalized.includes("tabela");
  const hasChart = context.normalized.includes("grafico");
  const hasPercent = context.normalized.includes("porcentagem") || context.normalized.includes("%") || context.normalized.includes("por cento");
  const hasFraction = context.normalized.includes("fracao") || context.normalized.includes("metade") || context.normalized.includes("terco");

  if (codigo === "D27" && !hasTable) score -= 3;
  if (codigo === "D28" && !hasChart) score -= 3;
  if (codigo === "D26" && !hasPercent) score -= 3;
  if (codigo === "D24" && !hasFraction) score -= 2.5;
  if (codigo === "D17" && context.normalized.includes("vezes")) score -= 1.4;
  if (codigo === "D18" && (context.normalized.includes("mais") || context.normalized.includes("menos"))) score -= 1.1;

  return score;
}

function rankDescritores(disciplina, descritores, context, dadosQuestao) {
  return descritores
    .map(descritor => {
      const hint = DESCRIPTOR_HINTS[disciplina]?.[descritor.codigo] || { frases: [], palavras: [] };
      const { hitsFrases, hitsPalavras } = computeHintHits(context, hint);

      let score = 0;
      score += hitsFrases.length * 4;
      score += hitsPalavras.length * 1.3;
      score += scoreDescritorByDescription(context, descritor);

      if (hint.visual && context.hasVisualSupport) {
        score += 2.5;
      }

      (hint.antiFrases || []).forEach(frase => {
        if (context.normalized.includes(normalizePlainText(frase))) {
          score -= 2.5;
        }
      });

      if (disciplina === "portugues") {
        score += applyPortuguesDisambiguation(descritor.codigo, context, dadosQuestao);
      }

      if (disciplina === "matematica") {
        score += applyMatematicaDisambiguation(descritor.codigo, context);
      }

      return {
        descritor: descritor.codigo,
        descricao: descritor.nome,
        score,
        hitsFrases,
        hitsPalavras
      };
    })
    .sort((a, b) => b.score - a.score);
}

function formatRankedAlternatives(ranking) {
  return ranking.slice(0, 3).map(item => ({
    descritor: item.descritor,
    confianca: Math.max(0, Math.min(0.95, 0.34 + (Math.max(item.score, 0) * 0.08)))
  }));
}

function enrichSuggestionWithMetadata(dadosQuestao, suggestion) {
  if (!suggestion || !suggestion.descritor) {
    return suggestion;
  }

  const descritorInfo = getDescritores(dadosQuestao?.disciplina, dadosQuestao?.anoEscolar)
    .find(item => item.codigo === suggestion.descritor);

  if (!descritorInfo) {
    return suggestion;
  }

  const bncc = descritorInfo.bncc || {};

  return {
    ...suggestion,
    descricao: suggestion.descricao || descritorInfo.nome || "",
    bncc,
    codigoHabilidadeBncc: bncc.codigoHabilidade || "",
    habilidadeBncc: bncc.habilidade || "",
    componenteCurricularBncc: bncc.componenteCurricular || "",
    unidadeTematicaBncc: bncc.unidadeTematica || "",
    objetoConhecimentoBncc: bncc.objetoConhecimento || "",
    praticaLinguagemBncc: bncc.praticaLinguagem || "",
    campoAtuacaoBncc: bncc.campoAtuacao || "",
    areaConhecimentoBncc: bncc.areaConhecimento || ""
  };
}

export async function analisarDescritorLocal(dadosQuestao) {
  const disciplina = dadosQuestao?.disciplina;
  const anoEscolar = dadosQuestao?.anoEscolar;

  if (!disciplinaPrecisaDescritor(disciplina) || !anoEscolar) {
    return null;
  }

  const descritores = getDescritores(disciplina, anoEscolar);
  if (!descritores.length) {
    return null;
  }

  const context = buildContext(dadosQuestao);
  const ranking = rankDescritores(disciplina, descritores, context, dadosQuestao);
  const melhor = ranking[0];
  const segundo = ranking[1];
  const gap = segundo ? melhor.score - segundo.score : melhor.score;

  if (!melhor || melhor.score < 2.2) {
    return {
      descritor: "",
      descricao: "",
      confianca: 0,
      justificativa: "Nenhuma sugestao automatica confiavel foi encontrada.",
      criteriosAnalisados: {
        tituloTexto: Boolean(dadosQuestao?.tituloTextoApoio || dadosQuestao?.tituloTexto || dadosQuestao?.blocoTitulo),
        textoApoio: Boolean(dadosQuestao?.textoApoio),
        enunciado: Boolean(dadosQuestao?.enunciado),
        alternativas: Boolean(context.alternativasTexto),
        respostaCorreta: Boolean(context.respostaCorretaTexto),
        tipoQuestao: Boolean(dadosQuestao?.tipo),
        anoEscolar,
        disciplina,
        termosEncontrados: []
      },
      alternativas: formatRankedAlternatives(ranking)
    };
  }

  if (melhor.score < 5 && gap < 1.1) {
    return {
      descritor: "",
      descricao: "",
      confianca: 0,
      justificativa: "Ha ambiguidade entre descritores parecidos. Revise manualmente.",
      criteriosAnalisados: {
        tituloTexto: Boolean(dadosQuestao?.tituloTextoApoio || dadosQuestao?.tituloTexto || dadosQuestao?.blocoTitulo),
        textoApoio: Boolean(dadosQuestao?.textoApoio),
        enunciado: Boolean(dadosQuestao?.enunciado),
        alternativas: Boolean(context.alternativasTexto),
        respostaCorreta: Boolean(context.respostaCorretaTexto),
        tipoQuestao: Boolean(dadosQuestao?.tipo),
        anoEscolar,
        disciplina,
        termosEncontrados: [...melhor.hitsFrases, ...melhor.hitsPalavras]
      },
      alternativas: formatRankedAlternatives(ranking)
    };
  }

  const confianca = Math.max(0.36, Math.min(0.96, 0.38 + (melhor.score * 0.05) + Math.max(gap, 0) * 0.04));
  return {
    descritor: melhor.descritor,
    descricao: melhor.descricao,
    confianca,
    justificativa: `Sugestao baseada em titulo, texto, enunciado, alternativas, resposta correta, tipo, ano e disciplina. Frases-chave: ${melhor.hitsFrases.join(", ") || "nenhuma"}. Termos encontrados: ${melhor.hitsPalavras.join(", ") || "nenhum"}.`,
    criteriosAnalisados: {
      tituloTexto: Boolean(dadosQuestao?.tituloTextoApoio || dadosQuestao?.tituloTexto || dadosQuestao?.blocoTitulo),
      textoApoio: Boolean(dadosQuestao?.textoApoio),
      enunciado: Boolean(dadosQuestao?.enunciado),
      alternativas: Boolean(context.alternativasTexto),
      respostaCorreta: Boolean(context.respostaCorretaTexto),
      tipoQuestao: Boolean(dadosQuestao?.tipo),
      anoEscolar,
      disciplina,
      termosEncontrados: [...melhor.hitsFrases, ...melhor.hitsPalavras]
    },
    alternativas: formatRankedAlternatives(ranking)
  };
}

export async function analisarDescritorQuestao(dadosQuestao) {
  const resultado = classificarQuestao({
    enunciado: dadosQuestao?.enunciado || "",
    texto_base: dadosQuestao?.textoApoio || dadosQuestao?.tituloTextoApoio || "",
    alternativas: dadosQuestao?.alternativas || [],
    disciplina: dadosQuestao?.disciplina || "",
    ano: dadosQuestao?.anoEscolar || ""
  });

  if (!resultado?.codigo_bncc) {
    return {
      descritor: "",
      descricao: "",
      confianca: 0,
      justificativa: resultado?.justificativa || "Nenhuma classificacao BNCC encontrada.",
      origemAnalise: "bncc_regras",
      codigo_bncc: null,
      habilidade_bncc: "Nao identificada",
      categoria_bncc: "",
      saeb_equivalente: "",
      parana_equivalente: "",
      confianca_classificacao: "baixa",
      pontuacao_classificacao: 0
    };
  }

  const mapaConfianca = { alta: 0.9, media: 0.6, baixa: 0.2 };
  return {
    descritor: resultado.saeb || resultado.parana || "",
    descricao: resultado.habilidade,
    confianca: mapaConfianca[resultado.confianca] || 0,
    justificativa: resultado.justificativa,
    origemAnalise: "bncc_regras",
    codigo_bncc: resultado.codigo_bncc,
    habilidade_bncc: resultado.habilidade,
    categoria_bncc: resultado.categoria,
    saeb_equivalente: resultado.saeb || "",
    parana_equivalente: resultado.parana || "",
    confianca_classificacao: resultado.confianca,
    pontuacao_classificacao: Number(resultado.pontuacao || 0),
    bncc: {
      codigoHabilidade: resultado.codigo_bncc,
      habilidade: resultado.habilidade,
      componenteCurricular: resultado.disciplina,
      unidadeTematica: "",
      objetoConhecimento: "",
      praticaLinguagem: "",
      campoAtuacao: "",
      areaConhecimento: ""
    },
    codigoHabilidadeBncc: resultado.codigo_bncc,
    habilidadeBncc: resultado.habilidade
  };
}

export async function sugerirDescritorComIA(dadosQuestao) {
  return analisarDescritorQuestao(dadosQuestao);
}
