// ============================================
// SCRIPT JS - Painel do Professor
// ============================================

const firebaseConfig = {
  projectId: "plataforma-escolar-71635",
  authDomain: "plataforma-escolar-71635.firebaseapp.com",
  appId: "1:194897243209:web:ff339bee22bced4098e398"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.role !== 'professor') {
  window.location.href = 'index.html';
}

let turmaAtualId = null;
let questoesTemp = [];
let respostaAbertaId = null;
let resumoCorrecaoAtual = null;

function mostrarErro(mensagem, erro) {
  console.error(mensagem, erro || "");
  alert(mensagem);
}

function criarBotao(texto, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = texto;
  button.onclick = onClick;
  return button;
}

function criarImagem(src, largura) {
  const img = document.createElement("img");
  img.src = src;
  img.style.maxWidth = largura;
  return img;
}

function limparContainerPreview(id) {
  const container = document.getElementById(id);
  if (!container) return null;
  container.innerHTML = "";
  return container;
}

function criarCardPreview(rotulo, src, largura) {
  const card = document.createElement("div");
  card.className = "item-preview";

  const titulo = document.createElement("div");
  titulo.textContent = rotulo;
  card.appendChild(titulo);

  const img = criarImagem(src, largura);
  img.onerror = function () {
    card.innerHTML = "";
    const rotuloErro = document.createElement("div");
    rotuloErro.textContent = rotulo;
    card.appendChild(rotuloErro);

    const aviso = document.createElement("div");
    aviso.className = "aviso-preview";
    aviso.textContent = "Imagem não carregou. Verifique o link.";
    card.appendChild(aviso);
  };

  card.appendChild(img);
  return card;
}

function criarAvisoPreview(texto) {
  const aviso = document.createElement("div");
  aviso.className = "aviso-preview";
  aviso.textContent = texto;
  return aviso;
}

function atualizarPreviewImagens() {
  const container = limparContainerPreview("previewImagensPergunta");
  if (!container) return;

  const imagensEl = document.getElementById("imagens");
  const links = (imagensEl.value || "")
    .split("\n")
    .map(i => i.trim())
    .filter(i => i !== "");

  if (links.length === 0) {
    container.appendChild(criarAvisoPreview("As imagens da pergunta aparecerão aqui automaticamente."));
    return;
  }

  links.forEach((src, index) => {
    container.appendChild(criarCardPreview(`Imagem ${index + 1}`, src, "180px"));
  });
}

function atualizarPreviewAlternativas() {
  const container = limparContainerPreview("previewAlternativasImg");
  if (!container) return;

  const alternativasImgEl = document.getElementById("alternativasImg");
  const links = (alternativasImgEl.value || "")
    .split("\n")
    .map(i => i.trim())
    .filter(i => i !== "");

  if (links.length === 0) {
    container.appendChild(criarAvisoPreview("As alternativas com imagem aparecerão aqui automaticamente."));
    return;
  }

  const letras = ["A", "B", "C", "D"];
  links.forEach((src, index) => {
    container.appendChild(criarCardPreview(`Alternativa ${letras[index] || index + 1}`, src, "150px"));
  });
}

async function criarTurma() {
  const nome = prompt("Nome da turma:");
  const nomeLimpo = nome ? nome.trim() : "";

  if (!nomeLimpo) return;

  try {
    await db.collection("turmas").add({
      nome: nomeLimpo,
      alunos: [],
      provas: [],
      criadoPor: usuario.uid
    });
    carregarTurmas();
  } catch (erro) {
    mostrarErro("Erro ao criar turma", erro);
  }
}

async function carregarTurmas() {
  listaTurmas.innerHTML = "";

  try {
    const snapshot = await db.collection("turmas")
      .where("criadoPor", "==", usuario.uid)
      .get();

    snapshot.forEach(doc => {
      const turma = doc.data();
      const li = document.createElement("li");
      const nome = document.createElement("span");

      nome.textContent = turma.nome || "Turma sem nome";
      li.appendChild(nome);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(criarBotao("Abrir", () => abrirTurma(doc.id)));
      li.appendChild(document.createTextNode(" "));
      li.appendChild(criarBotao("Excluir", () => excluirTurma(doc.id))));

      listaTurmas.appendChild(li);
    });
  } catch (erro) {
    mostrarErro("Erro ao carregar turmas", erro);
  }
}

async function abrirTurma(id) {
  turmaAtualId = id;
  areaAtribuicao.innerHTML = "";

  try {
    const doc = await db.collection("turmas").doc(id).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const turma = doc.data();
    tituloTurma.innerText = turma.nome || "Turma sem nome";
    areaTurma.style.display = "block";

    renderAlunos(turma.alunos || []);
    carregarProvasDaTurma();
  } catch (erro) {
    mostrarErro("Erro ao abrir turma", erro);
  }
}

async function excluirTurma(id) {
  if (!confirm("Excluir turma?")) return;

  try {
    await db.collection("turmas").doc(id).delete();

    if (turmaAtualId === id) {
      areaTurma.style.display = "none";
      areaAtribuicao.innerHTML = "";
      turmaAtualId = null;
    }

    carregarTurmas();
  } catch (erro) {
    mostrarErro("Erro ao excluir turma", erro);
  }
}

async function adicionarAluno() {
  if (!turmaAtualId) {
    alert("Abra uma turma primeiro");
    return;
  }

  const nome = nomeAluno.value.trim();
  const senha = senhaAluno.value.trim();

  if (!nome || !senha) {
    alert("Preencha nome e senha");
    return;
  }

  try {
    const doc = await db.collection("turmas").doc(turmaAtualId).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const turma = doc.data();
    const alunos = turma.alunos || [];
    alunos.push({ nome, senha });

    await db.collection("turmas").doc(turmaAtualId).update({ alunos });

    nomeAluno.value = "";
    senhaAluno.value = "";
    renderAlunos(alunos);

    criarContaAluno(nome, senha);
  } catch (erro) {
    mostrarErro("Erro ao adicionar aluno", erro);
  }
}

async function criarContaAluno(nome, senha) {
  try {
    const email = `${nome}@plataforma.app`;
    const userCred = await firebase.auth().createUserWithEmailAndPassword(email, senha);
    const uid = userCred.user.uid;

    await db.collection("users").doc(uid).set({
      nome: nome,
      role: "aluno",
      turmaId: turmaAtualId
    });
  } catch (erro) {
    if (erro.code !== 'auth/email-already-in-use') {
      console.error("Erro ao criar conta Firebase:", erro);
    }
  }
}

function renderAlunos(alunos) {
  listaAlunos.innerHTML = "";

  alunos.forEach((aluno, index) => {
    const li = document.createElement("li");
    const nome = document.createElement("span");

    nome.textContent = aluno.nome || "Aluno sem nome";
    li.appendChild(nome);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(criarBotao("Remover", () => removerAluno(index)));

    listaAlunos.appendChild(li);
  });
}

async function removerAluno(index) {
  if (!turmaAtualId) {
    alert("Abra uma turma primeiro");
    return;
  }

  try {
    const doc = await db.collection("turmas").doc(turmaAtualId).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const turma = doc.data();
    const alunos = turma.alunos || [];

    if (index < 0 || index >= alunos.length) {
      alert("Aluno inválido");
      return;
    }

    alunos.splice(index, 1);

    await db.collection("turmas").doc(turmaAtualId).update({ alunos });
    renderAlunos(alunos);
  } catch (erro) {
    mostrarErro("Erro ao remover aluno", erro);
  }
}

function abrirCriacao() {
  const areaProvaEl = document.getElementById("areaProva");
  areaProvaEl.style.display = "block";
  atualizarResumoQuestoes();
  atualizarTipoQuestao();
  atualizarTipoAlternativa();
  renderQuestoesCriadas();
}

function adicionarQuestao() {
  const tipo = tipoQuestao.value;
  const textoAntesVal = textoAntes.value;
  const perguntaVal = pergunta.value.trim();

  if (!perguntaVal) {
    alert("Digite a pergunta");
    return;
  }

  let alternativas = [];
  let corretaResposta = null;

  if (tipo === "multipla") {
    const fonte = (tipoAlternativa.value === "imagem")
      ? (alternativasImg.value || "")
      : (alternativas.value || "");

    alternativas = fonte
      .split("\n")
      .map(a => a.trim())
      .filter(a => a !== "");

    if (alternativas.length < 2) {
      alert("Digite pelo menos 2 alternativas");
      return;
    }

    corretaResposta = Number(correta.value);

    if (Number.isNaN(corretaResposta) || corretaResposta < 0 || corretaResposta >= alternativas.length) {
      alert("Escolha uma resposta correta válida");
      return;
    }
  }

  const imgs = imagens.value
    .split("\n")
    .map(i => i.trim())
    .filter(i => i !== "");

  const q = {
    tipo,
    textoAntes: textoAntesVal,
    pergunta: perguntaVal,
    alternativas,
    correta: corretaResposta,
    imagens: imgs,
    tipoAlt: tipoAlternativa.value
  };

  questoesTemp.push(q);
  limparCampos();
  renderQuestoesCriadas();
}

function atualizarResumoQuestoes() {
  const resumo = document.getElementById("resumoQuestoes");
  if (!resumo) return;

  if (questoesTemp.length === 0) {
    resumo.textContent = "Nenhuma questão adicionada ainda.";
    return;
  }

  const texto = questoesTemp.length === 1
    ? "1 questão pronta para a prova."
    : `${questoesTemp.length} questões prontas para a prova.`;

  resumo.textContent = texto;
}

function excluirQuestao(index) {
  if (index < 0 || index >= questoesTemp.length) return;
  questoesTemp.splice(index, 1);
  renderQuestoesCriadas();
}

function renderQuestoesCriadas() {
  const lista = document.getElementById("listaQuestoes");
  if (!lista) return;

  lista.innerHTML = "";
  atualizarResumoQuestoes();

  const letras = ["A", "B", "C", "D"];

  questoesTemp.forEach((q, index) => {
    const li = document.createElement("li");

    const cabecalho = document.createElement("div");
    cabecalho.style.display = "flex";
    cabecalho.style.justifyContent = "space-between";
    cabecalho.style.alignItems = "center";
    cabecalho.style.gap = "12px";
    cabecalho.style.marginBottom = "10px";

    const titulo = document.createElement("strong");
    titulo.textContent = `Questão ${index + 1}`;
    cabecalho.appendChild(titulo);

    const botaoExcluir = criarBotao("Excluir questão", () => excluirQuestao(index));
    cabecalho.appendChild(botaoExcluir);

    li.appendChild(cabecalho);

    if (q.textoAntes) {
      const apoio = document.createElement("div");
      apoio.innerHTML = `<i>${q.textoAntes.replace(/\n/g, "<br>")}</i>`;
      li.appendChild(apoio);
      li.appendChild(document.createElement("br"));
    }

    const perguntaEl = document.createElement("div");
    perguntaEl.innerHTML = `<b>${q.pergunta.replace(/\n/g, "<br>")}</b>`;
    li.appendChild(perguntaEl);
    li.appendChild(document.createElement("br"));

    (q.imagens || []).forEach(img => {
      li.appendChild(criarImagem(img, "200px"));
      li.appendChild(document.createElement("br"));
    });

    if (q.tipo === "multipla") {
      q.alternativas.forEach((alt, i) => {
        const linha = document.createElement("div");

        if (q.tipoAlt === "imagem") {
          linha.textContent = `(${letras[i]})`;
          li.appendChild(linha);
          li.appendChild(criarImagem(alt, "150px"));
        } else {
          linha.textContent = `(${letras[i]}) ${alt}`;
          li.appendChild(linha);
        }
      });

      const corretaPreviewEl = document.createElement("div");
      corretaPreviewEl.style.marginTop = "8px";
      corretaPreviewEl.textContent = `Resposta correta: (${letras[q.correta] || "?"})`;
      li.appendChild(corretaPreviewEl);
    } else {
      const discursiva = document.createElement("i");
      discursiva.textContent = "Resposta escrita pelo aluno.";
      li.appendChild(document.createElement("br"));
      li.appendChild(discursiva);
    }

    lista.appendChild(li);
  });
}

async function salvarProva() {
  const nome = nomeProva.value.trim();
  const ano = anoProva.value;

  if (!nome) {
    alert("Digite o nome da prova");
    return;
  }

  if (!ano) {
    alert("Selecione o ano da prova");
    return;
  }

  if (questoesTemp.length === 0) {
    alert("Adicione pelo menos uma questão");
    return;
  }

  try {
    await db.collection("simulados").add({
      nome,
      ano,
      questoes: questoesTemp,
      criadoPor: usuario.uid
    });

    alert("Prova salva!");

    areaProva.style.display = "none";
    listaQuestoes.innerHTML = "";
    nomeProva.value = "";
    anoProva.value = "";
    questoesTemp = [];
    limparCampos();
    atualizarResumoQuestoes();
  } catch (erro) {
    mostrarErro("Erro ao salvar prova", erro);
  }
}

atualizarResumoQuestoes();

function limparCampos() {
  pergunta.value = "";
  textoAntes.value = "";
  alternativas.value = "";
  alternativasImg.value = "";
  imagens.value = "";
  atualizarPreviewImagens();
  atualizarPreviewAlternativas();
}

async function filtrarAno(ano) {
  listaProvas.innerHTML = "";

  try {
    const snapshot = await db.collection("simulados")
      .where("ano", "==", ano)
      .where("criadoPor", "==", usuario.uid)
      .get();

    snapshot.forEach(doc => {
      const prova = doc.data();
      const li = document.createElement("li");
      const nome = document.createElement("span");

      nome.textContent = `Prova: ${prova.nome || "Sem nome"}`;
      li.appendChild(nome);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(criarBotao("Abrir", () => abrirProva(doc.id))));

      listaProvas.appendChild(li);
    });
  } catch (erro) {
    mostrarErro("Erro ao filtrar provas", erro);
  }
}

async function abrirProva(id) {
  try {
    const doc = await db.collection("simulados").doc(id).get();

    if (!doc.exists) {
      mostrarErro("Prova não encontrada");
      return;
    }

    const prova = doc.data();
    const letras = ["A", "B", "C", "D"];

    visualizarProva.innerHTML = "";

    const titulo = document.createElement("h3");
    titulo.textContent = prova.nome || "Prova sem nome";
    visualizarProva.appendChild(titulo);

    (prova.questoes || []).forEach((q, index) => {
      const bloco = document.createElement("div");
      bloco.style.marginBottom = "15px";

      if (q.textoAntes) {
        const apoio = document.createElement("div");
        apoio.innerHTML = `<i>${q.textoAntes.replace(/\n/g, "<br>")}</i>`;
        bloco.appendChild(apoio);
        bloco.appendChild(document.createElement("br"));
      }

      const perguntaEl = document.createElement("div");
      perguntaEl.innerHTML = `<b>${index + 1}) ${String(q.pergunta || "").replace(/\n/g, "<br>")}</b>`;
      bloco.appendChild(perguntaEl);
      bloco.appendChild(document.createElement("br"));

      (q.imagens || []).forEach(img => {
        bloco.appendChild(criarImagem(img, "200px"));
        bloco.appendChild(document.createElement("br"));
      });

      if (q.alternativas && q.alternativas.length > 0) {
        q.alternativas.forEach((alt, i) => {
          const linha = document.createElement("div");

          if (q.tipoAlt === "imagem") {
            linha.textContent = `(${letras[i]})`;
            bloco.appendChild(linha);
            bloco.appendChild(criarImagem(alt, "150px"));
          } else {
            linha.textContent = `(${letras[i]}) ${alt}`;
            bloco.appendChild(linha);
          }
        });

        const corretaEl = document.createElement("div");
        corretaEl.textContent = `Correta: (${letras[q.correta] || "?"})`;
        bloco.appendChild(document.createElement("br"));
        bloco.appendChild(corretaEl);
      } else {
        const discursiva = document.createElement("i");
        discursiva.textContent = "Resposta discursiva";
        bloco.appendChild(discursiva);
      }

      visualizarProva.appendChild(bloco);
      visualizarProva.appendChild(document.createElement("hr"));
    });

    visualizarProva.appendChild(criarBotao("Excluir", () => excluirProva(id)));
    visualizarProva.style.display = "block";
  } catch (erro) {
    mostrarErro("Erro ao abrir prova", erro);
  }
}

async function excluirProva(id) {
  if (!confirm("Excluir prova?")) return;

  try {
    await db.collection("simulados").doc(id).delete();

    visualizarProva.style.display = "none";
    visualizarProva.innerHTML = "";
    listaProvas.innerHTML = "";
  } catch (erro) {
    mostrarErro("Erro ao excluir prova", erro);
  }
}

function abrirAtribuicao() {
  areaAtribuicao.innerHTML = `
    <button onclick="filtrarProvasAtribuicao('1')">1º</button>
    <button onclick="filtrarProvasAtribuicao('2')">2º</button>
    <button onclick="filtrarProvasAtribuicao('3')">3º</button>
    <button onclick="filtrarProvasAtribuicao('4')">4º</button>
    <button onclick="filtrarProvasAtribuicao('5')">5º</button>
    <div id="listaProvasAtribuicao"></div>
    <div id="provasDaTurma"></div>
  `;

  carregarProvasDaTurma();
}

async function filtrarProvasAtribuicao(ano) {
  const div = document.getElementById("listaProvasAtribuicao");
  div.innerHTML = "";

  try {
    const snapshot = await db.collection("simulados")
      .where("ano", "==", ano)
      .where("criadoPor", "==", usuario.uid)
      .get();

    snapshot.forEach(doc => {
      const linha = document.createElement("div");
      const nome = document.createElement("span");

      nome.textContent = doc.data().nome || "Prova sem nome";
      linha.appendChild(nome);
      linha.appendChild(document.createTextNode(" "));
      linha.appendChild(criarBotao("+", () => atribuirProva(doc.id)));

      div.appendChild(linha);
    });
  } catch (erro) {
    mostrarErro("Erro ao carregar provas para atribuição", erro);
  }
}

async function atribuirProva(idProva) {
  if (!turmaAtualId) {
    alert("Abra uma turma primeiro");
    return;
  }

  try {
    const doc = await db.collection("turmas").doc(turmaAtualId).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const turma = doc.data();
    const provas = turma.provas || [];

    if (!provas.includes(idProva)) {
      provas.push(idProva);
    }

    await db.collection("turmas").doc(turmaAtualId).update({ provas });
    carregarProvasDaTurma();
  } catch (erro) {
    mostrarErro("Erro ao atribuir prova", erro);
  }
}

async function carregarProvasDaTurma() {
  const area = document.getElementById("provasDaTurma");
  if (!area || !turmaAtualId) return;

  area.innerHTML = "<h4>Provas da turma</h4>";

  try {
    const doc = await db.collection("turmas").doc(turmaAtualId).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const turma = doc.data();
    const provas = turma.provas || [];

    if (provas.length === 0) {
      const vazio = document.createElement("div");
      vazio.textContent = "Nenhuma prova atribuída ainda.";
      area.appendChild(vazio);
      return;
    }

    provas.forEach(async (id) => {
      try {
        const provaDoc = await db.collection("simulados").doc(id).get();

        if (!provaDoc.exists) return;

        const linha = document.createElement("div");
        const nome = document.createElement("span");

        nome.textContent = provaDoc.data().nome || "Prova sem nome";
        linha.appendChild(nome);
        linha.appendChild(document.createTextNode(" "));
        linha.appendChild(criarBotao("Remover", () => removerProva(id)));

        area.appendChild(linha);
      } catch (erro) {
        console.error("Erro ao buscar prova da turma", erro);
      }
    });
  } catch (erro) {
    mostrarErro("Erro ao carregar provas da turma", erro);
  }
}

async function removerProva(idProva) {
  if (!turmaAtualId) {
    alert("Abra uma turma primeiro");
    return;
  }

  try {
    const doc = await db.collection("turmas").doc(turmaAtualId).get();

    if (!doc.exists) {
      mostrarErro("Turma não encontrada");
      return;
    }

    const provas = (doc.data().provas || []).filter(p => p !== idProva);

    await db.collection("turmas").doc(turmaAtualId).update({ provas });
    carregarProvasDaTurma();
  } catch (erro) {
    mostrarErro("Erro ao remover prova da turma", erro);
  }
}

function atualizarTipoQuestao() {
  blocoMultipla.style.display = (tipoQuestao.value === "texto") ? "none" : "block";
}

function atualizarTipoAlternativa() {
  if (tipoAlternativa.value === "imagem") {
    areaAltTexto.style.display = "none";
    areaAltImagem.style.display = "block";
  } else {
    areaAltTexto.style.display = "block";
    areaAltImagem.style.display = "none";
  }

  atualizarPreviewAlternativas();
}

async function carregarRespostas() {
  listaRespostas.innerHTML = "";
  visualizarResposta.style.display = "none";
  visualizarResposta.innerHTML = "";

  try {
    const snapshot = await db.collection("respostas")
      .orderBy("data", "desc")
      .get();

    if (snapshot.empty) {
      const li = document.createElement("li");
      li.textContent = "Nenhuma resposta enviada ainda.";
      listaRespostas.appendChild(li);
      return;
    }

    snapshot.forEach(doc => {
      const resposta = doc.data();
      const li = document.createElement("li");
      const resumo = document.createElement("span");

      resumo.textContent = `${resposta.aluno || "Aluno sem nome"} | ${resposta.prova || "Prova sem nome"}`;
      li.appendChild(resumo);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(criarBotao("Ver", () => abrirResposta(doc.id)));

      listaRespostas.appendChild(li);
    });
  } catch (erro) {
    mostrarErro("Erro ao carregar respostas", erro);
  }
}

async function abrirResposta(id) {
  try {
    const doc = await db.collection("respostas").doc(id).get();

    if (!doc.exists) {
      mostrarErro("Resposta não encontrada");
      return;
    }

    const resposta = doc.data();
    const respostasAluno = resposta.respostas || {};
    const provaId = resposta.provaId;
    const correcaoSalva = resposta.correcao || {};
    const notasDiscursivasSalvas = correcaoSalva.notasDiscursivas || {};

    if (!provaId) {
      mostrarErro("Essa resposta não possui vínculo com a prova original");
      return;
    }

    const provaDoc = await db.collection("simulados").doc(provaId).get();

    if (!provaDoc.exists) {
      mostrarErro("Prova original não encontrada para correção");
      return;
    }

    const prova = provaDoc.data();
    const questoes = prova.questoes || [];
    const letras = ["A", "B", "C", "D"];
    let acertos = 0;
    let objetivas = 0;
    let discursivas = 0;
    let somaDiscursivas = 0;

    respostaAbertaId = id;
    visualizarResposta.innerHTML = "";

    const titulo = document.createElement("h3");
    titulo.textContent = prova.nome || resposta.prova || "Resposta sem prova";
    visualizarResposta.appendChild(titulo);

    const meta = document.createElement("p");
    meta.textContent = `Aluno: ${resposta.aluno || "-"} | Turma: ${resposta.turma || "-"}`;
    visualizarResposta.appendChild(meta);

    if (questoes.length === 0) {
      const vazio = document.createElement("div");
      vazio.textContent = "Essa prova não possui questões para correção.";
      visualizarResposta.appendChild(vazio);
      visualizarResposta.style.display = "block";
      return;
    }

    questoes.forEach((q, i) => {
      const bloco = document.createElement("div");
      bloco.style.marginBottom = "16px";

      const tituloQuestao = document.createElement("b");
      tituloQuestao.textContent = `${i + 1}) ${q.pergunta || "Questão sem enunciado"}`;
      bloco.appendChild(tituloQuestao);

      if (q.textoAntes) {
        const apoio = document.createElement("div");
        apoio.style.marginTop = "6px";
        apoio.textContent = q.textoAntes;
        bloco.appendChild(apoio);
      }

      const respostaAluno = respostasAluno[i];
      const linhaResposta = document.createElement("div");
      linhaResposta.style.marginTop = "8px";

      if (q.alternativas && q.alternativas.length > 0) {
        objetivas += 1;

        const indiceAluno = Number(respostaAluno);
        const indiceCorreto = Number(q.correta);
        const acertou = indiceAluno === indiceCorreto;

        if (acertou) {
          acertos += 1;
        }

        const textoAluno = Number.isNaN(indiceAluno) || indiceAluno < 0 || indiceAluno >= q.alternativas.length
          ? "Sem resposta"
          : `(${letras[indiceAluno] || "?"}) ${q.alternativas[indiceAluno]}`;

        const textoCorreto = Number.isNaN(indiceCorreto) || indiceCorreto < 0 || indiceCorreto >= q.alternativas.length
          ? "Gabarito inválido"
          : `(${letras[indiceCorreto] || "?"}) ${q.alternativas[indiceCorreto]}`;

        linhaResposta.textContent = `Resposta do aluno: ${textoAluno}`;
        bloco.appendChild(linhaResposta);

        const linhaGabarito = document.createElement("div");
        linhaGabarito.textContent = `Gabarito: ${textoCorreto}`;
        bloco.appendChild(linhaGabarito);

        const linhaResultado = document.createElement("div");
        linhaResultado.textContent = acertou ? "Resultado: Acertou" : "Resultado: Errou";
        linhaResultado.style.fontWeight = "bold";
        linhaResultado.style.color = acertou ? "green" : "red";
        bloco.appendChild(linhaResultado);
      } else {
        discursivas += 1;

        linhaResposta.textContent = `Resposta do aluno: ${respostaAluno ? String(respostaAluno) : "Sem resposta"}`;
        bloco.appendChild(linhaResposta);

        const linhaDiscursiva = document.createElement("div");
        linhaDiscursiva.textContent = "Questão discursiva: correção manual.";
        linhaDiscursiva.style.fontWeight = "bold";
        bloco.appendChild(linhaDiscursiva);

        const areaNota = document.createElement("div");
        areaNota.style.marginTop = "8px";

        const labelNota = document.createElement("label");
        labelNota.textContent = "Nota da questão (0 a 1):";
        areaNota.appendChild(labelNota);

        const inputNota = document.createElement("input");
        inputNota.type = "number";
        inputNota.min = "0";
        inputNota.max = "1";
        inputNota.step = "0.1";
        inputNota.dataset.questao = String(i);
        inputNota.className = "nota-discursiva";

        const notaSalva = notasDiscursivasSalvas[i];
        if (notaSalva !== undefined && notaSalva !== null && notaSalva !== "") {
          inputNota.value = String(notaSalva);
          somaDiscursivas += Number(notaSalva) || 0;
        }

        areaNota.appendChild(inputNota);
        bloco.appendChild(areaNota);
      }

      visualizarResposta.appendChild(bloco);
      visualizarResposta.appendChild(document.createElement("hr"));
    });

    const resumo = document.createElement("div");
    resumo.id = "resumoCorrecao";
    resumo.style.marginTop = "12px";

    const notaObjetivas = objetivas > 0 ? acertos : 0;
    const notaFinalAtual = notaObjetivas + somaDiscursivas;
    resumo.textContent = `Objetivas: ${acertos}/${objetivas} | Discursivas lançadas: ${somaDiscursivas.toFixed(1)} | Nota parcial: ${notaFinalAtual.toFixed(1)}`;
    visualizarResposta.appendChild(resumo);

    const botaoSalvar = criarBotao("Salvar correção", salvarCorrecao);
    visualizarResposta.appendChild(botaoSalvar);

    resumoCorrecaoAtual = {
      objetivas,
      acertos,
      discursivas,
      provaId,
      provaNome: prova.nome || resposta.prova || "",
      aluno: resposta.aluno || "",
      turma: resposta.turma || ""
    };

    visualizarResposta.style.display = "block";
  } catch (erro) {
    mostrarErro("Erro ao abrir resposta", erro);
  }
}

async function salvarCorrecao() {
  if (!respostaAbertaId || !resumoCorrecaoAtual) {
    alert("Abra uma resposta antes de salvar a correção");
    return;
  }

  const inputs = visualizarResposta.querySelectorAll(".nota-discursiva");
  const notasDiscursivas = {};
  let somaDiscursivas = 0;

  for (const input of inputs) {
    const valorTexto = input.value.trim();

    if (!valorTexto) continue;

    const valor = Number(valorTexto);

    if (Number.isNaN(valor) || valor < 0 || valor > 1) {
      alert("As notas discursivas devem estar entre 0 e 1");
      input.focus();
      return;
    }

    notasDiscursivas[input.dataset.questao] = valor;
    somaDiscursivas += valor;
  }

  const notaObjetivas = resumoCorrecaoAtual.acertos;
  const notaFinal = notaObjetivas + somaDiscursivas;
  const correcao = {
    notaObjetivas,
    totalObjetivas: resumoCorrecaoAtual.objetivas,
    notasDiscursivas,
    somaDiscursivas,
    notaFinal,
    corrigidaEm: new Date()
  };

  try {
    await db.collection("respostas").doc(respostaAbertaId).update({ correcao });

    const resumo = document.getElementById("resumoCorrecao");
    if (resumo) {
      resumo.textContent = `Objetivas: ${resumoCorrecaoAtual.acertos}/${resumoCorrecaoAtual.objetivas} | Discursivas lançadas: ${somaDiscursivas.toFixed(1)} | Nota final: ${notaFinal.toFixed(1)}`;
    }

    alert("Correção salva com sucesso!");
    carregarRespostas();
  } catch (erro) {
    mostrarErro("Erro ao salvar correção", erro);
  }
}

carregarRespostas();
carregarTurmas();

atualizarPreviewImagens();
atualizarPreviewAlternativas();