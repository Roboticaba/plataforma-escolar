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

export const DEFAULT_ALTERNATIVE_FORMAT = "(A)";

export const ALTERNATIVE_FORMATS = [
  { value: "(A)", label: "(A), (B), (C), (D)" },
  { value: "A)", label: "A), B), C), D)" },
  { value: "A.", label: "A. B. C. D." },
  { value: "a)", label: "a), b), c), d)" },
  { value: "(a)", label: "(a), (b), (c), (d)" },
  { value: "1)", label: "1), 2), 3), 4)" },
  { value: "1.", label: "1. 2. 3. 4." }
];

export function normalizeAlternativeFormat(format) {
  return ALTERNATIVE_FORMATS.some(item => item.value === format)
    ? format
    : DEFAULT_ALTERNATIVE_FORMAT;
}

export function getAlternativeLabel(index, format = DEFAULT_ALTERNATIVE_FORMAT) {
  const upper = String.fromCharCode(65 + index);
  const lower = String.fromCharCode(97 + index);
  const number = String(index + 1);

  switch (normalizeAlternativeFormat(format)) {
    case "A)":
      return `${upper})`;
    case "A.":
      return `${upper}.`;
    case "a)":
      return `${lower})`;
    case "(a)":
      return `(${lower})`;
    case "1)":
      return `${number})`;
    case "1.":
      return `${number}.`;
    case "(A)":
    default:
      return `(${upper})`;
  }
}

export function sanitizeText(value) {
  return String(value || "").trim();
}

export function limparAlternativas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item
      .replace(/^\([A-Za-z]\)\s*/u, "")
      .replace(/^[A-Za-z]\s*[\.\)\-:]\s*/u, "")
      .replace(/^\(\d+\)\s*/u, "")
      .replace(/^\d+\s*[\.\)\-:]\s*/u, "")
      .replace(/^[IVXLCDM]+\s*[\.\)\-:]\s*/u, "")
      .replace(/^[-\u2022•]\s*/u, "")
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
    .filter(item => item.texto || item.imagemUrl)
    .sort((a, b) => a.ordem - b.ordem);

  let correctIndex = Number(respostaCorreta);

  if (Number.isNaN(correctIndex)) {
    correctIndex = parsed.findIndex(item => item.correta);
  }

  return parsed.map((item, index) => ({
    ...item,
    correta: index === correctIndex
  }));
}

function normalizeAlternativesByType(tipoNormalizado, alternativas, respostaCorreta) {
  const normalized = normalizeAlternatives(alternativas, respostaCorreta);

  if (tipoNormalizado === QUESTION_TYPES.multipla_texto) {
    return normalized
      .filter(item => item.texto)
      .map(item => ({
        ...item,
        imagemUrl: ""
      }));
  }

  if (tipoNormalizado === QUESTION_TYPES.multipla_imagem) {
    return normalized
      .filter(item => item.imagemUrl)
      .map(item => ({
        ...item,
        texto: ""
      }));
  }

  return normalized;
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
    payload.tituloTextoApoio,
    payload.blocoTitulo,
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
    const alternativas = normalizeAlternativesByType(tipoNormalizado, payload.alternativas, payload.respostaCorreta);
    if (alternativas.length < 2) {
      throw new Error(tipoNormalizado === QUESTION_TYPES.multipla_imagem
        ? "Adicione pelo menos 2 imagens como alternativas."
        : "Adicione pelo menos 2 alternativas em texto.");
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
    : normalizeAlternativesByType(tipoNormalizado, payload.alternativas, payload.respostaCorreta);
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
    descritorSugerido: payload.descritorSugerido || payload.descritorSugestaoIA?.descritor || "",
    descritorConfirmado: payload.descritor || "",
    professorAlterou: Boolean((payload.descritorSugerido || payload.descritorSugestaoIA?.descritor) && payload.descritor && (payload.descritorSugerido || payload.descritorSugestaoIA?.descritor) !== payload.descritor),
    confiancaDescritor: Number(payload.confiancaDescritor ?? payload.descritorSugestaoIA?.confianca ?? 0),
    formatoAlternativas: normalizeAlternativeFormat(payload.formatoAlternativas),
    textoApoio: sanitizeText(payload.textoApoio),
    tituloTextoApoio: sanitizeText(payload.tituloTextoApoio || payload.tituloTexto || ""),
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
    origemCriacao: sanitizeText(payload.origemCriacao || "individual"),
    blocoId: sanitizeText(payload.blocoId),
    blocoTitulo: sanitizeText(payload.blocoTitulo || payload.tituloTextoApoio || ""),
    ordemBloco: Number(payload.ordemBloco || 0),
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
    tempId: question.tempId || "",
    tipo,
    tipoLegado: question.tipo || getQuestionKind(tipo),
    anoEscolar: question.anoEscolar || question.ano_escolar || "",
    ano_escolar: question.ano_escolar || question.anoEscolar || "",
    disciplina: question.disciplina || "",
    descritor: question.descritor || "",
    descritorDescricao: question.descritorDescricao || "",
    descritorConfirmadoPeloProfessor: question.descritorConfirmadoPeloProfessor !== false,
    descritorSugerido: question.descritorSugerido || question.descritorSugestaoIA?.descritor || "",
    descritorConfirmado: question.descritorConfirmado || question.descritor || "",
    professorAlterou: Boolean(question.professorAlterou),
    confiancaDescritor: Number(question.confiancaDescritor ?? question.descritorSugestaoIA?.confianca ?? 0),
    formatoAlternativas: normalizeAlternativeFormat(question.formatoAlternativas),
    textoApoio: question.textoApoio || question.textoAntes || "",
    tituloTextoApoio: question.tituloTextoApoio || question.blocoTitulo || "",
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
    origemCriacao: question.origemCriacao || "banco",
    blocoId: question.blocoId || "",
    blocoTitulo: question.blocoTitulo || question.tituloTextoApoio || "",
    ordemBloco: Number(question.ordemBloco || 0),
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

export async function updateQuestion(id, payload, usuario) {
  if (!id) {
    throw new Error("ID da questao nao informado.");
  }

  const record = buildQuestionRecord(payload, usuario);
  const atualizado = {
    ...record,
    autor: payload.autor || record.autor,
    autorId: payload.autorId || record.autorId,
    autorNome: payload.autorNome || record.autorNome,
    criadoEm: payload.criadoEm || payload.data_criacao || record.criadoEm,
    data_criacao: payload.data_criacao || payload.criadoEm || record.data_criacao,
    atualizadoEm: new Date()
  };

  await db.collection("questoes").doc(id).set(atualizado, { merge: true });
  return normalizeLegacyQuestion({
    id,
    ...atualizado
  });
}

export async function deleteQuestion(id) {
  if (!id) {
    throw new Error("ID da questao nao informado.");
  }

  await db.collection("questoes").doc(id).delete();
}

export async function getQuestionById(id) {
  if (!id) {
    return null;
  }

  const doc = await db.collection("questoes").doc(id).get();
  return doc.exists ? normalizeLegacyQuestion({ id: doc.id, ...doc.data() }) : null;
}

export async function getQuestionsByBlockId(blocoId) {
  if (!blocoId) {
    return [];
  }

  const snapshot = await db.collection("questoes").where("blocoId", "==", blocoId).get();
  return snapshot.docs
    .map(doc => normalizeLegacyQuestion({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.ordemBloco || 0) - (b.ordemBloco || 0));
}

export async function deleteQuestionBlock(blocoId) {
  if (!blocoId) {
    throw new Error("ID do bloco nao informado.");
  }

  const questions = await getQuestionsByBlockId(blocoId);
  const batch = db.batch();

  questions.forEach(question => {
    batch.delete(db.collection("questoes").doc(question.id));
  });

  batch.delete(db.collection("blocosQuestoes").doc(blocoId));
  await batch.commit();
}

export async function getQuestionBlockById(blocoId) {
  if (!blocoId) {
    return null;
  }

  const doc = await db.collection("blocosQuestoes").doc(blocoId).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() || {};
  return {
    id: doc.id,
    blocoId: data.blocoId || doc.id,
    titulo: data.titulo || data.blocoTitulo || data.tituloTextoApoio || "",
    textoApoio: data.textoApoio || "",
    imagensApoio: data.imagensApoio || data.imagens || [],
    anoEscolar: data.anoEscolar || data.ano_escolar || "",
    ano_escolar: data.ano_escolar || data.anoEscolar || "",
    disciplina: data.disciplina || "",
    questoesIds: data.questoesIds || [],
    totalQuestoes: Number(data.totalQuestoes || 0),
    autor: data.autor || data.autorId || "",
    autorId: data.autorId || data.autor || "",
    autorNome: data.autorNome || "",
    criadoEm: data.criadoEm || null,
    atualizadoEm: data.atualizadoEm || null
  };
}

export async function saveQuestionBlock({ blocoId, titulo, textoApoio, imagensApoio, anoEscolar, disciplina, questoes = [], minQuestoes = 1 }, usuario) {
  const id = blocoId || `bloco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (!sanitizeText(titulo)) {
    throw new Error("Informe o titulo do texto.");
  }

  if (!sanitizeText(textoApoio)) {
    throw new Error("Informe o texto base do bloco.");
  }

  if (!anoEscolar) {
    throw new Error("Selecione o ano escolar do bloco.");
  }

  if (!disciplina || !DISCIPLINAS.some(item => item.value === disciplina)) {
    throw new Error("Selecione uma disciplina valida para o bloco.");
  }

  if (questoes.length < minQuestoes) {
    throw new Error(minQuestoes > 1
      ? `Adicione pelo menos ${minQuestoes} questoes ao bloco.`
      : "Adicione pelo menos uma questao ao bloco.");
  }

  const savedQuestions = [];

  for (let index = 0; index < questoes.length; index += 1) {
    const item = questoes[index];
    const payload = {
      ...item,
      anoEscolar,
      disciplina,
      tituloTextoApoio: titulo,
      textoApoio,
      imagensApoio,
      origemCriacao: "bloco_texto",
      blocoId: id,
      blocoTitulo: titulo,
      ordemBloco: index
    };

    if (item.id) {
      savedQuestions.push(await updateQuestion(item.id, payload, usuario));
    } else {
      savedQuestions.push(await createQuestion(payload, usuario));
    }
  }

  const existingBlock = await getQuestionBlockById(id);
  const blockRecord = {
    blocoId: id,
    titulo,
    textoApoio,
    imagensApoio: (imagensApoio || []).filter(Boolean),
    anoEscolar,
    disciplina,
    questoesIds: savedQuestions.map(item => item.id),
    totalQuestoes: savedQuestions.length,
    autor: usuario.uid,
    autorId: usuario.uid,
    autorNome: usuario.nome || "",
    atualizadoEm: new Date(),
    criadoEm: existingBlock?.criadoEm || new Date()
  };

  await db.collection("blocosQuestoes").doc(id).set(blockRecord, { merge: true });

  return {
    ...blockRecord,
    questoes: savedQuestions
  };
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
