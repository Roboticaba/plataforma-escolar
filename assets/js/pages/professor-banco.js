import { ANOS_ESCOLARES, DISCIPLINAS, getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { buildSuggestionPayload } from "../services/montagem-prova-service.js";
import { deleteProva, filterProvasBySearch, listProvasByProfessor } from "../services/provas-service.js";
import { escapeHtml, renderEmptyState } from "../utils/ui.js";

const usuario = requireProfessor();

const elements = {
  totalProvas: document.getElementById("totalProvas"),
  totalQuestoesBanco: document.getElementById("totalQuestoesBanco"),
  totalQuestoesTemporarias: document.getElementById("totalQuestoesTemporarias"),
  filtroAno: document.getElementById("filtroAno"),
  filtroDisciplina: document.getElementById("filtroDisciplina"),
  filtroBusca: document.getElementById("filtroBusca"),
  listaProvas: document.getElementById("listaProvas")
};

const state = {
  provas: []
};

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function getQuestionCount(prova) {
  if (Array.isArray(prova.questoes)) {
    return prova.questoes.length;
  }

  if (Number(prova.totalQuestoes || 0) > 0) {
    return Number(prova.totalQuestoes);
  }

  const blocos = (prova.blocosResumo || []).reduce((acc, bloco) => acc + Number(bloco.totalQuestoes || 0), 0);
  return (prova.questoesBancoIds || []).length + (prova.questoesTemporarias || []).length + blocos;
}

function updateMetrics() {
  const totalProvas = state.provas.length;
  const banco = state.provas.reduce((acc, prova) => acc + ((prova.questoesBancoIds || []).length), 0);
  const blocos = state.provas.reduce((acc, prova) => acc + ((prova.blocosIds || []).length), 0);

  elements.totalProvas.textContent = String(totalProvas);
  elements.totalQuestoesBanco.textContent = String(banco);
  elements.totalQuestoesTemporarias.textContent = String(blocos);
}

function renderProvas() {
  const ano = elements.filtroAno.value;
  const disciplina = elements.filtroDisciplina.value;
  const busca = elements.filtroBusca.value.trim();
  let filtered = state.provas.filter(prova => {
    if (ano && (prova.anoEscolar || prova.ano) !== ano) return false;
    if (disciplina && prova.disciplina !== disciplina) return false;
    return true;
  });

  if (busca) {
    filtered = filterProvasBySearch(filtered, busca);
  }

  if (!filtered.length) {
    const suggestions = buildSuggestionPayload(state.provas.map(prova => ({
      descritor: "",
      descritorDescricao: "",
      conteudo: (prova.conteudos || []).join(" "),
      disciplina: prova.disciplina,
      enunciado: prova.titulo || prova.nome || "",
      textoApoio: (prova.blocosResumo || []).map(item => item.titulo).join(" "),
      tipo: prova.modoMontagem || "manual"
    })), busca);
    elements.listaProvas.innerHTML = `
      ${renderEmptyState("Nenhuma prova encontrada com os filtros atuais.")}
      ${busca && suggestions.terms.length ? `
        <div class="question-card">
          <strong>${escapeHtml(suggestions.message)}</strong>
          <p class="panel-subtitle">${escapeHtml(suggestions.terms.join(" | "))}</p>
        </div>
      ` : ""}
    `;
    return;
  }

  elements.listaProvas.innerHTML = filtered.map(prova => {
    const anoEscolar = prova.anoEscolar || prova.ano || "";
    const totalQuestoes = getQuestionCount(prova);
    const banco = (prova.questoesBancoIds || []).length;
    const blocos = (prova.blocosIds || []).length;
    const temporarias = (prova.questoesTemporarias || []).length;

    return `
      <article class="question-card" style="padding:14px 16px;">
        <div class="question-card-header">
          <div>
            <h3 class="question-card-title">${escapeHtml(prova.titulo || prova.nome || "Prova sem titulo")}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(prova.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(anoEscolar))}</span>
              <span class="tag tag-success">${totalQuestoes} questoes</span>
              ${banco ? `<span class="tag tag-neutral">${banco} individuais</span>` : ""}
              ${blocos ? `<span class="tag tag-primary">${blocos} bloco(s)</span>` : ""}
              ${temporarias ? `<span class="tag tag-warning">${temporarias} temporarias</span>` : ""}
            </div>
          </div>
          <div class="list-actions">
            <button type="button" class="button-inline button-outline" data-open-prova="${prova.id}">Ver</button>
            <button type="button" class="button-inline button-danger" data-delete-prova="${prova.id}">Excluir</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadProvas() {
  state.provas = await listProvasByProfessor(usuario.uid);
  updateMetrics();
  renderProvas();
}

function bindEvents() {
  populateSelect(elements.filtroAno, ANOS_ESCOLARES, "Todos os anos");
  populateSelect(elements.filtroDisciplina, DISCIPLINAS, "Todas as disciplinas");

  elements.filtroAno.addEventListener("change", renderProvas);
  elements.filtroDisciplina.addEventListener("change", renderProvas);
  elements.filtroBusca.addEventListener("input", renderProvas);

  document.addEventListener("click", async event => {
    const openButton = event.target.closest("[data-open-prova]");
    if (openButton) {
      window.location.href = `professor-ver.html?id=${openButton.dataset.openProva}&source=provas`;
      return;
    }

    const deleteButton = event.target.closest("[data-delete-prova]");
    if (!deleteButton) return;
    if (!confirm("Excluir prova?")) return;
    await deleteProva(deleteButton.dataset.deleteProva);
    await loadProvas();
  });
}

async function init() {
  bindEvents();
  await loadProvas();
}

init();
