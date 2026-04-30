import { auth, db } from "../core/firebase-app.js";
import {
  buildQuestionRecord,
  getQuestionBlockById,
  getQuestionsByBlockId,
  getQuestionsByIds,
  normalizeLegacyQuestion
} from "./questions-service.js";

function getCurrentUid(usuario) {
  return auth.currentUser?.uid || usuario?.uid || "";
}

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
  const uid = getCurrentUid(usuario);

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
  const blocosIds = [...new Set((payload.blocosIds || []).filter(Boolean))];
  const blocosResumo = (payload.blocosResumo || [])
    .filter(item => item?.blocoId || item?.id)
    .map(item => ({
      blocoId: item.blocoId || item.id,
      titulo: item.titulo || "Bloco baseado em texto",
      totalQuestoes: Number(item.totalQuestoes || item.questoes?.length || 0)
    }));
  const questoesTemporarias = (payload.questoesTemporarias || []).map(item => ({
    ...item,
    tempId: item.tempId || `temp-${Math.random().toString(36).slice(2, 10)}`,
    origem: "temporaria"
  }));
  const totalQuestoesBlocos = blocosResumo.reduce((acc, item) => acc + Number(item.totalQuestoes || 0), 0);
  const totalQuestoes = questoesBancoIds.length + questoesTemporarias.length + totalQuestoesBlocos;
  const totalItens = questoesBancoIds.length + blocosIds.length + questoesTemporarias.length;
  const itensProva = (payload.itensProva || [])
    .filter(item => item?.tipo && item?.id)
    .map((item, index) => ({
      tipo: item.tipo,
      id: item.id,
      ordem: index
    }));
  const fallbackItensProva = [
    ...questoesBancoIds.map(id => ({ tipo: "questao", id })),
    ...blocosIds.map(id => ({ tipo: "bloco", id })),
    ...questoesTemporarias.map((item, index) => ({ tipo: "temporaria", id: item.tempId || `temp-index-${index}` }))
  ].map((item, index) => ({ ...item, ordem: index }));

  if (totalItens === 0) {
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
    blocosIds,
    blocosResumo,
    questoesTemporarias,
    itensProva: itensProva.length ? itensProva : fallbackItensProva,
    totalQuestoes,
    criadoPor: uid,
    autorId: uid,
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
  const queryUid = auth.currentUser?.uid || uid;
  const snapshot = await db.collection("provas")
    .where("criadoPor", "==", queryUid)
    .orderBy("criadoEm", "desc")
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function deleteProva(id) {
  await db.collection("provas").doc(id).delete();
}

export async function getLegacyOrNewProva(id, preferredSource = "") {
  if (preferredSource !== "simulados") {
    const provaDoc = await db.collection("provas").doc(id).get();
    if (provaDoc.exists) {
      return { id: provaDoc.id, source: "provas", ...provaDoc.data() };
    }
    if (preferredSource === "provas") {
      return null;
    }
  }

  const legacyDoc = await db.collection("simulados").doc(id).get();
  if (legacyDoc.exists) {
    return { id: legacyDoc.id, source: "simulados", ...legacyDoc.data() };
  }

  return null;
}

export async function resolveProvaQuestions(prova) {
  const content = await resolveProvaContent(prova);
  return content.flatMap(item => item.tipo === "bloco" ? item.questoes : [item.questao]);
}

export async function resolveProvaContent(prova) {
  if (!prova) {
    return [];
  }

  if (Array.isArray(prova.questoes)) {
    return prova.questoes.map((question, index) => ({
      tipo: "questao",
      questao: {
        ...normalizeLegacyQuestion({
          id: question.questaoId || question.id || `${prova.id || "prova"}-legada-${index}`,
          ...question
        }),
        origem: question.origem || "legada",
        questaoId: question.questaoId || question.id || null
      }
    }));
  }

  const bancoQuestions = await getQuestionsByIds(prova.questoesBancoIds || []);
  const bancoItems = bancoQuestions.map(question => ({
    tipo: "questao",
    questao: {
      ...normalizeLegacyQuestion(question),
      origem: "banco",
      questaoId: question.id
    }
  }));
  const bancoItemsById = new Map(bancoItems.map(item => [item.questao.questaoId || item.questao.id, item]));

  const blocoItems = await Promise.all((prova.blocosIds || []).map(async blocoId => {
    const [block, questions] = await Promise.all([
      getQuestionBlockById(blocoId),
      getQuestionsByBlockId(blocoId)
    ]);
    const normalizedQuestions = questions.map((question, index) => ({
      ...normalizeLegacyQuestion(question),
      origem: "bloco",
      questaoId: question.id,
      numeroNoBloco: index + 1
    }));
    const fallback = normalizedQuestions[0] || {};

    return {
      tipo: "bloco",
      blocoId,
      titulo: block?.titulo || fallback.blocoTitulo || fallback.tituloTextoApoio || "Bloco baseado em texto",
      textoApoio: block?.textoApoio || fallback.textoApoio || "",
      imagensApoio: block?.imagensApoio?.length ? block.imagensApoio : (fallback.imagensApoio || []),
      anoEscolar: block?.anoEscolar || fallback.anoEscolar || fallback.ano_escolar || prova.anoEscolar || prova.ano || "",
      disciplina: block?.disciplina || fallback.disciplina || prova.disciplina || "",
      questoes: normalizedQuestions
    };
  }));
  const blocoItemsById = new Map(blocoItems.map(item => [item.blocoId, item]));

  const temporariaItems = (prova.questoesTemporarias || []).map((question, index) => ({
    tipo: "questao",
    questao: {
      ...normalizeLegacyQuestion({
        id: question.questaoId || question.id || `${prova.id || "prova"}-legada-${index}`,
        ...question
      }),
      origem: "temporaria",
      questaoId: question.questaoId || question.id || null
    }
  }));
  const temporariaItemsById = new Map(temporariaItems.map((item, index) => [
    item.questao.tempId || item.questao.id || `temp-index-${index}`,
    item
  ]));

  if (Array.isArray(prova.itensProva) && prova.itensProva.length) {
    const ordered = [...prova.itensProva]
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .map(item => {
        if (item.tipo === "questao") return bancoItemsById.get(item.id);
        if (item.tipo === "bloco") return blocoItemsById.get(item.id);
        if (item.tipo === "temporaria") return temporariaItemsById.get(item.id);
        return null;
      })
      .filter(Boolean);

    if (ordered.length) {
      return ordered;
    }
  }

  return [...bancoItems, ...blocoItems, ...temporariaItems];
}

export async function buildExportableProva(provaId) {
  const prova = await getLegacyOrNewProva(provaId);
  if (!prova) {
    throw new Error("Prova nao encontrada.");
  }

  const conteudo = await resolveProvaContent(prova);
  const questoes = conteudo.flatMap(item => item.tipo === "bloco" ? item.questoes : [item.questao]);
  return {
    ...prova,
    conteudo,
    questoes
  };
}
