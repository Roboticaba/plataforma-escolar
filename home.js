// ============================================
// HOME JS - Dashboard do Aluno
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
const auth = firebase.auth();

// Verificar se é aluno
const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');

if (!usuario || usuario.role !== 'aluno') {
  window.location.href = 'index.html';
}

document.getElementById("nomeAluno").innerText = usuario.nome;

const lista = document.getElementById("listaProvas");

async function carregarProvas() {
  if (!usuario.turmaId) {
    lista.innerHTML = "<li>Erro: Turma não encontrada</li>";
    return;
  }

  lista.innerHTML = "<li>Carregando...</li>";

  try {
    const doc = await db.collection("turmas").doc(usuario.turmaId).get();
    const provas = doc.data()?.provas || [];

    if (provas.length === 0) {
      lista.innerHTML = "<li>Nenhuma prova disponível</li>";
      return;
    }

    lista.innerHTML = "";

    for (const id of provas) {
      try {
        const snap = await db.collection("simulados").doc(id).get();
        if (!snap.exists) continue;

        const resp = await db.collection("respostas")
          .where("alunoId", "==", usuario.uid)
          .where("provaId", "==", id)
          .get();

        if (!resp.empty) continue;

        const li = document.createElement("li");
        li.textContent = snap.data().nome;
        li.onclick = () => {
          localStorage.setItem("provaSelecionada", id);
          window.location = "prova.html";
        };
        lista.appendChild(li);
      } catch (e) {
        console.error("Erro ao carregar prova:", id, e);
      }
    }

    if (lista.innerHTML === "") {
      lista.innerHTML = "<li>Nenhuma prova disponível</li>";
    }
  } catch (e) {
    console.error(e);
    lista.innerHTML = "<li>Erro ao carregar provas</li>";
  }
}

carregarProvas();