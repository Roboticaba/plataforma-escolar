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
13. conteudo
14. categoria
15. justificativa_da_classificacao
16. confianca:
   - alta
   - media
   - baixa

FORMATO DE SAIDA:

Voce pode responder em qualquer um destes formatos JSON validos:
- array direto
- { "questoes": [...] }
- { "data": { "questoes": [...] } }

REGRAS OBRIGATORIAS DE RESPOSTA:
- Nao escreva nenhuma introducao.
- Nao escreva nenhuma explicacao.
- Nao escreva titulos.
- Nao escreva markdown.
- Nao use blocos com crases.
- Nao use emojis.
- Nao escreva observacoes finais.
- Nao ofereca proximos passos.
- Responda somente com JSON.
- Use apenas aspas duplas validas de JSON.

MODELO EXATO DE ESTRUTURA:
{
  "questoes": [
    {
      "numero_questao": 1,
      "disciplina": "Lingua Portuguesa",
      "ano_sugerido": "5o ano",
      "texto_apoio": "",
      "enunciado": "",
      "alternativas": [
        { "letra": "A", "texto": "" },
        { "letra": "B", "texto": "" },
        { "letra": "C", "texto": "" },
        { "letra": "D", "texto": "" }
      ],
      "gabarito": null,
      "tipo_questao": "multipla_escolha",
      "codigo_bncc_sugerido": "",
      "habilidade_bncc_sugerida": "",
      "descritor_saeb_sugerido": "",
      "descritor_parana_sugerido": "",
      "conteudo": "",
      "categoria": "",
      "justificativa_da_classificacao": "",
      "confianca": ""
    }
  ]
}

Se a sua resposta contiver qualquer texto fora do JSON, ela estara errada.

Agora aguarde eu enviar o texto bruto.`;

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeNullableText(value) {
  const text = sanitizeText(value);
  return text || null;
}

function normalizeDiscipline(value) {
  const text = sanitizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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

function normalizeQuestionTypeValue(value, alternativas = []) {
  const normalized = sanitizeText(value).toLowerCase();
  if (TIPOS_QUESTAO_ACEITOS.has(normalized)) {
    return normalized;
  }
  return alternativas.length >= 2 ? "multipla_escolha" : "dissertativa";
}

function removeMarkdownFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function normalizeImportInputStart(text) {
  return removeMarkdownFence(String(text || ""))
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trimStart();
}

function extractJsonCandidate(text) {
  const cleaned = normalizeImportInputStart(text).trim()
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const firstTokenIndex = [firstObject, firstArray]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  const lastObject = cleaned.lastIndexOf("}");
  const lastArray = cleaned.lastIndexOf("]");
  const lastTokenIndex = Math.max(lastObject, lastArray);

  if (firstTokenIndex >= 0 && lastTokenIndex > firstTokenIndex) {
    return cleaned.slice(firstTokenIndex, lastTokenIndex + 1).trim();
  }

  return cleaned.trim();
}

export function comecaComoJsonImportado(texto) {
  const normalized = normalizeImportInputStart(texto);
  return normalized.startsWith("{") || normalized.startsWith("[");
}

function escapeInvalidLineBreaksInsideStrings(text) {
  let inString = false;
  let escaped = false;
  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "\"" && !escaped) {
      inString = !inString;
      output += char;
      escaped = false;
      continue;
    }

    if (inString && (char === "\n" || char === "\r")) {
      output += "\\n";
      escaped = false;
      continue;
    }

    output += char;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") {
      escaped = false;
    }
  }

  return output;
}

function normalizarTextoJsonImportado(texto) {
  return extractJsonCandidate(texto)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function normalizarJsonFlexivel(bruto) {
  const semComentarios = bruto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(linha => linha.replace(/(^|[^:])\/\/.*$/g, "$1"))
    .join("\n");

  return escapeInvalidLineBreaksInsideStrings(semComentarios)
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, "$1\"$2\":")
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ": \"$1\"")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function buildJsonParseError(error) {
  const detail = sanitizeText(error?.message);
  return detail
    ? `Nao foi possivel ler o JSON. Problema identificado: ${detail}.`
    : "Nao foi possivel ler o JSON.";
}

function getFirstFilledValue(...values) {
  const found = values.find(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return sanitizeText(value) !== "";
  });
  return found;
}

function normalizeKeyAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getAliasValue(source, aliases = []) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  const aliasSet = new Set(aliases.map(normalizeKeyAlias));
  for (const [key, value] of Object.entries(source)) {
    if (aliasSet.has(normalizeKeyAlias(key))) {
      return value;
    }
  }

  return undefined;
}

function getNestedAliasValue(source, aliasGroups = []) {
  for (const aliases of aliasGroups) {
    const value = getAliasValue(source, aliases);
    if (typeof value !== "undefined") {
      return value;
    }
  }
  return undefined;
}

function stripAlternativePrefix(texto = "") {
  return sanitizeText(texto)
    .replace(/^(alternativa\s+)?[A-D]\)?[\s:.-]*/i, "")
    .replace(/^\(?[A-D]\)?[\s:.-]*/i, "")
    .trim();
}

function normalizeAlternativeLetter(value, fallbackIndex = 0) {
  const cleaned = sanitizeText(value).toUpperCase();
  const letterMatch = cleaned.match(/[A-D]/);
  if (letterMatch) return letterMatch[0];
  return String.fromCharCode(65 + fallbackIndex);
}

function normalizeAlternatives(rawQuestao) {
  if (Array.isArray(rawQuestao)) {
    return rawQuestao.map((alternativa, index) => {
      if (typeof alternativa === "string") {
        const inferredLetter = normalizeAlternativeLetter(alternativa, index);
        return {
          letra: inferredLetter,
          texto: stripAlternativePrefix(alternativa)
        };
      }

      return {
        letra: normalizeAlternativeLetter(
          getFirstFilledValue(
            alternativa?.letra,
            alternativa?.label,
            alternativa?.opcao,
            alternativa?.opção,
            alternativa?.id
          ),
          index
        ),
        texto: sanitizeText(
          getFirstFilledValue(
            alternativa?.texto,
            alternativa?.alternativa,
            alternativa?.conteudo,
            alternativa?.conteúdo,
            alternativa?.valor,
            alternativa?.value
          )
        )
      };
    }).filter(item => item.texto);
  }

  const alternativas = getNestedAliasValue(rawQuestao, [
    ["alternativas", "opcoes", "opções", "choices", "alternatives"]
  ]);

  if (Array.isArray(alternativas)) {
    return alternativas.map((alternativa, index) => {
      if (typeof alternativa === "string") {
        const inferredLetter = normalizeAlternativeLetter(alternativa, index);
        return {
          letra: inferredLetter,
          texto: stripAlternativePrefix(alternativa)
        };
      }

      return {
        letra: normalizeAlternativeLetter(
          getFirstFilledValue(
            alternativa?.letra,
            alternativa?.label,
            alternativa?.opcao,
            alternativa?.opção,
            alternativa?.id
          ),
          index
        ),
        texto: sanitizeText(
          getFirstFilledValue(
            alternativa?.texto,
            alternativa?.alternativa,
            alternativa?.conteudo,
            alternativa?.conteúdo,
            alternativa?.valor,
            alternativa?.value
          )
        )
      };
    }).filter(item => item.texto);
  }

  if (alternativas && typeof alternativas === "object") {
    return Object.entries(alternativas)
      .map(([key, value], index) => ({
        letra: normalizeAlternativeLetter(key, index),
        texto: sanitizeText(value)
      }))
      .filter(item => item.texto);
  }

  const alternativasSoltas = ["A", "B", "C", "D", "E"]
    .map((letra, index) => ({
      letra,
      texto: sanitizeText(getAliasValue(rawQuestao, [
        `alternativa${letra}`,
        `alternativa_${letra}`,
        `opcao${letra}`,
        `opcao_${letra}`
      ]))
    }))
    .filter(item => item.texto);

  if (alternativasSoltas.length) {
    return alternativasSoltas;
  }

  return [];
}

function normalizeCorrectAnswerToken(value) {
  const text = sanitizeText(value);
  if (!text) return "";

  const upper = text.toUpperCase();
  const letterMatch = upper.match(/\b([A-D])\b/);
  if (letterMatch) return letterMatch[1];

  const simpleLetter = upper.match(/^[A-D]\)?$/);
  if (simpleLetter) return simpleLetter[0].replace(")", "");

  const altLetter = upper.match(/ALTERNATIVA\s*([A-D])/);
  if (altLetter) return altLetter[1];

  const letraLetter = upper.match(/LETRA\s*([A-D])/);
  if (letraLetter) return letraLetter[1];

  const numeric = upper.match(/^\d+$/);
  if (numeric) return numeric[0];

  return upper;
}

function resolveTypeFromData(rawType, alternativas, answerValue) {
  const normalizedType = normalizeQuestionTypeValue(rawType, alternativas);
  if (normalizedType) return normalizedType;
  if (alternativas.length >= 2) return "multipla_escolha";
  if (sanitizeText(answerValue)) return "dissertativa";
  return "dissertativa";
}

function normalizarQuestao(rawQuestao, index = 0, meta = {}) {
  if (!rawQuestao || typeof rawQuestao !== "object" || Array.isArray(rawQuestao)) {
    throw new Error(`A questao ${index + 1} nao esta em um objeto valido.`);
  }

  const alternativas = normalizeAlternatives(rawQuestao);
  const respostaBruta = getNestedAliasValue(rawQuestao, [
    ["respostaCorreta", "resposta_correta", "correta", "gabarito", "alternativa_correta", "resposta"]
  ]);
  const tipoQuestao = resolveTypeFromData(
    getNestedAliasValue(rawQuestao, [["tipo", "tipo_questao", "tipoQuestao"]]),
    alternativas,
    respostaBruta
  );
  const textoApoio = sanitizeText(
    getNestedAliasValue(rawQuestao, [["textoApoio", "texto_apoio", "texto_base", "textoBase", "suporte", "contexto"]]) ||
    meta.textoBase
  );
  const enunciado = sanitizeText(
    getNestedAliasValue(rawQuestao, [["enunciado", "pergunta", "comando", "textoQuestao", "texto_questao"]])
  );
  const normalized = {
    numero_questao: Number(
      getNestedAliasValue(rawQuestao, [["numero", "numero_questao", "questao", "questão", "id"]]) ?? index + 1
    ) || index + 1,
    disciplina: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["disciplina", "componente", "materia", "área", "area"]]) || meta.disciplina
    ),
    ano_sugerido: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["ano", "ano_sugerido", "serie", "série", "etapa"]]) || meta.ano
    ),
    texto_apoio: sanitizeNullableText(textoApoio),
    enunciado: maybeRemoveDuplicatedSupportText(enunciado, textoApoio),
    alternativas,
    gabarito: sanitizeNullableText(normalizeCorrectAnswerToken(respostaBruta)),
    tipo_questao: tipoQuestao,
    codigo_bncc_sugerido: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["codigo_bncc", "codigo_bncc_sugerido"]]) ||
      (typeof getAliasValue(rawQuestao, ["bncc"]) === "string" ? getAliasValue(rawQuestao, ["bncc"]) : "") ||
      (typeof getAliasValue(rawQuestao, ["bncc"]) === "object"
        ? getNestedAliasValue(getAliasValue(rawQuestao, ["bncc"]), [["codigo", "codigo_bncc", "codigoHabilidade"]])
        : "")
    ),
    habilidade_bncc_sugerida: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["habilidade_bncc", "habilidade_bncc_sugerida"]]) ||
      (typeof getAliasValue(rawQuestao, ["bncc"]) === "object"
        ? getNestedAliasValue(getAliasValue(rawQuestao, ["bncc"]), [["habilidade", "habilidade_bncc"]])
        : "")
    ),
    descritor_saeb_sugerido: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["descritor", "descritor_saeb", "descritor_saeb_sugerido"]])
    ),
    descritor_parana_sugerido: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["descritor_parana", "descritor_parana_sugerido"]])
    ),
    conteudo: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["conteudo", "conteúdo", "objeto_conhecimento", "objetoDeConhecimento"]]) || meta.conteudo
    ),
    categoria: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["categoria", "eixo", "unidade_tematica", "unidadeTematica"]])
    ),
    justificativa_da_classificacao: sanitizeNullableText(
      getNestedAliasValue(rawQuestao, [["justificativa_da_classificacao", "justificativa", "explicacao", "explicação"]])
    ),
    confianca: normalizeConfidence(getNestedAliasValue(rawQuestao, [["confianca", "confiança"]]))
  };

  const warnings = [];
  if (!normalized.enunciado) warnings.push("enunciado ausente");
  if (normalized.tipo_questao === "multipla_escolha" && normalized.alternativas.length < 2) warnings.push("alternativas ausentes");
  if (!sanitizeText(normalized.gabarito)) warnings.push("resposta correta ausente");
  normalized.importWarnings = warnings;

  return normalized;
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

  const textIndex = alternativas.findIndex(item => sanitizeText(item.texto).toUpperCase() === token);
  if (textIndex >= 0) return String(textIndex);

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
    conteudo: sanitizeText(question.conteudo),
    confianca: normalizeConfidence(question.confianca),
    confianca_classificacao: normalizeConfidence(question.confianca),
    pontuacao: 0,
    justificativa: sanitizeText(question.justificativa_da_classificacao)
  };
}

function findQuestionArrayCandidate(dados) {
  if (Array.isArray(dados)) {
    return { questoes: dados, meta: {} };
  }

  if (!dados || typeof dados !== "object") {
    return null;
  }

  const direct = getNestedAliasValue(dados, [
    ["questoes", "questões", "items", "questions"]
  ]);

  if (Array.isArray(direct)) {
    return { questoes: direct, meta: dados };
  }

  const nestedContainers = [
    getAliasValue(dados, ["data"]),
    getAliasValue(dados, ["resultado", "result"]),
    getAliasValue(dados, ["payload"])
  ].filter(Boolean);

  for (const container of nestedContainers) {
    const nested = getNestedAliasValue(container, [["questoes", "questões", "items", "questions"]]);
    if (Array.isArray(nested)) {
      return {
        questoes: nested,
        meta: {
          ...dados,
          ...(container && typeof container === "object" ? container : {})
        }
      };
    }
  }

  return null;
}

function extractQuestionsPayload(dados) {
  const candidate = findQuestionArrayCandidate(dados);
  if (candidate) return candidate;

  throw new Error("Nenhuma lista de questoes foi encontrada. Use um array direto ou um objeto com questoes em chaves como questoes, questões, data, resultado, items ou questions.");
}

function maybeRemoveDuplicatedSupportText(enunciado, textoApoio) {
  const cleanStatement = sanitizeText(enunciado);
  const cleanSupport = sanitizeText(textoApoio);
  if (!cleanStatement || !cleanSupport) return cleanStatement;

  const normalizedStatement = cleanStatement
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedSupport = cleanSupport
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalizedStatement.startsWith(normalizedSupport)) {
    return cleanStatement.slice(cleanSupport.length).replace(/^[-:.\s]+/, "").trim();
  }

  return cleanStatement;
}

function buildImportMetadata(meta = {}, questoes = []) {
  const bloco = meta.bloco && typeof meta.bloco === "object" ? meta.bloco : {};
  const textoBase = sanitizeText(
    getFirstFilledValue(
      meta.texto_base,
      meta.textoBase,
      meta.texto_apoio,
      meta.textoApoio,
      bloco.texto_base,
      bloco.texto_apoio,
      bloco.textoApoio
    ) || ""
  );
  const tituloBloco = sanitizeText(
    getFirstFilledValue(
      meta.titulo_bloco,
      meta.tituloBloco,
      meta.titulo,
      bloco.titulo,
      bloco.titulo_bloco
    ) || ""
  );
  const disciplina = sanitizeText(getFirstFilledValue(meta.disciplina, bloco.disciplina) || "");
  const ano = sanitizeText(getFirstFilledValue(meta.ano_sugerido, meta.ano, bloco.ano_sugerido, bloco.ano) || "");
  const conteudo = sanitizeText(getFirstFilledValue(meta.conteudo, bloco.conteudo) || "");
  const shouldCreateBlock = Boolean(textoBase && questoes.length > 1);
  const blocoId = shouldCreateBlock
    ? `import-ia-bloco-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : "";

  return {
    textoBase,
    tituloBloco,
    disciplina,
    ano,
    conteudo,
    blocoId,
    shouldCreateBlock
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
    ? "Prompt e texto copiados. Cole na IA externa, depois volte e cole a resposta aqui no mesmo campo."
    : "Prompt copiado! Agora cole em uma IA externa junto com o texto bruto da prova.";
}

export function pareceJsonImportadoCompleto(texto) {
  if (!comecaComoJsonImportado(texto)) return false;
  const bruto = normalizarTextoJsonImportado(texto);
  if (!bruto) return false;
  return (bruto.startsWith("[") && bruto.endsWith("]")) || (bruto.startsWith("{") && bruto.endsWith("}"));
}

export function validarJSONImportado(texto) {
  const bruto = normalizarTextoJsonImportado(texto);
  if (!bruto) {
    throw new Error("Cole o JSON organizado pela IA externa antes de continuar.");
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
    throw new Error(buildJsonParseError(ultimoErro));
  }

  const { questoes, meta } = extractQuestionsPayload(dados);
  return validarQuestoesImportadas(questoes, meta);
}

export function validarQuestoesImportadas(dados, meta = {}) {
  if (!Array.isArray(dados)) {
    throw new Error("A estrutura de questoes precisa ser um array.");
  }

  const importMeta = buildImportMetadata(meta, dados);
  const questoes = dados.map((questao, index) => normalizarQuestao(questao, index, importMeta));

  return {
    questoes,
    meta: importMeta,
    total: questoes.length
  };
}

export function normalizarQuestaoImportada(q, meta = {}, index = 0) {
  const alternativas = normalizeAlternatives(q.alternativas);
  const tipo = inferInternalType(q.tipo_questao, alternativas);
  const descricaoDisciplina = sanitizeText(q.disciplina);
  const codigoBncc = sanitizeText(q.codigo_bncc_sugerido);
  const habilidadeBncc = sanitizeText(q.habilidade_bncc_sugerida);
  const saeb = sanitizeText(q.descritor_saeb_sugerido);
  const parana = sanitizeText(q.descritor_parana_sugerido);
  const confianca = normalizeConfidence(q.confianca);
  const textoApoio = sanitizeText(q.texto_apoio || meta.textoBase || "");
  const conteudo = sanitizeText(q.conteudo || meta.conteudo || "");

  return {
    tempId: `import-ia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    numeroOriginal: Number(q.numero_questao) || index + 1,
    anoEscolar: normalizeSchoolYear(q.ano_sugerido || meta.ano || ""),
    disciplina: normalizeDiscipline(q.disciplina || meta.disciplina || ""),
    disciplinaOriginal: descricaoDisciplina || sanitizeText(meta.disciplina || ""),
    anoOriginal: sanitizeText(q.ano_sugerido || meta.ano || ""),
    tituloTextoApoio: sanitizeText(meta.tituloBloco || ""),
    textoApoio,
    enunciado: sanitizeText(q.enunciado || ""),
    alternativas: alternativas.map((item, altIndex) => ({
      letra: item.letra,
      texto: item.texto,
      imagemUrl: "",
      correta: false,
      ordem: altIndex
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
    conteudo,
    blocoTitulo: sanitizeText(meta.tituloBloco || ""),
    blocoId: meta.shouldCreateBlock ? meta.blocoId : "",
    ordemBloco: index,
    origemCriacao: meta.shouldCreateBlock ? "importacao_bloco" : "importacao_ia_externa",
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
    importWarnings: Array.isArray(q.importWarnings) ? [...q.importWarnings] : [],
    classificacao_confirmada: false,
    data_confirmacao: null,
    professor_id: "",
    confirmadoParaSalvar: true,
    criadoEm: new Date()
  };
}

export function renderizarPreviewQuestoes(payload) {
  const pacote = Array.isArray(payload)
    ? { questoes: payload, meta: {} }
    : payload;

  return (pacote.questoes || []).map((questao, index) => normalizarQuestaoImportada(questao, pacote.meta || {}, index));
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
    throw new Error("Selecione pelo menos uma questao para salvar.");
  }

  return salvarImportacaoRevisada(importacao, confirmadas, usuario);
}
