import { db } from "../core/firebase-app.js";
import { buildQuestionRecord, getQuestionsByIds, normalizeLegacyQuestion } from "./questions-service.js";

export function normalizeTemporaryQuestion(payload, usuario) {
  const record = buildQuestionRecord(payload, usuario);
  return {
    tipo: record.tipo,
    tipoLegado: record.tipoLegado,
    anoEscolar: record.anoEscolar,
    ano_escolar: record.ano_escolar,
    disciplina: record.disciplina,
    descritor: record.descritor,
    descritorDescricao: record.descritorDescricao,
    textoApoio: record.textoApoio,
    imagensApoio: record.imagensApoio,
    enunciado: record.enunciado,
    alternativas: record.alternativas,
    resposta_correta: record.resposta_correta,
    respostaEsperada: record.respostaEsperada,
    nivelDificuldade: record.nivelDificuldade,
    autor: record.autor,
    autorId: record.autorId,
    data_criacao: record.data_criacao,
    criadoEm: record.criadoEm,
    atualizadoEm: record.atualizadoEm,
    recurso: record.recurso
  };
}

export function buildProvaRecord(payload, usuario) {
  if (!payload.titulo || !payload.titulo.trim()) {
    throw new Error("Informe o titulo da prova.");
  }

  if (!payload.anoEscolar) {
    throw new Error("Selecione o ano escolar da prova.");
  }

  if (!payload.disciplina) {
    throw new Error("Selecione a disciplina da prova.");
  }

  const questoesBancoIds = [...new Set((payload.questoesBancoIds || []).filter(Boolean))];
  const questoesTemporarias = (payload.questoesTemporarias || []).map(item => ({
    ...item,
    origem: "temporaria"
  }));
  const totalQuestoes = questoesBancoIds.length + questoesTemporarias.length;

  if (totalQuestoes === 0) {
    throw new Error("Adicione pelo menos uma questao na prova.");
  }

  return {
    titulo: payload.titulo.trim(),
    nome: payload.titulo.trim(),
    turma: payload.turma || "",
    anoEscolar: payload.anoEscolar,
    ano: payload.anoEscolar,
    disciplina: payload.disciplina,
    tempoMinutos: Number(payload.tempoMinutos || 60),
    tempo: Number(payload.tempoMinutos || 60),
    valorTotal: Number(payload.valorTotal || 10),
    valor: Number(payload.valorTotal || 10),
    questoesBancoIds,
    questoesTemporarias,
    criadoPor: usuario.uid,
    criadoEm: new Date(),
    atualizadoEm: new Date()
  };
}

export async function createProva(payload, usuario) {
  const record = buildProvaRecord(payload, usuario);
  const docRef = await db.collection("provas").add(record);
  return {
    id: docRef.id,
    ...record
  };
}

export async function listProvasByProfessor(uid) {
  const snapshot = await db.collection("provas")
    .where("criadoPor", "==", uid)
    .orderBy("criadoEm", "desc")
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function deleteProva(id) {
  await db.collection("provas").doc(id).delete();
}

export async function getLegacyOrNewProva(id) {
  const provaDoc = await db.collection("provas").doc(id).get();
  if (provaDoc.exists) {
    return { id: provaDoc.id, source: "provas", ...provaDoc.data() };
  }

  const legacyDoc = await db.collection("simulados").doc(id).get();
  if (legacyDoc.exists) {
    return { id: legacyDoc.id, source: "simulados", ...legacyDoc.data() };
  }

  return null;
}

export async function resolveProvaQuestions(prova) {
  if (!prova) {
    return [];
  }

  if (Array.isArray(prova.questoes)) {
    return prova.questoes.map((question, index) => ({
      ...normalizeLegacyQuestion({
        id: question.questaoId || question.id || `${prova.id || "prova"}-legada-${index}`,
        ...question
      }),
      origem: question.origem || "legada",
      questaoId: question.questaoId || question.id || null
    }));
  }

  const bancoQuestions = await getQuestionsByIds(prova.questoesBancoIds || []);
  const bancoNormalized = bancoQuestions.map(question => ({
    ...normalizeLegacyQuestion(question),
    origem: "banco",
    questaoId: question.id
  }));

  const temporarias = (prova.questoesTemporarias || []).map((question, index) => ({
    ...normalizeLegacyQuestion({
      id: `${prova.id || "prova"}-temp-${index}`,
      ...question
    }),
    origem: "temporaria",
    questaoId: question.questaoId || null
  }));

  return [...bancoNormalized, ...temporarias];
}

export async function buildExportableProva(provaId) {
  const prova = await getLegacyOrNewProva(provaId);
  if (!prova) {
    throw new Error("Prova nao encontrada.");
  }

  const questoes = await resolveProvaQuestions(prova);
  return {
    ...prova,
    questoes
  };
}
