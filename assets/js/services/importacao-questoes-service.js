import { db } from "../core/firebase-app.js";
import { buildQuestionRecord, limparAlternativas } from "./questions-service.js";
import { getDescritores } from "../core/constants.js";

const QUESTION_LINE_REGEX = /^\s*(?:questao\s*)?(\d{1,3})\s*(?:[)\.:\-ÂºÂ°o]*\s*)?(.+)?$/i;
const QUESTION_ONLY_LABEL_REGEX = /^\s*questao\s*(\d{1,3})\s*$/i;
const NUMBER_ONLY_QUESTION_REGEX = /^\s*(\d{1,3})\s*$/;
const NUMBER_MARKER_ONLY_REGEX = /^\s*(\d{1,3})\s*[)\.:\-]+\s*$/;
const PAGE_NUMBER_ONLY_REGEX = /^\s*\d{1,2}\s*$/;
const ALT_LINE_REGEX = /^\s*(?:(?:\(\s*([A-Ea-e])\s*\))|(?:([A-Ea-e])\s*[)\.:\-])|(?:(\d{1,2})\s*[)\.:\-])|([*-]))\s*(.+)?$/;
const ALT_ONLY_LABEL_REGEX = /^\s*(?:(?:\(\s*([A-Ea-e])\s*\))|(?:([A-Ea-e])\s*[)\.:\-])|[*-])\s*$/;
const GABARITO_HEADER_REGEX = /^\s*gabarito\b/i;
const GABARITO_SECTION_HEADER_REGEX = /^\s*gabarito\s*(?:[:\-])?\s*$/i;
const INLINE_GABARITO_REGEX = /^\s*gabarito\s*[:\-]\s*([A-Ea-e]|\d{1,2})\s*$/i;
const RESPOSTA_HEADER_REGEX = /^\s*respostas?\s*(?:[:\-])?\s*$/i;
const PAGE_NOISE_REGEX = /^\s*(?:saeb|prova brasil|(?:\d+[ºo]?\s*)?ano\s*(?:-| )\s*l[ií]ngua portuguesa e matem[aá]tica(?:\s*(?:\|| )\s*p[aá]gina\s+\d+)?|(?:\d+[ºo]?\s*)?ano\s+lingua portuguesa e matematica\s+pagina\s+\d+|p[aÃ¡]gina\s+\d+|pagina\s+\d+|.*\|\s*p[aá]gina\s+\d+|inep|ministerio da educacao|mec)\b/i;
const REFERENCE_NOISE_REGEX = /(disponivel em:|https?:\/\/|www\.|\.com\b|\.htm\b|fromview=|uuid=|query=|position=)/i;
const SUPPORT_BLOCK_START_REGEX = /^(leia\s+(?:o|a|os|as)?\s*(?:texto|tirinha|poema|quadrinho|cartaz|anuncio|anúncio|grafico|gráfico|imagem|tabela)|considere\s+(?:o|a)\s+(?:texto|imagem|tirinha|poema)|observe\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela|grafico|gráfico)|analise\s+(?:o|a)\s+(?:texto|imagem|figura|tirinha|tabela|grafico|gráfico)|texto\s+para\s+as\s+questoes|texto\s+para\s+as\s+questões)/i;
const ADMIN_HEADER_REGEX = /^(?:escola|col[eé]gio|instituto|centro educacional|unidade escolar|prefeitura|secretaria|diretoria|coordena[cç][aã]o|supervis[aã]o|educa[cç][aã]o|e desenvolvimento profissional)\b/i;
const ADMIN_FIELD_REGEX = /^(?:professor(?:a)?|aluno(?:a)?|estudante|turma|turno|s[eé]rie|ano|data|nota|valor|avalia[cç][aã]o|atividade|simulado|prova)\b/i;
const ADDRESS_REGEX = /^(?:endere[cç]o|rua|avenida|av\.|travessa|bairro|cidade|cep)\b/i;
const CNPJ_REGEX = /\b(?:cnpj\s*:?\s*)?\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/i;
const PHONE_REGEX = /\b(?:tel(?:efone)?|fone|whats(?:app)?)?\s*:?\s*(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}\b/i;
const ADMIN_SYMBOL_LINE_REGEX = /^[^A-Za-zÀ-ÿ]{6,}$/;
const RESPONSE_CARD_HEADER_REGEX = /^\s*(?:cart[aã]o\s*(?:de\s*)?resposta|gabarito\s*visual)\b/i;
const SOURCE_MARKER_REGEX = /\b(?:dispon[ií]vel em:|fonte:|adaptado de:)\s*/i;
const SOURCE_REFERENCE_REGEX = /\b(?:revista\s+[\wÀ-ÿ][^.]{2,}\.\s*(?:ano\s*\d+|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\d{4}|p\.\s*\d+)|folha\s+de\s+s\.?\s*paulo\b|o globo\.?|o menino maluquinho|agosto\s+de\s+\d{4}|rocha,\s*ruth\b|bandeira,\s*manuel\b|alexandre beck\b|beck,\s*alexandre\b|in:|s[aã]o paulo:)(?=\b|\s|$)/i;
const AUTHOR_COMMA_REFERENCE_REGEX = /\b(?:ROCHA,\s*Ruth|BANDEIRA,\s*Manuel|BECK,\s*Alexandre)\b\.?/i;
const SOURCE_URL_FRAGMENT_REGEX = /\b(?:https?:\/\/|www\.|utm_|query=|position=|uuid=|fromview=|fromView=|#fromview|#fromView|\.com\b|\.htm\b|\.html\b)/i;
const BIBLIOGRAPHIC_DATE_REGEX = /\b(?:in:|acesso em|consultado em|publicado em|edi[cç][aã]o|ano\s+\d{4}|s[aã]o paulo:|p\.\s*\d+|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*(?:de\s*)?\d{4}|\d{1,2}\s*(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;
const PROMPT_START_REGEX = /\b(?:considerando\b|depois da resposta\b|a partir\b|ao comparar\b|o uso\b|antes de terminar a leitura do texto\b|a frase\b|na frase\b|a palavra(?: grifada)?\b|a express[aã]o\b|as palavras destacadas\b|no trecho(?: acima)?|de acordo com\b|com base no|qual\s+(?:o\s+sentido|é|e\b|das|seria|alternativa|das alternativas|das seguintes)?|durante a leitura|ap[oó]s concluir|segundo o texto,|no texto,)/i;
const SOURCE_FORBIDDEN_IN_CONTENT_REGEX = /\b(?:dispon[ií]vel em:|revista\s+[\wÀ-ÿ][^.]{2,}\.\s*(?:ano\s*\d+|\d{4}|p\.\s*\d+)|rocha,\s*ruth|bandeira,\s*manuel|o globo\.?|alexandre beck|folha\s+de\s+s\.?\s*paulo|https?:\/\/|www\.)/i;
const ISOLATED_ADMIN_LINE_REGEX = /^(?:educa[cç][aã]o|secretaria|avalia[cç][aã]o|simulado|e desenvolvimento profissional)$/i;
const PDF_IMAGE_DECODE_ERROR_REGEX = /\b(?:unable to decode image|jpxerror)\b/i;

function findPromptStart(text = "") {
  const clean = String(text || "");
  const matches = clean.matchAll(new RegExp(PROMPT_START_REGEX.source, "gi"));

  for (const match of matches) {
    const index = Number(match.index || 0);
    const before = clean.slice(0, index);
    if (!before.trim() || /(?:[.!?…]\s+|[\r\n]+)$/.test(before)) {
      return match;
    }
  }

  return null;
}

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

function isFonteReferencia(line) {
  const clean = sanitize(line);
  if (!clean) return false;
  return SOURCE_MARKER_REGEX.test(clean) ||
    SOURCE_URL_FRAGMENT_REGEX.test(clean) ||
    isStrongSourceText(clean) ||
    isStrongSourceStart(clean);
}

function isStrongSourceStart(text = "") {
  const clean = sanitize(text);
  return SOURCE_REFERENCE_REGEX.test(clean) ||
    SOURCE_URL_FRAGMENT_REGEX.test(clean);
}

function isStrongSourceText(text = "") {
  const clean = sanitize(text);
  if (!clean) return false;
  if (SOURCE_MARKER_REGEX.test(clean) || SOURCE_URL_FRAGMENT_REGEX.test(clean)) return true;
  if (/revista\s+[\wÀ-ÿ][^.]{2,}\.\s*(?:ano\s*\d+|(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\d{4}|p\.\s*\d+)/i.test(clean)) return true;
  if (/alexandre beck\.?\s*folha\s+de\s+s\.?\s*paulo/i.test(clean)) return true;
  if (/folha\s+de\s+s\.?\s*paulo\b/i.test(clean) && BIBLIOGRAPHIC_DATE_REGEX.test(clean)) return true;
  if (/\bo globo\.?/i.test(clean) && (BIBLIOGRAPHIC_DATE_REGEX.test(clean) || /\bo menino maluquinho\b/i.test(clean))) return true;
  if (/\bo menino maluquinho\b/i.test(clean) && /agosto\s+de\s+\d{4}/i.test(clean)) return true;
  if (AUTHOR_COMMA_REFERENCE_REGEX.test(clean)) return true;
  if (/\bin:\b/i.test(clean)) return true;
  if (/\bs[aã]o paulo:/i.test(clean) && AUTHOR_COMMA_REFERENCE_REGEX.test(clean)) return true;
  return false;
}

export function isLinhaCartaoResposta(line) {
  const clean = sanitize(line);
  if (!clean || /[?]/.test(clean)) return false;
  const compact = clean.replace(/\(\s*([A-Da-d])\s*\)/g, "$1");

  const tokens = compact.match(/\(?[A-Da-d]\)?(?=\s|$|[).])/g) || [];
  if (tokens.length < 4) return false;

  const withoutOptions = compact
    .replace(/\(?[A-Da-d]\)?(?=\s|$|[).])/g, " ")
    .replace(/\d{1,3}\s*[\).]?/g, " ")
    .replace(/[()\].,:;\-_/|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const usefulLetters = (withoutOptions.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const optionDensity = tokens.length / Math.max(1, compact.split(/\s+/).length);

  return usefulLetters <= 2 && optionDensity >= 0.35;
}

function isProtectedImportLine(line) {
  const clean = sanitize(line);
  if (!clean) return false;

  return isSupportBlockStart(clean) ||
    isQuestionStartLine(clean) ||
    ALT_LINE_REGEX.test(clean) ||
    ALT_ONLY_LABEL_REGEX.test(clean) ||
    INLINE_GABARITO_REGEX.test(clean) ||
    GABARITO_SECTION_HEADER_REGEX.test(clean) ||
    RESPOSTA_HEADER_REGEX.test(clean);
}

function hasAdministrativeSymbolDensity(line) {
  const clean = sanitize(line);
  if (clean.length < 8) return false;

  const letters = (clean.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const numbers = (clean.match(/\d/g) || []).length;
  const symbols = (clean.match(/[^A-Za-zÀ-ÿ0-9\s]/g) || []).length;
  const administrativeChars = numbers + symbols;

  return administrativeChars >= 6 && administrativeChars / clean.length > 0.35 && letters < clean.length * 0.55;
}

function isShortIrrelevantLine(line) {
  const clean = sanitize(line);
  if (!clean) return true;
  if (clean.length > 3) return false;
  return !/[?!.]/.test(clean);
}

function isAdministrativeNoiseLine(line) {
  const clean = sanitize(line);
  if (!clean) return false;
  if (isFonteReferencia(clean)) return false;
  if (isLinhaCartaoResposta(clean)) return true;
  if (ADMIN_SYMBOL_LINE_REGEX.test(clean)) return true;

  const normalized = normalizeKeywordText(clean);
  if (PAGE_NOISE_REGEX.test(normalized)) return true;
  if (isProtectedImportLine(clean)) return false;

  return RESPONSE_CARD_HEADER_REGEX.test(clean) ||
    ISOLATED_ADMIN_LINE_REGEX.test(clean) ||
    ADMIN_HEADER_REGEX.test(clean) ||
    (ADMIN_FIELD_REGEX.test(clean) && (/[:_\-]/.test(clean) || clean.length <= 28)) ||
    (ADDRESS_REGEX.test(clean) && (/\d/.test(clean) || /\b(?:bairro|cidade|cep)\b/i.test(clean))) ||
    CNPJ_REGEX.test(clean) ||
    PHONE_REGEX.test(clean) ||
    REFERENCE_NOISE_REGEX.test(clean) ||
    hasAdministrativeSymbolDensity(clean) ||
    isShortIrrelevantLine(clean);
}

export function cleanTextoImportado(texto) {
  const resultado = String(texto || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter(line => {
      const descartada = isAdministrativeNoiseLine(line);
      return !descartada;
    })
    .join("\n")
    .trim();

  return resultado;
}

export function isTextoApoioValido(texto, questoesRelacionadas = []) {
  const textoNormalizado = sanitize(texto);
  if (!textoNormalizado) return false;

  const totalQuestoesRelacionadas = Array.isArray(questoesRelacionadas)
    ? questoesRelacionadas.length
    : Number(questoesRelacionadas || 0);

  return totalQuestoesRelacionadas > 1 || isSupportBlockStart(textoNormalizado);
}

function isIgnorableLine(line) {
  if (!sanitize(line)) return true;
  if (PAGE_NOISE_REGEX.test(normalizeQuestionHint(line))) return true;
  if (isProtectedImportLine(line) || isFonteReferencia(line)) return false;
  return !sanitize(line) ||
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
    if (GABARITO_SECTION_HEADER_REGEX.test(line) || RESPOSTA_HEADER_REGEX.test(line)) {
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
    generoTextual: "",
    blocoTitulo: context.titulo || "",
    blocoId: "",
    ordemBloco: order - 1,
    origemCriacao: "importacao_professor",
    importacaoId: "",
    visibilidade: "privada",
    statusRevisao: "rascunho_importado",
    enviarParaAcervo: false,
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

  if (!hitQuestion || !buffer.length || !isSupportBlockStart(buffer[0])) {
    return "";
  }

  return buffer.join("\n");
}

function guessQuestionTitle(lines, fallbackTitle) {
  const titleLine = lines.find(line => !isIgnorableLine(line) && !isQuestionStartLine(line));
  return sanitize(fallbackTitle || titleLine || "");
}

function isInstitutionalHeaderText(text = "") {
  const clean = sanitize(text);
  if (!clean) return false;
  const letters = clean.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const isUppercase = letters.length >= 4 && letters === letters.toUpperCase();
  return ISOLATED_ADMIN_LINE_REGEX.test(clean) ||
    ADMIN_HEADER_REGEX.test(clean) ||
    ADMIN_FIELD_REGEX.test(clean) ||
    (isUppercase && /\b(?:educa[cç][aã]o|secretaria|avalia[cç][aã]o|simulado|desenvolvimento profissional)\b/i.test(clean));
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
  const textoBase = sanitize(context.textoBase);
  return Boolean(
    Array.isArray(questions) &&
    questions.length > 1 &&
    isTextoApoioValido(textoBase, questions) &&
    questions.every(question => sanitize(question.textoApoio) === textoBase)
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
  if (!current) return null;

  const alternativasTexto = limparAlternativas((current.alternativasRaw || []).join("\n"));
  if (!sanitize(current.enunciado) && alternativasTexto.length) {
    current.enunciado = inferResidualStatementFromDraft(current);
  }
  if (!sanitize(current.enunciado) && alternativasTexto.length && hasImageEvidence(current)) {
    current.enunciado = "Questao baseada na imagem de apoio.";
  }
  if (!sanitize(current.enunciado)) return null;

  let tipo = "resposta_escrita";
  let alternativas = [];
  let respostaCorreta = "";
  const answerToken = current.gabaritoOriginal || answerMap.get(current.numeroOriginal) || "";

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

function inferResidualStatementFromDraft(current) {
  const clean = normalizeLooseText(current?.enunciado || "");
  if (!clean) return "";
  const parts = splitQuestionParts(clean);
  if (sanitize(parts.enunciado)) return parts.enunciado;

  const sourceData = extractInlineSource(clean);
  if (sanitize(sourceData.after)) {
    const afterParts = splitAfterSourceByPrompt(sourceData.after);
    return afterParts.enunciado || afterParts.supportContinuation || sourceData.after;
  }

  const withoutImage = clean.replace("[imagem aqui]", "").trim();
  const sentences = withoutImage.match(/[^.!?…]+[.!?…]?/g) || [];
  const candidate = sentences
    .map(sentence => sanitize(sentence))
    .filter(sentence => sentence && !isInstitutionalHeaderText(sentence) && !isFonteReferencia(sentence))
    .pop();

  return candidate || "";
}

function hasImageEvidence(question = {}) {
  return sanitize(question.imagemApoio) ||
    sanitize(question.fonteImagemApoio) ||
    Boolean(question.imagemProvavel) ||
    String(question.enunciado || "").includes("[imagem aqui]") ||
    String(question.textoApoio || "").includes("[imagem aqui]") ||
    hasImageCue(question.instrucao || "") ||
    isImageSupportPrompt(question.instrucao || "") ||
    isImageSupportPrompt(question.enunciado || "") ||
    isImageSupportPrompt(question.textoApoio || "") ||
    PDF_IMAGE_DECODE_ERROR_REGEX.test([
      question.enunciado,
      question.textoApoio,
      question.importWarnings?.join(" "),
      question.alertas?.join(" ")
    ].filter(Boolean).join(" "));
}

function shouldPrioritizeImageSource(parts = {}, forceImageSource = false) {
  return Boolean(forceImageSource || hasImageEvidence(parts));
}

function stripQuestionPrefix(line) {
  return normalizeLooseText(line)
    .replace(/^\s*quest\S*o\s*\d{1,3}\s*(?:[)\.:\-ÂºÂ°]+)?\s*/i, "")
    .replace(/^\s*\d{1,3}\s*(?:[)\.:\-ÂºÂ°]+)?\s*/, "")
    .trim();
}

function stripLeadingQuestionMarkerLines(lines = []) {
  if (!Array.isArray(lines) || !lines.length) return [];
  const [firstLine, ...rest] = lines;
  return isQuestionStartLine(firstLine) ? rest : lines;
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

function hasCompleteSentence(text = "") {
  return /[.!?…]$/.test(sanitize(text));
}

function hasImageCue(text = "") {
  return /\b(?:imagem|figura|tirinha|charge|mapa|grafico|gráfico)\b/i.test(sanitize(text));
}

function isImageSupportPrompt(text = "") {
  return /^(?:observe|leia|analise)\s+(?:a|o)?\s*(?:imagem|figura|tirinha|charge|mapa|grafico|gráfico)\b/i.test(sanitize(text));
}

function isTextSupportInstruction(text = "") {
  return /^(?:leia|observe|analise)\b.*\b(?:texto|trecho|frase|fragmento|passagem)\b/i.test(sanitize(text));
}

function isDirectReadCommand(text = "") {
  const normalized = normalizeKeywordText(text);
  return /^leia\b/.test(normalized) &&
    /\b(?:alternativas?|frases?)\b/.test(normalized) &&
    /\b(?:marque|assinale|identifique|apresenta)\b/.test(normalized) &&
    !/\b(?:texto|trecho|poema|tirinha|imagem|figura|mapa|grafico)\b/.test(normalized);
}

function isInstructionOnlyPrompt(text = "") {
  const normalized = normalizeKeywordText(text);
  return /\b(?:alternativas?|marque|assinale|responda|questao|opcao|opção)\b/.test(normalized) &&
    !/\b(?:texto|trecho|poema|tirinha|imagem|figura|mapa|grafico|grafico)\b/.test(normalized);
}

function looksLikeRealSupportText(text = "") {
  const clean = sanitize(text);
  if (!clean || isInstructionOnlyPrompt(clean)) return false;
  if (clean.includes("\n") && clean.split("\n").filter(line => sanitize(line).length >= 20).length >= 2) {
    return true;
  }
  if (clean.length >= 55 && hasCompleteSentence(clean) && !PROMPT_START_REGEX.test(clean.slice(0, 45))) {
    return true;
  }
  if (clean.length > 100 && hasCompleteSentence(clean)) {
    return true;
  }

  const sentenceCount = (clean.match(/[.!?…](?:\s|$)/g) || []).length;
  return sentenceCount >= 2 && hasCompleteSentence(clean);
}

export function isMarcadorTextoApoioReal(texto) {
  const clean = normalizeLooseText(texto);
  if (!/^(?:leia|observe|analise)\b/i.test(clean)) return false;
  if (isImageSupportPrompt(clean)) return true;

  const markerRegex = /^(?:leia|observe|analise)\s+(?:o|a|os|as)?\s*(?:texto|trecho|frase|fragmento|passagem|poema|cartaz|anuncio|anúncio)?(?:\s+(?:abaixo|a seguir))?(?:\s*e(?:,?\s*em seguida,?)?\s*responda\s+(?:a|à|as|às)?\s*quest(?:ao|ão|oes|ões))?[:.]?\s*/i;
  const markerMatch = clean.match(markerRegex);
  if (!markerMatch) return false;

  const body = clean.slice(markerMatch[0].length).trim();
  if (!body || isInstructionOnlyPrompt(body)) return false;

  const promptMatch = findPromptStart(body);
  const supportCandidate = promptMatch && Number(promptMatch.index) > 0
    ? body.slice(0, promptMatch.index).trim()
    : body;

  return looksLikeRealSupportText(supportCandidate);
}

function extractInlineSource(text = "") {
  const clean = sanitize(text);
  if (!clean) return { before: "", source: "", after: "" };
  const sourceMatch = clean.match(SOURCE_MARKER_REGEX);
  const urlSourceMatch = clean.match(SOURCE_URL_FRAGMENT_REGEX);
  const namedSourceMatch = clean.match(SOURCE_REFERENCE_REGEX);
  const authorCommaMatch = clean.match(AUTHOR_COMMA_REFERENCE_REGEX);
  const dateSourceMatch = clean.match(BIBLIOGRAPHIC_DATE_REGEX);
  const hasStrongSourceStart = Boolean(sourceMatch || urlSourceMatch || namedSourceMatch || authorCommaMatch);
  const match = sourceMatch || urlSourceMatch || namedSourceMatch || authorCommaMatch || (hasStrongSourceStart ? dateSourceMatch : null);
  if (!match || Number(match.index) < 0) {
    return { before: clean, source: "", after: "" };
  }

  const sourceStart = Number(match.index);
  const afterSource = clean.slice(sourceStart);
  let promptMatch = findPromptStart(afterSource);
  if (!promptMatch && sourceMatch && SOURCE_URL_FRAGMENT_REGEX.test(afterSource)) {
    const loosePromptMatches = afterSource.matchAll(new RegExp(PROMPT_START_REGEX.source, "gi"));
    for (const looseMatch of loosePromptMatches) {
      const looseIndex = Number(looseMatch.index || 0);
      if (looseIndex > 0 && SOURCE_URL_FRAGMENT_REGEX.test(afterSource.slice(0, looseIndex))) {
        promptMatch = looseMatch;
        break;
      }
    }
  }
  const afterSourcePromptIndex = promptMatch && Number(promptMatch.index) >= 0
    ? Number(promptMatch.index)
    : -1;
  const sourceEnd = promptMatch && Number(promptMatch.index) > 0
    ? sourceStart + afterSourcePromptIndex
    : clean.length;
  let sourceText = clean.slice(sourceStart, sourceEnd).trim();
  let afterText = clean.slice(sourceEnd).trim();

  if (sourceMatch && SOURCE_URL_FRAGMENT_REGEX.test(sourceText)) {
    const boundaryRegex = /[.!?]\s+(?=[A-ZÀ-Ú])/g;
    let boundaryMatch = null;
    while ((boundaryMatch = boundaryRegex.exec(sourceText))) {
      const splitIndex = Number(boundaryMatch.index) + 1;
      const tail = sourceText.slice(splitIndex).trim();
      if (!/^(?:acesso|consultado|dispon[ií]vel|fonte)\b/i.test(tail)) {
        afterText = `${tail} ${afterText}`.trim();
        sourceText = sourceText.slice(0, splitIndex).trim();
        break;
      }
    }
  }

  const result = {
    before: clean.slice(0, sourceStart).trim(),
    source: normalizeSourceText(sourceText),
    after: afterText
  };
  return result;
}

function mergePromptText(prefix = "", suffix = "") {
  const left = sanitize(prefix);
  const right = sanitize(suffix);
  if (!left) return right;
  if (!right) return left;
  if (right.startsWith(left) || left.endsWith(right)) return right;
  return `${left} ${right}`.trim();
}

function assignSourceToParts(parts, source, forceImageSource = false) {
  if (!source) return;
  if (shouldPrioritizeImageSource(parts, forceImageSource)) {
    parts.fonteImagemApoio = parts.fonteImagemApoio || source;
  } else if (sanitize(parts.textoApoio)) {
    parts.fonteTextoApoio = parts.fonteTextoApoio || source;
  }
}

function enforceImageSourcePriority(parts = {}) {
  if (!sanitize(parts.textoApoio)) {
    if (parts.fonteTextoApoio && hasImageEvidence(parts)) {
      parts.fonteImagemApoio = parts.fonteImagemApoio || parts.fonteTextoApoio;
    }
    parts.fonteTextoApoio = "";
    return;
  }

  if (parts.fonteTextoApoio && hasImageEvidence(parts)) {
    parts.fonteImagemApoio = parts.fonteImagemApoio || parts.fonteTextoApoio;
    parts.fonteTextoApoio = "";
  }
}

function splitAfterSourceByPrompt(afterSource = "") {
  const clean = sanitize(afterSource);
  if (!clean) return { supportContinuation: "", enunciado: "" };
  const promptData = extractPromptSplit(clean);
  if (promptData.after && promptData.before) {
    return {
      supportContinuation: promptData.before,
      enunciado: promptData.after
    };
  }
  if (promptData.after) {
    return { supportContinuation: "", enunciado: promptData.after };
  }
  return { supportContinuation: "", enunciado: clean };
}

function enforceSourceBoundaries(parts = {}) {
  const normalized = {
    instrucao: parts.instrucao || "",
    textoApoio: parts.textoApoio || "",
    fonteTextoApoio: parts.fonteTextoApoio || "",
    imagemApoio: parts.imagemApoio || "",
    fonteImagemApoio: parts.fonteImagemApoio || "",
    enunciado: parts.enunciado || ""
  };

  if (sanitize(normalized.textoApoio)) {
    const sourceData = extractInlineSource(normalized.textoApoio);
    if (sourceData.source) {
      const hadImageMarker = normalized.textoApoio.includes("[imagem aqui]") || sanitize(normalized.imagemApoio);
      normalized.textoApoio = sourceData.before.replace("[imagem aqui]", "").trim();
      if (hadImageMarker) normalized.imagemApoio = normalized.imagemApoio || "[imagem aqui]";
      assignSourceToParts(normalized, sourceData.source, hadImageMarker);
      const afterParts = splitAfterSourceByPrompt(sourceData.after);
      normalized.textoApoio = mergePromptText(normalized.textoApoio, afterParts.supportContinuation);
      normalized.enunciado = mergePromptText(afterParts.enunciado, normalized.enunciado);
    }
  }

  if (sanitize(normalized.enunciado)) {
    const sourceData = extractInlineSource(normalized.enunciado);
    if (sourceData.source) {
      if (sourceData.before && looksLikeRealSupportText(sourceData.before)) {
        normalized.textoApoio = mergePromptText(normalized.textoApoio, sourceData.before.replace("[imagem aqui]", "").trim());
      }
      const hadImageMarker = normalized.enunciado.includes("[imagem aqui]") || sanitize(normalized.imagemApoio);
      if (hadImageMarker) normalized.imagemApoio = normalized.imagemApoio || "[imagem aqui]";
      assignSourceToParts(normalized, sourceData.source, hadImageMarker);
      const afterParts = splitAfterSourceByPrompt(sourceData.after);
      normalized.textoApoio = mergePromptText(normalized.textoApoio, afterParts.supportContinuation);
      normalized.enunciado = afterParts.enunciado || "";
    }
  }

  if (sanitize(normalized.textoApoio)) {
    const promptData = extractPromptSplit(normalized.textoApoio);
    if (promptData.after && looksLikeRealSupportText(promptData.before)) {
      normalized.textoApoio = promptData.before;
      normalized.enunciado = mergePromptText(promptData.after, normalized.enunciado);
    }
  }

  if (SOURCE_FORBIDDEN_IN_CONTENT_REGEX.test(normalized.textoApoio || "")) {
    const sourceData = extractInlineSource(normalized.textoApoio);
    normalized.textoApoio = sourceData.before.replace("[imagem aqui]", "").trim();
    assignSourceToParts(normalized, sourceData.source, sanitize(normalized.imagemApoio));
    const afterParts = splitAfterSourceByPrompt(sourceData.after);
    normalized.textoApoio = mergePromptText(normalized.textoApoio, afterParts.supportContinuation);
    normalized.enunciado = mergePromptText(afterParts.enunciado, normalized.enunciado);
  }

  if (SOURCE_FORBIDDEN_IN_CONTENT_REGEX.test(normalized.enunciado || "")) {
    const sourceData = extractInlineSource(normalized.enunciado);
    assignSourceToParts(normalized, sourceData.source, sanitize(normalized.imagemApoio));
    const afterParts = splitAfterSourceByPrompt(sourceData.after);
    normalized.textoApoio = mergePromptText(normalized.textoApoio, sourceData.before && looksLikeRealSupportText(sourceData.before) ? sourceData.before : "");
    normalized.textoApoio = mergePromptText(normalized.textoApoio, afterParts.supportContinuation);
    normalized.enunciado = afterParts.enunciado || sourceData.before;
  }

  if (String(normalized.textoApoio || "").includes("[imagem aqui]")) {
    normalized.imagemApoio = normalized.imagemApoio || "[imagem aqui]";
    normalized.textoApoio = normalized.textoApoio.replace("[imagem aqui]", "").trim();
  }

  if (hasImageEvidence(normalized)) {
    normalized.imagemProvavel = true;
    normalized.imagemApoio = normalized.imagemApoio || "[imagem aqui]";
    if (normalized.fonteTextoApoio && !normalized.fonteImagemApoio) {
      normalized.fonteImagemApoio = normalized.fonteTextoApoio;
      normalized.fonteTextoApoio = "";
    }
  }

  if (!sanitize(normalized.textoApoio) && normalized.fonteTextoApoio && hasImageEvidence(normalized)) {
    normalized.fonteImagemApoio = normalized.fonteImagemApoio || normalized.fonteTextoApoio;
    normalized.fonteTextoApoio = "";
  }

  if (!sanitize(normalized.enunciado) && (normalized.alternativas || []).length) {
    normalized.enunciado = inferResidualStatementFromDraft(normalized);
  }
  if (!sanitize(normalized.enunciado) && (normalized.alternativas || []).length && hasImageEvidence(normalized)) {
    normalized.enunciado = "Questao baseada na imagem de apoio.";
  }

  if (!sanitize(normalized.textoApoio) && isInstitutionalHeaderText(normalized.tituloTextoApoio)) {
    normalized.tituloTextoApoio = "";
  }

  enforceImageSourcePriority(normalized);

  return normalized;
}

function extractPromptSplit(text = "") {
  const clean = sanitize(text);
  const promptMatch = findPromptStart(clean);
  if (!promptMatch || Number(promptMatch.index) < 0) {
    return { before: clean, after: "" };
  }

  return {
    before: clean.slice(0, promptMatch.index).trim(),
    after: clean.slice(promptMatch.index).trim()
  };
}

function normalizeSourceText(text = "") {
  return sanitize(text)
    .replace(/([A-Za-z0-9])-\s+([A-Za-z0-9])/g, "$1$2")
    .replace(/([?&#=])\s+/g, "$1")
    .replace(/\s+([?&#=])/g, "$1")
    .replace(/\bpag\s+e=/gi, "page=")
    .replace(/\bfromView\b/g, "fromView")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyQuestionParts(enunciado = "") {
  return {
    instrucao: "",
    textoApoio: "",
    fonteTextoApoio: "",
    imagemApoio: "",
    fonteImagemApoio: "",
    enunciado
  };
}

function splitInitialInstruction(texto = "") {
  const clean = normalizeLooseText(texto);
  if (!/^(?:leia|observe|analise)\b/i.test(clean)) {
    return { instrucao: "", rest: clean };
  }
  if (isDirectReadCommand(clean)) {
    return { instrucao: "", rest: clean };
  }

  const colonIndex = clean.search(/[:：]/);
  if (colonIndex !== -1 && colonIndex <= 140) {
    return {
      instrucao: clean.slice(0, colonIndex + 1).trim(),
      rest: clean.slice(colonIndex + 1).trim()
    };
  }

  const sentenceMatch = clean.match(/^.*?[.!?…](?:\s|$)/);
  if (sentenceMatch) {
    return {
      instrucao: sentenceMatch[0].trim(),
      rest: clean.slice(sentenceMatch[0].length).trim()
    };
  }

  const supportWordMatch = clean.match(/\b(?:o|a)\s+(?:texto|trecho|poema|tirinha|imagem|figura|mapa|grafico|gráfico)\b.*?\s+(?=[A-ZÀ-Ú0-9])/i);
  if (supportWordMatch && supportWordMatch[0].length <= 140) {
    return {
      instrucao: supportWordMatch[0].trim(),
      rest: clean.slice(supportWordMatch[0].length).trim()
    };
  }

  return { instrucao: clean, rest: "" };
}

function fallbackStatementForInstruction(instrucao = "") {
  const clean = sanitize(instrucao);
  if (/\bfrase\b/i.test(clean)) return "Analise a frase a seguir.";
  if (/\btrecho\b/i.test(clean)) return "Analise o trecho a seguir.";
  if (/\btexto\b/i.test(clean)) return "Analise o texto a seguir.";
  return "Analise o material apresentado.";
}

export function splitQuestionParts(texto = "") {
  const clean = normalizeLooseText(texto);
  const instructionData = splitInitialInstruction(clean);
  if (!instructionData.instrucao) {
    return splitQuestionPartsWithoutInstruction(clean);
  }

  if (!instructionData.rest) {
    return {
      ...emptyQuestionParts(""),
      instrucao: instructionData.instrucao
    };
  }

  const rest = instructionData.rest;
  const instrucao = instructionData.instrucao;

  if (isImageSupportPrompt(instrucao) || rest.includes("[imagem aqui]")) {
    const hasPlaceholder = rest.includes("[imagem aqui]");
    const beforeImage = hasPlaceholder ? rest.slice(0, rest.indexOf("[imagem aqui]")).trim() : "";
    const afterImage = (hasPlaceholder ? rest.slice(rest.indexOf("[imagem aqui]") + "[imagem aqui]".length) : rest).trim();
    const sourceData = extractInlineSource(afterImage);
    const promptData = sourceData.after ? splitAfterSourceByPrompt(sourceData.after) : extractPromptSplit(afterImage);
    const supportContinuation = promptData.supportContinuation || "";
    const textCandidate = [beforeImage || (sourceData.source ? sourceData.before : promptData.before), supportContinuation]
      .filter(Boolean)
      .join(" ")
      .trim();
    const hasSupportTextWithImage = looksLikeRealSupportText(textCandidate) ||
      (hasPlaceholder && Boolean(sourceData.source) && textCandidate.length >= 25 && hasCompleteSentence(textCandidate) && !PROMPT_START_REGEX.test(textCandidate.slice(0, 45)));
    return {
      instrucao,
      textoApoio: hasSupportTextWithImage ? textCandidate : "",
      fonteTextoApoio: "",
      imagemApoio: "[imagem aqui]",
      fonteImagemApoio: sourceData.source,
      enunciado: promptData.enunciado || promptData.after || (hasSupportTextWithImage ? "" : textCandidate)
    };
  }

  const body = rest;
  if (body.length < 30) {
    return {
      ...emptyQuestionParts(body),
      instrucao
    };
  }

  const sourceData = extractInlineSource(body);
  const hasEnoughSourceSupport = looksLikeRealSupportText(sourceData.before) ||
    (sourceData.source && sourceData.before.length >= 25 && hasCompleteSentence(sourceData.before));
  if (sourceData.source && hasEnoughSourceSupport) {
    const afterParts = splitAfterSourceByPrompt(sourceData.after);
    return {
      instrucao,
      textoApoio: mergePromptText(sourceData.before, afterParts.supportContinuation),
      fonteTextoApoio: sourceData.source,
      imagemApoio: "",
      fonteImagemApoio: "",
      enunciado: afterParts.enunciado || ""
    };
  }

  const promptMatch = findPromptStart(body);
  if (promptMatch && Number(promptMatch.index) >= 20) {
    const textoApoio = body.slice(0, promptMatch.index).trim();
    const enunciado = body.slice(promptMatch.index).trim();
    if (!looksLikeRealSupportText(textoApoio) || !enunciado) {
      return {
        ...emptyQuestionParts(body),
        instrucao
      };
    }
    return {
      instrucao,
      textoApoio,
      fonteTextoApoio: "",
      imagemApoio: "",
      fonteImagemApoio: "",
      enunciado
    };
  }

  return {
    ...emptyQuestionParts(body),
    instrucao
  };
}

function splitQuestionPartsWithoutInstruction(clean = "") {
  const sourceData = extractInlineSource(clean);
  const hasEnoughSourceSupport = looksLikeRealSupportText(sourceData.before) ||
    (sourceData.source && sourceData.before.length >= 25 && hasCompleteSentence(sourceData.before));
  if (sourceData.source && hasEnoughSourceSupport) {
    const isImageSupport = sourceData.before.includes("[imagem aqui]") || isImageSupportPrompt(sourceData.before);
    const afterParts = splitAfterSourceByPrompt(sourceData.after);
    return {
      instrucao: "",
      textoApoio: isImageSupport ? "" : mergePromptText(sourceData.before.replace("[imagem aqui]", "").trim(), afterParts.supportContinuation),
      fonteTextoApoio: isImageSupport ? "" : sourceData.source,
      imagemApoio: isImageSupport ? "[imagem aqui]" : "",
      fonteImagemApoio: isImageSupport ? sourceData.source : "",
      enunciado: afterParts.enunciado || ""
    };
  }

  const promptMatch = findPromptStart(clean);
  if (promptMatch && Number(promptMatch.index) >= 35) {
    const textoApoio = clean.slice(0, promptMatch.index).trim();
    const enunciado = clean.slice(promptMatch.index).trim();
    if (looksLikeRealSupportText(textoApoio) && enunciado) {
      return {
        instrucao: "",
        textoApoio,
        fonteTextoApoio: "",
        imagemApoio: "",
        fonteImagemApoio: "",
        enunciado
      };
    }
  }

  return emptyQuestionParts(clean);
}

export function splitSupportFromPrompt(texto = "") {
  const parts = splitQuestionParts(texto);
  return {
    textoApoio: parts.textoApoio || parts.imagemApoio || "",
    enunciado: parts.enunciado
  };
}

function isFalseQuestionText(enunciado = "", question = {}) {
  const clean = normalizeLooseText(enunciado);
  if (!clean && sanitize(question.instrucao) && (question.alternativas || []).length) return false;
  if (!clean || clean.length < 10) return true;
  return isLinhaCartaoResposta(clean);
}

function normalizeParsedQuestion(question) {
  if (!question) return null;
  const normalized = { ...question };

  if (sanitize(normalized.textoApoio)) {
    const sourceData = extractInlineSource(normalized.textoApoio);
    if (sourceData.source) {
      const isImageSupport = normalized.textoApoio.includes("[imagem aqui]") || isImageSupportPrompt(normalized.textoApoio);
      if (isImageSupport) {
        normalized.imagemApoio = normalized.imagemApoio || "[imagem aqui]";
        normalized.fonteImagemApoio = normalized.fonteImagemApoio || sourceData.source;
        normalized.textoApoio = sourceData.before.replace("[imagem aqui]", "").trim() || normalized.textoApoio;
      } else {
        normalized.textoApoio = sourceData.before || normalized.textoApoio;
        normalized.fonteTextoApoio = normalized.fonteTextoApoio || sourceData.source;
      }
      if (!sanitize(normalized.enunciado) && sourceData.after) {
        normalized.enunciado = sourceData.after;
      }
    }
  }

  if (sanitize(normalized.enunciado) && !/^(?:leia|observe|analise)\b/i.test(normalized.enunciado || "")) {
    const parts = splitQuestionPartsWithoutInstruction(normalized.enunciado);
    if ((parts.textoApoio || parts.imagemApoio) && parts.enunciado) {
      normalized.textoApoio = parts.textoApoio || parts.imagemApoio;
      normalized.fonteTextoApoio = parts.fonteTextoApoio;
      normalized.imagemApoio = parts.imagemApoio;
      normalized.fonteImagemApoio = parts.fonteImagemApoio;
      normalized.enunciado = parts.enunciado;
      normalized.usarTextoApoio = Boolean(normalized.textoApoio);
    }
  }

  if (!sanitize(normalized.textoApoio) && /^(?:leia|observe|analise)\b/i.test(normalized.enunciado || "")) {
    const parts = splitQuestionParts(normalized.enunciado);
    if (parts.instrucao) {
      normalized.instrucao = parts.instrucao;
      normalized.enunciado = parts.enunciado;
      normalized.imagemApoio = normalized.imagemApoio || parts.imagemApoio;
      normalized.fonteImagemApoio = normalized.fonteImagemApoio || parts.fonteImagemApoio;
    }
    if ((parts.textoApoio || parts.imagemApoio) && parts.enunciado) {
      normalized.instrucao = parts.instrucao;
      normalized.textoApoio = parts.textoApoio || parts.imagemApoio;
      normalized.fonteTextoApoio = parts.fonteTextoApoio;
      normalized.imagemApoio = parts.imagemApoio;
      normalized.fonteImagemApoio = parts.fonteImagemApoio;
      normalized.enunciado = parts.enunciado;
      normalized.usarTextoApoio = true;
    }
  }

  if (
    sanitize(normalized.instrucao) &&
    isTextSupportInstruction(normalized.instrucao) &&
    !sanitize(normalized.textoApoio) &&
    sanitize(normalized.enunciado) &&
    !findPromptStart(normalized.enunciado)
  ) {
    normalized.textoApoio = normalized.enunciado;
    normalized.enunciado = fallbackStatementForInstruction(normalized.instrucao);
    normalized.usarTextoApoio = true;
  }

  Object.assign(normalized, enforceSourceBoundaries(normalized));
  normalized.usarTextoApoio = Boolean(sanitize(normalized.textoApoio));

  if (!sanitize(normalized.enunciado) && (normalized.alternativas || []).length) {
    normalized.enunciado = inferResidualStatementFromDraft(normalized);
  }
  if (!sanitize(normalized.enunciado) && (normalized.alternativas || []).length && hasImageEvidence(normalized)) {
    normalized.enunciado = "Questao baseada na imagem de apoio.";
  }

  if (isFalseQuestionText(normalized.enunciado, normalized)) {
    return null;
  }

  return normalized;
}

function buildSingleQuestionFallback(lines, baseContext, answerMap) {
  const filteredLines = (lines || [])
    .map(line => normalizeLooseText(line))
    .filter(line => line && !isIgnorableLine(line) && !PAGE_NUMBER_ONLY_REGEX.test(line));

  if (!filteredLines.length) return null;

  const firstAlternativeIndex = filteredLines.findIndex(line => ALT_LINE_REGEX.test(line) || ALT_ONLY_LABEL_REGEX.test(line));
  const stemLines = firstAlternativeIndex === -1 ? filteredLines : filteredLines.slice(0, firstAlternativeIndex);
  const alternativeLines = firstAlternativeIndex === -1 ? [] : filteredLines.slice(firstAlternativeIndex);

  const normalizedStemLines = stripLeadingQuestionMarkerLines(stemLines);

  const supportLines = isSupportBlockStart(normalizedStemLines[0]) && normalizedStemLines.length > 1
    ? normalizedStemLines.slice(0, -1)
    : [];
  const enunciadoLines = supportLines.length
    ? normalizedStemLines.slice(-1)
    : normalizedStemLines;

  const effectiveContext = resolveQuestionContext(baseContext, supportLines.length ? buildSupportText(supportLines) : baseContext.textoBase || "");
  const draft = startQuestionDraft(effectiveContext, 1, buildSupportText(enunciadoLines).replace(/\n+/g, " ").trim());
  draft.textoApoio = supportLines.length ? buildSupportText(supportLines) : draft.textoApoio;

  let pendingAlternativeLabel = "";
  for (const line of alternativeLines) {
    const inlineGabaritoMatch = line.match(INLINE_GABARITO_REGEX);
    if (inlineGabaritoMatch) {
      draft.gabaritoOriginal = normalizeAnswerToken(inlineGabaritoMatch[1]);
      continue;
    }

    if (pendingAlternativeLabel) {
      draft.alternativasRaw.push(line);
      pendingAlternativeLabel = "";
      continue;
    }

    const altMatch = line.match(ALT_LINE_REGEX);
    if (altMatch) {
      const alternativaTexto = normalizeLooseText(altMatch[5] || "");
      if (alternativaTexto) {
        draft.alternativasRaw.push(alternativaTexto);
      } else {
        pendingAlternativeLabel = altMatch[1] || altMatch[2] || altMatch[3] || altMatch[4] || "";
      }
      continue;
    }

    const altOnlyMatch = line.match(ALT_ONLY_LABEL_REGEX);
    if (altOnlyMatch) {
      pendingAlternativeLabel = altOnlyMatch[1] || altOnlyMatch[2] || "";
      continue;
    }

    if (draft.alternativasRaw.length > 0) {
      appendToAlternative(draft, line);
    } else {
      appendToQuestionStatement(draft, line);
    }
  }

  return finalizeDraft(draft, answerMap);
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
  const textoLimpo = cleanTextoImportado(rawText);
  const { mainLines, answerMap } = splitSections(textoLimpo);
  const workingLines = mainLines;
  const textoBaseCandidate = guessTextoBase(workingLines);
  const titulo = guessQuestionTitle(workingLines, context.titulo);
  const baseContext = {
    ...context,
    titulo,
    textoBase: textoBaseCandidate
  };

  const results = [];
  let current = null;
  let pendingAlternativeLabel = "";
  let activeSupportText = textoBaseCandidate;
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
      const alternativaTexto = normalizeLooseText(altMatch[5] || "");
      if (alternativaTexto) {
        current.alternativasRaw.push(alternativaTexto);
      } else {
        pendingAlternativeLabel = altMatch[1] || altMatch[2] || altMatch[3] || altMatch[4] || "";
      }
      continue;
    }

    const altOnlyMatch = normalizedLine.match(ALT_ONLY_LABEL_REGEX);
    if (altOnlyMatch) {
      pendingAlternativeLabel = altOnlyMatch[1] || altOnlyMatch[2] || "";
      continue;
    }

    const inlineGabaritoMatch = normalizedLine.match(INLINE_GABARITO_REGEX);
    if (inlineGabaritoMatch) {
      current.gabaritoOriginal = normalizeAnswerToken(inlineGabaritoMatch[1]);
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

  if (!results.length) {
    const fallbackQuestion = buildSingleQuestionFallback(workingLines, baseContext, answerMap);
    if (fallbackQuestion) {
      results.push(fallbackQuestion);
    }
  }

  const postProcessedResults = results
    .map(normalizeParsedQuestion)
    .filter(Boolean);
  const hasSharedBlock = shouldCreateSharedBlock(postProcessedResults, baseContext);
  const textoBase = hasSharedBlock ? textoBaseCandidate : "";
  const finalContext = {
    ...baseContext,
    textoBase
  };
  const normalizedResults = postProcessedResults;

  const normalizedQuestions = applySharedBlockMetadata(normalizedResults, finalContext)
    .map(question => applyPreClassification(question));

  return {
    tituloDetectado: titulo,
    textoBaseDetectado: textoBase,
    possuiBlocoCompartilhado: hasSharedBlock,
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
  const hasAcervoSubmission = validQuestions.some(question => question.enviarParaAcervo || question.visibilidade === "pendente_acervo");

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
    status: hasAcervoSubmission ? "pendente_acervo" : "revisada_professor",
    criadoEm: new Date(),
    atualizadoEm: new Date()
  });

  validQuestions.forEach((question, index) => {
    const docRef = db.collection("questoes").doc();
    const enviarParaAcervo = Boolean(question.enviarParaAcervo || question.visibilidade === "pendente_acervo");
    const record = buildQuestionRecord({
      ...question,
      importacaoId: importacaoRef.id,
      origemCriacao: question.blocoId ? "importacao_bloco" : "importacao_professor",
      visibilidade: enviarParaAcervo ? "pendente_acervo" : "privada",
      statusRevisao: enviarParaAcervo ? "pendente_acervo" : "revisada_professor",
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

