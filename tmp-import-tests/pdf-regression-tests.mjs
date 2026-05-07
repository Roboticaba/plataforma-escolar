globalThis.window = {
  firebase: {
    apps: [],
    initializeApp() { return {}; },
    app() { return {}; },
    firestore() { return {}; },
    auth() { return {}; }
  }
};
globalThis.firebase = globalThis.window.firebase;
globalThis.DOMMatrix = globalThis.DOMMatrix || class DOMMatrix {};
globalThis.ImageData = globalThis.ImageData || class ImageData {};
globalThis.Path2D = globalThis.Path2D || class Path2D {};

const { organizarQuestoesParaRevisao, cleanTextoImportado } = await import("../assets/js/services/importacao-questoes-service.js");
const { cleanPdfText, inferPdfImagePageFromObjectName } = await import("../assets/js/services/pdf-import-service.js");
const { buildQuestionRecord, normalizeLegacyQuestion } = await import("../assets/js/services/questions-service.js");

const ctx = { titulo: "Regressao PDF", anoEscolar: "5ano", disciplina: "portugues", fonte: {} };
const forbiddenInContent = /(Disponivel em:|Disponivel em|Revista S[ií]tio|ROCHA,|BANDEIRA,|O GLOBO|Alexandre Beck|Folha de S\.Paulo|http|www)/i;

function parseOne(text) {
  const result = organizarQuestoesParaRevisao(text, ctx);
  return result.questions[0] || {};
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const cases = [
  {
    id: "Q1-antes-de-terminar-leitura",
    text: "QUESTAO 1 Marina estava muito animada para o piquenique no parque. Desde cedo, ela preparou os lanches e separou uma toalha bem grande. Quando abriu a janela, viu o ceu cheio de nuvens escuras. Antes de terminar a leitura do texto, o que podemos imaginar que pode acontecer com o piquenique de Marina:\nA) O piquenique pode ser adiado por causa da chuva\nB) Marina vai dormir cedo\nC) O parque vai fechar para reforma\nD) Marina vai comprar um jornal",
    expect: q => q.textoApoio === "Marina estava muito animada para o piquenique no parque. Desde cedo, ela preparou os lanches e separou uma toalha bem grande. Quando abriu a janela, viu o ceu cheio de nuvens escuras." && q.enunciado?.startsWith("Antes de terminar a leitura do texto")
  },
  {
    id: "Simulado2-Q1",
    text: "QUESTAO 1 Observe o trecho a seguir e analise: Joao encontrou Ana que havia saido cedo para a escola depois de uma semana inteira dedicada aos estudos e aos ensaios da apresentacao. A professora escreveu no quadro: Vamos comer criancas! Considerando o contexto e a pontuacao errada da frase escrita, assinale a ordem correta para o uso da virgula na frase destacada.\nA) Vamos comer, criancas!\nB) Vamos, comer criancas!\nC) Vamos comer criancas!\nD) Vamos, comer, criancas!",
    expect: q => q.instrucao === "Observe o trecho a seguir e analise:" && q.textoApoio?.includes("que havia saido cedo para a escola depois de uma semana inteira dedicada aos estudos") && q.textoApoio?.includes("Vamos comer criancas!") && q.enunciado?.startsWith("Considerando o contexto") && q.alternativas?.length === 4
  },
  {
    id: "Simulado2-Q2",
    text: "QUESTAO 2 Leia o texto a seguir: A professora perguntou a turma qual era o sinal que mostrava uma pergunta. Pedro respondeu em voz alta: Eu sei professora. Disponivel em: https://exemplo.com/charadinha. Depois da resposta do estudante Pedro, a professora faz uma charadinha. Qual sinal de pontuacao precisa estar ao lado da fala dela?\nA) Ponto final\nB) Ponto de exclamacao\nC) Virgula\nD) Ponto de interrogacao",
    expect: q => q.instrucao === "Leia o texto a seguir:" && q.textoApoio?.includes("Pedro respondeu em voz alta") && q.fonteTextoApoio?.startsWith("Disponivel em:") && q.enunciado === "Depois da resposta do estudante Pedro, a professora faz uma charadinha. Qual sinal de pontuacao precisa estar ao lado da fala dela?" && q.alternativas?.length === 4 && q.alternativas?.[3]?.texto === "Ponto de interrogacao"
  },
  {
    id: "Simulado2-Q3",
    text: "QUESTAO 3 Leia a frase a seguir: Maria sempre dizia: \"A vida e como uma caixa de surpresas... voce nunca sabe o que vai encontrar\" (e ela tinha razao).\n5o ANO - LINGUA PORTUGUESA E MATEMATICA | Pagina 2\nA) A frase apresenta comparacao e reticencias.\nB) A frase apresenta apenas ponto final.\nC) A frase nao apresenta pontuacao.\nD) A frase apresenta somente interrogacao.",
    expect: q => q.instrucao === "Leia a frase a seguir:" && q.textoApoio === "Maria sempre dizia: \"A vida e como uma caixa de surpresas... voce nunca sabe o que vai encontrar\" (e ela tinha razao)." && !/Pagina 2|LINGUA PORTUGUESA/.test(q.enunciado || "") && q.enunciado && q.alternativas?.length === 4
  },
  {
    id: "Q4",
    text: "QUESTAO 4 Leia o texto e responda a pergunta: O Coelho e a Tartaruga. Era uma vez uma tartaruga que desafiou um coelho para uma corrida. [imagem aqui] Disponivel em: https://br.freepik.com/vetores-gratis/coelhoe-\ntartaruga-na-corrida_4906493.htm#fromView=search&page=1&position=0&uuid=abc&query=imagem+do+da+lebre+e+a+tartaruga. No dia da corrida, o coelho saiu na frente, mas parou para descansar. A tartaruga continuou caminhando devagar e venceu. Qual das seguintes opcoes apresenta a moral da historia?\nA) Coelho\nB) Tartaruga\nC) Raposa\nD) Leao",
    expect: q => q.textoApoio?.includes("O Coelho") && q.textoApoio?.includes("A tartaruga continuou caminhando devagar e venceu.") && q.imagemApoio === "[imagem aqui]" && q.fonteImagemApoio?.includes("Disponivel em:") && q.enunciado?.startsWith("Qual das seguintes")
  },
  {
    id: "Q6-revista-sitio",
    text: "QUESTAO 6 Leia o texto abaixo: A turma do Picapau Amarelo entrou no sitio em festa. Emilia perguntou a Narizinho onde estava o Visconde. Revista Sítio do Picapau Amarelo. Ano 9, março, 2003. p.15. De acordo com o texto, Emilia queria saber\nA) onde estava o Visconde\nB) onde estava Pedrinho\nC) onde estava Dona Benta\nD) onde estava Tia Anastacia",
    expect: q => q.textoApoio?.includes("A turma do Picapau Amarelo") && q.fonteTextoApoio === "Revista Sítio do Picapau Amarelo. Ano 9, março, 2003. p.15." && !q.fonteImagemApoio && q.enunciado?.startsWith("De acordo")
  },
  {
    id: "Q7",
    text: "QUESTAO 7 Leia atentamente as alternativas abaixo e marque a correta.\nA) Uma\nB) Duas\nC) Tres\nD) Quatro",
    expect: q => !q.instrucao && !q.textoApoio && q.enunciado?.startsWith("Leia atentamente")
  },
  {
    id: "Q8-jornal-narrativa-real",
    text: "QUESTAO 8 Leia o texto abaixo: Historias de Tia Anastacia Pedrinho, na varanda, lia um jornal. De repente parou e disse a Emilia, que andava rondando por ali: — Emilinha do coracao — disse ele — faca-me o maravilhoso favor de perguntar a vovo que coisa significa a palavra folclore, sim, teteia? Emilia foi e voltou com a resposta. A frase \"Emilia foi e voltou com a resposta\", foi dita:\nA) Por Pedrinho\nB) Por Emilia\nC) Pelo narrador\nD) Pela vovo",
    expect: q => q.textoApoio?.startsWith("Historias de Tia Anastacia") && q.textoApoio?.includes("lia um jornal") && q.textoApoio?.includes("que coisa significa a palavra folclore") && q.textoApoio?.endsWith("Emilia foi e voltou com a resposta.") && !q.fonteTextoApoio && !q.fonteImagemApoio && q.enunciado?.startsWith("A frase")
  },
  {
    id: "Q11",
    text: "QUESTAO 11 Leia o texto e responda a pergunta: [imagem aqui] Alexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3. De acordo com Armandinho, o gosto do bolo ficou\nA) ruim\nB) bom\nC) doce\nD) salgado",
    expect: q => q.imagemApoio === "[imagem aqui]" && !q.textoApoio && !q.fonteTextoApoio && q.fonteImagemApoio === "Alexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3." && q.enunciado?.startsWith("De acordo")
  },
  {
    id: "Q11-fonte-sem-apoio-com-imagem",
    text: "QUESTAO 11\nObserve a tirinha.\n[imagem aqui]\nAlexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3.\nDe acordo com Armandinho, o personagem esta\nA) feliz\nB) bravo\nC) cansado\nD) confuso",
    expect: q => q.imagemApoio === "[imagem aqui]" && !q.textoApoio && !q.fonteTextoApoio && q.fonteImagemApoio === "Alexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3." && q.enunciado?.startsWith("De acordo")
  },
  {
    id: "Q12",
    text: "QUESTAO 12 Leia as frases abaixo e marque a alternativa correta.\nA) Uma\nB) Duas\nC) Tres\nD) Quatro",
    expect: q => !q.instrucao && !q.textoApoio && q.enunciado?.startsWith("Leia as frases")
  },
  {
    id: "Q16",
    text: "QUESTAO 16 Leia as alternativas abaixo e assinale a que apresenta pontuacao correta.\nA) Uma\nB) Duas\nC) Tres\nD) Quatro",
    expect: q => !q.instrucao && !q.textoApoio && q.enunciado?.startsWith("Leia as alternativas")
  },
  {
    id: "Q9",
    text: "QUESTAO 9 Leia o trecho abaixo: A menina guardou o bilhete na mochila. O GLOBO. Rio de Janeiro, 12 mar. 2014. No trecho, a palavra bilhete indica\nA) Carta curta\nB) Livro\nC) Receita\nD) Convite",
    expect: q => q.fonteTextoApoio?.includes("O GLOBO") && q.enunciado?.startsWith("No trecho")
  },
  {
    id: "Q14",
    text: "QUESTAO 14 Leia o texto a seguir: Historias de Tia Anastacia. Tia Anastacia contava casos antigos para as criancas. Todos ficavam em silencio para ouvir. Durante a leitura, percebe-se que as criancas estavam\nA) Barulho\nB) Calma\nC) Correria\nD) Festa",
    expect: q => q.textoApoio?.includes("Historias de Tia Anastacia") && q.enunciado?.startsWith("Durante a leitura")
  },
  {
    id: "Q17",
    text: "QUESTAO 17 Leia o texto abaixo: A escolinha do mar. Os peixinhos aprenderam a nadar em fila. No trecho acima, a expressao \"nadar em fila\" indica que eles\nA) seguiam ordem\nB) brincavam\nC) fugiam\nD) dormiam",
    expect: q => q.textoApoio?.includes("A escolinha do mar") && q.enunciado?.startsWith("No trecho acima")
  },
  {
    id: "Q21",
    text: "QUESTAO 21 A escolinha do mar ficava no fundo do oceano. O mestre Villa-Peixes perguntava aos alunos: Os homens nao vao a Lua? E o maestro Villa-Peixes ensina aos alunos lindas cancoes: — \"Como pode o peixe vivo viver fora d' agua fria...\" ROCHA, Ruth. A Escolinha do Mar. Sao Paulo: Salamandra, 2009. De acordo com esse texto, o maestro Villa-Peixes ensina aos alunos\nA) lindas cancoes\nB) calculos\nC) mapas\nD) receitas",
    expect: q => q.textoApoio?.includes("Os homens nao vao a Lua?") && q.textoApoio?.includes("E o maestro Villa-Peixes ensina") && q.textoApoio?.includes("Como pode o peixe vivo viver fora d' agua fria") && q.fonteTextoApoio === "ROCHA, Ruth. A Escolinha do Mar. Sao Paulo: Salamandra, 2009." && q.enunciado?.startsWith("De acordo")
  },
  {
    id: "Q22",
    text: "QUESTAO 22 Porquinho-da-india Quando eu tinha seis anos ganhei um porquinho-da-india. Que dor de coracao me dava porque o bichinho so queria estar debaixo do fogao! BANDEIRA, Manuel. Porquinho-da-india. In: Libertinagem e Estrela da Manha. Na frase \"Nao fazia caso nenhum das minhas ternurinhas\", o menino quer dizer que o porquinho:\nA) nao ligava para ele\nB) gostava dele\nC) falava muito\nD) corria sempre",
    expect: q => q.textoApoio?.includes("Porquinho-da-india") && q.fonteTextoApoio?.includes("BANDEIRA, Manuel") && q.enunciado?.startsWith("Na frase")
  },
  {
    id: "Q23",
    text: "QUESTAO 23 Pulgas As pulgas sao insetos muito pequenos que se alimentam do sangue de animais. Elas pulam rapidamente de um lugar para outro. No trecho, a palavra grifada significa:\nA) saltam\nB) dormem\nC) comem\nD) desaparecem",
    expect: q => q.textoApoio?.startsWith("Pulgas") && q.enunciado?.startsWith("No trecho")
  },
  {
    id: "Q24",
    text: "E DESENVOLVIMENTO PROFISSIONAL\nEDUCACAO\nQUESTAO 24 Leia o texto abaixo e responda a questao. [imagem aqui] O GLOBO. O Menino Maluquinho. Agosto de 2002. Qual o sentido da palavra BATERIA usada pelo personagem?\nA) Instrumento musical\nB) Conjunto de pilhas\nC) Cansaco\nD) Sequencia de perguntas",
    expect: q => q.instrucao === "Leia o texto abaixo e responda a questao." && q.imagemApoio === "[imagem aqui]" && !q.textoApoio && q.tituloTextoApoio !== "E DESENVOLVIMENTO PROFISSIONAL" && !q.fonteTextoApoio && q.fonteImagemApoio === "O GLOBO. O Menino Maluquinho. Agosto de 2002." && q.enunciado?.startsWith("Qual o sentido da palavra BATERIA") && q.alternativas?.length === 4
  },
  {
    id: "Q24-o-globo-imagem",
    text: "QUESTAO 24\nObserve a imagem.\n[imagem aqui]\nO GLOBO. O Menino Maluquinho. Agosto de 2002.\nQual o sentido da palavra BATERIA no quadrinho?\nA) Instrumento musical\nB) Conjunto de pilhas\nC) Prova longa\nD) Brinquedo",
    expect: q => q.imagemApoio === "[imagem aqui]" && !q.textoApoio && !q.fonteTextoApoio && q.fonteImagemApoio === "O GLOBO. O Menino Maluquinho. Agosto de 2002." && q.enunciado?.startsWith("Qual o sentido da palavra BATERIA")
  },
  {
    id: "Q24-sem-ocr",
    text: "QUESTAO 24 Leia o texto abaixo e responda a questao. [imagem aqui]\nA) Instrumento musical\nB) Conjunto de pilhas\nC) Cansaco\nD) Sequencia de perguntas",
    expect: q => q.instrucao === "Leia o texto abaixo e responda a questao." && q.imagemApoio === "[imagem aqui]" && q.enunciado && q.alternativas?.length === 4
  }
];

const cleanedImportText = cleanTextoImportado([
  "QUESTAO 11",
  "Observe a tirinha.",
  "Alexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3.",
  "QUESTAO 24",
  "O GLOBO. O Menino Maluquinho. Agosto de 2002."
].join("\n"));
if (!cleanedImportText.includes("Alexandre Beck. Folha de S.Paulo, 5 abr. 2014. Folhinha, p. 3.")) {
  throw new Error("cleanTextoImportado removeu a fonte curta de Q11.");
}
if (!cleanedImportText.includes("O GLOBO. O Menino Maluquinho. Agosto de 2002.")) {
  throw new Error("cleanTextoImportado removeu a fonte curta de Q24.");
}

assert(
  inferPdfImagePageFromObjectName('Unable to decode image "img_p5_1"') === 6,
  "img_p5_1 deve ser associado a paginaOrigem 6."
);
const cleanedImageEvidencePage = cleanPdfText([{
  page: 6,
  hasImage: true,
  text: [
    "QUESTAO 11",
    "De acordo com Armandinho, o personagem esta",
    "A) feliz",
    "B) bravo",
    "C) cansado",
    "D) confuso"
  ].join("\n")
}]);
assert(
  cleanedImageEvidencePage.text.includes("[imagem aqui]"),
  "paginaOrigem 6 com evidencia de imagem deve receber marcador [imagem aqui]."
);

const cleanedRightImageSource = cleanPdfText([{
  page: 4,
  hasImage: true,
  text: [
    "QUESTAO 4",
    "Leia o texto abaixo.",
    "O Coelho e a Tartaruga iniciou uma corrida no bosque.",
    "Disponivel em: https://imagem.example/coelho-tartaruga.png",
    "A tartaruga continuou caminhando devagar ate vencer a prova.",
    "Qual das seguintes opcoes apresenta a moral da historia?",
    "A) Devagar tambem se chega",
    "B) Correr sempre resolve",
    "C) Dormir ajuda na corrida",
    "D) Nao houve corrida"
  ].join("\n"),
  layoutRows: [
    { text: "QUESTAO 4", minX: 70, maxX: 130, fontSize: 11 },
    { text: "Leia o texto abaixo.", minX: 70, maxX: 210, fontSize: 11 },
    { text: "O Coelho e a Tartaruga iniciou uma corrida no bosque.", minX: 70, maxX: 350, fontSize: 11 },
    { text: "Disponivel em: https://imagem.example/coelho-tartaruga.png", minX: 410, maxX: 560, fontSize: 7 },
    { text: "A tartaruga continuou caminhando devagar ate vencer a prova.", minX: 70, maxX: 360, fontSize: 11 },
    { text: "Qual das seguintes opcoes apresenta a moral da historia?", minX: 70, maxX: 390, fontSize: 11 }
  ]
}]);
assert(
  cleanedRightImageSource.text.includes("[imagem aqui]\nDisponivel em:"),
  "fonte visual a direita deve receber marcador de imagem antes da fonte."
);
const rightImageSourceQuestion = parseOne(cleanedRightImageSource.text);
assert(
  rightImageSourceQuestion.textoApoio?.includes("O Coelho e a Tartaruga") &&
    rightImageSourceQuestion.textoApoio?.includes("A tartaruga continuou caminhando devagar ate vencer a prova.") &&
    rightImageSourceQuestion.imagemApoio === "[imagem aqui]" &&
    rightImageSourceQuestion.fonteImagemApoio?.startsWith("Disponivel em:") &&
    !rightImageSourceQuestion.fonteTextoApoio &&
    rightImageSourceQuestion.enunciado?.startsWith("Qual das seguintes"),
  `fonte visual a direita deve virar fonteImagemApoio preservando narrativa: ${JSON.stringify(rightImageSourceQuestion)}`
);

const cleanedBoxLayout = cleanPdfText([{
  page: 7,
  hasImage: true,
  text: [
    "QUESTAO 7",
    "Leia o texto a seguir:",
    "Considerando as informacoes do texto, qual atitude do personagem foi correta?",
    "Pedro organizou os livros da biblioteca antes da aula.",
    "Disponivel em: https://imagem.example/biblioteca.png",
    "A) Guardar os livros",
    "B) Rasgar os livros",
    "C) Esconder a biblioteca",
    "D) Dormir durante a aula"
  ].join("\n"),
  supportBoxes: [{ x: 60, y: 500, width: 500, height: 95 }],
  layoutRows: [
    { text: "QUESTAO 7", minX: 60, maxX: 130, y: 650, fontSize: 11 },
    { text: "Leia o texto a seguir:", minX: 60, maxX: 220, y: 620, fontSize: 11 },
    { text: "Considerando as informacoes do texto, qual atitude do personagem foi correta?", minX: 60, maxX: 520, y: 470, fontSize: 11 },
    { text: "Pedro organizou os livros da biblioteca antes da aula.", minX: 80, maxX: 360, y: 565, fontSize: 11 },
    { text: "Disponivel em: https://imagem.example/biblioteca.png", minX: 400, maxX: 545, y: 520, fontSize: 7 },
    { text: "A) Guardar os livros", minX: 60, maxX: 210, y: 430, fontSize: 11 }
  ]
}]);
const boxedQuestion = parseOne(cleanedBoxLayout.text);
assert(
  boxedQuestion.instrucao === "Leia o texto a seguir:" &&
    boxedQuestion.textoApoio === "Pedro organizou os livros da biblioteca antes da aula." &&
    boxedQuestion.imagemApoio === "[imagem aqui]" &&
    boxedQuestion.fonteImagemApoio?.startsWith("Disponivel em:") &&
    boxedQuestion.enunciado?.startsWith("Considerando as informacoes do texto") &&
    boxedQuestion.alternativas?.length === 4,
  `caixa visual deve separar acima/dentro/abaixo sem perder imagem/fonte: ${JSON.stringify(boxedQuestion)}`
);

const sharedBlockResult = organizarQuestoesParaRevisao([
  "Leia o texto e responda as questoes 16 e 17.",
  "A biblioteca da escola recebeu novos livros de ciencias. Os alunos organizaram uma exposicao para apresentar as obras aos colegas.",
  "QUESTAO 16",
  "De acordo com o texto, o que a escola recebeu?",
  "A) Novos livros",
  "B) Novas carteiras",
  "C) Novos uniformes",
  "D) Novas bolas",
  "QUESTAO 17",
  "Qual foi a atitude dos alunos?",
  "A) Organizaram uma exposicao",
  "B) Fecharam a biblioteca",
  "C) Rasgaram os livros",
  "D) Cancelaram a aula"
].join("\n"), ctx);
assert(
  sharedBlockResult.possuiBlocoCompartilhado &&
    sharedBlockResult.textoBaseDetectado?.includes("A biblioteca da escola") &&
    sharedBlockResult.questions.length === 2 &&
    sharedBlockResult.questions.every(question => question.blocoId && question.blocoId === sharedBlockResult.questions[0].blocoId) &&
    sharedBlockResult.questions.every(question => question.blocoTextoApoio?.includes("A biblioteca da escola")),
  `parser deve detectar bloco compartilhado automaticamente: ${JSON.stringify(sharedBlockResult)}`
);

const persistedQuestion = buildQuestionRecord({
  tipo: "multipla_texto",
  anoEscolar: "5",
  disciplina: "ciencias",
  instrucao: "Observe a imagem.",
  textoApoio: "Texto principal recuperado.",
  fonteTextoApoio: "Fonte do texto.",
  imagemApoio: "[imagem aqui]",
  fonteImagemApoio: "Disponivel em: https://imagem.example/recurso.png",
  enunciado: "O que a imagem mostra?",
  alternativas: ["Uma planta", "Uma rocha", "Um rio", "Uma estrela"],
  respostaCorreta: 0,
  paginaOrigem: 6,
  imagemProvavel: true
}, { uid: "prof-1", nome: "Professora Teste" });
assert(
  persistedQuestion.instrucao === "Observe a imagem." &&
    persistedQuestion.textoApoio === "Texto principal recuperado." &&
    persistedQuestion.fonteTextoApoio === "Fonte do texto." &&
    persistedQuestion.imagemApoio === "[imagem aqui]" &&
    persistedQuestion.fonteImagemApoio?.includes("imagem.example") &&
    persistedQuestion.enunciado === "O que a imagem mostra?" &&
    persistedQuestion.alternativas.length === 4 &&
    persistedQuestion.paginaOrigem === 6 &&
    persistedQuestion.imagemProvavel === true &&
    persistedQuestion.recurso.imagem === "[imagem aqui]",
  `buildQuestionRecord deve persistir campos novos do importador: ${JSON.stringify(persistedQuestion)}`
);
const normalizedPersistedQuestion = normalizeLegacyQuestion({ id: "q1", ...persistedQuestion });
assert(
  normalizedPersistedQuestion.instrucao === persistedQuestion.instrucao &&
    normalizedPersistedQuestion.fonteTextoApoio === persistedQuestion.fonteTextoApoio &&
    normalizedPersistedQuestion.imagemApoio === persistedQuestion.imagemApoio &&
    normalizedPersistedQuestion.fonteImagemApoio === persistedQuestion.fonteImagemApoio &&
    normalizedPersistedQuestion.paginaOrigem === 6 &&
    normalizedPersistedQuestion.imagemProvavel === true,
  `normalizeLegacyQuestion deve reabrir campos novos salvos: ${JSON.stringify(normalizedPersistedQuestion)}`
);

const failures = [];
for (const item of cases) {
  const question = parseOne(item.text);
  try {
    assert(item.expect(question), `${item.id} falhou: ${JSON.stringify({
      instrucao: question.instrucao,
      textoApoio: question.textoApoio,
      imagemApoio: question.imagemApoio,
      imagemProvavel: question.imagemProvavel,
      fonteTextoApoio: question.fonteTextoApoio,
      fonteImagemApoio: question.fonteImagemApoio,
      enunciado: question.enunciado
    })}`);
    assert(!forbiddenInContent.test(question.textoApoio || ""), `${item.id} vazou fonte para textoApoio: ${question.textoApoio}`);
    assert(!forbiddenInContent.test(question.enunciado || ""), `${item.id} vazou fonte para enunciado: ${question.enunciado}`);
    if (!question.textoApoio && (question.imagemApoio || question.imagemProvavel)) {
      assert(!question.fonteTextoApoio, `${item.id} manteve fonteTextoApoio sem textoApoio em questao com imagem: ${question.fonteTextoApoio}`);
    }
  } catch (error) {
    failures.push(error.message);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`OK ${cases.length} regressoes sinteticas de PDF`);
