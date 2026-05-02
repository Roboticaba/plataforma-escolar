import { db } from "../core/firebase-app.js";
import { buildQuestionRecord, limparAlternativas } from "./questions-service.js";
import { getDescritores } from "../core/constants.js";

const QUESTION_LINE_REGEX = /^\s*(?:questao\s*)?(\d{1,3})\s*(?:[)\.:\-ÂºÂ°o]*\s*)?(.+)?$/i;
const QUESTION_ONLY_LABEL_REGEX = /^\s*questao\s*(\d{1,3})\s*$/i;
const NUMBER_ONLY_QUESTION_REGEX = /^\s*(\d{1,3})\s*$/;
const NUMBER_MARKER_ONLY_REGEX = /^\s*(\d{1,3})\s*[)\.:\-]+\s*$/;
const PAGE_NUMBER_ONLY_REGEX = /^\s*\d{1,2}\s*$/;
const ALT_LINE_REGEX = /^\s*(?:\(?\s*([A-Ea-e])\s*\)?|(\d{1,2}))\s*[)\.:\-]\s*(.+)?$/;
const ALT_ONLY_LABEL_REGEX = /^\s*\(?\s*([A-Ea-e])\s*\)?\s*$/;
const GABARITO_HEADER_REGEX = /^\s*gabarito\b/i;
const RESPOSTA_HEADER_REGEX = /^\s*respostas?\s*(?:[:\-])?\s*$/i;
const PAGE_NOISE_REGEX = /^\s*(saeb|prova brasil|pagina\s+\d+|p[aÃ¡]gina\s+\d+|inep|ministerio da educacao|mec)\b/i;
const REFERENCE_NOISE_REGEX = /(disponivel em:|https?:\/\/|www\.|\.com\b|\.htm\b|fromview=|uuid=|query=|position=)/i;
const SUPPORT_BLOCK_START_REGEX = /^(leia\s+(?:o|a|os|as)?\s*(?:texto|tirinha|poema|quadrinho|cartaz|anuncio|anúncio|grafico|gráfico|imagem|tabela)|considere\s+(?:o|a)\s+(?:texto|imagem|tirinha|poema)|observe\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela|grafico|gráfico)|analise\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela|grafico|gráfico)|texto\s+para\s+as\s+questoes|texto\s+para\s+as\s+questões)/i;

const PRE_CLASSIFICATION_RULES = [
  {
    id: "tema",
    categoria: "Tema",
    conteudo: "Tema e ideia principal",
    descritorPorDisciplina: { portugues: "D06" },
    bnccPorDisciplina: { portugues: "EF15LP03" },
    palavrasChave: ["tema", "assunto", "ideia principal", "fala principalmente", "principalmente sobre"],
    confiancaBase: "alta"
  },
  {
    id: "informacao_explicita",
    categoria: "Informação explícita",
    conteudo: "Localização de informação explícita",
    descritorPorDisciplina: { portugues: "D01" },
    bnccPorDisciplina: { portugues: "EF15LP02" },
    palavrasChave: ["de acordo com o texto", "segundo o texto", "conforme o texto", "o texto informa", "retire do texto", "localize no texto"],
    confiancaBase: "alta"
  },
  {
    id: "inferencia",
    categoria: "Inferência",
    conteudo: "Inferência de informações implícitas",
    descritorPorDisciplina: { portugues: "D04" },
    bnccPorDisciplina: { portugues: "EF15LP03" },
    palavrasChave: ["inferir", "concluir", "provavelmente", "sugere", "podemos imaginar", "podemos concluir", "subentende", "implicita"],
    confiancaBase: "alta"
  },
  {
    id: "sentido_palavra",
    categoria: "Sentido de palavra",
    conteudo: "Sentido de palavra ou expressão",
    descritorPorDisciplina: { portugues: "D03" },
    bnccPorDisciplina: { portugues: "EF15LP05" },
    palavrasChave: ["significa", "expressao", "expressão", "palavra destacada", "termo destacado", "sentido da palavra", "sentido da expressao", "indica ideia de", "no texto a palavra"],
    confiancaBase: "alta"
  },
  {
    id: "causa_consequencia",
    categoria: "Causa e consequência",
    conteudo: "Relação de causa e consequência",
    descritorPorDisciplina: { portugues: "D08" },
    bnccPorDisciplina: { portugues: "EF15LP03" },
    palavrasChave: ["por que", "motivo", "resultado", "consequencia", "consequência", "causa", "o que causou"],
    confiancaBase: "alta"
  },
  {
    id: "finalidade",
    categoria: "Finalidade",
    conteudo: "Finalidade de textos",
    descritorPorDisciplina: { portugues: "D09" },
    bnccPorDisciplina: { portugues: "EF15LP04" },
    palavrasChave: ["objetivo", "finalidade", "para que serve", "funcao do texto", "função do texto", "intencao", "intenção"],
    confiancaBase: "alta"
  },
  {
    id: "genero",
    categoria: "Gênero",
    conteudo: "Identificação de gênero textual",
    descritorPorDisciplina: { portugues: "D23" },
    bnccPorDisciplina: { portugues: "EF15LP01" },
    palavrasChave: ["fabula", "fábula", "noticia", "notícia", "poema", "genero", "gênero", "tirinha", "receita", "bilhete", "convite"],
    confiancaBase: "media"
  },
  {
    id: "pontuacao",
    categoria: "Pontuação",
    conteudo: "Pontuação",
    descritorPorDisciplina: { portugues: "D14" },
    bnccPorDisciplina: { portugues: "EF05LP04" },
    palavrasChave: ["virgula", "vírgula", "pontuacao", "pontuação", "reticencias", "reticências", "ponto de exclamacao", "ponto de interrogação", "ponto de interrogacao"],
    confiancaBase: "alta"
  },
  {
    id: "ortografia",
    categoria: "Ortografia",
    conteudo: "Ortografia e escrita correta",
    descritorPorDisciplina: { portugues: "D01" },
    bnccPorDisciplina: { portugues: "EF05LP01" },
    palavrasChave: ["grafia", "escrita correta", "ortografia", "escreva corretamente"],
    confiancaBase: "media"
  },
  {
    id: "formacao_palavras",
    categoria: "Formação de palavras",
    conteudo: "Formação de palavras",
    descritorPorDisciplina: { portugues: "D03" },
    bnccPorDisciplina: { portugues: "EF05LP08" },
    palavrasChave: ["prefixo", "sufixo", "formacao de palavras", "formação de palavras", "palavra derivada", "palavra primitiva", "prefixacao", "prefixação", "sufixacao", "sufixação"],
    confiancaBase: "media"
  }
];

function sanitize(value) {
  return String(value || "").trim();
}

function splitLines(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trimEnd());
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeQuestionHint(value) {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bquest\s+o\b/g, "questao")
    .replace(/\bquest\s+a\s*o\b/g, "questao")
    .replace(/\bquest\s*o\b/g, "questao")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseText(value) {
  return sanitize(value)
    .replace(/\s+/g, " ")
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬Â]/g, "\"")
    .replace(/[Ã¢â‚¬ËœÃ¢â‚¬â„¢]/g, "'")
    .trim();
}

function normalizeKeywordText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSupportBlockStart(line) {
  return SUPPORT_BLOCK_START_REGEX.test(normalizeKeywordText(line));
}

function isIgnorableLine(line) {
  return !sanitize(line) ||
    PAGE_NOISE_REGEX.test(normalizeQuestionHint(line)) ||
    REFERENCE_NOISE_REGEX.test(String(line || ""));
}

function normalizeAnswerToken(token) {
  const clean = sanitize(token).toUpperCase();
  if (!clean) return "";
  if (/^[A-E]$/.test(clean)) return clean;
  if (/^\d+$/.test(clean)) return clean;
  return "";
}

function parseGabarito(lines) {
  const answers = new Map();
  const body = lines.join(" ");
  const regex = /(\d{1,3})\s*[-:=]\s*([A-Ea-e]|\d{1,2})/g;
  let match = regex.exec(body);

  while (match) {
    answers.set(Number(match[1]), normalizeAnswerToken(match[2]));
    match = regex.exec(body);
  }

  return answers;
}

function splitSections(rawText) {
  const lines = splitLines(rawText);
  const mainLines = [];
  const answerLines = [];
  let inAnswers = false;

  lines.forEach(line => {
    if (GABARITO_HEADER_REGEX.test(line) || RESPOSTA_HEADER_REGEX.test(line)) {
      inAnswers = true;
      answerLines.push(line);
      return;
    }

    if (inAnswers) {
      answerLines.push(line);
    } else {
      mainLines.push(line);
    }
  });

  return {
    mainLines,
    answerMap: parseGabarito(answerLines)
  };
}

function createQuestionDraft(order, context, data = {}) {
  return {
    tempId: `import-${order}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    numeroOriginal: order,
    anoEscolar: context.anoEscolar,
    disciplina: context.disciplina,
    tituloTextoApoio: context.titulo || "",
    textoApoio: context.textoBase || "",
    enunciado: data.enunciado || "",
    tipo: data.tipo || "multipla_texto",
    alternativas: data.alternativas || [],
    respostaCorreta: data.respostaCorreta ?? "",
    gabaritoOriginal: data.gabaritoOriginal || "",
    respostaEsperada: data.respostaEsperada || "",
    alternativasRaw: Array.isArray(data.alternativasRaw) ? [...data.alternativasRaw] : [],
    descritor: "",
    descritorDescricao: "",
    descritorConfirmadoPeloProfessor: false,
    descritorSugestaoIA: null,
    classificacaoSugestao: null,
    formatoAlternativas: "(A)",
    nivelDificuldade: "",
    blocoTitulo: context.titulo || "",
    blocoId: "",
    ordemBloco: order - 1,
    origemCriacao: "importacao_professor",
    importacaoId: "",
    visibilidade: "privada",
    statusRevisao: "rascunho_importado",
    fonte: { ...context.fonte },
    confirmadoParaSalvar: true
  };
}

function isQuestionStartLine(line) {
  const normalized = normalizeQuestionHint(line);
  return QUESTION_ONLY_LABEL_REGEX.test(normalized) ||
    QUESTION_LINE_REGEX.test(normalized) ||
    NUMBER_ONLY_QUESTION_REGEX.test(normalized);
}

function isExplicitQuestionMarker(line) {
  const normalized = normalizeQuestionHint(line);
  return QUESTION_ONLY_LABEL_REGEX.test(normalized) ||
    /^questao\s+\d{1,3}\b/i.test(normalized);
}

function trimToFirstExplicitQuestion(lines) {
  const firstQuestionIndex = lines.findIndex(line => isExplicitQuestionMarker(line));
  if (firstQuestionIndex === -1) {
    return lines;
  }

  return lines.slice(firstQuestionIndex);
}

function guessTextoBase(lines) {
  const buffer = [];
  let hitQuestion = false;

  for (const line of lines) {
    if (isQuestionStartLine(line)) {
      hitQuestion = true;
      break;
    }

    if (!isIgnorableLine(line)) {
      buffer.push(normalizeLooseText(line));
    }
  }

  return hitQuestion ? buffer.join("\n") : "";
}

function guessQuestionTitle(lines, fallbackTitle) {
  const titleLine = lines.find(line => !isIgnorableLine(line) && !isQuestionStartLine(line));
  return sanitize(fallbackTitle || titleLine || "");
}

function buildImportBlockId(context) {
  const base = sanitize(context.titulo || context.textoBase || "bloco")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `bloco-importado-${base || "texto"}-${Date.now()}`;
}

function shouldCreateSharedBlock(questions, context) {
  return Boolean(
    Array.isArray(questions) &&
    questions.length > 1 &&
    sanitize(context.textoBase)
  );
}

function applySharedBlockMetadata(questions, context) {
  if (!shouldCreateSharedBlock(questions, context)) {
    return questions.map((question, index) => ({
      ...question,
      blocoId: "",
      blocoTitulo: "",
      ordemBloco: index
    }));
  }

  const blocoId = buildImportBlockId(context);
  const blocoTitulo = sanitize(context.titulo || "Bloco importado");

  return questions.map((question, index) => ({
    ...question,
    blocoId,
    blocoTitulo,
    ordemBloco: index,
    origemCriacao: "importacao_bloco"
  }));
}

function finalizeDraft(current, answerMap) {
  if (!current || !sanitize(current.enunciado)) return null;

  const alternativasTexto = limparAlternativas((current.alternativasRaw || []).join("\n"));
  let tipo = "resposta_escrita";
  let alternativas = [];
  let respostaCorreta = "";
  const answerToken = answerMap.get(current.numeroOriginal) || "";

  if (alternativasTexto.length >= 2) {
    tipo = "multipla_texto";
    alternativas = alternativasTexto.map((texto, index) => ({
      texto,
      imagemUrl: "",
        correta: false,
        ordem: index
      }));

    if (/^[A-E]$/.test(answerToken)) {
      respostaCorreta = answerToken.charCodeAt(0) - 65;
    } else if (/^\d+$/.test(answerToken)) {
      respostaCorreta = Math.max(0, Number(answerToken) - 1);
    }
  }

  return {
    ...current,
    tipo,
    alternativas,
    respostaCorreta,
    gabaritoOriginal: answerToken,
    enunciado: normalizeLooseText(current.enunciado),
    alternativasRaw: undefined
  };
}

function startQuestionDraft(effectiveContext, questionNumber, inlineText = "") {
  return createQuestionDraft(Number(questionNumber), effectiveContext, {
    enunciado: normalizeLooseText(inlineText),
    alternativasRaw: []
  });
}

function appendToQuestionStatement(current, line) {
  const addition = normalizeLooseText(line);
  if (!addition) return;
  current.enunciado = current.enunciado
    ? `${current.enunciado} ${addition}`.trim()
    : addition;
}

function appendToAlternative(current, line) {
  if (!current.alternativasRaw.length) return;
  const addition = normalizeLooseText(line);
  if (!addition) return;

  const lastIndex = current.alternativasRaw.length - 1;
  current.alternativasRaw[lastIndex] = `${current.alternativasRaw[lastIndex]} ${addition}`.trim();
}

function stripQuestionPrefix(line) {
  return normalizeLooseText(line)
    .replace(/^\s*quest[aÃ£]o\s*\d{1,3}\s*(?:[)\.:\-ÂºÂ°o]*\s*)?/i, "")
    .replace(/^\s*\d{1,3}\s*(?:[)\.:\-ÂºÂ°o]*\s*)/, "")
    .trim();
}

function shouldTreatAsStandaloneQuestionNumber(line, normalizedMatchLine, current) {
  const markerMatch = normalizeLooseText(line).match(NUMBER_MARKER_ONLY_REGEX);
  if (markerMatch) {
    return markerMatch;
  }

  const numberOnlyMatch = normalizedMatchLine.match(NUMBER_ONLY_QUESTION_REGEX);
  if (!numberOnlyMatch) return null;
  if (current && current.alternativasRaw.length > 0) return null;
  return numberOnlyMatch;
}

function resolveQuestionContext(baseContext, activeSupportText) {
  return {
    ...baseContext,
    textoBase: sanitize(activeSupportText) || baseContext.textoBase || ""
  };
}

function buildSupportText(lines = []) {
  return lines
    .map(line => normalizeLooseText(line))
    .filter(Boolean)
    .join("\n");
}

function normalizeConfidenceLabel(score) {
  if (score >= 3.4) return "alta";
  if (score >= 1.8) return "media";
  return "baixa";
}

function getRuleDescriptorInfo(disciplina, anoEscolar, codigo) {
  if (!codigo) return null;
  return getDescritores(disciplina, anoEscolar).find(item => item.codigo === codigo) || null;
}

function countRuleHits(textoNormalizado, regra) {
  const hits = (regra.palavrasChave || []).filter(keyword => {
    const keywordNormalizado = normalizeKeywordText(keyword);
    return keywordNormalizado && textoNormalizado.includes(keywordNormalizado);
  });

  return {
    hits,
    score: hits.reduce((total, keyword) => total + (keyword.includes(" ") ? 1.25 : 1), 0)
  };
}

export function preClassificarQuestao(questao) {
  const textoAnalise = normalizeKeywordText([
    questao?.textoApoio,
    questao?.enunciado,
    ...(questao?.alternativas || []).map(item => typeof item === "string" ? item : item?.texto || "")
  ].filter(Boolean).join(" "));

  if (!textoAnalise) {
    return {
      descritorSugerido: "",
      bnccSugerida: "",
      conteudoSugerido: "",
      categoriaSugerida: "",
      confianca: "baixa",
      justificativa: "Nao houve texto suficiente para sugerir uma classificacao.",
      hits: []
    };
  }

  const ranking = PRE_CLASSIFICATION_RULES
    .map(regra => {
      const { hits, score } = countRuleHits(textoAnalise, regra);
      return { regra, hits, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranking.length) {
    return {
      descritorSugerido: "",
      bnccSugerida: "",
      conteudoSugerido: "",
      categoriaSugerida: "",
      confianca: "baixa",
      justificativa: "Nenhuma regra local encontrou palavras-chave suficientes para sugerir a classificacao.",
      hits: []
    };
  }

  const melhor = ranking[0];
  const descritorCandidate = melhor.regra.descritorPorDisciplina?.[questao?.disciplina] || "";
  const descritorInfo = getRuleDescriptorInfo(questao?.disciplina, questao?.anoEscolar, descritorCandidate);
  const descritorSugerido = descritorInfo?.codigo || "";
  const bnccSugerida = descritorInfo?.bncc?.codigoHabilidade || melhor.regra.bnccPorDisciplina?.[questao?.disciplina] || "";
  const habilidadeBncc = descritorInfo?.bncc?.habilidade || "";
  const confianca = normalizeConfidenceLabel(melhor.score);
  const justificativa = `Sugestao local por regras: ${melhor.hits.join(", ")}. Categoria inferida: ${melhor.regra.categoria}.`;

  return {
    descritorSugerido,
    bnccSugerida,
    conteudoSugerido: melhor.regra.conteudo,
    categoriaSugerida: melhor.regra.categoria,
    confianca,
    justificativa,
    hits: melhor.hits,
    habilidadeBncc,
    descritorDescricao: descritorInfo?.nome || "",
    saebEquivalente: descritorSugerido,
    paranaEquivalente: descritorSugerido
  };
}

function applyPreClassification(question) {
  const suggestion = preClassificarQuestao(question);

  return {
    ...question,
    descritor: question.descritor || suggestion.descritorSugerido || "",
    descritorDescricao: question.descritorDescricao || suggestion.descritorDescricao || "",
    descritorSugerido: suggestion.descritorSugerido || "",
    descritorSugestaoIA: {
      descritor: suggestion.descritorSugerido || "",
      descricao: suggestion.descritorDescricao || "",
      codigo_bncc: suggestion.bnccSugerida || "",
      habilidade: suggestion.habilidadeBncc || "",
      habilidade_bncc: suggestion.habilidadeBncc || "",
      conteudo: suggestion.conteudoSugerido || "",
      categoria: suggestion.categoriaSugerida || "",
      saeb: suggestion.saebEquivalente || "",
      parana: suggestion.paranaEquivalente || "",
      confianca: suggestion.confianca,
      justificativa: suggestion.justificativa
    },
    classificacaoSugestao: suggestion,
    bncc_sugerido: question.bncc_sugerido || suggestion.bnccSugerida || "",
    habilidade_bncc: question.habilidade_bncc || suggestion.habilidadeBncc || "",
    conteudo: question.conteudo || suggestion.conteudoSugerido || "",
    categoria_bncc: question.categoria_bncc || suggestion.categoriaSugerida || "",
    saeb_equivalente: question.saeb_equivalente || suggestion.saebEquivalente || suggestion.descritorSugerido || "",
    parana_equivalente: question.parana_equivalente || suggestion.paranaEquivalente || suggestion.descritorSugerido || "",
    confianca_classificacao: question.confianca_classificacao || suggestion.confianca,
    justificativa_classificacao: question.justificativa_classificacao || suggestion.justificativa
  };
}

export function parseQuestoesImportadas(rawText, context) {
  const { mainLines, answerMap } = splitSections(rawText);
  const workingLines = mainLines;
  const textoBase = guessTextoBase(workingLines);
  const titulo = guessQuestionTitle(workingLines, context.titulo);
  const baseContext = {
    ...context,
    titulo,
    textoBase
  };

  const results = [];
  let current = null;
  let pendingAlternativeLabel = "";
  let activeSupportText = textoBase;
  let pendingSupportLines = [];

  for (const rawLine of workingLines) {
    const line = rawLine.trim();
    if (isIgnorableLine(line)) continue;
    if (PAGE_NUMBER_ONLY_REGEX.test(line)) continue;

    const normalizedLine = normalizeLooseText(line);
    const normalizedMatchLine = normalizeQuestionHint(normalizedLine);
    const questionOnlyMatch = normalizedMatchLine.match(QUESTION_ONLY_LABEL_REGEX);

    if (isSupportBlockStart(normalizedLine) && current && (current.alternativasRaw.length > 0 || current.enunciado)) {
      const finalizedCurrent = finalizeDraft(current, answerMap);
      if (finalizedCurrent) results.push(finalizedCurrent);
      current = null;
      pendingAlternativeLabel = "";
      pendingSupportLines = [normalizedLine];
      continue;
    }

    if (questionOnlyMatch) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      if (pendingSupportLines.length) {
        activeSupportText = buildSupportText(pendingSupportLines);
        pendingSupportLines = [];
      }
      current = startQuestionDraft(resolveQuestionContext(baseContext, activeSupportText), questionOnlyMatch[1], "");
      pendingAlternativeLabel = "";
      continue;
    }

    const standaloneNumberMatch = shouldTreatAsStandaloneQuestionNumber(normalizedLine, normalizedMatchLine, current);
    if (standaloneNumberMatch) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      if (pendingSupportLines.length) {
        activeSupportText = buildSupportText(pendingSupportLines);
        pendingSupportLines = [];
      }
      current = startQuestionDraft(resolveQuestionContext(baseContext, activeSupportText), standaloneNumberMatch[1], "");
      pendingAlternativeLabel = "";
      continue;
    }

    const questionMatch = normalizedMatchLine.match(QUESTION_LINE_REGEX);
    if (questionMatch && sanitize(questionMatch[2] || "")) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      if (pendingSupportLines.length) {
        activeSupportText = buildSupportText(pendingSupportLines);
        pendingSupportLines = [];
      }
      current = startQuestionDraft(resolveQuestionContext(baseContext, activeSupportText), questionMatch[1], stripQuestionPrefix(normalizedLine));
      pendingAlternativeLabel = "";
      continue;
    }

    if (!current) {
      if (pendingSupportLines.length || isSupportBlockStart(normalizedLine)) {
        pendingSupportLines.push(normalizedLine);
      }
      continue;
    }

    if (pendingAlternativeLabel) {
      current.alternativasRaw.push(normalizedLine);
      pendingAlternativeLabel = "";
      continue;
    }

    const altMatch = normalizedLine.match(ALT_LINE_REGEX);
    if (altMatch) {
      const alternativaTexto = normalizeLooseText(altMatch[3] || "");
      if (alternativaTexto) {
        current.alternativasRaw.push(alternativaTexto);
      } else {
        pendingAlternativeLabel = altMatch[1] || altMatch[2] || "";
      }
      continue;
    }

    const altOnlyMatch = normalizedLine.match(ALT_ONLY_LABEL_REGEX);
    if (altOnlyMatch) {
      pendingAlternativeLabel = altOnlyMatch[1] || "";
      continue;
    }

    if (current.alternativasRaw.length > 0) {
      appendToAlternative(current, normalizedLine);
    } else {
      appendToQuestionStatement(current, normalizedLine);
    }
  }

  const finalized = finalizeDraft(current, answerMap);
  if (finalized) results.push(finalized);

  const normalizedQuestions = applySharedBlockMetadata(results, baseContext)
    .map(question => applyPreClassification(question));

  return {
    tituloDetectado: titulo,
    textoBaseDetectado: textoBase,
    possuiBlocoCompartilhado: shouldCreateSharedBlock(results, baseContext),
    questions: normalizedQuestions
  };
}

export function organizarQuestoesParaRevisao(rawText, context) {
  return parseQuestoesImportadas(rawText, context);
}

export async function salvarImportacaoRevisada(importacao, questions, usuario) {
  const batch = db.batch();
  const importacaoRef = db.collection("importacoesQuestoes").doc();
  const validQuestions = questions.filter(item => sanitize(item.enunciado) && (Object.prototype.hasOwnProperty.call(item, "confirmadoParaSalvar") ? item.confirmadoParaSalvar : true));

  batch.set(importacaoRef, {
    titulo: sanitize(importacao.titulo),
    autorId: usuario.uid,
    autorNome: usuario.nome || "",
    anoEscolar: sanitize(importacao.anoEscolar),
    disciplina: sanitize(importacao.disciplina),
    fonte: importacao.fonte || { nome: "", url: "", observacao: "", licenca: "" },
    textoOriginal: sanitize(importacao.textoOriginal),
    totalDetectadas: validQuestions.length,
    totalSalvas: validQuestions.length,
    status: "revisada_professor",
    criadoEm: new Date(),
    atualizadoEm: new Date()
  });

  validQuestions.forEach((question, index) => {
    const docRef = db.collection("questoes").doc();
    const record = buildQuestionRecord({
      ...question,
      importacaoId: importacaoRef.id,
      origemCriacao: question.blocoId ? "importacao_bloco" : "importacao_professor",
      visibilidade: "privada",
      statusRevisao: "revisada_professor",
      ordemBloco: Number(question.ordemBloco ?? index)
    }, usuario);

    batch.set(docRef, record);
  });

  await batch.commit();

  return {
    importacaoId: importacaoRef.id,
    totalSalvas: validQuestions.length
  };
}

