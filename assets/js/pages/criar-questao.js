import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getAnoLabel, getDescritores, getDisciplinaLabel } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import {
  ALTERNATIVE_FORMATS,
  DEFAULT_ALTERNATIVE_FORMAT,
  createQuestion,
  deleteQuestion,
  deleteQuestionBlock,
  getAlternativeLabel,
  getQuestionBlockById,
  getQuestionById,
  getQuestionsByBlockId,
  limparAlternativas,
  saveQuestionBlock,
  updateQuestion
} from "../services/questions-service.js";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js";
import { analisarDescritorQuestao } from "../services/descritor-ai-service.js";
import { db } from "../core/firebase-app.js";
import { clearFeedback, escapeHtml, renderEmptyState, setLoading, showFeedback } from "../utils/ui.js";

const usuario = requireProfessor();

const state = {
  mode: "",
  editingQuestionId: "",
  editingBlockId: "",
  blockQuestions: [],
  deletedBlockQuestionIds: [],
  editingBlockQuestionIndex: null
};

const elements = {
  modeCards: document.querySelectorAll("[data-mode]"),
  modoAtualBadge: document.getElementById("modoAtualBadge"),
  emptyModePanel: document.getElementById("emptyModePanel"),
  individualModePanel: document.getElementById("individualModePanel"),
  blockModePanel: document.getElementById("blockModePanel"),
  individualContext: document.getElementById("individualContext"),
  blockContext: document.getElementById("blockContext"),
  individualQuestionHost: document.getElementById("individualQuestionHost"),
  blockQuestionPanel: document.getElementById("blockQuestionPanel"),
  btnAdicionarQuestaoBloco: document.getElementById("btnAdicionarQuestaoBloco"),
  btnSalvarBlocoCompleto: document.getElementById("btnSalvarBlocoCompleto"),
  btnExcluirBloco: document.getElementById("btnExcluirBloco"),
  btnLimparBloco: document.getElementById("btnLimparBloco"),
  feedbackBloco: document.getElementById("feedbackBloco"),
  contadorBloco: document.getElementById("contadorBloco"),
  listaQuestoesBloco: document.getElementById("listaQuestoesBloco"),
  contextTemplate: document.getElementById("contextTemplate"),
  questionTemplate: document.getElementById("questionTemplate")
};

let individualContext = null;
let blockContext = null;
let individualForm = null;
let blockForm = null;

window.limparAlternativas = limparAlternativas;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function populateAlternativeFormats(select) {
  select.innerHTML = ALTERNATIVE_FORMATS
    .map(item => `<option value="${item.value}">${item.label}</option>`)
    .join("");
  select.value = DEFAULT_ALTERNATIVE_FORMAT;
}

function createContextController(host, isBlock) {
  const node = elements.contextTemplate.content.cloneNode(true);
  host.innerHTML = "";
  host.appendChild(node);

  const controller = {
    isBlock,
    tituloTextoField: host.querySelector("[data-block-title-field]"),
    tituloTexto: host.querySelector("[data-field='tituloTexto']"),
    anoEscolar: host.querySelector("[data-field='anoEscolar']"),
    disciplina: host.querySelector("[data-field='disciplina']"),
    textoApoio: host.querySelector("[data-field='textoApoio']"),
    imagensApoio: host.querySelector("[data-field='imagensApoio']"),
    previewImagensApoio: host.querySelector("[data-field='previewImagensApoio']"),
    imagensApoioExistentes: host.querySelector("[data-field='imagensApoioExistentes']"),
    existingImages: []
  };

  controller.tituloTextoField.hidden = !isBlock;
  populateSelect(controller.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(controller.disciplina, DISCIPLINAS, "Selecione");
  controller.imagensApoio.addEventListener("change", () => renderSupportImagePreview(controller));

  return controller;
}

function renderSupportImagePreview(controller) {
  const files = Array.from(controller.imagensApoio.files || []);
  controller.previewImagensApoio.innerHTML = files
    .map(file => `<span class="tag tag-neutral">${escapeHtml(file.name)}</span>`)
    .join("");

  controller.imagensApoioExistentes.innerHTML = (controller.existingImages || [])
    .map(url => `<img src="${url}" alt="Imagem de apoio existente">`)
    .join("");
}

function getContextPayload(controller) {
  return {
    tituloTexto: controller.tituloTexto?.value.trim() || "",
    anoEscolar: controller.anoEscolar.value,
    disciplina: controller.disciplina.value,
    textoApoio: controller.textoApoio.value,
    existingImages: [...(controller.existingImages || [])],
    files: Array.from(controller.imagensApoio.files || [])
  };
}

async function uploadContextImages(controller) {
  const context = getContextPayload(controller);
  const uploaded = context.files.length ? await uploadMultiplasImagensCloudinary(context.files) : [];
  return [...context.existingImages, ...uploaded];
}

function validateContext(controller) {
  const context = getContextPayload(controller);
  if (!context.anoEscolar) throw new Error("Selecione o ano escolar.");
  if (!context.disciplina) throw new Error("Selecione a disciplina.");

  if (controller.isBlock) {
    if (!context.tituloTexto) throw new Error("Informe o titulo do texto.");
    if (!context.textoApoio.trim()) throw new Error("Informe o texto base do bloco.");
  }

  return context;
}

function createQuestionController(host, submitLabel, title) {
  const node = elements.questionTemplate.content.cloneNode(true);
  host.innerHTML = "";
  host.appendChild(node);

  const root = host.querySelector("section");
  const controller = {
    host,
    root,
    form: host.querySelector("[data-question-form]"),
    title: host.querySelector("[data-title]"),
    enunciado: host.querySelector("[data-field='enunciado']"),
    descritorWrapper: host.querySelector("[data-descritor-wrapper]"),
    descritor: host.querySelector("[data-field='descritor']"),
    formatoAlternativas: host.querySelector("[data-field='formatoAlternativas']"),
    nivelDificuldade: host.querySelector("[data-field='nivelDificuldade']"),
    descritorPanel: host.querySelector("[data-descritor-panel]"),
    btnSugerir: host.querySelector("[data-action='sugerir']"),
    descritorFeedback: host.querySelector("[data-field='descritorFeedback']"),
    descritorConfirmado: host.querySelector("[data-field='descritorConfirmado']"),
    alternativasTextoPanel: host.querySelector("[data-panel='texto']"),
    alternativasTexto: host.querySelector("[data-field='alternativasTexto']"),
    alternativasTextoPreview: host.querySelector("[data-field='alternativasTextoPreview']"),
    alternativasImagemPanel: host.querySelector("[data-panel='imagem']"),
    alternativasImagem: host.querySelector("[data-field='alternativasImagem']"),
    alternativasImagemPreview: host.querySelector("[data-field='alternativasImagemPreview']"),
    respostaEscritaPanel: host.querySelector("[data-panel='escrita']"),
    respostaEsperada: host.querySelector("[data-field='respostaEsperada']"),
    feedback: host.querySelector("[data-field='feedbackQuestao']"),
    btnLimpar: host.querySelector("[data-action='limpar']"),
    btnSalvar: host.querySelector("[data-action='salvar']"),
    btnExcluir: host.querySelector("[data-action='excluir']"),
    imageAlternatives: [],
    correctIndex: "",
    descritorSugestao: null,
    editingId: ""
  };

  controller.title.textContent = title;
  controller.btnSalvar.textContent = submitLabel;
  populateAlternativeFormats(controller.formatoAlternativas);

  controller.form.addEventListener("change", event => {
    if (event.target.name === "tipo") updateQuestionType(controller);
  });
  controller.formatoAlternativas.addEventListener("change", () => {
    renderTextAlternatives(controller);
    renderImageAlternatives(controller);
  });
  controller.alternativasTexto.addEventListener("input", () => renderTextAlternatives(controller));
  controller.alternativasImagem.addEventListener("change", () => appendImageAlternatives(controller));
  controller.btnSugerir.addEventListener("click", () => suggestDescritor(controller, getActiveContext()));
  controller.descritor.addEventListener("change", () => {
    if (controller.descritor.value) controller.descritorConfirmado.checked = true;
  });
  controller.btnLimpar.addEventListener("click", () => resetQuestionController(controller));
  controller.btnExcluir.addEventListener("click", () => handleDeleteQuestion(controller));

  updateQuestionType(controller);
  renderTextAlternatives(controller);
  renderImageAlternatives(controller);

  return controller;
}

function getSelectedTipo(controller) {
  return new FormData(controller.form).get("tipo") || "multipla_texto";
}

function setSelectedTipo(controller, tipo) {
  const radio = controller.form.querySelector(`input[name="tipo"][value="${tipo || "multipla_texto"}"]`);
  if (radio) radio.checked = true;
  updateQuestionType(controller);
}

function updateQuestionType(controller) {
  const tipo = getSelectedTipo(controller);
  controller.alternativasTextoPanel.hidden = tipo !== "multipla_texto";
  controller.alternativasImagemPanel.hidden = tipo !== "multipla_imagem";
  controller.respostaEscritaPanel.hidden = tipo !== "resposta_escrita";
}

function updateQuestionDescritores(controller, context) {
  const precisa = disciplinaPrecisaDescritor(context.disciplina);
  controller.descritorWrapper.hidden = !precisa;
  controller.descritorPanel.hidden = !precisa;
  controller.descritorConfirmado.checked = !precisa;

  const current = controller.descritor.value;
  controller.descritor.innerHTML = '<option value="">Selecione</option>' + getDescritores(context.disciplina, context.anoEscolar)
    .map(item => `<option value="${item.codigo}">${item.codigo} - ${item.nome}</option>`)
    .join("");
  controller.descritor.value = current;
}

function renderTextAlternatives(controller) {
  const items = limparAlternativas(controller.alternativasTexto.value);
  const format = controller.formatoAlternativas.value;
  controller.alternativasTextoPreview.innerHTML = items.length
    ? items.map((texto, index) => `
        <label class="clean-preview-item">
          <span class="alt-label">${escapeHtml(getAlternativeLabel(index, format))}</span>
          <span>${escapeHtml(texto)}</span>
          <span><input type="radio" name="correctText" value="${index}" ${String(controller.correctIndex) === String(index) ? "checked" : ""}> correta</span>
        </label>
      `).join("")
    : `<div class="helper-box">As alternativas limpas aparecem aqui.</div>`;

  controller.alternativasTextoPreview.querySelectorAll("input[name='correctText']").forEach(input => {
    input.addEventListener("change", () => {
      controller.correctIndex = input.value;
    });
  });
}

async function appendImageAlternatives(controller) {
  const files = Array.from(controller.alternativasImagem.files || []);
  controller.alternativasImagem.value = "";

  if (!files.length) {
    return;
  }

  showFeedback(controller.feedback, "success", "Enviando imagem...");

  for (const file of files) {
    const previewUrl = URL.createObjectURL(file);
    controller.imageAlternatives.push({
      uploading: true,
      url: previewUrl,
      name: file.name
    });
    renderImageAlternatives(controller);

    try {
      const secureUrl = await uploadImagemCloudinary(file);
      const item = controller.imageAlternatives.find(alt => alt.url === previewUrl && alt.uploading);
      if (item) {
        item.uploading = false;
        item.existingUrl = secureUrl;
        item.url = secureUrl;
        item.name = file.name;
      }
      showFeedback(controller.feedback, "success", "Imagem enviada com sucesso.");
      renderImageAlternatives(controller);
    } catch (error) {
      controller.imageAlternatives = controller.imageAlternatives.filter(alt => alt.url !== previewUrl);
      showFeedback(controller.feedback, "error", error.message || "Erro ao enviar imagem.");
      renderImageAlternatives(controller);
    }
  }
}

function renderImageAlternatives(controller) {
  const format = controller.formatoAlternativas.value;
  controller.alternativasImagemPreview.innerHTML = controller.imageAlternatives.length
    ? controller.imageAlternatives.map((item, index) => `
        <div class="image-alt-item">
          <span class="alt-label">${escapeHtml(getAlternativeLabel(index, format))}</span>
          <div>
            <img src="${item.url}" alt="Alternativa ${escapeHtml(getAlternativeLabel(index, format))}">
            <div class="muted-small">${escapeHtml(item.name || "Imagem da alternativa")} ${item.uploading ? "- enviando..." : "- enviada"}</div>
          </div>
          <div class="toolbar">
            <label class="button-inline button-outline">
              <input type="radio" name="correctImage" value="${index}" ${String(controller.correctIndex) === String(index) ? "checked" : ""}> correta
            </label>
            <button class="button-inline button-danger" type="button" data-remove-image-alt="${index}">Remover</button>
          </div>
        </div>
      `).join("")
    : `<div class="helper-box">Adicione imagens. A primeira sera ${escapeHtml(getAlternativeLabel(0, format))}, a segunda ${escapeHtml(getAlternativeLabel(1, format))}, e assim por diante.</div>`;

  controller.alternativasImagemPreview.querySelectorAll("input[name='correctImage']").forEach(input => {
    input.addEventListener("change", () => {
      controller.correctIndex = input.value;
    });
  });

  controller.alternativasImagemPreview.querySelectorAll("[data-remove-image-alt]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeImageAlt);
      controller.imageAlternatives.splice(index, 1);
      controller.correctIndex = String(controller.correctIndex) === String(index) ? "" : controller.correctIndex;
      renderImageAlternatives(controller);
    });
  });
}

function resetQuestionController(controller) {
  controller.form.reset();
  controller.imageAlternatives = [];
  controller.correctIndex = "";
  controller.descritorSugestao = null;
  controller.editingId = "";
  controller.btnExcluir.hidden = true;
  clearFeedback(controller.feedback);
  clearFeedback(controller.descritorFeedback);
  populateAlternativeFormats(controller.formatoAlternativas);
  updateQuestionType(controller);
  updateQuestionDescritores(controller, getActiveContext());
  renderTextAlternatives(controller);
  renderImageAlternatives(controller);
}

async function handleDeleteQuestion(controller) {
  if (!controller.editingId) {
    return;
  }

  const ok = confirm("Tem certeza que deseja excluir esta questao? Ela sera apagada do Firestore.");
  if (!ok) {
    return;
  }

  clearFeedback(controller.feedback);
  setLoading(controller.btnExcluir, true, "Excluir questao", "Excluindo...");

  try {
    await deleteQuestion(controller.editingId);
    window.location.href = "professor-questoes.html";
  } catch (error) {
    showFeedback(controller.feedback, "error", error.message || "Erro ao excluir questao.");
    setLoading(controller.btnExcluir, false, "Excluir questao", "Excluindo...");
  }
}

function getActiveContext() {
  return state.mode === "bloco" ? getContextPayload(blockContext) : getContextPayload(individualContext);
}

async function suggestDescritor(controller, context) {
  clearFeedback(controller.descritorFeedback);
  const tipo = getSelectedTipo(controller);
  const result = await analisarDescritorQuestao({
    tituloTextoApoio: context.tituloTexto,
    disciplina: context.disciplina,
    anoEscolar: context.anoEscolar,
    textoApoio: context.textoApoio,
    enunciado: controller.enunciado.value,
    alternativas: tipo === "multipla_texto" ? limparAlternativas(controller.alternativasTexto.value) : [],
    respostaCorreta: controller.correctIndex,
    tipo,
    respostaEsperada: tipo === "resposta_escrita" ? controller.respostaEsperada.value : ""
  });

  controller.descritorSugestao = result;

  if (!result || !result.descritor) {
    showFeedback(controller.descritorFeedback, "error", "Nao foi possivel sugerir um descritor. Escolha manualmente.");
    return;
  }

  controller.descritor.value = result.descritor;
  controller.descritorConfirmado.checked = false;
  showFeedback(
    controller.descritorFeedback,
    "success",
    `Descritor sugerido: ${result.descritor} - ${result.descricao} (confianca ${Math.round((result.confianca || 0) * 100)}%). ${result.justificativa || ""}`
  );
}

function buildQuestionDraft(controller, context) {
  const tipo = getSelectedTipo(controller);
  const selectedDescritor = getDescritores(context.disciplina, context.anoEscolar)
    .find(item => item.codigo === controller.descritor.value);
  let alternativas = [];

  if (tipo === "multipla_texto") {
    alternativas = limparAlternativas(controller.alternativasTexto.value).map((texto, index) => ({
      texto,
      imagemUrl: "",
      correta: String(controller.correctIndex) === String(index),
      ordem: index
    }));
  }

  if (tipo === "multipla_imagem") {
    alternativas = controller.imageAlternatives.map((item, index) => ({
      texto: "",
      imagemUrl: item.existingUrl || "",
      file: item.file || null,
      previewUrl: item.url,
      name: item.name || "",
      correta: String(controller.correctIndex) === String(index),
      ordem: index
    }));
  }

  return {
    id: controller.editingId || "",
    tipo,
    anoEscolar: context.anoEscolar,
    disciplina: context.disciplina,
    enunciado: controller.enunciado.value,
    alternativas,
    respostaCorreta: controller.correctIndex,
    respostaEsperada: tipo === "resposta_escrita" ? controller.respostaEsperada.value : "",
    descritor: controller.descritor.value,
    descritorDescricao: selectedDescritor?.nome || "",
    descritorConfirmadoPeloProfessor: controller.descritorConfirmado.checked,
    descritorSugestaoIA: controller.descritorSugestao,
    descritorSugerido: controller.descritorSugestao?.descritor || "",
    descritorConfirmado: controller.descritor.value,
    professorAlterou: Boolean(controller.descritorSugestao?.descritor && controller.descritor.value && controller.descritorSugestao.descritor !== controller.descritor.value),
    confiancaDescritor: Number(controller.descritorSugestao?.confianca || 0),
    nivelDificuldade: controller.nivelDificuldade.value,
    formatoAlternativas: controller.formatoAlternativas.value,
    autor: usuario.uid,
    autorId: usuario.uid
  };
}

async function registrarAnaliseDescritor(question, payload, origem) {
  const sugestao = payload.descritorSugestaoIA;
  if (!sugestao || !payload.disciplina || !payload.anoEscolar) {
    return;
  }

  await db.collection("analisesDescritores").add({
    questaoId: question?.id || payload.id || "",
    blocoId: payload.blocoId || "",
    origem,
    professorId: usuario.uid,
    professorNome: usuario.nome || "",
    disciplina: payload.disciplina,
    anoEscolar: payload.anoEscolar,
    tipo: payload.tipo,
    descritorSugerido: sugestao.descritor || "",
    descritorConfirmado: payload.descritor || "",
    professorAlterou: Boolean(sugestao.descritor && payload.descritor && sugestao.descritor !== payload.descritor),
    confianca: Number(sugestao.confianca || 0),
    descricao: sugestao.descricao || "",
    justificativa: sugestao.justificativa || "",
    origemAnalise: sugestao.origemAnalise || "",
    criteriosAnalisados: sugestao.criteriosAnalisados || {},
    criadoEm: new Date()
  });
}

async function materializeQuestionDraft(draft) {
  if (draft.tipo !== "multipla_imagem") {
    return draft;
  }

  const alternativas = [];
  for (const alt of draft.alternativas || []) {
    const imagemUrl = alt.imagemUrl || (alt.file ? await uploadImagemCloudinary(alt.file) : "");
    alternativas.push({
      texto: "",
      imagemUrl,
      correta: alt.correta,
      ordem: alt.ordem
    });
  }

  return {
    ...draft,
    alternativas
  };
}

function fillQuestionController(controller, question) {
  controller.editingId = question.id || "";
  controller.btnExcluir.hidden = !controller.editingId;
  setSelectedTipo(controller, question.tipo);
  controller.enunciado.value = question.enunciado || "";
  controller.formatoAlternativas.value = question.formatoAlternativas || DEFAULT_ALTERNATIVE_FORMAT;
  controller.nivelDificuldade.value = question.nivelDificuldade || "";
  controller.descritor.value = question.descritor || "";
  controller.descritorConfirmado.checked = question.descritorConfirmadoPeloProfessor !== false;
  controller.respostaEsperada.value = question.respostaEsperada || "";
  controller.correctIndex = typeof question.resposta_correta === "number"
    ? String(question.resposta_correta)
    : String((question.alternativas || []).findIndex(item => item.correta));

  if (question.tipo === "multipla_texto") {
    controller.alternativasTexto.value = (question.alternativas || [])
      .map(item => item.texto || "")
      .filter(Boolean)
      .join("\n");
  }

  if (question.tipo === "multipla_imagem") {
    controller.imageAlternatives = (question.alternativas || [])
      .filter(item => item.imagemUrl)
      .map(item => ({
        existingUrl: item.imagemUrl,
        url: item.imagemUrl,
        name: "Imagem salva"
      }));
  }

  updateQuestionType(controller);
  renderTextAlternatives(controller);
  renderImageAlternatives(controller);
}

function fillContext(controller, questionOrBlock) {
  controller.anoEscolar.value = questionOrBlock.anoEscolar || questionOrBlock.ano_escolar || "";
  controller.disciplina.value = questionOrBlock.disciplina || "";
  controller.textoApoio.value = questionOrBlock.textoApoio || "";
  controller.existingImages = questionOrBlock.imagensApoio || [];
  if (controller.isBlock) controller.tituloTexto.value = questionOrBlock.blocoTitulo || questionOrBlock.tituloTextoApoio || questionOrBlock.titulo || "";
  renderSupportImagePreview(controller);
}

async function handleIndividualSubmit(event) {
  event.preventDefault();
  clearFeedback(individualForm.feedback);
  setLoading(individualForm.btnSalvar, true, state.editingQuestionId ? "Atualizar questao" : "Salvar questao", "Salvando...");

  try {
    const context = validateContext(individualContext);
    const imagensApoio = await uploadContextImages(individualContext);
    const draft = await materializeQuestionDraft(buildQuestionDraft(individualForm, context));
    const payload = {
      ...draft,
      textoApoio: context.textoApoio,
      imagensApoio,
      origemCriacao: "individual"
    };

    if (state.editingQuestionId) {
      const question = await updateQuestion(state.editingQuestionId, payload, usuario);
      await registrarAnaliseDescritor(question, payload, "individual");
      showFeedback(individualForm.feedback, "success", "Questao atualizada com sucesso.");
    } else {
      const question = await createQuestion(payload, usuario);
      await registrarAnaliseDescritor(question, payload, "individual");
      showFeedback(individualForm.feedback, "success", "Questao individual salva no banco.");
      resetQuestionController(individualForm);
    }
  } catch (error) {
    showFeedback(individualForm.feedback, "error", error.message || "Erro ao salvar questao.");
  } finally {
    setLoading(individualForm.btnSalvar, false, state.editingQuestionId ? "Atualizar questao" : "Salvar questao", "Salvando...");
  }
}

function startBlockQuestion(index = null) {
  clearFeedback(elements.feedbackBloco);
  validateContext(blockContext);
  state.editingBlockQuestionIndex = index;
  elements.blockQuestionPanel.hidden = false;
  blockForm.title.textContent = index === null ? "Adicionar questao ao bloco" : "Editar questao do bloco";
  blockForm.btnSalvar.textContent = index === null ? "Adicionar questao ao bloco" : "Atualizar questao do bloco";
  resetQuestionController(blockForm);
  updateQuestionDescritores(blockForm, getContextPayload(blockContext));

  if (index !== null) {
    fillQuestionController(blockForm, state.blockQuestions[index]);
    blockForm.btnExcluir.hidden = true;
  }
}

function handleBlockQuestionSubmit(event) {
  event.preventDefault();
  clearFeedback(blockForm.feedback);

  try {
    const context = validateContext(blockContext);
    const draft = buildQuestionDraft(blockForm, context);

    if (state.editingBlockQuestionIndex === null) {
      state.blockQuestions.push(draft);
      showFeedback(blockForm.feedback, "success", "Questao adicionada ao bloco. Salve o bloco completo ao finalizar.");
    } else {
      state.blockQuestions[state.editingBlockQuestionIndex] = {
        ...state.blockQuestions[state.editingBlockQuestionIndex],
        ...draft
      };
      showFeedback(blockForm.feedback, "success", "Questao do bloco atualizada.");
    }

    renderBlockQuestions();
    resetQuestionController(blockForm);
    elements.blockQuestionPanel.hidden = true;
    state.editingBlockQuestionIndex = null;
  } catch (error) {
    showFeedback(blockForm.feedback, "error", error.message || "Erro ao adicionar questao ao bloco.");
  }
}

function renderBlockQuestions() {
  elements.contadorBloco.textContent = `${state.blockQuestions.length} questao(oes)`;
  elements.listaQuestoesBloco.innerHTML = state.blockQuestions.length
    ? state.blockQuestions.map((question, index) => `
        <article class="question-card">
          <div class="question-card-header">
            <div>
              <h3 class="question-card-title">${index + 1}. ${escapeHtml(question.enunciado)}</h3>
              <div class="meta-row">
                <span class="tag tag-primary">${escapeHtml(getDisciplinaLabel(question.disciplina))}</span>
                <span class="tag tag-neutral">${escapeHtml(getAnoLabel(question.anoEscolar))}</span>
                <span class="tag tag-neutral">${escapeHtml(question.descritor || "Sem descritor")}</span>
              </div>
            </div>
            <div class="toolbar">
              <button class="button-inline button-outline" type="button" data-edit-block-question="${index}">Editar</button>
              <button class="button-inline button-danger" type="button" data-remove-block-question="${index}">Excluir</button>
            </div>
          </div>
        </article>
      `).join("")
    : renderEmptyState("Nenhuma questao adicionada ao bloco ainda.");

  elements.listaQuestoesBloco.querySelectorAll("[data-edit-block-question]").forEach(button => {
    button.addEventListener("click", () => startBlockQuestion(Number(button.dataset.editBlockQuestion)));
  });

  elements.listaQuestoesBloco.querySelectorAll("[data-remove-block-question]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeBlockQuestion);
      const question = state.blockQuestions[index];
      const ok = confirm(question?.id
        ? "Excluir esta questao do bloco? Ela sera apagada do Firestore quando voce salvar o bloco completo."
        : "Excluir esta questao do bloco?");
      if (!ok) return;

      if (question?.id) {
        state.deletedBlockQuestionIds.push(question.id);
      }
      state.blockQuestions.splice(index, 1);
      renderBlockQuestions();
    });
  });
}

async function saveCompleteBlock() {
  clearFeedback(elements.feedbackBloco);
  setLoading(elements.btnSalvarBlocoCompleto, true, "Salvar bloco completo", "Salvando...");

  try {
    const context = validateContext(blockContext);
    const minQuestoes = state.editingBlockId ? 1 : 2;
    if (state.blockQuestions.length < minQuestoes) {
      throw new Error(minQuestoes > 1
        ? "Adicione pelo menos 2 questoes ao bloco antes de salvar."
        : "O bloco precisa ter pelo menos uma questao.");
    }
    const imagensApoio = await uploadContextImages(blockContext);
    const materialized = [];

    for (const question of state.blockQuestions) {
      const item = await materializeQuestionDraft(question);
      materialized.push({
        ...item,
        blocoId: state.editingBlockId,
        blocoTitulo: context.tituloTexto
      });
    }

    const savedBlock = await saveQuestionBlock({
      blocoId: state.editingBlockId,
      titulo: context.tituloTexto,
      textoApoio: context.textoApoio,
      imagensApoio,
      anoEscolar: context.anoEscolar,
      disciplina: context.disciplina,
      questoes: materialized,
      minQuestoes
    }, usuario);

    for (const questionId of [...new Set(state.deletedBlockQuestionIds)]) {
      await deleteQuestion(questionId);
    }

    state.editingBlockId = savedBlock.blocoId;
    state.deletedBlockQuestionIds = [];
    await Promise.all(savedBlock.questoes.map((question, index) => registrarAnaliseDescritor(
      question,
      {
        ...materialized[index],
        blocoId: savedBlock.blocoId
      },
      "bloco_texto"
    )));
    state.blockQuestions = savedBlock.questoes.map(question => ({
      ...question,
      respostaCorreta: question.resposta_correta
    }));
    blockContext.existingImages = savedBlock.imagensApoio || [];
    blockContext.imagensApoio.value = "";
    renderSupportImagePreview(blockContext);
    renderBlockQuestions();
    showFeedback(elements.feedbackBloco, "success", "Bloco completo salvo com sucesso.");
  } catch (error) {
    showFeedback(elements.feedbackBloco, "error", error.message || "Erro ao salvar bloco.");
  } finally {
    setLoading(elements.btnSalvarBlocoCompleto, false, "Salvar bloco completo", "Salvando...");
  }
}

function setMode(mode) {
  state.mode = mode;
  elements.modeCards.forEach(card => card.classList.toggle("is-active", card.dataset.mode === mode));
  elements.emptyModePanel.hidden = true;
  elements.individualModePanel.hidden = mode !== "individual";
  elements.blockModePanel.hidden = mode !== "bloco";
  elements.modoAtualBadge.textContent = mode === "bloco"
    ? "Modo atual: Bloco de questoes baseadas em texto"
    : "Modo atual: Questao individual";

  if (mode === "individual") {
    updateQuestionDescritores(individualForm, getContextPayload(individualContext));
  } else {
    updateQuestionDescritores(blockForm, getContextPayload(blockContext));
  }
}

function bindEvents() {
  elements.modeCards.forEach(card => {
    card.addEventListener("click", () => setMode(card.dataset.mode));
  });

  individualForm.form.addEventListener("submit", handleIndividualSubmit);
  blockForm.form.addEventListener("submit", handleBlockQuestionSubmit);
  elements.btnAdicionarQuestaoBloco.addEventListener("click", () => startBlockQuestion(null));
  elements.btnSalvarBlocoCompleto.addEventListener("click", saveCompleteBlock);
  elements.btnExcluirBloco.addEventListener("click", async () => {
    if (!state.editingBlockId) return;
    const ok = confirm("Tem certeza que deseja excluir este bloco? Todas as questoes vinculadas tambem serao apagadas do Firestore.");
    if (!ok) return;

    clearFeedback(elements.feedbackBloco);
    setLoading(elements.btnExcluirBloco, true, "Excluir bloco", "Excluindo...");
    try {
      await deleteQuestionBlock(state.editingBlockId);
      window.location.href = "professor-questoes.html";
    } catch (error) {
      showFeedback(elements.feedbackBloco, "error", error.message || "Erro ao excluir bloco.");
      setLoading(elements.btnExcluirBloco, false, "Excluir bloco", "Excluindo...");
    }
  });
  elements.btnLimparBloco.addEventListener("click", () => {
    state.blockQuestions = [];
    state.editingBlockId = "";
    state.deletedBlockQuestionIds = [];
    elements.btnExcluirBloco.hidden = true;
    blockContext.tituloTexto.value = "";
    blockContext.anoEscolar.value = "";
    blockContext.disciplina.value = "";
    blockContext.textoApoio.value = "";
    blockContext.existingImages = [];
    blockContext.imagensApoio.value = "";
    renderSupportImagePreview(blockContext);
    renderBlockQuestions();
    elements.blockQuestionPanel.hidden = true;
    clearFeedback(elements.feedbackBloco);
  });

  [individualContext, blockContext].forEach(contextController => {
    contextController.anoEscolar.addEventListener("change", () => {
      updateQuestionDescritores(contextController.isBlock ? blockForm : individualForm, getContextPayload(contextController));
    });
    contextController.disciplina.addEventListener("change", () => {
      updateQuestionDescritores(contextController.isBlock ? blockForm : individualForm, getContextPayload(contextController));
    });
  });
}

async function loadEditingState() {
  const editId = getQueryParam("edit");
  const blockId = getQueryParam("block");

  if (editId) {
    const question = await getQuestionById(editId);
    if (!question) throw new Error("Questao nao encontrada para edicao.");
    state.editingQuestionId = editId;
    setMode("individual");
    fillContext(individualContext, question);
    updateQuestionDescritores(individualForm, getContextPayload(individualContext));
    fillQuestionController(individualForm, question);
    individualForm.title.textContent = "Editar questao individual";
    individualForm.btnSalvar.textContent = "Atualizar questao";
    individualForm.btnExcluir.hidden = false;
    return;
  }

  if (blockId) {
    const questions = await getQuestionsByBlockId(blockId);
    if (!questions.length) throw new Error("Bloco nao encontrado para edicao.");
    const block = await getQuestionBlockById(blockId);
    const blockContextData = block || questions[0];
    state.editingBlockId = blockId;
    elements.btnExcluirBloco.hidden = false;
    setMode("bloco");
    fillContext(blockContext, {
      ...blockContextData,
      blocoTitulo: block?.titulo || questions[0]?.blocoTitulo || questions[0]?.tituloTextoApoio || "",
      textoApoio: block?.textoApoio || questions[0]?.textoApoio || "",
      imagensApoio: (block?.imagensApoio || []).length ? block.imagensApoio : (questions[0]?.imagensApoio || [])
    });
    updateQuestionDescritores(blockForm, getContextPayload(blockContext));
    state.blockQuestions = questions.map(question => ({
      ...question,
      respostaCorreta: question.resposta_correta
    }));
    renderBlockQuestions();
    return;
  }

  const mode = getQueryParam("mode");
  if (mode === "individual" || mode === "bloco") {
    setMode(mode);
  }
}

async function init() {
  individualContext = createContextController(elements.individualContext, false);
  blockContext = createContextController(elements.blockContext, true);
  individualForm = createQuestionController(elements.individualQuestionHost, "Salvar questao", "Nova questao individual");
  blockForm = createQuestionController(elements.blockQuestionPanel, "Adicionar questao ao bloco", "Adicionar questao ao bloco");

  bindEvents();
  renderBlockQuestions();

  try {
    await loadEditingState();
  } catch (error) {
    elements.emptyModePanel.hidden = false;
    elements.emptyModePanel.innerHTML = `<div class="feedback feedback-error">${escapeHtml(error.message || "Erro ao carregar edicao.")}</div>`;
  }
}

init();
