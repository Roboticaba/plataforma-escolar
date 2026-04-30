import { disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js";

const CLOUD_ANALYSIS_URL = "https://us-central1-plataforma-escolar-71635.cloudfunctions.net/analisarDescritorQuestao";

const DESCRIPTOR_HINTS = {
  portugues: {
    D01: ["localizar", "encontrar", "informacao explicita", "quem", "quando", "onde"],
    D03: ["inferir", "deduzir", "sentido", "sugere", "implicito"],
    D04: ["conclusao", "provavel", "possivel", "informacao"],
    D08: ["causa", "consequencia", "porque", "resultado", "entao"],
    D10: ["linguagem", "registro", "formal", "informal", "palavra"],
    D15: ["comparar", "diferenca", "semelhanca", "contraste"],
    D23: ["genero", "tipo de texto", "reportagem", "bilhete", "poema"]
  },
  matematica: {
    D01: ["numero", "quantidade", "ler", "numeral"],
    D02: ["ordenar", "sequencia", "crescente", "decrescente"],
    D03: ["figura", "forma", "geometrica", "circulo", "quadrado"],
    D05: ["medida", "comprimento", "altura", "metro"],
    D07: ["unidade", "litro", "quilo", "grama", "metro"],
    D10: ["dinheiro", "valor", "preco", "troco", "real"],
    D11: ["perimetro", "contorno", "volta"],
    D12: ["area", "superficie"],
    D17: ["soma", "adicao", "subtracao", "mais", "menos"],
    D18: ["multiplicacao", "vezes", "produto"],
    D19: ["problema", "situacao", "resolver"],
    D24: ["fracao", "metade", "parte"],
    D26: ["porcentagem", "desconto", "aumento", "%"],
    D27: ["tabela", "linha", "coluna", "dados"],
    D28: ["grafico", "barra", "coluna", "interpretar"]
  }
};

function normalizeContent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAlternativasTexto(dadosQuestao) {
  return (dadosQuestao?.alternativas || [])
    .map(item => typeof item === "string" ? item : item?.texto || "")
    .filter(Boolean)
    .join(" ");
}

function getRespostaCorretaTexto(dadosQuestao) {
  const alternativas = dadosQuestao?.alternativas || [];
  const index = Number(dadosQuestao?.respostaCorreta);
  if (Number.isNaN(index) || !alternativas[index]) {
    return "";
  }

  const alternativa = alternativas[index];
  return typeof alternativa === "string" ? alternativa : alternativa?.texto || alternativa?.imagemUrl || "";
}

async function getFirebaseIdToken() {
  if (!window.firebase?.auth) {
    return "";
  }

  const auth = window.firebase.auth();
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }

  return new Promise(resolve => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      resolve(user ? user.getIdToken() : "");
    });
    setTimeout(() => {
      unsubscribe();
      resolve("");
    }, 1200);
  });
}

async function analisarDescritorComOpenAI(dadosQuestao) {
  const disciplina = dadosQuestao?.disciplina;
  const anoEscolar = dadosQuestao?.anoEscolar;

  if (!disciplinaPrecisaDescritor(disciplina) || !anoEscolar) {
    return null;
  }

  const token = await getFirebaseIdToken();
  if (!token) {
    return null;
  }

  const descritoresPermitidos = getDescritores(disciplina, anoEscolar);
  if (!descritoresPermitidos.length) {
    return null;
  }

  const response = await fetch(CLOUD_ANALYSIS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...dadosQuestao,
      descritoresPermitidos
    })
  });

  if (!response.ok) {
    throw new Error("IA indisponivel no momento.");
  }

  return response.json();
}

async function analisarDescritorLocal(dadosQuestao) {
  const disciplina = dadosQuestao?.disciplina;
  const anoEscolar = dadosQuestao?.anoEscolar;

  if (!disciplinaPrecisaDescritor(disciplina) || !anoEscolar) {
    return null;
  }

  const descritores = getDescritores(disciplina, anoEscolar);
  if (!descritores.length) {
    return null;
  }

  const alternativasTexto = getAlternativasTexto(dadosQuestao);
  const respostaCorretaTexto = getRespostaCorretaTexto(dadosQuestao);

  const corpus = normalizeContent([
    dadosQuestao?.tituloTextoApoio,
    dadosQuestao?.tituloTexto,
    dadosQuestao?.blocoTitulo,
    dadosQuestao?.textoApoio,
    dadosQuestao?.enunciado,
    alternativasTexto,
    respostaCorretaTexto,
    dadosQuestao?.respostaEsperada,
    dadosQuestao?.tipo,
    dadosQuestao?.disciplina,
    dadosQuestao?.anoEscolar
  ].filter(Boolean).join(" "));

  let melhor = null;

  for (const descritor of descritores) {
    const keywords = DESCRIPTOR_HINTS[disciplina]?.[descritor.codigo] || [];
    const hits = keywords.filter(keyword => corpus.includes(normalizeContent(keyword)));
    const score = hits.length;

    if (!melhor || score > melhor.score) {
      melhor = {
        score,
        descritor: descritor.codigo,
        descricao: descritor.nome,
        hits,
        criterioDescricao: normalizeContent(descritor.nome)
      };
    }
  }

  if (!melhor || melhor.score === 0) {
    return {
      descritor: "",
      descricao: "",
      confianca: 0,
      justificativa: "Nenhuma sugestao automatica confiavel foi encontrada.",
      criteriosAnalisados: {
        tituloTexto: Boolean(dadosQuestao?.tituloTextoApoio || dadosQuestao?.tituloTexto || dadosQuestao?.blocoTitulo),
        textoApoio: Boolean(dadosQuestao?.textoApoio),
        enunciado: Boolean(dadosQuestao?.enunciado),
        alternativas: Boolean(alternativasTexto),
        respostaCorreta: Boolean(respostaCorretaTexto),
        tipoQuestao: Boolean(dadosQuestao?.tipo),
        anoEscolar,
        disciplina,
        termosEncontrados: []
      }
    };
  }

  const confianca = Math.min(0.99, 0.35 + (melhor.score * 0.14));
  return {
    descritor: melhor.descritor,
    descricao: melhor.descricao,
    confianca,
    justificativa: `Sugestao baseada em titulo, texto, enunciado, alternativas, resposta correta, tipo, ano e disciplina. Termos encontrados: ${melhor.hits.join(", ")}.`,
    criteriosAnalisados: {
      tituloTexto: Boolean(dadosQuestao?.tituloTextoApoio || dadosQuestao?.tituloTexto || dadosQuestao?.blocoTitulo),
      textoApoio: Boolean(dadosQuestao?.textoApoio),
      enunciado: Boolean(dadosQuestao?.enunciado),
      alternativas: Boolean(alternativasTexto),
      respostaCorreta: Boolean(respostaCorretaTexto),
      tipoQuestao: Boolean(dadosQuestao?.tipo),
      anoEscolar,
      disciplina,
      termosEncontrados: melhor.hits
    }
  };
}

export async function analisarDescritorQuestao(dadosQuestao) {
  try {
    const result = await analisarDescritorComOpenAI(dadosQuestao);
    if (result) {
      return {
        ...result,
        origemAnalise: "openai"
      };
    }
  } catch (error) {
    console.warn("Falha na IA real; usando fallback local.", error);
  }

  const fallback = await analisarDescritorLocal(dadosQuestao);
  return fallback ? {
    ...fallback,
    origemAnalise: "fallback_local"
  } : null;
}

export async function sugerirDescritorComIA(dadosQuestao) {
  return analisarDescritorQuestao(dadosQuestao);
}
