import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getAnoLabel, getDescritores, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { createQuestion, limparAlternativas, listQuestions, getQuestionTypeLabel } from "../services/questions-service.js";
import { createProva, normalizeTemporaryQuestion } from "../services/provas-service.js";
import { listTurmasByProfessor } from "../services/turmas-service.js";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js";
import { buildSuggestionPayload, montarProvaAutomaticamente } from "../services/montagem-prova-service.js";
import { preClassificarQuestao } from "../services/importacao-questoes-service.js";
import { scoreSearchMatch } from "../services/search-utils.js";
import { clearFeedback, escapeHtml, renderEmptyState, setLoading, showFeedback } from "../utils/ui.js";

const usuario = requireProfessor();

const state = {
  bancoQuestoes: [],
  selectedQuestionIds: [],
  selectedQuestionDetails: [],
  selectedBlockIds: [],
  selectedBlockDetails: [],
  selectedItems: [],
  temporaryQuestions: [],
  turmas: [],
  filters: {
    anoEscolar: "",
    disciplina: "",
    descritor: "",
    search: ""
  },
  descritorSugestao: null
};

const elements = {
  formProva: document.getElementById("formProva"),
  anoEscolar: document.getElementById("anoEscolar"),
  disciplina: document.getElementById("disciplina"),
  turma: document.getElementById("turma"),
  listaBancoSelecionadas: document.getElementById("listaBancoSelecionadas"),
  listaOrdemProva: document.getElementById("listaOrdemProva"),
  listaBlocosSelecionados: document.getElementById("listaBlocosSelecionados"),
  listaTemporarias: document.getElementById("listaTemporarias"),
  resumoBanco: document.getElementById("resumoBanco"),
  resumoBlocos: document.getElementById("resumoBlocos"),
  resumoTemporarias: document.getElementById("resumoTemporarias"),
  resumoTotal: document.getElementById("resumoTotal"),
  btnSalvarProva: document.getElementById("btnSalvarProva"),
  feedbackProva: document.getElementById("feedbackProva"),
  modoMontagem: document.getElementById("modoMontagem"),
  painelMontagemAutomatica: document.getElementById("painelMontagemAutomatica"),
  autoNumeroQuestoes: document.getElementById("autoNumeroQuestoes"),
  autoDescritores: document.getElementById("autoDescritores"),
  autoBncc: document.getElementById("autoBncc"),
  autoConteudos: document.getElementById("autoConteudos"),
  autoGenero: document.getElementById("autoGenero"),
  autoDificuldade: document.getElementById("autoDificuldade"),
  btnMontagemAutomatica: document.getElementById("btnMontagemAutomatica"),
  feedbackMontagemAutomatica: document.getElementById("feedbackMontagemAutomatica"),
  modeloProvaNome: document.getElementById("modeloProvaNome"),
  btnAbrirBanco: document.getElementById("btnAbrirBanco"),
  btnAbrirNovaQuestao: document.getElementById("btnAbrirNovaQuestao"),
  modalBanco: document.getElementById("modalBanco"),
  modalQuestao: document.getElementById("modalQuestao"),
  filtroBancoAno: document.getElementById("filtroBancoAno"),
  filtroBancoDisciplina: document.getElementById("filtroBancoDisciplina"),
  filtroBancoDescritor: document.getElementById("filtroBancoDescritor"),
  filtroBancoBusca: document.getElementById("filtroBancoBusca"),
  listaBancoQuestoes: document.getElementById("listaBancoQuestoes"),
  contadorBancoSelecionado: document.getElementById("contadorBancoSelecionado"),
  formQuestao: document.getElementById("formQuestao"),
  tipoQuestao: document.getElementById("tipoQuestao"),
  questaoAnoEscolar: document.getElementById("questaoAnoEscolar"),
  questaoDisciplina: document.getElementById("questaoDisciplina"),
  questaoDescritor: document.getElementById("questaoDescritor"),
  questaoDescritorWrapper: document.getElementById("questaoDescritorWrapper"),
  alternativasWrapper: document.getElementById("alternativasWrapper"),
  alternativasTexto: document.getElementById("alternativasTexto"),
  alternativasUploads: document.getElementById("alternativasUploads"),
  respostaCorreta: document.getElementById("respostaCorreta"),
  feedbackQuestao: document.getElementById("feedbackQuestao"),
  btnSalvarQuestao: document.getElementById("btnSalvarQuestao"),
  questaoSalvarBancoSim: document.getElementById("questaoSalvarBancoSim"),
  questaoSalvarBancoNao: document.getElementById("questaoSalvarBancoNao"),
  questaoTextoApoio: document.getElementById("questaoTextoApoio"),
  questaoEnunciado: document.getElementById("questaoEnunciado"),
  questaoImagensApoio: document.getElementById("questaoImagensApoio"),
  questaoPreviewImagensApoio: document.getElementById("questaoPreviewImagensApoio"),
  questaoRespostaEsperada: document.getElementById("questaoRespostaEsperada"),
  respostaEsperadaWrapper: document.getElementById("respostaEsperadaWrapper"),
  questaoNivelDificuldade: document.getElementById("questaoNivelDificuldade"),
  btnSugerirDescritorQuestao: document.getElementById("btnSugerirDescritorQuestao"),
  questaoDescritorSuggestionPanel: document.getElementById("questaoDescritorSuggestionPanel"),
  questaoDescritorSuggestionFeedback: document.getElementById("questaoDescritorSuggestionFeedback"),
  questaoDescritorConfirmadoPeloProfessor: document.getElementById("questaoDescritorConfirmadoPeloProfessor")
};

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function openModal(modal) {
  modal.classList.add("is-open");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
}

function updateQuestionType() {
  const escrita = elements.tipoQuestao.value === "resposta_escrita";
  elements.alternativasWrapper.hidden = escrita;
  elements.respostaEsperadaWrapper.hidden = !escrita;
}

function splitCriteriaInput(value) {
  return String(value || "")
    .split(/[,\n;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function updateMontagemMode() {
  elements.painelMontagemAutomatica.hidden = elements.modoMontagem.value !== "automatico";
}

function updateQuestionDescritores() {
  const disciplina = elements.questaoDisciplina.value;
  const anoEscolar = elements.questaoAnoEscolar.value;
  const precisa = disciplinaPrecisaDescritor(disciplina);
  elements.questaoDescritorWrapper.hidden = !precisa;
  elements.questaoDescritorSuggestionPanel.hidden = !precisa;
  elements.questaoDescritorConfirmadoPeloProfessor.checked = !precisa;

  const descritores = getDescritores(disciplina, anoEscolar);
  elements.questaoDescritor.innerHTML = '<option value="">Selecione</option>' + descritores
    .map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nome}</option>`)
    .join("");
}

function updateBankDescritores() {
  const descritores = getDescritores(elements.filtroBancoDisciplina.value, elements.filtroBancoAno.value);
  elements.filtroBancoDescritor.innerHTML = '<option value="">Todos os descritores</option>' + descritores
    .map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nome}</option>`)
    .join("");
}

function renderPreviewFiles(input, target) {
  target.innerHTML = Array.from(input.files || []).map(file => `
    <div class="tag tag-neutral">${escapeHtml(file.name)}</div>
  `).join("");
}

function buildAlternativasFromForm() {
  const textos = limparAlternativas(elements.alternativasTexto.value);
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

async function getQuestionFormPayload() {
  const form = new FormData(elements.formQuestao);
  const imagensApoio = await uploadMultiplasImagensCloudinary(elements.questaoImagensApoio.files);
  const tipo = form.get("tipo");
  const alternativas = tipo === "resposta_escrita" ? [] : await buildAlternativasComImagens();
  const selectedDescritor = form.get("descritor");
  const selectedDescritorData = getDescritores(form.get("disciplina"), form.get("anoEscolar"))
    .find(item => item.codigo === selectedDescritor);

  return {
    enunciado: form.get("enunciado"),
    tipo,
    alternativas,
    respostaCorreta: form.get("respostaCorreta"),
    anoEscolar: form.get("anoEscolar"),
    disciplina: form.get("disciplina"),
    descritor: selectedDescritor,
    descritorDescricao: selectedDescritorData?.nome || "",
    descritorConfirmadoPeloProfessor: elements.questaoDescritorConfirmadoPeloProfessor.checked,
    descritorSugestaoIA: state.descritorSugestao,
    descritorSugerido: state.descritorSugestao?.descritorSugerido || "",
    bncc_sugerido: state.descritorSugestao?.bnccSugerida || "",
    habilidade_bncc: state.descritorSugestao?.habilidadeBncc || "",
    conteudo: state.descritorSugestao?.conteudoSugerido || "",
    categoria_bncc: state.descritorSugestao?.categoriaSugerida || "",
    justificativa_classificacao: state.descritorSugestao?.justificativa || "",
    confianca_classificacao: state.descritorSugestao?.confianca || "baixa",
    textoApoio: form.get("textoApoio"),
    imagensApoio,
    respostaEsperada: form.get("respostaEsperada"),
    nivelDificuldade: form.get("nivelDificuldade")
  };
}

function buildBancoGroups() {
  const blocks = new Map();
  const individuais = [];

  state.bancoQuestoes.forEach(question => {
    if (!question.blocoId) {
      individuais.push(question);
      return;
    }

    const block = blocks.get(question.blocoId) || {
      blocoId: question.blocoId,
      titulo: question.blocoTitulo || question.tituloTextoApoio || "Bloco baseado em texto",
      textoApoio: question.textoApoio || "",
      imagensApoio: question.imagensApoio || [],
      anoEscolar: question.anoEscolar || question.ano_escolar || "",
      disciplina: question.disciplina || "",
      questoes: []
    };

    block.questoes.push(question);
    block.anoEscolar = block.anoEscolar || question.anoEscolar || question.ano_escolar || "";
    block.disciplina = block.disciplina || question.disciplina || "";
    block.textoApoio = block.textoApoio || question.textoApoio || "";
    block.imagensApoio = block.imagensApoio.length ? block.imagensApoio : (question.imagensApoio || []);
    blocks.set(question.blocoId, block);
  });

  return {
    individuais,
    blocos: [...blocks.values()].map(block => ({
      ...block,
      questoes: block.questoes.sort((a, b) => (a.ordemBloco || 0) - (b.ordemBloco || 0)),
      totalQuestoes: block.questoes.length
    }))
  };
}

function getBlockQuestionCount() {
  return state.selectedBlockDetails.reduce((acc, block) => acc + (block.totalQuestoes || block.questoes?.length || 0), 0);
}

function appendSelectedItem(tipo, id) {
  const exists = state.selectedItems.some(item => item.tipo === tipo && item.id === id);
  if (!exists) {
    state.selectedItems.push({ tipo, id });
  }
}

function removeSelectedItem(tipo, id) {
  state.selectedItems = state.selectedItems.filter(item => !(item.tipo === tipo && item.id === id));
}

function getItemDetails(item) {
  if (item.tipo === "questao") {
    const question = state.selectedQuestionDetails.find(detail => detail.id === item.id);
    return question ? {
      title: question.enunciado,
      tags: ["Questao individual", getDisciplinaLabel(question.disciplina), getAnoLabel(question.anoEscolar || question.ano_escolar)],
      count: 1
    } : null;
  }

  if (item.tipo === "bloco") {
    const block = state.selectedBlockDetails.find(detail => detail.blocoId === item.id);
    return block ? {
      title: block.titulo,
      tags: ["Bloco baseado em texto", getDisciplinaLabel(block.disciplina), `${block.totalQuestoes || block.questoes?.length || 0} questoes`],
      count: block.totalQuestoes || block.questoes?.length || 0
    } : null;
  }

  const question = state.temporaryQuestions.find(detail => detail.tempId === item.id);
  return question ? {
    title: question.enunciado,
    tags: ["Questao temporaria", getDisciplinaLabel(question.disciplina), getAnoLabel(question.anoEscolar || question.ano_escolar)],
    count: 1
  } : null;
}

function getOrderedProofItems() {
  const validItems = state.selectedItems.filter(item => {
    if (item.tipo === "questao") return state.selectedQuestionIds.includes(item.id);
    if (item.tipo === "bloco") return state.selectedBlockIds.includes(item.id);
    if (item.tipo === "temporaria") return state.temporaryQuestions.some(question => question.tempId === item.id);
    return false;
  });
  state.selectedItems = validItems;
  return validItems;
}

function renderSelectionSummary() {
  elements.resumoBanco.textContent = String(state.selectedQuestionIds.length);
  elements.resumoBlocos.textContent = String(state.selectedBlockIds.length);
  elements.resumoTemporarias.textContent = String(state.temporaryQuestions.length);
  elements.resumoTotal.textContent = String(state.selectedQuestionIds.length + getBlockQuestionCount() + state.temporaryQuestions.length);

  const orderedItems = getOrderedProofItems();
  if (!orderedItems.length) {
    elements.listaOrdemProva.innerHTML = renderEmptyState("Adicione questoes ou blocos para montar a ordem da prova.");
  } else {
    let questionNumber = 1;
    elements.listaOrdemProva.innerHTML = orderedItems.map((item, index) => {
      const detail = getItemDetails(item);
      if (!detail) return "";
      const start = questionNumber;
      questionNumber += detail.count;
      const numbering = detail.count > 1 ? `Questoes ${start} a ${questionNumber - 1}` : `Questao ${start}`;
      return `
        <article class="selection-card" style="${item.tipo === "bloco" ? "border-left:4px solid #7c3aed;" : ""}">
          <div class="selection-card-header">
            <div>
              <h3 class="selection-card-title">${index + 1}. ${escapeHtml(detail.title)}</h3>
              <div class="tag-row">
                <span class="tag tag-success">${escapeHtml(numbering)}</span>
                ${detail.tags.map(tag => `<span class="tag tag-neutral">${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  if (!state.selectedQuestionDetails.length) {
    elements.listaBancoSelecionadas.innerHTML = renderEmptyState("Nenhuma questao do banco adicionada a prova.");
  } else {
    elements.listaBancoSelecionadas.innerHTML = state.selectedQuestionDetails.map(question => `
      <article class="selection-card">
        <div class="selection-card-header">
          <div>
            <h3 class="selection-card-title">${escapeHtml(question.enunciado)}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
              <span class="tag tag-success">Banco</span>
              ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
            </div>
          </div>
          <button type="button" class="button-inline button-danger" data-remove-banco="${question.id}">Remover</button>
        </div>
      </article>
    `).join("");
  }

  if (!state.selectedBlockDetails.length) {
    elements.listaBlocosSelecionados.innerHTML = renderEmptyState("Nenhum bloco baseado em texto adicionado a prova.");
  } else {
    elements.listaBlocosSelecionados.innerHTML = state.selectedBlockDetails.map(block => `
      <article class="selection-card">
        <div class="selection-card-header">
          <div>
            <h3 class="selection-card-title">${escapeHtml(block.titulo)}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(block.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(block.anoEscolar))}</span>
              <span class="tag tag-success">Bloco baseado em texto</span>
              <span class="tag tag-neutral">${block.totalQuestoes || block.questoes?.length || 0} questoes</span>
            </div>
          </div>
          <button type="button" class="button-inline button-danger" data-remove-bloco="${block.blocoId}">Remover</button>
        </div>
      </article>
    `).join("");
  }

  if (!state.temporaryQuestions.length) {
    elements.listaTemporarias.innerHTML = renderEmptyState("Nenhuma questao temporaria criada para esta prova.");
  } else {
    elements.listaTemporarias.innerHTML = state.temporaryQuestions.map((question, index) => `
      <article class="selection-card">
        <div class="selection-card-header">
          <div>
            <h3 class="selection-card-title">${escapeHtml(question.enunciado)}</h3>
            <div class="tag-row">
              <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
              <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
              <span class="tag tag-warning">Temporaria</span>
              ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
            </div>
          </div>
          <button type="button" class="button-inline button-danger" data-remove-temp="${index}">Remover</button>
        </div>
      </article>
    `).join("");
  }
}

function matchesBancoFilters(item) {
    if (state.filters.anoEscolar && item.anoEscolar !== state.filters.anoEscolar && item.ano_escolar !== state.filters.anoEscolar) return false;
    if (state.filters.disciplina && item.disciplina !== state.filters.disciplina) return false;
    if (state.filters.descritor && item.descritor !== state.filters.descritor) return false;
    if (state.filters.search) {
      if (!scoreSearchMatch(state.filters.search, [
        item.enunciado,
        item.textoApoio,
        item.titulo,
        item.blocoTitulo,
        item.descritor,
        item.descritorDescricao,
        item.conteudo,
        item.disciplina,
        item.anoEscolar || item.ano_escolar,
        ...(item.tagsNormalizadas || [])
      ]).matched) return false;
    }
    return true;
}

function getFilteredBancoContent() {
  const { individuais, blocos } = buildBancoGroups();
  return {
    individuais: individuais.filter(matchesBancoFilters),
    blocos: blocos.filter(block => {
      const blockMatches = matchesBancoFilters({
        ...block,
        enunciado: block.questoes.map(question => question.enunciado).join(" "),
        descritor: ""
      });
      const hasMatchingQuestion = block.questoes.some(matchesBancoFilters);
      return blockMatches || hasMatchingQuestion;
    })
  };
}

function renderBancoModal() {
  const { individuais, blocos } = getFilteredBancoContent();
  elements.contadorBancoSelecionado.textContent = `${state.selectedQuestionIds.length} questao(oes) e ${state.selectedBlockIds.length} bloco(s) selecionado(s)`;

  if (!individuais.length && !blocos.length) {
    const suggestions = buildSuggestionPayload(state.bancoQuestoes, state.filters.search);
    elements.listaBancoQuestoes.innerHTML = `
      ${renderEmptyState("Nenhuma questao ou bloco encontrado no Banco de Questoes.")}
      ${state.filters.search && suggestions.terms.length ? `
        <div class="question-card">
          <strong>${escapeHtml(suggestions.message)}</strong>
          <p class="panel-subtitle">${escapeHtml(suggestions.terms.join(" | "))}</p>
        </div>
      ` : ""}
    `;
    return;
  }

  const blockCards = blocos.map(block => {
    const checked = state.selectedBlockIds.includes(block.blocoId);
    return `
      <label class="question-card checkbox-row" style="padding:14px;">
        <input type="checkbox" data-select-block="${block.blocoId}" ${checked ? "checked" : ""}>
        <div style="flex:1;">
          <div class="question-card-header" style="margin-bottom:6px;">
            <h3 class="question-card-title">${escapeHtml(block.titulo)}</h3>
          </div>
          <div class="tag-row">
            <span class="tag tag-success">Bloco baseado em texto</span>
            <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(block.disciplina))}</span>
            <span class="tag tag-neutral">${escapeHtml(getAnoLabel(block.anoEscolar))}</span>
            <span class="tag tag-neutral">${block.totalQuestoes} questoes</span>
          </div>
          <p class="panel-subtitle" style="margin-top:8px;">${escapeHtml((block.textoApoio || "").slice(0, 180))}${block.textoApoio?.length > 180 ? "..." : ""}</p>
        </div>
      </label>
    `;
  }).join("");

  const questionCards = individuais.map(question => {
    const checked = state.selectedQuestionIds.includes(question.id);
    return `
      <label class="question-card checkbox-row" style="padding:14px;">
        <input type="checkbox" data-select-question="${question.id}" ${checked ? "checked" : ""}>
        <div style="flex:1;">
          <div class="question-card-header" style="margin-bottom:6px;">
            <h3 class="question-card-title">${escapeHtml(question.enunciado)}</h3>
          </div>
          <div class="tag-row">
            <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
            <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar || question.ano_escolar))}</span>
            <span class="tag ${question.tipo === "resposta_escrita" ? "tag-warning" : "tag-success"}">${escapeHtml(getQuestionTypeLabel(question.tipo))}</span>
            ${question.descritor ? `<span class="tag tag-neutral">${escapeHtml(question.descritor)}</span>` : ""}
          </div>
        </div>
      </label>
    `;
  }).join("");

  elements.listaBancoQuestoes.innerHTML = `
    ${blockCards ? `<h3 class="proof-section-title" style="margin:0 0 10px;">Blocos baseados em texto</h3>${blockCards}` : ""}
    ${questionCards ? `<h3 class="proof-section-title" style="margin:18px 0 10px;">Questoes individuais</h3>${questionCards}` : ""}
  `;
}

async function refreshSelectedQuestionDetails() {
  const { individuais, blocos } = buildBancoGroups();
  state.selectedQuestionDetails = individuais.filter(item => state.selectedQuestionIds.includes(item.id));
  state.selectedBlockDetails = blocos.filter(item => state.selectedBlockIds.includes(item.blocoId));
  renderSelectionSummary();
  renderBancoModal();
}

async function loadBancoQuestoes() {
  state.bancoQuestoes = await listQuestions();
  await refreshSelectedQuestionDetails();
}

async function loadTurmas() {
  state.turmas = await listTurmasByProfessor(usuario.uid);
  elements.turma.innerHTML = '<option value="">Selecione a turma (opcional)</option>' + state.turmas
    .map(turma => `<option value="${turma.id}">${escapeHtml(turma.nome)}</option>`)
    .join("");
}

async function handleSuggestDescritor() {
  clearFeedback(elements.questaoDescritorSuggestionFeedback);
  const payload = {
    disciplina: elements.questaoDisciplina.value,
    anoEscolar: elements.questaoAnoEscolar.value,
    textoApoio: elements.questaoTextoApoio.value,
    enunciado: elements.questaoEnunciado.value,
    alternativas: limparAlternativas(elements.alternativasTexto.value).map(texto => ({ texto })),
    respostaEsperada: elements.questaoRespostaEsperada.value
  };

  const result = preClassificarQuestao(payload);
  state.descritorSugestao = result;

  if (!result || !result.descritorSugerido) {
    showFeedback(elements.questaoDescritorSuggestionFeedback, "error", "Nao foi possivel sugerir um descritor. Escolha manualmente.");
    return;
  }

  elements.questaoDescritor.value = result.descritorSugerido;
  elements.questaoDescritorConfirmadoPeloProfessor.checked = false;
  showFeedback(
    elements.questaoDescritorSuggestionFeedback,
    "success",
    `Descritor sugerido: ${result.descritorSugerido} - ${result.descritorDescricao || ""} (${result.confianca || "baixa"}). ${result.justificativa || ""}`
  );
}

function applyAutomaticSelection(result) {
  const selectedIds = result.selected
    .filter(question => question.id && !question.blocoId)
    .map(question => question.id);
  const selectedBlocks = result.selected
    .filter(question => question.blocoId)
    .map(question => question.blocoId);

  state.selectedQuestionIds = [...new Set([...state.selectedQuestionIds, ...selectedIds])];
  state.selectedBlockIds = [...new Set([...state.selectedBlockIds, ...selectedBlocks])];

  result.selected.forEach(question => {
    if (question.id && !question.blocoId) {
      appendSelectedItem("questao", question.id);
    }
    if (question.blocoId) {
      appendSelectedItem("bloco", question.blocoId);
    }
  });
}

async function handleMontagemAutomatica() {
  clearFeedback(elements.feedbackMontagemAutomatica);
  const criteria = {
    disciplina: elements.disciplina.value,
    anoEscolar: elements.anoEscolar.value,
    numeroQuestoes: Number(elements.autoNumeroQuestoes.value || 0),
    descritores: splitCriteriaInput(elements.autoDescritores.value),
    habilidadesBncc: splitCriteriaInput(elements.autoBncc.value),
    conteudos: splitCriteriaInput(elements.autoConteudos.value),
    generoTextual: elements.autoGenero.value.trim(),
    dificuldade: elements.autoDificuldade.value
  };

  if (!criteria.disciplina || !criteria.anoEscolar || !criteria.numeroQuestoes) {
    showFeedback(elements.feedbackMontagemAutomatica, "error", "Informe disciplina, ano e numero de questoes antes de gerar automaticamente.");
    return;
  }

  const result = montarProvaAutomaticamente(state.bancoQuestoes, criteria);
  if (!result.selected.length) {
    const suggestions = buildSuggestionPayload(state.bancoQuestoes, [
      ...criteria.descritores,
      ...criteria.conteudos,
      criteria.generoTextual
    ].filter(Boolean).join(" "));
    showFeedback(
      elements.feedbackMontagemAutomatica,
      "error",
      suggestions.terms.length
        ? `Nao encontramos questoes suficientes. ${suggestions.message} ${suggestions.terms.join(", ")}`
        : "Nao encontramos questoes com esses criterios."
    );
    return;
  }

  applyAutomaticSelection(result);
  await refreshSelectedQuestionDetails();

  if (result.faltantes > 0) {
    showFeedback(elements.feedbackMontagemAutomatica, "success", `${result.aviso} Ja deixamos ${result.encontrados} questoes selecionadas.`);
    return;
  }

  showFeedback(elements.feedbackMontagemAutomatica, "success", `${result.encontrados} questoes selecionadas automaticamente para a prova.`);
}

async function handleCreateQuestion(event) {
  event.preventDefault();
  clearFeedback(elements.feedbackQuestao);
  setLoading(elements.btnSalvarQuestao, true, "Adicionar questao", "Adicionando...");

  try {
    const payload = await getQuestionFormPayload();
    const salvarNoBanco = elements.questaoSalvarBancoSim.checked;

    if (salvarNoBanco) {
      const question = await createQuestion(payload, usuario);
      state.selectedQuestionIds = [...new Set([...state.selectedQuestionIds, question.id])];
      appendSelectedItem("questao", question.id);
      await loadBancoQuestoes();
      showFeedback(elements.feedbackQuestao, "success", "Questao criada e salva no Banco de Questoes.");
    } else {
      const tempQuestion = {
        ...normalizeTemporaryQuestion(payload, usuario),
        tempId: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };
      state.temporaryQuestions.push(tempQuestion);
      appendSelectedItem("temporaria", tempQuestion.tempId);
      renderSelectionSummary();
      showFeedback(elements.feedbackQuestao, "success", "Questao criada apenas para esta prova.");
    }

    setTimeout(() => {
      closeModal(elements.modalQuestao);
      elements.formQuestao.reset();
      elements.questaoPreviewImagensApoio.innerHTML = "";
      elements.alternativasUploads.innerHTML = "";
      clearFeedback(elements.feedbackQuestao);
      clearFeedback(elements.questaoDescritorSuggestionFeedback);
      state.descritorSugestao = null;
      elements.questaoSalvarBancoNao.checked = true;
      buildAlternativasFromForm();
      updateQuestionDescritores();
      updateQuestionType();
    }, 600);
  } catch (error) {
    showFeedback(elements.feedbackQuestao, "error", error.message || "Erro ao criar questao.");
  } finally {
    setLoading(elements.btnSalvarQuestao, false, "Adicionar questao", "Adicionando...");
  }
}

async function handleSaveProva(event) {
  event.preventDefault();
  clearFeedback(elements.feedbackProva);
  setLoading(elements.btnSalvarProva, true, "Salvar prova", "Salvando prova...");

  try {
    const form = new FormData(elements.formProva);
    await createProva({
      titulo: form.get("titulo"),
      turma: form.get("turma"),
      anoEscolar: form.get("anoEscolar"),
      disciplina: form.get("disciplina"),
      tempoMinutos: form.get("tempoMinutos"),
      valorTotal: form.get("valorTotal"),
      modoMontagem: form.get("modoMontagem"),
      modeloProvaNome: elements.modeloProvaNome.value.trim(),
      criteriosMontagem: form.get("modoMontagem") === "automatico" ? {
        numeroQuestoes: Number(elements.autoNumeroQuestoes.value || 0),
        descritores: splitCriteriaInput(elements.autoDescritores.value),
        habilidadesBncc: splitCriteriaInput(elements.autoBncc.value),
        conteudos: splitCriteriaInput(elements.autoConteudos.value),
        generoTextual: elements.autoGenero.value.trim(),
        dificuldade: elements.autoDificuldade.value
      } : null,
      descritores: splitCriteriaInput(elements.autoDescritores.value),
      habilidadesBncc: splitCriteriaInput(elements.autoBncc.value),
      conteudos: splitCriteriaInput(elements.autoConteudos.value),
      palavrasChave: splitCriteriaInput(elements.autoConteudos.value).concat(splitCriteriaInput(elements.autoGenero.value)),
      questoesBancoIds: state.selectedQuestionIds,
      blocosIds: state.selectedBlockIds,
      blocosResumo: state.selectedBlockDetails.map(block => ({
        blocoId: block.blocoId,
        titulo: block.titulo,
        totalQuestoes: block.totalQuestoes || block.questoes?.length || 0
      })),
      questoesTemporarias: state.temporaryQuestions,
      itensProva: getOrderedProofItems()
    }, usuario);

    showFeedback(elements.feedbackProva, "success", "Prova salva com sucesso. Atualizando o Banco de Provas...");
    elements.formProva.reset();
    state.selectedQuestionIds = [];
    state.selectedQuestionDetails = [];
    state.selectedBlockIds = [];
    state.selectedBlockDetails = [];
    state.selectedItems = [];
    state.temporaryQuestions = [];
    renderSelectionSummary();
    await loadTurmas();
    setTimeout(() => {
      window.location.href = "professor-banco.html";
    }, 700);
  } catch (error) {
    showFeedback(elements.feedbackProva, "error", error.message || "Erro ao salvar prova.");
  } finally {
    setLoading(elements.btnSalvarProva, false, "Salvar prova", "Salvando prova...");
  }
}

function bindEvents() {
  populateSelect(elements.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.disciplina, DISCIPLINAS, "Selecione");
  populateSelect(elements.filtroBancoAno, ANOS_ESCOLARES, "Todos os anos");
  populateSelect(elements.filtroBancoDisciplina, DISCIPLINAS, "Todas as disciplinas");
  populateSelect(elements.questaoAnoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.questaoDisciplina, DISCIPLINAS, "Selecione");

  elements.btnAbrirBanco.addEventListener("click", () => openModal(elements.modalBanco));
  elements.btnAbrirNovaQuestao.addEventListener("click", () => openModal(elements.modalQuestao));
  elements.modoMontagem.addEventListener("change", updateMontagemMode);
  elements.btnMontagemAutomatica.addEventListener("click", handleMontagemAutomatica);

  document.querySelectorAll("[data-close-modal='banco']").forEach(button => {
    button.addEventListener("click", () => closeModal(elements.modalBanco));
  });
  document.querySelectorAll("[data-close-modal='questao']").forEach(button => {
    button.addEventListener("click", () => closeModal(elements.modalQuestao));
  });

  elements.tipoQuestao.addEventListener("change", updateQuestionType);
  elements.questaoAnoEscolar.addEventListener("change", updateQuestionDescritores);
  elements.questaoDisciplina.addEventListener("change", updateQuestionDescritores);
  elements.formQuestao.addEventListener("submit", handleCreateQuestion);
  elements.formProva.addEventListener("submit", handleSaveProva);
  elements.alternativasTexto.addEventListener("input", buildAlternativasFromForm);
  elements.questaoImagensApoio.addEventListener("change", () => renderPreviewFiles(elements.questaoImagensApoio, elements.questaoPreviewImagensApoio));
  elements.btnSugerirDescritorQuestao.addEventListener("click", handleSuggestDescritor);
  elements.questaoDescritor.addEventListener("change", () => {
    if (elements.questaoDescritor.value) {
      elements.questaoDescritorConfirmadoPeloProfessor.checked = true;
    }
  });

  elements.filtroBancoAno.addEventListener("change", () => {
    updateBankDescritores();
    state.filters.anoEscolar = elements.filtroBancoAno.value;
    renderBancoModal();
  });
  elements.filtroBancoDisciplina.addEventListener("change", () => {
    updateBankDescritores();
    state.filters.disciplina = elements.filtroBancoDisciplina.value;
    renderBancoModal();
  });
  elements.filtroBancoDescritor.addEventListener("change", () => {
    state.filters.descritor = elements.filtroBancoDescritor.value;
    renderBancoModal();
  });
  elements.filtroBancoBusca.addEventListener("input", () => {
    state.filters.search = elements.filtroBancoBusca.value.trim();
    renderBancoModal();
  });

  elements.listaBancoQuestoes.addEventListener("change", event => {
    const blockInput = event.target.closest("[data-select-block]");
    if (blockInput) {
      const blockId = blockInput.dataset.selectBlock;
      if (blockInput.checked) {
        state.selectedBlockIds = [...new Set([...state.selectedBlockIds, blockId])];
        appendSelectedItem("bloco", blockId);
      } else {
        state.selectedBlockIds = state.selectedBlockIds.filter(item => item !== blockId);
        removeSelectedItem("bloco", blockId);
      }
      refreshSelectedQuestionDetails();
      return;
    }

    const input = event.target.closest("[data-select-question]");
    if (!input) return;
    const questionId = input.dataset.selectQuestion;
    if (input.checked) {
      state.selectedQuestionIds = [...new Set([...state.selectedQuestionIds, questionId])];
      appendSelectedItem("questao", questionId);
    } else {
      state.selectedQuestionIds = state.selectedQuestionIds.filter(item => item !== questionId);
      removeSelectedItem("questao", questionId);
    }
    refreshSelectedQuestionDetails();
  });

  elements.listaBancoSelecionadas.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-banco]");
    if (!button) return;
    state.selectedQuestionIds = state.selectedQuestionIds.filter(item => item !== button.dataset.removeBanco);
    removeSelectedItem("questao", button.dataset.removeBanco);
    refreshSelectedQuestionDetails();
  });

  elements.listaBlocosSelecionados.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-bloco]");
    if (!button) return;
    state.selectedBlockIds = state.selectedBlockIds.filter(item => item !== button.dataset.removeBloco);
    removeSelectedItem("bloco", button.dataset.removeBloco);
    refreshSelectedQuestionDetails();
  });

  elements.listaTemporarias.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-temp]");
    if (!button) return;
    const index = Number(button.dataset.removeTemp);
    const tempId = state.temporaryQuestions[index]?.tempId;
    state.temporaryQuestions.splice(index, 1);
    if (tempId) {
      removeSelectedItem("temporaria", tempId);
    }
    renderSelectionSummary();
  });
}

async function init() {
  bindEvents();
  buildAlternativasFromForm();
  updateQuestionType();
  updateQuestionDescritores();
  updateMontagemMode();
  renderSelectionSummary();
  await Promise.all([loadBancoQuestoes(), loadTurmas()]);
}

init();
