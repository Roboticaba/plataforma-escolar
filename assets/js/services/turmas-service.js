import { db } from "../core/firebase-app.js";
import { getLegacyOrNewProva, resolveProvaQuestions } from "./provas-service.js";

export async function listTurmasByProfessor(uid) {
  const snapshot = await db.collection("turmas")
    .where("criadoPor", "==", uid)
    .orderBy("nome")
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function normalizarStatusResposta(resposta = {}) {
  if (resposta?.correcao?.status === "corrigida" || resposta?.status === "corrigida") {
    return "corrigida";
  }
  if (resposta?.respostas?.length && !resposta?.enviadaEm && !resposta?.finalizadaEm && !resposta?.status) {
    return "em andamento";
  }
  if (resposta?.status === "enviada" || resposta?.enviadaEm || resposta?.finalizadaEm) {
    return "enviada";
  }
  return "nao iniciada";
}

function notaResposta(resposta = {}) {
  if (typeof resposta?.correcao?.notaFinal === "number") {
    return resposta.correcao.notaFinal;
  }
  if (typeof resposta?.notaFinal === "number") {
    return resposta.notaFinal;
  }
  return null;
}

function pushDescritor(stats, chave, registro) {
  if (!chave) {
    return;
  }

  if (!stats[chave]) {
    stats[chave] = {
      descritor: chave,
      disciplina: registro.disciplina || "",
      anoEscolar: registro.anoEscolar || "",
      totalQuestoes: 0,
      totalAcertos: 0,
      totalErros: 0,
      totalPontuacao: 0,
      totalPontuacaoPossivel: 0,
      percentualAcerto: 0
    };
  }

  const item = stats[chave];
  item.totalQuestoes += 1;
  item.totalPontuacao += registro.notaObtida;
  item.totalPontuacaoPossivel += registro.notaPossivel;

  if (registro.acertou) {
    item.totalAcertos += 1;
  } else {
    item.totalErros += 1;
  }

  item.percentualAcerto = item.totalPontuacaoPossivel
    ? Number(((item.totalPontuacao / item.totalPontuacaoPossivel) * 100).toFixed(1))
    : 0;
}

export async function calcularDesempenhoAlunoPorDescritor(alunoId, turmaId) {
  if (!alunoId || !turmaId) {
    return [];
  }

  const snapshot = await db.collection("respostas")
    .where("turmaId", "==", turmaId)
    .where("alunoId", "==", alunoId)
    .get();

  const stats = {};

  snapshot.docs.forEach(doc => {
    const resposta = doc.data();
    if (normalizarStatusResposta(resposta) !== "corrigida") {
      return;
    }

    (resposta.respostas || []).forEach(item => {
      const notaPossivel = typeof item.notaMaxima === "number" ? item.notaMaxima : 1;
      const notaObtida = typeof item.nota === "number"
        ? item.nota
        : item.correta
          ? notaPossivel
          : 0;

      pushDescritor(stats, item.descritor, {
        descritor: item.descritor,
        disciplina: item.disciplina,
        anoEscolar: item.anoEscolar,
        acertou: Boolean(item.correta) || notaObtida >= notaPossivel,
        notaObtida,
        notaPossivel
      });
    });
  });

  return Object.values(stats).sort((a, b) => b.percentualAcerto - a.percentualAcerto);
}

export async function calcularDesempenhoTurmaPorDescritor(turmaId) {
  if (!turmaId) {
    return [];
  }

  const snapshot = await db.collection("respostas")
    .where("turmaId", "==", turmaId)
    .get();

  const stats = {};

  snapshot.docs.forEach(doc => {
    const resposta = doc.data();
    if (normalizarStatusResposta(resposta) !== "corrigida") {
      return;
    }

    (resposta.respostas || []).forEach(item => {
      const notaPossivel = typeof item.notaMaxima === "number" ? item.notaMaxima : 1;
      const notaObtida = typeof item.nota === "number"
        ? item.nota
        : item.correta
          ? notaPossivel
          : 0;

      pushDescritor(stats, item.descritor, {
        descritor: item.descritor,
        disciplina: item.disciplina,
        anoEscolar: item.anoEscolar,
        acertou: Boolean(item.correta) || notaObtida >= notaPossivel,
        notaObtida,
        notaPossivel
      });
    });
  });

  return Object.values(stats).sort((a, b) => b.percentualAcerto - a.percentualAcerto);
}

export async function listarDescritoresMaisAcertados(turmaId) {
  const stats = await calcularDesempenhoTurmaPorDescritor(turmaId);
  return stats.slice(0, 5);
}

export async function listarDescritoresMaisErrados(turmaId) {
  const stats = await calcularDesempenhoTurmaPorDescritor(turmaId);
  return [...stats].sort((a, b) => a.percentualAcerto - b.percentualAcerto).slice(0, 5);
}

export async function montarPainelTurmaDetalhado(turmaId) {
  const turmaDoc = await db.collection("turmas").doc(turmaId).get();
  if (!turmaDoc.exists) {
    throw new Error("Turma nao encontrada.");
  }

  const turma = { id: turmaDoc.id, ...turmaDoc.data() };
  const alunos = turma.alunos || [];
  const provaIds = turma.provas || [];
  const provas = await Promise.all(provaIds.map(getLegacyOrNewProva));
  const provasValidas = provas.filter(Boolean);
  const respostasSnap = await db.collection("respostas").where("turmaId", "==", turmaId).get();
  const respostas = respostasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const alunosDetalhados = await Promise.all(alunos.map(async aluno => {
    const respostasAluno = respostas.filter(item => item.alunoId === aluno.uid || item.uid === aluno.uid);
    const atividades = provasValidas.map(prova => {
      const resposta = respostasAluno.find(item => item.provaId === prova.id);
      return {
        provaId: prova.id,
        provaTitulo: prova.titulo || prova.nome || "Prova",
        disciplina: prova.disciplina || "",
        status: resposta ? normalizarStatusResposta(resposta) : "nao iniciada",
        nota: resposta ? notaResposta(resposta) : null
      };
    });

    const notasValidas = atividades.map(item => item.nota).filter(item => typeof item === "number");
    const mediaGeral = notasValidas.length
      ? Number((notasValidas.reduce((sum, item) => sum + item, 0) / notasValidas.length).toFixed(2))
      : null;
    const descritores = await calcularDesempenhoAlunoPorDescritor(aluno.uid, turmaId);

    return {
      ...aluno,
      atividades,
      mediaGeral,
      descritores,
      melhoresDescritores: descritores.slice(0, 3),
      pioresDescritores: [...descritores].sort((a, b) => a.percentualAcerto - b.percentualAcerto).slice(0, 3)
    };
  }));

  const mediasTurma = alunosDetalhados.map(item => item.mediaGeral).filter(item => typeof item === "number");
  const mediaGeralTurma = mediasTurma.length
    ? Number((mediasTurma.reduce((sum, item) => sum + item, 0) / mediasTurma.length).toFixed(2))
    : null;

  const descritoresTurma = await calcularDesempenhoTurmaPorDescritor(turmaId);
  const descritoresMaisAcertados = descritoresTurma.slice(0, 5);
  const descritoresMaisErrados = [...descritoresTurma].sort((a, b) => a.percentualAcerto - b.percentualAcerto).slice(0, 5);

  const alunosComMaiorDificuldade = [...alunosDetalhados]
    .filter(item => typeof item.mediaGeral === "number")
    .sort((a, b) => a.mediaGeral - b.mediaGeral)
    .slice(0, 5);

  return {
    turma,
    alunos: alunosDetalhados,
    provas: await Promise.all(provasValidas.map(async prova => ({
      ...prova,
      questoes: await resolveProvaQuestions(prova)
    }))),
    respostas,
    mediaGeralTurma,
    descritoresTurma,
    descritoresMaisAcertados,
    descritoresMaisErrados,
    alunosComMaiorDificuldade
  };
}
