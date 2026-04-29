import { ANOS_ESCOLARES, DISCIPLINAS, getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { deleteProva, listProvasByProfessor } from "../services/provas-service.js";
import { renderEmptyState } from "../utils/ui.js";

const usuario = requireProfessor();

const elements = {
  totalProvas: document.getElementById("totalProvas"),
  totalQuestoesBanco: document.getElementById("totalQuestoesBanco"),
  totalQuestoesTemporarias: document.getElementById("totalQuestoesTemporarias"),
  filtroAno: document.getElementById("filtroAno"),
  filtroDisciplina: document.getElementById("filtroDisciplina"),
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

  return (prova.questoesBancoIds || []).length + (prova.questoesTemporarias || []).length;
}

function updateMetrics() {
  const totalProvas = state.provas.length;
  const banco = state.provas.reduce((acc, prova) => acc + ((prova.questoesBancoIds || []).length), 0);
  const temporarias = state.provas.reduce((acc, prova) => acc + ((prova.questoesTemporarias || []).length), 0);

  elements.totalProvas.textContent = String(totalProvas);
  elements.totalQuestoesBanco.textContent = String(banco);
  elements.totalQuestoesTemporarias.textContent = String(temporarias);
}

function renderProvas() {
  const ano = elements.filtroAno.value;
  const disciplina = elements.filtroDisciplina.value;
  const filtered = state.provas.filter(prova => {
    if (ano && (prova.anoEscolar || prova.ano) !== ano) return false;
    if (disciplina && prova.disciplina !== disciplina) return false;
    return true;
  });

  if (!filtered.length) {
    elements.listaProvas.innerHTML = renderEmptyState("Nenhuma prova encontrada com os filtros atuais.");
    return;
  }

  elements.listaProvas.innerHTML = filtered.map(prova => {
    const anoEscolar = prova.anoEscolar || prova.ano || "";
    const totalQuestoes = getQuestionCount(prova);
    const banco = (prova.questoesBancoIds || []).length;
    const temporarias = (prova.questoesTemporarias || []).length;

    return `
      <article class="question-card">
        <div class="question-card-header">
          <div>
            <h3 class="question-card-title">${prova.titulo || prova.nome || "Prova sem título"}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${getDisciplinaLabel(prova.disciplina)}</span>
              <span class="tag tag-neutral">${getAnoLabel(anoEscolar)}</span>
              <span class="tag tag-success">${totalQuestoes} questões</span>
              ${banco ? `<span class="tag tag-neutral">${banco} do banco</span>` : ""}
              ${temporarias ? `<span class="tag tag-warning">${temporarias} temporárias</span>` : ""}
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

  document.addEventListener("click", async event => {
    const openButton = event.target.closest("[data-open-prova]");
    if (openButton) {
      window.open(`professor-ver.html?id=${openButton.dataset.openProva}`, "_blank");
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
