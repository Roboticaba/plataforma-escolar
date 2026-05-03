import { getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { getAlternativeLabel, getQuestionTypeLabel, listQuestions } from "../services/questions-service.js";
import { buildSuggestionPayload } from "../services/montagem-prova-service.js";
import { escapeHtml, renderEmptyState } from "../utils/ui.js";

const usuario = requireProfessor();

const state = {
  questoes: [],
  groups: [],
  selectedInspection: null,
  filters: {
    search: ""
  }
};

const elements = {
  totalQuestoes: document.getElementById("totalQuestoes"),
  totalMinhasQuestoes: document.getElementById("totalMinhasQuestoes"),
  totalCompartilhadas: document.getElementById("totalCompartilhadas"),
  listaQuestoes: document.getElementById("listaQuestoes"),
  filtroBusca: document.getElementById("filtroBusca"),
  btnNovaQuestao: document.getElementById("btnNovaQuestao"),
  btnNovoBloco: document.getElementById("btnNovoBloco"),
  modalInspecao: document.getElementById("modalInspecao"),
  inspecaoTitulo: document.getElementById("inspecaoTitulo"),
  inspecaoSubtitulo: document.getElementById("inspecaoSubtitulo"),
  inspecaoConteudo: document.getElementById("inspecaoConteudo"),
  btnEditarInspecao: document.getElementById("btnEditarInspecao")
};

function isMine(question) {
  return question.autorId === usuario.uid || question.autor === usuario.uid;
}

function buildGroups(questions) {
  const blockMap = new Map();
  const groups = [];

  questions.forEach(question => {
    if (question.blocoId) {
      if (!blockMap.has(question.blocoId)) {
        const group = {
          kind: "block",
          id: question.blocoId,
          blocoId: question.blocoId,
          title: question.blocoTitulo || question.tituloTextoApoio || "Bloco sem titulo",
          questions: []
        };
        blockMap.set(question.blocoId, group);
        groups.push(group);
      }
      blockMap.get(question.blocoId).questions.push(question);
    } else {
      groups.push({
        kind: "question",
        id: question.id,
        question
      });
    }
  });

  groups.forEach(group => {
    if (group.kind === "block") {
      group.questions.sort((a, b) => (a.ordemBloco || 0) - (b.ordemBloco || 0));
    }
  });

  return groups;
}

function groupMatchesFilters(group) {
  const questions = group.kind === "block" ? group.questions : [group.question];
  return questions.some(item => {
    if (state.filters.search) {
      const search = state.filters.search.toLowerCase();
      const base = [
        item.disciplina,
        getDisciplinaLabel(item.disciplina),
        item.anoEscolar,
        item.ano_escolar,
        getAnoLabel(item.anoEscolar || item.ano_escolar),
        item.tipo,
        getQuestionTypeLabel(item.tipo),
        item.enunciado,
        item.textoApoio,
        item.tituloTextoApoio,
        item.blocoTitulo,
        item.conteudo,
        item.descritor,
        item.descritorDescricao,
        group.kind === "block" ? "bloco" : "questao individual"
      ].join(" ").toLowerCase();
      if (!base.includes(search)) return false;
    }
    return true;
  });
}

function renderImageList(urls = []) {
  if (!urls.length) return "";
  return `
    <div class="image-preview-grid">
      ${urls.map(url => `<img src="${url}" alt="Imagem de apoio" style="max-width:180px; max-height:130px; border-radius:12px; border:1px solid var(--line); object-fit:cover;">`).join("")}
    </div>
  `;
}

function renderAlternatives(question) {
  if (!(question.alternativas || []).length) {
    return question.respostaEsperada
      ? `<div class="question-card"><strong>Resposta esperada:</strong><p class="panel-subtitle" style="white-space:pre-wrap;">${escapeHtml(question.respostaEsperada)}</p></div>`
      : `<div class="helper-box">Resposta escrita sem alternativas.</div>`;
  }

  return `
    <div class="selection-list">
      ${(question.alternativas || []).map((alt, index) => {
        const label = getAlternativeLabel(index, question.formatoAlternativas);
        const texto = typeof alt === "string" ? alt : alt?.texto || "";
        const imagem = typeof alt === "object" ? alt?.imagemUrl || alt?.imagem || "" : "";
        const correta = question.resposta_correta === index || alt?.correta;
        return `
          <div class="question-card" style="padding:14px;">
            <div class="question-card-header" style="margin-bottom:8px;">
              <strong>${escapeHtml(label)} ${texto ? escapeHtml(texto) : "Imagem"}</strong>
              ${correta ? `<span class="tag tag-success">Resposta correta</span>` : ""}
            </div>
            ${imagem ? `<img src="${imagem}" alt="Alternativa ${escapeHtml(label)}" style="max-width:220px; max-height:160px; border-radius:12px; border:1px solid var(--line); object-fit:cover;">` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderQuestionDetails(question, heading = "", options = {}) {
  const includeContext = options.includeContext !== false;
  const studentView = Boolean(options.studentView);
  return `
    <article class="question-card">
      ${heading ? `<h3 class="question-card-title">${escapeHtml(heading)}</h3>` : ""}
      ${studentView ? "" : `
        <div class="meta-row">
          <span class="tag tag-primary">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
          <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
          <span class="tag tag-neutral">${escapeHtml(getQuestionTypeLabel(question.tipo))}</span>
          ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
          ${question.conteudo ? `<span class="tag tag-neutral">${escapeHtml(question.conteudo)}</span>` : ""}
        </div>
        ${question.conteudo ? `<p class="panel-subtitle"><strong>Conteudo:</strong> ${escapeHtml(question.conteudo)}</p>` : ""}
      `}
      ${includeContext && question.textoApoio ? `<p class="panel-subtitle" style="white-space:pre-wrap;"><strong>Texto de apoio:</strong><br>${escapeHtml(question.textoApoio)}</p>` : ""}
      ${includeContext ? renderImageList(question.imagensApoio || []) : ""}
      <div style="margin-top:14px;">
        <strong>Enunciado</strong>
        <p class="panel-subtitle" style="white-space:pre-wrap;">${escapeHtml(question.enunciado)}</p>
      </div>
      <div style="margin-top:12px;">
        <strong>Alternativas e resposta</strong>
        ${renderAlternatives(question)}
      </div>
    </article>
  `;
}

function renderQuestions() {
  const filtered = state.groups.filter(groupMatchesFilters);

  if (!filtered.length) {
    const suggestions = buildSuggestionPayload(state.questoes, state.filters.search);
    elements.listaQuestoes.innerHTML = `
      ${renderEmptyState("Nenhuma questao ou bloco encontrado com os filtros atuais.")}
      ${state.filters.search && suggestions.terms.length ? `
        <div class="question-card">
          <strong>${escapeHtml(suggestions.message)}</strong>
          <p class="panel-subtitle">${escapeHtml(suggestions.terms.join(" | "))}</p>
        </div>
      ` : ""}
    `;
    return;
  }

  elements.listaQuestoes.innerHTML = filtered.map(group => {
    if (group.kind === "block") {
      const first = group.questions[0] || {};
      const minhas = group.questions.some(isMine);
      return `
        <article class="question-card">
          <div class="question-card-header">
            <div>
              <h3 class="question-card-title">${escapeHtml(group.title)}</h3>
              <div class="meta-row">
                <span class="tag tag-primary">Bloco baseado em texto</span>
                <span class="tag tag-neutral">${escapeHtml(getDisciplinaLabel(first.disciplina))}</span>
                <span class="tag tag-neutral">${escapeHtml(getAnoLabel(first.anoEscolar || first.ano_escolar))}</span>
                ${first.conteudo ? `<span class="tag tag-neutral">${escapeHtml(first.conteudo)}</span>` : ""}
                <span class="tag tag-success">${group.questions.length} questao(oes)</span>
              </div>
            </div>
            <span class="tag ${minhas ? "tag-success" : "tag-neutral"}">${minhas ? "Seu bloco" : "Compartilhado"}</span>
          </div>
          <p class="panel-subtitle">${escapeHtml((first.textoApoio || "").slice(0, 180))}${(first.textoApoio || "").length > 180 ? "..." : ""}</p>
          <div class="toolbar" style="margin-top:14px;">
            <button class="button-inline button-outline" type="button" data-view-block="${group.blocoId}">Ver questao</button>
            <button class="button-inline button-primary" type="button" data-edit-block="${group.blocoId}">Editar</button>
          </div>
        </article>
      `;
    }

    const question = group.question;
    const alternativas = (question.alternativas || []).length;
    const imagens = (question.imagensApoio || []).length;
    return `
      <article class="question-card">
        <div class="question-card-header">
          <div>
            <h3 class="question-card-title">${escapeHtml(question.enunciado)}</h3>
            <div class="meta-row">
              <span class="tag tag-primary">Questao individual</span>
              <span class="tag tag-neutral">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
              <span class="tag ${question.tipo === "resposta_escrita" ? "tag-warning" : "tag-success"}">${escapeHtml(getQuestionTypeLabel(question.tipo))}</span>
              ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
              ${question.conteudo ? `<span class="tag tag-neutral">${escapeHtml(question.conteudo)}</span>` : ""}
            </div>
          </div>
          <span class="tag ${isMine(question) ? "tag-success" : "tag-neutral"}">${isMine(question) ? "Sua questao" : "Compartilhada"}</span>
        </div>
        ${question.textoApoio ? `<p class="panel-subtitle"><strong>Texto de apoio:</strong> ${escapeHtml(question.textoApoio.slice(0, 160))}${question.textoApoio.length > 160 ? "..." : ""}</p>` : ""}
        ${question.conteudo ? `<p class="panel-subtitle"><strong>Conteudo:</strong> ${escapeHtml(question.conteudo)}</p>` : ""}
        <p class="panel-subtitle">${alternativas ? `${alternativas} alternativa(s)` : "Questao escrita"} ${imagens ? `- ${imagens} imagem(ns) de apoio` : ""}</p>
        <div class="toolbar" style="margin-top:14px;">
          <button class="button-inline button-outline" type="button" data-view-question="${question.id}">Ver questao</button>
          <button class="button-inline button-primary" type="button" data-edit-question="${question.id}">Editar</button>
        </div>
      </article>
    `;
  }).join("");

  bindListActions();
}

function openInspection(selection) {
  state.selectedInspection = selection;
  elements.modalInspecao.classList.add("is-open");
  elements.modalInspecao.setAttribute("aria-hidden", "false");

  if (selection.kind === "block") {
    const first = selection.questions[0] || {};
    elements.inspecaoTitulo.textContent = selection.title;
    elements.inspecaoSubtitulo.textContent = "Bloco de questoes baseado em texto";
    elements.inspecaoConteudo.innerHTML = `
      <section class="panel" style="padding:18px;">
        <div class="meta-row">
          <span class="tag tag-primary">${escapeHtml(getAnoLabel(first.anoEscolar || first.ano_escolar))}</span>
          <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(first.disciplina))}</span>
          <span class="tag tag-success">${selection.questions.length} questao(oes)</span>
        </div>
        <h3 class="panel-title" style="margin-top:14px;">Texto base</h3>
        <p class="panel-subtitle" style="white-space:pre-wrap;">${escapeHtml(first.textoApoio || "")}</p>
        ${renderImageList(first.imagensApoio || [])}
      </section>
      <div class="selection-list" style="margin-top:14px;">
        ${selection.questions.map((question, index) => renderQuestionDetails(question, `Questao ${index + 1}`, { includeContext: false, studentView: true })).join("")}
      </div>
    `;
    return;
  }

  elements.inspecaoTitulo.textContent = "Questao individual";
  elements.inspecaoSubtitulo.textContent = selection.question.enunciado || "Visualizacao completa";
  elements.inspecaoConteudo.innerHTML = renderQuestionDetails(selection.question, "", { studentView: true });
}

function closeInspection() {
  elements.modalInspecao.classList.remove("is-open");
  elements.modalInspecao.setAttribute("aria-hidden", "true");
}

function bindListActions() {
  elements.listaQuestoes.querySelectorAll("[data-view-question]").forEach(button => {
    button.addEventListener("click", () => {
      const question = state.questoes.find(item => item.id === button.dataset.viewQuestion);
      if (question) openInspection({ kind: "question", question });
    });
  });

  elements.listaQuestoes.querySelectorAll("[data-view-block]").forEach(button => {
    button.addEventListener("click", () => {
      const block = state.groups.find(item => item.kind === "block" && item.blocoId === button.dataset.viewBlock);
      if (block) openInspection(block);
    });
  });

  elements.listaQuestoes.querySelectorAll("[data-edit-question]").forEach(button => {
    button.addEventListener("click", () => {
      window.location.href = `criar-questao.html?edit=${encodeURIComponent(button.dataset.editQuestion)}`;
    });
  });

  elements.listaQuestoes.querySelectorAll("[data-edit-block]").forEach(button => {
    button.addEventListener("click", () => {
      window.location.href = `criar-questao.html?block=${encodeURIComponent(button.dataset.editBlock)}`;
    });
  });
}

function updateMetrics() {
  const total = state.questoes.length;
  const minhas = state.questoes.filter(isMine).length;
  elements.totalQuestoes.textContent = String(total);
  elements.totalMinhasQuestoes.textContent = String(minhas);
  elements.totalCompartilhadas.textContent = String(total - minhas);
}

async function loadQuestions() {
  state.questoes = await listQuestions();
  state.groups = buildGroups(state.questoes);
  updateMetrics();
  renderQuestions();
}

function handleFilters() {
  state.filters = {
    search: elements.filtroBusca.value.trim()
  };
  renderQuestions();
}

function bindEvents() {
  elements.btnNovaQuestao.addEventListener("click", () => {
    window.location.href = "professor-importar-questoes.html?modo=individual";
  });
  elements.btnNovoBloco.addEventListener("click", () => {
    window.location.href = "professor-importar-questoes.html?modo=bloco";
  });

  document.querySelectorAll("[data-close-inspecao]").forEach(button => {
    button.addEventListener("click", closeInspection);
  });

  elements.btnEditarInspecao.addEventListener("click", () => {
    if (!state.selectedInspection) return;
    if (state.selectedInspection.kind === "block") {
      window.location.href = `criar-questao.html?block=${encodeURIComponent(state.selectedInspection.blocoId)}`;
    } else {
      window.location.href = `criar-questao.html?edit=${encodeURIComponent(state.selectedInspection.question.id)}`;
    }
  });

  elements.filtroBusca.addEventListener("input", handleFilters);
}

async function init() {
  bindEvents();
  await loadQuestions();
}

init();
