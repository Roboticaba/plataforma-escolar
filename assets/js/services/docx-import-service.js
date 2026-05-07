function ensureJSZipAvailable() {
  const instance = globalThis.JSZip;
  if (!instance) {
    throw new Error("A biblioteca de leitura DOCX nao foi carregada.");
  }
  return instance;
}

function getImageMimeType(filename = "") {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function xmlToTextLines(xmlText = "") {
  if (!xmlText) return [];

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");
  const paragraphs = [...xml.getElementsByTagName("w:p")];

  return paragraphs
    .map(paragraph => {
      const fragments = [];
      paragraph.childNodes.forEach(node => {
        const tagName = node.nodeName || "";
        if (tagName === "w:r" || tagName === "w:hyperlink" || tagName === "w:sdt") {
          fragments.push(extractRunText(node));
        } else if (tagName === "w:br") {
          fragments.push("\n");
        }
      });
      return fragments.join("").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
    })
    .filter(Boolean);
}

function extractRunText(node) {
  const pieces = [];
  const walk = current => {
    [...current.childNodes || []].forEach(child => {
      const tagName = child.nodeName || "";
      if (tagName === "w:t") {
        pieces.push(child.textContent || "");
        return;
      }
      if (tagName === "w:tab") {
        pieces.push(" ");
        return;
      }
      if (tagName === "w:br" || tagName === "w:cr") {
        pieces.push("\n");
        return;
      }
      walk(child);
    });
  };
  walk(node);
  return pieces.join("");
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem extraida do DOCX."));
    reader.readAsDataURL(blob);
  });
}

export async function extractDocxAssessment(file) {
  if (!file) {
    throw new Error("Nenhum arquivo DOCX foi informado.");
  }

  const JSZip = ensureJSZipAvailable();
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("O arquivo DOCX nao possui o conteudo principal esperado.");
  }

  const documentXml = await documentFile.async("string");
  const bodyLines = xmlToTextLines(documentXml);
  const headerFiles = Object.keys(zip.files)
    .filter(name => /^word\/header\d+\.xml$/i.test(name))
    .sort();

  const headerTexts = [];
  for (const headerName of headerFiles) {
    const headerXml = await zip.file(headerName)?.async("string");
    if (headerXml) {
      headerTexts.push(...xmlToTextLines(headerXml));
    }
  }

  const imageNames = Object.keys(zip.files)
    .filter(name => /^word\/media\//i.test(name))
    .sort();

  const imagensPendentes = [];
  for (const imageName of imageNames) {
    const binary = await zip.file(imageName)?.async("uint8array");
    if (!binary) continue;
    const blob = new Blob([binary], { type: getImageMimeType(imageName) });
    const dataUrl = await blobToDataUrl(blob);
    imagensPendentes.push({
      nome: imageName.split("/").pop() || imageName,
      caminhoInterno: imageName,
      mimeType: blob.type,
      dataUrl
    });
  }

  return {
    cabecalho: headerTexts.join("\n").trim(),
    textoExtraido: [...headerTexts, ...bodyLines].join("\n").trim(),
    imagensPendentes,
    alertas: imagensPendentes.length
      ? ["Imagens extraidas precisam ser associadas manualmente."]
      : []
  };
}
