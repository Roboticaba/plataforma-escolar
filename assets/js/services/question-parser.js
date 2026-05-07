const QUESTION_START_REGEX = /^\s*(?:quest(?:ao|ão)\s*)?(\d{1,3})\s*[\.)]?\s*(?:\(([^)]+)\))?\s*(.*)$/i;
const ALTERNATIVE_REGEX = /^\s*(?:\(\s*([A-Da-d])\s*\)|([A-Da-d])[\.)]?)\s*(.+)?$/;
const SUPPORT_INTRO_REGEX = /^(leia\s+(?:o|a|os|as)?\s*(?:texto|tirinha|poema|cartaz|anuncio|anúncio|imagem|grafico|gráfico|tabela)|observe\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela)|analise\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela)|considere\s+(?:o|a)\s+(?:texto|imagem)|texto\s+para\s+as\s+quest(?:oes|ões)|texto\s*\d+)$/i;
const INDIVIDUAL_SUPPORT_MARKER_REGEX = /^(?:leia\s+o\s+texto\s+abaixo\.?|leia\s+o\s+texto\s+a\s+seguir\.?|leia\s+o\s+poema\.?|leia\s+a\s+tirinha\.?|observe\s+a\s+imagem\.?|observe\s+a\s+figura\.?|leia\s+os\s+fragmentos\.?|texto\s*\d+)$/i;
const INSTRUCTION_REGEX = /^(leia|observe|analise|responda|assinale|marque|considere)\b/i;
const KNOWN_BANKS = ["SAEPI", "IDEPB", "SAEB", "SAEPE", "SPAECE", "PROVA BRASIL", "SIMAVE"];

export function createEmptyQuestionParseResult() {
  return {
    cabecalho: "",
    instrucoes: [],
    blocos: [],
    questoesIndividuais: [],
    alertasGerais: [],
    cardsRevisao: []
  };
}

function splitLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function isQuestionStart(line) {
  const match = String(line || "").match(QUESTION_START_REGEX);
  if (!match) return false;
  return Boolean(match[3] || match[2] || /^quest/i.test(line) || /[\.)]/.test(line));
}

function isSupportIntro(line) {
  const normalized = String(line || "").trim();
  return SUPPORT_INTRO_REGEX.test(normalized) || isIndividualSupportMarker(normalized);
}

export function isTextoApoioValido(texto, questoesRelacionadas = []) {
  const textoNormalizado = String(texto || "").trim();
  if (!textoNormalizado) return false;

  const totalQuestoesRelacionadas = Array.isArray(questoesRelacionadas)
    ? questoesRelacionadas.length
    : Number(questoesRelacionadas || 0);

  return totalQuestoesRelacionadas > 1 || isSupportIntro(textoNormalizado.split("\n")[0] || textoNormalizado);
}

function isIndividualSupportMarker(line) {
  return INDIVIDUAL_SUPPORT_MARKER_REGEX.test(String(line || "").trim());
}

function extractBank(rawBank = "", fallbackText = "") {
  const candidates = [rawBank, fallbackText]
    .filter(Boolean)
    .flatMap(value => String(value).match(/\(([^)]+)\)/g) || [value]);

  for (const candidate of candidates) {
    const clean = String(candidate).replace(/[()]/g, "").trim().toUpperCase();
    if (KNOWN_BANKS.includes(clean)) {
      return clean;
    }
  }

  const upperFallback = String(fallbackText || "").toUpperCase();
  return KNOWN_BANKS.find(bank => upperFallback.includes(bank)) || "";
}

function createQuestionDraft(number, supportText = "") {
  return {
    numeroOriginal: Number(number) || null,
    banca: "",
    enunciado: "",
    alternativas: [],
    textoApoio: supportText,
    tipo: "multipla_texto",
    precisaRevisao: false,
    alertas: []
  };
}

function createPendingSupport(lines = [], options = {}) {
  return {
    lines: [...lines],
    markerLine: options.markerLine || "",
    precisaRevisao: Boolean(options.precisaRevisao),
    motivo: options.motivo || ""
  };
}

function materializePendingSupport(pendingSupport) {
  if (!pendingSupport || !pendingSupport.lines?.length) {
    return { textoApoio: "", precisaRevisao: false, motivo: "" };
  }

  const textoApoio = pendingSupport.lines.join("\n").trim();
  const onlyMarker = pendingSupport.lines.length === 1 && isIndividualSupportMarker(pendingSupport.lines[0]);
  const tooShort = textoApoio.length < 20;

  return {
    textoApoio,
    precisaRevisao: pendingSupport.precisaRevisao || onlyMarker || tooShort,
    motivo: pendingSupport.motivo || (onlyMarker ? "Texto de apoio marcado sem conteudo suficiente." : tooShort ? "Texto de apoio curto; revise a associacao." : "")
  };
}

function finalizeQuestion(question) {
  if (!question) return null;

  question.enunciado = question.enunciado.trim();
  question.alternativas = question.alternativas
    .map(item => ({
      letra: String(item.letra || "").toUpperCase(),
      texto: String(item.texto || "").trim()
    }))
    .filter(item => item.letra && item.texto);

  if (!question.enunciado) {
    question.alertas.push("Enunciado nao identificado com clareza.");
    question.precisaRevisao = true;
  }

  if (question.alternativas.length && question.alternativas.length < 4) {
    question.alertas.push("Menos de 4 alternativas identificadas.");
    question.precisaRevisao = true;
  }

  if (!question.alternativas.length) {
    question.tipo = "resposta_escrita";
  }

  return question;
}

function buildReviewCards(result) {
  const blockCards = result.blocos.flatMap(bloco => (bloco.questoes || []).map((questao, index) => ({
    tipoCard: "bloco",
    blocoIndex: bloco.ordem ?? 0,
    questaoIndex: index,
    textoApoio: bloco.textoApoio || "",
    ...questao
  })));

  const singleCards = result.questoesIndividuais.map((questao, index) => ({
    tipoCard: "individual",
    questaoIndex: index,
    ...questao
  }));

  return [...blockCards, ...singleCards];
}

function normalizeSupportBlocks(result) {
  const validBlocks = [];
  const individualFromBlocks = [];

  result.blocos.forEach(bloco => {
    const questoes = bloco.questoes || [];
    if (questoes.length > 1 && isTextoApoioValido(bloco.textoApoio, questoes)) {
      validBlocks.push({
        ...bloco,
        ordem: validBlocks.length
      });
      return;
    }

    questoes.forEach(questao => {
      individualFromBlocks.push({
        ...questao,
        textoApoio: isTextoApoioValido(questao.textoApoio, [questao]) ? questao.textoApoio : ""
      });
    });
  });

  result.blocos = validBlocks;
  result.questoesIndividuais = [
    ...result.questoesIndividuais,
    ...individualFromBlocks
  ];
}

export function parseTextAssessment(text = "") {
  const result = createEmptyQuestionParseResult();
  const lines = splitLines(text);

  if (!lines.length) {
    result.alertasGerais.push("Nenhum texto foi informado para o parser.");
    return result;
  }

  const firstBreakIndex = lines.findIndex(line => isQuestionStart(line) || isSupportIntro(line));
  const headerLines = firstBreakIndex === -1 ? lines : lines.slice(0, firstBreakIndex);
  result.cabecalho = headerLines.join("\n").trim();
  result.instrucoes = headerLines.filter(line => INSTRUCTION_REGEX.test(line));

  let currentQuestion = null;
  let currentSupportLines = [];
  let pendingSupport = null;
  let currentBlock = null;
  let supportMode = false;
  let activeSupportText = "";

  const commitCurrentQuestion = () => {
    const finalized = finalizeQuestion(currentQuestion);
    if (!finalized) return;

    if (finalized.textoApoio) {
      if (!currentBlock || currentBlock.textoApoio !== finalized.textoApoio) {
        currentBlock = {
          ordem: result.blocos.length,
          textoApoio: finalized.textoApoio,
          questoes: []
        };
        result.blocos.push(currentBlock);
      }
      currentBlock.questoes.push(finalized);
    } else {
      result.questoesIndividuais.push(finalized);
    }

    currentQuestion = null;
  };

  for (let index = firstBreakIndex === -1 ? lines.length : firstBreakIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (isSupportIntro(line)) {
      commitCurrentQuestion();
      if (pendingSupport?.lines?.length) {
        result.alertasGerais.push("Novo texto de apoio encontrado antes de vincular o anterior. Revise a associacao.");
      }
      currentSupportLines = [line];
      currentBlock = null;
      supportMode = true;
      continue;
    }

    if (supportMode && !isQuestionStart(line)) {
      currentSupportLines.push(line);
      continue;
    }

    if (supportMode && isQuestionStart(line)) {
      pendingSupport = createPendingSupport(currentSupportLines, {
        markerLine: currentSupportLines[0] || "",
        precisaRevisao: currentSupportLines.length === 1,
        motivo: currentSupportLines.length === 1 ? "Texto de apoio identificado apenas pelo marcador." : ""
      });
      supportMode = false;
      currentSupportLines = [];
    }

    const questionMatch = line.match(QUESTION_START_REGEX);
    if (questionMatch && isQuestionStart(line)) {
      commitCurrentQuestion();
      const supportData = materializePendingSupport(pendingSupport);
      if (supportData.textoApoio) {
        activeSupportText = supportData.textoApoio;
      }
      currentQuestion = createQuestionDraft(questionMatch[1], supportData.textoApoio || activeSupportText);
      currentQuestion.precisaRevisao = supportData.precisaRevisao;
      if (supportData.motivo) {
        currentQuestion.alertas.push(supportData.motivo);
      }
      pendingSupport = null;
      currentQuestion.banca = extractBank(questionMatch[2], questionMatch[3]);
      const remainder = String(questionMatch[3] || "").trim();
      const withoutBank = remainder.replace(/^\(([^)]+)\)\s*/, "").trim();
      if (withoutBank) {
        currentQuestion.enunciado = withoutBank;
      }
      continue;
    }

    if (!currentQuestion) {
      result.alertasGerais.push(`Trecho fora de questao ignorado: ${line}`);
      continue;
    }

    const alternativeMatch = line.match(ALTERNATIVE_REGEX);
    if (alternativeMatch) {
      currentQuestion.alternativas.push({
        letra: alternativeMatch[1] || alternativeMatch[2] || "",
        texto: alternativeMatch[3] || ""
      });
      continue;
    }

    if (currentQuestion.alternativas.length) {
      const lastAlternative = currentQuestion.alternativas[currentQuestion.alternativas.length - 1];
      lastAlternative.texto = `${lastAlternative.texto} ${line}`.trim();
      continue;
    }

    currentQuestion.enunciado = `${currentQuestion.enunciado} ${line}`.trim();
  }

  commitCurrentQuestion();

  if (supportMode && currentSupportLines.length) {
    result.alertasGerais.push("Texto de apoio encontrado sem questao associada. Revise o trecho final.");
  }

  if (pendingSupport?.lines?.length) {
    result.alertasGerais.push("Texto de apoio identificado, mas sem questao seguinte confirmada.");
  }

  if (!result.blocos.length && !result.questoesIndividuais.length) {
    result.alertasGerais.push("Nenhuma questao foi identificada no texto.");
  }

  normalizeSupportBlocks(result);
  result.cardsRevisao = buildReviewCards(result);
  return result;
}

export function parseQuestionDocumentText(rawText = "", options = {}) {
  const text = String(rawText || "").trim();
  if (!text) {
    const empty = createEmptyQuestionParseResult();
    empty.alertasGerais.push("Nenhum texto foi informado para o parser.");
    return empty;
  }

  const result = parseTextAssessment(text);
  if (!result.cabecalho && options.cabecalho) {
    result.cabecalho = String(options.cabecalho).trim();
  }
  if (!result.cabecalho && options.titulo) {
    result.cabecalho = String(options.titulo).trim();
  }
  if (!result.alertasGerais.includes("Base do novo parser ativa. A extracao real de PDF/DOCX ainda nao foi implementada.")) {
    result.alertasGerais.push("Base do novo parser ativa. A extracao real de PDF/DOCX ainda nao foi implementada.");
  }
  return result;
}

