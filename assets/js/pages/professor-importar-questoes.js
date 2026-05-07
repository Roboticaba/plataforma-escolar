import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { clearFeedback, escapeHtml, renderEmptyState, showFeedback } from "../utils/ui.js";
import { getAlternativeLabel, saveQuestionBlock } from "../services/questions-service.js";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js";
import { cleanTextoImportado, organizarQuestoesParaRevisao, salvarImportacaoRevisada } from "../services/importacao-questoes-service.js";
import { createEmptyQuestionParseResult, parseQuestionDocumentText, parseTextAssessment } from "../services/question-parser.js";
import { suggestQuestionClassification } from "../services/question-classifier.js";
import { extractDocxAssessment } from "../services/docx-import-service.js";
import { DEBUG_PDF_IMPORT, detectQuestionImageProbability, extractPdfAssessment } from "../services/pdf-import-service.js";
import * as pdfjsLib from "../../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).toString();

const usuario = requireProfessor();

const state = {
  mode: "lote",
  importedQuestions: [],
  sourceLabel: "",
  parseInfo: {
    tituloDetectado: "",
    textoBaseDetectado: ""
  },
  parserSnapshot: createEmptyQuestionParseResult(),
  importedDocument: null,
  pendingDocumentImages: [],
  selectedPendingImageId: "",
  pdfViewer: {
    fileUrl: "",
    fileName: "",
    pdf: null,
    zoom: 1,
    currentPage: 1,
    totalPages: 0,
    mobileView: "preview",
    renderToken: 0
  }
};

const BUTTON_FEEDBACK_DELAY = 1200;
const OCR_RENDER_SCALE = 2.4;
const OCR_HORIZONTAL_PADDING = 28;
const OCR_VERTICAL_PADDING = 12;
const OCR_BOTTOM_PADDING = 46;
const ACCEPTED_CLIPBOARD_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const elements = {
  formImportacao: document.getElementById("formImportacao"),
  titulo: document.getElementById("importTitulo"),
  anoEscolar: document.getElementById("importAnoEscolar"),
  disciplina: document.getElementById("importDisciplina"),
  fonteNome: document.getElementById("importFonteNome"),
  fonteUrl: document.getElementById("importFonteUrl"),
  fonteObservacao: document.getElementById("importFonteObservacao"),
  textoBruto: document.getElementById("importTextoBruto"),
  arquivoDocumento: document.getElementById("importArquivoDocumento"),
  arquivoInfo: document.getElementById("importArquivoInfo"),
  sharedBlockPanel: document.getElementById("sharedBlockPanel"),
  sharedBlockText: document.getElementById("sharedBlockText"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  pageMainTitle: document.getElementById("pageMainTitle"),
  pageMainSubtitle: document.getElementById("pageMainSubtitle"),
  contextPanelTitle: document.getElementById("contextPanelTitle"),
  contextPanelSubtitle: document.getElementById("contextPanelSubtitle"),
  labelTituloImportacao: document.getElementById("labelTituloImportacao"),
  mainInputLabel: document.getElementById("mainInputLabel"),
  mainInputHint: document.getElementById("mainInputHint"),
  statusDeteccao: document.getElementById("importStatusDeteccao"),
  btnOrganizar: document.getElementById("btnOrganizarImportacao"),
  btnClassificarProntas: document.getElementById("btnClassificarProntasImportacao"),
  btnSalvar: document.getElementById("btnSalvarImportacao"),
  btnSalvarBloco: document.getElementById("btnSalvarBlocoCompletoImportacao"),
  btnLimpar: document.getElementById("btnLimparImportacao"),
  feedback: document.getElementById("feedbackImportacao"),
  listaImportada: document.getElementById("listaImportada"),
  pendingImagesPanel: document.getElementById("pendingImagesPanel"),
  pendingImagesInfo: document.getElementById("pendingImagesInfo"),
  pendingImagesList: document.getElementById("pendingImagesList"),
  pdfReviewShell: document.getElementById("pdfReviewShell"),
  pdfViewerPanel: document.getElementById("pdfViewerPanel"),
  pdfViewerStatus: document.getElementById("pdfViewerStatus"),
  pdfViewerPages: document.getElementById("pdfViewerPages"),
  pdfViewerZoomLabel: document.getElementById("pdfViewerZoomLabel"),
  pdfViewerPageLabel: document.getElementById("pdfViewerPageLabel"),
  pdfViewerPrevPage: document.getElementById("pdfViewerPrevPage"),
  pdfViewerNextPage: document.getElementById("pdfViewerNextPage"),
  pdfViewerZoomIn: document.getElementById("pdfViewerZoomIn"),
  pdfViewerZoomOut: document.getElementById("pdfViewerZoomOut"),
  pdfReviewTabsContainer: document.getElementById("pdfReviewTabs"),
  pdfReviewTabs: [...document.querySelectorAll("[data-pdf-review-tab]")],
  metricDetectadas: document.getElementById("metricDetectadas"),
  metricProntas: document.getElementById("metricProntas"),
  metricDescritor: document.getElementById("metricDescritor"),
  chipTituloDetectado: document.getElementById("chipTituloDetectado"),
  chipTextoBase: document.getElementById("chipTextoBase")
};

const MODE_CONFIG = {
  lote: {
    heroTitle: "Digite ou cole sua questao e organize tudo em minutos.",
    heroSubtitle: "O sistema interpreta texto de apoio, enunciado, alternativas e gabarito por regras locais, monta cards editaveis e permite salvar so no final.",
    contextTitle: "Dados da importacao",
    contextSubtitle: "Preencha o contexto, cole uma ou varias questoes e clique em organizar.",
    titleLabel: "Titulo da importacao",
    inputLabel: "Digite ou cole sua questao",
    inputHint: "Use este campo para uma questao individual, varias questoes ou um bloco completo com texto base.",
    inputPlaceholder: "Cole aqui a questao ou o bloco completo, com texto de apoio, alternativas e gabarito se houver.",
    fallbackTitle: "Importacao de questoes"
  },
  individual: {
    heroTitle: "Questao individual em um unico fluxo.",
    heroSubtitle: "Cole uma questao completa, deixe o sistema organizar apoio, enunciado, alternativas e revise no proprio card antes de salvar.",
    contextTitle: "Questao individual",
    contextSubtitle: "Preencha o contexto da questao, cole o texto e clique em organizar.",
    titleLabel: "Titulo da questao",
    inputLabel: "Questao individual",
    inputHint: "Cole uma questao so. Se o texto vier com apoio e alternativas, a tela organiza automaticamente.",
    inputPlaceholder: "Cole aqui a questao individual, com texto de apoio e alternativas, se houver.",
    fallbackTitle: "Questao individual"
  },
  bloco: {
    heroTitle: "Bloco com texto base no mesmo fluxo.",
    heroSubtitle: "Cole o texto base junto com as questoes. O apoio fica no topo do bloco e as questoes aparecem em cards separados para revisao.",
    contextTitle: "Bloco com texto base",
    contextSubtitle: "Preencha o contexto do bloco, cole o texto completo e clique em organizar.",
    titleLabel: "Titulo do bloco",
    inputLabel: "Digite ou cole seu bloco",
    inputHint: "Cole o texto base seguido das questoes. O texto compartilhado aparece uma vez no topo do bloco.",
    inputPlaceholder: "Cole aqui o texto base e as questoes relacionadas, com alternativas e gabarito se houver.",
    fallbackTitle: "Bloco com texto base"
  }
};

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function getDisciplineLabel(value, fallback = "") {
  return DISCIPLINAS.find(item => item.value === value)?.label || fallback || "Sem disciplina";
}

function getYearLabel(value, fallback = "") {
  return ANOS_ESCOLARES.find(item => item.value === value)?.label || fallback || "Ano nao informado";
}

function getModeConfig() {
  return MODE_CONFIG[state.mode] || MODE_CONFIG.lote;
}

function getQueryMode() {
  const searchParams = new URLSearchParams(window.location.search);
  const value = searchParams.get("modo") || searchParams.get("mode");
  return MODE_CONFIG[value] ? value : "lote";
}

function shouldUseSharedBlock() {
  if (!state.importedQuestions.length) return false;
  const sharedBlockId = state.importedQuestions[0]?.blocoId;
  return Boolean(sharedBlockId && state.importedQuestions.every(question => question.blocoId === sharedBlockId));
}

function applySharedBlockTextToQuestions() {
  if (!shouldUseSharedBlock()) return;
  const sharedText = elements.sharedBlockText.value.trim();
  state.parseInfo.textoBaseDetectado = sharedText;
  state.importedQuestions.forEach(question => {
    question.textoApoio = sharedText;
    question.usarTextoApoio = Boolean(sharedText);
  });
}

function refreshModeUI() {
  const config = getModeConfig();
  elements.pageMainTitle.textContent = config.heroTitle;
  elements.pageMainSubtitle.textContent = config.heroSubtitle;
  elements.contextPanelTitle.textContent = config.contextTitle;
  elements.contextPanelSubtitle.textContent = config.contextSubtitle;
  elements.labelTituloImportacao.textContent = config.titleLabel;
  elements.mainInputLabel.textContent = config.inputLabel;
  elements.mainInputHint.textContent = config.inputHint;
  elements.textoBruto.placeholder = config.inputPlaceholder;
  elements.modeButtons.forEach(button => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
  if (!elements.titulo.value.trim()) {
    elements.titulo.placeholder = config.fallbackTitle;
  }
}

function getImportContext() {
  const documentoSelecionado = state.importedDocument
    ? {
        nome: state.importedDocument.nome,
        tipo: state.importedDocument.tipo,
        tamanho: state.importedDocument.tamanho,
        extraido: Boolean(state.importedDocument.extraido),
        imagensPendentes: state.pendingDocumentImages.length
      }
    : null;

  return {
    titulo: elements.titulo.value.trim(),
    anoEscolar: elements.anoEscolar.value,
    disciplina: elements.disciplina.value,
    textoOriginal: elements.textoBruto.value,
    parserSnapshot: state.parserSnapshot,
    documentoSelecionado,
    fonte: {
      nome: elements.fonteNome.value.trim(),
      url: elements.fonteUrl.value.trim(),
      observacao: elements.fonteObservacao.value.trim(),
      licenca: ""
    }
  };
}

function isQuestionReady(question) {
  if (!question.confirmadoParaSalvar || !question.enunciado.trim() || !question.disciplina || !question.anoEscolar) {
    return false;
  }

  if (disciplinaPrecisaDescritor(question.disciplina) && !question.descritor) {
    return false;
  }

  if (question.tipo === "resposta_escrita") {
    return Boolean((question.respostaEsperada || "").trim());
  }

  return (question.alternativas || []).length >= 2 && question.respostaCorreta !== "";
}

function isQuestionReadyForClassification(question) {
  if (!question.confirmadoParaSalvar || !question.enunciado.trim() || !question.disciplina || !question.anoEscolar) {
    return false;
  }

  if (question.tipo === "resposta_escrita") {
    return Boolean((question.respostaEsperada || "").trim());
  }

  return (question.alternativas || []).length >= 2 && question.respostaCorreta !== "";
}

function inferFallbackQuestionType(question) {
  if ((question.alternativas || []).some(item => item?.imagemUrl || item?.imagem)) {
    return "multipla_imagem";
  }
  if ((question.alternativas || []).length >= 2) {
    return "multipla_texto";
  }
  return "resposta_escrita";
}

function updateMetrics() {
  const detectadas = state.importedQuestions.length;
  const prontas = state.importedQuestions.filter(isQuestionReady).length;
  const prontasParaClassificar = state.importedQuestions.filter(isQuestionReadyForClassification).length;
  const comDescritor = state.importedQuestions.filter(question => (
    !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor)
  )).length;

  elements.metricDetectadas.textContent = String(detectadas);
  elements.metricProntas.textContent = String(prontas);
  elements.metricDescritor.textContent = String(comDescritor);
  if (elements.btnClassificarProntas) {
    elements.btnClassificarProntas.disabled = prontasParaClassificar === 0;
  }
  elements.btnSalvar.disabled = prontas === 0;
  if (elements.btnSalvarBloco) {
    elements.btnSalvarBloco.hidden = true;
  }
}

function updateParseInfo() {
  elements.chipTituloDetectado.textContent = `Titulo detectado: ${state.parseInfo.tituloDetectado || "-"}`;
  elements.chipTextoBase.textContent = state.parseInfo.textoBaseDetectado
    ? `Texto base: ${state.parseInfo.textoBaseDetectado.slice(0, 42)}${state.parseInfo.textoBaseDetectado.length > 42 ? "..." : ""}`
    : "Texto base: nao detectado";
}

function updateDetectionStatus(message, type = "neutral") {
  elements.statusDeteccao.textContent = message;
  elements.statusDeteccao.dataset.status = type;
}

function setButtonState(button, label, disabled = true) {
  if (!button) return;
  button.textContent = label;
  button.disabled = disabled;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function getClipboardImageFile(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  const imageItem = items.find(item => ACCEPTED_CLIPBOARD_IMAGE_TYPES.has(item.type));
  return imageItem?.getAsFile() || null;
}

function markQuestionHasRealSupportImage(question) {
  question.usarImagensApoio = true;
  if (question.imagemApoio === "[imagem aqui]") {
    question.imagemApoio = "";
  }
}

function updatePdfViewerControls() {
  const viewer = state.pdfViewer;
  const hasPdf = Boolean(viewer.pdf);
  if (elements.pdfReviewShell) {
    elements.pdfReviewShell.classList.toggle("has-pdf", Boolean(viewer.fileUrl));
    elements.pdfReviewShell.dataset.mobileView = viewer.mobileView || "preview";
  }
  if (elements.pdfReviewTabsContainer) {
    elements.pdfReviewTabsContainer.hidden = !viewer.fileUrl;
  }
  if (elements.pdfViewerZoomLabel) {
    elements.pdfViewerZoomLabel.textContent = `${Math.round((viewer.zoom || 1) * 100)}%`;
  }
  if (elements.pdfViewerPageLabel) {
    elements.pdfViewerPageLabel.textContent = hasPdf
      ? `${viewer.currentPage || 1} / ${viewer.totalPages || 1}`
      : "- / -";
  }
  if (elements.pdfViewerPrevPage) elements.pdfViewerPrevPage.disabled = !hasPdf || viewer.currentPage <= 1;
  if (elements.pdfViewerNextPage) elements.pdfViewerNextPage.disabled = !hasPdf || viewer.currentPage >= viewer.totalPages;
  if (elements.pdfViewerZoomOut) elements.pdfViewerZoomOut.disabled = !hasPdf || viewer.zoom <= 0.65;
  if (elements.pdfViewerZoomIn) elements.pdfViewerZoomIn.disabled = !hasPdf || viewer.zoom >= 1.8;
  elements.pdfReviewTabs.forEach(button => {
    button.classList.toggle("is-active", button.dataset.pdfReviewTab === viewer.mobileView);
  });
}

function clearPdfViewer() {
  state.pdfViewer.renderToken += 1;
  if (state.pdfViewer.fileUrl) {
    URL.revokeObjectURL(state.pdfViewer.fileUrl);
  }
  state.pdfViewer.fileUrl = "";
  state.pdfViewer.fileName = "";
  state.pdfViewer.pdf = null;
  state.pdfViewer.zoom = 1;
  state.pdfViewer.currentPage = 1;
  state.pdfViewer.totalPages = 0;
  if (elements.pdfViewerPages) {
    elements.pdfViewerPages.innerHTML = "";
  }
  if (elements.pdfViewerStatus) {
    elements.pdfViewerStatus.textContent = "Selecione um PDF para conferir o original aqui.";
  }
  updatePdfViewerControls();
}

async function renderPdfViewerPages() {
  const viewer = state.pdfViewer;
  const pdf = viewer.pdf;
  if (!pdf || !elements.pdfViewerPages) return;

  const token = viewer.renderToken;
  elements.pdfViewerPages.innerHTML = "";
  updatePdfViewerControls();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (token !== state.pdfViewer.renderToken) return;

    const pageFrame = document.createElement("article");
    pageFrame.className = "pdf-viewer-page";
    pageFrame.dataset.pdfPage = String(pageNumber);
    pageFrame.innerHTML = `<div class="pdf-page-label">Pagina ${pageNumber}</div>`;
    const canvas = document.createElement("canvas");
    pageFrame.appendChild(canvas);
    elements.pdfViewerPages.appendChild(pageFrame);

    const page = await pdf.getPage(pageNumber);
    if (token !== state.pdfViewer.renderToken) return;

    const viewport = page.getViewport({ scale: viewer.zoom });
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
  }
}

async function loadPdfPreview(file) {
  clearPdfViewer();
  if (!file || !/\.pdf$/i.test(file.name || "")) return;

  state.pdfViewer.fileUrl = URL.createObjectURL(file);
  state.pdfViewer.fileName = file.name || "PDF original";
  state.pdfViewer.mobileView = "pdf";
  state.pdfViewer.renderToken += 1;
  if (elements.pdfViewerStatus) {
    elements.pdfViewerStatus.textContent = `Carregando ${state.pdfViewer.fileName}...`;
  }
  updatePdfViewerControls();

  try {
    const loadingTask = pdfjsLib.getDocument({ url: state.pdfViewer.fileUrl });
    const pdf = await loadingTask.promise;
    state.pdfViewer.pdf = pdf;
    state.pdfViewer.totalPages = pdf.numPages;
    state.pdfViewer.currentPage = 1;
    if (elements.pdfViewerStatus) {
      elements.pdfViewerStatus.textContent = `${state.pdfViewer.fileName} carregado para conferencia visual.`;
    }
    await renderPdfViewerPages();
  } catch (error) {
    console.error("Erro ao carregar visualizador de PDF", error);
    if (elements.pdfViewerStatus) {
      elements.pdfViewerStatus.textContent = "Nao foi possivel carregar o PDF no visualizador.";
    }
  } finally {
    updatePdfViewerControls();
    if (state.importedQuestions.length) {
      renderImportPreview();
    }
  }
}

function scrollPdfViewerToPage(pageNumber) {
  const page = Math.min(Math.max(Number(pageNumber) || 1, 1), state.pdfViewer.totalPages || 1);
  state.pdfViewer.currentPage = page;
  updatePdfViewerControls();
  elements.pdfViewerPages
    ?.querySelector(`[data-pdf-page="${page}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function changePdfZoom(delta) {
  if (!state.pdfViewer.pdf) return;
  state.pdfViewer.zoom = Math.min(1.8, Math.max(0.65, Number((state.pdfViewer.zoom + delta).toFixed(2))));
  state.pdfViewer.renderToken += 1;
  if (elements.pdfViewerStatus) {
    elements.pdfViewerStatus.textContent = `Renderizando PDF em ${Math.round(state.pdfViewer.zoom * 100)}%...`;
  }
  await renderPdfViewerPages();
  scrollPdfViewerToPage(state.pdfViewer.currentPage);
  if (elements.pdfViewerStatus) {
    elements.pdfViewerStatus.textContent = `${state.pdfViewer.fileName} carregado para conferencia visual.`;
  }
}

function getTesseractApi() {
  return window.Tesseract || null;
}

function normalizeOcrText(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeOcrCompare(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isOcrQuestionMarkerNoise(line = "") {
  const clean = normalizeOcrCompare(line);
  const compact = clean.replace(/\s+/g, "");
  return /^(?:v?ques[a-z]*o?s?|questao|questoes?)\s*[0-9il]{0,3}$/.test(clean) ||
    /^v?ques[a-z0-9]{2,12}$/.test(compact) ||
    /\bquestao\s*\d{1,3}\b/.test(clean) ||
    /\bquestao\b/.test(clean);
}

function isOcrInstructionLine(line = "") {
  return /^\s*(?:observe|leia|analise)\s+(?:o\s+)?(?:trecho|texto|frase|imagem)\s+a\s+seguir\b/i.test(line) ||
    /^\s*(?:observe|leia|analise)\b.*:\s*$/i.test(line);
}

function isOcrStrongPromptStart(line = "") {
  return /^\s*(?:considerando\b|depois\s+da\s+resposta\b|qual\b|a\s+partir\b|no\s+trecho\b|de\s+acordo\b|com\s+base\b|o\s+uso\b)/i.test(line) ||
    /\bdepois\s+da\s+resposta\b/i.test(line);
}

function ocrAlternativeMatch(line = "") {
  return String(line || "").match(/^\s*\(?([A-Da-d])\)?[\).]\s*(.*)$/);
}

function isOcrSourceLine(line = "") {
  return /\b(?:https?:\/\/|www\.|dispon[ií]vel\s+em:|fonte:|adaptado\s+de:|freepik|fromview|query=|canva|gov\.br)\b/i.test(line);
}

function isRootOnlySourceUrl(line = "") {
  const clean = String(line || "")
    .trim()
    .replace(/^dispon[ií]vel\s+em:\s*/i, "")
    .replace(/^fonte:\s*/i, "")
    .trim();
  const urlMatch = clean.match(/https?:\/\/[^\s]+|www\.[^\s]+/i);
  if (!urlMatch) return false;
  const beforeAfter = clean.replace(urlMatch[0], "").replace(/[.:;\-\s]/g, "");
  const sourceWords = normalizeOcrCompare(beforeAfter).replace(/\s+/g, "");
  if (beforeAfter && !(sourceWords.includes("dispon") && sourceWords.endsWith("em")) && !sourceWords.includes("fonte")) return false;
  const urlText = urlMatch[0].replace(/^www\./i, "https://www.");
  try {
    const url = new URL(urlText);
    return !url.search && !url.hash && (!url.pathname || url.pathname === "/");
  } catch {
    return /^www\.[^/\s]+\/?\s*$/i.test(urlMatch[0]);
  }
}

function isStrongOcrSourceLine(line = "") {
  if (!isOcrSourceLine(line) || isRootOnlySourceUrl(line)) return false;
  return /\b(?:dispon[ií]vel\s+em:|fonte:|adaptado\s+de:|freepik|fromview|query=|canva|gov\.br|https?:\/\/.+\/.+|www\..+\/.+)\b/i.test(line);
}

function isOcrSourceContinuation(line = "") {
  const clean = String(line || "").trim();
  if (clean.length < 10) return false;
  return /(?:\/|_|=|&|\.\w{2,4}\b|\d{5,})/.test(clean) &&
    /[A-Za-zÀ-ÿ]{4,}/.test(clean) &&
    !isOcrStructuralNoise(clean);
}

function isOcrHeaderFooterLine(line = "") {
  return /^\s*(?:p[aá]gina|pagina|page)\s*\d+\s*$/i.test(line) ||
    /^\s*\d+\s*$/.test(line) ||
    /\b(?:5[º°o]?\s*ano|l[ií]ngua\s+portuguesa|simulado|avalia[cç][aã]o|secretaria|prefeitura)\b/i.test(line);
}

function isOcrStructuralNoise(line = "") {
  const clean = String(line || "").trim();
  if (!clean) return true;
  if (clean.length <= 2) return true;
  if (/^[|\\\/"'`´~^.,;:!?\-–—_()[\]{}<>]+$/.test(clean)) return true;
  if (/^[A-ZÀ-Ý]\s*$/.test(clean)) return true;

  const letters = (clean.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const symbols = (clean.match(/[^A-Za-zÀ-ÿ0-9\s]/g) || []).length;
  const symbolRatio = symbols / Math.max(clean.length, 1);
  if (clean.startsWith("|") || clean.endsWith("|")) return true;
  if (letters < 10 && symbols > 0) return true;
  if (letters < 12 && /^[A-ZÀ-Ý\s]+$/.test(clean)) return true;
  if (symbols >= 3 && symbolRatio > 0.16 && letters < 42) return true;

  const weirdTokens = clean.split(/\s+/).filter(token => (
    /[|\\\/"'`´~^_]/.test(token) ||
    /[a-zà-ÿ]\.[a-zà-ÿ]/i.test(token) ||
    /^[bcdfghjklmnpqrstvwxyz]{4,}$/i.test(normalizeOcrCompare(token).replace(/\s+/g, ""))
  ));
  return weirdTokens.length >= 2 && clean.length < 80;
}

function cleanOcrSupportSuggestion(text = "") {
  const cleanedLines = [];
  const sourceLines = normalizeOcrText(text)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of sourceLines) {
    if (isOcrStrongPromptStart(line)) break;
    if (isOcrQuestionMarkerNoise(line)) continue;
    if (isOcrInstructionLine(line)) continue;
    if (/^\s*(?:p[aá]gina|pagina|page)\s*\d+\s*$/i.test(line)) continue;
    if (/^\s*\d+\s*$/.test(line)) continue;
    if (/^\s*(?:\(?[A-Da-d]\)?[\).])\s+/.test(line)) continue;
    if (isOcrSourceLine(line)) continue;
    if (/\b(?:5[º°o]?\s*ano|l[ií]ngua\s+portuguesa|simulado|avalia[cç][aã]o|secretaria|prefeitura)\b/i.test(line)) continue;
    if (isOcrStructuralNoise(line)) continue;
    cleanedLines.push(line);
  }

  return cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOcrSupportCandidate(text = "") {
  let cleaned = cleanOcrSupportSuggestion(text);
  cleaned = cleaned
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !hasOcrSupportContamination(line))
    .filter(line => !isOcrSourceLine(line))
    .filter(line => !isOcrSourceContinuation(line))
    .filter(line => !isOcrStructuralNoise(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

function cleanOcrLinesForSegmentation(text = "") {
  return normalizeOcrText(text)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isOcrQuestionMarkerNoise(line))
    .filter(line => !isOcrHeaderFooterLine(line))
    .filter(line => ocrAlternativeMatch(line) || !isOcrStructuralNoise(line));
}

function assignOcrSourceLine(parsed, line, section = "support") {
  const likelyImageSource = /\b(?:freepik|fromview|query=|canva|vetores?|imagem|foto|ilustra[cç][aã]o)\b/i.test(line);
  const target = likelyImageSource || section !== "support" ? "fonteImagemApoio" : "fonteTextoApoio";
  parsed[target] = [parsed[target], line].filter(Boolean).join("\n");
  return target;
}

function createEmptyOcrParse() {
  return {
    instrucao: "",
    textoApoio: "",
    enunciado: "",
    alternativas: [],
    fonteTextoApoio: "",
    fonteImagemApoio: ""
  };
}

function ocrSupportLooksReliable(text = "") {
  const cleaned = sanitizeOcrSupportCandidate(text);
  const lines = normalizeOcrText(cleaned).split("\n").map(line => line.trim()).filter(Boolean);
  const joined = lines.join(" ");
  const letters = (joined.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (letters < 25) return false;
  if (lines.some(isOcrStructuralNoise)) return false;
  if (lines.some(isOcrSourceLine)) return false;
  if (hasOcrSupportContamination(joined)) return false;
  return letters / Math.max(joined.length, 1) >= 0.62;
}

function hasOcrSupportContamination(text = "") {
  const compact = normalizeOcrCompare(text).replace(/\s+/g, "");
  return /\b(?:vetores-gratis|freepik|fromview|query=|uuid=|\.htm|https?:\/\/|www\.)\b/i.test(text) ||
    /^\s*(?:wuevsiavuv|vquesiaos|quest(?:ao|ão))\b/i.test(text) ||
    /\b(?:wuevsiavuv|vquesiaos)\b/i.test(text) ||
    /wuevsiavuv|vquesiaos|questao\d*/.test(compact);
}

function hasNarrativeOrPromptInSource(text = "") {
  return /(?:^|\n)\s*(?:ele\s+respondeu|ela\s+respondeu|[—–-]\s+|depois\s+da\s+resposta|qual\s+sinal|considerando\b|ao\s+atravessar\b)/i.test(text);
}

function ocrSourceLooksReliable(text = "") {
  const clean = normalizeOcrText(text);
  if (!clean || isRootOnlySourceUrl(clean) || hasNarrativeOrPromptInSource(clean)) return false;
  return clean.split("\n").some(isStrongOcrSourceLine);
}

function ocrAlternativesCompleteForCurrent(question = {}, alternatives = []) {
  const current = question.alternativas || [];
  if (current.length >= 4) {
    const labels = new Set(alternatives.map(item => String(item.letra || "").toUpperCase()));
    return ["A", "B", "C", "D"].every(label => labels.has(label));
  }
  return alternatives.length >= 2;
}

function miniParseOcrText(text = "") {
  const lines = cleanOcrLinesForSegmentation(text);
  const parsed = createEmptyOcrParse();

  let section = "support";
  let currentAlternative = null;
  let activeSourceTarget = "";

  lines.forEach(line => {
    const alternativeMatch = ocrAlternativeMatch(line);
    if (alternativeMatch) {
      section = "alternatives";
      activeSourceTarget = "";
      currentAlternative = {
        letra: alternativeMatch[1].toUpperCase(),
        texto: (alternativeMatch[2] || "").trim()
      };
      parsed.alternativas.push(currentAlternative);
      return;
    }

    if (isStrongOcrSourceLine(line)) {
      activeSourceTarget = assignOcrSourceLine(parsed, line, section);
      section = "source";
      return;
    }

    if (isOcrSourceLine(line)) return;

    if (section === "source" && activeSourceTarget && isOcrSourceContinuation(line)) {
      parsed[activeSourceTarget] = [parsed[activeSourceTarget], line].filter(Boolean).join("\n");
      return;
    }

    if (section === "source") {
      section = currentAlternative ? "alternatives" : "support";
      activeSourceTarget = "";
    }

    if (section === "alternatives" && currentAlternative) {
      currentAlternative.texto = [currentAlternative.texto, line].filter(Boolean).join(" ").trim();
      return;
    }

    if (isOcrInstructionLine(line) && !parsed.instrucao && !parsed.textoApoio && !parsed.enunciado) {
      parsed.instrucao = line;
      section = "support";
      activeSourceTarget = "";
      return;
    }

    if (isOcrStrongPromptStart(line)) {
      section = "statement";
      activeSourceTarget = "";
      parsed.enunciado = [parsed.enunciado, line].filter(Boolean).join(" ").trim();
      return;
    }

    if (section === "statement") {
      parsed.enunciado = [parsed.enunciado, line].filter(Boolean).join(" ").trim();
      return;
    }

    parsed.textoApoio = [parsed.textoApoio, line].filter(Boolean).join("\n");
  });

  parsed.textoApoio = sanitizeOcrSupportCandidate(parsed.textoApoio);
  if (!ocrSupportLooksReliable(parsed.textoApoio)) {
    parsed.textoApoio = "";
  }
  parsed.enunciado = normalizeOcrText(parsed.enunciado).replace(/\n+/g, " ").trim();
  parsed.instrucao = normalizeOcrText(parsed.instrucao).replace(/\n+/g, " ").trim();
  parsed.alternativas = parsed.alternativas
    .map((item, index) => ({
      letra: item.letra || getAlternativeLabel(index),
      texto: normalizeOcrText(item.texto)
        .split("\n")
        .filter(line => !isOcrSourceLine(line))
        .join(" ")
        .replace(/\n+/g, " ")
        .trim(),
      ordem: index
    }))
    .filter(item => item.texto);

  return parsed;
}

function ocrLineObjectsFromData(data = {}) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  return lines
    .map(line => {
      const bbox = line?.bbox || {};
      const text = String(line?.text || "").trim();
      return {
        text,
        confidence: Number(line?.confidence ?? 100),
        x: Number(bbox.x0 ?? bbox.left ?? 0),
        y: Number(bbox.y0 ?? bbox.top ?? 0),
        width: Number((bbox.x1 ?? bbox.right ?? 0) - (bbox.x0 ?? bbox.left ?? 0)),
        height: Number((bbox.y1 ?? bbox.bottom ?? 0) - (bbox.y0 ?? bbox.top ?? 0))
      };
    })
    .filter(line => line.text)
    .sort((a, b) => Math.abs(a.y - b.y) <= 8 ? a.x - b.x : a.y - b.y);
}

function visualLineMetrics(lineObjects = []) {
  return {
    medianHeight: medianPositive(lineObjects.map(line => line.height)),
    medianX: medianPositive(lineObjects.map(line => line.x)),
    pageRight: Math.max(...lineObjects.map(line => line.x + line.width), 0),
    pageBottom: Math.max(...lineObjects.map(line => line.y + line.height), 0)
  };
}

function isVisuallySmallLine(lineData = {}, metrics = {}) {
  return Boolean(metrics.medianHeight && lineData.height && lineData.height <= metrics.medianHeight * 0.78);
}

function isVisualSourceLike(lineData = {}, metrics = {}) {
  if (!isVisuallySmallLine(lineData, metrics)) return false;
  const rightSide = metrics.pageRight && lineData.x + lineData.width >= metrics.pageRight * 0.58;
  const lowerArea = metrics.pageBottom && lineData.y >= metrics.pageBottom * 0.42;
  const narrow = metrics.pageRight && lineData.width <= metrics.pageRight * 0.68;
  return rightSide || lowerArea || narrow || isOcrSourceLine(lineData.text) || isOcrSourceContinuation(lineData.text);
}

function handleVisualSmallLine(parsed, lineData, metrics, section) {
  const line = lineData.text;
  if (!isVisualSourceLike(lineData, metrics)) return false;
  if (isStrongOcrSourceLine(line)) {
    assignOcrSourceLine(parsed, line, "image");
  }
  return true;
}

function finalizeMiniOcrParse(parsed) {
  parsed.textoApoio = sanitizeOcrSupportCandidate(parsed.textoApoio);
  if (!ocrSupportLooksReliable(parsed.textoApoio)) parsed.textoApoio = "";
  parsed.enunciado = normalizeOcrText(parsed.enunciado).replace(/\n+/g, " ").trim();
  parsed.instrucao = normalizeOcrText(parsed.instrucao).replace(/\n+/g, " ").trim();
  parsed.fonteTextoApoio = normalizeOcrText(parsed.fonteTextoApoio);
  parsed.fonteImagemApoio = normalizeOcrText(parsed.fonteImagemApoio);
  if (!ocrSourceLooksReliable(parsed.fonteTextoApoio)) parsed.fonteTextoApoio = "";
  if (!ocrSourceLooksReliable(parsed.fonteImagemApoio)) parsed.fonteImagemApoio = "";
  parsed.alternativas = parsed.alternativas
    .map((item, index) => ({
      letra: item.letra || getAlternativeLabel(index),
      texto: normalizeOcrText(item.texto)
        .split("\n")
        .filter(line => !isOcrSourceLine(line))
        .join(" ")
        .replace(/\n+/g, " ")
        .trim(),
      ordem: index
    }))
    .filter(item => item.texto);
  return parsed;
}

function miniParseOcrResult(data = {}) {
  const lineObjects = ocrLineObjectsFromData(data);
  if (!lineObjects.length) return miniParseOcrText(data.text || "");

  const parsed = createEmptyOcrParse();
  let section = "support";
  let currentAlternative = null;
  let activeSourceTarget = "";
  const metrics = visualLineMetrics(lineObjects);

  lineObjects.forEach(lineData => {
    const line = lineData.text.trim();
    const alternativeMatch = ocrAlternativeMatch(line);
    const strongSource = isStrongOcrSourceLine(line);
    if (!alternativeMatch && !strongSource && (lineData.confidence < 35 || isOcrQuestionMarkerNoise(line) || isOcrHeaderFooterLine(line) || isOcrStructuralNoise(line))) return;

    if (alternativeMatch) {
      section = "alternatives";
      activeSourceTarget = "";
      currentAlternative = {
        letra: alternativeMatch[1].toUpperCase(),
        texto: (alternativeMatch[2] || "").trim()
      };
      parsed.alternativas.push(currentAlternative);
      return;
    }

    if (handleVisualSmallLine(parsed, lineData, metrics, section)) {
      if (section === "source" && activeSourceTarget && isOcrSourceContinuation(line)) {
        parsed[activeSourceTarget] = [parsed[activeSourceTarget], line].filter(Boolean).join("\n");
      }
      return;
    }

    if (isStrongOcrSourceLine(line)) {
      activeSourceTarget = assignOcrSourceLine(parsed, line, section);
      section = "source";
      return;
    }

    if (isOcrSourceLine(line)) return;

    if (section === "source" && activeSourceTarget && isOcrSourceContinuation(line)) {
      parsed[activeSourceTarget] = [parsed[activeSourceTarget], line].filter(Boolean).join("\n");
      return;
    }

    if (section === "source") {
      section = currentAlternative ? "alternatives" : "support";
      activeSourceTarget = "";
    }

    if (isOcrInstructionLine(line) && !parsed.instrucao && !parsed.textoApoio && !parsed.enunciado) {
      parsed.instrucao = line;
      section = "support";
      return;
    }

    if (isOcrStrongPromptStart(line)) {
      section = "statement";
      parsed.enunciado = [parsed.enunciado, line].filter(Boolean).join(" ").trim();
      return;
    }

    if (section === "alternatives" && currentAlternative) {
      currentAlternative.texto = [currentAlternative.texto, line].filter(Boolean).join(" ").trim();
      return;
    }

    if (section === "statement") {
      parsed.enunciado = [parsed.enunciado, line].filter(Boolean).join(" ").trim();
      return;
    }

    parsed.textoApoio = [parsed.textoApoio, line].filter(Boolean).join("\n");
  });

  return finalizeMiniOcrParse(parsed);
}

function looksAbruptStart(text = "") {
  const clean = String(text || "").trim();
  return Boolean(clean && /^[a-záéíóúâêôãõç]/.test(clean) && !/^(?:de|do|da|dos|das|em|no|na|nos|nas|com|por|para)\b/i.test(clean));
}

function looksCutSentence(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return false;
  return /(?:,\s*|-\s*|:\s*)$/.test(clean) || /\b(?:que|de|do|da|dos|das|para|com|por|em|no|na|nas|nos|uma?|os?|as?)$/i.test(clean);
}

function getOcrSuspicionReasons(question = {}) {
  const reasons = [];
  const supportText = String(question.textoApoio || "").trim();
  const statement = String(question.enunciado || "").trim();
  const alternatives = question.alternativas || [];
  const textLength = [supportText, statement, ...alternatives.map(item => item?.texto || "")]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .length;

  if (looksAbruptStart(statement)) reasons.push("enunciado com inicio abrupto");
  if (looksCutSentence(statement) || looksCutSentence(supportText)) reasons.push("frase possivelmente cortada");
  if (supportText && supportText.length < 80 && question.usarTextoApoio) reasons.push("texto de apoio curto");
  if (question.tipo !== "resposta_escrita" && alternatives.length < 4) reasons.push("alternativas faltando");
  if (alternatives.some(item => !(item?.texto || item?.imagemUrl || item?.imagem || "").trim())) reasons.push("alternativa vazia");
  if (question.imagemProvavel && textLength < 180) reasons.push("imagem com pouco texto extraido");

  return [...new Set(reasons)];
}

function applyOcrSuspicion(question = {}) {
  const reasons = getOcrSuspicionReasons(question);
  question.textoPossivelmenteTruncado = Boolean(question.textoPossivelmenteTruncado || reasons.length);
  question.motivosSuspeitaOcr = reasons;
  if (reasons.length) {
    question.precisaRevisao = true;
  }
  return question;
}

function questionMarkerRegex(number) {
  const value = Number(number);
  if (!value) return null;
  return new RegExp(`^\\s*(?:quest(?:ao|ão)\\s*)?0?${value}\\s*(?:[\\).:\\-º°o]|\\b)`, "i");
}

function alternativeMarkerRegex() {
  return /^\s*(?:\(?[A-Da-d]\)?[\).])\s+/;
}

function itemCanvasY(item, viewport) {
  const transform = item?.transform || [];
  const x = Number(transform[4] || 0);
  const y = Number(transform[5] || 0);
  return viewport.convertToViewportPoint(x, y)[1];
}

function estimatePdfFontSize(item = {}) {
  const transform = item?.transform || [];
  const vertical = Math.hypot(Number(transform[2] || 0), Number(transform[3] || 0));
  const horizontal = Math.hypot(Number(transform[0] || 0), Number(transform[1] || 0));
  return vertical || horizontal || Number(item?.height || 0) || 0;
}

function medianPositive(values = []) {
  const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function classifySmallSourceRows(rows = []) {
  const medianFont = medianPositive(rows.map(row => row.fontSize));
  const sourceRows = rows.filter(row => (
    isStrongOcrSourceLine(row.text) ||
    (medianFont && row.fontSize && row.fontSize <= medianFont * 0.78 && isOcrSourceContinuation(row.text) && !isRootOnlySourceUrl(row.text))
  ));
  return sourceRows.map(row => row.text);
}

async function findQuestionCropBox(page, viewport, question = {}, index = 0) {
  const pageWidth = Math.floor(viewport.width);
  const pageHeight = Math.floor(viewport.height);
  const questionNumber = Number(question.numeroOriginal || index + 1);
  const currentRegex = questionMarkerRegex(questionNumber);
  const nextRegex = questionMarkerRegex(questionNumber + 1);
  const textContent = await page.getTextContent();
  const rows = [];

  (textContent?.items || []).forEach(item => {
    const text = String(item?.str || "").trim();
    if (!text) return;
    const y = itemCanvasY(item, viewport);
    const fontSize = estimatePdfFontSize(item);
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 6);
    if (!row) {
      row = { y, texts: [], fontSizes: [] };
      rows.push(row);
    }
    row.texts.push(text);
    row.fontSizes.push(fontSize);
  });

  const visualRows = rows
    .map(row => ({
      y: row.y,
      text: row.texts.join(" ").replace(/\s+/g, " ").trim(),
      fontSize: Math.max(...row.fontSizes)
    }))
    .filter(row => row.text)
    .sort((a, b) => a.y - b.y);

  const startRow = currentRegex ? visualRows.find(row => currentRegex.test(row.text)) : null;
  const nextRow = nextRegex ? visualRows.find(row => startRow && row.y > startRow.y + 12 && nextRegex.test(row.text)) : null;
  const top = startRow
    ? Math.max(0, Math.floor(startRow.y - OCR_VERTICAL_PADDING))
    : Math.floor(pageHeight * 0.08);
  const bottomCandidates = [
    nextRow ? nextRow.y - OCR_BOTTOM_PADDING : null,
    pageHeight * 0.92
  ].filter(value => Number.isFinite(value) && value > top + 80);
  const bottom = Math.min(pageHeight, Math.floor(Math.min(...bottomCandidates)));
  const cropRows = visualRows.filter(row => row.y >= top && row.y <= bottom);

  return {
    x: OCR_HORIZONTAL_PADDING,
    y: top,
    width: Math.max(80, pageWidth - (OCR_HORIZONTAL_PADDING * 2)),
    height: Math.max(80, bottom - top),
    foundStart: Boolean(startRow),
    foundEnd: Boolean(nextRow),
    questionNumber,
    sourceHints: classifySmallSourceRows(cropRows)
  };
}

async function renderQuestionRegionForOcr(pageNumber, question, index) {
  if (!state.pdfViewer.pdf) {
    throw new Error("Selecione um PDF antes de aplicar OCR.");
  }
  const safePage = Math.min(Math.max(Number(pageNumber) || 1, 1), state.pdfViewer.totalPages || 1);
  const page = await state.pdfViewer.pdf.getPage(safePage);
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = Math.floor(viewport.width);
  fullCanvas.height = Math.floor(viewport.height);
  const fullContext = fullCanvas.getContext("2d");
  await page.render({ canvasContext: fullContext, viewport }).promise;

  const crop = await findQuestionCropBox(page, viewport, question, index);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = crop.width;
  cropCanvas.height = crop.height;
  cropCanvas.getContext("2d").drawImage(
    fullCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return { canvas: cropCanvas, pageNumber: safePage, crop };
}

async function runOcrForQuestion(index) {
  const question = state.importedQuestions[index];
  if (!question) return;

  syncQuestionFromCard(index);
  const card = elements.listaImportada.querySelector(`[data-question-index="${index}"]`);
  const status = card?.querySelector("[data-ocr-status]");
  const suggestion = card?.querySelector("[data-ocr-suggestion]");
  const button = card?.querySelector("[data-ocr-question]");
  const pageNumber = Number(question.paginaOrigem || state.pdfViewer.currentPage || 1);
  const tesseract = getTesseractApi();

  if (!tesseract) {
    if (status) status.textContent = "OCR indisponivel. Verifique a conexao para carregar o Tesseract.js.";
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Rodando OCR...";
    }
    if (status) status.textContent = `Rodando OCR local na pagina ${pageNumber}...`;
    scrollPdfViewerToPage(pageNumber);

    const { canvas, crop } = await renderQuestionRegionForOcr(pageNumber, question, index);
    const result = await tesseract.recognize(canvas, "por", {
      logger: progress => {
        if (!status || progress?.status !== "recognizing text") return;
        const percent = Math.round((progress.progress || 0) * 100);
        status.textContent = `OCR na pagina ${pageNumber}: ${percent}%`;
      }
    });
    const parsedOcr = miniParseOcrResult(result?.data || {});
    (crop.sourceHints || []).forEach(line => {
      if (isStrongOcrSourceLine(line)) assignOcrSourceLine(parsedOcr, line, "image");
    });
    const text = parsedOcr.textoApoio || sanitizeOcrSupportCandidate(result?.data?.text || "");
    question.ocrSnapshotAntes = snapshotQuestionForOcr(question);
    question.ocrSugestaoTexto = text;
    question.ocrSugestaoEstruturada = parsedOcr;
    question.ocrPagina = pageNumber;
    question.ocrRecorte = crop;
    const applied = applyTrustedOcrImprovements(question, parsedOcr);
    question.ocrFeedback = applied.length ? "OCR aplicado com sucesso" : "OCR analisado";
    question.ocrDetalhesAbertos = false;

    if (suggestion) suggestion.value = text;
    if (status) status.textContent = question.ocrFeedback;
    renderImportPreview();
  } catch (error) {
    console.error("Erro ao aplicar OCR na questao", error);
    if (status) status.textContent = "Nao foi possivel aplicar OCR nesta questao.";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Aplicar OCR nesta questao";
    }
  }
}

function applyOcrSuggestionToQuestion(index, mode = "append") {
  const question = state.importedQuestions[index];
  const card = elements.listaImportada.querySelector(`[data-question-index="${index}"]`);
  const suggestionField = card?.querySelector("[data-ocr-suggestion]");
  const rawSuggestion = suggestionField?.value || question?.ocrSugestaoTexto || "";
  const suggestion = sanitizeOcrSupportCandidate(rawSuggestion);
  if (!question || !suggestion) return;

  if (suggestionField) {
    suggestionField.value = suggestion;
  }
  question.ocrSugestaoTexto = suggestion;
  const current = String(question.textoApoio || "").trim();
  question.textoApoio = mode === "replace"
    ? suggestion
    : [current, suggestion].filter(Boolean).join("\n\n");
  question.usarTextoApoio = true;
  question.ocrAplicadoEmTextoApoio = true;
  question.precisaRevisao = true;
  renderImportPreview();
}

function snapshotQuestionForOcr(question = {}) {
  return {
    instrucao: question.instrucao || "",
    textoApoio: question.textoApoio || "",
    usarTextoApoio: Boolean(question.usarTextoApoio),
    enunciado: question.enunciado || "",
    alternativas: JSON.parse(JSON.stringify(question.alternativas || [])),
    tipo: question.tipo || "",
    fonteTextoApoio: question.fonteTextoApoio || "",
    fonteImagemApoio: question.fonteImagemApoio || "",
    precisaRevisao: Boolean(question.precisaRevisao)
  };
}

function restoreQuestionFromOcrSnapshot(question, snapshot) {
  if (!question || !snapshot) return;
  question.instrucao = snapshot.instrucao || "";
  question.textoApoio = snapshot.textoApoio || "";
  question.usarTextoApoio = Boolean(snapshot.usarTextoApoio);
  question.enunciado = snapshot.enunciado || "";
  question.alternativas = JSON.parse(JSON.stringify(snapshot.alternativas || []));
  question.tipo = snapshot.tipo || question.tipo;
  question.fonteTextoApoio = snapshot.fonteTextoApoio || "";
  question.fonteImagemApoio = snapshot.fonteImagemApoio || "";
  question.precisaRevisao = Boolean(snapshot.precisaRevisao);
}

function applyTrustedOcrImprovements(question, suggestion = {}) {
  const applied = [];
  if (suggestion.instrucao && !String(question.instrucao || "").trim()) {
    question.instrucao = suggestion.instrucao;
    applied.push("instrucao");
  }
  if (suggestion.textoApoio) {
    const currentSupport = String(question.textoApoio || "").trim();
    if (ocrSupportLooksReliable(suggestion.textoApoio) && (!currentSupport || suggestion.textoApoio.length > currentSupport.length + 40 || (question.textoPossivelmenteTruncado && currentSupport.length < 120))) {
      question.textoApoio = suggestion.textoApoio;
      question.usarTextoApoio = true;
      applied.push("textoApoio");
    }
  }
  if (suggestion.enunciado) {
    const currentStatement = String(question.enunciado || "").trim();
    if (suggestion.enunciado.length >= 25 && (!currentStatement || currentStatement.length < 35 || suggestion.enunciado.length > currentStatement.length + 20 || looksAbruptStart(currentStatement) || looksCutSentence(currentStatement))) {
      question.enunciado = suggestion.enunciado;
      applied.push("enunciado");
    }
  }
  if (ocrSourceLooksReliable(suggestion.fonteTextoApoio) && !String(question.fonteTextoApoio || "").trim()) {
    question.fonteTextoApoio = suggestion.fonteTextoApoio;
    applied.push("fonteTextoApoio");
  }
  if (ocrSourceLooksReliable(suggestion.fonteImagemApoio) && !String(question.fonteImagemApoio || "").trim()) {
    question.fonteImagemApoio = suggestion.fonteImagemApoio;
    applied.push("fonteImagemApoio");
  }
  if (suggestion.alternativas?.length >= 2 && ocrAlternativesCompleteForCurrent(question, suggestion.alternativas)) {
    const currentAlternatives = question.alternativas || [];
    const missingAlternatives = currentAlternatives.length < suggestion.alternativas.length ||
      currentAlternatives.some(item => !(item?.texto || item?.imagemUrl || item?.imagem || "").trim());
    if (missingAlternatives) {
      question.alternativas = suggestion.alternativas.map((item, altIndex) => ({
        ...(currentAlternatives[altIndex] || {}),
        letra: item.letra || getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: item.texto,
        ordem: altIndex
      }));
      question.tipo = "multipla_texto";
      applied.push("alternativas");
    }
  }
  if (applied.length) {
    question.precisaRevisao = true;
    question.ocrAplicadoEstruturado = true;
  }
  return applied;
}

function undoOcrForQuestion(index) {
  const question = state.importedQuestions[index];
  if (!question?.ocrSnapshotAntes) return;
  restoreQuestionFromOcrSnapshot(question, question.ocrSnapshotAntes);
  question.ocrFeedback = "OCR desfeito";
  question.ocrAplicadoEstruturado = false;
  question.ocrSnapshotAntes = null;
  renderImportPreview();
}

function getOcrStructuredSuggestionFromCard(index) {
  const question = state.importedQuestions[index];
  const card = elements.listaImportada.querySelector(`[data-question-index="${index}"]`);
  const structured = {
    ...(question?.ocrSugestaoEstruturada || {})
  };
  card?.querySelectorAll("[data-ocr-field]").forEach(field => {
    structured[field.dataset.ocrField] = field.value.trim();
  });
  const alternativesText = card?.querySelector("[data-ocr-alternatives]")?.value || "";
  structured.alternativas = alternativesText
    .split("\n")
    .map((line, indexAlt) => {
      const match = ocrAlternativeMatch(line);
      return {
        letra: match?.[1]?.toUpperCase() || getAlternativeLabel(indexAlt),
        texto: (match?.[2] || line).trim(),
        ordem: indexAlt
      };
    })
    .filter(item => item.texto);
  structured.textoApoio = sanitizeOcrSupportCandidate(structured.textoApoio || "");
  structured.enunciado = normalizeOcrText(structured.enunciado || "").replace(/\n+/g, " ").trim();
  structured.instrucao = normalizeOcrText(structured.instrucao || "").replace(/\n+/g, " ").trim();
  structured.fonteTextoApoio = normalizeOcrText(structured.fonteTextoApoio || "");
  structured.fonteImagemApoio = normalizeOcrText(structured.fonteImagemApoio || "");
  return structured;
}

function applyOcrStructuredField(index, field, mode = "replace") {
  const question = state.importedQuestions[index];
  if (!question) return;
  const suggestion = getOcrStructuredSuggestionFromCard(index);

  if (field === "all") {
    if (suggestion.instrucao) question.instrucao = suggestion.instrucao;
    if (suggestion.textoApoio) {
      question.textoApoio = suggestion.textoApoio;
      question.usarTextoApoio = true;
    }
    if (suggestion.enunciado) question.enunciado = suggestion.enunciado;
    if (suggestion.fonteTextoApoio) question.fonteTextoApoio = suggestion.fonteTextoApoio;
    if (suggestion.fonteImagemApoio) question.fonteImagemApoio = suggestion.fonteImagemApoio;
    if (suggestion.alternativas?.length) {
      question.alternativas = suggestion.alternativas.map((item, altIndex) => ({
        ...(question.alternativas?.[altIndex] || {}),
        letra: item.letra || getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: item.texto,
        ordem: altIndex
      }));
      question.tipo = "multipla_texto";
    }
    question.ocrSugestaoEstruturada = suggestion;
    question.precisaRevisao = true;
    question.ocrAplicadoEstruturado = true;
    renderImportPreview();
    return;
  }

  if (field === "alternativas") {
    if (!suggestion.alternativas?.length) return;
    question.alternativas = suggestion.alternativas.map((item, altIndex) => ({
      ...(question.alternativas?.[altIndex] || {}),
      letra: item.letra || getAlternativeLabel(altIndex, question.formatoAlternativas),
      texto: item.texto,
      ordem: altIndex
    }));
    question.tipo = "multipla_texto";
  } else {
    const value = suggestion[field];
    if (!value) return;
    const current = String(question[field] || "").trim();
    question[field] = mode === "append" && current
      ? [current, value].join("\n\n")
      : value;
    if (field === "textoApoio") question.usarTextoApoio = true;
  }

  question.ocrSugestaoEstruturada = suggestion;
  question.precisaRevisao = true;
  question.ocrAplicadoEstruturado = true;
  renderImportPreview();
}

function revokePendingDocumentImages() {
  state.pendingDocumentImages = [];
  state.selectedPendingImageId = "";
}

async function runButtonFeedback(button, config, action) {
  const originalLabel = config.originalLabel || button?.textContent || "";
  setButtonState(button, config.loadingLabel || "Salvando...", true);

  try {
    const result = await action();
    setButtonState(button, config.successLabel || "Salvo âœ”", true);
    await wait(BUTTON_FEEDBACK_DELAY);
    if (button?.isConnected) {
      setButtonState(button, originalLabel, false);
    }
    return result;
  } catch (error) {
    setButtonState(button, config.errorLabel || "Erro âŒ", true);
    await wait(BUTTON_FEEDBACK_DELAY);
    if (button?.isConnected) {
      setButtonState(button, originalLabel, false);
    }
    throw error;
  }
}

function buildDescritorOptions(question) {
  return "<option value=\"\">Selecione</option>" + getDescritores(question.disciplina, question.anoEscolar)
    .map(item => `<option value="${item.codigo}" ${item.codigo === question.descritor ? "selected" : ""}>${item.codigo} - ${escapeHtml(item.nome)}</option>`)
    .join("");
}

function normalizeQuestionClassification(question) {
  const descritorValido = getDescritores(question.disciplina, question.anoEscolar)
    .some(item => item.codigo === question.descritor);

  if (!descritorValido) {
    question.descritor = "";
    question.descritorDescricao = "";
  } else {
    question.descritorDescricao = getDescritores(question.disciplina, question.anoEscolar)
      .find(item => item.codigo === question.descritor)?.nome || "";
  }

  question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
}

function syncAllQuestionsFromCards() {
  elements.listaImportada.querySelectorAll("[data-question-index]").forEach(card => {
    syncQuestionFromCard(Number(card.dataset.questionIndex));
  });
}

function applySuggestionToQuestion(index) {
  const question = state.importedQuestions[index];
  if (!question) return;
  const suggestion = getSuggestionData(question);
  if (!suggestion) return;

  question.disciplina = suggestion.disciplinaSugerida || question.disciplina || "";
  question.anoEscolar = suggestion.anoEscolarSugerido || question.anoEscolar || "";
  question.conteudo = suggestion.conteudoSugerido || suggestion.conteudo || question.conteudo || "";
  question.descritor = suggestion.descritorSugerido || suggestion.descritor || question.descritor || "";
  question.habilidade_bncc = suggestion.habilidadeBncc || suggestion.habilidade_bncc || suggestion.habilidade || question.habilidade_bncc || "";
  question.nivelDificuldade = suggestion.dificuldadeSugerida || suggestion.dificuldade || question.nivelDificuldade || "";
  question.confianca_classificacao = suggestion.confianca || question.confianca_classificacao || "baixa";
  question.justificativa_classificacao = suggestion.justificativa || question.justificativa_classificacao || "";
  normalizeQuestionClassification(question);
  question.classificacao_confirmada = false;
}

function associateSelectedImageToSupport(questionIndex) {
  const selected = getSelectedPendingImage();
  const question = state.importedQuestions[questionIndex];
  if (!selected || !question) return;
  const image = removePendingImageById(selected.id);
  if (!image) return;
  question.imagensApoio = [...(question.imagensApoio || []), image.dataUrl];
  question.usarImagensApoio = true;
}

function associateSelectedImageToAlternative(questionIndex, altIndex) {
  const selected = getSelectedPendingImage();
  const question = state.importedQuestions[questionIndex];
  if (!selected || !question) return;
  const image = removePendingImageById(selected.id);
  if (!image) return;

  question.tipo = "multipla_imagem";
  question.respostaEsperada = "";
  const alternatives = [...(question.alternativas || [])];
  while (alternatives.length <= altIndex) {
    alternatives.push({
      letra: getAlternativeLabel(alternatives.length, question.formatoAlternativas),
      texto: "",
      imagemUrl: "",
      correta: false,
      ordem: alternatives.length
    });
  }
  alternatives[altIndex] = {
    ...alternatives[altIndex],
    letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
    texto: "",
    imagemUrl: image.dataUrl,
    ordem: altIndex
  };
  question.alternativas = alternatives;
}

function removeQuestionImagesToPending(questionIndex) {
  const question = state.importedQuestions[questionIndex];
  if (!question) return;

  (question.imagensApoio || []).forEach((url, index) => {
    addPendingImage({
      nome: `apoio-questao-${questionIndex + 1}-${index + 1}.png`,
      origem: "question-support",
      dataUrl: url
    });
  });
  question.imagensApoio = [];
  question.usarImagensApoio = false;

  question.alternativas = (question.alternativas || []).map((item, index) => {
    if (item?.imagemUrl) {
      addPendingImage({
        nome: `alternativa-${questionIndex + 1}-${getAlternativeLabel(index, question.formatoAlternativas)}.png`,
        origem: "question-alternative",
        dataUrl: item.imagemUrl
      });
    }
    return {
      ...item,
      imagemUrl: "",
      texto: question.tipo === "multipla_imagem" ? "" : item?.texto || ""
    };
  });

  if (question.tipo === "multipla_imagem" && !(question.alternativas || []).some(item => item?.imagemUrl)) {
    question.tipo = "multipla_texto";
  }
}

function applyGlobalFieldToQuestions(field, value) {
  if (!state.importedQuestions.length) return;
  syncAllQuestionsFromCards();

  state.importedQuestions = state.importedQuestions.map(question => {
    const next = {
      ...question,
      [field]: value
    };
    normalizeQuestionClassification(next);
    return next;
  });

  renderImportPreview();
}

function getSuggestionData(question) {
  return question.classificacaoLocalSugestao || {};
}

function getCurrentSharedBlockData() {
  if (!shouldUseSharedBlock()) return null;
  const first = state.importedQuestions[0] || {};
  const sharedText = elements.sharedBlockText.value.trim() || first.blocoTextoApoio || first.textoApoio || state.parseInfo.textoBaseDetectado || "";
  if (!sharedText) return null;

  return {
    blocoId: first.blocoId || "",
    titulo: first.blocoTitulo || elements.titulo.value.trim() || state.parseInfo.tituloDetectado || "Bloco de apoio",
    textoApoio: sharedText,
    fonteTextoApoio: first.blocoFonteTextoApoio || first.fonteTextoApoio || "",
    imagemApoio: first.blocoImagemApoio || first.imagemApoio || "",
    fonteImagemApoio: first.blocoFonteImagemApoio || first.fonteImagemApoio || "",
    imagensApoio: state.importedQuestions.find(question => (question.imagensApoio || []).length)?.imagensApoio || [],
    origemDeteccao: first.blocoOrigemDeteccao || "apoio_compartilhado"
  };
}

function getMainTags(question) {
  return [
    question.descritor,
    question.bncc_sugerido,
    question.conteudo,
    question.generoTextual,
    question.nivelDificuldade
  ].filter(Boolean).slice(0, 5);
}

function buildLocalSuggestion(question) {
  const structuredQuestion = {
    instrucao: question.instrucao || "",
    textoApoio: question.textoApoio || "",
    enunciado: question.enunciado || "",
    alternativas: (question.alternativas || []).map(item => ({
      texto: typeof item === "string" ? item : item?.texto || ""
    }))
  };
  const sugestao = suggestQuestionClassification(structuredQuestion);
  return {
    ...sugestao,
    disciplinaSugerida: question.disciplina || "",
    anoEscolarSugerido: question.anoEscolar || "",
    conteudoSugerido: sugestao.conteudo || "",
    descritorSugerido: sugestao.descritor || "",
    habilidadeBncc: sugestao.habilidadeBncc || "",
    dificuldadeSugerida: sugestao.dificuldade || "",
    confirmadoAutomaticamente: false
  };
}

function getSourceLabelFromOrigin(origem) {
  if (origem === "pdf_extraido") return "arquivo PDF";
  if (origem === "docx_extraido") return "arquivo DOCX";
  return state.mode === "individual" ? "questao individual" : state.mode === "bloco" ? "bloco com texto base" : "texto bruto";
}

function refreshQuestionSuggestion(question) {
  question.classificacaoLocalSugestao = buildLocalSuggestion(question);
  return question;
}

function clearImportedClassificationSuggestion(question) {
  question.classificacaoLocalSugestao = null;
  question.classificacaoSugestao = null;
  question.descritorSugestaoIA = null;
  question.descritorSugerido = "";
  question.confianca_classificacao = "";
  question.justificativa_classificacao = "";
  return question;
}

function classifyQuestionAfterReview(index) {
  syncQuestionFromCard(index);
  const question = state.importedQuestions[index];
  if (!question) return;
  refreshQuestionSuggestion(question);
  showFeedback(elements.feedback, "success", "Classificacao sugerida. Revise antes de salvar.");
  renderImportPreview();
}

function classifyReadyQuestionsAfterReview() {
  syncAllQuestionsFromCards();
  const readyQuestions = state.importedQuestions
    .map((question, index) => ({ question, index }))
    .filter(item => isQuestionReadyForClassification(item.question));

  if (!readyQuestions.length) {
    showFeedback(elements.feedback, "warning", "Confirme pelo menos uma questao pronta antes de classificar.");
    return;
  }

  readyQuestions.forEach(({ question }) => {
    refreshQuestionSuggestion(question);
  });
  showFeedback(elements.feedback, "success", `${readyQuestions.length} questao(oes) classificada(s). Revise as sugestoes antes de salvar.`);
  renderImportPreview();
}

function applyDocumentImageHints(question) {
  question.imagemProvavel = Boolean(question.imagemProvavel || detectQuestionImageProbability(question));
  if (question.imagemProvavel) {
    question.imagemApoio = question.imagemApoio || "[imagem aqui]";
    if (!question.textoApoio && question.fonteTextoApoio && !question.fonteImagemApoio) {
      question.fonteImagemApoio = question.fonteTextoApoio;
      question.fonteTextoApoio = "";
    }
  }
  return question;
}

function normalizeAssociationText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferQuestionPage(question, pages = []) {
  const candidates = [
    question.textoApoio,
    question.enunciado,
    ...(question.alternativas || []).map(item => typeof item === "string" ? item : item?.texto || "")
  ]
    .filter(Boolean)
    .map(normalizeAssociationText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const probe = candidate.slice(0, Math.min(candidate.length, 90)).trim();
    if (!probe) continue;
    const pageMatch = (pages || []).find(page => normalizeAssociationText(page.texto).includes(probe));
    if (pageMatch) {
      return pageMatch.pagina;
    }
  }

  return null;
}

function markAutomaticImageReview(question, message) {
  question.precisaRevisao = true;
  question.importWarnings = Array.isArray(question.importWarnings) ? question.importWarnings : [];
  if (!question.importWarnings.includes(message)) {
    question.importWarnings.push(message);
  }
}

function getPdfImageEvidencePages(pages = []) {
  const evidence = new Set();
  (pages || []).forEach(page => {
    const pageNumber = Number(page?.pagina || page?.page || 0);
    if (pageNumber && (page.hasImage || page.imagemProvavel || page.imageDecodeError || (page.imageDecodeErrors || []).length)) {
      evidence.add(pageNumber);
    }
    (page.imageEvidencePages || []).forEach(item => {
      const evidencePage = Number(item);
      if (evidencePage) evidence.add(evidencePage);
    });
  });
  return evidence;
}

function collectPdfImageNamesFromDiagnostics(value, seen = new Set()) {
  const imageNames = new Set();

  const visit = item => {
    if (item == null) return;
    if (typeof File !== "undefined" && item instanceof File) return;
    if (typeof Blob !== "undefined" && item instanceof Blob) return;

    if (typeof item === "string") {
      const matches = item.matchAll(/\bimg_p(\d+)_\d+\b/gi);
      for (const match of matches) {
        imageNames.add(match[0]);
      }
      return;
    }

    if (typeof item === "number" || typeof item === "boolean") return;
    if (typeof item?.message === "string") visit(item.message);

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    if (typeof item === "object") {
      if (seen.has(item)) return;
      seen.add(item);
      Object.entries(item).forEach(([key, next]) => {
        if (/^(?:arquivo|file|blob)$/i.test(key)) return;
        if (/dataUrl|imagemUrl|imagensApoio|alternativas/i.test(key)) return;
        visit(next);
      });
    }
  };

  visit(value);
  return [...imageNames];
}

function addPdfImageNamePagesToSet(paginasComImagem, imageNamesFound = []) {
  imageNamesFound.forEach(name => {
    const match = String(name || "").match(/\bimg_p(\d+)_/i);
    if (!match) return;
    paginasComImagem.add(Number(match[1]) + 1);
  });
}

function applyPageImageEvidence(question, imageEvidencePages) {
  const pageNumber = Number(question?.paginaOrigem || 0);
  if (!pageNumber || !imageEvidencePages.has(pageNumber)) return;
  question.imagemProvavel = true;
  question.imagemApoio = question.imagemApoio || "[imagem aqui]";
  if (!question.textoApoio && question.fonteTextoApoio && !question.fonteImagemApoio) {
    question.fonteImagemApoio = question.fonteTextoApoio;
    question.fonteTextoApoio = "";
  }
}

function autoAssociateImagesForQuestion(question, imagePool, pagePreference = null) {
  if (!question) return;

  const hint = detectQuestionImageProbability(question);
  const matchingPool = pagePreference
    ? imagePool.filter(image => Number(image.pagina) === Number(pagePreference))
    : imagePool;

  if (!matchingPool.length) return;

  const hasFourAlternatives = (question.alternativas || []).length >= 4;
  if (hasFourAlternatives && matchingPool.length >= 4) {
    const selected = matchingPool.slice(0, 4);
    selected.forEach(image => {
      removePendingImageById(image.id);
    });
    question.tipo = "multipla_imagem";
    question.alternativas = selected.map((image, index) => ({
      letra: getAlternativeLabel(index, question.formatoAlternativas),
      texto: question.alternativas?.[index]?.texto || "",
      imagemUrl: image.dataUrl,
      correta: String(question.respostaCorreta) === String(index),
      ordem: index
    }));
    question.imagemProvavel = true;
    markAutomaticImageReview(question, "Imagens associadas automaticamente as alternativas. Revise antes de salvar.");
    return;
  }

  if (hint) {
    const [firstImage] = matchingPool;
    removePendingImageById(firstImage.id);
    question.imagensApoio = [...(question.imagensApoio || []), firstImage.dataUrl];
    question.usarImagensApoio = true;
    question.imagemProvavel = true;
    markAutomaticImageReview(question, "Imagem de apoio associada automaticamente. Revise antes de salvar.");
  }
}

function applyAutomaticImageAssociations(questions = []) {
  ensurePendingImageIds();
  const pages = state.importedDocument?.pages || [];
  const paginasComImagem = getPdfImageEvidencePages(pages);

  questions.forEach(questao => {
    const pageNumber = inferQuestionPage(questao, pages);
    questao.paginaOrigem = pageNumber || questao.paginaOrigem || null;
    const imageNamesFound = collectPdfImageNamesFromDiagnostics({
      importedDocument: state.importedDocument,
      pdfDiagnostics: state.importedDocument?.pdfDiagnostics,
      imageDecodeErrors: state.importedDocument?.imageDecodeErrors,
      textoBruto: state.importedDocument?.textoBruto,
      textoExtraido: state.importedDocument?.textoExtraido,
      pages,
      questao,
      textoBrutoAtual: elements.textoBruto?.value || "",
      parserSnapshot: state.parserSnapshot
    });
    addPdfImageNamePagesToSet(paginasComImagem, imageNamesFound);
    applyPageImageEvidence(questao, paginasComImagem);
    autoAssociateImagesForQuestion(questao, state.pendingDocumentImages, pageNumber);
    applyPageImageEvidence(questao, paginasComImagem);
    applyDocumentImageHints(questao);
  });

  if (!state.selectedPendingImageId) {
    state.selectedPendingImageId = state.pendingDocumentImages[0]?.id || "";
  }
}

function isSuggestionApplied(question) {
  const suggestion = getSuggestionData(question);
  if (!suggestion) return false;
  return (
    (suggestion.conteudoSugerido || suggestion.conteudo || "") === (question.conteudo || "") &&
    (suggestion.descritorSugerido || suggestion.descritor || "") === (question.descritor || "") &&
    (suggestion.habilidadeBncc || suggestion.habilidade_bncc || suggestion.habilidade || "") === (question.habilidade_bncc || "") &&
    (suggestion.dificuldadeSugerida || suggestion.dificuldade || "") === (question.nivelDificuldade || "")
  );
}

function getAlternativeRows(question) {
  const source = (question.alternativas || []).length
    ? question.alternativas
    : Array.from({ length: 4 }, () => ({ texto: "", imagemUrl: "" }));

  return source.map((item, index) => ({
    index,
    label: item?.letra || getAlternativeLabel(index, question.formatoAlternativas),
    texto: typeof item === "string" ? item : item?.texto || "",
    imagemUrl: typeof item === "object" ? item?.imagemUrl || item?.imagem || "" : "",
    correta: String(question.respostaCorreta) === String(index) || item?.correta
  }));
}

function ensurePendingImageIds() {
  state.pendingDocumentImages = (state.pendingDocumentImages || []).map((image, index) => ({
    id: image.id || `pending-image-${Date.now()}-${index}`,
    ...image
  }));
}

function getSelectedPendingImage() {
  ensurePendingImageIds();
  return state.pendingDocumentImages.find(image => image.id === state.selectedPendingImageId) || null;
}

function removePendingImageById(imageId) {
  const index = state.pendingDocumentImages.findIndex(image => image.id === imageId);
  if (index === -1) return null;
  const [image] = state.pendingDocumentImages.splice(index, 1);
  if (state.selectedPendingImageId === imageId) {
    state.selectedPendingImageId = state.pendingDocumentImages[0]?.id || "";
  }
  return image;
}

function addPendingImage(image) {
  if (!image?.dataUrl) return;
  ensurePendingImageIds();
  state.pendingDocumentImages.push({
    id: `pending-image-${Date.now()}-${state.pendingDocumentImages.length}`,
    nome: image.nome || `imagem-${state.pendingDocumentImages.length + 1}.png`,
    pagina: image.pagina || null,
    origem: image.origem || "manual",
    dataUrl: image.dataUrl
  });
  if (!state.selectedPendingImageId) {
    state.selectedPendingImageId = state.pendingDocumentImages[state.pendingDocumentImages.length - 1]?.id || "";
  }
}

function renderPendingImagesPanel() {
  ensurePendingImageIds();
  if (!elements.pendingImagesPanel) return;

  if (!state.pendingDocumentImages.length) {
    elements.pendingImagesPanel.hidden = true;
    elements.pendingImagesList.innerHTML = "";
    elements.pendingImagesInfo.textContent = "Nenhuma imagem pendente.";
    return;
  }

  if (!getSelectedPendingImage()) {
    state.selectedPendingImageId = state.pendingDocumentImages[0]?.id || "";
  }

  elements.pendingImagesPanel.hidden = false;
  elements.pendingImagesInfo.textContent = `${state.pendingDocumentImages.length} imagem(ns) pendente(s).`;
  elements.pendingImagesList.innerHTML = state.pendingDocumentImages.map(image => `
    <article class="review-gallery-item ${image.id === state.selectedPendingImageId ? "is-selected" : ""}" data-pending-image-id="${image.id}">
      <img src="${image.dataUrl}" alt="${escapeHtml(image.nome || "Imagem extraida")}">
      <div class="context-note">${escapeHtml(image.nome || "Imagem extraida")}${image.pagina ? ` - pagina ${image.pagina}` : ""}</div>
      <div class="review-gallery-actions">
        <button type="button" class="button-inline ${image.id === state.selectedPendingImageId ? "button-success" : "button-outline"}" data-select-pending-image="${image.id}">
          ${image.id === state.selectedPendingImageId ? "Selecionada" : "Selecionar"}
        </button>
      </div>
    </article>
  `).join("");
}

function renderImageAssociationButtons(index) {
  const hasSelectedImage = Boolean(getSelectedPendingImage());
  return `
    <div class="review-association-row">
      <button type="button" class="button-inline button-outline" data-associate-support-image="${index}" ${hasSelectedImage ? "" : "disabled"}>
        Associar imagem de apoio
      </button>
      <button type="button" class="button-inline button-outline" data-associate-alt-image="${index}" data-alt-target="0" ${hasSelectedImage ? "" : "disabled"}>
        Associar imagem a alternativa A
      </button>
      <button type="button" class="button-inline button-outline" data-associate-alt-image="${index}" data-alt-target="1" ${hasSelectedImage ? "" : "disabled"}>
        Associar imagem a alternativa B
      </button>
      <button type="button" class="button-inline button-outline" data-associate-alt-image="${index}" data-alt-target="2" ${hasSelectedImage ? "" : "disabled"}>
        Associar imagem a alternativa C
      </button>
      <button type="button" class="button-inline button-outline" data-associate-alt-image="${index}" data-alt-target="3" ${hasSelectedImage ? "" : "disabled"}>
        Associar imagem a alternativa D
      </button>
      <button type="button" class="button-inline button-danger" data-remove-question-images="${index}">
        Remover imagem
      </button>
    </div>
  `;
}

function renderQuestionOcrPanel(question, index) {
  if (!state.importedDocument?.arquivo || !/\.pdf$/i.test(state.importedDocument.nome || "")) return "";

  const structured = question.ocrSugestaoEstruturada || {};
  const suggestion = structured.textoApoio || question.ocrSugestaoTexto || "";
  const alternativesText = (structured.alternativas || [])
    .map((item, altIndex) => `${item.letra || getAlternativeLabel(altIndex)}. ${item.texto || ""}`.trim())
    .join("\n");
  const hasDetails = Boolean(suggestion || structured.enunciado || structured.instrucao || structured.alternativas?.length || structured.fonteTextoApoio || structured.fonteImagemApoio);
  const detailsOpen = Boolean(question.ocrDetalhesAbertos);

  return `
    <div class="review-ocr-panel">
      <div class="review-toolbar">
        <button type="button" class="button-inline button-outline" data-ocr-question="${index}" ${state.pdfViewer.pdf ? "" : "disabled"}>
          Aplicar OCR nesta questao
        </button>
        ${question.ocrSnapshotAntes ? `<button type="button" class="button-inline button-outline" data-ocr-undo="${index}">Desfazer OCR</button>` : ""}
        ${hasDetails ? `<button type="button" class="button-inline button-outline" data-ocr-toggle-details="${index}">${detailsOpen ? "Ocultar detalhes do OCR" : "Ver detalhes do OCR"}</button>` : ""}
      </div>
      <div class="context-note" data-ocr-status>${escapeHtml(question.ocrFeedback || "")}</div>
      <div class="review-ocr-details" ${detailsOpen ? "" : "hidden"}>
        <div class="review-toolbar">
          <button type="button" class="button-inline button-outline" data-ocr-apply-all="${index}">
            Aplicar campos sugeridos
          </button>
        </div>
        <div class="review-ocr-grid">
        <div class="form-field">
          <label>Instrucao OCR</label>
          <textarea data-ocr-field="instrucao" class="small-textarea" placeholder="Instrucao detectada">${escapeHtml(structured.instrucao || "")}</textarea>
          <button type="button" class="button-inline button-outline" data-ocr-apply-field="instrucao" data-ocr-index="${index}">Aplicar instrucao</button>
        </div>
        <div class="form-field">
          <label>Texto de apoio OCR</label>
          <textarea data-ocr-field="textoApoio" data-ocr-suggestion="${index}" class="small-textarea" placeholder="Texto de apoio detectado">${escapeHtml(suggestion)}</textarea>
          <div class="review-gallery-actions">
            <button type="button" class="button-inline button-outline" data-ocr-append-support="${index}">Adicionar ao texto de apoio</button>
            <button type="button" class="button-inline button-outline" data-ocr-replace-support="${index}">Substituir texto de apoio</button>
          </div>
        </div>
        <div class="form-field">
          <label>Enunciado OCR</label>
          <textarea data-ocr-field="enunciado" class="small-textarea" placeholder="Enunciado detectado">${escapeHtml(structured.enunciado || "")}</textarea>
          <button type="button" class="button-inline button-outline" data-ocr-apply-field="enunciado" data-ocr-index="${index}">Aplicar enunciado</button>
        </div>
        <div class="form-field">
          <label>Alternativas OCR</label>
          <textarea data-ocr-alternatives="${index}" class="small-textarea" placeholder="A. alternativa">${escapeHtml(alternativesText)}</textarea>
          <button type="button" class="button-inline button-outline" data-ocr-apply-field="alternativas" data-ocr-index="${index}">Aplicar alternativas</button>
        </div>
        <div class="form-field">
          <label>Fonte texto OCR</label>
          <textarea data-ocr-field="fonteTextoApoio" class="small-textarea" placeholder="Fonte do texto">${escapeHtml(structured.fonteTextoApoio || "")}</textarea>
          <button type="button" class="button-inline button-outline" data-ocr-apply-field="fonteTextoApoio" data-ocr-index="${index}">Aplicar fonte</button>
        </div>
        <div class="form-field">
          <label>Fonte imagem OCR</label>
          <textarea data-ocr-field="fonteImagemApoio" class="small-textarea" placeholder="Fonte da imagem">${escapeHtml(structured.fonteImagemApoio || "")}</textarea>
          <button type="button" class="button-inline button-outline" data-ocr-apply-field="fonteImagemApoio" data-ocr-index="${index}">Aplicar fonte da imagem</button>
        </div>
        </div>
      </div>
    </div>
  `;
}

function hasSupportImages(question) {
  return Boolean((question.imagensApoio || []).length);
}

function hasSupportText(question) {
  return Boolean((question.textoApoio || "").trim());
}

function hasSupportImagePlaceholder(question) {
  return Boolean((question.imagemApoio || "").trim());
}

function renderInstructionField(question) {
  if (!(question.instrucao || "").trim()) return "";
  return `
    <div class="form-field review-large-field review-order-instruction">
      <label>Leia / instrucao</label>
      <textarea data-field="instrucao">${escapeHtml(question.instrucao || "")}</textarea>
    </div>
  `;
}

function renderSupportTextField(question, index) {
  if (shouldUseSharedBlock()) {
    return "";
  }
  const open = Boolean(question.usarTextoApoio || hasSupportText(question));
  return `
    <div class="form-field review-large-field review-order-support-text" data-support-text-wrapper="${index}" ${open ? "" : "hidden"}>
      <label>Texto de apoio</label>
      <textarea data-field="textoApoio">${escapeHtml(question.textoApoio || "")}</textarea>
    </div>
  `;
}

function renderSupportTextSourceField(question) {
  if (!(question.fonteTextoApoio || "").trim()) return "";
  return `
    <div class="form-field review-large-field review-order-support-text-source">
      <label>Fonte do texto de apoio</label>
      <textarea data-field="fonteTextoApoio" class="small-textarea">${escapeHtml(question.fonteTextoApoio || "")}</textarea>
    </div>
  `;
}

function renderTextAlternativeRows(question, index) {
  const rows = getAlternativeRows(question);
  if (!rows.length) {
    return "<div class=\"helper-box\">Nenhuma alternativa encontrada.</div>";
  }

  return `
    <div class="review-alternatives" data-alt-text-list="${index}">
      ${rows.map(row => `
        <label class="review-alt-row">
          <input type="radio" name="correctAlternative-${index}" value="${row.index}" ${row.correta ? "checked" : ""}>
          <span class="review-alt-label">${escapeHtml(row.label)}</span>
          <input type="text" data-alt-text="${row.index}" value="${escapeHtml(row.texto)}" placeholder="Texto da alternativa">
        </label>
      `).join("")}
    </div>
  `;
}

function renderImageAlternativeRows(question, index) {
  const rows = getAlternativeRows(question);
  if (!rows.length) {
    return "<div class=\"helper-box\">Nenhuma imagem de alternativa encontrada.</div>";
  }

  return `
    <div class="review-alternatives" data-alt-image-list="${index}">
      ${rows.map(row => `
        <div class="review-alt-row">
          <input type="radio" name="correctAlternative-${index}" value="${row.index}" ${row.correta ? "checked" : ""}>
          <span class="review-alt-label">${escapeHtml(row.label)}</span>
          <div class="review-upload-panel review-paste-zone" data-alt-image-paste-zone="${index}" data-alt-index="${row.index}" tabindex="0" aria-label="Imagem da alternativa ${escapeHtml(row.label)} da questao ${index + 1}">
            ${row.imagemUrl ? `
              <div class="review-preview-grid">
                <div class="review-preview-card">
                  <img src="${row.imagemUrl}" alt="Alternativa ${escapeHtml(row.label)}">
                  <button type="button" class="button-inline button-danger" data-remove-alt-image="${index}" data-alt-index="${row.index}">Remover imagem</button>
                </div>
              </div>
            ` : "<div class=\"helper-box\">[imagem aqui]</div>"}
            <div class="review-upload-actions">
              <input type="file" accept="image/*" data-alt-image-upload="${index}" data-alt-index="${row.index}">
              <input type="hidden" data-alt-image-url="${row.index}" value="${escapeHtml(row.imagemUrl)}">
            </div>
            <div class="muted-small" data-alt-image-paste-status="${index}-${row.index}" hidden></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSupportImageField(question, index) {
  const open = Boolean(question.usarImagensApoio || hasSupportImages(question) || hasSupportImagePlaceholder(question));
  return `
    <div class="form-field review-large-field review-order-support-image" data-support-image-wrapper="${index}" ${open ? "" : "hidden"}>
      <label>Imagem de apoio</label>
      <div class="review-upload-panel review-paste-zone" data-support-image-paste-zone="${index}" tabindex="0" aria-label="Imagem de apoio da questao ${index + 1}">
        ${hasSupportImagePlaceholder(question) ? `<div class="helper-box">${escapeHtml(question.imagemApoio)}</div>` : ""}
        ${(question.imagensApoio || []).length ? `
          <div class="review-preview-grid">
            ${(question.imagensApoio || []).map((url, imageIndex) => `
              <div class="review-preview-card">
                <img src="${url}" alt="Imagem de apoio ${imageIndex + 1}">
                <button type="button" class="button-inline button-danger" data-remove-support-image="${index}" data-image-index="${imageIndex}">Remover</button>
              </div>
            `).join("")}
          </div>
        ` : "<div class=\"helper-box\">Nenhuma imagem de apoio detectada.</div>"}
        <div class="review-upload-actions">
          <input type="file" accept="image/*" multiple data-support-image-upload="${index}">
        </div>
        <div class="muted-small" data-support-image-paste-status="${index}" hidden></div>
      </div>
    </div>
  `;
}

function renderSupportImageSourceField(question) {
  if (!(question.fonteImagemApoio || "").trim() && !hasSupportImagePlaceholder(question)) return "";
  return `
    <div class="form-field review-large-field review-order-support-image-source">
      <label>Fonte da imagem de apoio</label>
      <textarea data-field="fonteImagemApoio" class="small-textarea">${escapeHtml(question.fonteImagemApoio || "")}</textarea>
    </div>
  `;
}

function renderReviewToggleButtons(question, index) {
  const supportTextOpen = shouldUseSharedBlock() ? true : Boolean(question.usarTextoApoio || hasSupportText(question));
  const supportImageOpen = Boolean(question.usarImagensApoio || hasSupportImages(question) || hasSupportImagePlaceholder(question));
  const imageChoiceOpen = question.tipo === "multipla_imagem";
  return `
    <div class="review-toggle-row">
      ${shouldUseSharedBlock() ? "" : `
        <button type="button" class="button-inline button-outline review-toggle-button" data-toggle-support-text="${index}">
          ${supportTextOpen ? "Ocultar texto de apoio" : "Usar texto de apoio"}
        </button>
      `}
      <button type="button" class="button-inline button-outline review-toggle-button" data-toggle-support-images="${index}">
        ${supportImageOpen ? "Ocultar imagem de apoio" : "Usar imagem de apoio"}
      </button>
      <button type="button" class="button-inline button-outline review-toggle-button" data-toggle-image-choice="${index}">
        ${imageChoiceOpen ? "Usar alternativas em texto" : "Usar multipla escolha com imagens"}
      </button>
    </div>
  `;
}

function getGabaritoLabel(question) {
  if (question.gabaritoOriginal) {
    return question.gabaritoOriginal;
  }

  if (question.tipo === "resposta_escrita") {
    return question.respostaEsperada || "Nao informado";
  }

  const row = getAlternativeRows(question).find(item => String(item.index) === String(question.respostaCorreta));
  return row?.label || "Nao informado";
}

function renderClassificationSummary(question, index) {
  const suggestion = getSuggestionData(question);
  const hasSuggestion = Boolean(suggestion && (suggestion.conteudoSugerido || suggestion.descritorSugerido || suggestion.habilidadeBncc || suggestion.dificuldadeSugerida || suggestion.justificativa));
  if (!hasSuggestion) {
    return `
      <div class="review-summary-box">
        <div class="review-toolbar">
          <button type="button" class="button-inline button-outline" data-classify-question="${index}">
            Classificar questao
          </button>
        </div>
      </div>
    `;
  }

  const bncc = suggestion.bnccSugerida || suggestion.codigo_bncc || question.bncc_sugerido || "Nao informado";
  const habilidade = suggestion.habilidadeBncc || suggestion.habilidade_bncc || suggestion.habilidade || question.habilidade_bncc || "Nao informada";
  const descritor = suggestion.descritorSugerido || suggestion.descritor || question.descritor || "Nao informado";
  const conteudo = suggestion.conteudoSugerido || suggestion.conteudo || question.conteudo || "Nao informado";
  const categoria = suggestion.categoriaSugerida || suggestion.categoria || question.categoria_bncc || "Nao informada";
  const dificuldade = suggestion.dificuldadeSugerida || suggestion.dificuldade || question.nivelDificuldade || "Nao informada";
  const confianca = suggestion.confianca || question.confianca_classificacao || "baixa";
  const justificativa = suggestion.justificativa || question.justificativa_classificacao || "Sem justificativa.";
  const disciplina = suggestion.disciplinaSugerida || question.disciplina || "Nao informada";
  const anoEscolar = suggestion.anoEscolarSugerido || question.anoEscolar || "Nao informado";
  const buttonLabel = isSuggestionApplied(question) ? "Sugestao aplicada" : "Confirmar sugestao";

  return `
    <div class="review-summary-box">
      <strong>Sugestao local de classificacao</strong>
      <div class="review-summary-grid">
        <div class="review-summary-item"><strong>Disciplina</strong><span>${escapeHtml(getDisciplineLabel(disciplina, disciplina))}</span></div>
        <div class="review-summary-item"><strong>Ano escolar</strong><span>${escapeHtml(getYearLabel(anoEscolar, anoEscolar))}</span></div>
        <div class="review-summary-item"><strong>Conteudo sugerido</strong><span>${escapeHtml(conteudo)}</span></div>
        <div class="review-summary-item"><strong>Descritor sugerido</strong><span>${escapeHtml(descritor)}</span></div>
        <div class="review-summary-item"><strong>Habilidade sugerida</strong><span>${escapeHtml(habilidade)}</span></div>
        <div class="review-summary-item"><strong>Dificuldade sugerida</strong><span>${escapeHtml(dificuldade)}</span></div>
        <div class="review-summary-item"><strong>Confianca</strong><span>${escapeHtml(confianca)}</span></div>
      </div>
      <div class="muted-small">Justificativa: ${escapeHtml(justificativa)}</div>
      <div class="muted-small">Categoria observada: ${escapeHtml(categoria)} | BNCC atual: ${escapeHtml(bncc)}</div>
      <div class="review-toolbar">
        <button type="button" class="button-inline button-outline" data-classify-question="${index}">
          Reclassificar questao
        </button>
        <button type="button" class="button-inline ${isSuggestionApplied(question) ? "button-success" : "button-outline"}" data-apply-suggestion="${index}">
          ${buttonLabel}
        </button>
      </div>
    </div>
  `;
}

function getQuestionAlerts(question) {
  const alerts = new Set(Array.isArray(question.importWarnings) ? question.importWarnings : []);

  if (!question.enunciado.trim()) {
    alerts.add("enunciado ausente");
  }

  if (question.tipo === "resposta_escrita") {
    if (!question.respostaEsperada.trim()) {
      alerts.add("resposta correta ausente");
    }
  } else {
    if ((question.alternativas || []).length < 2) {
      alerts.add("alternativas ausentes");
    }
    if (question.temAlternativaVazia) {
      alerts.add("alternativa vazia");
    }
    if (question.temImagemAlternativaAusente) {
      alerts.add("imagem de alternativa ausente");
    }
    if (question.respostaCorreta === "") {
      alerts.add("resposta correta ausente");
    }
  }

  if (question.usarImagensApoio && !(question.imagensApoio || []).length) {
    alerts.add("imagem de apoio ausente");
  }

  return [...alerts];
}

function renderQuestionAlerts(question) {
  const alerts = getQuestionAlerts(question);
  if (!alerts.length) return "";

  return `
    <div class="feedback feedback-warning" data-question-alerts>
      ${alerts.map(alert => `<div>${escapeHtml(alert)}</div>`).join("")}
    </div>
  `;
}

function renderReadOnlyValue(value, fallback = "Nao informado") {
  return value ? escapeHtml(value) : `<span class="review-empty-value">${escapeHtml(fallback)}</span>`;
}

function renderQuestionHeaderSummary(question, index) {
  const tipoLabel = question.tipo === "resposta_escrita" ? "resposta_escrita" : question.tipo === "multipla_imagem" ? "multipla_imagem" : "multipla_texto";
  const gabarito = getGabaritoLabel(question);
  const precisaRevisao = question.precisaRevisao
    ? `<span class="review-flag review-flag-warning">Precisa revisao</span>`
    : `<span class="review-flag review-flag-success">Revisao ok</span>`;

  return `
    <div class="review-summary-box">
      <div class="review-summary-grid">
        <div class="review-summary-item">
          <strong>Numero</strong>
          <span>${escapeHtml(question.numeroOriginal ? String(question.numeroOriginal) : String(index + 1))}</span>
        </div>
        <div class="review-summary-item">
          <strong>Origem</strong>
          <span>${renderReadOnlyValue(question.banca || question.fonteNome || "", "Nao identificada")}</span>
        </div>
        <div class="review-summary-item">
          <strong>Gabarito</strong>
          <span>${renderReadOnlyValue(gabarito, "Nao definido")}</span>
        </div>
        <div class="review-summary-item">
          <strong>Tipo</strong>
          <span>${escapeHtml(tipoLabel)}</span>
        </div>
      </div>
      <div class="review-card-status">
        ${precisaRevisao}
        ${question.textoPossivelmenteTruncado ? `<span class="review-flag review-flag-warning">Texto possivelmente truncado</span>` : ""}
        ${question.imagemProvavel ? `<span class="review-flag review-flag-warning">Imagem provavel</span>` : ""}
        ${question.qualidadeCadastro ? `<span class="review-flag review-flag-neutral">Qualidade: ${escapeHtml(question.qualidadeCadastro)}</span>` : ""}
        ${question.descritor ? `<span class="review-flag review-flag-neutral">Descritor: ${escapeHtml(question.descritor)}</span>` : ""}
        ${question.bncc_sugerido ? `<span class="review-flag review-flag-neutral">BNCC: ${escapeHtml(question.bncc_sugerido)}</span>` : ""}
        ${question.conteudo ? `<span class="review-flag review-flag-neutral">Conteudo: ${escapeHtml(question.conteudo)}</span>` : ""}
        ${question.generoTextual ? `<span class="review-flag review-flag-neutral">Genero: ${escapeHtml(question.generoTextual)}</span>` : ""}
        ${question.enviarParaAcervo || question.visibilidade === "pendente_acervo" ? `<span class="review-flag review-flag-warning">Pendente no acervo</span>` : ""}
      </div>
    </div>
  `;
}

function renderImportPreview() {
  if (!state.importedQuestions.length) {
    elements.sharedBlockPanel.hidden = true;
    elements.listaImportada.innerHTML = renderEmptyState("Cole o texto e clique em \"Organizar\" para montar a previa editavel.");
    renderPendingImagesPanel();
    updateMetrics();
    updateParseInfo();
    return;
  }

  const sharedBlock = shouldUseSharedBlock();
  elements.sharedBlockPanel.hidden = !sharedBlock;
  if (sharedBlock) {
    elements.sharedBlockText.value = state.parseInfo.textoBaseDetectado || state.importedQuestions[0]?.textoApoio || "";
  }

  elements.listaImportada.innerHTML = state.importedQuestions.map((question, index) => `
    <article class="review-card" data-question-index="${index}">
      <header>
        <div>
          <h3>Questao ${index + 1} ${question.numeroOriginal ? `- original ${question.numeroOriginal}` : ""}</h3>
          <div class="tag-row" style="margin-top:8px;">
            <span class="tag tag-primary">${escapeHtml(getDisciplineLabel(question.disciplina, question.disciplinaOriginal || ""))}</span>
            <span class="tag tag-neutral">${escapeHtml(getYearLabel(question.anoEscolar, question.anoOriginal || ""))}</span>
            <span class="tag ${question.tipo === "resposta_escrita" ? "tag-warning" : "tag-success"}">${escapeHtml(question.tipo)}</span>
            <span class="tag tag-neutral">${escapeHtml(state.sourceLabel || "texto bruto")}</span>
            ${question.textoPossivelmenteTruncado ? `<span class="tag tag-warning">OCR sugerido</span>` : ""}
            ${question.qualidadeCadastro ? `<span class="tag tag-neutral">${escapeHtml(question.qualidadeCadastro)}</span>` : ""}
            ${getMainTags(question).map(tag => `<span class="tag tag-neutral">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
        <div class="review-card-actions">
          <div class="review-card-top-actions">
            <button type="button" class="button-inline button-outline" data-toggle-edit-fields="${index}">
              ${question.modoEdicao === false ? "Editar campos" : "Ocultar edicao"}
            </button>
            <button type="button" class="button-inline ${question.confirmadoParaSalvar ? "button-success" : "button-outline"}" data-confirm-question="${index}">
              ${question.confirmadoParaSalvar ? "Questao confirmada" : "Confirmar questao"}
            </button>
            <button type="button" class="button-inline button-danger" data-remove-question="${index}">Remover</button>
          </div>
        </div>
      </header>

      <div class="review-card-body">
        ${renderQuestionAlerts(question)}
        ${renderClassificationSummary(question, index)}
        ${renderQuestionOcrPanel(question, index)}

        <div class="review-editable-section" data-editable-section="${index}" ${question.modoEdicao === false ? "hidden" : ""}>
          <div class="review-content-stack">
            ${renderReviewToggleButtons(question, index)}
            ${renderInstructionField(question)}
            ${renderSupportTextField(question, index)}
            ${renderSupportTextSourceField(question)}
            ${renderSupportImageField(question, index)}
            ${renderSupportImageSourceField(question)}
            <div class="form-field review-large-field review-order-statement">
              <label>Enunciado</label>
              <textarea data-field="enunciado">${escapeHtml(question.enunciado)}</textarea>
            </div>

            <div class="form-field review-large-field review-order-alternatives" data-alt-text-wrapper="${index}" ${question.tipo === "multipla_texto" ? "" : "hidden"}>
              <label>Alternativas</label>
              ${renderTextAlternativeRows(question, index)}
            </div>

            <div class="form-field review-large-field review-order-alternatives" data-alt-image-wrapper="${index}" ${question.tipo === "multipla_imagem" ? "" : "hidden"}>
              <label>Imagens por linha</label>
              ${renderImageAlternativeRows(question, index)}
            </div>

            <div class="form-field review-large-field" data-escrita-wrapper="${index}" ${question.tipo === "resposta_escrita" ? "" : "hidden"}>
              <label>Gabarito / resposta correta</label>
              <textarea data-field="respostaEsperada">${escapeHtml(question.respostaEsperada || "")}</textarea>
            </div>
          </div>

          <div class="review-controls-row">
            <div class="review-control-field">
              <label>Disciplina</label>
              <select data-field="disciplina">
                ${DISCIPLINAS.map(item => `<option value="${item.value}" ${item.value === question.disciplina ? "selected" : ""}>${item.label}</option>`).join("")}
              </select>
            </div>
            <div class="review-control-field">
              <label>Ano escolar</label>
              <select data-field="anoEscolar">
                ${ANOS_ESCOLARES.map(item => `<option value="${item.value}" ${item.value === question.anoEscolar ? "selected" : ""}>${item.label}</option>`).join("")}
              </select>
            </div>
            <div class="review-control-field review-control-field-descritor">
              <label>Descritor</label>
              <select data-field="descritor">${buildDescritorOptions(question)}</select>
            </div>
            <div class="review-control-field">
              <label>Dificuldade</label>
              <select data-field="nivelDificuldade">
                <option value="" ${!question.nivelDificuldade ? "selected" : ""}>Opcional</option>
                <option value="baixa" ${question.nivelDificuldade === "baixa" ? "selected" : ""}>Baixa</option>
                <option value="media" ${question.nivelDificuldade === "media" ? "selected" : ""}>Media</option>
                <option value="alta" ${question.nivelDificuldade === "alta" ? "selected" : ""}>Alta</option>
              </select>
            </div>
          </div>

          <div class="review-controls-row">
            <div class="review-control-field">
              <label>BNCC</label>
              <input type="text" data-field="bncc_sugerido" value="${escapeHtml(question.bncc_sugerido || "")}" placeholder="Codigo BNCC">
            </div>
            <div class="review-control-field">
              <label>Habilidade BNCC</label>
              <input type="text" data-field="habilidade_bncc" value="${escapeHtml(question.habilidade_bncc || "")}" placeholder="Habilidade">
            </div>
            <div class="review-control-field">
              <label>Conteudo</label>
              <input type="text" data-field="conteudo" value="${escapeHtml(question.conteudo || "")}" placeholder="Conteudo">
            </div>
            <div class="review-control-field">
              <label>Categoria</label>
              <input type="text" data-field="categoria_bncc" value="${escapeHtml(question.categoria_bncc || "")}" placeholder="Categoria">
            </div>
            <div class="review-control-field">
              <label>Genero textual</label>
              <input type="text" data-field="generoTextual" value="${escapeHtml(question.generoTextual || "")}" placeholder="Genero textual">
            </div>
            <div class="review-control-field">
              <label>Acervo geral</label>
              <label class="review-checkbox">
                <input type="checkbox" data-field="enviarParaAcervo" ${question.enviarParaAcervo || question.visibilidade === "pendente_acervo" ? "checked" : ""}>
                <span>Enviar para curadoria</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="review-card-footer">
        ${renderImageAssociationButtons(index)}
        <button type="button" class="button button-success" data-save-question="${index}">Salvar questao</button>
      </div>
    </article>
  `).join("");

  renderPendingImagesPanel();
  bindQuestionReviewEvents();
  updateMetrics();
  updateParseInfo();
}

function syncQuestionFromCard(index) {
  const card = elements.listaImportada.querySelector(`[data-question-index="${index}"]`);
  if (!card) return;

  const question = state.importedQuestions[index];
  question.enunciado = card.querySelector("[data-field=\"enunciado\"]").value.trim();
  question.instrucao = card.querySelector("[data-field=\"instrucao\"]")?.value.trim() || question.instrucao || "";
  question.fonteTextoApoio = card.querySelector("[data-field=\"fonteTextoApoio\"]")?.value.trim() || question.fonteTextoApoio || "";
  question.fonteImagemApoio = card.querySelector("[data-field=\"fonteImagemApoio\"]")?.value.trim() || question.fonteImagemApoio || "";
  if (hasSupportImagePlaceholder(question) || question.fonteImagemApoio || question.usarImagensApoio) {
    question.imagemApoio = question.imagemApoio || "[imagem aqui]";
  }
  question.banca = card.querySelector("[data-field=\"banca\"]")?.value.trim() || question.banca || "";
  question.disciplina = card.querySelector("[data-field=\"disciplina\"]").value;
  question.anoEscolar = card.querySelector("[data-field=\"anoEscolar\"]").value;
  question.descritor = card.querySelector("[data-field=\"descritor\"]").value;
  question.nivelDificuldade = card.querySelector("[data-field=\"nivelDificuldade\"]")?.value || "";
  question.bncc_sugerido = card.querySelector("[data-field=\"bncc_sugerido\"]").value.trim();
  question.habilidade_bncc = card.querySelector("[data-field=\"habilidade_bncc\"]").value.trim();
  question.conteudo = card.querySelector("[data-field=\"conteudo\"]").value.trim();
  question.categoria_bncc = card.querySelector("[data-field=\"categoria_bncc\"]").value.trim();
  question.generoTextual = card.querySelector("[data-field=\"generoTextual\"]")?.value.trim() || "";
  question.enviarParaAcervo = Boolean(card.querySelector("[data-field=\"enviarParaAcervo\"]")?.checked);
  question.visibilidade = question.enviarParaAcervo ? "pendente_acervo" : "privada";
  question.statusRevisao = question.enviarParaAcervo ? "pendente_acervo" : "revisada_professor";
  question.descritorDescricao = getDescritores(question.disciplina, question.anoEscolar)
    .find(item => item.codigo === question.descritor)?.nome || "";
  question.textoApoio = shouldUseSharedBlock()
    ? elements.sharedBlockText.value.trim()
    : (card.querySelector("[data-field=\"textoApoio\"]")?.value.trim() || "");
  normalizeQuestionClassification(question);
  question.classificacao_confirmada = question.confirmadoParaSalvar;
  question.data_confirmacao = question.confirmadoParaSalvar ? (question.data_confirmacao || new Date()) : null;
  question.professor_id = question.confirmadoParaSalvar ? usuario.uid : question.professor_id;
  question.imagemApoioObrigatoriaAusente = Boolean(question.usarImagensApoio && !(question.imagensApoio || []).length);
  question.tagsNormalizadas = [
    question.disciplina,
    question.anoEscolar,
    question.descritor,
    question.bncc_sugerido,
    question.conteudo,
    question.generoTextual
  ].filter(Boolean);

  if (question.descritorSugestaoIA && typeof question.descritorSugestaoIA === "object") {
    question.descritorSugestaoIA.descritor = question.descritor;
    question.descritorSugestaoIA.codigo_bncc = question.bncc_sugerido;
    question.descritorSugestaoIA.habilidade = question.habilidade_bncc;
    question.descritorSugestaoIA.habilidade_bncc = question.habilidade_bncc;
    question.descritorSugestaoIA.conteudo = question.conteudo;
    question.descritorSugestaoIA.categoria = question.categoria_bncc;
  }

  if (question.classificacaoSugestao && typeof question.classificacaoSugestao === "object") {
    question.classificacaoSugestao.descritorSugerido = question.descritor;
    question.classificacaoSugestao.bnccSugerida = question.bncc_sugerido;
    question.classificacaoSugestao.habilidadeBncc = question.habilidade_bncc;
    question.classificacaoSugestao.conteudoSugerido = question.conteudo;
    question.classificacaoSugestao.categoriaSugerida = question.categoria_bncc;
  }

  if (question.tipo === "resposta_escrita") {
    question.respostaEsperada = card.querySelector("[data-field=\"respostaEsperada\"]").value.trim();
    question.alternativas = [];
    question.respostaCorreta = "";
    question.temAlternativaVazia = false;
    question.temImagemAlternativaAusente = false;
    question.imagensApoio = question.imagensApoio || [];
    question.qualidadeCadastro = inferQuestionQuality(question);
    return;
  }

  if (question.tipo === "multipla_imagem") {
    const imageInputs = [...card.querySelectorAll("[data-alt-image-url]")];
    question.alternativas = imageInputs
      .map((input, altIndex) => ({
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: "",
        imagemUrl: input.value.trim(),
        correta: false,
        ordem: altIndex
      }))
      .filter(item => item.imagemUrl);
  } else {
    const textInputs = [...card.querySelectorAll("[data-alt-text]")];
    question.alternativas = textInputs
      .map((input, altIndex) => ({
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: input.value.trim(),
        imagemUrl: "",
        correta: false,
        ordem: altIndex
      }))
      .filter(item => item.texto);
    question.temAlternativaVazia = textInputs.some(input => !(input.value || "").trim()) && textInputs.some(input => (input.value || "").trim());
  }

  if (question.tipo === "multipla_imagem") {
    const imageInputs = [...card.querySelectorAll("[data-alt-image-url]")];
    question.temImagemAlternativaAusente = imageInputs.some(input => !(input.value || "").trim()) && imageInputs.some(input => (input.value || "").trim());
  } else {
    question.temImagemAlternativaAusente = false;
  }

  const checkedAlternative = card.querySelector(`input[name="correctAlternative-${index}"]:checked`);
  question.respostaCorreta = checkedAlternative ? checkedAlternative.value : "";
  question.alternativas = (question.alternativas || []).map((item, altIndex) => ({
    ...item,
    correta: String(question.respostaCorreta) === String(altIndex)
  }));
  question.respostaEsperada = "";
  question.qualidadeCadastro = inferQuestionQuality(question);

  const alertsContainer = card.querySelector("[data-question-alerts]");
  const alertsMarkup = renderQuestionAlerts(question);
  if (alertsContainer) {
    alertsContainer.outerHTML = alertsMarkup || "<div data-question-alerts hidden></div>";
  } else if (alertsMarkup) {
    const stack = card.querySelector(".review-content-stack");
    stack?.insertAdjacentHTML("afterbegin", alertsMarkup);
  }
}

async function uploadSupportImageFromClipboard(event, index) {
  const file = getClipboardImageFile(event);
  if (!file) return;

  event.preventDefault();
  syncQuestionFromCard(index);

  try {
    showFeedback(elements.feedback, "success", "Enviando imagem colada...");
    const url = await uploadImagemCloudinary(file);
    const question = state.importedQuestions[index];
    question.imagensApoio = [
      ...(question.imagensApoio || []),
      url
    ];
    markQuestionHasRealSupportImage(question);
    showFeedback(elements.feedback, "success", "Imagem colada adicionada com sucesso.");
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem colada.");
  }
}

function applyAlternativeImageUrl(questionIndex, altIndex, url) {
  const question = state.importedQuestions[questionIndex];
  const alternatives = [...(question.alternativas || [])];
  while (alternatives.length <= altIndex) {
    alternatives.push({ texto: "", imagemUrl: "", correta: false, ordem: alternatives.length });
  }
  alternatives[altIndex] = {
    ...alternatives[altIndex],
    letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
    texto: "",
    imagemUrl: url,
    ordem: altIndex
  };
  question.alternativas = alternatives;
}

async function uploadAlternativeImageFromClipboard(event, questionIndex, altIndex) {
  const file = getClipboardImageFile(event);
  if (!file) return;

  event.preventDefault();
  syncQuestionFromCard(questionIndex);

  try {
    showFeedback(elements.feedback, "success", `Enviando imagem colada para a alternativa ${altIndex + 1}...`);
    const url = await uploadImagemCloudinary(file);
    applyAlternativeImageUrl(questionIndex, altIndex, url);
    showFeedback(elements.feedback, "success", "Imagem colada adicionada a alternativa.");
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem colada para a alternativa.");
  }
}

function bindQuestionReviewEvents() {
  elements.listaImportada.querySelectorAll("[data-question-index]").forEach(card => {
    const index = Number(card.dataset.questionIndex);

    card.querySelectorAll("textarea, select, input[type='text'], input[type='radio']").forEach(field => {
      field.addEventListener("change", () => {
        syncQuestionFromCard(index);
        updateMetrics();
      });
    });

    card.querySelector("[data-field=\"disciplina\"]").addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });

    card.querySelector("[data-field=\"anoEscolar\"]").addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-images]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportImages);
      state.importedQuestions[index].usarImagensApoio = !state.importedQuestions[index].usarImagensApoio;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-text]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportText);
      state.importedQuestions[index].usarTextoApoio = !state.importedQuestions[index].usarTextoApoio;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-image-choice]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleImageChoice);
      const question = state.importedQuestions[index];
      if (question.tipo === "multipla_imagem") {
        question.tipo = (question.alternativas || []).some(item => item.texto) ? "multipla_texto" : "resposta_escrita";
      } else {
        question.tipo = "multipla_imagem";
        question.respostaEsperada = "";
      }
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-support-image]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeSupportImage);
      const imageIndex = Number(button.dataset.imageIndex);
      state.importedQuestions[index].imagensApoio.splice(imageIndex, 1);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-support-image-paste-zone]").forEach(zone => {
    zone.addEventListener("click", event => {
      if (event.target?.matches?.("input, button, textarea, select, a")) return;
      zone.focus();
    });
    zone.addEventListener("paste", event => {
      uploadSupportImageFromClipboard(event, Number(zone.dataset.supportImagePasteZone));
    });
  });

  elements.listaImportada.querySelectorAll("[data-alt-image-paste-zone]").forEach(zone => {
    zone.addEventListener("click", event => {
      if (event.target?.matches?.("input, button, textarea, select, a")) return;
      zone.focus();
    });
    zone.addEventListener("paste", event => {
      uploadAlternativeImageFromClipboard(
        event,
        Number(zone.dataset.altImagePasteZone),
        Number(zone.dataset.altIndex)
      );
    });
  });

  elements.listaImportada.querySelectorAll("[data-support-image-upload]").forEach(input => {
    input.addEventListener("change", async () => {
      const index = Number(input.dataset.supportImageUpload);
      const files = Array.from(input.files || []);
      if (!files.length) return;

      try {
        showFeedback(elements.feedback, "success", "Enviando imagem(ns) de apoio...");
        const uploaded = await uploadMultiplasImagensCloudinary(files);
        state.importedQuestions[index].imagensApoio = [
          ...(state.importedQuestions[index].imagensApoio || []),
          ...uploaded
        ];
        markQuestionHasRealSupportImage(state.importedQuestions[index]);
        showFeedback(elements.feedback, "success", "Imagem(ns) de apoio enviada(s) com sucesso.");
        renderImportPreview();
      } catch (error) {
        showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem de apoio.");
      } finally {
        input.value = "";
      }
    });
  });

  elements.listaImportada.querySelectorAll("[data-alt-image-upload]").forEach(input => {
    input.addEventListener("change", async () => {
      const questionIndex = Number(input.dataset.altImageUpload);
      const altIndex = Number(input.dataset.altIndex);
      const file = input.files?.[0];
      if (!file) return;

      try {
        showFeedback(elements.feedback, "success", `Enviando imagem da alternativa ${altIndex + 1}...`);
        const url = await uploadImagemCloudinary(file);
        applyAlternativeImageUrl(questionIndex, altIndex, url);
        showFeedback(elements.feedback, "success", "Imagem da alternativa enviada com sucesso.");
        renderImportPreview();
      } catch (error) {
        showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem da alternativa.");
      } finally {
        input.value = "";
      }
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-alt-image]").forEach(button => {
    button.addEventListener("click", () => {
      const questionIndex = Number(button.dataset.removeAltImage);
      const altIndex = Number(button.dataset.altIndex);
      const question = state.importedQuestions[questionIndex];
      const alternatives = [...(question.alternativas || [])];
      while (alternatives.length <= altIndex) {
        alternatives.push({ texto: "", imagemUrl: "", correta: false, ordem: alternatives.length });
      }
      alternatives[altIndex] = {
        ...alternatives[altIndex],
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        imagemUrl: "",
        texto: ""
      };
      question.alternativas = alternatives;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-save-question]").forEach(button => {
    button.addEventListener("click", () => {
      handleSalvarQuestao(Number(button.dataset.saveQuestion));
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-question]").forEach(button => {
    button.addEventListener("click", () => {
      runOcrForQuestion(Number(button.dataset.ocrQuestion));
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-append-support]").forEach(button => {
    button.addEventListener("click", () => {
      applyOcrSuggestionToQuestion(Number(button.dataset.ocrAppendSupport), "append");
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-replace-support]").forEach(button => {
    button.addEventListener("click", () => {
      applyOcrSuggestionToQuestion(Number(button.dataset.ocrReplaceSupport), "replace");
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-undo]").forEach(button => {
    button.addEventListener("click", () => {
      undoOcrForQuestion(Number(button.dataset.ocrUndo));
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-toggle-details]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.ocrToggleDetails);
      state.importedQuestions[index].ocrDetalhesAbertos = !state.importedQuestions[index].ocrDetalhesAbertos;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-apply-field]").forEach(button => {
    button.addEventListener("click", () => {
      applyOcrStructuredField(Number(button.dataset.ocrIndex), button.dataset.ocrApplyField, "replace");
    });
  });

  elements.listaImportada.querySelectorAll("[data-ocr-apply-all]").forEach(button => {
    button.addEventListener("click", () => {
      applyOcrStructuredField(Number(button.dataset.ocrApplyAll), "all", "replace");
    });
  });

  elements.listaImportada.querySelectorAll("[data-classify-question]").forEach(button => {
    button.addEventListener("click", () => {
      classifyQuestionAfterReview(Number(button.dataset.classifyQuestion));
    });
  });

  elements.listaImportada.querySelectorAll("[data-apply-suggestion]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.applySuggestion);
      syncQuestionFromCard(index);
      applySuggestionToQuestion(index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-confirm-question]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.confirmQuestion);
      syncQuestionFromCard(index);
      const question = state.importedQuestions[index];
      question.confirmadoParaSalvar = !question.confirmadoParaSalvar;
      if (question.confirmadoParaSalvar) {
        question.precisaRevisao = false;
        question.classificacao_confirmada = true;
        question.data_confirmacao = question.data_confirmacao || new Date();
      } else {
        question.classificacao_confirmada = false;
      }
      question.qualidadeCadastro = inferQuestionQuality(question);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-edit-fields]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleEditFields);
      syncQuestionFromCard(index);
      state.importedQuestions[index].modoEdicao = !(state.importedQuestions[index].modoEdicao !== false);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-question]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeQuestion);
      state.importedQuestions.splice(index, 1);
      if (!state.importedQuestions.length) {
        state.sourceLabel = "";
        state.parseInfo = { tituloDetectado: "", textoBaseDetectado: "" };
      }
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-associate-support-image]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.associateSupportImage);
      syncQuestionFromCard(index);
      associateSelectedImageToSupport(index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-associate-alt-image]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.associateAltImage);
      const altIndex = Number(button.dataset.altTarget);
      syncQuestionFromCard(index);
      associateSelectedImageToAlternative(index, altIndex);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-question-images]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeQuestionImages);
      syncQuestionFromCard(index);
      removeQuestionImagesToPending(index);
      renderImportPreview();
    });
  });

  elements.pendingImagesList?.querySelectorAll("[data-select-pending-image]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedPendingImageId = button.dataset.selectPendingImage || "";
      renderPendingImagesPanel();
      renderImportPreview();
    });
  });
}

function applySuggestedContext(questoes, meta = {}) {
  if (!questoes.length) return;
  const first = questoes[0];
  const config = getModeConfig();

  if (!elements.disciplina.value && first.disciplina) {
    elements.disciplina.value = first.disciplina;
  }

  if (!elements.anoEscolar.value && first.anoEscolar) {
    elements.anoEscolar.value = first.anoEscolar;
  }

  if (!elements.titulo.value.trim()) {
    elements.titulo.value = meta.tituloDetectado || config.fallbackTitle;
  }
}

function resetImportedQuestions() {
  state.importedQuestions = [];
  state.parseInfo = { tituloDetectado: "", textoBaseDetectado: "" };
  state.parserSnapshot = createEmptyQuestionParseResult();
  revokePendingDocumentImages();
  elements.sharedBlockText.value = "";
}

async function processarTextoBrutoImportado() {
  let valor = elements.textoBruto.value.trim();
  let origem = state.importedDocument ? "arquivo_referenciado" : "texto_colado";
  let documentAlert = "";
  const documentName = state.importedDocument?.nome || "";
  const shouldExtractDocument = Boolean(state.importedDocument?.arquivo && !state.importedDocument.extraido);

  if (shouldExtractDocument && /\.docx$/i.test(documentName)) {
    showFeedback(elements.feedback, "success", "Lendo arquivo DOCX...");
    const extracted = await extractDocxAssessment(state.importedDocument.arquivo);
    valor = extracted.textoExtraido || "";
    elements.textoBruto.value = valor;
    state.pendingDocumentImages = extracted.imagensPendentes || [];
    state.importedDocument.extraido = true;
    state.importedDocument.textoExtraido = valor;
    state.importedDocument.imagensPendentes = state.pendingDocumentImages;
    state.importedDocument.pages = [];
    origem = "docx_extraido";
    documentAlert = extracted.alertas?.[0] || "";
    if (documentAlert) {
      elements.arquivoInfo.textContent = `Arquivo ${state.importedDocument.nome} processado. ${state.pendingDocumentImages.length} imagem(ns) extraida(s). ${documentAlert}`;
    } else {
      elements.arquivoInfo.textContent = `Arquivo ${state.importedDocument.nome} processado com sucesso. Texto extraido pronto para revisao.`;
    }
  } else if (shouldExtractDocument && /\.pdf$/i.test(documentName)) {
    showFeedback(elements.feedback, "success", "Lendo arquivo PDF...");
    try {
      const extracted = await extractPdfAssessment(state.importedDocument.arquivo);
      valor = extracted.textoExtraido || "";
      elements.textoBruto.value = DEBUG_PDF_IMPORT
        ? [
          "=== TEXTO BRUTO PDF ===",
          extracted.textoBruto || "",
          "",
          "=== TEXTO LIMPO PDF ===",
          valor,
          "",
          "=== ALERTAS ===",
          ...(extracted.alertas || [])
        ].join("\n")
        : valor;
      state.pendingDocumentImages = extracted.imagensPendentes || [];
      state.importedDocument.extraido = true;
      state.importedDocument.textoExtraido = valor;
      state.importedDocument.textoBruto = extracted.textoBruto || "";
      state.importedDocument.pdfAlertas = extracted.alertas || [];
      state.importedDocument.pdfDiagnostics = extracted.pdfDiagnostics || [];
      state.importedDocument.imageDecodeErrors = extracted.imageDecodeErrors || [];
      state.importedDocument.imagensDetectadas = extracted.imagensDetectadas || 0;
      state.importedDocument.imagensPendentes = state.pendingDocumentImages;
      state.importedDocument.pages = extracted.pages || [];
      origem = "pdf_extraido";
      documentAlert = extracted.alertas?.[0] || "";
      if (documentAlert) {
        elements.arquivoInfo.textContent = `Arquivo ${state.importedDocument.nome} processado. Revise os cards gerados. ${documentAlert}`;
      } else {
        elements.arquivoInfo.textContent = `Arquivo ${state.importedDocument.nome} processado com sucesso. Revise os cards gerados.`;
      }
    } catch (error) {
      console.error("Erro ao processar PDF", error);
      valor = "";
      documentAlert = "Erro ao processar PDF";
      elements.arquivoInfo.textContent = documentAlert;
      showFeedback(elements.feedback, "error", documentAlert);
    }
  }

  const valorLimpo = cleanTextoImportado(valor);

  state.parserSnapshot = parseTextAssessment(valorLimpo);
  if (documentAlert && !state.parserSnapshot.alertasGerais.includes(documentAlert)) {
    state.parserSnapshot.alertasGerais.push(documentAlert);
  }
  state.parserSnapshot = parseQuestionDocumentText(valorLimpo, {
    titulo: elements.titulo.value.trim(),
    cabecalho: elements.titulo.value.trim(),
    origem
  });
  if (documentAlert && !state.parserSnapshot.alertasGerais.includes(documentAlert)) {
    state.parserSnapshot.alertasGerais.push(documentAlert);
  }

  if (!valorLimpo) {
    resetImportedQuestions();
    state.sourceLabel = "";
    if (documentAlert === "Erro ao processar PDF") {
      updateDetectionStatus("Erro ao processar PDF.", "error");
      showFeedback(elements.feedback, "error", documentAlert);
    } else {
      clearFeedback(elements.feedback);
      updateDetectionStatus("Cole o texto e clique em \"Organizar\".", "neutral");
    }
    renderImportPreview();
    return;
  }

  const resultado = organizarQuestoesParaRevisao(valorLimpo, getImportContext());
  const questoes = resultado.questions || [];

  if (!questoes.length) {
    resetImportedQuestions();
    state.sourceLabel = "";
    updateDetectionStatus("Nenhuma questao foi identificada. Revise o texto bruto e tente novamente.", "warning");
    showFeedback(elements.feedback, "error", "Nao foi possivel separar questoes automaticamente com esse texto.");
    renderImportPreview();
    return;
  }

  state.importedQuestions = questoes.map(question => applyDocumentImageHints(clearImportedClassificationSuggestion({
    ...question,
    modoEdicao: question.modoEdicao ?? true
  })));
  applyAutomaticImageAssociations(state.importedQuestions);
  state.importedQuestions.forEach(applyOcrSuspicion);
  state.sourceLabel = getSourceLabelFromOrigin(origem);
  state.parseInfo = {
    tituloDetectado: resultado.tituloDetectado || elements.titulo.value.trim(),
    textoBaseDetectado: resultado.textoBaseDetectado || ""
  };

  applySuggestedContext(questoes, resultado);
  if (shouldUseSharedBlock()) {
    elements.sharedBlockText.value = state.parseInfo.textoBaseDetectado || "";
    applySharedBlockTextToQuestions();
  }
  updateDetectionStatus(`${questoes.length} questao(oes) organizada(s) automaticamente a partir de ${state.sourceLabel}.`, "success");
  if (documentAlert) {
    showFeedback(elements.feedback, "warning", `${questoes.length} questao(oes) pronta(s) para revisao. ${documentAlert}`);
  } else {
    showFeedback(elements.feedback, "success", `${questoes.length} questao(oes) pronta(s) para revisao. Ajuste o que precisar e salve no final.`);
  }
  renderImportPreview();
}

function validateImportedQuestions() {
  const selecionadas = state.importedQuestions.filter(question => question.confirmadoParaSalvar);

  if (!selecionadas.length) {
    throw new Error("Selecione pelo menos uma questao para salvar.");
  }

  selecionadas.forEach((question, index) => {
    validateSingleQuestion(question, `questao ${index + 1}`);
  });
}

function getConfirmedQuestions() {
  return state.importedQuestions.filter(question => question.confirmadoParaSalvar);
}

function inferQuestionQuality(question) {
  if (!question.enunciado?.trim()) return "incompleto";
  if (question.tipo === "resposta_escrita" && !(question.respostaEsperada || "").trim()) return "sem gabarito";
  if (question.tipo !== "resposta_escrita" && question.respostaCorreta === "") return "sem gabarito";
  if (disciplinaPrecisaDescritor(question.disciplina) && !question.descritor) return "sem descritor";
  const alternativas = question.alternativas || [];
  if (question.tipo !== "resposta_escrita" && alternativas.length < 2) return "incompleto";
  if (question.temAlternativaVazia || question.temImagemAlternativaAusente) return "incompleto";
  return "completo";
}

function validateSingleQuestion(question, indexLabel) {
  if (!question.enunciado.trim()) {
    throw new Error(`A ${indexLabel} esta sem enunciado.`);
  }
  if (!question.anoEscolar) {
    throw new Error(`Informe o ano escolar da ${indexLabel}.`);
  }
  if (!question.disciplina) {
    throw new Error(`Informe a disciplina da ${indexLabel}.`);
  }
  if (disciplinaPrecisaDescritor(question.disciplina) && !question.descritor) {
    throw new Error(`Defina o descritor da ${indexLabel} antes de salvar.`);
  }
  if (question.tipo === "resposta_escrita") {
    if (!(question.respostaEsperada || "").trim()) {
      throw new Error(`Informe a resposta correta da ${indexLabel}.`);
    }
    return;
  }
  if (question.usarImagensApoio && !(question.imagensApoio || []).length) {
    throw new Error(`Envie pelo menos uma imagem de apoio para a ${indexLabel} ou desative essa opcao.`);
  }
  if (question.tipo === "multipla_imagem") {
    const imageAlternatives = (question.alternativas || []).filter(item => (item.imagemUrl || item.imagem || "").trim());
    if (imageAlternatives.length < 2) {
      throw new Error(`A ${indexLabel} precisa de pelo menos 2 imagens nas alternativas.`);
    }
    if (question.temImagemAlternativaAusente) {
      throw new Error(`A ${indexLabel} possui imagem de alternativa ausente.`);
    }
  }
  if ((question.alternativas || []).length < 2) {
    throw new Error(`A ${indexLabel} precisa de pelo menos 2 alternativas.`);
  }
  if (question.temAlternativaVazia || (question.alternativas || []).some(item => question.tipo === "multipla_texto" && !(item.texto || "").trim())) {
    throw new Error(`A ${indexLabel} possui alternativa vazia.`);
  }
  if (question.respostaCorreta === "") {
    throw new Error(`Defina a alternativa correta da ${indexLabel}.`);
  }
}

async function handleSalvarBlocoCompleto() {
  clearFeedback(elements.feedback);

  try {
    await runButtonFeedback(elements.btnSalvarBloco, {
      originalLabel: "Salvar bloco completo",
      loadingLabel: "Salvando...",
      successLabel: "Bloco salvo âœ”",
      errorLabel: "Erro âŒ"
    }, async () => {
      syncAllQuestionsFromCards();
      applySharedBlockTextToQuestions();
      const confirmedQuestions = getConfirmedQuestions();
      if (!confirmedQuestions.length) {
        throw new Error("O bloco precisa ter pelo menos uma questao.");
      }
      const sharedText = elements.sharedBlockText.value.trim();
      if (!sharedText) {
        throw new Error("Informe o texto de apoio compartilhado do bloco antes de salvar.");
      }

      confirmedQuestions.forEach((question, index) => {
        question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
        question.classificacao_confirmada = true;
        question.data_confirmacao = question.data_confirmacao || new Date();
        validateSingleQuestion(question, `questao ${index + 1}`);
      });

      const context = getImportContext();
      await saveQuestionBlock({
        titulo: context.titulo || state.parseInfo.tituloDetectado || "Bloco com texto base",
        textoApoio: sharedText,
        imagensApoio: [],
        anoEscolar: context.anoEscolar,
        disciplina: context.disciplina,
        questoes: confirmedQuestions.map((question, index) => ({
          ...question,
          textoApoio: "",
          blocoTitulo: context.titulo || state.parseInfo.tituloDetectado || "Bloco com texto base",
          ordemBloco: index
        })),
        minQuestoes: 1
      }, usuario);
    });

    const totalSalvas = getConfirmedQuestions().length;
    showFeedback(elements.feedback, "success", `${totalSalvas} questao(oes) salva(s) como bloco completo.`);
    state.importedQuestions = state.importedQuestions.filter(question => !question.confirmadoParaSalvar);
    if (!state.importedQuestions.length) {
      resetImportedQuestions();
      state.sourceLabel = "";
    }
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao salvar o bloco.");
  }
}

async function handleSalvarQuestao(index) {
  clearFeedback(elements.feedback);
  const button = elements.listaImportada.querySelector(`[data-save-question="${index}"]`);

  try {
    const result = await runButtonFeedback(button, {
      originalLabel: "Salvar questao",
      loadingLabel: "Salvando...",
      successLabel: "Salvo âœ”",
      errorLabel: "Erro âŒ"
    }, async () => {
      syncQuestionFromCard(index);
      applySharedBlockTextToQuestions();
      const question = state.importedQuestions[index];
      question.confirmadoParaSalvar = true;
      question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
      question.classificacao_confirmada = true;
      question.data_confirmacao = question.data_confirmacao || new Date();
      validateSingleQuestion(question, `questao ${index + 1}`);
      const context = getImportContext();
      return salvarImportacaoRevisada(context, [question], usuario);
    });

    showFeedback(elements.feedback, "success", `${result.totalSalvas} questao salva no banco do professor.`);
    state.importedQuestions.splice(index, 1);
    if (!state.importedQuestions.length) {
      state.sourceLabel = "";
      state.parseInfo = { tituloDetectado: "", textoBaseDetectado: "" };
    }
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao salvar a questao.");
  }
}

async function handleSalvarImportacao() {
  clearFeedback(elements.feedback);

  try {
    const result = await runButtonFeedback(elements.btnSalvar, {
      originalLabel: "Criar questoes",
      loadingLabel: "Salvando...",
      successLabel: "Criadas",
      errorLabel: "Erro âŒ"
    }, async () => {
      syncAllQuestionsFromCards();
      applySharedBlockTextToQuestions();
      const confirmedQuestions = getConfirmedQuestions();
      confirmedQuestions.forEach(question => {
        question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
        question.classificacao_confirmada = true;
        question.data_confirmacao = question.data_confirmacao || new Date();
      });
      validateImportedQuestions();
      const context = getImportContext();
      const sharedBlock = getCurrentSharedBlockData();
      if (sharedBlock) {
        const savedBlock = await saveQuestionBlock({
          blocoId: sharedBlock.blocoId,
          titulo: sharedBlock.titulo,
          textoApoio: sharedBlock.textoApoio,
          fonteTextoApoio: sharedBlock.fonteTextoApoio,
          imagemApoio: sharedBlock.imagemApoio,
          fonteImagemApoio: sharedBlock.fonteImagemApoio,
          imagensApoio: sharedBlock.imagensApoio,
          anoEscolar: context.anoEscolar,
          disciplina: context.disciplina,
          questoes: confirmedQuestions.map((question, index) => ({
            ...question,
            referenciaBlocoId: sharedBlock.blocoId,
            textoApoio: "",
            fonteTextoApoio: "",
            imagemApoio: "",
            fonteImagemApoio: "",
            imagensApoio: [],
            blocoTitulo: sharedBlock.titulo,
            ordemBloco: index
          })),
          minQuestoes: 1,
          duplicarApoioNasQuestoes: false
        }, usuario);
        return { totalSalvas: savedBlock.questoes?.length || confirmedQuestions.length, blocoId: savedBlock.blocoId };
      }
      return salvarImportacaoRevisada(context, confirmedQuestions, usuario);
    });

    showFeedback(elements.feedback, "success", `${result.totalSalvas} questao(oes) criada(s) no banco do professor.`);
    state.importedQuestions = state.importedQuestions.filter(question => !question.confirmadoParaSalvar);
    if (!state.importedQuestions.length) {
      state.sourceLabel = "";
    }
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao salvar a importacao.");
  }
}

function handleLimparImportacao() {
  elements.formImportacao.reset();
  resetImportedQuestions();
  state.sourceLabel = "";
  state.importedDocument = null;
  revokePendingDocumentImages();
  clearPdfViewer();
  elements.arquivoInfo.textContent = "Voce tambem pode selecionar um arquivo PDF ou DOCX. Ao clicar em \"Organizar\", o arquivo sera extraido e convertido em cards editaveis.";
  clearFeedback(elements.feedback);
  refreshModeUI();
  updateDetectionStatus("Cole o texto e clique em \"Organizar\".", "neutral");
  renderImportPreview();
}

function bindEvents() {
  populateSelect(elements.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.disciplina, DISCIPLINAS, "Selecione");
  elements.modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      refreshModeUI();
      renderImportPreview();
    });
  });

  elements.arquivoDocumento?.addEventListener("change", () => {
    const file = elements.arquivoDocumento.files?.[0] || null;
    revokePendingDocumentImages();
    state.importedDocument = file ? { nome: file.name, tipo: file.type || "", tamanho: file.size || 0, arquivo: file, extraido: false, imagensPendentes: [] } : null;
    if (!file) {
      clearPdfViewer();
      elements.arquivoInfo.textContent = "Voce tambem pode selecionar um arquivo PDF ou DOCX. Ao clicar em \"Organizar\", o arquivo sera extraido e convertido em cards editaveis.";
      return;
    }
    if (/\.docx$/i.test(file.name)) {
      clearPdfViewer();
      elements.arquivoInfo.textContent = `Arquivo selecionado: ${file.name}. Ao clicar em "Organizar", o texto sera extraido e as imagens ficarao como itens pendentes.`;
      updateDetectionStatus(`Arquivo DOCX ${file.name} selecionado. Clique em "Organizar" para extrair o texto.`, "warning");
      return;
    }
    if (/\.pdf$/i.test(file.name)) {
      loadPdfPreview(file);
      elements.arquivoInfo.textContent = `Arquivo selecionado: ${file.name}. Ao clicar em "Organizar", o PDF sera limpo e convertido em cards editaveis.`;
      updateDetectionStatus(`Arquivo PDF ${file.name} selecionado. Clique em "Organizar" para extrair o texto.`, "warning");
      return;
    }
    clearPdfViewer();
    elements.arquivoInfo.textContent = `Arquivo selecionado: ${file.name}. Esse formato ainda nao possui extracao automatica ativa; por enquanto, cole o texto bruto para organizar as questoes.`;
    updateDetectionStatus(`Arquivo ${file.name} selecionado. Cole o texto e clique em "Organizar" para continuar.`, "warning");
  });

  elements.textoBruto.addEventListener("input", () => {
    if (!elements.textoBruto.value.trim()) {
      updateDetectionStatus("Cole o texto e clique em \"Organizar\".", "neutral");
      return;
    }
    updateDetectionStatus("Texto atualizado. Clique em \"Organizar\" para processar novamente.", "warning");
  });

  elements.btnOrganizar.addEventListener("click", async () => {
    try {
      await processarTextoBrutoImportado();
    } catch (error) {
      showFeedback(elements.feedback, "error", error.message || "Nao foi possivel processar o arquivo selecionado.");
      updateDetectionStatus("Houve um erro ao processar o conteudo selecionado.", "error");
    }
  });
  elements.btnClassificarProntas?.addEventListener("click", classifyReadyQuestionsAfterReview);
  elements.btnSalvar.addEventListener("click", handleSalvarImportacao);
  elements.btnSalvarBloco?.addEventListener("click", handleSalvarBlocoCompleto);
  elements.btnLimpar.addEventListener("click", handleLimparImportacao);
  elements.pdfViewerPrevPage?.addEventListener("click", () => scrollPdfViewerToPage(state.pdfViewer.currentPage - 1));
  elements.pdfViewerNextPage?.addEventListener("click", () => scrollPdfViewerToPage(state.pdfViewer.currentPage + 1));
  elements.pdfViewerZoomOut?.addEventListener("click", () => changePdfZoom(-0.15));
  elements.pdfViewerZoomIn?.addEventListener("click", () => changePdfZoom(0.15));
  elements.pdfViewerPages?.addEventListener("scroll", () => {
    const pageElements = [...elements.pdfViewerPages.querySelectorAll("[data-pdf-page]")];
    const containerTop = elements.pdfViewerPages.getBoundingClientRect().top;
    const closest = pageElements
      .map(page => ({
        page: Number(page.dataset.pdfPage || 1),
        distance: Math.abs(page.getBoundingClientRect().top - containerTop)
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest?.page && closest.page !== state.pdfViewer.currentPage) {
      state.pdfViewer.currentPage = closest.page;
      updatePdfViewerControls();
    }
  });
  elements.pdfReviewTabs.forEach(button => {
    button.addEventListener("click", () => {
      state.pdfViewer.mobileView = button.dataset.pdfReviewTab || "preview";
      updatePdfViewerControls();
    });
  });
  elements.anoEscolar.addEventListener("change", () => applyGlobalFieldToQuestions("anoEscolar", elements.anoEscolar.value));
  elements.disciplina.addEventListener("change", () => applyGlobalFieldToQuestions("disciplina", elements.disciplina.value));
  elements.sharedBlockText.addEventListener("input", () => {
    applySharedBlockTextToQuestions();
    updateMetrics();
  });
}

function init() {
  state.mode = getQueryMode();
  bindEvents();
  refreshModeUI();
  updatePdfViewerControls();
  updateDetectionStatus("Cole o texto e clique em \"Organizar\".", "neutral");
  renderImportPreview();
}

init();
