import { getAnoLabel, getDisciplinaLabel } from "../core/constants.js";
import { buildNormalizedTags, findSimilarTerms, scoreSearchMatch } from "./search-utils.js";

function arrayOf(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

function scoreQuestionForCriteria(question, criteria) {
  let score = 0;

  if (criteria.disciplina && question.disciplina === criteria.disciplina) score += 5;
  if (criteria.anoEscolar && (question.anoEscolar === criteria.anoEscolar || question.ano_escolar === criteria.anoEscolar)) score += 5;
  if (arrayOf(criteria.descritores).includes(question.descritor)) score += 4;
  if (arrayOf(criteria.habilidadesBncc).includes(question.codigoHabilidadeBncc || question.bncc_sugerido)) score += 3;
  if (arrayOf(criteria.conteudos).some(item => scoreSearchMatch(item, [question.conteudo, ...(question.tagsNormalizadas || [])]).matched)) score += 2.5;
  if (criteria.generoTextual && scoreSearchMatch(criteria.generoTextual, [question.enunciado, question.textoApoio, ...(question.tagsNormalizadas || [])]).matched) score += 2;
  if (criteria.dificuldade && (question.nivelDificuldade || "") === criteria.dificuldade) score += 1.5;
  if (question.qualidadeCadastro === "completo") score += 2;
  if (question.textoApoio || (question.imagensApoio || []).length) score += 0.8;

  score += Math.max(0, 3 - Number(question.vezesUsada || 0) * 0.35);
  return score;
}

function diversityKey(question) {
  return [question.descritor || "", question.conteudo || "", question.tipo || ""].join("|");
}

export function montarProvaAutomaticamente(questions = [], criteria = {}) {
  const candidates = questions
    .filter(question => !criteria.disciplina || question.disciplina === criteria.disciplina)
    .filter(question => !criteria.anoEscolar || question.anoEscolar === criteria.anoEscolar || question.ano_escolar === criteria.anoEscolar)
    .map(question => ({
      question,
      score: scoreQuestionForCriteria(question, criteria)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const seenKeys = new Map();
  const desired = Number(criteria.numeroQuestoes || 0);

  candidates.forEach(item => {
    if (selected.length >= desired) return;
    const key = diversityKey(item.question);
    const repeats = seenKeys.get(key) || 0;
    if (repeats >= 2) return;
    selected.push(item.question);
    seenKeys.set(key, repeats + 1);
  });

  const encontrados = selected.length;
  const faltantes = Math.max(0, desired - encontrados);
  const semelhantes = faltantes > 0
    ? candidates
      .filter(item => !selected.some(selectedItem => selectedItem.id === item.question.id))
      .slice(0, faltantes)
      .map(item => item.question)
    : [];

  return {
    selected,
    encontrados,
    faltantes,
    semelhantes,
    aviso: faltantes > 0
      ? `Encontramos apenas ${encontrados}. Deseja completar com semelhantes?`
      : "",
    criteriosResumo: [
      criteria.disciplina ? getDisciplinaLabel(criteria.disciplina) : "",
      criteria.anoEscolar ? getAnoLabel(criteria.anoEscolar) : "",
      ...arrayOf(criteria.descritores),
      ...arrayOf(criteria.conteudos)
    ].filter(Boolean).join(" - ")
  };
}

export function buildSuggestionPayload(questions = [], search = "") {
  const universe = questions.flatMap(question => buildNormalizedTags([
    question.descritor,
    question.descritorDescricao,
    question.conteudo,
    question.disciplina,
    question.enunciado,
    question.textoApoio,
    question.tipo
  ]));

  const similares = findSimilarTerms(search, universe);
  return {
    message: similares.length ? "Voce quis dizer...?" : "Resultados semelhantes encontrados",
    terms: similares.slice(0, 6)
  };
}
