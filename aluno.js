// ============================================
// ALUNO JS - Página do Aluno (selecionar prova)
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

if (!usuario || usuario.role !== 'aluno') {
  window.location.href = 'index.html';
}

document.getElementById("nomeAluno").innerText = usuario.nome;

const listaProvas = document.getElementById("listaProvas");
const areaProva = document.getElementById("prova");
const status = document.getElementById("status");

let provaAtual = null;
let provaId = null;
let respostas = {};

async function carregarProvas() {
  if (!usuario.turmaId) {
    listaProvas.innerHTML = "<option>Erro: Turma não encontrada</option>";
    return;
  }

  listaProvas.innerHTML = "<option>Carregando...</option>";

  try {
    const doc = await db.collection("turmas").doc(usuario.turmaId).get();
    const provasIds = doc.data()?.provas || [];

    listaProvas.innerHTML = "";

    for (const id of provasIds) {
      const snap = await db.collection("simulados").doc(id).get();
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = snap.data()?.nome || "Sem nome";
      listaProvas.appendChild(opt);
    }
  } catch (e) {
    console.error(e);
    listaProvas.innerHTML = "<option>Erro ao carregar</option>";
  }
}

async function carregarProva() {
  const id = listaProvas.value;
  if (!id) return;

  areaProva.innerHTML = "Carregando prova...";
  status.innerText = "";

  try {
    const resp = await db.collection("respostas")
      .where("alunoId", "==", usuario.uid)
      .where("provaId", "==", id)
      .get();

    if (!resp.empty) {
      areaProva.innerHTML = "";
      status.innerText = "Você já respondeu esta prova.";
      return;
    }

    const doc = await db.collection("simulados").doc(id).get();
    provaAtual = doc.data();
    provaId = doc.id;
    respostas = {};

    renderProva();
  } catch (e) {
    areaProva.innerHTML = "";
    status.innerText = "Erro ao carregar prova.";
  }
}

function renderProva() {
  areaProva.innerHTML = "";

  provaAtual.questoes.forEach((q, i) => {
    const bloco = document.createElement("div");
    bloco.innerHTML = `<b>${i + 1}) ${q.pergunta}</b><br><br>`;

    if (q.alternativas?.length) {
      q.alternativas.forEach((alt, index) => {
        const op = document.createElement("div");
        op.className = "opcao";
        op.innerText = alt;

        op.onclick = () => {
          respostas[i] = index;
          [...bloco.querySelectorAll(".opcao")].forEach(o => o.classList.remove("selecionado"));
          op.classList.add("selecionado");
        };

        bloco.appendChild(op);
      });
    } else {
      const textarea = document.createElement("textarea");
      textarea.onchange = () => {
        respostas[i] = textarea.value.trim();
      };
      bloco.appendChild(textarea);
    }

    areaProva.appendChild(bloco);
    areaProva.appendChild(document.createElement("hr"));
  });
}

async function enviarProva() {
  if (!provaAtual) {
    return status.innerText = "Carregue uma prova primeiro.";
  }

  const total = provaAtual.questoes.length;

  if (Object.keys(respostas).length < total) {
    return status.innerText = "Responda todas as questões.";
  }

  if (!confirm("Tem certeza que deseja enviar? Não poderá alterar depois.")) {
    return;
  }

  try {
    await db.collection("respostas").add({
      alunoId: usuario.uid,
      aluno: usuario.nome,
      turma: usuario.turmaId,
      prova: provaAtual.nome,
      provaId,
      respostas,
      data: new Date()
    });

    areaProva.innerHTML = "";
    status.innerText = "Prova enviada com sucesso!";
  } catch (e) {
    status.innerText = "Erro ao enviar.";
  }
}

carregarProvas();