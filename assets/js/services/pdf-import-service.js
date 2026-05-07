import * as pdfjsLib from "../../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).toString();

export const DEBUG_PDF_IMPORT = false;

const IMAGE_HINT_REGEX = /\b(observe\s+a\s+figura|observe\s+a\s+imagem|tirinha|grafico|gráfico|mapa)\b/i;
const PDF_IMAGE_HINT_REGEX = /\b(observe\s+a\s+figura|observe\s+a\s+imagem|imagem|figura|tirinha|grafico|gráfico|mapa)\b/i;
const PROTECTED_LINE_REGEX = /^\s*(?:quest(?:ao|ão)\s*\d{1,3}\b|leia\b|observe\b|texto\s*\d+\b|(?:\(?[A-Da-d]\)?[\).])\s+|\d{1,3}\s*[\).]\s*)/i;
const ADMIN_HEADER_REGEX = /^(?:escola|col[eé]gio|instituto|centro educacional|unidade escolar|prefeitura|secretaria|diretoria|coordena[cç][aã]o|supervis[aã]o)\b/i;
const ADMIN_FIELD_REGEX = /^(?:professor(?:a)?|aluno(?:a)?|estudante|turma|turno|s[eé]rie|ano|data|nota|valor|avalia[cç][aã]o|atividade|simulado|prova)\b/i;
const ADDRESS_REGEX = /^(?:endere[cç]o|rua|avenida|av\.|travessa|bairro|cidade|cep)\b/i;
const CNPJ_REGEX = /\b(?:cnpj\s*:?\s*)?\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/i;
const PHONE_REGEX = /\b(?:tel(?:efone)?|fone|whats(?:app)?)?\s*:?\s*(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}\b/i;
const PAGE_LINE_REGEX = /^\s*(?:p[aá]gina|pagina|page)\s*\d+\s*$/i;
const SYMBOL_ONLY_REGEX = /^[^A-Za-zÀ-ÿ]{4,}$/;
const RESPONSE_CARD_HEADER_REGEX = /^\s*(?:cart[aã]o\s*(?:de\s*)?resposta|gabarito\s*visual)\b/i;
const QUESTION_MARKER_REGEX = /^\s*(?:quest(?:ao|ão)\s*\d{1,3}\b|\d{1,3}\s*[\).])/i;
const ALT_MARKER_REGEX = /^\s*(?:\(?[A-Da-d]\)?[\).])\s+/;
const SUPPORT_MARKER_REGEX = /^\s*(?:leia|observe|texto\s*\d+\b)/i;
const SOURCE_REFERENCE_LINE_REGEX = /\b(?:dispon[iÃ­]vel\s+em:|fonte:|adaptado\s+de:|https?:\/\/|www\.|alexandre beck\.?\s*folha\s+de\s+s\.?\s*paulo|folha\s+de\s+s\.?\s*paulo\b|o globo\.?|o menino maluquinho|agosto\s+de\s+\d{4})\b/i;
const PDF_PROMPT_START_REGEX = /^\s*(?:qual\b|qual\s+[eÃ©]\b|qual\s+das\b|qual\s+seria\b|de\s+acordo\b|com\s+base\b|no\s+texto\b|no\s+trecho\b|na\s+frase\b|a\s+frase\b|a\s+palavra\b|a\s+express[aÃ£]o\b|durante\s+a\s+leitura\b|ap[oÃ³]s\s+concluir\b|identifique\b|marque\b|assinale\b|considerando\b|depois\s+da\s+resposta\b|a\s+partir\b|ao\s+comparar\b|o\s+uso\b)/i;
const PDF_READ_TIMEOUT_MS = 20000;
const PDF_PAGE_IMAGE_TIMEOUT_MS = 2500;

export function inferPdfImagePageFromObjectName(objectName = "") {
  const match = String(objectName || "").match(/\bimg_p(\d+)_/i);
  if (!match) return null;
  return Number(match[1]) + 1;
}

function extractPdfImageDecodeError(text = "") {
  const clean = String(text || "");
  const imageName = clean.match(/\bimg_p\d+_\d+\b/i)?.[0] || "";
  const paginaMarcada = inferPdfImagePageFromObjectName(clean);
  if (!imageName && !/unable to decode image|jpxerror/i.test(clean)) {
    return null;
  }
  return {
    imageName,
    paginaMarcada
  };
}

function isLinhaCartaoResposta(line) {
  const clean = normalizeCleanLine(line);
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

function imageDataToCanvasDataUrl(imageData, mimeType = "image/png") {
  if (!imageData?.width || !imageData?.height || !imageData?.data) {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const rgba = normalizeImagePixels(imageData);
  const clamped = new Uint8ClampedArray(rgba);
  context.putImageData(new ImageData(clamped, imageData.width, imageData.height), 0, 0);
  return canvas.toDataURL(mimeType);
}

function normalizeImagePixels(imageData) {
  const source = imageData.data;
  if (source.length === imageData.width * imageData.height * 4) {
    return source;
  }

  if (source.length === imageData.width * imageData.height * 3) {
    const rgba = new Uint8ClampedArray(imageData.width * imageData.height * 4);
    for (let i = 0, j = 0; i < source.length; i += 3, j += 4) {
      rgba[j] = source[i];
      rgba[j + 1] = source[i + 1];
      rgba[j + 2] = source[i + 2];
      rgba[j + 3] = 255;
    }
    return rgba;
  }

  return new Uint8ClampedArray(imageData.width * imageData.height * 4);
}

function estimatePdfFontSize(item = {}) {
  const transform = item?.transform || [];
  const vertical = Math.hypot(Number(transform[2] || 0), Number(transform[3] || 0));
  const horizontal = Math.hypot(Number(transform[0] || 0), Number(transform[1] || 0));
  return vertical || horizontal || Number(item?.height || 0) || 0;
}

function estimatePdfTextWidth(item = {}, text = "") {
  const width = Number(item?.width || 0);
  if (width > 0) return width;
  const fontSize = estimatePdfFontSize(item);
  return String(text || "").length * Math.max(fontSize * 0.45, 4);
}

function collectTextLayoutFromContent(textContent) {
  const rows = [];

  (textContent?.items || []).forEach(item => {
    const text = String(item?.str || "").trim();
    if (!text) return;

    const transform = item?.transform || [];
    const y = Number(transform[5] || 0);
    const x = Number(transform[4] || 0);
    const fontSize = estimatePdfFontSize(item);
    const width = estimatePdfTextWidth(item, text);
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 3);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, maxX: x + width, fontSize, text });
  });

  const layoutRows = rows
    .sort((a, b) => b.y - a.y)
    .map(row => {
      const items = row.items.sort((a, b) => a.x - b.x);
      const text = items
        .map(item => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        y: row.y,
        minX: Math.min(...items.map(item => item.x)),
        maxX: Math.max(...items.map(item => item.maxX || item.x)),
        fontSize: Math.max(...items.map(item => item.fontSize || 0)),
        text
      };
    })
    .filter(row => row.text);

  return {
    text: layoutRows.map(row => row.text).join("\n").trim(),
    rows: layoutRows
  };
}

function collectTextFromContent(textContent) {
  return collectTextLayoutFromContent(textContent).text;
}

function layoutRowsOf(page) {
  const rows = page?.layoutRows || page?.textRows || page?.linhasLayout || [];
  return Array.isArray(rows) ? rows : [];
}

function supportBoxesOf(page) {
  const boxes = page?.supportBoxes || page?.layoutBoxes || page?.caixasLayout || [];
  return Array.isArray(boxes) ? boxes : [];
}

function normalizeLayoutBox(box = {}) {
  const x = Number(box.x ?? box.minX ?? 0);
  const y = Number(box.y ?? box.minY ?? 0);
  const width = Number(box.width ?? (Number(box.maxX ?? 0) - x));
  const height = Number(box.height ?? (Number(box.maxY ?? 0) - y));
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const bottom = Math.min(y, y + height);
  const top = Math.max(y, y + height);
  return { left, right, bottom, top, width: right - left, height: top - bottom };
}

function medianNumber(values = []) {
  const clean = values.map(Number).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function normalizedLayoutRows(page) {
  return layoutRowsOf(page)
    .map(row => ({
      text: normalizeCleanLine(row?.text),
      key: normalizeForCompare(row?.text),
      minX: Number(row?.minX ?? row?.x ?? 0),
      maxX: Number(row?.maxX ?? row?.x ?? 0),
      y: Number(row?.y ?? 0),
      fontSize: Number(row?.fontSize ?? row?.size ?? 0)
    }))
    .filter(row => row.text && row.key);
}

function rowIntersectsBox(row, box, padding = 3) {
  const overlapsX = row.maxX >= box.left - padding && row.minX <= box.right + padding;
  const insideY = row.y >= box.bottom - padding && row.y <= box.top + padding;
  return overlapsX && insideY;
}

function findSupportBoxLayout(page) {
  const rows = normalizedLayoutRows(page);
  if (!rows.length) return null;

  const candidates = supportBoxesOf(page)
    .map(normalizeLayoutBox)
    .filter(box => box.width >= 120 && box.height >= 28)
    .map(box => {
      const insideRows = rows.filter(row => rowIntersectsBox(row, box));
      const aboveRows = rows.filter(row => row.y > box.top + 3);
      const belowRows = rows.filter(row => row.y < box.bottom - 3);
      const usefulInsideRows = insideRows.filter(row => !QUESTION_MARKER_REGEX.test(row.text) && !ALT_MARKER_REGEX.test(row.text));
      return { box, insideRows, aboveRows, belowRows, usefulInsideRows };
    })
    .filter(candidate => candidate.usefulInsideRows.length);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const scoreA = a.usefulInsideRows.length + (a.aboveRows.some(row => SUPPORT_MARKER_REGEX.test(row.text)) ? 2 : 0) + (a.belowRows.some(row => PDF_PROMPT_START_REGEX.test(row.text)) ? 2 : 0);
    const scoreB = b.usefulInsideRows.length + (b.aboveRows.some(row => SUPPORT_MARKER_REGEX.test(row.text)) ? 2 : 0) + (b.belowRows.some(row => PDF_PROMPT_START_REGEX.test(row.text)) ? 2 : 0);
    return scoreB - scoreA;
  });

  return candidates[0];
}

function applySupportBoxLayout(page, cleanLines) {
  const layout = page.supportBoxLayout;
  if (!layout || !Array.isArray(cleanLines) || cleanLines.length < 3) return cleanLines;

  const relationByKey = new Map();
  layout.aboveRows.forEach(row => relationByKey.set(row.key, "above"));
  layout.insideRows.forEach(row => relationByKey.set(row.key, "inside"));
  layout.belowRows.forEach(row => relationByKey.set(row.key, "below"));

  const questionLines = [];
  const beforeAlternatives = [];
  const alternativeLines = [];
  let inAlternatives = false;

  cleanLines.forEach(line => {
    if (ALT_MARKER_REGEX.test(line)) {
      inAlternatives = true;
    }
    if (inAlternatives) {
      alternativeLines.push(line);
    } else if (QUESTION_MARKER_REGEX.test(line)) {
      questionLines.push(line);
    } else {
      beforeAlternatives.push(line);
    }
  });

  const aboveLines = [];
  const insideLines = [];
  const belowLines = [];
  const unknownLines = [];

  beforeAlternatives.forEach(line => {
    const relation = relationByKey.get(normalizeForCompare(line));
    if (relation === "above") aboveLines.push(line);
    else if (relation === "inside") insideLines.push(line);
    else if (relation === "below") belowLines.push(line);
    else unknownLines.push(line);
  });

  if (!insideLines.length || !aboveLines.some(line => SUPPORT_MARKER_REGEX.test(line)) || !belowLines.some(line => PDF_PROMPT_START_REGEX.test(line))) {
    return cleanLines;
  }

  return [
    ...questionLines,
    ...aboveLines,
    ...insideLines,
    ...unknownLines,
    ...belowLines,
    ...alternativeLines
  ];
}

function extractSupportBoxesFromOperatorList(operatorList, OPS = {}) {
  const boxes = [];
  const rectangleOp = OPS.rectangle ?? 19;
  const constructPathOp = OPS.constructPath;
  if (!constructPathOp) return boxes;

  for (let i = 0; i < (operatorList?.fnArray || []).length; i += 1) {
    if (operatorList.fnArray[i] !== constructPathOp) continue;
    const args = operatorList.argsArray[i] || [];
    const pathOps = Array.isArray(args[0]) ? args[0] : [];
    const coords = Array.isArray(args[1]) ? args[1] : [];
    let cursor = 0;
    pathOps.forEach(pathOp => {
      if (pathOp === rectangleOp && coords.length >= cursor + 4) {
        const [x, y, width, height] = coords.slice(cursor, cursor + 4).map(Number);
        const box = normalizeLayoutBox({ x, y, width, height });
        if (box.width >= 120 && box.height >= 28) {
          boxes.push({ x, y, width, height });
        }
        cursor += 4;
      }
    });
  }

  return boxes;
}

function findRightImageSourceLines(page) {
  if (!page?.hasImage) return new Set();
  const rows = layoutRowsOf(page);
  if (!rows.length) return new Set();

  const usefulRows = rows
    .map(row => ({
      text: normalizeCleanLine(row?.text),
      minX: Number(row?.minX ?? row?.x ?? 0),
      maxX: Number(row?.maxX ?? row?.x ?? 0),
      fontSize: Number(row?.fontSize ?? row?.size ?? 0)
    }))
    .filter(row => row.text);

  if (!usefulRows.length) return new Set();
  const medianFont = medianNumber(usefulRows.map(row => row.fontSize));
  const minX = Math.min(...usefulRows.map(row => row.minX));
  const maxX = Math.max(...usefulRows.map(row => row.maxX));
  const pageCenter = minX + ((maxX - minX) / 2);

  return new Set(usefulRows
    .filter(row => SOURCE_REFERENCE_LINE_REGEX.test(row.text))
    .filter(row => {
      const rightSide = row.minX >= pageCenter || row.minX >= minX + ((maxX - minX) * 0.55);
      const smallText = medianFont > 0 && row.fontSize > 0 && row.fontSize <= medianFont * 0.88;
      return rightSide || smallText;
    })
    .map(row => normalizeForCompare(row.text)));
}

function normalizeCleanLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(line) {
  return normalizeCleanLine(line)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isProtectedPdfLine(line) {
  const clean = String(line || "").trim();
  return PROTECTED_LINE_REGEX.test(clean) || SOURCE_REFERENCE_LINE_REGEX.test(clean);
}

function splitGluedMarkers(text) {
  return String(text || "")
    .replace(/([A-Za-zÀ-ÿ])-\n\s*([A-Za-zÀ-ÿ])/g, "$1$2")
    .replace(/\s+(quest(?:ao|ão)\s*\d{1,3}\b)/gi, "\n$1")
    .replace(/(quest(?:ao|ão)\s*\d{1,3})\s+(?=leia|observe|texto\s*\d+\b)/gi, "$1\n")
    .replace(/(\d{1,3}\s*[\).](?:\s*\([^)]+\))?.*?)\s+((?:\(?[A-Da-d]\)?[\).])\s+)/g, "$1\n$2")
    .replace(/\s+((?:\(?[A-Da-d]\)?[\).])\s+)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n");
}

function isAdministrativePdfLine(line) {
  const clean = normalizeCleanLine(line);
  if (!clean) return true;
  if (isProtectedPdfLine(clean)) return false;

  const normalized = normalizeForCompare(clean);
  return RESPONSE_CARD_HEADER_REGEX.test(clean) ||
    ADMIN_HEADER_REGEX.test(clean) ||
    (ADMIN_FIELD_REGEX.test(clean) && (/[:_\-]/.test(clean) || clean.length <= 28)) ||
    (ADDRESS_REGEX.test(clean) && (/\d/.test(clean) || /\b(?:bairro|cidade|cep)\b/i.test(clean))) ||
    CNPJ_REGEX.test(clean) ||
    PHONE_REGEX.test(clean) ||
    PAGE_LINE_REGEX.test(clean) ||
    SYMBOL_ONLY_REGEX.test(clean) ||
    /^(?:saeb|saepi|idepb|inep|mec)\b/.test(normalized);
}

function pageNumberOf(page) {
  return Number(page?.page ?? page?.pagina ?? 0) || 0;
}

function rawTextOf(page) {
  return String(page?.text ?? page?.texto ?? "");
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  let timerId = null;
  const timeout = new Promise(resolve => {
    timerId = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
}

export function cleanPdfText(textoPorPagina = []) {
  const sourcePages = Array.isArray(textoPorPagina) ? textoPorPagina : [];
  const alertas = [];
  const linePages = new Map();

  const prepared = sourcePages.map(page => {
    const pageNumber = pageNumberOf(page);
    const lines = splitGluedMarkers(rawTextOf(page)).split("\n").map(normalizeCleanLine);
    const rightImageSourceLines = findRightImageSourceLines(page);

    lines.forEach(line => {
      const key = normalizeForCompare(line);
      if (!key || isProtectedPdfLine(line)) return;
      if (!linePages.has(key)) linePages.set(key, new Set());
      linePages.get(key).add(pageNumber);
    });

    return {
      page: pageNumber,
      hasImage: Boolean(page?.hasImage || page?.temImagem),
      rightImageSourceLines,
      supportBoxLayout: findSupportBoxLayout(page),
      lines
    };
  });

  const repeatedLines = new Set(
    [...linePages.entries()]
      .filter(([, pages]) => pages.size >= 2)
      .map(([line]) => line)
  );

  const pages = prepared.map(page => {
    const cleanLines = [];

    page.lines.forEach(line => {
      const key = normalizeForCompare(line);
      if (!line) return;
      if (repeatedLines.has(key) && !isProtectedPdfLine(line)) {
        return;
      }
      if (isLinhaCartaoResposta(line)) {
        return;
      }
      if (isAdministrativePdfLine(line)) {
        return;
      }
      cleanLines.push(line);
    });

    const visualLines = applySupportBoxLayout(page, cleanLines);
    cleanLines.splice(0, cleanLines.length, ...visualLines);

    if (page.hasImage && page.rightImageSourceLines?.size) {
      const visualSourceLines = cleanLines.filter(line => page.rightImageSourceLines.has(normalizeForCompare(line)));
      if (visualSourceLines.length) {
        for (let i = cleanLines.length - 1; i >= 0; i -= 1) {
          if (page.rightImageSourceLines.has(normalizeForCompare(cleanLines[i])) || cleanLines[i] === "[imagem aqui]") {
            cleanLines.splice(i, 1);
          }
        }
        const promptIndex = cleanLines.findIndex(line => PDF_PROMPT_START_REGEX.test(line));
        const insertIndex = promptIndex === -1 ? cleanLines.length : promptIndex;
        cleanLines.splice(insertIndex, 0, "[imagem aqui]", ...visualSourceLines);
      }
    }

    const hintIndex = cleanLines.findIndex(line => PDF_IMAGE_HINT_REGEX.test(line) && !ALT_MARKER_REGEX.test(line));
    const hasImagePlaceholder = page.hasImage || hintIndex !== -1;
    if (hasImagePlaceholder && !cleanLines.includes("[imagem aqui]")) {
      const imageSourceIndex = cleanLines.findIndex(line => page.rightImageSourceLines?.has(normalizeForCompare(line)));
      const boxedPromptIndex = page.supportBoxLayout ? cleanLines.findIndex(line => PDF_PROMPT_START_REGEX.test(line)) : -1;
      const supportIndex = cleanLines.findIndex(line => SUPPORT_MARKER_REGEX.test(line));
      const questionIndex = cleanLines.findIndex(line => QUESTION_MARKER_REGEX.test(line));
      const insertIndex = imageSourceIndex !== -1
        ? imageSourceIndex
        : boxedPromptIndex !== -1
        ? boxedPromptIndex
        : hintIndex !== -1
        ? hintIndex + 1
        : supportIndex !== -1 ? supportIndex + 1 : questionIndex === -1 ? cleanLines.length : questionIndex;
      cleanLines.splice(insertIndex, 0, "[imagem aqui]");
    }

    return {
      page: page.page,
      cleanText: cleanLines.join("\n").trim()
    };
  });

  if (repeatedLines.size) {
    alertas.push(`${repeatedLines.size} linha(s) repetida(s) de cabecalho/rodape removida(s).`);
  }

  if (prepared.some(page => page.hasImage) || pages.some(page => page.cleanText.includes("[imagem aqui]"))) {
    alertas.push("Indicacoes de imagem foram marcadas como [imagem aqui]. Insira a imagem manualmente na revisao.");
  }

  return {
    text: pages.map(page => page.cleanText).filter(Boolean).join("\n\n").trim(),
    pages,
    alertas
  };
}

async function resolvePageObject(page, name) {
  return await new Promise(resolve => {
    try {
      page.objs.get(name, data => {
        if (data) {
          resolve(data);
          return;
        }
        try {
          page.commonObjs.get(name, commonData => resolve(commonData || null));
        } catch {
          resolve(null);
        }
      });
    } catch {
      try {
        page.commonObjs.get(name, commonData => resolve(commonData || null));
      } catch {
        resolve(null);
      }
    }
  });
}

async function extractPageImages(page, pageNumber) {
  const operatorList = await page.getOperatorList();
  const images = [];
  const seen = new Set();
  const imageEvidencePages = new Set();
  const imageNamesFound = new Set();
  const imageDecodeErrors = new Set();
  const OPS = pdfjsLib.OPS || {};
  const hasImageOps = operatorList.fnArray.some(fn => (
    fn === OPS.paintImageXObject ||
    fn === OPS.paintInlineImageXObject ||
    fn === OPS.paintImageXObjectRepeat
  ));
  const supportBoxes = extractSupportBoxesFromOperatorList(operatorList, OPS);

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] || [];

    if (fn === OPS.paintImageXObject) {
      const objectName = args[0];
      if (!objectName || seen.has(objectName)) continue;
      seen.add(objectName);
      const paginaMarcada = inferPdfImagePageFromObjectName(objectName) || pageNumber;
      imageEvidencePages.add(paginaMarcada);
      if (/^img_p\d+_/i.test(String(objectName))) {
        imageNamesFound.add(String(objectName));
      }
      const imageData = await withTimeout(resolvePageObject(page, objectName), 700, null);
      const dataUrl = imageDataToCanvasDataUrl(imageData);
      if (dataUrl) {
        images.push({
          nome: `${objectName}.png`,
          pagina: pageNumber,
          origem: "pdf-image-xobject",
          dataUrl
        });
      } else if (/^img_p\d+_/i.test(String(objectName))) {
        imageDecodeErrors.add(String(objectName));
      }
    }

    if (fn === OPS.paintInlineImageXObject) {
      const imageData = args[0];
      imageEvidencePages.add(pageNumber);
      const dataUrl = imageDataToCanvasDataUrl(imageData);
      if (dataUrl) {
        images.push({
          nome: `pagina-${pageNumber}-inline-${images.length + 1}.png`,
          pagina: pageNumber,
          origem: "pdf-inline-image",
          dataUrl
        });
      }
    }

    if (fn === OPS.paintImageXObjectRepeat) {
      const objectName = args[0];
      if (!objectName || seen.has(`${objectName}-repeat`)) continue;
      seen.add(`${objectName}-repeat`);
      const paginaMarcada = inferPdfImagePageFromObjectName(objectName) || pageNumber;
      imageEvidencePages.add(paginaMarcada);
      if (/^img_p\d+_/i.test(String(objectName))) {
        imageNamesFound.add(String(objectName));
      }
      const imageData = await withTimeout(resolvePageObject(page, objectName), 700, null);
      const dataUrl = imageDataToCanvasDataUrl(imageData);
      if (dataUrl) {
        images.push({
          nome: `${objectName}-repeat.png`,
          pagina: pageNumber,
          origem: "pdf-image-repeat",
          dataUrl
        });
      } else if (/^img_p\d+_/i.test(String(objectName))) {
        imageDecodeErrors.add(String(objectName));
      }
    }
  }

  if (!images.length && hasImageOps && !imageNamesFound.size) {
    try {
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");

      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
        images.push({
          nome: `pagina-${pageNumber}-render.png`,
          pagina: pageNumber,
          origem: "pdf-page-render",
          dataUrl: canvas.toDataURL("image/png")
        });
      }
    } catch {
      // fallback silencioso: se a renderizacao falhar, seguimos sem imagens
    }
  }

  images.hasImageOps = hasImageOps;
  images.imageEvidencePages = [...imageEvidencePages];
  images.imageNamesFound = [...imageNamesFound];
  images.imageDecodeErrors = [...imageDecodeErrors];
  images.pagesWithImageDecodeError = [...new Set([...imageDecodeErrors].map(name => inferPdfImagePageFromObjectName(name)).filter(Boolean))];
  images.supportBoxes = supportBoxes;
  return images;
}

export function detectQuestionImageProbability(question = {}) {
  const text = [question.textoApoio, question.enunciado]
    .filter(Boolean)
    .join(" ");
  return IMAGE_HINT_REGEX.test(String(text || ""));
}

export async function extractPdfAssessment(file) {
  if (!file) {
    throw new Error("Nenhum arquivo PDF foi informado.");
  }

  const pageTexts = [];
  const pages = [];
  const imagensPendentes = [];
  const alertas = [];
  const capturedImageDecodeErrors = [];
  const capturedPdfDiagnostics = [];
  const imageNamesFound = new Set();
  const pagesWithImageDecodeError = new Set();
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const capturePdfImageDecodeLog = (...args) => {
    const text = args.map(item => typeof item === "string" ? item : item?.message || String(item || "")).join(" ");
    const matches = [...text.matchAll(/\bimg_p(\d+)_\d+\b/gi)];
    if (matches.length) {
      capturedPdfDiagnostics.push(text);
      matches.forEach(match => {
        imageNamesFound.add(match[0]);
        pagesWithImageDecodeError.add(Number(match[1]) + 1);
      });
    }
    const detected = extractPdfImageDecodeError(text);
    if (!detected?.paginaMarcada) return;
    if (detected.imageName) imageNamesFound.add(detected.imageName);
    pagesWithImageDecodeError.add(Number(detected.paginaMarcada));
    const exists = capturedImageDecodeErrors.some(item => item.imageName === detected.imageName && item.paginaMarcada === detected.paginaMarcada);
    if (!exists) {
      capturedImageDecodeErrors.push(detected);
    }
  };
  const startedAt = Date.now();
  let pdf = null;

  try {
    console.log = (...args) => {
      capturePdfImageDecodeLog(...args);
      originalConsoleLog.apply(console, args);
    };
    console.error = (...args) => {
      capturePdfImageDecodeLog(...args);
      originalConsoleError.apply(console, args);
    };
    console.warn = (...args) => {
      capturePdfImageDecodeLog(...args);
      originalConsoleWarn.apply(console, args);
    };

    const buffer = await withTimeout(file.arrayBuffer(), PDF_READ_TIMEOUT_MS, null);
    if (!buffer) {
      alertas.push("Tempo limite ao ler o arquivo PDF. Nenhum texto foi extraido.");
      console.error("Erro ao processar PDF", new Error("Timeout ao ler ArrayBuffer do PDF"));
    } else {
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      pdf = await withTimeout(loadingTask.promise, PDF_READ_TIMEOUT_MS, null);
    }

    if (pdf) {
      for (let i = 1; i <= pdf.numPages; i += 1) {
        if (Date.now() - startedAt > PDF_READ_TIMEOUT_MS) {
          alertas.push("Tempo limite atingido durante a leitura do PDF. O texto parcial foi usado.");
          break;
        }

        try {
          const page = await withTimeout(pdf.getPage(i), PDF_PAGE_IMAGE_TIMEOUT_MS, null);
          if (!page) {
            alertas.push(`Tempo limite ao carregar a pagina ${i}.`);
            continue;
          }

          const textContent = await withTimeout(page.getTextContent(), PDF_PAGE_IMAGE_TIMEOUT_MS, null);
          const pageTextLayout = textContent ? collectTextLayoutFromContent(textContent) : { text: "", rows: [] };
          const pageText = pageTextLayout.text;
          let pageImages = [];
          let pageImageDecodeError = false;
          let pageImageEvidencePages = [];
          let pageImageDecodeErrors = [];
          let pageHasImageOps = false;
          let pageSupportBoxes = [];
          try {
            pageImages = await withTimeout(extractPageImages(page, i), PDF_PAGE_IMAGE_TIMEOUT_MS, []);
            pageImageEvidencePages = Array.isArray(pageImages?.imageEvidencePages) ? pageImages.imageEvidencePages : [];
            pageImageDecodeErrors = Array.isArray(pageImages?.imageDecodeErrors) ? pageImages.imageDecodeErrors : [];
            pageHasImageOps = Boolean(pageImages?.hasImageOps);
            pageSupportBoxes = Array.isArray(pageImages?.supportBoxes) ? pageImages.supportBoxes : [];
            (pageImages?.imageNamesFound || []).forEach(name => {
              imageNamesFound.add(name);
              const inferredPage = inferPdfImagePageFromObjectName(name);
              if (inferredPage) pageImageEvidencePages = [...new Set([...pageImageEvidencePages, inferredPage])];
            });
            pageImageDecodeErrors.forEach(name => {
              imageNamesFound.add(name);
              const inferredPage = inferPdfImagePageFromObjectName(name);
              if (inferredPage) pagesWithImageDecodeError.add(inferredPage);
            });
            (pageImages?.pagesWithImageDecodeError || []).forEach(item => {
              const inferredPage = Number(item);
              if (inferredPage) pagesWithImageDecodeError.add(inferredPage);
            });
            imagensPendentes.push(...pageImages);
          } catch (imageError) {
            const imageErrorText = String(imageError?.message || imageError || "");
            const inferredErrorPage = inferPdfImagePageFromObjectName(imageErrorText);
            const imageName = imageErrorText.match(/\bimg_p\d+_\d+\b/i)?.[0] || "";
            pageImageDecodeError = /unable to decode image|jpxerror|img_p\d+_/i.test(imageErrorText);
            if (pageImageDecodeError) {
              if (imageName) imageNamesFound.add(imageName);
              if (inferredErrorPage) {
                pageImageEvidencePages = [...new Set([...pageImageEvidencePages, inferredErrorPage])];
                pagesWithImageDecodeError.add(inferredErrorPage);
              }
              alertas.push(`JpxError/Unable to decode image na pagina ${inferredErrorPage || i}.`);
            }
            console.error("Erro ao extrair imagens da página", i, imageError);
          }

          if (pageText) {
            pageTexts.push(`PAGINA ${i}\n${pageText}`);
          }
          pages.push({
            page: i,
            pagina: i,
            text: pageText || "",
            texto: pageText || "",
            layoutRows: pageTextLayout.rows,
            supportBoxes: pageSupportBoxes,
            hasImage: pageImages.length > 0 || pageImageDecodeError || pageHasImageOps || pageImageEvidencePages.includes(i) || pagesWithImageDecodeError.has(i),
            imageDecodeError: pageImageDecodeError || pageImageEvidencePages.includes(i) || pagesWithImageDecodeError.has(i),
            imageEvidencePages: pageImageEvidencePages,
            imageNamesFound: [...imageNamesFound],
            imageDecodeErrorNames: pageImageDecodeErrors
          });
        } catch (e) {
          console.error("Erro na página", i, e);
          alertas.push(`Erro ao ler a pagina ${i}; a leitura continuou.`);
          continue;
        }
      }
    }
  } catch (error) {
    console.error("Erro ao processar PDF", error);
    alertas.push("Erro ao processar PDF");
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }

  capturedImageDecodeErrors.forEach(error => {
    const targetPage = Number(error.paginaMarcada);
    if (!targetPage) return;
    if (error.imageName) imageNamesFound.add(error.imageName);
    pagesWithImageDecodeError.add(targetPage);
    let page = pages.find(item => Number(item.page) === targetPage);
    if (!page) {
      page = {
        page: targetPage,
        pagina: targetPage,
        text: "",
        texto: "",
        hasImage: false,
        imageDecodeError: false,
        imageEvidencePages: []
      };
      pages.push(page);
    }
    page.hasImage = true;
    page.imageDecodeError = true;
    page.imageEvidencePages = [...new Set([...(page.imageEvidencePages || []), targetPage])];
  });

  pagesWithImageDecodeError.forEach(targetPage => {
    const pageNumber = Number(targetPage);
    if (!pageNumber) return;
    let page = pages.find(item => Number(item.page) === pageNumber);
    if (!page) {
      page = {
        page: pageNumber,
        pagina: pageNumber,
        text: "",
        texto: "",
        hasImage: false,
        imageDecodeError: false,
        imageEvidencePages: [],
        imageDecodeErrorNames: []
      };
      pages.push(page);
    }
    page.hasImage = true;
    page.imageDecodeError = true;
    page.imageEvidencePages = [...new Set([...(page.imageEvidencePages || []), pageNumber])];
  });

  const cleaned = cleanPdfText(pages);
  const finalAlertas = [...alertas, ...cleaned.alertas];

  const extracted = {
    cabecalho: "",
    textoBruto: pageTexts.join("\n\n").trim(),
    textoExtraido: cleaned.text,
    pages: cleaned.pages.map(page => {
      const originalPage = pages.find(item => Number(item.page) === Number(page.page)) || {};
      const imageEvidencePages = Array.isArray(originalPage.imageEvidencePages) ? originalPage.imageEvidencePages : [];
      const imageDecodeErrorNames = Array.isArray(originalPage.imageDecodeErrorNames) ? originalPage.imageDecodeErrorNames : [];
      const imageDecodeErrors = [
        ...imageDecodeErrorNames,
        ...(originalPage.imageDecodeError ? [`pagina ${page.page}`] : []),
        ...imageEvidencePages.map(item => `pagina ${item}`)
      ];
      return {
        page: page.page,
        pagina: page.page,
        pageNumber: page.page,
        cleanText: page.cleanText,
        texto: page.cleanText,
        hasImage: Boolean(originalPage.hasImage),
        imagemProvavel: Boolean(originalPage.hasImage || originalPage.imageDecodeError || imageEvidencePages.includes(page.page)),
        imageDecodeError: Boolean(originalPage.imageDecodeError),
        imageDecodeErrors,
        imageEvidencePages
      };
    }),
    imagensPendentes: [],
    imagensDetectadas: imagensPendentes.length,
    imageDecodeErrors: capturedImageDecodeErrors,
    pdfDiagnostics: {
      logs: capturedPdfDiagnostics,
      imageNamesFound: [...imageNamesFound],
      pagesWithImageDecodeError: [...pagesWithImageDecodeError]
    },
    alertas: finalAlertas
  };

  return extracted;
}
