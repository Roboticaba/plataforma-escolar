// FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDoVdjkrWdJrrRC1BEeWksGkp4ydWcFW9Y",
  authDomain: "plataforma-escolar-71635.firebaseapp.com",
  projectId: "plataforma-escolar-71635",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ================= TURMAS =================
let alunosTemp = [];
let nomeTurmaTemp = "";

// PASSO 1
function iniciarCriacaoTurma() {
  document.getElementById("areaCriarTurma").style.display = "block";
}

// PASSO 2
function salvarNomeTurma() {
  const nome = document.getElementById("nomeTurma").value;

  if (!nome) {
    alert("Digite o nome da turma!");
    return;
  }

  nomeTurmaTemp = nome;

  document.getElementById("areaCriarTurma").style.display = "none";
  document.getElementById("areaAlunos").style.display = "block";
}

// PASSO 3
function adicionarAlunoTemp() {
  const nome = document.getElementById("nomeAluno").value;
  const senha = document.getElementById("senhaAluno").value;

  if (!nome || !senha) {
    alert("Preencha tudo!");
    return;
  }

  alunosTemp.push({ nome, senha });

  renderAlunosTemp();

  document.getElementById("nomeAluno").value = "";
  document.getElementById("senhaAluno").value = "";
}

// MOSTRAR ALUNOS
function renderAlunosTemp() {
  const ul = document.getElementById("listaAlunosTemp");
  ul.innerHTML = "";

  alunosTemp.forEach(a => {
    const li = document.createElement("li");
    li.textContent = a.nome;
    ul.appendChild(li);
  });
}

// SALVAR TURMA
function salvarTurmaCompleta() {
  if (alunosTemp.length === 0) {
    alert("Adicione pelo menos um aluno!");
    return;
  }

  db.collection("turmas").add({
    nome: nomeTurmaTemp,
    alunos: alunosTemp
  }).then(() => {

    alert("Turma salva!");

    alunosTemp = [];
    nomeTurmaTemp = "";

    document.getElementById("areaAlunos").style.display = "none";
    document.getElementById("listaAlunosTemp").innerHTML = "";
    document.getElementById("nomeTurma").value = "";

    carregarTurmas();
  });
}

// LISTAR TURMAS
function carregarTurmas() {
  const ul = document.getElementById("listaTurmas");
  if (!ul) return;

  ul.innerHTML = "";

  db.collection("turmas").get().then(snapshot => {
    snapshot.forEach(doc => {
      const turma = doc.data();

      const li = document.createElement("li");
      li.textContent = turma.nome;

      ul.appendChild(li);
    });
  });
}

carregarTurmas();

// ================= PROVAS =================
let questoesTemp = [];

// 🔥 ABRIR FORMULÁRIO DE PROVA
function abrirCriacao() {
  document.getElementById("areaProva").style.display = "block";
}

// ADICIONAR QUESTÃO
function adicionarQuestao() {
  const q = {
    pergunta: document.getElementById("pergunta").value,
    alternativas: {
      A: document.getElementById("a").value,
      B: document.getElementById("b").value,
      C: document.getElementById("c").value,
      D: document.getElementById("d").value
    },
    correta: document.getElementById("correta").value
  };

  questoesTemp.push(q);
  mostrarNaTela(q);
  limparCampos();
}

// MOSTRAR QUESTÃO NA TELA
function mostrarNaTela(q) {
  const ul = document.getElementById("listaQuestoes");

  const li = document.createElement("li");

  li.innerHTML = `
    <b>${q.pergunta}</b><br>
    A) ${q.alternativas.A}<br>
    B) ${q.alternativas.B}<br>
    C) ${q.alternativas.C}<br>
    D) ${q.alternativas.D}<br>
    ✔ ${q.correta}
  `;

  ul.appendChild(li);
}

// SALVAR PROVA
function salvarProva() {
  const nome = document.getElementById("nomeProva").value;
  const ano = document.getElementById("anoProva").value;

  if (!nome) {
    alert("Digite o nome da prova!");
    return;
  }

  if (!ano) {
    alert("Selecione o ano!");
    return;
  }

  if (questoesTemp.length === 0) {
    alert("Adicione pelo menos uma questão!");
    return;
  }

  db.collection("simulados").add({
    nome: nome,
    ano: ano,
    questoes: questoesTemp,
    criadoEm: new Date()
  }).then(() => {

    alert("Prova salva!");

    document.getElementById("areaProva").style.display = "none";
    document.getElementById("listaQuestoes").innerHTML = "";

    questoesTemp = [];

    document.getElementById("nomeProva").value = "";
    document.getElementById("anoProva").value = "";
  });
}

// LIMPAR CAMPOS
function limparCampos() {
  document.getElementById("pergunta").value = "";
  document.getElementById("a").value = "";
  document.getElementById("b").value = "";
  document.getElementById("c").value = "";
  document.getElementById("d").value = "";
}

// FILTRAR PROVAS POR ANO
function filtrarAno(ano) {
  const ul = document.getElementById("listaProvas");
  ul.innerHTML = "Carregando...";

  db.collection("simulados")
    .where("ano", "==", ano)
    .get()
    .then(snapshot => {

      ul.innerHTML = "";

      if (snapshot.empty) {
        ul.innerHTML = "<li>Nenhuma prova encontrada</li>";
        return;
      }

      snapshot.forEach(doc => {
        const prova = doc.data();

        const li = document.createElement("li");
        li.innerHTML = `📘 ${prova.nome}`;

        ul.appendChild(li);
      });
    });
}

// ================= GLOBAL =================
window.iniciarCriacaoTurma = iniciarCriacaoTurma;
window.salvarNomeTurma = salvarNomeTurma;
window.adicionarAlunoTemp = adicionarAlunoTemp;
window.salvarTurmaCompleta = salvarTurmaCompleta;

window.abrirCriacao = abrirCriacao;
window.adicionarQuestao = adicionarQuestao;
window.salvarProva = salvarProva;
window.filtrarAno = filtrarAno;