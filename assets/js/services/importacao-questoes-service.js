import { db } from "../core/firebase-app.js";
import { buildQuestionRecord, limparAlternativas } from "./questions-service.js";
import { analisarDescritorLocal } from "./descritor-ai-service.js";

const QUESTION_LINE_REGEX = /^\s*(?:questao\s*)?(\d{1,3})\s*(?:[)\.:\-ÂºÂ°o]*\s*)?(.+)?$/i;
const QUESTION_ONLY_LABEL_REGEX = /^\s*questao\s*(\d{1,3})\s*$/i;
const NUMBER_ONLY_QUESTION_REGEX = /^\s*(\d{1,3})\s*$/;
const PAGE_NUMBER_ONLY_REGEX = /^\s*\d{1,2}\s*$/;
const ALT_LINE_REGEX = /^\s*(?:\(?\s*([A-Ea-e])\s*\)?|(\d{1,2}))\s*[)\.:\-]\s*(.+)?$/;
const ALT_ONLY_LABEL_REGEX = /^\s*\(?\s*([A-Ea-e])\s*\)?\s*$/;
const GABARITO_HEADER_REGEX = /^\s*gabarito\b/i;
const RESPOSTA_HEADER_REGEX = /^\s*respostas?\s*(?:[:\-])?\s*$/i;
const PAGE_NOISE_REGEX = /^\s*(saeb|prova brasil|pagina\s+\d+|p[aÃ¡]gina\s+\d+|inep|ministerio da educacao|mec)\b/i;
const REFERENCE_NOISE_REGEX = /(disponivel em:|https?:\/\/|www\.|\.com\b|\.htm\b|fromview=|uuid=|query=|position=)/i;

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
    respostaEsperada: data.respostaEsperada || "",
    alternativasRaw: Array.isArray(data.alternativasRaw) ? [...data.alternativasRaw] : [],
    descritor: "",
    descritorDescricao: "",
    descritorConfirmadoPeloProfessor: false,
    descritorSugestaoIA: null,
    formatoAlternativas: "(A)",
    nivelDificuldade: "",
    blocoTitulo: context.titulo || "",
    blocoId: "",
    ordemBloco: order - 1,
    origemCriacao: "importacao_professor",
    importacaoId: "",
    visibilidade: "privada",
    statusRevisao: "rascunho_importado",
    fonte: { ...context.fonte }
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

  if (alternativasTexto.length >= 2) {
    tipo = "multipla_texto";
    alternativas = alternativasTexto.map((texto, index) => ({
      texto,
      imagemUrl: "",
      correta: false,
      ordem: index
    }));

    const answerToken = answerMap.get(current.numeroOriginal);
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

function shouldTreatAsStandaloneQuestionNumber(normalizedMatchLine, current) {
  const match = normalizedMatchLine.match(NUMBER_ONLY_QUESTION_REGEX);
  if (!match) return null;
  if (current && current.alternativasRaw.length > 0) return null;
  return match;
}

export function parseQuestoesImportadas(rawText, context) {
  const { mainLines, answerMap } = splitSections(rawText);
  const workingLines = trimToFirstExplicitQuestion(mainLines);
  const textoBase = guessTextoBase(workingLines);
  const titulo = guessQuestionTitle(workingLines, context.titulo);
  const effectiveContext = {
    ...context,
    titulo,
    textoBase
  };

  const results = [];
  let current = null;
  let pendingAlternativeLabel = "";

  for (const rawLine of workingLines) {
    const line = rawLine.trim();
    if (isIgnorableLine(line)) continue;
    if (PAGE_NUMBER_ONLY_REGEX.test(line)) continue;

    const normalizedLine = normalizeLooseText(line);
    const normalizedMatchLine = normalizeQuestionHint(normalizedLine);
    const questionOnlyMatch = normalizedMatchLine.match(QUESTION_ONLY_LABEL_REGEX);

    if (questionOnlyMatch) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      current = startQuestionDraft(effectiveContext, questionOnlyMatch[1], "");
      pendingAlternativeLabel = "";
      continue;
    }

    const standaloneNumberMatch = shouldTreatAsStandaloneQuestionNumber(normalizedMatchLine, current);
    if (standaloneNumberMatch) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      current = startQuestionDraft(effectiveContext, standaloneNumberMatch[1], "");
      pendingAlternativeLabel = "";
      continue;
    }

    const questionMatch = normalizedMatchLine.match(QUESTION_LINE_REGEX);
    if (questionMatch && sanitize(questionMatch[2] || "")) {
      const finalized = finalizeDraft(current, answerMap);
      if (finalized) results.push(finalized);
      current = startQuestionDraft(effectiveContext, questionMatch[1], stripQuestionPrefix(normalizedLine));
      pendingAlternativeLabel = "";
      continue;
    }

    if (!current) continue;

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

  const normalizedQuestions = applySharedBlockMetadata(results, effectiveContext);

  return {
    tituloDetectado: titulo,
    textoBaseDetectado: textoBase,
    possuiBlocoCompartilhado: shouldCreateSharedBlock(results, effectiveContext),
    questions: normalizedQuestions
  };
}

export async function enrichImportedQuestionsWithLocalDescriptors(questions) {
  const enriched = [];

  for (const question of questions) {
    const suggestion = await analisarDescritorLocal({
      tituloTextoApoio: question.tituloTextoApoio,
      textoApoio: question.textoApoio,
      enunciado: question.enunciado,
      alternativas: question.alternativas,
      respostaCorreta: question.respostaCorreta,
      respostaEsperada: question.respostaEsperada,
      tipo: question.tipo,
      disciplina: question.disciplina,
      anoEscolar: question.anoEscolar
    });

    enriched.push({
      ...question,
      descritor: suggestion?.descritor || "",
      descritorDescricao: suggestion?.descricao || "",
      descritorSugestaoIA: suggestion || null,
      descritorSugerido: suggestion?.descritor || "",
      confiancaDescritor: Number(suggestion?.confianca || 0),
      descritorConfirmadoPeloProfessor: false
    });
  }

  return enriched;
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

