const CLASSIFICATION_RULES = [
  {
    id: 'tema',
    conteudo: 'Assunto/tema do texto',
    descritor: 'D06',
    habilidadeBncc: 'Identificar o tema ou assunto principal do texto.',
    dificuldade: 'media',
    palavrasChave: [
      'esse texto fala sobre',
      'o texto fala sobre',
      'assunto',
      'tema',
      'ideia principal',
      'fala principalmente'
    ]
  },
  {
    id: 'finalidade',
    conteudo: 'Finalidade do texto',
    descritor: 'D09',
    habilidadeBncc: 'Identificar a finalidade de diferentes textos.',
    dificuldade: 'media',
    palavrasChave: [
      'qual e a finalidade',
      'qual é a finalidade',
      'finalidade',
      'objetivo do texto',
      'para que serve',
      'funcao do texto',
      'função do texto'
    ]
  },
  {
    id: 'imagem',
    conteudo: 'Leitura de imagem',
    descritor: 'D05',
    habilidadeBncc: 'Interpretar informacoes apresentadas em imagens, figuras ou tirinhas.',
    dificuldade: 'media',
    palavrasChave: [
      'observe a figura',
      'observe a imagem',
      'analise a imagem',
      'analise a figura',
      'leia a tirinha',
      'tirinha'
    ]
  },
  {
    id: 'adicao',
    conteudo: 'Adicao',
    descritor: 'D13',
    habilidadeBncc: 'Resolver problemas que envolvem adicao.',
    dificuldade: 'baixa',
    palavrasChave: [
      'soma',
      'ao todo',
      'total',
      'juntos',
      'somando',
      'adicao'
    ]
  },
  {
    id: 'subtracao',
    conteudo: 'Subtracao',
    descritor: 'D14',
    habilidadeBncc: 'Resolver problemas que envolvem subtracao.',
    dificuldade: 'baixa',
    palavrasChave: [
      'restaram',
      'diferenca',
      'diferença',
      'sobraram',
      'tirou',
      'subtracao',
      'subtração'
    ]
  }
];

export function normalizeClassifierText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQuestionTextParts(question = {}) {
  const alternativas = Array.isArray(question.alternativas)
    ? question.alternativas.map(item => typeof item === 'string' ? item : item?.texto || '')
    : [];

  return [
    question.instrucao,
    question.textoApoio,
    question.enunciado,
    ...alternativas
  ].filter(Boolean);
}

function countRuleHits(normalizedText, rule) {
  const hits = (rule.palavrasChave || []).filter(keyword => {
    const normalizedKeyword = normalizeClassifierText(keyword);
    return normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });

  const score = hits.reduce((total, keyword) => total + (keyword.includes(' ') ? 1.4 : 1), 0);
  return { hits, score };
}

function confidenceFromScore(score) {
  if (score >= 2.8) return 'alta';
  if (score >= 1.4) return 'media';
  return 'baixa';
}

export function suggestQuestionClassification(question = {}) {
  const textoAnalise = normalizeClassifierText(getQuestionTextParts(question).join(' '));

  if (!textoAnalise) {
    return {
      conteudo: '',
      descritor: '',
      habilidadeBncc: '',
      dificuldade: '',
      confianca: 'baixa',
      justificativa: 'Nao houve texto suficiente para sugerir classificacao.',
      hits: [],
      confirmadoAutomaticamente: false
    };
  }

  const ranking = CLASSIFICATION_RULES
    .map(rule => {
      const { hits, score } = countRuleHits(textoAnalise, rule);
      return { rule, hits, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranking.length) {
    return {
      conteudo: '',
      descritor: '',
      habilidadeBncc: '',
      dificuldade: '',
      confianca: 'baixa',
      justificativa: 'Nenhuma regra local encontrou palavras-chave suficientes.',
      hits: [],
      confirmadoAutomaticamente: false
    };
  }

  const best = ranking[0];
  return {
    conteudo: best.rule.conteudo,
    descritor: best.rule.descritor,
    habilidadeBncc: best.rule.habilidadeBncc,
    dificuldade: best.rule.dificuldade,
    confianca: confidenceFromScore(best.score),
    justificativa: `Sugestao local por palavras-chave: ${best.hits.join(', ')}.`,
    hits: best.hits,
    confirmadoAutomaticamente: false
  };
}

export function suggestClassificationsForQuestions(questions = []) {
  return (questions || []).map(question => ({
    question,
    sugestao: suggestQuestionClassification(question)
  }));
}

export { CLASSIFICATION_RULES };
