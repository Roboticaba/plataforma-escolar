import { ANOS_ESCOLARES, DISCIPLINAS, disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js";
import { requireProfessor } from "../core/session.js";
import { clearFeedback, escapeHtml, renderEmptyState, setLoading, showFeedback } from "../utils/ui.js";
import { getAlternativeLabel } from "../services/questions-service.js";
import { uploadImagemCloudinary, uploadMultiplasImagensCloudinary } from "../services/cloudinary-service.js";
import {
  enrichImportedQuestionsWithLocalDescriptors,
  parseQuestoesImportadas
} from "../services/importacao-questoes-service.js";
import {
  confirmarQuestaoImportada,
  copiarPromptIA,
  removerQuestaoImportada,
  renderizarPreviewQuestoes,
  salvarQuestoesConfirmadas,
  validarJSONImportado
} from "../services/importador-ia-externa-service.js";

const usuario = requireProfessor();

const state = {
  importedQuestions: [],
  importMode: "texto_local",
  autoValidateTimer: null,
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
  btnOrganizar: document.getElementById("btnOrganizarImportacao"),
  btnOrganizarIAExterna: document.getElementById("btnOrganizarIAExterna"),
  btnConfirmarTodas: document.getElementById("btnConfirmarTodasImportacao"),
  btnLimpar: document.getElementById("btnLimparImportacao"),
  btnSalvar: document.getElementById("btnSalvarImportacao"),
  feedback: document.getElementById("feedbackImportacao"),
  listaImportada: document.getElementById("listaImportada"),
  metricDetectadas: document.getElementById("metricDetectadas"),
  metricProntas: document.getElementById("metricProntas"),
  metricDescritor: document.getElementById("metricDescritor"),
  chipTituloDetectado: document.getElementById("chipTituloDetectado"),
  chipTextoBase: document.getElementById("chipTextoBase"),
  modalIAExterna: document.getElementById("modalIAExterna"),
  btnFecharModalIAExterna: document.getElementById("btnFecharModalIAExterna"),
  btnCopiarPromptIA: document.getElementById("btnCopiarPromptIA"),
  campoTextoBrutoIA: document.getElementById("campoTextoBrutoIA"),
  campoJsonIA: document.getElementById("campoJsonIA"),
  btnValidarJsonIA: document.getElementById("btnValidarJsonIA"),
  feedbackModalIA: document.getElementById("feedbackModalIA")
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
    titulo: elements.titulo.value.trim() || state.parseInfo.tituloDetectado,
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

function updateMetrics() {
  const detectadas = state.importedQuestions.length;
  const prontas = state.importedQuestions.filter(question => question.confirmadoParaSalvar && question.enunciado.trim()).length;
  const comDescritor = state.importedQuestions.filter(question => !disciplinaPrecisaDescritor(question.disciplina) || question.descritorConfirmadoPeloProfessor).length;

  elements.metricDetectadas.textContent = String(detectadas);
  elements.metricProntas.textContent = String(prontas);
  elements.metricDescritor.textContent = String(comDescritor);
  elements.btnSalvar.disabled = !prontas;
  elements.btnConfirmarTodas.disabled = !detectadas;
}

function updateParseInfo() {
  elements.chipTituloDetectado.textContent = `Titulo detectado: ${state.parseInfo.tituloDetectado || "-"}`;
  elements.chipTextoBase.textContent = state.parseInfo.textoBaseDetectado
    ? `Texto base: ${state.parseInfo.textoBaseDetectado.slice(0, 42)}${state.parseInfo.textoBaseDetectado.length > 42 ? "..." : ""}`
    : "Texto base: nao detectado";
}

function buildDescritorOptions(question) {
  return '<option value="">Selecione</option>' + getDescritores(question.disciplina, question.anoEscolar)
    .map(item => `<option value="${item.codigo}" ${item.codigo === question.descritor ? "selected" : ""}>${item.codigo} - ${escapeHtml(item.nome)}</option>`)
    .join("");
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
    return '<div class="helper-box">Nenhuma alternativa encontrada.</div>';
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
    return '<div class="helper-box">Nenhuma imagem de alternativa encontrada.</div>';
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
            ` : '<div class="helper-box">Nenhuma imagem enviada nesta alternativa.</div>'}
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
        ` : '<div class="helper-box">Nenhuma imagem de apoio detectada.</div>'}
        <div class="review-upload-actions">
          <input type="file" accept="image/*" multiple data-support-image-upload="${index}">
        </div>
      </div>
    </div>
  `;
}

function getSuggestionData(question) {
  return question.descritorSugestaoIA || {};
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
  const bncc = suggestion.codigo_bncc || question.bncc_sugerido || "Nao informado";
  const habilidade = suggestion.habilidade || question.habilidade_bncc || "Nao informada";
  const saeb = suggestion.saeb || question.saeb_equivalente || "Nao informado";
  const parana = suggestion.parana || question.parana_equivalente || "Nao informado";
  const categoria = suggestion.categoria || question.categoria_bncc || "Nao informada";
  const confianca = suggestion.confianca || question.confianca_classificacao || "baixa";
  const justificativa = suggestion.justificativa || question.justificativa_classificacao || "Sem justificativa.";

  return `
    <div class="review-summary-box">
      <strong>Preview da classificacao sugerida</strong>
      <div class="review-summary-grid">
        <div class="review-summary-item"><strong>Disciplina</strong><span>${escapeHtml(question.disciplinaOriginal || getDisciplineLabel(question.disciplina, ""))}</span></div>
        <div class="review-summary-item"><strong>Ano sugerido</strong><span>${escapeHtml(question.anoOriginal || getYearLabel(question.anoEscolar, ""))}</span></div>
        <div class="review-summary-item"><strong>Tipo importado</strong><span>${escapeHtml(question.tipoQuestaoImportado || question.tipo)}</span></div>
        <div class="review-summary-item"><strong>Gabarito</strong><span>${escapeHtml(getGabaritoLabel(question))}</span></div>
        <div class="review-summary-item"><strong>Codigo BNCC</strong><span>${escapeHtml(bncc)}</span></div>
        <div class="review-summary-item"><strong>Habilidade</strong><span>${escapeHtml(habilidade)}</span></div>
        <div class="review-summary-item"><strong>SAEB</strong><span>${escapeHtml(saeb)}</span></div>
        <div class="review-summary-item"><strong>Parana</strong><span>${escapeHtml(parana)}</span></div>
        <div class="review-summary-item"><strong>Categoria</strong><span>${escapeHtml(categoria)}</span></div>
        <div class="review-summary-item"><strong>Confianca</strong><span>${escapeHtml(confianca)}</span></div>
      </div>
      <div class="muted-small">Justificativa: ${escapeHtml(justificativa)}</div>
    </div>
  `;
}

function renderImportPreview() {
  if (!state.importedQuestions.length) {
    elements.listaImportada.innerHTML = renderEmptyState("Cole o texto e clique em Organizar questoes ou use a IA externa para abrir a revisao assistida.");
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
            <span class="tag tag-neutral">${escapeHtml(state.importMode === "ia_externa" ? "IA externa" : "Parser local")}</span>
          </div>
        </div>
        <div class="review-card-actions">
          <label class="checkbox-row review-checkbox">
            <input type="checkbox" data-field="confirmadoParaSalvar" ${question.confirmadoParaSalvar ? "checked" : ""}>
            Pronta para salvar
          </label>
          <label class="checkbox-row review-checkbox">
            <input type="checkbox" data-field="confirmadoDescritor" ${question.descritorConfirmadoPeloProfessor ? "checked" : ""}>
            Descritor confirmado
          </label>
          <button type="button" class="button-inline button-outline" data-confirm-question="${index}">Confirmar</button>
          <button type="button" class="button-inline button-danger" data-remove-question="${index}">Remover</button>
        </div>
      </header>

      <div class="review-content-stack">
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
          <label>Resposta esperada</label>
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
          <label>Recalcular descritor</label>
          <button type="button" class="button-inline button-outline" data-refresh-descriptor="${index}">Recalcular descritor</button>
        </div>
      </div>
      <div class="muted-small" style="margin-top:10px;">
        Sugestao local: ${escapeHtml(question.descritorSugestaoIA?.justificativa || "sem sugestao")}
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
  question.enunciado = card.querySelector('[data-field="enunciado"]').value.trim();
  question.tipo = card.querySelector('[data-field="tipo"]').value;
  question.disciplina = card.querySelector('[data-field="disciplina"]').value;
  question.anoEscolar = card.querySelector('[data-field="anoEscolar"]').value;
  question.descritor = card.querySelector('[data-field="descritor"]').value;
  question.descritorDescricao = getDescritores(question.disciplina, question.anoEscolar)
    .find(item => item.codigo === question.descritor)?.nome || "";
  question.textoApoio = card.querySelector('[data-field="textoApoio"]')?.value.trim() || "";
  question.confirmadoParaSalvar = card.querySelector('[data-field="confirmadoParaSalvar"]').checked;
  question.descritorConfirmadoPeloProfessor = card.querySelector('[data-field="confirmadoDescritor"]').checked;
  question.classificacao_confirmada = question.confirmadoParaSalvar;
  question.data_confirmacao = question.confirmadoParaSalvar ? (question.data_confirmacao || new Date()) : null;
  question.professor_id = question.confirmadoParaSalvar ? usuario.uid : question.professor_id;

  if (question.tipo === "resposta_escrita") {
    question.respostaEsperada = card.querySelector('[data-field="respostaEsperada"]').value.trim();
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
  question.respostaEsperada = "";
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

    const typeSelect = card.querySelector('[data-field="tipo"]');
    typeSelect.addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });

    card.querySelector('[data-field="disciplina"]').addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });

    card.querySelector('[data-field="anoEscolar"]').addEventListener("change", () => {
      syncQuestionFromCard(index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-confirm-question]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.confirmQuestion);
      state.importedQuestions = confirmarQuestaoImportada(state.importedQuestions, index).map((question, currentIndex) => currentIndex === index
        ? {
            ...question,
            professor_id: usuario.uid
          }
        : question);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-remove-question]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeQuestion);
      state.importedQuestions = removerQuestaoImportada(state.importedQuestions, index);
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-refresh-descriptor]").forEach(button => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.refreshDescriptor);
      syncQuestionFromCard(index);
      const question = state.importedQuestions[index];
      const [enriched] = await enrichImportedQuestionsWithLocalDescriptors([question]);
      state.importedQuestions[index] = {
        ...question,
        ...enriched,
        confirmadoParaSalvar: false,
        classificacao_confirmada: false,
        data_confirmacao: null,
        descritorConfirmadoPeloProfessor: false
      };
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-images]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportImages);
      const question = state.importedQuestions[index];
      question.usarImagensApoio = !question.usarImagensApoio;
      renderImportPreview();
    });
  });

  elements.listaImportada.querySelectorAll("[data-toggle-support-text]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.toggleSupportText);
      const question = state.importedQuestions[index];
      question.usarTextoApoio = !question.usarTextoApoio;
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

function syncModalRawText() {
  if (!elements.campoTextoBrutoIA) return;
  elements.campoTextoBrutoIA.value = elements.textoBruto.value.trim();
}

function syncMainRawTextFromModal() {
  const valor = elements.campoTextoBrutoIA?.value || "";
  elements.textoBruto.value = valor;
}

function resetExternalImportModal() {
  clearFeedback(elements.feedbackModalIA);
  if (state.autoValidateTimer) {
    clearTimeout(state.autoValidateTimer);
    state.autoValidateTimer = null;
  }
  syncModalRawText();
  elements.campoJsonIA.value = "";
}

function openExternalImportModal() {
  resetExternalImportModal();
  elements.modalIAExterna.hidden = false;
}

function closeExternalImportModal() {
  elements.modalIAExterna.hidden = true;
}

async function handleCopiarPromptIA() {
  clearFeedback(elements.feedbackModalIA);
  const iaWindow = window.open("https://chat.openai.com", "_blank", "noopener");

  try {
    syncMainRawTextFromModal();
    const message = await copiarPromptIA(elements.campoTextoBrutoIA.value);
    const avisoJanela = iaWindow
      ? ""
      : ' Se a aba da IA nao abriu automaticamente, use este link: <a href="https://chat.openai.com" target="_blank" rel="noopener">abrir IA</a>.';
    showFeedback(elements.feedbackModalIA, "success", `${message}${avisoJanela}`);
  } catch (error) {
    if (iaWindow && !iaWindow.closed) {
      iaWindow.close();
    }
    showFeedback(elements.feedbackModalIA, "error", error.message || "Nao foi possivel copiar o prompt.");
  }
}

function applySuggestedContext(questions) {
  if (!questions.length) return;
  const first = questions[0];

  if (!elements.disciplina.value && first.disciplina) {
    elements.disciplina.value = first.disciplina;
  }

  if (!elements.anoEscolar.value && first.anoEscolar) {
    elements.anoEscolar.value = first.anoEscolar;
  }

  if (!elements.titulo.value.trim()) {
    elements.titulo.value = "Importacao organizada com IA externa";
  }
}

function processarJsonIA({ fecharModal = false, mostrarErroAmigavel = false } = {}) {
  clearFeedback(elements.feedback);

  try {
    const dados = validarJSONImportado(elements.campoJsonIA.value);
    const questoes = renderizarPreviewQuestoes(dados);

    state.importedQuestions = questoes;
    state.importMode = "ia_externa";
    state.parseInfo = {
      tituloDetectado: "IA externa",
      textoBaseDetectado: "JSON validado e pronto para revisao"
    };

    applySuggestedContext(questoes);
    syncMainRawTextFromModal();
    renderImportPreview();
    showFeedback(elements.feedbackModalIA, "success", `JSON valido. Questoes encontradas: ${questoes.length}.`);
    showFeedback(elements.feedback, "success", `${questoes.length} questao(oes) recebida(s) da IA externa. Revise, confirme e salve apenas o que estiver correto.`);

    if (fecharModal) {
      closeExternalImportModal();
    }

    return true;
  } catch (error) {
    if (mostrarErroAmigavel) {
      showFeedback(elements.feedbackModalIA, "error", "O conteudo colado ainda nao parece ser um JSON valido. Confira se a IA respondeu somente com JSON.");
    } else {
      showFeedback(elements.feedbackModalIA, "error", error.message || "Erro ao validar o JSON importado.");
    }
    return false;
  }
}

function handleValidarJsonIA() {
  clearFeedback(elements.feedbackModalIA);
  processarJsonIA({ fecharModal: true, mostrarErroAmigavel: true });
}

function agendarValidacaoAutomaticaJsonIA() {
  if (state.autoValidateTimer) {
    clearTimeout(state.autoValidateTimer);
  }

  const valor = elements.campoJsonIA.value.trim();
  if (!valor) {
    clearFeedback(elements.feedbackModalIA);
    return;
  }

  state.autoValidateTimer = setTimeout(() => {
    processarJsonIA({ fecharModal: false, mostrarErroAmigavel: true });
  }, 500);
}

async function handleOrganizarImportacao() {
  clearFeedback(elements.feedback);
  const context = getImportContext();

  if (!context.anoEscolar || !context.disciplina) {
    showFeedback(elements.feedback, "error", "Selecione ano escolar e disciplina antes de organizar.");
    return;
  }

  if (!context.textoOriginal.trim()) {
    showFeedback(elements.feedback, "error", "Cole o texto bruto da importacao.");
    return;
  }

  setLoading(elements.btnOrganizar, true, "Organizar questoes", "Organizando...");

  try {
    const parsed = parseQuestoesImportadas(context.textoOriginal, context);
    const enriched = await enrichImportedQuestionsWithLocalDescriptors(parsed.questions);

    state.importedQuestions = enriched.map(question => ({
      ...question,
      confirmadoParaSalvar: false,
      classificacao_confirmada: false,
      data_confirmacao: null,
      professor_id: ""
    }));
    state.importMode = "texto_local";
    state.parseInfo = {
      tituloDetectado: parsed.tituloDetectado,
      textoBaseDetectado: parsed.textoBaseDetectado
    };

    if (!enriched.length) {
      showFeedback(elements.feedback, "error", "Nenhuma questao foi detectada. Revise o texto colado.");
    } else {
      showFeedback(elements.feedback, "success", `${enriched.length} questao(oes) organizada(s). Revise antes de salvar.`);
    }

    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao organizar a importacao.");
  } finally {
    setLoading(elements.btnOrganizar, false, "Organizar questoes", "Organizando...");
  }
}

function validateImportedQuestions() {
  const confirmadas = state.importedQuestions.filter(question => question.confirmadoParaSalvar);

  if (!confirmadas.length) {
    throw new Error("Confirme pelo menos uma questao antes de salvar.");
  }

  confirmadas.forEach((question, index) => {
    if (!question.enunciado.trim()) {
      throw new Error(`A questao confirmada ${index + 1} esta sem enunciado.`);
    }

    if (disciplinaPrecisaDescritor(question.disciplina) && (!question.descritor || !question.descritorConfirmadoPeloProfessor)) {
      throw new Error(`Confirme o descritor da questao ${index + 1} antes de salvar.`);
    }

    if (question.tipo === "resposta_escrita" && !question.respostaEsperada.trim()) {
      throw new Error(`Informe a resposta esperada da questao ${index + 1}.`);
    }

    if (question.tipo !== "resposta_escrita") {
      if ((question.alternativas || []).length < 2) {
        throw new Error(`A questao ${index + 1} precisa de pelo menos 2 alternativas.`);
      }

      if (question.respostaCorreta === "") {
        throw new Error(`Defina a alternativa correta da questao ${index + 1}.`);
      }
    }
  });
}

async function handleSalvarImportacao() {
  clearFeedback(elements.feedback);
  setLoading(elements.btnSalvar, true, "Salvar revisadas", "Salvando...");

  try {
    validateImportedQuestions();
    const context = getImportContext();
    const result = await salvarQuestoesConfirmadas(context, state.importedQuestions, usuario);
    showFeedback(elements.feedback, "success", `${result.totalSalvas} questao(oes) salva(s) no banco do professor.`);
    state.importedQuestions = [];
    state.importMode = "texto_local";
    renderImportPreview();
  } catch (error) {
    showFeedback(elements.feedback, "error", error.message || "Erro ao salvar a importacao.");
  } finally {
    setLoading(elements.btnSalvar, false, "Salvar revisadas", "Salvando...");
  }
}

function handleConfirmarTodasImportacao() {
  state.importedQuestions = state.importedQuestions.map(question => ({
    ...question,
    confirmadoParaSalvar: true,
    classificacao_confirmada: true,
    data_confirmacao: question.data_confirmacao || new Date(),
    professor_id: usuario.uid,
    descritorConfirmadoPeloProfessor: !disciplinaPrecisaDescritor(question.disciplina) || Boolean(question.descritor)
  }));
  renderImportPreview();
}

function handleLimparImportacao() {
  elements.formImportacao.reset();
  state.importedQuestions = [];
  state.importMode = "texto_local";
  state.parseInfo = { tituloDetectado: "", textoBaseDetectado: "" };
  clearFeedback(elements.feedback);
  resetExternalImportModal();
  renderImportPreview();
}

function bindEvents() {
  populateSelect(elements.anoEscolar, ANOS_ESCOLARES, "Selecione");
  populateSelect(elements.disciplina, DISCIPLINAS, "Selecione");
  elements.btnOrganizar.addEventListener("click", handleOrganizarImportacao);
  elements.btnOrganizarIAExterna.addEventListener("click", openExternalImportModal);
  elements.btnConfirmarTodas.addEventListener("click", handleConfirmarTodasImportacao);
  elements.btnSalvar.addEventListener("click", handleSalvarImportacao);
  elements.btnLimpar.addEventListener("click", handleLimparImportacao);
  elements.btnFecharModalIAExterna.addEventListener("click", closeExternalImportModal);
  elements.btnCopiarPromptIA.addEventListener("click", handleCopiarPromptIA);
  elements.btnValidarJsonIA.addEventListener("click", handleValidarJsonIA);
  elements.campoTextoBrutoIA.addEventListener("input", syncMainRawTextFromModal);
  elements.campoJsonIA.addEventListener("input", agendarValidacaoAutomaticaJsonIA);
  elements.campoJsonIA.addEventListener("paste", () => setTimeout(agendarValidacaoAutomaticaJsonIA, 50));
  elements.modalIAExterna.addEventListener("click", event => {
    if (event.target === elements.modalIAExterna) {
      closeExternalImportModal();
    }
  });
}

function init() {
  bindEvents();
  renderImportPreview();
}

init();
