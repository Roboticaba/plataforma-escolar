import { db } from "../core/firebase-app.js";
import {
  DISCIPLINAS,
  disciplinaPrecisaDescritor,
  getDescritores
} from "../core/constants.js";

export const QUESTION_TYPES = {
  multipla_texto: "multipla_texto",
  multipla_imagem: "multipla_imagem",
  resposta_escrita: "resposta_escrita",
  multipla_escolha: "multipla_escolha",
  dissertativa: "dissertativa"
};

export function sanitizeText(value) {
  return String(value || "").trim();
}

export function limparAlternativas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item
      .replace(/^\(?[A-Za-z]\)?[\.\)]\s*/u, "")
      .replace(/^\(?\d+\)?[\.\)]\s*/u, "")
      .replace(/^[IVXLCDM]+[\.\)]\s*/u, "")
      .replace(/^[-•]\s*/u, "")
      .trim())
    .filter(Boolean);
}

export function normalizeAlternativeItem(item, index = 0) {
  if (typeof item === "string") {
    return {
      texto: sanitizeText(item),
      imagemUrl: "",
      correta: false,
      ordem: index
    };
  }

  return {
    texto: sanitizeText(item?.texto),
    imagemUrl: sanitizeText(item?.imagemUrl || item?.imagem || ""),
    correta: Boolean(item?.correta),
    ordem: Number(item?.ordem ?? index)
  };
}

export function normalizeAlternatives(alternativas, respostaCorreta) {
  const parsed = (alternativas || [])
    .map((item, index) => normalizeAlternativeItem(item, index))
    .filter(item => item.texto || item.imagemUrl);

  let correctIndex = Number(respostaCorreta);

  if (Number.isNaN(correctIndex)) {
    correctIndex = parsed.findIndex(item => item.correta);
  }

  return parsed.map((item, index) => ({
    ...item,
    correta: index === correctIndex
  }));
}

export function getQuestionTypeLabel(tipo) {
  switch (tipo) {
    case QUESTION_TYPES.multipla_texto:
      return "Multipla escolha com texto";
    case QUESTION_TYPES.multipla_imagem:
      return "Multipla escolha com imagem";
    case QUESTION_TYPES.resposta_escrita:
      return "Resposta escrita";
    case QUESTION_TYPES.dissertativa:
      return "Dissertativa";
    default:
      return "Multipla escolha";
  }
}

export function normalizeQuestionType(tipo, alternativas = []) {
  if (tipo === QUESTION_TYPES.multipla_texto || tipo === QUESTION_TYPES.multipla_imagem || tipo === QUESTION_TYPES.resposta_escrita) {
    return tipo;
  }

  if (tipo === QUESTION_TYPES.dissertativa) {
    return QUESTION_TYPES.resposta_escrita;
  }

  const list = alternativas || [];
  const hasImage = list.some(item => typeof item === "object" && (item?.imagemUrl || item?.imagem));
  return hasImage ? QUESTION_TYPES.multipla_imagem : QUESTION_TYPES.multipla_texto;
}

export function getQuestionKind(tipoNormalizado) {
  return tipoNormalizado === QUESTION_TYPES.resposta_escrita ? "dissertativa" : "multipla_escolha";
}

export function buildQuestionSearchText(payload) {
  const alternativasTexto = (payload.alternativas || [])
    .map(item => (typeof item === "string" ? item : item?.texto || ""))
    .filter(Boolean)
    .join(" ");

  return [
    payload.textoApoio,
    payload.enunciado,
    alternativasTexto,
    payload.respostaEsperada,
    payload.disciplina,
    payload.anoEscolar,
    payload.descritor,
    payload.descritorDescricao
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getDescritorInfo(disciplina, anoEscolar, descritor) {
  const item = getDescritores(disciplina, anoEscolar).find(entry => entry.codigo === descritor);
  return item || null;
}

export function validateQuestionPayload(payload) {
  if (!sanitizeText(payload.enunciado)) {
    throw new Error("Informe o enunciado da questao.");
  }

  const tipoNormalizado = normalizeQuestionType(payload.tipo, payload.alternativas);

  if (!payload.anoEscolar) {
    throw new Error("Selecione o ano escolar.");
  }

  if (!payload.disciplina || !DISCIPLINAS.some(item => item.value === payload.disciplina)) {
    throw new Error("Selecione uma disciplina valida.");
  }

  if (disciplinaPrecisaDescritor(payload.disciplina)) {
    const descritorValido = getDescritores(payload.disciplina, payload.anoEscolar)
      .some(item => item.codigo === payload.descritor);

    if (!payload.descritor || !descritorValido) {
      throw new Error("Selecione um descritor valido.");
    }

    if (!payload.descritorConfirmadoPeloProfessor) {
      throw new Error("Confirme o descritor sugerido antes de salvar.");
    }
  }

  if (tipoNormalizado === QUESTION_TYPES.resposta_escrita && !sanitizeText(payload.respostaEsperada || payload.respostaEsperadaTexto || "")) {
    throw new Error("Informe a resposta esperada da questao escrita.");
  }

  if (tipoNormalizado !== QUESTION_TYPES.resposta_escrita) {
    const alternativas = normalizeAlternatives(payload.alternativas, payload.respostaCorreta);
    if (alternativas.length < 2) {
      throw new Error("Adicione pelo menos 2 alternativas.");
    }

    const indiceCorreto = alternativas.findIndex(item => item.correta);
    if (indiceCorreto < 0) {
      throw new Error("Defina a alternativa correta.");
    }
  }

  return tipoNormalizado;
}

export function buildQuestionRecord(payload, usuario) {
  const tipoNormalizado = validateQuestionPayload(payload);
  const alternativas = tipoNormalizado === QUESTION_TYPES.resposta_escrita
    ? []
    : normalizeAlternatives(payload.alternativas, payload.respostaCorreta);
  const descritorInfo = getDescritorInfo(payload.disciplina, payload.anoEscolar, payload.descritor);

  return {
    tipo: tipoNormalizado,
    tipoLegado: getQuestionKind(tipoNormalizado),
    anoEscolar: payload.anoEscolar,
    ano_escolar: payload.anoEscolar,
    disciplina: payload.disciplina,
    descritor: payload.descritor || "",
    descritorDescricao: payload.descritorDescricao || descritorInfo?.nome || "",
    descritorConfirmadoPeloProfessor: Boolean(payload.descritorConfirmadoPeloProfessor || !disciplinaPrecisaDescritor(payload.disciplina)),
    descritorSugestaoIA: payload.descritorSugestaoIA || null,
    textoApoio: sanitizeText(payload.textoApoio),
    imagensApoio: (payload.imagensApoio || []).filter(Boolean),
    enunciado: sanitizeText(payload.enunciado),
    alternativas,
    resposta_correta: tipoNormalizado === QUESTION_TYPES.resposta_escrita
      ? null
      : alternativas.findIndex(item => item.correta),
    respostaEsperada: tipoNormalizado === QUESTION_TYPES.resposta_escrita
      ? sanitizeText(payload.respostaEsperada || payload.respostaEsperadaTexto)
      : "",
    nivelDificuldade: sanitizeText(payload.nivelDificuldade),
    autor: usuario.uid,
    autorId: usuario.uid,
    autorNome: usuario.nome || "",
    data_criacao: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    recurso: {
      imagem: (payload.imagensApoio || [])[0] || sanitizeText(payload.imagem),
      imagens: (payload.imagensApoio || []).filter(Boolean),
      audio: ""
    },
    searchText: buildQuestionSearchText(payload)
  };
}

export function normalizeLegacyQuestion(question = {}) {
  const tipo = normalizeQuestionType(question.tipo, question.alternativas);
  const alternativas = Array.isArray(question.alternativas)
    ? normalizeAlternatives(question.alternativas, question.resposta_correta)
    : [];

  return {
    id: question.id,
    tipo,
    tipoLegado: question.tipo || getQuestionKind(tipo),
    anoEscolar: question.anoEscolar || question.ano_escolar || "",
    ano_escolar: question.ano_escolar || question.anoEscolar || "",
    disciplina: question.disciplina || "",
    descritor: question.descritor || "",
    descritorDescricao: question.descritorDescricao || "",
    descritorConfirmadoPeloProfessor: question.descritorConfirmadoPeloProfessor !== false,
    textoApoio: question.textoApoio || question.textoAntes || "",
    imagensApoio: question.imagensApoio || question.imagens || (question.recurso?.imagem ? [question.recurso.imagem] : []),
    enunciado: question.enunciado || question.pergunta || "",
    alternativas,
    resposta_correta: typeof question.resposta_correta === "number" ? question.resposta_correta : alternativas.findIndex(item => item.correta),
    respostaEsperada: question.respostaEsperada || "",
    nivelDificuldade: question.nivelDificuldade || "",
    autor: question.autor || question.autorId || "",
    autorId: question.autorId || question.autor || "",
    autorNome: question.autorNome || "",
    data_criacao: question.data_criacao || question.criadoEm || null,
    criadoEm: question.criadoEm || question.data_criacao || null,
    atualizadoEm: question.atualizadoEm || question.criadoEm || question.data_criacao || null,
    recurso: question.recurso || { imagem: "", imagens: [], audio: "" },
    origem: question.origem || "banco"
  };
}

export async function createQuestion(payload, usuario) {
  const record = buildQuestionRecord(payload, usuario);
  const docRef = await db.collection("questoes").add(record);
  return normalizeLegacyQuestion({
    id: docRef.id,
    ...record
  });
}

export async function listQuestions(filters = {}) {
  const snapshot = await db.collection("questoes").orderBy("criadoEm", "desc").get();
  let questions = snapshot.docs.map(doc => normalizeLegacyQuestion({ id: doc.id, ...doc.data() }));

  if (filters.anoEscolar) {
    questions = questions.filter(item => item.anoEscolar === filters.anoEscolar || item.ano_escolar === filters.anoEscolar);
  }

  if (filters.disciplina) {
    questions = questions.filter(item => item.disciplina === filters.disciplina);
  }

  if (filters.descritor) {
    questions = questions.filter(item => item.descritor === filters.descritor);
  }

  if (filters.search) {
    const search = filters.search.toLowerCase();
    questions = questions.filter(item => [
      item.enunciado,
      item.textoApoio,
      item.descritor,
      item.descritorDescricao
    ].join(" ").toLowerCase().includes(search));
  }

  return questions;
}

export async function getQuestionsByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const questions = [];

  for (const id of uniqueIds) {
    const doc = await db.collection("questoes").doc(id).get();
    if (doc.exists) {
      questions.push(normalizeLegacyQuestion({ id: doc.id, ...doc.data() }));
    }
  }

  return questions;
}
