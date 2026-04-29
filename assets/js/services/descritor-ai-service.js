import { disciplinaPrecisaDescritor, getDescritores } from "../core/constants.js";

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

export async function sugerirDescritorComIA(dadosQuestao) {
  const disciplina = dadosQuestao?.disciplina;
  const anoEscolar = dadosQuestao?.anoEscolar;

  if (!disciplinaPrecisaDescritor(disciplina) || !anoEscolar) {
    return null;
  }

  const descritores = getDescritores(disciplina, anoEscolar);
  if (!descritores.length) {
    return null;
  }

  const alternativasTexto = (dadosQuestao?.alternativas || [])
    .map(item => typeof item === "string" ? item : item?.texto || "")
    .join(" ");

  const corpus = normalizeContent([
    dadosQuestao?.textoApoio,
    dadosQuestao?.enunciado,
    alternativasTexto,
    dadosQuestao?.respostaEsperada,
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
        hits
      };
    }
  }

  if (!melhor || melhor.score === 0) {
    return {
      descritor: "",
      descricao: "",
      confianca: 0,
      justificativa: "Nenhuma sugestao automatica confiavel foi encontrada."
    };
  }

  const confianca = Math.min(0.99, 0.35 + (melhor.score * 0.16));
  return {
    descritor: melhor.descritor,
    descricao: melhor.descricao,
    confianca,
    justificativa: `Sugestao baseada em termos encontrados: ${melhor.hits.join(", ")}.`
  };
}
