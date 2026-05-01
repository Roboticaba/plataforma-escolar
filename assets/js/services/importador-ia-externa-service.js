import { salvarImportacaoRevisada } from "./importacao-questoes-service.js";

const TIPOS_QUESTAO_ACEITOS = new Set([
  "multipla_escolha",
  "dissertativa",
  "verdadeiro_falso",
  "associacao",
  "completar"
]);

const CONFIANCAS_ACEITAS = new Set(["alta", "media", "baixa"]);

export const PROMPT_ORGANIZAR_QUESTOES_IA = `Voce e um especialista em avaliacao escolar, BNCC, SAEB e organizacao de questoes.

Vou enviar um texto bruto contendo uma ou mais questoes escolares.

Sua tarefa e analisar o texto e separar cada questao em uma estrutura organizada para cadastro em sistema.

IMPORTANTE:
- Nao altere o sentido das questoes.
- Corrija apenas erros claros de digitacao, pontuacao e formatacao.
- Nao invente alternativas.
- Nao crie novas questoes.
- Se alguma informacao estiver ausente, marque como null.
- Se houver duvida na classificacao, indique confianca baixa.

Para cada questao, identifique:

1. numero_questao
2. disciplina
3. ano_sugerido
4. texto_apoio
5. enunciado
6. alternativas
7. gabarito, se aparecer no texto
8. tipo_questao:
   - multipla_escolha
   - dissertativa
   - verdadeiro_falso
   - associacao
   - completar
9. habilidade_bncc_sugerida
10. codigo_bncc_sugerido
11. descritor_saeb_sugerido
12. descritor_parana_sugerido, se houver equivalencia
13. categoria
14. justificativa_da_classificacao
15. confianca:
   - alta
   - media
   - baixa

REGRAS DE CLASSIFICACAO:

LINGUA PORTUGUESA:
- "segundo o texto", "de acordo com o texto" -> informacao explicita / SAEB D01
- "significa", "expressao", "sentido da palavra" -> vocabulario / SAEB D03
- "inferir", "concluir", "provavelmente", "imaginar", "sugere que" -> inferencia / SAEB D04
- "tema", "assunto principal", "ideia central" -> tema / SAEB D06
- "por que", "motivo", "causa", "consequencia" -> causa e consequencia / SAEB D08
- "finalidade", "objetivo", "serve para" -> finalidade / SAEB D09
- "opiniao", "fato" -> fato e opiniao / SAEB D11
- "texto 1", "texto 2", "comparando" -> comparacao de textos / SAEB D15
- "humor", "ironia", "engracado" -> humor/ironia / SAEB D13
- "pontuacao", "exclamacao", "interrogacao", "reticencias" -> efeito de pontuacao / SAEB D14

MATEMATICA:
- "+", "somar", "juntar", "ao todo", "total" -> adicao
- "-", "tirar", "sobrou", "restou", "perdeu" -> subtracao
- "vezes", "dobro", "triplo", "grupos iguais" -> multiplicacao
- "dividir", "repartir igualmente", "metade" -> divisao
- "R$", "reais", "centavos", "troco", "preco" -> sistema monetario
- "hora", "minuto", "duracao", "inicio", "termino" -> tempo
- "metro", "litro", "grama", "quilo" -> medidas
- "tabela", "linha", "coluna" -> tabelas
- "grafico", "barras", "colunas" -> graficos
- "fracao", "metade", "terca parte", "um quarto" -> fracoes
- "porcentagem", "%", "25%", "50%", "100%" -> porcentagem

FORMATO DE SAIDA:

Responda SOMENTE com JSON valido, sem explicacoes antes ou depois.

[
  {
    "numero_questao": 1,
    "disciplina": "Lingua Portuguesa",
    "ano_sugerido": "5o ano",
    "texto_apoio": "",
    "enunciado": "",
    "alternativas": [
      {
        "letra": "A",
        "texto": ""
      },
      {
        "letra": "B",
        "texto": ""
      },
      {
        "letra": "C",
        "texto": ""
      },
      {
        "letra": "D",
        "texto": ""
      }
    ],
    "gabarito": null,
    "tipo_questao": "multipla_escolha",
    "codigo_bncc_sugerido": "",
    "habilidade_bncc_sugerida": "",
    "descritor_saeb_sugerido": "",
    "descritor_parana_sugerido": "",
    "categoria": "",
    "justificativa_da_classificacao": "",
    "confianca": ""
  }
]

Agora aguarde eu enviar o texto bruto.`;

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeNullableText(value) {
  const text = sanitizeText(value);
  return text || null;
}

function normalizeDiscipline(value) {
  const text = sanitizeText(value).toLowerCase();
  if (!text) return "";
  if (text.includes("portugues") || text.includes("lingua portuguesa")) return "portugues";
  if (text.includes("matematica")) return "matematica";
  if (text.includes("ciencias")) return "ciencias";
  if (text.includes("historia")) return "historia";
  if (text.includes("geografia")) return "geografia";
  if (text.includes("arte")) return "arte";
  if (text.includes("fisica")) return "edfisica";
  if (text.includes("ingles")) return "ingles";
  if (text.includes("robotica")) return "robotica";
  return text.replace(/[^a-z]/g, "");
}

function normalizeSchoolYear(value) {
  const text = sanitizeText(value);
  const match = text.match(/([1-5])/);
  return match ? match[1] : "";
}

function normalizeConfidence(value) {
  const text = sanitizeText(value).toLowerCase();
  return CONFIANCAS_ACEITAS.has(text) ? text : "baixa";
}

function normalizeAlternatives(alternativas) {
  if (!Array.isArray(alternativas)) return [];

  return alternativas.map((alternativa, index) => {
    if (typeof alternativa === "string") {
      return {
        letra: String.fromCharCode(65 + index),
        texto: sanitizeText(alternativa)
      };
    }

    return {
      letra: sanitizeText(alternativa?.letra || String.fromCharCode(65 + index)).toUpperCase(),
      texto: sanitizeText(alternativa?.texto)
    };
  }).filter(item => item.letra && item.texto);
}

function inferInternalType(tipoQuestao, alternativas) {
  if (tipoQuestao === "multipla_escolha" || tipoQuestao === "verdadeiro_falso" || tipoQuestao === "associacao") {
    return "multipla_texto";
  }

  if (tipoQuestao === "completar" && alternativas.length >= 2) {
    return "multipla_texto";
  }

  return "resposta_escrita";
}

function mapConfidenceToScore(confianca) {
  if (confianca === "alta") return 0.9;
  if (confianca === "media") return 0.6;
  return 0.3;
}

function resolveCorrectAnswerIndex(gabarito, alternativas) {
  const token = sanitizeText(gabarito).toUpperCase();
  if (!token) return "";

  const letterIndex = alternativas.findIndex(item => item.letra === token);
  if (letterIndex >= 0) return String(letterIndex);

  if (/^\d+$/.test(token)) {
    const numeric = Number(token);
    if (numeric >= 1 && numeric <= alternativas.length) {
      return String(numeric - 1);
    }
  }

  return "";
}

function buildSuggestionObject(question) {
  return {
    codigo_bncc: sanitizeText(question.codigo_bncc_sugerido),
    habilidade: sanitizeText(question.habilidade_bncc_sugerida),
    habilidade_bncc: sanitizeText(question.habilidade_bncc_sugerida),
    categoria: sanitizeText(question.categoria),
    categoria_bncc: sanitizeText(question.categoria),
    disciplina: sanitizeText(question.disciplina),
    saeb: sanitizeText(question.descritor_saeb_sugerido),
    saeb_equivalente: sanitizeText(question.descritor_saeb_sugerido),
    parana: sanitizeText(question.descritor_parana_sugerido),
    parana_equivalente: sanitizeText(question.descritor_parana_sugerido),
    confianca: normalizeConfidence(question.confianca),
    confianca_classificacao: normalizeConfidence(question.confianca),
    pontuacao: 0,
    justificativa: sanitizeText(question.justificativa_da_classificacao)
  };
}

export function montarPromptComTextoBruto(textoBruto) {
  const texto = sanitizeText(textoBruto);
  if (!texto) {
    throw new Error("Cole o texto da prova antes de continuar.");
  }

  return `${PROMPT_ORGANIZAR_QUESTOES_IA}

TEXTO BRUTO DA PROVA:
${texto}`;
}

export async function copiarPromptIA(textoBruto = "") {
  if (!navigator?.clipboard?.writeText) {
    throw new Error("Nao foi possivel acessar a area de transferencia neste navegador.");
  }

  const conteudo = textoBruto ? montarPromptComTextoBruto(textoBruto) : PROMPT_ORGANIZAR_QUESTOES_IA;
  await navigator.clipboard.writeText(conteudo);
  return textoBruto
    ? "Prompt e texto copiados. Cole na IA aberta, copie o JSON gerado e volte aqui."
    : "Prompt copiado! Agora cole em uma IA externa junto com o texto bruto da prova.";
}

function normalizarTextoJsonImportado(texto) {
  let bruto = sanitizeText(texto)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^﻿/, "")
    .trim();

  const inicioArray = bruto.indexOf("[");
  const fimArray = bruto.lastIndexOf("]");
  if (inicioArray >= 0 && fimArray > inicioArray) {
    bruto = bruto.slice(inicioArray, fimArray + 1);
  }

  return bruto;
}

function normalizarJsonFlexivel(bruto) {
  const semComentarios = bruto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(linha => linha.replace(/(^|[^:])\/\/.*$/g, "$1"))
    .join("\n");

  return semComentarios
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

export function validarJSONImportado(texto) {
  const bruto = normalizarTextoJsonImportado(texto);
  if (!bruto) {
    throw new Error("Cole o JSON organizado pela IA externa antes de validar.");
  }

  const tentativas = [bruto, normalizarJsonFlexivel(bruto)];
  let dados = null;
  let ultimoErro = null;

  for (const tentativa of tentativas) {
    try {
      dados = JSON.parse(tentativa);
      ultimoErro = null;
      break;
    } catch (error) {
      ultimoErro = error;
    }
  }

  if (ultimoErro) {
    throw new Error("Nao foi possivel ler o JSON. Confira se a IA respondeu com um array de questoes e, se possivel, sem texto extra antes ou depois.");
  }

  return validarQuestoesImportadas(dados);
}

export function validarQuestoesImportadas(dados) {
  if (!Array.isArray(dados)) {
    throw new Error("O JSON precisa ser um array de questoes.");
  }

  return dados.map((questao, index) => {
    if (!questao || typeof questao !== "object" || Array.isArray(questao)) {
      throw new Error(`A questao ${index + 1} nao esta em um objeto valido.`);
    }

    const tipoQuestao = sanitizeText(questao.tipo_questao).toLowerCase();
    if (!sanitizeText(questao.enunciado)) {
      throw new Error(`A questao ${index + 1} esta sem enunciado.`);
    }

    if (!TIPOS_QUESTAO_ACEITOS.has(tipoQuestao)) {
      throw new Error(`A questao ${index + 1} possui tipo_questao invalido.`);
    }

    const alternativas = normalizeAlternatives(questao.alternativas);
    if (tipoQuestao === "multipla_escolha" && !alternativas.length) {
      throw new Error(`A questao ${index + 1} precisa de alternativas para multipla_escolha.`);
    }

    if (tipoQuestao === "multipla_escolha") {
      alternativas.forEach((alternativa, altIndex) => {
        if (!alternativa.letra || !alternativa.texto) {
          throw new Error(`A alternativa ${altIndex + 1} da questao ${index + 1} precisa de letra e texto.`);
        }
      });
    }

    const confianca = normalizeConfidence(questao.confianca);

    return {
      numero_questao: Number(questao.numero_questao ?? index + 1) || index + 1,
      disciplina: sanitizeNullableText(questao.disciplina),
      ano_sugerido: sanitizeNullableText(questao.ano_sugerido),
      texto_apoio: sanitizeNullableText(questao.texto_apoio),
      enunciado: sanitizeText(questao.enunciado),
      alternativas,
      gabarito: sanitizeNullableText(questao.gabarito),
      tipo_questao: tipoQuestao,
      codigo_bncc_sugerido: sanitizeNullableText(questao.codigo_bncc_sugerido),
      habilidade_bncc_sugerida: sanitizeNullableText(questao.habilidade_bncc_sugerida),
      descritor_saeb_sugerido: sanitizeNullableText(questao.descritor_saeb_sugerido),
      descritor_parana_sugerido: sanitizeNullableText(questao.descritor_parana_sugerido),
      categoria: sanitizeNullableText(questao.categoria),
      justificativa_da_classificacao: sanitizeNullableText(questao.justificativa_da_classificacao),
      confianca
    };
  });
}

export function normalizarQuestaoImportada(q) {
  const alternativas = normalizeAlternatives(q.alternativas);
  const tipo = inferInternalType(q.tipo_questao, alternativas);
  const descricaoDisciplina = sanitizeText(q.disciplina);
  const codigoBncc = sanitizeText(q.codigo_bncc_sugerido);
  const habilidadeBncc = sanitizeText(q.habilidade_bncc_sugerida);
  const saeb = sanitizeText(q.descritor_saeb_sugerido);
  const parana = sanitizeText(q.descritor_parana_sugerido);
  const confianca = normalizeConfidence(q.confianca);

  return {
    tempId: `import-ia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    numeroOriginal: Number(q.numero_questao) || 0,
    anoEscolar: normalizeSchoolYear(q.ano_sugerido),
    disciplina: normalizeDiscipline(q.disciplina),
    disciplinaOriginal: descricaoDisciplina,
    anoOriginal: sanitizeText(q.ano_sugerido),
    tituloTextoApoio: "",
    textoApoio: sanitizeText(q.texto_apoio || ""),
    enunciado: sanitizeText(q.enunciado || ""),
    alternativas: alternativas.map((item, index) => ({
      letra: item.letra,
      texto: item.texto,
      imagemUrl: "",
      correta: false,
      ordem: index
    })),
    gabaritoOriginal: sanitizeText(q.gabarito || ""),
    respostaCorreta: tipo === "multipla_texto" ? resolveCorrectAnswerIndex(q.gabarito, alternativas) : "",
    respostaEsperada: tipo === "resposta_escrita" ? sanitizeText(q.gabarito || "") : "",
    tipo,
    tipoQuestaoImportado: sanitizeText(q.tipo_questao),
    descritor: saeb || parana,
    descritorDescricao: "",
    descritorConfirmadoPeloProfessor: false,
    descritorSugestaoIA: buildSuggestionObject(q),
    descritorSugerido: saeb || parana,
    confiancaDescritor: mapConfidenceToScore(confianca),
    formatoAlternativas: "(A)",
    nivelDificuldade: "",
    blocoTitulo: "",
    blocoId: "",
    ordemBloco: (Number(q.numero_questao) || 1) - 1,
    origemCriacao: "importacao_ia_externa",
    importacaoId: "",
    visibilidade: "privada",
    statusRevisao: "rascunho_importado",
    fonte: { nome: "", url: "", observacao: "", licenca: "" },
    bncc_sugerido: codigoBncc,
    bncc_confirmado: "",
    habilidade_bncc: habilidadeBncc,
    categoria_bncc: sanitizeText(q.categoria || ""),
    saeb_equivalente: saeb,
    parana_equivalente: parana,
    confianca_classificacao: confianca,
    justificativa_classificacao: sanitizeText(q.justificativa_da_classificacao || ""),
    classificacao_confirmada: false,
    data_confirmacao: null,
    professor_id: "",
    confirmadoParaSalvar: false,
    criadoEm: new Date()
  };
}

export function renderizarPreviewQuestoes(questoes) {
  return questoes.map(normalizarQuestaoImportada);
}

export function confirmarQuestaoImportada(questoes, index) {
  return questoes.map((questao, currentIndex) => currentIndex === index
    ? {
        ...questao,
        confirmadoParaSalvar: true,
        classificacao_confirmada: true,
        data_confirmacao: new Date(),
        descritorConfirmadoPeloProfessor: questao.descritor ? true : questao.descritorConfirmadoPeloProfessor
      }
    : questao);
}

export function removerQuestaoImportada(questoes, index) {
  return questoes.filter((_, currentIndex) => currentIndex !== index);
}

export async function salvarQuestoesConfirmadas(importacao, questoes, usuario) {
  const confirmadas = questoes.filter(questao => questao.confirmadoParaSalvar);
  if (!confirmadas.length) {
    throw new Error("Confirme pelo menos uma questao antes de salvar.");
  }

  return salvarImportacaoRevisada(importacao, confirmadas, usuario);
}
