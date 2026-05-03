import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js?v=20260502localrules5";
import { requireProfessor } from "../core/session.js?v=20260502localrules5";
import { clearFeedback, escapeHtml, renderEmptyState, setLoading, showFeedback } from "../utils/ui.js?v=20260502localrules5";
import { getAlternativeLabel } from "../services/questions-service.js?v=20260502localrules5";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js?v=20260502localrules5";
import { organizarQuestoesParaRevisao, salvarImportacaoRevisada } from "../services/importacao-questoes-service.js?v=20260502localrules5";

const usuario = requireProfessor();

const state = {
  importedQuestions: [],
  sourceLabel: "",
  parseInfo: {
    tituloDetectado: "",
    textoBaseDetectado: ""
  }
};

const elements = {
  formImportacao: document.getElementById("formImportacao"),
  titulo: document.getElementById("importTitulo"),
  anoEscolar: document.getElementById("importAnoEscolar"),
  disciplina: document.getElementById("importDisciplina"),
  fonteNome: document.getElementById("importFonteNome"),
  fonteUrl: document.getElementById("importFonteUrl"),
  fonteObservacao: document.getElementById("importFonteObservacao"),
  textoBruto: document.getElementById("importTextoBruto"),
  statusDeteccao: document.getElementById("importStatusDeteccao"),
  btnOrganizar: document.getElementById("btnOrganizarImportacao"),
  btnSalvar: document.getElementById("btnSalvarImportacao"),
  btnLimpar: document.getElementById("btnLimparImportacao"),
  feedback: document.getElementById("feedbackImportacao"),
  listaImportada: document.getElementById("listaImportada"),
  metricDetectadas: document.getElementById("metricDetectadas"),
  metricProntas: document.getElementById("metricProntas"),
  metricDescritor: document.getElementById("metricDescritor"),
  chipTituloDetectado: document.getElementById("chipTituloDetectado"),
  chipTextoBase: document.getElementById("chipTextoBase")
};

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` + options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function getDisciplineLabel(value, fallback = "") {
  return DISCIPLINAS.find(item => item.value === value)?.label || fallback || "Sem disciplina";
}

function getYearLabel(value, fallback = "") {
  return ANOS_ESCOLARES.find(item => item.value === value)?.label || fallback || "Ano nao informado";
}

function getImportContext() {
  return {
    titulo: elements.titulo.value.trim(),
    anoEscolar: elements.anoEscolar.value,
    disciplina: elements.disciplina.value,
    textoOriginal: elements.textoBruto.value,
    fonte: {
      nome: elements.fonteNome.value.trim(),
      url: elements.fonteUrl.value.trim(),
      observacao: elements.fonteObservacao.value.trim(),
      licenca: ""
    }
  };
}

function isQuestionReady(question) {
  if (!question.confirmadoParaSalvar || !question.enunciado.trim() || !question.disciplina || !question.anoEscolar) {
    return false;
  }

  if (disciplinaPrecisaDescritor(question.disciplina) && !question.descritor) {
    return false;
  }

  if (question.tipo === "resposta_escrita") {
    return Boolean((question.respostaEsperada || "").trim());
  }

  return (question.alternativas || []).length >= 2 && question.respostaCorreta !== "";
}

function updateMetrics() {
  const detectadas = state.importedQuestions.length;
  const prontas = state.importedQuestions.filter(isQuestionReady).length;
  const comDescritor = state.importedQuestions.filter(question => (
    !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor)
  )).length;

  elements.metricDetectadas.textContent = String(detectadas);
  elements.metricProntas.textContent = String(prontas);
  elements.metricDescritor.textContent = String(comDescritor);
  elements.btnSalvar.disabled = prontas === 0;
}

function updateParseInfo() {
  elements.chipTituloDetectado.textContent = `Titulo detectado: ${state.parseInfo.tituloDetectado || "-"}`;
  elements.chipTextoBase.textContent = state.parseInfo.textoBaseDetectado
    ? `Texto base: ${state.parseInfo.textoBaseDetectado.slice(0, 42)}${state.parseInfo.textoBaseDetectado.length > 42 ? "..." : ""}`
    : "Texto base: nao detectado";
}

function updateDetectionStatus(message, type = "neutral") {
  elements.statusDeteccao.textContent = message;
  elements.statusDeteccao.dataset.status = type;
}

function buildDescritorOptions(question) {
  return "<option value=\"\">Selecione</option>" + getDescritores(question.disciplina, question.anoEscolar)
    .map(item => `<option value="${item.codigo}" ${item.codigo === question.descritor ? "selected" : ""}>${item.codigo} - ${escapeHtml(item.nome)}</option>`)
    .join("");
}

function normalizeQuestionClassification(question) {
  const descritorValido = getDescritores(question.disciplina, question.anoEscolar)
    .some(item => item.codigo === question.descritor);

  if (!descritorValido) {
    question.descritor = "";
    question.descritorDescricao = "";
  } else {
    question.descritorDescricao = getDescritores(question.disciplina, question.anoEscolar)
      .find(item => item.codigo === question.descritor)?.nome || "";
  }

  question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
}

function syncAllQuestionsFromCards() {
  elements.listaImportada.querySelectorAll("[data-question-index]").forEach(card => {
    syncQuestionFromCard(Number(card.dataset.questionIndex));
  });
}

function applyGlobalFieldToQuestions(field, value) {
  if (!state.importedQuestions.length) return;
  syncAllQuestionsFromCards();

  state.importedQuestions = state.importedQuestions.map(question => {
    const next = {
      ...question,
      [field]: value
    };
    normalizeQuestionClassification(next);
    return next;
  });

  renderImportPreview();
}

function getSuggestionData(question) {
  return question.classificacaoSugestao || question.descritorSugestaoIA || {};
}

function getAlternativeRows(question) {
  const source = (question.alternativas || []).length
    ? question.alternativas
    : Array.from({ length: 4 }, () => ({ texto: "", imagemUrl: "" }));

  return source.map((item, index) => ({
    index,
    label: item?.letra || getAlternativeLabel(index, question.formatoAlternativas),
    texto: typeof item === "string" ? item : item?.texto || "",
    imagemUrl: typeof item === "object" ? item?.imagemUrl || item?.imagem || "" : "",
    correta: String(question.respostaCorreta) === String(index) || item?.correta
  }));
}

function hasSupportImages(question) {
  return Boolean((question.imagensApoio || []).length);
}

function hasSupportText(question) {
  return Boolean((question.textoApoio || "").trim());
}

function renderSupportTextField(question, index) {
  const open = Boolean(question.usarTextoApoio || hasSupportText(question));
  return `
    <div class="review-toggle-row">
      <button type="button" class="button-inline button-outline" data-toggle-support-text="${index}">
        ${open ? "Ocultar texto de apoio" : "Usar texto de apoio"}
      </button>
    </div>
    <div class="form-field review-large-field" data-support-text-wrapper="${index}" ${open ? "" : "hidden"}>
      <label>Texto de apoio</label>
      <textarea data-field="textoApoio">${escapeHtml(question.textoApoio || "")}</textarea>
    </div>
  `;
}

function renderTextAlternativeRows(question, index) {
  const rows = getAlternativeRows(question);
  if (!rows.length) {
    return "<div class=\"helper-box\">Nenhuma alternativa encontrada.</div>";
  }

  return `
    <div class="review-alternatives" data-alt-text-list="${index}">
      ${rows.map(row => `
        <label class="review-alt-row">
          <input type="radio" name="correctAlternative-${index}" value="${row.index}" ${row.correta ? "checked" : ""}>
          <span class="review-alt-label">${escapeHtml(row.label)}</span>
          <input type="text" data-alt-text="${row.index}" value="${escapeHtml(row.texto)}" placeholder="Texto da alternativa">
        </label>
      `).join("")}
    </div>
  `;
}

function renderImageAlternativeRows(question, index) {
  const rows = getAlternativeRows(question);
  if (!rows.length) {
    return "<div class=\"helper-box\">Nenhuma imagem de alternativa encontrada.</div>";
  }

  return `
    <div class="review-alternatives" data-alt-image-list="${index}">
      ${rows.map(row => `
        <div class="review-alt-row">
          <input type="radio" name="correctAlternative-${index}" value="${row.index}" ${row.correta ? "checked" : ""}>
          <span class="review-alt-label">${escapeHtml(row.label)}</span>
          <div class="review-upload-panel">
            ${row.imagemUrl ? `
              <div class="review-preview-grid">
                <div class="review-preview-card">
                  <img src="${row.imagemUrl}" alt="Alternativa ${escapeHtml(row.label)}">
                  <button type="button" class="button-inline button-danger" data-remove-alt-image="${index}" data-alt-index="${row.index}">Remover imagem</button>
                </div>
              </div>
            ` : "<div class=\"helper-box\">Nenhuma imagem enviada nesta alternativa.</div>"}
            <div class="review-upload-actions">
              <input type="file" accept="image/*" data-alt-image-upload="${index}" data-alt-index="${row.index}">
              <input type="hidden" data-alt-image-url="${row.index}" value="${escapeHtml(row.imagemUrl)}">
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSupportImageField(question, index) {
  const open = Boolean(question.usarImagensApoio || hasSupportImages(question));
  return `
    <div class="review-toggle-row">
      <button type="button" class="button-inline button-outline" data-toggle-support-images="${index}">
        ${open ? "Ocultar imagem de apoio" : "Usar imagem de apoio"}
      </button>
    </div>
    <div class="form-field review-large-field" data-support-image-wrapper="${index}" ${open ? "" : "hidden"}>
      <label>Imagem de apoio</label>
      <div class="review-upload-panel">
        ${(question.imagensApoio || []).length ? `
          <div class="review-preview-grid">
            ${(question.imagensApoio || []).map((url, imageIndex) => `
              <div class="review-preview-card">
                <img src="${url}" alt="Imagem de apoio ${imageIndex + 1}">
                <button type="button" class="button-inline button-danger" data-remove-support-image="${index}" data-image-index="${imageIndex}">Remover</button>
              </div>
            `).join("")}
          </div>
        ` : "<div class=\"helper-box\">Nenhuma imagem de apoio detectada.</div>"}
        <div class="review-upload-actions">
          <input type="file" accept="image/*" multiple data-support-image-upload="${index}">
        </div>
      </div>
    </div>
  `;
}

function getGabaritoLabel(question) {
  if (question.gabaritoOriginal) {
    return question.gabaritoOriginal;
  }

  if (question.tipo === "resposta_escrita") {
    return question.respostaEsperada || "Nao informado";
  }

  const row = getAlternativeRows(question).find(item => String(item.index) === String(question.respostaCorreta));
  return row?.label || "Nao informado";
}

function renderClassificationSummary(question) {
  const suggestion = getSuggestionData(question);
  const bncc = suggestion.bnccSugerida || suggestion.codigo_bncc || question.bncc_sugerido || "Nao informado";
  const habilidade = suggestion.habilidadeBncc || suggestion.habilidade_bncc || suggestion.habilidade || question.habilidade_bncc || "Nao informada";
  const descritor = suggestion.descritorSugerido || suggestion.descritor || question.descritor || "Nao informado";
  const conteudo = suggestion.conteudoSugerido || suggestion.conteudo || question.conteudo || "Nao informado";
  const categoria = suggestion.categoriaSugerida || suggestion.categoria || question.categoria_bncc || "Nao informada";
  const confianca = suggestion.confianca || question.confianca_classificacao || "baixa";
  const justificativa = suggestion.justificativa || question.justificativa_classificacao || "Sem justificativa.";

  return `
    <div class="review-summary-box">
      <strong>Preview da classificacao sugerida por regras locais</strong>
      <div class="review-summary-grid">
        <div class="review-summary-item"><strong>Disciplina</strong><span>${escapeHtml(getDisciplineLabel(question.disciplina, question.disciplinaOriginal || ""))}</span></div>
        <div class="review-summary-item"><strong>Ano sugerido</strong><span>${escapeHtml(getYearLabel(question.anoEscolar, question.anoOriginal || ""))}</span></div>
        <div class="review-summary-item"><strong>Tipo</strong><span>${escapeHtml(question.tipo)}</span></div>
        <div class="review-summary-item"><strong>Gabarito</strong><span>${escapeHtml(getGabaritoLabel(question))}</span></div>
        <div class="review-summary-item"><strong>Descritor</strong><span>${escapeHtml(descritor)}</span></div>
        <div class="review-summary-item"><strong>Codigo BNCC</strong><span>${escapeHtml(bncc)}</span></div>
        <div class="review-summary-item"><strong>Habilidade</strong><span>${escapeHtml(habilidade)}</span></div>
        <div class="review-summary-item"><strong>Conteudo</strong><span>${escapeHtml(conteudo)}</span></div>
        <div class="review-summary-item"><strong>Categoria</strong><span>${escapeHtml(categoria)}</span></div>
        <div class="review-summary-item"><strong>Confianca</strong><span>${escapeHtml(confianca)}</span></div>
      </div>
      <div class="muted-small">Justificativa: ${escapeHtml(justificativa)}</div>
    </div>
  `;
}

function getQuestionAlerts(question) {
  const alerts = new Set(Array.isArray(question.importWarnings) ? question.importWarnings : []);

  if (!question.enunciado.trim()) {
    alerts.add("enunciado ausente");
  }

  if (question.tipo === "resposta_escrita") {
    if (!question.respostaEsperada.trim()) {
      alerts.add("resposta correta ausente");
    }
  } else {
    if ((question.alternativas || []).length < 2) {
      alerts.add("alternativas ausentes");
    }
    if (question.respostaCorreta === "") {
      alerts.add("resposta correta ausente");
    }
  }

  return [...alerts];
}

function renderQuestionAlerts(question) {
  const alerts = getQuestionAlerts(question);
  if (!alerts.length) return "";

  return `
    <div class="feedback feedback-warning" data-question-alerts>
      ${alerts.map(alert => `<div>${escapeHtml(alert)}</div>`).join("")}
    </div>
  `;
}

function renderImportPreview() {
  if (!state.importedQuestions.length) {
    elements.listaImportada.innerHTML = renderEmptyState("Cole o texto bruto da prova e clique em \"Organizar questoes\" para montar a previa.");
    updateMetrics();
    updateParseInfo();
    return;
  }

  elements.listaImportada.innerHTML = state.importedQuestions.map((question, index) => `
    <article class="review-card" data-question-index="${index}">
      <header>
        <div>
          <h3>Questao ${index + 1} ${question.numeroOriginal ? `- original ${question.numeroOriginal}` : ""}</h3>
          <div class="tag-row" style="margin-top:8px;">
            <span class="tag tag-primary">${escapeHtml(getDisciplineLabel(question.disciplina, question.disciplinaOriginal || ""))}</span>
            <span class="tag tag-neutral">${escapeHtml(getYearLabel(question.anoEscolar, question.anoOriginal || ""))}</span>
            <span class="tag ${question.tipo === "resposta_escrita" ? "tag-warning" : "tag-success"}">${escapeHtml(question.tipo)}</span>
            <span class="tag tag-neutral">${escapeHtml(state.sourceLabel || "texto bruto")}</span>
          </div>
        </div>
        <div class="review-card-actions">
          <label class="checkbox-row review-checkbox">
            <input type="checkbox" data-field="confirmadoParaSalvar" ${question.confirmadoParaSalvar ? "checked" : ""}>
            Incluir no salvamento
          </label>
        </div>
      </header>

      <div class="review-content-stack">
        ${renderQuestionAlerts(question)}
        ${renderClassificationSummary(question)}
        ${renderSupportTextField(question, index)}
        ${renderSupportImageField(question, index)}

        <div class="form-field review-large-field">
          <label>Enunciado</label>
          <textarea data-field="enunciado">${escapeHtml(question.enunciado)}</textarea>
        </div>

        <div class="form-field review-large-field" data-alt-text-wrapper="${index}" ${question.tipo === "multipla_texto" ? "" : "hidden"}>
          <label>Alternativas por linha</label>
          ${renderTextAlternativeRows(question, index)}
        </div>

        <div class="form-field review-large-field" data-alt-image-wrapper="${index}" ${question.tipo === "multipla_imagem" ? "" : "hidden"}>
          <label>Imagens por linha</label>
          ${renderImageAlternativeRows(question, index)}
        </div>

        <div class="form-field review-large-field" data-escrita-wrapper="${index}" ${question.tipo === "resposta_escrita" ? "" : "hidden"}>
          <label>Resposta correta / esperada</label>
          <textarea data-field="respostaEsperada">${escapeHtml(question.respostaEsperada || "")}</textarea>
        </div>
      </div>

      <div class="review-controls-row">
        <div class="review-control-field">
          <label>Disciplina</label>
          <select data-field="disciplina">
            ${DISCIPLINAS.map(item => `<option value="${item.value}" ${item.value === question.disciplina ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </div>
        <div class="review-control-field">
          <label>Ano escolar</label>
          <select data-field="anoEscolar">
            ${ANOS_ESCOLARES.map(item => `<option value="${item.value}" ${item.value === question.anoEscolar ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </div>
        <div class="review-control-field">
          <label>Tipo de questao</label>
          <select data-field="tipo">
            <option value="multipla_texto" ${question.tipo === "multipla_texto" ? "selected" : ""}>Multipla escolha com texto</option>
            <option value="multipla_imagem" ${question.tipo === "multipla_imagem" ? "selected" : ""}>Multipla escolha com imagem</option>
            <option value="resposta_escrita" ${question.tipo === "resposta_escrita" ? "selected" : ""}>Resposta escrita</option>
          </select>
        </div>
        <div class="review-control-field review-control-field-descritor">
          <label>Descritor</label>
          <select data-field="descritor">${buildDescritorOptions(question)}</select>
        </div>
      </div>

      <div class="review-controls-row">
        <div class="review-control-field">
          <label>BNCC</label>
          <input type="text" data-field="bncc_sugerido" value="${escapeHtml(question.bncc_sugerido || "")}" placeholder="Codigo BNCC">
        </div>
        <div class="review-control-field">
          <label>Habilidade BNCC</label>
          <input type="text" data-field="habilidade_bncc" value="${escapeHtml(question.habilidade_bncc || "")}" placeholder="Habilidade">
        </div>
        <div class="review-control-field">
          <label>Conteudo</label>
          <input type="text" data-field="conteudo" value="${escapeHtml(question.conteudo || "")}" placeholder="Conteudo">
        </div>
        <div class="review-control-field">
          <label>Categoria</label>
          <input type="text" data-field="categoria_bncc" value="${escapeHtml(question.categoria_bncc || "")}" placeholder="Categoria">
        </div>
      </div>
    </article>
  `).join("");

  bindQuestionReviewEvents();
  updateMetrics();
  updateParseInfo();
}

function syncQuestionFromCard(index) {
  const card = elements.listaImportada.querySelector(`[data-question-index="${index}"]`);
  if (!card) return;

  const question = state.importedQuestions[index];
  question.enunciado = card.querySelector("[data-field=\"enunciado\"]").value.trim();
  question.tipo = card.querySelector("[data-field=\"tipo\"]").value;
  question.disciplina = card.querySelector("[data-field=\"disciplina\"]").value;
  question.anoEscolar = card.querySelector("[data-field=\"anoEscolar\"]").value;
  question.descritor = card.querySelector("[data-field=\"descritor\"]").value;
  question.bncc_sugerido = card.querySelector("[data-field=\"bncc_sugerido\"]").value.trim();
  question.habilidade_bncc = card.querySelector("[data-field=\"habilidade_bncc\"]").value.trim();
  question.conteudo = card.querySelector("[data-field=\"conteudo\"]").value.trim();
  question.categoria_bncc = card.querySelector("[data-field=\"categoria_bncc\"]").value.trim();
  question.descritorDescricao = getDescritores(question.disciplina, question.anoEscolar)
    .find(item => item.codigo === question.descritor)?.nome || "";
  question.textoApoio = card.querySelector("[data-field=\"textoApoio\"]")?.value.trim() || "";
  question.confirmadoParaSalvar = card.querySelector("[data-field=\"confirmadoParaSalvar\"]").checked;
  normalizeQuestionClassification(question);
  question.classificacao_confirmada = question.confirmadoParaSalvar;
  question.data_confirmacao = question.confirmadoParaSalvar ? (question.data_confirmacao || new Date()) : null;
  question.professor_id = question.confirmadoParaSalvar ? usuario.uid : question.professor_id;

  if (question.descritorSugestaoIA && typeof question.descritorSugestaoIA === "object") {
    question.descritorSugestaoIA.descritor = question.descritor;
    question.descritorSugestaoIA.codigo_bncc = question.bncc_sugerido;
    question.descritorSugestaoIA.habilidade = question.habilidade_bncc;
    question.descritorSugestaoIA.habilidade_bncc = question.habilidade_bncc;
    question.descritorSugestaoIA.conteudo = question.conteudo;
    question.descritorSugestaoIA.categoria = question.categoria_bncc;
  }

  if (question.classificacaoSugestao && typeof question.classificacaoSugestao === "object") {
    question.classificacaoSugestao.descritorSugerido = question.descritor;
    question.classificacaoSugestao.bnccSugerida = question.bncc_sugerido;
    question.classificacaoSugestao.habilidadeBncc = question.habilidade_bncc;
    question.classificacaoSugestao.conteudoSugerido = question.conteudo;
    question.classificacaoSugestao.categoriaSugerida = question.categoria_bncc;
  }

  if (question.tipo === "resposta_escrita") {
    question.respostaEsperada = card.querySelector("[data-field=\"respostaEsperada\"]").value.trim();
    question.alternativas = [];
    question.respostaCorreta = "";
    question.imagensApoio = question.imagensApoio || [];
    return;
  }

  if (question.tipo === "multipla_imagem") {
    const imageInputs = [...card.querySelectorAll("[data-alt-image-url]")];
    question.alternativas = imageInputs
      .map((input, altIndex) => ({
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: "",
        imagemUrl: input.value.trim(),
        correta: false,
        ordem: altIndex
      }))
      .filter(item => item.imagemUrl);
  } else {
    const textInputs = [...card.querySelectorAll("[data-alt-text]")];
    question.alternativas = textInputs
      .map((input, altIndex) => ({
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        texto: input.value.trim(),
        imagemUrl: "",
        correta: false,
        ordem: altIndex
      }))
      .filter(item => item.texto);
  }

  const checkedAlternative = card.querySelector(`input[name="correctAlternative-${index}"]:checked`);
  question.respostaCorreta = checkedAlternative ? checkedAlternative.value : "";
  question.alternativas = (question.alternativas || []).map((item, altIndex) => ({
    ...item,
    correta: String(question.respostaCorreta) === String(altIndex)
  }));
  question.respostaEsperada = "";

  const alertsContainer = card.querySelector("[data-question-alerts]");
  const alertsMarkup = renderQuestionAlerts(question);
  if (alertsContainer) {
    alertsContainer.outerHTML = alertsMarkup || "<div data-question-alerts hidden></div>";
  } else if (alertsMarkup) {
    const stack = card.querySelector(".review-content-stack");
    stack?.insertAdjacentHTML("afterbegin", alertsMarkup);
  }
}

function bindQuestionReviewEvents() {
  elements.listaImportada.querySelectorAll("[data-question-index]").forEach(card => {
    const index = Number(card.dataset.questionIndex);

    card.querySelectorAll("textarea, select, input[type='checkbox'], input[type='text'], input[type='radio']").forEach(field => {
      field.addEventListener("change", () => {
        syncQuestionFromCard(index);
        updateMetrics();
      });
    });

    const typeSelect = card.querySelector("[data-field=\"tipo\"]");
    typeSelect.addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });

    card.querySelector("[data-field=\"disciplina\"]").addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });

    card.querySelector("[data-field=\"anoEscolar\"]").addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-images]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportImages);
      state.importedQuestions[index].usarImagensApoio = !state.importedQuestions[index].usarImagensApoio;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-text]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportText);
      state.importedQuestions[index].usarTextoApoio = !state.importedQuestions[index].usarTextoApoio;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-support-image]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeSupportImage);
      const imageIndex = Number(button.dataset.imageIndex);
      state.importedQuestions[index].imagensApoio.splice(imageIndex, 1);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-support-image-upload]").forEach(input => {
    input.addEventListener("change", async () => {
      const index = Number(input.dataset.supportImageUpload);
      const files = Array.from(input.files || []);
      if (!files.length) return;

      try {
        showFeedback(elements.feedback, "success", "Enviando imagem(ns) de apoio...");
        const uploaded = await uploadMultiplasImagensCloudinary(files);
        state.importedQuestions[index].imagensApoio = [
          ...(state.importedQuestions[index].imagensApoio || []),
          ...uploaded
        ];
        state.importedQuestions[index].usarImagensApoio = true;
        showFeedback(elements.feedback, "success", "Imagem(ns) de apoio enviada(s) com sucesso.");
        renderImportPreview();
      } catch (error) {
        showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem de apoio.");
      } finally {
        input.value = "";
      }
    });
  });

  elements.listaImportada.querySelectorAll("[data-alt-image-upload]").forEach(input => {
    input.addEventListener("change", async () => {
      const questionIndex = Number(input.dataset.altImageUpload);
      const altIndex = Number(input.dataset.altIndex);
      const file = input.files?.[0];
      if (!file) return;

      try {
        showFeedback(elements.feedback, "success", `Enviando imagem da alternativa ${altIndex + 1}...`);
        const url = await uploadImagemCloudinary(file);
        const question = state.importedQuestions[questionIndex];
        const alternatives = [...(question.alternativas || [])];
        while (alternatives.length <= altIndex) {
          alternatives.push({ texto: "", imagemUrl: "", correta: false, ordem: alternatives.length });
        }
        alternatives[altIndex] = {
          ...alternatives[altIndex],
          letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
          texto: "",
          imagemUrl: url,
          ordem: altIndex
        };
        question.alternativas = alternatives;
        showFeedback(elements.feedback, "success", "Imagem da alternativa enviada com sucesso.");
        renderImportPreview();
      } catch (error) {
        showFeedback(elements.feedback, "error", error.message || "Erro ao enviar imagem da alternativa.");
      } finally {
        input.value = "";
      }
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-alt-image]").forEach(button => {
    button.addEventListener("click", () => {
      const questionIndex = Number(button.dataset.removeAltImage);
      const altIndex = Number(button.dataset.altIndex);
      const question = state.importedQuestions[questionIndex];
      const alternatives = [...(question.alternativas || [])];
      while (alternatives.length <= altIndex) {
        alternatives.push({ texto: "", imagemUrl: "", correta: false, ordem: alternatives.length });
      }
      alternatives[altIndex] = {
        ...alternatives[altIndex],
        letra: getAlternativeLabel(altIndex, question.formatoAlternativas),
        imagemUrl: "",
        texto: ""
      };
      question.alternativas = alternatives;
      renderImportPreview();
    });
  });
}

function applySuggestedContext(questoes, meta = {}) {
  if (!questoes.length) return;
  const first = questoes[0];

  if (!elements.disciplina.value && first.disciplina) {
    elements.disciplina.value = first.disciplina;
  }

  if (!elements.anoEscolar.value && first.anoEscolar) {
    elements.anoEscolar.value = first.anoEscolar;
  }

  if (!elements.titulo.value.trim()) {
    elements.titulo.value = meta.tituloDetectado || "Importacao de questoes";
  }
}

function resetImportedQuestions() {
  state.importedQuestions = [];
  state.parseInfo = { tituloDetectado: "", textoBaseDetectado: "" };
}

function processarTextoBrutoImportado() {
  const valor = elements.textoBruto.value.trim();

  if (!valor) {
    resetImportedQuestions();
    state.sourceLabel = "";
    clearFeedback(elements.feedback);
    updateDetectionStatus("Cole o texto bruto e clique em \"Organizar questoes\".", "neutral");
    renderImportPreview();
    return;
  }

  const resultado = organizarQuestoesParaRevisao(valor, getImportContext());
  const questoes = resultado.questions || [];

  if (!questoes.length) {
    resetImportedQuestions();
    state.sourceLabel = "";
    updateDetectionStatus("Nenhuma questao foi identificada. Revise o texto bruto e tente novamente.", "warning");
    showFeedback(elements.feedback, "error", "Nao foi possivel separar questoes automaticamente com esse texto.");
    renderImportPreview();
    return;
  }

  state.importedQuestions = questoes;
  state.sourceLabel = "texto bruto";
  state.parseInfo = {
    tituloDetectado: resultado.tituloDetectado || elements.titulo.value.trim(),
    textoBaseDetectado: resultado.textoBaseDetectado || ""
  };

  applySuggestedContext(questoes, resultado);
  updateDetectionStatus(`${questoes.length} questao(oes) organizada(s) automaticamente a partir do texto bruto.`, "success");
  showFeedback(elements.feedback, "success", `${questoes.length} questao(oes) pronta(s) para revisao. Ajuste o que precisar e salve no final.`);
  renderImportPreview();
}

function validateImportedQuestions() {
  const selecionadas = state.importedQuestions.filter(question => question.confirmadoParaSalvar);

  if (!selecionadas.length) {
    throw new Error("Selecione pelo menos uma questao para salvar.");
  }

  selecionadas.forEach((question, index) => {
    if (!question.enunciado.trim()) {
      throw new Error(`A questao selecionada ${index + 1} esta sem enunciado.`);
    }

    if (!question.anoEscolar) {
      throw new Error(`Informe o ano escolar da questao ${index + 1}.`);
    }

    if (!question.disciplina) {
      throw new Error(`Informe a disciplina da questao ${index + 1}.`);
    }

    if (disciplinaPrecisaDescritor(question.disciplina) && !question.descritor) {
      throw new Error(`Defina o descritor da questao ${index + 1} antes de salvar.`);
    }

    if (question.tipo === "resposta_escrita") {
      if (!question.respostaEsperada.trim()) {
        throw new Error(`Informe a resposta correta da questao ${index + 1}.`);
      }
      return;
    }

    if ((question.alternativas || []).length < 2) {
      throw new Error(`A questao ${index + 1} precisa de pelo menos 2 alternativas.`);
    }

    if (question.respostaCorreta === "") {
      throw new Error(`Defina a alternativa correta da questao ${index + 1}.`);
    }
  });
}

async function handleSalvarImportacao() {
  clearFeedback(elements.feedback);
  setLoading(elements.btnSalvar, true, "Salvar questoes", "Salvando...");

  try {
    syncAllQuestionsFromCards();
    state.importedQuestions.forEach(question => {
      question.descritorConfirmadoPeloProfessor = !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor);
      if (question.confirmadoParaSalvar) {
        question.classificacao_confirmada = true;
        question.data_confirmacao = question.data_confirmacao || new Date();
      }
    });
    validateImportedQuestions();
    const context = getImportContext();
    const result = await salvarImportacaoRevisada(context, state.importedQuestions, usuario);
    showFeedback(elements.feedback, "success", `${result.totalSalvas} questao(oes) salva(s) no banco do professor.`);
    state.importedQuestions = [];
    state.sourceLabel = "";
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao salvar a importacao.");
  } finally {
    setLoading(elements.btnSalvar, false, "Salvar questoes", "Salvando...");
  }
}

function handleLimparImportacao() {
  elements.formImportacao.reset();
  resetImportedQuestions();
  state.sourceLabel = "";
  clearFeedback(elements.feedback);
  updateDetectionStatus("Cole o texto bruto e clique em \"Organizar questoes\".", "neutral");
  renderImportPreview();
}

function bindEvents() {
  populateSelect(elements.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.disciplina, DISCIPLINAS, "Selecione");

  elements.textoBruto.addEventListener("input", () => {
    if (!elements.textoBruto.value.trim()) {
      updateDetectionStatus("Cole o texto bruto e clique em \"Organizar questoes\".", "neutral");
      return;
    }
    updateDetectionStatus("Texto atualizado. Clique em \"Organizar questoes\" para processar novamente.", "warning");
  });

  elements.btnOrganizar.addEventListener("click", processarTextoBrutoImportado);
  elements.btnSalvar.addEventListener("click", handleSalvarImportacao);
  elements.btnLimpar.addEventListener("click", handleLimparImportacao);
  elements.anoEscolar.addEventListener("change", () => applyGlobalFieldToQuestions("anoEscolar", elements.anoEscolar.value));
  elements.disciplina.addEventListener("change", () => applyGlobalFieldToQuestions("disciplina", elements.disciplina.value));
}

function init() {
  bindEvents();
  updateDetectionStatus("Cole o texto bruto e clique em \"Organizar questoes\".", "neutral");
  renderImportPreview();
}

init();
