import { getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { buildExportableProva, getLegacyOrNewProva, resolveProvaQuestions } from "../services/provas-service.js";
import { escapeHtml } from "../utils/ui.js";
import { db } from "../core/firebase-app.js";
import { getConfiguracoesProfessor } from "../services/configuracoes-service.js";

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
let questoesResolvidas = [];
let configuracoes = null;

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function renderAlternativasExport(question) {
  if (!(question.alternativas || []).length) {
    return '<div class="alternativa" style="font-style:italic;color:#60738a;">Resposta dissertativa</div>';
  }

  return (question.alternativas || []).map((alt, altIndex) => {
    const texto = typeof alt === "string" ? alt : alt?.texto || "";
    const imagem = typeof alt === "object" ? alt?.imagemUrl || "" : "";
    return `
      <div class="alternativa ${question.resposta_correta === altIndex ? "correta" : ""}">
        (${String.fromCharCode(65 + altIndex)}) ${escapeHtml(texto)}
        ${imagem ? `<div style="margin-top:8px;"><img src="${imagem}" style="max-width:180px; max-height:120px; border-radius:10px;"></div>` : ""}
      </div>
    `;
  }).join("");
}

function renderQuestions() {
  if (!questoesResolvidas.length) {
    elements.listaQuestoes.innerHTML = '<div class="question-card"><div class="empty-panel">Nenhuma questao cadastrada nesta prova.</div></div>';
    return;
  }

  elements.listaQuestoes.innerHTML = questoesResolvidas.map((question, index) => {
    const origem = question.origem === "banco" ? "Banco de Questoes" : question.origem === "temporaria" ? "Temporaria" : "Legada";
    const imagensApoio = (question.imagensApoio || []).map(url => `<img src="${url}" style="max-width:220px; max-height:140px; border-radius:12px; margin:8px 8px 0 0;">`).join("");

    return `
      <article class="question-card">
        <div class="question-card-header">
          <div>
            <h3 class="question-card-title">Questao ${index + 1}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${escapeHtml(origem)}</span>
              <span class="tag tag-neutral">${escapeHtml(getDisciplinaLabel(question.disciplina || provaAtual.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar || provaAtual.anoEscolar || provaAtual.ano))}</span>
              ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
            </div>
          </div>
        </div>
        ${question.textoApoio ? `<div class="panel-subtitle" style="white-space:pre-wrap;"><strong>Texto de apoio:</strong> ${escapeHtml(question.textoApoio)}</div>` : ""}
        ${imagensApoio ? `<div style="margin-top:10px;">${imagensApoio}</div>` : ""}
        <div class="question-card-title" style="font-size:1rem; line-height:1.6; margin-top:12px;">${escapeHtml(question.enunciado || question.pergunta || "")}</div>
        ${renderAlternativasExport(question)}
      </article>
    `;
  }).join("");
}

async function loadProva() {
  const id = getQueryParam("id");
  if (!id) {
    throw new Error("ID da prova nao informado.");
  }

  const prova = await getLegacyOrNewProva(id);
  if (!prova) {
    throw new Error("Prova nao encontrada.");
  }

  if (prova.criadoPor && prova.criadoPor !== usuario.uid) {
    throw new Error("Voce nao tem permissao para visualizar esta prova.");
  }

  provaAtual = prova;
  questoesResolvidas = await resolveProvaQuestions(prova);
  configuracoes = await getConfiguracoesProfessor(usuario.uid);

  elements.title.textContent = prova.titulo || prova.nome || "Prova";
  elements.disciplina.textContent = getDisciplinaLabel(prova.disciplina);
  elements.ano.textContent = getAnoLabel(prova.anoEscolar || prova.ano);
  elements.tempo.textContent = `${prova.tempoMinutos || prova.tempo || 60} min`;
  elements.valor.textContent = `${Number(prova.valorTotal || prova.valor || 10).toFixed(1)} pontos`;
  elements.origem.textContent = prova.source === "provas" ? "Nova arquitetura hibrida" : "Formato legado";
  renderQuestions();
}

async function deleteCurrentProva() {
  if (!provaAtual) return;
  if (!confirm("Excluir prova?")) return;

  const collection = provaAtual.source === "provas" ? "provas" : "simulados";
  await db.collection(collection).doc(provaAtual.id).delete();
  window.location.href = "professor.html";
}

function buildExportMarkup() {
  const cfg = configuracoes || {};
  const professorNome = cfg.mostrarNomeProfessor === false ? "________________________" : escapeHtml(cfg.nomeProfessor || usuario.nome || "________________________");
  const headerLogo = cfg.logoUrl ? `<img src="${cfg.logoUrl}" style="max-width:110px; max-height:90px; object-fit:contain;">` : "";
  const questoes = questoesResolvidas.map((question, index) => `
    <section style="margin-bottom:24px; page-break-inside:avoid;">
      <div style="font-weight:700; margin-bottom:8px;">QUESTAO ${index + 1}</div>
      ${question.textoApoio ? `<div style="white-space:pre-wrap; margin-bottom:10px; color:#334155;">${escapeHtml(question.textoApoio)}</div>` : ""}
      ${(question.imagensApoio || []).length ? `<div style="margin-bottom:10px;">${question.imagensApoio.map(url => `<img src="${url}" style="max-width:220px; max-height:150px; margin:0 8px 8px 0; border-radius:8px;">`).join("")}</div>` : ""}
      <div style="font-weight:600; margin-bottom:10px;">${escapeHtml(question.enunciado || question.pergunta || "")}</div>
      ${(question.alternativas || []).length ? (question.alternativas || []).map((alt, altIndex) => {
        const texto = typeof alt === "string" ? alt : alt?.texto || "";
        const imagem = typeof alt === "object" ? alt?.imagemUrl || "" : "";
        return `<div style="margin:8px 0;"><span style="font-weight:600;">${String.fromCharCode(65 + altIndex)})</span> ${escapeHtml(texto)} ${imagem ? `<div style="margin-top:6px;"><img src="${imagem}" style="max-width:180px; max-height:120px; border-radius:8px;"></div>` : ""}</div>`;
      }).join("") : '<div style="height:90px; border:1px solid #cbd5e1; border-radius:10px; margin-top:10px;"></div>'}
    </section>
  `).join("");

  return `
    <div style="font-family:Arial,sans-serif; color:#0f172a; padding:24px; line-height:1.45;">
      <header style="display:flex; gap:18px; align-items:center; border-bottom:2px solid #cbd5e1; padding-bottom:16px; margin-bottom:16px;">
        <div style="width:120px; min-height:80px; display:flex; align-items:center; justify-content:center;">${headerLogo}</div>
        <div style="flex:1;">
          <div style="font-size:24px; font-weight:700;">${escapeHtml(cfg.nomeEscola || "Escola")}</div>
          ${cfg.endereco ? `<div style="margin-top:6px; color:#475569;">${escapeHtml(cfg.endereco)}</div>` : ""}
          <div style="margin-top:6px; color:#475569;">${escapeHtml(cfg.telefone || "")}${cfg.telefone && cfg.cnpj ? " • " : ""}${escapeHtml(cfg.cnpj || "")}</div>
        </div>
      </header>

      <div style="display:grid; grid-template-columns:1fr 220px; gap:16px; margin-bottom:10px;">
        <div>ALUNO(A): ____________________________</div>
        <div>TURMA: ____________</div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 220px; gap:16px; margin-bottom:18px;">
        <div>PROFESSOR(A): ${professorNome}</div>
        <div>DATA: ___/___/______</div>
      </div>

      ${cfg.textoLivrePadrao ? `<div style="margin-bottom:18px; white-space:pre-wrap; color:#334155;">${escapeHtml(cfg.textoLivrePadrao)}</div>` : ""}
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

function exportWord() {
  const markup = buildExportMarkup();
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
