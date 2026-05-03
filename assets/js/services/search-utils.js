const TYPO_EQUIVALENTS = new Map([
  ["portugues", ["lingua portuguesa", "port", "português"]],
  ["matematica", ["matematica", "mat", "matemática"]],
  ["ciencias", ["ciencias", "ciências"]],
  ["historia", ["historia", "história"]],
  ["geografia", ["geo", "geografia"]],
  ["genero", ["gênero", "genero textual"]],
  ["noticia", ["noticia", "notícia"]],
  ["inferencia", ["inferencia", "inferência", "inferir"]],
  ["5", ["cinco", "5o", "5º", "quinto"]],
  ["4", ["quatro", "4o", "4º", "quarto"]],
  ["3", ["tres", "três", "3o", "3º", "terceiro"]],
  ["2", ["dois", "2o", "2º", "segundo"]],
  ["1", ["um", "1o", "1º", "primeiro"]]
]);

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeRawSearchText(text) {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bano\b/g, " ")
    .replace(/\banos\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

export function normalizeSearchText(text) {
  const normalized = normalizeRawSearchText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  const expanded = new Set(tokens);

  tokens.forEach(token => {
    TYPO_EQUIVALENTS.forEach((variants, canonical) => {
      if (canonical === token || variants.includes(token)) {
        expanded.add(canonical);
        variants.forEach(item => {
          normalizeRawSearchText(item)
            .split(" ")
            .filter(Boolean)
            .forEach(part => expanded.add(part));
        });
      }
    });

    if (/^d\d{1,2}$/i.test(token)) {
      expanded.add(`d${token.replace(/\D/g, "").padStart(2, "0")}`);
    }
    if (/^\d$/.test(token)) {
      expanded.add(`${token}o`);
      expanded.add(`${token} ano`);
    }
  });

  return unique([...expanded]).join(" ");
}

export function tokenizeSearchText(text) {
  return normalizeSearchText(text).split(" ").filter(Boolean);
}

export function buildNormalizedTags(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const tokens = source.flatMap(value => tokenizeSearchText(value));
  return unique(tokens);
}

export function buildSearchIndex(values = []) {
  return unique([
    ...buildNormalizedTags(values),
    normalizeSearchText(Array.isArray(values) ? values.join(" ") : values)
  ]).join(" ");
}

function levenshtein(a = "", b = "") {
  const matrix = Array.from({ length: b.length + 1 }, () => []);
  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

export function scoreSearchMatch(query, candidates = []) {
  const queryTokens = tokenizeSearchText(query);
  const candidateTokens = buildNormalizedTags(candidates);
  if (!queryTokens.length) {
    return { matched: true, score: 1, missing: [] };
  }

  let score = 0;
  const missing = [];

  queryTokens.forEach(token => {
    const direct = candidateTokens.find(candidate => candidate === token);
    if (direct) {
      score += 3;
      return;
    }

    const partial = candidateTokens.find(candidate => candidate.includes(token) || token.includes(candidate));
    if (partial) {
      score += 1.75;
      return;
    }

    const similar = candidateTokens.find(candidate => levenshtein(candidate, token) <= 1);
    if (similar) {
      score += 1.2;
      return;
    }

    missing.push(token);
  });

  return {
    matched: score > 0 && missing.length < queryTokens.length,
    score,
    missing
  };
}

export function findSimilarTerms(query, options = []) {
  const normalizedQueryTokens = tokenizeSearchText(query);
  const normalizedOptions = unique(options.flatMap(option => buildNormalizedTags(option)));

  return normalizedQueryTokens.flatMap(token => normalizedOptions
    .map(option => ({
      option,
      distance: levenshtein(token, option)
    }))
    .filter(item => item.distance > 0 && item.distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(item => item.option)
  ).filter((value, index, array) => array.indexOf(value) === index);
}
