const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const ALLOWED_DISCIPLINAS = new Set(["portugues", "matematica"]);
const ALLOWED_ANOS = new Set(["1", "2", "3", "4", "5"]);

function pickString(value, maxLength = 12000) {
  return String(value || "").slice(0, maxLength);
}

function normalizeAlternativas(alternativas) {
  return Array.isArray(alternativas)
    ? alternativas.slice(0, 8).map((item, index) => ({
        ordem: index,
        texto: typeof item === "string" ? item : pickString(item?.texto, 1000),
        imagemUrl: typeof item === "object" ? pickString(item?.imagemUrl || item?.imagem, 1000) : "",
        correta: Boolean(item?.correta)
      }))
    : [];
}

function normalizeDescritores(descritores) {
  return Array.isArray(descritores)
    ? descritores.slice(0, 80).map(item => ({
        codigo: pickString(item?.codigo, 20),
        nome: pickString(item?.nome, 600)
      })).filter(item => item.codigo && item.nome)
    : [];
}

async function requireProfessor(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await admin.auth().verifyIdToken(match[1]);
  const userDoc = await admin.firestore().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "professor") {
    throw new Error("FORBIDDEN");
  }

  return decoded;
}

function buildPrompt(dados, descritores) {
  return [
    "Voce e um especialista pedagogico em descritores de Portugues e Matematica do 1o ao 5o ano.",
    "Analise a questao e escolha exatamente um descritor da lista permitida.",
    "Nao invente codigo de descritor. Se a questao for insuficiente, retorne descritor vazio e confianca baixa.",
    "",
    `Disciplina: ${dados.disciplina}`,
    `Ano escolar: ${dados.anoEscolar}`,
    `Tipo: ${dados.tipo}`,
    `Titulo do texto: ${dados.tituloTextoApoio || ""}`,
    `Texto de apoio: ${dados.textoApoio || ""}`,
    `Enunciado: ${dados.enunciado || ""}`,
    `Alternativas: ${JSON.stringify(dados.alternativas || [])}`,
    `Resposta correta: ${dados.respostaCorreta ?? ""}`,
    "",
    `Descritores permitidos: ${JSON.stringify(descritores)}`
  ].join("\n");
}

exports.analisarDescritorQuestao = onRequest({
  region: "us-central1",
  cors: true,
  timeoutSeconds: 45,
  secrets: [OPENAI_API_KEY]
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await requireProfessor(req);

    const body = req.body || {};
    const dados = {
      tituloTextoApoio: pickString(body.tituloTextoApoio || body.tituloTexto || body.blocoTitulo),
      textoApoio: pickString(body.textoApoio),
      enunciado: pickString(body.enunciado),
      alternativas: normalizeAlternativas(body.alternativas),
      respostaCorreta: body.respostaCorreta,
      tipo: pickString(body.tipo, 80),
      anoEscolar: pickString(body.anoEscolar, 2),
      disciplina: pickString(body.disciplina, 40)
    };
    const descritores = normalizeDescritores(body.descritoresPermitidos);

    if (!ALLOWED_DISCIPLINAS.has(dados.disciplina) || !ALLOWED_ANOS.has(dados.anoEscolar) || !descritores.length) {
      res.status(400).json({ error: "Analise disponivel apenas para Portugues e Matematica do 1o ao 5o ano." });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY.value()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: "Responda apenas com JSON valido seguindo o schema solicitado."
          },
          {
            role: "user",
            content: buildPrompt(dados, descritores)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "analise_descritor",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                descritor: { type: "string" },
                descricao: { type: "string" },
                confianca: { type: "number", minimum: 0, maximum: 1 },
                justificativa: { type: "string" },
                criteriosAnalisados: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    tituloTexto: { type: "boolean" },
                    textoApoio: { type: "boolean" },
                    enunciado: { type: "boolean" },
                    alternativas: { type: "boolean" },
                    respostaCorreta: { type: "boolean" },
                    tipoQuestao: { type: "boolean" },
                    anoEscolar: { type: "string" },
                    disciplina: { type: "string" },
                    criteriosPedagogicos: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: [
                    "tituloTexto",
                    "textoApoio",
                    "enunciado",
                    "alternativas",
                    "respostaCorreta",
                    "tipoQuestao",
                    "anoEscolar",
                    "disciplina",
                    "criteriosPedagogicos"
                  ]
                }
              },
              required: ["descritor", "descricao", "confianca", "justificativa", "criteriosAnalisados"]
            }
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(502).json({ error: data?.error?.message || "Erro ao consultar IA." });
      return;
    }

    const outputText = data.output_text || data.output?.flatMap(item => item.content || [])
      .find(item => item.type === "output_text")?.text;
    const parsed = JSON.parse(outputText || "{}");

    if (parsed.descritor && !descritores.some(item => item.codigo === parsed.descritor)) {
      parsed.descritor = "";
      parsed.descricao = "";
      parsed.confianca = Math.min(Number(parsed.confianca || 0), 0.2);
      parsed.justificativa = "A IA retornou um descritor fora da lista permitida; selecione manualmente.";
    }

    res.json(parsed);
  } catch (error) {
    if (error.message === "AUTH_REQUIRED") {
      res.status(401).json({ error: "Login obrigatorio." });
      return;
    }
    if (error.message === "FORBIDDEN") {
      res.status(403).json({ error: "Acesso permitido apenas para professores." });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Erro interno ao analisar descritor." });
  }
});
