import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getAnoLabel, getDescritores, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { createQuestion, limparAlternativas, listQuestions, getQuestionTypeLabel } from "../services/questions-service.js";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js";
import { sugerirDescritorComIA } from "../services/descritor-ai-service.js";
import { clearFeedback, escapeHtml, renderEmptyState, setLoading, showFeedback } from "../utils/ui.js";

const usuario = requireProfessor();

const state = {
  questoes: [],
  filters: {
    anoEscolar: "",
    disciplina: "",
    descritor: "",
    search: ""
  },
  descritorSugestao: null,
  alternativasProcessadas: []
};

const elements = {
  totalQuestoes: document.getElementById("totalQuestoes"),
  totalMinhasQuestoes: document.getElementById("totalMinhasQuestoes"),
  totalCompartilhadas: document.getElementById("totalCompartilhadas"),
  listaQuestoes: document.getElementById("listaQuestoes"),
  filtroAno: document.getElementById("filtroAno"),
  filtroDisciplina: document.getElementById("filtroDisciplina"),
  filtroDescritor: document.getElementById("filtroDescritor"),
  filtroBusca: document.getElementById("filtroBusca"),
  btnNovaQuestao: document.getElementById("btnNovaQuestao"),
  modalQuestao: document.getElementById("modalQuestao"),
  formQuestao: document.getElementById("formQuestao"),
  btnSalvarQuestao: document.getElementById("btnSalvarQuestao"),
  feedbackQuestao: document.getElementById("feedbackQuestao"),
  tipoQuestao: document.getElementById("tipoQuestao"),
  anoEscolar: document.getElementById("anoEscolar"),
  disciplina: document.getElementById("disciplina"),
  descritor: document.getElementById("descritor"),
  descritorWrapper: document.getElementById("descritorWrapper"),
  alternativasWrapper: document.getElementById("alternativasWrapper"),
  alternativasTexto: document.getElementById("alternativasTexto"),
  alternativasUploads: document.getElementById("alternativasUploads"),
  respostaCorreta: document.getElementById("respostaCorreta"),
  respostaEsperadaWrapper: document.getElementById("respostaEsperadaWrapper"),
  respostaEsperada: document.getElementById("respostaEsperada"),
  textoApoio: document.getElementById("textoApoio"),
  enunciado: document.getElementById("enunciado"),
  imagensApoio: document.getElementById("imagensApoio"),
  previewImagensApoio: document.getElementById("previewImagensApoio"),
  nivelDificuldade: document.getElementById("nivelDificuldade"),
  btnSugerirDescritor: document.getElementById("btnSugerirDescritor"),
  descritorSuggestionPanel: document.getElementById("descritorSuggestionPanel"),
  descritorSuggestionFeedback: document.getElementById("descritorSuggestionFeedback"),
  descritorConfirmadoPeloProfessor: document.getElementById("descritorConfirmadoPeloProfessor")
};

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function openModal() {
  elements.modalQuestao.classList.add("is-open");
}

function closeModal() {
  elements.modalQuestao.classList.remove("is-open");
  elements.formQuestao.reset();
  elements.previewImagensApoio.innerHTML = "";
  elements.alternativasUploads.innerHTML = "";
  state.descritorSugestao = null;
  state.alternativasProcessadas = [];
  clearFeedback(elements.feedbackQuestao);
  clearFeedback(elements.descritorSuggestionFeedback);
  updateDescritorField();
  updateQuestionType();
}

function renderPreviewFiles(input, target) {
  target.innerHTML = Array.from(input.files || []).map(file => `
    <div class="tag tag-neutral">${escapeHtml(file.name)}</div>
  `).join("");
}

function buildAlternativasFromForm() {
  const textos = limparAlternativas(elements.alternativasTexto.value);
  state.alternativasProcessadas = textos;
  elements.alternativasUploads.innerHTML = textos.map((texto, index) => `
    <div class="question-card" style="padding:14px;">
      <div class="question-card-title">Alternativa ${String.fromCharCode(65 + index)}: ${escapeHtml(texto)}</div>
      <div class="form-field" style="margin-top:10px;">
        <label>Imagem da alternativa (opcional)</label>
        <input type="file" accept="image/*" data-alt-file="${index}">
      </div>
    </div>
  `).join("");

  elements.respostaCorreta.innerHTML = '<option value="">Selecione</option>' + textos
    .map((texto, index) => `<option value="${index}">${String.fromCharCode(65 + index)} - ${escapeHtml(texto)}</option>`)
    .join("");
}

function updateQuestionType() {
  const escrita = elements.tipoQuestao.value === "resposta_escrita";
  elements.alternativasWrapper.hidden = escrita;
  elements.respostaEsperadaWrapper.hidden = !escrita;
}

function updateDescritorField() {
  const disciplina = elements.disciplina.value;
  const anoEscolar = elements.anoEscolar.value;
  const precisaDescritor = disciplinaPrecisaDescritor(disciplina);
  elements.descritorWrapper.hidden = !precisaDescritor;
  elements.descritorSuggestionPanel.hidden = !precisaDescritor;
  elements.descritorConfirmadoPeloProfessor.checked = !precisaDescritor;

  const descritores = getDescritores(disciplina, anoEscolar);
  elements.descritor.innerHTML = '<option value="">Selecione</option>' + descritores
    .map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nome}</option>`)
    .join("");
}

async function buildAlternativasComImagens() {
  const textos = limparAlternativas(elements.alternativasTexto.value);
  const fileInputs = [...elements.alternativasUploads.querySelectorAll("[data-alt-file]")];
  const alternativas = [];

  for (let index = 0; index < textos.length; index += 1) {
    const fileInput = fileInputs.find(item => Number(item.dataset.altFile) === index);
    const file = fileInput?.files?.[0] || null;
    const imagemUrl = file ? await uploadImagemCloudinary(file) : "";
    alternativas.push({
      texto: textos[index],
      imagemUrl,
      correta: Number(elements.respostaCorreta.value) === index
    });
  }

  return alternativas;
}

async function buildQuestionPayloadFromForm() {
  const form = new FormData(elements.formQuestao);
  const imagensApoio = await uploadMultiplasImagensCloudinary(elements.imagensApoio.files);
  const escrita = form.get("tipo") === "resposta_escrita";
  const alternativas = escrita ? [] : await buildAlternativasComImagens();
  const selectedDescritor = form.get("descritor");
  const selectedDescritorData = getDescritores(form.get("disciplina"), form.get("anoEscolar"))
    .find(item => item.codigo === selectedDescritor);

  return {
    enunciado: form.get("enunciado"),
    tipo: form.get("tipo"),
    alternativas,
    respostaCorreta: form.get("respostaCorreta"),
    anoEscolar: form.get("anoEscolar"),
    disciplina: form.get("disciplina"),
    descritor: selectedDescritor,
    descritorDescricao: selectedDescritorData?.nome || "",
    descritorConfirmadoPeloProfessor: elements.descritorConfirmadoPeloProfessor.checked,
    descritorSugestaoIA: state.descritorSugestao,
    textoApoio: form.get("textoApoio"),
    imagensApoio,
    enunciado: form.get("enunciado"),
    respostaEsperada: form.get("respostaEsperada"),
    nivelDificuldade: form.get("nivelDificuldade")
  };
}

function renderQuestions() {
  const filtered = state.questoes.filter(item => {
    if (state.filters.anoEscolar && item.anoEscolar !== state.filters.anoEscolar && item.ano_escolar !== state.filters.anoEscolar) return false;
    if (state.filters.disciplina && item.disciplina !== state.filters.disciplina) return false;
    if (state.filters.descritor && item.descritor !== state.filters.descritor) return false;
    if (state.filters.search) {
      const searchBase = [item.enunciado, item.textoApoio, item.descritor, item.descritorDescricao].join(" ").toLowerCase();
      if (!searchBase.includes(state.filters.search.toLowerCase())) return false;
    }
    return true;
  });

  if (!filtered.length) {
    elements.listaQuestoes.innerHTML = renderEmptyState("Nenhuma questao encontrada com os filtros atuais.");
    return;
  }

  elements.listaQuestoes.innerHTML = filtered.map(question => {
    const minhas = question.autorId === usuario.uid || question.autor === usuario.uid;
    const alternativas = (question.alternativas || []).length;
    const imagens = (question.imagensApoio || []).length;
    return `
      <article class="question-card">
        <div class="question-card-header">
          <div>
            <h3 class="question-card-title">${escapeHtml(question.enunciado)}</h3>
            <div class="meta-row">
              <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
              <span class="tag ${question.tipo === "resposta_escrita" ? "tag-warning" : "tag-success"}">${escapeHtml(getQuestionTypeLabel(question.tipo))}</span>
              ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
            </div>
          </div>
          <span class="tag ${minhas ? "tag-success" : "tag-neutral"}">${minhas ? "Sua questao" : "Compartilhada"}</span>
        </div>
        ${question.textoApoio ? `<p class="panel-subtitle"><strong>Texto de apoio:</strong> ${escapeHtml(question.textoApoio.slice(0, 160))}${question.textoApoio.length > 160 ? "..." : ""}</p>` : ""}
        <p class="panel-subtitle">${alternativas ? `${alternativas} alternativa(s)` : "Questao discursiva"} ${imagens ? `- ${imagens} imagem(ns) de apoio` : ""}</p>
      </article>
    `;
  }).join("");
}

function updateMetrics() {
  const total = state.questoes.length;
  const minhas = state.questoes.filter(item => item.autorId === usuario.uid || item.autor === usuario.uid).length;
  elements.totalQuestoes.textContent = String(total);
  elements.totalMinhasQuestoes.textContent = String(minhas);
  elements.totalCompartilhadas.textContent = String(total - minhas);
}

async function loadQuestions() {
  state.questoes = await listQuestions();
  updateMetrics();
  renderQuestions();
}

function handleFilters() {
  state.filters = {
    anoEscolar: elements.filtroAno.value,
    disciplina: elements.filtroDisciplina.value,
    descritor: elements.filtroDescritor.value,
    search: elements.filtroBusca.value.trim()
  };
  renderQuestions();
}

function updateFilterDescritores() {
  const descritores = getDescritores(elements.filtroDisciplina.value, elements.filtroAno.value);
  elements.filtroDescritor.innerHTML = '<option value="">Todos os descritores</option>' + descritores
    .map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nome}</option>`)
    .join("");
}

async function handleSuggestDescritor() {
  clearFeedback(elements.descritorSuggestionFeedback);
  const payload = {
    disciplina: elements.disciplina.value,
    anoEscolar: elements.anoEscolar.value,
    textoApoio: elements.textoApoio.value,
    enunciado: elements.enunciado.value,
    alternativas: limparAlternativas(elements.alternativasTexto.value),
    respostaEsperada: elements.respostaEsperada.value
  };

  const result = await sugerirDescritorComIA(payload);
  state.descritorSugestao = result;

  if (!result || !result.descritor) {
    showFeedback(elements.descritorSuggestionFeedback, "error", "Nao foi possivel sugerir um descritor. Escolha manualmente.");
    return;
  }

  elements.descritor.value = result.descritor;
  elements.descritorConfirmadoPeloProfessor.checked = false;
  showFeedback(
    elements.descritorSuggestionFeedback,
    "success",
    `Descritor sugerido: ${result.descritor} - ${result.descricao} (confianca ${Math.round((result.confianca || 0) * 100)}%). ${result.justificativa || ""}`
  );
}

async function handleCreateQuestion(event) {
  event.preventDefault();
  clearFeedback(elements.feedbackQuestao);
  setLoading(elements.btnSalvarQuestao, true, "Salvar no banco", "Salvando...");

  try {
    const payload = await buildQuestionPayloadFromForm();
    await createQuestion(payload, usuario);
    showFeedback(elements.feedbackQuestao, "success", "Questao salva no Banco de Questoes.");
    await loadQuestions();
    setTimeout(closeModal, 700);
  } catch (error) {
    showFeedback(elements.feedbackQuestao, "error", error.message || "Erro ao salvar questao.");
  } finally {
    setLoading(elements.btnSalvarQuestao, false, "Salvar no banco", "Salvando...");
  }
}

function bindEvents() {
  populateSelect(elements.filtroAno, ANOS_ESCOLARES, "Todos os anos");
  populateSelect(elements.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.filtroDisciplina, DISCIPLINAS, "Todas as disciplinas");
  populateSelect(elements.disciplina, DISCIPLINAS, "Selecione");

  elements.btnNovaQuestao.addEventListener("click", openModal);
  document.querySelectorAll("[data-close-modal='questao']").forEach(button => {
    button.addEventListener("click", closeModal);
  });

  elements.tipoQuestao.addEventListener("change", updateQuestionType);
  elements.anoEscolar.addEventListener("change", updateDescritorField);
  elements.disciplina.addEventListener("change", updateDescritorField);
  elements.formQuestao.addEventListener("submit", handleCreateQuestion);
  elements.alternativasTexto.addEventListener("input", buildAlternativasFromForm);
  elements.imagensApoio.addEventListener("change", () => renderPreviewFiles(elements.imagensApoio, elements.previewImagensApoio));
  elements.btnSugerirDescritor.addEventListener("click", handleSuggestDescritor);
  elements.descritor.addEventListener("change", () => {
    if (elements.descritor.value) {
      elements.descritorConfirmadoPeloProfessor.checked = true;
    }
  });

  elements.filtroAno.addEventListener("change", () => {
    updateFilterDescritores();
    handleFilters();
  });
  elements.filtroDisciplina.addEventListener("change", () => {
    updateFilterDescritores();
    handleFilters();
  });
  elements.filtroDescritor.addEventListener("change", handleFilters);
  elements.filtroBusca.addEventListener("input", handleFilters);
}

async function init() {
  bindEvents();
  buildAlternativasFromForm();
  updateQuestionType();
  updateDescritorField();
  await loadQuestions();
}

init();
