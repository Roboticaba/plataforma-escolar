// ============================================
// PROVA JS - Realizar Prova
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
const provaId = localStorage.getItem('provaSelecionada');

if (!usuario || usuario.role !== 'aluno' || !provaId) {
  window.location.href = 'index.html';
}

let respostas = JSON.parse(localStorage.getItem("respostasTemp")) || {};
let prova = null;
let tempo = 600;

function atualizarTempo() {
  tempo--;
  document.getElementById("tempo").innerText = tempo + "s";

  if (tempo <= 0) {
    enviar();
  }
}

const timer = setInterval(atualizarTempo, 1000);

async function carregarProva() {
  try {
    const doc = await db.collection("simulados").doc(provaId).get();
    prova = doc.data();
    document.getElementById("titulo").innerText = prova.nome;
    render();
  } catch (e) {
    console.error("Erro ao carregar prova:", e);
  }
}

function render() {
  const div = document.getElementById("prova");
  div.innerHTML = "";

  prova.questoes.forEach((q, i) => {
    const bloco = document.createElement("div");
    bloco.innerHTML = `<b>${q.pergunta}</b><br>`;

    if (q.alternativas) {
      q.alternativas.forEach((alt, idx) => {
        const op = document.createElement("div");
        op.innerText = alt;
        op.onclick = () => {
          respostas[i] = idx;
          salvar();
          atualizarBarra();
        };
        bloco.appendChild(op);
      });
    } else {
      const t = document.createElement("textarea");
      t.value = respostas[i] || "";
      t.onchange = () => {
        respostas[i] = t.value;
        salvar();
        atualizarBarra();
      };
      bloco.appendChild(t);
    }

    div.appendChild(bloco);
    div.appendChild(document.createElement("hr"));
  });

  atualizarBarra();
}

function salvar() {
  localStorage.setItem("respostasTemp", JSON.stringify(respostas));
}

function atualizarBarra() {
  const total = prova.questoes.length;
  const feitas = Object.keys(respostas).length;
  const porcentagem = (feitas / total) * 100;
  document.getElementById("barra").style.width = porcentagem + "%";
}

async function enviar() {
  // Valida se todas as questões foram respondidas
  if (!prova || Object.keys(respostas).length < prova.questoes.length) {
    alert("Responda todas as questões antes de enviar!");
    return;
  }

  clearInterval(timer);

  try {
    await db.collection("respostas").add({
      alunoId: usuario.uid,
      provaId,
      respostas,
      data: new Date()
    });

    localStorage.removeItem("respostasTemp");
    alert("Prova enviada!");
    window.location = "home.html";
  } catch (e) {
    alert("Erro ao enviar prova.");
    window.location = "home.html";
  }
}

carregarProva();