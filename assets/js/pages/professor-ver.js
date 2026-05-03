import { getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { db } from "../core/firebase-app.js";
import { requireProfessor } from "../core/session.js";
import { getConfiguracoesProfessor } from "../services/configuracoes-service.js";
import { getLegacyOrNewProva, resolveProvaContent } from "../services/provas-service.js";
import { getAlternativeLabel } from "../services/questions-service.js";
import { escapeHtml } from "../utils/ui.js";

const usuario = requireProfessor();

const elements = {
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  content: document.getElementById("prova-content"),
  title: document.getElementById("prova-nome"),
  disciplina: document.getElementById("prova-disciplina"),
  ano: document.getElementById("prova-ano"),
  tempo: document.getElementById("prova-tempo"),
  valor: document.getElementById("prova-valor"),
  origem: document.getElementById("prova-origem"),
  listaQuestoes: document.getElementById("lista-questoes")
};

let provaAtual = null;
let conteudoProva = [];
let configuracoes = null;

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function isCorrectAlternative(question, altIndex) {
  return String(question.resposta_correta ?? question.respostaCorreta ?? "") === String(altIndex);
}

function renderAlternativas(question) {
  if (!(question.alternativas || []).length) {
    return `
      <div class="print-alternative" style="font-style:italic;color:#60738a;">
        Resposta escrita${question.respostaEsperada ? `: ${escapeHtml(question.respostaEsperada)}` : ""}
      </div>
    `;
  }

  return (question.alternativas || []).map((alt, altIndex) => {
    const texto = typeof alt === "string" ? alt : alt?.texto || "";
    const imagem = typeof alt === "object" ? alt?.imagemUrl || alt?.url || "" : "";
    return `
      <div class="print-alternative">
        <strong>${escapeHtml(getAlternativeLabel(altIndex, question.formatoAlternativas))}</strong>
        <div>
          ${texto ? escapeHtml(texto) : ""}
        ${imagem ? `<div style="margin-top:8px;"><img src="${imagem}" style="max-width:180px; max-height:120px; border-radius:10px; object-fit:contain;"></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderSupport(textoApoio, imagensApoio = []) {
  const imagens = (imagensApoio || [])
    .map(url => `<img src="${url}" style="max-width:220px; max-height:140px; border-radius:12px; margin:8px 8px 0 0; object-fit:contain;">`)
    .join("");

  return `
    ${textoApoio ? `<div class="panel-subtitle" style="white-space:pre-wrap;"><strong>Texto de apoio:</strong> ${escapeHtml(textoApoio)}</div>` : ""}
    ${imagens ? `<div style="margin-top:10px;">${imagens}</div>` : ""}
  `;
}

function renderQuestionCard(question, number, options = {}) {
  return `
    <article class="print-question">
      <div class="print-question-number">Questao ${number}</div>
      ${options.hideSupport ? "" : `<div class="print-support">${renderSupport(question.textoApoio, question.imagensApoio)}</div>`}
      <div style="font-size:1rem; line-height:1.7; font-weight:600; margin-top:12px;">${escapeHtml(question.enunciado || question.pergunta || "")}</div>
      ${renderAlternativas(question)}
    </article>
  `;
}

function renderBlock(block, startNumber) {
  const images = (block.imagensApoio || [])
    .map(url => `<img src="${url}" style="max-width:240px; max-height:150px; border-radius:12px; margin:8px 8px 0 0; object-fit:contain;">`)
    .join("");

  const questions = (block.questoes || [])
    .map((question, index) => renderQuestionCard(question, startNumber + index, { hideSupport: true }))
    .join("");

  return `
    <article class="print-block">
      <div style="font-size:1.05rem; font-weight:800; margin-bottom:10px;">${escapeHtml(block.titulo || "Bloco baseado em texto")}</div>
      ${block.textoApoio ? `<div class="print-support">${escapeHtml(block.textoApoio)}</div>` : ""}
      ${images ? `<div style="margin-top:10px;">${images}</div>` : ""}
      <div style="margin-top:14px;">${questions}</div>
    </article>
  `;
}

function renderQuestions() {
  if (!conteudoProva.length) {
    elements.listaQuestoes.innerHTML = '<div class="question-card"><div class="empty-panel">Nenhuma questao cadastrada nesta prova.</div></div>';
    return;
  }

  let questionNumber = 1;
  const questoesMarkup = conteudoProva.map(item => {
    if (item.tipo === "bloco") {
      const html = renderBlock(item, questionNumber);
      questionNumber += item.questoes?.length || 0;
      return html;
    }

    const html = renderQuestionCard(item.questao, questionNumber);
    questionNumber += 1;
    return html;
  }).join("");

  elements.listaQuestoes.innerHTML = `
    <section class="print-preview-sheet">
      <header class="print-preview-header">
        <div style="font-size:1.3rem; font-weight:800;">${escapeHtml(provaAtual?.titulo || provaAtual?.nome || "Prova")}</div>
        <div class="print-preview-fields">
          <div class="print-line"><strong>Aluno(a):</strong> <span style="flex:1;"></span></div>
          <div class="print-line"><strong>Turma:</strong> <span style="flex:1;"></span></div>
          <div class="print-line"><strong>Professor(a):</strong> <span style="flex:1;"></span></div>
          <div class="print-line"><strong>Data:</strong> ___/___/_____</div>
        </div>
      </header>
      ${questoesMarkup}
    </section>
  `;
}

async function loadProva() {
  const id = getQueryParam("id");
  if (!id) {
    throw new Error("ID da prova nao informado.");
  }

  const prova = await getLegacyOrNewProva(id, getQueryParam("source"));
  if (!prova) {
    throw new Error("Prova nao encontrada.");
  }

  if (prova.criadoPor && prova.criadoPor !== usuario.uid) {
    throw new Error("Voce nao tem permissao para visualizar esta prova.");
  }

  provaAtual = prova;
  conteudoProva = await resolveProvaContent(prova);
  try {
    configuracoes = await getConfiguracoesProfessor(usuario.uid);
  } catch (error) {
    console.warn("Nao foi possivel carregar as configuracoes do professor.", error);
    configuracoes = null;
  }

  elements.title.textContent = prova.titulo || prova.nome || "Prova";
  elements.disciplina.textContent = getDisciplinaLabel(prova.disciplina);
  elements.ano.textContent = getAnoLabel(prova.anoEscolar || prova.ano);
  elements.tempo.textContent = `${prova.tempoMinutos || prova.tempo || 60} min`;
  elements.valor.textContent = `${Number(prova.valorTotal || prova.valor || 10).toFixed(1)} pontos`;
  elements.origem.textContent = prova.source === "provas" ? "Questoes e blocos" : "Formato legado";
  renderQuestions();
}

async function deleteCurrentProva() {
  if (!provaAtual) return;
  if (!confirm("Excluir prova?")) return;

  const collection = provaAtual.source === "provas" ? "provas" : "simulados";
  await db.collection(collection).doc(provaAtual.id).delete();
  window.location.href = "professor-banco.html";
}

function renderSupportExport(textoApoio, imagensApoio = []) {
  return `
    ${textoApoio ? `<div style="white-space:pre-wrap; margin:0 0 8px; color:#334155; font-size:12pt;">${escapeHtml(textoApoio)}</div>` : ""}
    ${(imagensApoio || []).length ? `<table role="presentation" style="border-collapse:collapse; margin-bottom:8px;"><tr>${imagensApoio.map(url => `<td style="padding:0 8px 8px 0;"><img src="${url}" style="max-width:205px; max-height:135px; border-radius:6px;"></td>`).join("")}</tr></table>` : ""}
  `;
}

function renderAlternativasExport(question) {
  if (!(question.alternativas || []).length) {
    return '<div style="height:90px; border:1px solid #cbd5e1; border-radius:10px; margin-top:10px;"></div>';
  }

  const hasImages = (question.alternativas || []).some(alt => typeof alt === "object" && (alt?.imagemUrl || alt?.url));
  const items = (question.alternativas || []).map((alt, altIndex) => {
    const texto = typeof alt === "string" ? alt : alt?.texto || "";
    const imagem = typeof alt === "object" ? alt?.imagemUrl || alt?.url || "" : "";
    if (hasImages) {
      return `
        <td style="width:25%; padding:4px 8px 8px 0; vertical-align:top; page-break-inside:avoid;">
          <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(getAlternativeLabel(altIndex, question.formatoAlternativas))}</div>
          ${texto ? `<div>${escapeHtml(texto)}</div>` : ""}
          ${imagem ? `<img src="${imagem}" style="max-width:150px; max-height:105px; border-radius:6px;">` : ""}
        </td>
      `;
    }

    return `<div style="margin:6px 0; page-break-inside:avoid;"><span style="font-weight:600;">${escapeHtml(getAlternativeLabel(altIndex, question.formatoAlternativas))}</span> ${texto ? escapeHtml(texto) : ""}</div>`;
  });

  if (!hasImages) {
    return items.join("");
  }

  const rows = [];
  for (let index = 0; index < items.length; index += 4) {
    rows.push(`<tr>${items.slice(index, index + 4).join("")}</tr>`);
  }
  return `<table role="presentation" style="width:100%; border-collapse:collapse; table-layout:fixed;">${rows.join("")}</table>`;
}

function renderQuestionExport(question, number, hideSupport = false) {
  return `
    <section style="margin:0 0 13px; break-inside:avoid; page-break-inside:avoid;">
      <div style="font-weight:700; margin-bottom:5px;">QUESTAO ${number}</div>
      ${hideSupport ? "" : renderSupportExport(question.textoApoio, question.imagensApoio)}
      <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(question.enunciado || question.pergunta || "")}</div>
      ${renderAlternativasExport(question)}
    </section>
  `;
}

function renderBlockExport(block, startNumber) {
  const questions = (block.questoes || [])
    .map((question, index) => renderQuestionExport(question, startNumber + index, true))
    .join("");

  return `
    <section style="margin:0 0 14px; padding:8px 10px 1px; border-left:4px solid #7c3aed; background:#faf7ff;">
      <div style="font-size:16px; font-weight:700; margin-bottom:6px; page-break-after:avoid;">${escapeHtml(block.titulo || "Bloco baseado em texto")}</div>
      ${renderSupportExport(block.textoApoio, block.imagensApoio)}
      ${questions}
    </section>
  `;
}

async function imageToDataUrl(url) {
  if (!url || url.startsWith("data:")) {
    return url || "";
  }

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return url;
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return url;
  }
}

function buildSchoolInfoLines(cfg) {
  const enderecoCompleto = String(cfg.endereco || "")
    .replace(/\s+/g, " ")
    .replace(/([0-9])CEP:/i, "$1 - CEP:")
    .trim();
  const telefone = String(cfg.telefone || "").trim();
  const cnpj = String(cfg.cnpj || "").trim();

  if (!enderecoCompleto) {
    const contato = [telefone, cnpj].filter(Boolean).join(" - ");
    return contato ? [contato] : [];
  }

  const splitIndexes = [
    enderecoCompleto.search(/\bFone:/i),
    enderecoCompleto.search(/\bCNPJ:/i),
    enderecoCompleto.search(/\bCEP:/i)
  ].filter(index => index > 0);
  const firstSplit = splitIndexes.length ? Math.min(...splitIndexes) : -1;
  const endereco = firstSplit > 0
    ? enderecoCompleto.slice(0, firstSplit).replace(/\s*-\s*$/, "").trim()
    : enderecoCompleto;
  const contatoDoEndereco = firstSplit > 0 ? enderecoCompleto.slice(firstSplit).trim() : "";
  const contato = [contatoDoEndereco, telefone, cnpj].filter(Boolean).join(" - ");

  return [endereco, contato].filter(Boolean);
}

function buildExportMarkup(options = {}) {
  const cfg = configuracoes || {};
  const logoUrl = options.logoUrl || cfg.logoUrl || "";
  const headerLogo = logoUrl ? `<img src="${logoUrl}" style="max-width:135px; max-height:96px; object-fit:contain;">` : "";
  const schoolInfo = buildSchoolInfoLines(cfg)
    .map(line => `<div style="color:#475569; font-size:10.5px; line-height:1.45; margin-top:2px; overflow-wrap:break-word;">${escapeHtml(line)}</div>`)
    .join("");
  let questionNumber = 1;
  const questoes = conteudoProva.map(item => {
    if (item.tipo === "bloco") {
      const html = renderBlockExport(item, questionNumber);
      questionNumber += item.questoes?.length || 0;
      return html;
    }

    const html = renderQuestionExport(item.questao, questionNumber);
    questionNumber += 1;
    return html;
  }).join("");

  return `
    <div style="font-family:Arial,sans-serif; color:#0f172a; padding:16px 20px; line-height:1.3; font-size:12pt;">
      <table role="presentation" style="width:100%; border-collapse:collapse; border-bottom:1.5px solid #cbd5e1; margin-bottom:9px; table-layout:fixed; page-break-inside:avoid;">
        <tr>
          <td style="width:150px; height:98px; text-align:center; vertical-align:middle; padding:0 14px 8px 0;">${headerLogo}</td>
          <td style="vertical-align:middle; padding:0 0 8px 0;">
            <div style="font-size:19px; font-weight:700; line-height:1.12; margin:0 0 4px;">${escapeHtml(cfg.nomeEscola || "Escola")}</div>
            ${schoolInfo}
          </td>
        </tr>
      </table>

      <table role="presentation" style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0 0 8px; font-size:12pt; page-break-inside:avoid;">
        <tr>
          <td style="width:72%; padding:0 28px 8px 0; vertical-align:bottom;">
            <table role="presentation" style="width:100%; border-collapse:collapse;"><tr>
              <td style="width:72px; white-space:nowrap; vertical-align:bottom;">ALUNO(A):</td>
              <td style="border-bottom:1px solid #475569; height:18px;">&nbsp;</td>
            </tr></table>
          </td>
          <td style="width:28%; padding:0 0 8px 0; vertical-align:bottom;">
            <table role="presentation" style="width:100%; border-collapse:collapse;"><tr>
              <td style="width:54px; white-space:nowrap; vertical-align:bottom;">TURMA:</td>
              <td style="border-bottom:1px solid #475569; height:18px;">&nbsp;</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="width:72%; padding:0 28px 0 0; vertical-align:bottom;">
            <table role="presentation" style="width:100%; border-collapse:collapse;"><tr>
              <td style="width:104px; white-space:nowrap; vertical-align:bottom;">PROFESSOR(A):</td>
              <td style="border-bottom:1px solid #475569; height:18px;">&nbsp;</td>
            </tr></table>
          </td>
          <td style="width:28%; padding:0; vertical-align:bottom;">
            <table role="presentation" style="width:100%; border-collapse:collapse;"><tr>
              <td style="width:44px; white-space:nowrap; vertical-align:bottom;">DATA:</td>
              <td style="white-space:nowrap; vertical-align:bottom;">___/___/_____</td>
            </tr></table>
          </td>
        </tr>
      </table>

      ${cfg.textoLivrePadrao ? `<div style="margin:6px auto 10px; max-width:88%; text-align:center; white-space:pre-wrap; color:#334155; font-size:12pt;">${escapeHtml(cfg.textoLivrePadrao)}</div>` : `<div style="height:6px;"></div>`}
      ${questoes}
    </div>
  `;
}

function printPdf() {
  if (!window.html2pdf) return;
  const markup = buildExportMarkup();
  window.html2pdf().set({
    margin: 8,
    filename: `${(provaAtual?.titulo || provaAtual?.nome || "prova").replace(/[^a-z0-9]/gi, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  }).from(markup).save();
}

async function exportWord() {
  const markup = buildExportMarkup({ logoUrl: configuracoes?.logoUrl || "" });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${markup}</body></html>`;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${(provaAtual?.titulo || provaAtual?.nome || "prova").replace(/[^a-z0-9]/gi, "_")}.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function init() {
  try {
    await loadProva();
    elements.loading.hidden = true;
    elements.content.hidden = false;
  } catch (error) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.error.textContent = error.message || "Erro ao carregar prova.";
  }
}

document.getElementById("btnExcluirProva").addEventListener("click", deleteCurrentProva);
document.getElementById("btnPdf").addEventListener("click", printPdf);
document.getElementById("btnWord")?.addEventListener("click", exportWord);

init();
