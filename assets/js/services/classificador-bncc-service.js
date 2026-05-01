import { auth, db } from "../core/firebase-app.js";
import { habilidadesBNCCLP } from "../data/habilidades-bncc-lp.js";
import { habilidadesBNCCMatematica } from "../data/habilidades-bncc-matematica.js";

const EXPRESSAO_PESO = 3;
const PALAVRA_PESO = 1;
const BONUS_ESPECIAL_PESO = 2;
const BASE_HABILIDADES = [
  ...habilidadesBNCCLP,
  ...habilidadesBNCCMatematica
];
const habilidadesRuntime = [...BASE_HABILIDADES];

const REGRAS_ESPECIAIS_PORTUGUES = {
  EF15LP02: ["segundo o texto", "de acordo com o texto"],
  EF15LP03: ["provavelmente", "imaginar", "concluir", "inferir"],
  EF15LP11: ["significa", "expressao", "sentido da palavra"],
  EF15LP04: ["tema", "assunto principal", "ideia central"],
  EF15LP06: ["por que", "motivo", "causa", "consequencia"],
  EF15LP08: ["texto 1", "texto 2"],
  EF15LP13: ["imagem", "tirinha", "quadrinho", "observe a imagem"]
};

const REGRAS_ESPECIAIS_MATEMATICA = {
  EF03MA06: ["+", "somar", "juntar", "ao todo", "total", "-", "tirar", "sobrou", "restou", "perdeu"],
  EF04MA07: ["x", "\u00d7", "*", "vezes", "dobro", "triplo", "grupos iguais", "\u00f7", "/", "dividir", "repartir igualmente", "metade"],
  EF02MA20: ["r$", "reais", "centavos", "troco", "preco"],
  EF04MA22: ["hora", "minuto", "duracao", "inicio", "termino"],
  EF03MA20: ["metro", "litro", "grama", "quilo", "regua", "balanca"],
  EF02MA21: ["tabela", "linha", "coluna"],
  EF03MA22: ["grafico", "barras", "colunas"],
  EF05MA02: ["fracao", "metade", "terca parte", "um quarto"],
  EF05MA06: ["porcentagem", "%", "25%", "50%", "100%"],
  EF05MA15: ["mapa", "croqui", "direita", "esquerda"],
  EF02MA14: ["cubo", "cone", "cilindro", "esfera"],
  EF01MA13: ["quadrado", "triangulo", "retangulo", "circulo"]
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarDisciplina(disciplina) {
  const value = normalizarTexto(disciplina);
  if (value.includes("portugues") || value.includes("lingua portuguesa")) return "portugues";
  if (value.includes("matematica")) return "matematica";
  return value;
}

function normalizarAno(valor) {
  const match = String(valor || "").match(/\d+/);
  return match ? match[0] : String(valor || "").trim();
}

function getAnoQuestao(questao = {}) {
  return normalizarAno(questao.ano || questao.anoEscolar || "");
}

function getTextoQuestao(questao = {}) {
  const alternativas = toArray(questao.alternativas)
    .map(item => typeof item === "string" ? item : item?.texto || "")
    .join(" ");

  return [
    questao.enunciado,
    questao.texto_base,
    questao.textoBase,
    questao.textoApoio,
    alternativas
  ].filter(Boolean).join(" ");
}

function disciplinaLabel(disciplina) {
  return disciplina === "matematica" ? "Matematica" : "Lingua Portuguesa";
}

function splitKeywords(palavras = []) {
  const expressoes = [];
  const simples = [];

  palavras.forEach(item => {
    const normalizado = normalizarTexto(item);
    if (!normalizado) return;
    if (normalizado.includes(" ")) {
      expressoes.push(normalizado);
      return;
    }
    simples.push(normalizado);
  });

  return { expressoes, simples };
}

function normalizarHabilidade(habilidade = {}) {
  const palavrasBase = toArray(habilidade.palavras_chave || habilidade.palavrasChave);
  const palavras = palavrasBase.map(normalizarTexto).filter(Boolean);
  const derivadas = splitKeywords(palavrasBase);
  const expressoes = [
    ...toArray(habilidade.expressoes).map(normalizarTexto).filter(Boolean),
    ...derivadas.expressoes
  ];

  return {
    id: String(habilidade.id || "").trim(),
    codigo_bncc: String(habilidade.codigo_bncc || habilidade.codigoBncc || "").trim(),
    habilidade: String(habilidade.habilidade || "").trim(),
    categoria: String(habilidade.categoria || "geral").trim(),
    disciplina: normalizarDisciplina(habilidade.disciplina || ""),
    anos: toArray(habilidade.anos).map(normalizarAno).filter(Boolean),
    saeb: String(habilidade.saeb || habilidade.saeb_equivalente || "").trim(),
    parana: String(habilidade.parana || habilidade.parana_equivalente || "").trim(),
    expressoes: [...new Set(expressoes)],
    palavras_chave: [...new Set([...derivadas.simples, ...palavras.filter(item => !item.includes(" "))])]
  };
}

function scoreHabilidade(baseNormalizada, habilidade) {
  let pontuacao = 0;
  const matches = [];

  habilidade.expressoes.forEach(expressao => {
    if (expressao && baseNormalizada.includes(expressao)) {
      pontuacao += EXPRESSAO_PESO;
      matches.push(`expressao:${expressao}`);
    }
  });

  habilidade.palavras_chave.forEach(palavra => {
    if (palavra && baseNormalizada.includes(palavra)) {
      pontuacao += PALAVRA_PESO;
      matches.push(`palavra:${palavra}`);
    }
  });

  const regrasEspeciais = {
    ...REGRAS_ESPECIAIS_PORTUGUES,
    ...REGRAS_ESPECIAIS_MATEMATICA
  }[habilidade.codigo_bncc] || [];

  regrasEspeciais.forEach(regra => {
    const normalizada = normalizarTexto(regra);
    if (!normalizada) return;
    if (baseNormalizada.includes(normalizada)) {
      pontuacao += BONUS_ESPECIAL_PESO;
      matches.push(`regra:${normalizada}`);
    }
  });

  return { pontuacao, matches };
}

export function calcularConfianca(melhorPontuacao, segundaPontuacao) {
  const diferenca = Number(melhorPontuacao || 0) - Number(segundaPontuacao || 0);
  if (melhorPontuacao >= 6 && diferenca >= 3) {
    return "alta";
  }

  if (melhorPontuacao >= 3 && diferenca > 0) {
    return "media";
  }

  return "baixa";
}

export function listarHabilidades(filtros = {}) {
  const disciplina = normalizarDisciplina(filtros.disciplina || filtros.area || "");
  const ano = normalizarAno(filtros.ano || filtros.anoEscolar || "");

  return habilidadesRuntime
    .map(normalizarHabilidade)
    .filter(item => !disciplina || item.disciplina === disciplina)
    .filter(item => !ano || !item.anos.length || item.anos.includes(ano));
}

export function adicionarHabilidade(novaHabilidade) {
  const habilidade = normalizarHabilidade(novaHabilidade);
  habilidadesRuntime.push(habilidade);
  return habilidade;
}

export function classificarQuestao(questao = {}) {
  const disciplina = normalizarDisciplina(questao.disciplina);
  const ano = getAnoQuestao(questao);
  const baseNormalizada = normalizarTexto(getTextoQuestao(questao));
  const candidatas = listarHabilidades({ disciplina, ano });

  if (!baseNormalizada || !candidatas.length) {
    return {
      codigo_bncc: null,
      habilidade: "Nao identificada",
      categoria: "",
      disciplina: disciplinaLabel(disciplina),
      saeb: "",
      parana: "",
      confianca: "baixa",
      pontuacao: 0,
      justificativa: "Nao houve base suficiente para classificar a questao."
    };
  }

  const ranking = candidatas
    .map(item => {
      const { pontuacao, matches } = scoreHabilidade(baseNormalizada, item);
      return { ...item, pontuacao, matches };
    })
    .sort((a, b) => b.pontuacao - a.pontuacao);

  const melhor = ranking[0];
  const segundo = ranking[1] || { pontuacao: 0 };

  if (!melhor || melhor.pontuacao <= 0) {
    return {
      codigo_bncc: null,
      habilidade: "Nao identificada",
      categoria: "",
      disciplina: disciplinaLabel(disciplina),
      saeb: "",
      parana: "",
      confianca: "baixa",
      pontuacao: 0,
      justificativa: "Nenhuma palavra-chave relevante foi encontrada na base BNCC."
    };
  }

  const confianca = calcularConfianca(melhor.pontuacao, segundo.pontuacao);
  const justificativa = melhor.matches.length
    ? `Foram encontradas correspondencias em ${melhor.matches.join(", ")}.`
    : "A classificacao foi definida por aderencia geral de termos.";

  return {
    codigo_bncc: melhor.codigo_bncc,
    habilidade: melhor.habilidade,
    categoria: melhor.categoria,
    disciplina: disciplinaLabel(melhor.disciplina),
    saeb: melhor.saeb,
    parana: melhor.parana,
    confianca,
    pontuacao: melhor.pontuacao,
    justificativa
  };
}

export async function salvarClassificacaoNoFirebase(questaoId, resultado = {}) {
  if (!questaoId) throw new Error("questaoId obrigatorio.");

  const payload = {
    bncc_sugerido: resultado.codigo_bncc || "",
    bncc_confirmado: resultado.bncc_confirmado || "",
    habilidade_bncc: resultado.habilidade || "",
    categoria_bncc: resultado.categoria || "",
    saeb_equivalente: resultado.saeb || "",
    parana_equivalente: resultado.parana || "",
    confianca_classificacao: resultado.confianca || "baixa",
    pontuacao_classificacao: Number(resultado.pontuacao || 0),
    justificativa_classificacao: resultado.justificativa || "",
    classificacao_confirmada: Boolean(resultado.classificacao_confirmada),
    data_confirmacao: resultado.classificacao_confirmada ? new Date() : null,
    professor_id: auth.currentUser?.uid || ""
  };

  await db.collection("questoes").doc(questaoId).set(payload, { merge: true });
  return payload;
}

export async function confirmarClassificacao(questaoId, habilidadeConfirmada) {
  const habilidade = typeof habilidadeConfirmada === "string"
    ? habilidadesRuntime.map(normalizarHabilidade).find(item => item.codigo_bncc === habilidadeConfirmada)
    : normalizarHabilidade(habilidadeConfirmada || {});

  if (!habilidade?.codigo_bncc) {
    throw new Error("Habilidade BNCC confirmada invalida.");
  }

  const resultado = {
    codigo_bncc: habilidade.codigo_bncc,
    habilidade: habilidade.habilidade,
    categoria: habilidade.categoria,
    saeb: habilidade.saeb,
    parana: habilidade.parana,
    confianca: "alta",
    pontuacao: 0,
    justificativa: "Classificacao confirmada manualmente pelo professor.",
    bncc_confirmado: habilidade.codigo_bncc,
    classificacao_confirmada: true
  };

  await salvarClassificacaoNoFirebase(questaoId, resultado);
  return resultado;
}
