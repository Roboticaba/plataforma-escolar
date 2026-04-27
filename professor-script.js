const firebaseConfig = {
  apiKey: "AIzaSyDoVdjkrWdJrrRC1BEeWksGkp4ydWcFW9Y",
  authDomain: "plataforma-escolar-71635.firebaseapp.com",
  projectId: "plataforma-escolar-71635",
  storageBucket: "plataforma-escolar-71635.firebasestorage.app",
  messagingSenderId: "194897243209",
  appId: "1:194897243209:web:ff339bee22bced4098e398"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let usuario = JSON.parse(localStorage.getItem("usuario") || "null");
if (!usuario || usuario.role !== "professor") {
  window.location.href = "index.html";
}

document.getElementById("nomeProfessor").textContent = usuario.nome || "Professor";

document.addEventListener("DOMContentLoaded", function() {
  var abas = document.querySelectorAll(".tab-content");
  for (var i = 0; i < abas.length; i++) {
    abas[i].classList.remove("active");
    abas[i].style.display = "none";
    abas[i].style.visibility = "hidden";
  }
  var abaTurmas = document.getElementById("aba-turmas");
  if (abaTurmas) {
    abaTurmas.classList.add("active");
    abaTurmas.style.display = "block";
    abaTurmas.style.visibility = "visible";
  }
  carregarTurmas();
});

let turmaAtualId = null;
let provaAtualId = null;
let questoesTemp = [];
let logoData = "";
let ultimaSugestaoDescritor = null;

// Inicializa app secundário para criação de usuários sem deslogar o professor
const secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = secondaryApp.auth();

const descritoresPortugues = {
  "1": [{c:"D01",n:"Localizar informações"},{c:"D03",n:"Inferir sentido"},{c:"D04",n:"Inferir informação"},{c:"D05",n:"Interpretar com gráfico"},{c:"D08",n:"Causa/consequência"},{c:"D10",n:"Marcas linguísticas"},{c:"D14",n:"Efeito de pontuação"},{c:"D15",n:"Comparar textos"},{c:"D23",n:"Gênero do texto"}],
  "2": [{c:"D01",n:"Localizar informações"},{c:"D03",n:"Inferir sentido"},{c:"D04",n:"Inferir informação"},{c:"D05",n:"Interpretar com gráfico"},{c:"D08",n:"Causa/consequência"},{c:"D10",n:"Marcas linguísticas"},{c:"D14",n:"Efeito de pontuação"},{c:"D15",n:"Comparar textos"},{c:"D23",n:"Gênero do texto"}],
  "3": [{c:"D01",n:"Localizar informações"},{c:"D03",n:"Inferir sentido"},{c:"D04",n:"Inferir informação"},{c:"D05",n:"Interpretar com gráfico"},{c:"D08",n:"Causa/consequência"},{c:"D10",n:"Marcas linguísticas"},{c:"D14",n:"Efeito de pontuação"},{c:"D15",n:"Comparar textos"},{c:"D23",n:"Gênero do texto"}],
  "4": [{c:"D01",n:"Localizar informações"},{c:"D03",n:"Inferir sentido"},{c:"D04",n:"Inferir informação"},{c:"D05",n:"Interpretar com gráfico"},{c:"D08",n:"Causa/consequência"},{c:"D10",n:"Marcas linguísticas"},{c:"D14",n:"Efeito de pontuação"},{c:"D15",n:"Comparar textos"},{c:"D23",n:"Gênero do texto"}],
  "5": [{c:"D01",n:"Localizar informações"},{c:"D03",n:"Inferir sentido"},{c:"D04",n:"Inferir informação"},{c:"D05",n:"Interpretar com gráfico"},{c:"D08",n:"Causa/consequência"},{c:"D10",n:"Marcas linguísticas"},{c:"D14",n:"Efeito de pontuação"},{c:"D15",n:"Comparar textos"},{c:"D23",n:"Gênero do texto"}]
};
const descritoresMatematica = {
  "1": [{c:"D01",n:"Ler números"},{c:"D02",n:"Ordenar"},{c:"D03",n:"Figuras"},{c:"D07",n:"Unidades"},{c:"D17",n:"Adição/subtração"},{c:"D18",n:"Multiplicação"},{c:"D27",n:"Tabelas"},{c:"D28",n:"Gráficos"}],
  "2": [{c:"D01",n:"Ler números"},{c:"D02",n:"Ordenar"},{c:"D03",n:"Figuras"},{c:"D07",n:"Unidades"},{c:"D17",n:"Adição/subtração"},{c:"D18",n:"Multiplicação"},{c:"D27",n:"Tabelas"},{c:"D28",n:"Gráficos"}],
  "3": [{c:"D03",n:"Figuras"},{c:"D05",n:"Medidas"},{c:"D07",n:"Unidades"},{c:"D10",n:"Dinheiro"},{c:"D11",n:"Perímetro"},{c:"D12",n:"Área"},{c:"D17",n:"Adição/subtração"},{c:"D18",n:"Multiplicação"},{c:"D19",n:"Problema"},{c:"D23",n:"Dinheiro"},{c:"D24",n:"Fração"},{c:"D27",n:"Tabelas"},{c:"D28",n:"Gráficos"}],
  "4": [{c:"D03",n:"Figuras"},{c:"D05",n:"Medidas"},{c:"D07",n:"Unidades"},{c:"D10",n:"Dinheiro"},{c:"D11",n:"Perímetro"},{c:"D12",n:"Área"},{c:"D17",n:"Adição/subtração"},{c:"D18",n:"Multiplicação"},{c:"D19",n:"Problema"},{c:"D23",n:"Dinheiro"},{c:"D24",n:"Fração"},{c:"D26",n:"Porcentagem"},{c:"D27",n:"Tabelas"},{c:"D28",n:"Gráficos"}],
  "5": [{c:"D03",n:"Figuras"},{c:"D05",n:"Medidas"},{c:"D07",n:"Unidades"},{c:"D10",n:"Dinheiro"},{c:"D11",n:"Perímetro"},{c:"D12",n:"Área"},{c:"D17",n:"Adição/subtração"},{c:"D18",n:"Multiplicação"},{c:"D19",n:"Problema"},{c:"D23",n:"Dinheiro"},{c:"D24",n:"Fração"},{c:"D26",n:"Porcentagem"},{c:"D27",n:"Tabelas"},{c:"D28",n:"Gráficos"}]
};

function trocarAba(aba) {
  try {
    var tabIds = ["turmas", "banco", "criar"];
    for (var i = 0; i < tabIds.length; i++) {
      var content = document.getElementById("aba-" + tabIds[i]);
      var btn = document.getElementById("tab-" + tabIds[i]);
      if (content) {
        if (tabIds[i] === aba) {
          content.classList.add("active");
          content.style.display = "block";
          content.style.visibility = "visible";
        } else {
          content.classList.remove("active");
          content.style.display = "none";
          content.style.visibility = "hidden";
        }
      }
      if (btn) {
        if (tabIds[i] === aba) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    }
    
    if (aba === "turmas") carregarTurmas();
    if (aba === "banco") filtrarProvas();
    if (aba === "criar") {
      document.getElementById("nomeProva").value = "";
      document.getElementById("disciplinaProva").value = "";
      document.getElementById("anoProva").value = "";
      document.getElementById("resumoQuestoes").textContent = "Nenhuma questão adicionada ainda.";
      document.getElementById("listaQuestoes").innerHTML = "";
      questoesTemp = [];
    }
  } catch(e) {
    console.error("Erro ao trocar aba:", e);
    alert("Erro ao trocar aba: " + e.message);
  }
}

async function criarTurma() {
  const nome = prompt("Nome da turma:");
  if (!nome) return;
  try {
    await db.collection("turmas").add({ nome, alunos: [], provas: [], criadoPor: usuario.uid });
    carregarTurmas();
  } catch (e) { alert("Erro: " + e.message); }
}

async function carregarTurmas() {
  const lista = document.getElementById("listaTurmas");
  lista.innerHTML = "<p>Carregando...</p>";
  try {
    const snap = await db.collection("turmas").where("criadoPor", "==", usuario.uid).get();
    if (snap.empty) {
      lista.innerHTML = '<div class="empty-state"><div>📚</div><div>Nenhuma turma</div><div>Crie sua primeira turma</div></div>';
      return;
    }
    lista.innerHTML = "";
    snap.forEach(doc => {
      const t = doc.data();
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;font-size:18px;">${t.nome}</div>
            <div style="font-size:13px;color:#64748b;">${(t.alunos||[]).length} alunos • ${(t.provas||[]).length} provas</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="abrirTurma('${doc.id}', '${t.nome}')">Gerenciar</button>
            <button class="btn btn-danger btn-sm" onclick="excluirTurma('${doc.id}')">Excluir</button>
          </div>
        </div>
      `;
      lista.appendChild(div);
    });
  } catch (e) { lista.innerHTML = "<p>Erro ao carregar: "+e.message+"</p>"; }
}

function abrirTurma(id, nome) {
  turmaAtualId = id;
  document.getElementById("tituloTurmaModal").textContent = nome;
  document.getElementById("modalTurma").classList.add("active");
  carregarDadosTurma();
}

function fecharTurma() {
  document.getElementById("modalTurma").classList.remove("active");
  turmaAtualId = null;
}

function trocarAbaTurma(aba) {
  document.querySelectorAll(".turma-conteudo").forEach(c => c.classList.remove("active"));
  document.getElementById("conteudo-" + aba).classList.add("active");
}

async function carregarDadosTurma() {
  if (!turmaAtualId) return;
  const docT = await db.collection("turmas").doc(turmaAtualId).get();
  if (!docT.exists) return;
  const t = docT.data();
  
  const listaAl = document.getElementById("listaAlunos");
  listaAl.innerHTML = t.alunos && t.alunos.length ? t.alunos.map((a,i) => `
    <div class="list-item">
      <div style="font-weight:600;">${a.nome}</div>
      ${a.email ? `<div style="font-size:0.85rem;color:#64748b;">${a.email}</div>` : ""}
      <button class="btn btn-danger btn-sm" onclick="removerAluno(${i})">✕</button>
    </div>
  `).join("") : "<p style='color:#64748b;'>Nenhum aluno</p>";
  
  const provasDiv = document.getElementById("provasAtribuidas");
  provasDiv.innerHTML = t.provas && t.provas.length ? "<p>Carregando...</p>" : "<p style='color:#64748b;'>Nenhuma prova atribuída</p>";
  if (t.provas && t.provas.length) {
    let html = "";
    for (const pid of t.provas) {
      const dp = await db.collection("simulados").doc(pid).get();
      if (dp.exists) html += `<div class="list-item"><div>${dp.data().nome}</div><button class="btn btn-danger btn-sm" onclick="removerProva('${pid}')">✕</button></div>`;
    }
    provasDiv.innerHTML = html;
  }
}

async function adicionarAluno() {
  if (!turmaAtualId) return;
  const nome = document.getElementById("nomeAluno").value.trim();
  const senha = document.getElementById("senhaAluno").value.trim();
  if (!nome || !senha) { alert("Preencha nome e senha"); return; }

  const email = `${nome.toLowerCase().replace(/\s+/g, '.')}.aluno.${turmaAtualId}@plataforma.app`;

  try {
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, senha);
    const uid = cred.user.uid;

    await db.collection("users").doc(uid).set({
      nome,
      role: "aluno",
      turmaId: turmaAtualId,
      ativo: true,
      email
    });

    await db.collection("turmas").doc(turmaAtualId).update({
      alunos: firebase.firestore.FieldValue.arrayUnion({ uid, nome, email })
    });

    document.getElementById("nomeAluno").value = "";
    document.getElementById("senhaAluno").value = "";
    carregarDadosTurma();
    alert(`Aluno criado! Email: ${email}`);
  } catch (err) {
    console.error("Erro ao criar aluno:", err);
    alert(`Erro: ${err.message}`);
  } finally {
    await secondaryAuth.signOut();
  }
}

async function removerAluno(index) {
  if (!confirm("Remover aluno?")) return;
  const docT = await db.collection("turmas").doc(turmaAtualId).get();
  const t = docT.data();
  const alunos = t.alunos || [];
  const alunoToRemove = alunos[index];
  if (!alunoToRemove) return;

  const updatedAlunos = alunos.filter((_, i) => i !== index);
  await db.collection("turmas").doc(turmaAtualId).update({ alunos: updatedAlunos });

  if (alunoToRemove.uid) {
    await db.collection("users").doc(alunoToRemove.uid).delete();
  }

  carregarDadosTurma();
}

async function excluirTurma(id) {
  if (!confirm("Excluir turma?")) return;
  await db.collection("turmas").doc(id).delete();
  carregarTurmas();
}

// Função para limpar senhas em texto puro de alunos legados
async function limparSenhasLegadas() {
  if (!confirm("Isso vai remover todas as senhas em texto puro de alunos antigos. Continuar?")) return;
  try {
    const snapshot = await db.collection("turmas").where("criadoPor", "==", usuario.uid).get();
    const batch = db.batch();
    let totalSenhas = 0;
    
    snapshot.forEach(doc => {
      const turma = doc.data();
      if (turma.alunos && turma.alunos.some(a => a.senha)) {
        const alunosLimpos = turma.alunos.map(a => {
          if (a.senha) {
            const { senha, ...rest } = a;
            totalSenhas++;
            return rest;
          }
          return a;
        });
        batch.update(doc.ref, { alunos: alunosLimpos });
      }
    });

    if (totalSenhas === 0) {
      alert("Nenhuma senha legada encontrada.");
      return;
    }

    await batch.commit();
    alert(`${totalSenhas} senha(s) legada(s) removida(s) com sucesso!`);
    carregarDadosTurma();
  } catch (err) {
    console.error("Erro ao limpar senhas:", err);
    alert("Erro ao limpar senhas: " + err.message);
  }
}

async function mostrarAtribuirProvas() {
  document.getElementById("areaAtribuirProvas").style.display = "block";
  const select = document.getElementById("selectProvaAtribuir");
  select.innerHTML = "<option>Carregando...</option>";
  const snap = await db.collection("simulados").where("criadoPor", "==", usuario.uid).get();
  select.innerHTML = snap.docs.map(d => `<option value="${d.id}">${d.data().nome}</option>`).join("");
}

async function atribuirProva() {
  const pid = document.getElementById("selectProvaAtribuir").value;
  if (!pid || !turmaAtualId) return;
  const docT = await db.collection("turmas").doc(turmaAtualId).get();
  const t = docT.data();
  const provas = t.provas || [];
  if (!provas.includes(pid)) provas.push(pid);
  await db.collection("turmas").doc(turmaAtualId).update({ provas });
  document.getElementById("areaAtribuirProvas").style.display = "none";
  carregarDadosTurma();
}

async function removerProva(pid) {
  const docT = await db.collection("turmas").doc(turmaAtualId).get();
  const t = docT.data();
  const provas = (t.provas || []).filter(p => p !== pid);
  await db.collection("turmas").doc(turmaAtualId).update({ provas });
  carregarDadosTurma();
}

function ocultarAtribuirProvas() {
  document.getElementById("areaAtribuirProvas").style.display = "none";
}

async function filtrarProvas() {
  const lista = document.getElementById("listaProvas");
  lista.innerHTML = "<p>Carregando...</p>";
  const ano = document.getElementById("filtroAno").value;
  const disc = document.getElementById("filtroDisciplina").value;
  
  try {
    let snap;
    if (ano && disc) snap = await db.collection("simulados").where("ano","==",ano).where("disciplina","==",disc).where("criadoPor","==",usuario.uid).get();
    else if (ano) snap = await db.collection("simulados").where("ano","==",ano).where("criadoPor","==",usuario.uid).get();
    else if (disc) snap = await db.collection("simulados").where("disciplina","==",disc).where("criadoPor","==",usuario.uid).get();
    else snap = await db.collection("simulados").where("criadoPor","==", usuario.uid).get();
    
    if (snap.empty) {
      lista.innerHTML = '<div class="empty-state"><div>📋</div><div>Nenhuma prova</div></div>';
      return;
    }
    lista.innerHTML = snap.docs.map(d => {
      const p = d.data();
      return `
        <div class="prova-card" onclick="verProva('${d.id}')">
          <div class="prova-card-title">${p.nome}</div>
          <div class="prova-card-meta">
            <span class="badge badge-blue">${p.ano}º ano</span>
            <span class="badge badge-purple">${p.disciplina}</span>
            ${p.tempo ? `<span class="badge badge-yellow">${p.tempo}min</span>` : ""}
            <span class="badge">${(p.questoes||[]).length} questões</span>
          </div>
        </div>
      `;
    }).join("");
  } catch (e) { lista.innerHTML = "<p>Erro ao carregar</p>"; }
}

async function verProva(id) {
  provaAtualId = id;
  const docP = await db.collection("simulados").doc(id).get();
  if (!docP.exists) return;
  const p = docP.data();
  document.getElementById("tituloVerProva").textContent = p.nome;
  
  const letras = ["A","B","C","D"];
  let html = `<div style="margin-bottom:15px;">
    <span class="badge badge-blue">${p.ano}º ano</span>
    <span class="badge badge-purple">${p.disciplina}</span>
    ${p.tempo ? `<span>${p.tempo}min</span>` : ""}
  </div>`;
  
  (p.questoes || []).forEach((q,i) => {
    html += `<div class="questao-card">
      <div style="font-weight:600;margin-bottom:8px;">Questão ${i+1} ${q.descritor ? `<span class="badge badge-green">${q.descritor}</span>` : ""}</div>
      ${q.textoAntes ? `<p style="font-style:italic;">${q.textoAntes}</p>` : ""}
      ${q.imagens && q.imagens.length ? q.imagens.map(img=>`<img src="${img}" style="max-height:100px;margin:5px 0;display:block;">`).join("") : ""}
      <p><b>${q.pergunta}</b></p>
      ${q.alternativas ? q.alternativas.map((a,j) => `<div>(${letras[j]}) ${a}</div>`).join("") : "<i>Resposta discursiva</i>"}
    </div>`;
  });
  
  document.getElementById("conteudoVerProva").innerHTML = html;
  document.getElementById("modalVerProva").classList.add("active");
}

function fecharVerProva() {
  document.getElementById("modalVerProva").classList.remove("active");
  provaAtualId = null;
}

async function excluirProva() {
  if (!confirm("Excluir prova?")) return;
  await db.collection("simulados").doc(provaAtualId).delete();
  fecharVerProva();
  filtrarProvas();
}

async function gerarPDF() {
  if (!provaAtualId) return;
  try {
    const docP = await db.collection("simulados").doc(provaAtualId).get();
    const p = docP.data();
    const userDoc = await db.collection("users").doc(usuario.uid).get();
    const cab = userDoc.exists ? (userDoc.data().cabecalho || {}) : {};
    
    const letras = ["A","B","C","D","E"];
    
    let htmlContent = `
      <style>
        * { box-sizing: border-box; }
        .header-container { width: 100%; border: 2px solid #000; border-radius: 12px; padding: 16px; font-family: Arial, sans-serif; }
        .top-row { display: flex; align-items: center; width: 100%; }
        .logo { width: 160px; flex-shrink: 0; text-align: center; }
        .logo img { max-width: 100%; height: auto; max-height: 80px; }
        .textos { flex: 1; text-align: center; }
        .titulo { font-weight: bold; font-size: 16px; }
        .endereco { font-size: 13px; margin-top: 4px; }
        .form { width: 100%; }
        .linha { display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px; width: 100%; }
        .esquerda { flex: 1; }
        .direita { width: 180px; text-align: right; }
        .linha-input { display: inline-block; border-bottom: 1px solid #000; width: 60%; margin-left: 8px; }
        .titulo-prova { text-align: center; font-weight: bold; font-size: 16px; margin-top: 16px; width: 100%; }
        
        #area-impressao { width: 100%; margin: 0 auto; padding: 0; box-sizing: border-box; }
        
        .q{margin:25px 0;page-break-inside:avoid; width: 100%;}
        .alt{margin:5px 0;margin-left:20px;}
        .valor-total{font-size:18px;font-weight:bold;}
        .valor-questao{font-size:14px;color:#666;}
      </style>
      
      <div id="area-impressao">
        <div class="header-container">
          <div class="top-row">
            <div class="logo">${cab.logoUrl?`<img src="${cab.logoUrl}">`:""}</div>
            <div class="textos">
              <div class="titulo">${cab.nomeEscola || ""}</div>
              <div class="endereco">${cab.endereco || ""}</div>
            </div>
          </div>
          <div class="form">
            <div class="linha">
              <div class="esquerda">ALUNO(A): <span class="linha-input"></span></div>
              <div class="direita">ANO: ______</div>
            </div>
            <div class="linha">
              <div class="esquerda">PROFESSOR(A): <span class="linha-input">${cab.nomeProfessor || ""}</span></div>
              <div class="direita">DATA: ___/___/___</div>
            </div>
          </div>
        </div>
        
        <div class="titulo-prova">
          ${cab.textoLivre || ""}
        </div>
        
        <div class="info"><strong>${p.nome}</strong><br><span class="valor-total">Valor: ${parseFloat(p.valor||8).toFixed(1).replace(".",",")} pontos</span></div>
    `;
    
    const valorTotal = parseFloat(p.valor||8);
    const numQuestoes = (p.questoes||[]).length;
    const valorPorQuestao = numQuestoes > 0 ? (valorTotal / numQuestoes).toFixed(2) : valorTotal.toFixed(2);
    
    (p.questoes||[]).forEach((q,i) => {
    // 1. Processar imagens de shortcodes na pergunta e alternativas
      const processarImagens = (texto) => texto.replace(/\[img\](.*?)\[\/img\]/g, '<img src="$1" style="max-height:100px;display:block;margin:5px 0;">');
      
      htmlContent += `<div class="q"><div><b>Questão ${i+1}</b>${q.descritor?" ("+q.descritor.split("|")[0]+")":""} <span class="valor-questao">(${valorPorQuestao.replace(".",",")} pontos)</span></div>`;
      
      htmlContent+=`<div style="margin-bottom:10px;"><b>${processarImagens(q.pergunta)}</b></div>`;
      if(q.textoAntes) htmlContent+=`<div style="font-style:italic;margin-bottom:5px;white-space:pre-wrap;">${processarImagens(q.textoAntes)}</div>`;
      if(q.imagens && q.imagens.length) {
        htmlContent+=`<div style="display:flex; flex-wrap:wrap; gap:10px; margin:10px 0;">` + 
          q.imagens.map(img=>`<img src="${img}" style="max-height:150px; flex: 0 1 auto; object-fit: contain;">`).join("") +
          `</div>`;
      }
      
      if(q.alternativas && q.alternativas.length) {
        htmlContent+=q.alternativas.map((a,j)=>`<div class="alt">(${letras[j]}) ${processarImagens(a)}</div>`).join("");
      } else {
        htmlContent+=`<div style="margin-top:15px; border: 1px solid #000; height: 60px;"></div>`;
      }
      htmlContent+="</div>";
    });
    htmlContent += "</div>";
    
    // Gerar PDF sem container de debug, direto do HTML
    const opt = {
      margin: [10, 10, 10, 10],
      filename: 'prova.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    await html2pdf().set(opt).from(htmlContent).save();
    
  } catch(e) { alert("Erro ao gerar PDF: "+e.message); }
}

function atualizarDescritores() {
  const disc = document.getElementById("disciplinaProva").value;
  const ano = document.getElementById("anoProva").value;
  const selectQ = document.getElementById("descritorQuestao");
  const areaQ = document.getElementById("areaDescritorQuestao");
  
  if (!selectQ) return;
  selectQ.innerHTML = "<option value=''>Selecione</option>";
  
  if ((disc === "portugues" || disc === "matematica") && ano) {
    areaQ.style.display = "block";
    const lista = disc === "portugues" ? descritoresPortugues[ano] : descritoresMatematica[ano];
    if (lista) {
      lista.forEach(d => { selectQ.innerHTML += `<option value="${d.c}|${d.n}">${d.c} - ${d.n}</option>`; });
    }
  } else {
    areaQ.style.display = "none";
  }
}

const DESCRIPTOR_HINTS = {
  "portugues": {
    "D01": ["localizar", "encontrar", "informação explícita", "quem", "quando", "onde", "quanto", "número", "data", "nome", "fato"],
    "D03": ["inferir", "significado implícito", "deduzir", "sentido oculto", "não diz", "mas sugere", "indica que"],
    "D04": ["inferir", "informação", "conclusão", "possível", "provável", "pode ser", "seria"],
    "D05": ["gráfico", "tabela", "infográfico", "interpretar dados", " Леаchart", "imagem"],
    "D08": ["causa", "consequência", "porque", "resultado", "por isso", "então", "assim", "consequentemente"],
    "D10": ["linguagem", "marcas linguísticas", "registro", "formal", "informal", "termo", "vocábulo", "palavra"],
    "D14": ["pontuação", "ponto final", "vírgula", "exclamação", "interrogação", "efeito", "entonação"],
    "D15": ["comparar", "diferença", "semelhança", "contraste", "igual", "diferente", "ambos"],
    "D23": ["gênero", "tipo de texto", "texto narrativo", "dissertativo", "argumentativo", "jornal", "reportagem"]
  },
  "matematica": {
    "D01": ["ler", "número", "escrever", "numeral", "quantidade"],
    "D02": ["ordenar", "sequência", "crescente", "decrescente", "maior", "menor"],
    "D03": ["figura", "forma", "geométrica", "desenho", "quadrado", "círculo"],
    "D05": ["medida", "comprimento", "altura", "largura", "metro", "centímetro"],
    "D07": ["unidade", "medida", "quilo", "litro", "metro", "grama"],
    "D10": ["dinheiro", "real", "centavo", "custo", "valor", "preço", "troco"],
    "D11": ["perímetro", "contorno", "bordas", "volta"],
    "D12": ["área", "superfície", "tamanho", "metro quadrado"],
    "D17": ["adição", "soma", "subtração", "menos", "mais", "calcular"],
    "D18": ["multiplicação", "vezes", "produto", "duas vezes", "três vezes"],
    "D19": ["problema", "situação", "resolver", "cálculo"],
    "D23": ["dinheiro", "real", "centavo", "compra", "venda"],
    "D24": ["fração", "meio", "metade", "terço", "quarto", "parte"],
    "D26": ["porcentagem", "por cento", "desconto", "aumento", "%"],
    "D27": ["tabela", "dados", "organizar", "linha", "coluna"],
    "D28": ["gráfico", "coluna", "barra", "linha", "interpretar"]
  }
};

function classifyDescriptorAutomatically(textoQuestao, disc, ano) {
  if (!textoQuestao || !disc) return null;
  const texto = textoQuestao.toLowerCase();
  const hints = DESCRIPTOR_HINTS[disc];
  if (!hints) return null;
  let bestMatch = null;
  let bestScore = 0;
  const descritoresAno = disc === "portugues" ? descritoresPortugues[ano] : descritoresMatematica[ano];
  if (!descritoresAno) return null;
  for (const d of descritoresAno) {
    const keywords = hints[d.c] || [];
    let score = 0;
    for (const kw of keywords) {
      if (texto.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = d;
    }
  }
  return bestScore > 0 ? bestMatch : null;
}

function sugerirDescritorQuestao() {
  const textoQuestao = document.getElementById("pergunta").value;
  const disc = document.getElementById("disciplinaProva").value;
  const ano = document.getElementById("anoProva").value;
  if (!textoQuestao) { alert("Digite o enunciado primeiro"); return; }
  if (!disc || !ano) { alert("Selecione disciplina e ano primeiro"); return; }
  const resultado = classifyDescriptorAutomatically(textoQuestao, disc, ano);
  if (resultado) {
    document.getElementById("descritorQuestao").value = resultado.c + "|" + resultado.n;
    ultimaSugestaoDescritor = resultado;
    alert("Descritor sugerido: " + resultado.c + " - " + resultado.n);
  } else {
    alert("Nenhum descritor encontrado para este conteúdo");
  }
}

function mudouTipoQuestao() {
  const tipo = document.getElementById("tipoQuestao").value;
  document.getElementById("areaAltTexto").style.display = tipo === "multipla" ? "block" : "none";
  document.getElementById("areaAltImagem").style.display = tipo === "multipla" ? "block" : "none";
  document.getElementById("areaCorreta").style.display = tipo === "multipla" ? "block" : "none";
}

function mudouTipoAlternativa() {
  const tipoAlt = document.getElementById("tipoAlternativa").value;
  document.getElementById("areaAltTexto").style.display = tipoAlt === "texto" ? "block" : "none";
  document.getElementById("areaAltImagem").style.display = tipoAlt === "imagem" ? "block" : "none";
}

async function uploadFileToCloudinary(file) {
  const cloudName = "dflo5rpxy";
  const uploadPreset = "alunos_upload";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });
  
  const data = await response.json();
  return data.secure_url;
}

async function adicionarQuestao() {
  const tipo = document.getElementById("tipoQuestao").value;
  const tipoAlt = document.getElementById("tipoAlternativa").value;
  const textoAntes = document.getElementById("textoAntes").value;
  const pergunta = document.getElementById("pergunta").value.trim();
  
  const filesPergunta = document.getElementById("uploadImagensPergunta").files;
  let imagensPergunta = [];
  
  const disc = document.getElementById("disciplinaProva").value;
  const descritorSel = document.getElementById("descritorQuestao").value;
  
  if (!pergunta) { alert("Digite a pergunta"); return; }
  
  try {
    console.log("Processando imagens da pergunta...");
    // Upload de imagens da pergunta
    const uploadedPergunta = await Promise.all(Array.from(filesPergunta).map(uploadFileToCloudinary));
    imagensPergunta = uploadedPergunta;

    let alternativas = [], correta = null;
    if (tipo === "multipla") {
      if (tipoAlt === "texto") {
        alternativas = document.getElementById("alternativasTexto").value.split("\n").map(a=>a.trim()).filter(a=>a);
      } else {
        const filesAlternativas = document.getElementById("uploadAlternativasImg").files;
        
        console.log("Processando imagens das alternativas...");
        alternativas = await Promise.all(Array.from(filesAlternativas).map(uploadFileToCloudinary));
      }
      if (alternativas.length < 2) { alert("Digite pelo menos 2 alternativas"); return; }
      correta = parseInt(document.getElementById("correta").value);
    }
    
    let descritorCod = "", descritorNome = "";
    if (descritorSel) {
      const p = descritorSel.split("|");
      descritorCod = p[0];
      descritorNome = p[1];
    }
    
    questoesTemp.push({ tipo, tipoAlt, textoAntes, pergunta, imagens: imagensPergunta, alternativas, correta, disciplina: disc, descritor: descritorCod, descritorNome });
    
    document.getElementById("textoAntes").value = "";
    document.getElementById("pergunta").value = "";
    document.getElementById("descritorQuestao").value = "";
    document.getElementById("uploadImagensPergunta").value = "";
    document.getElementById("alternativasTexto").value = "";
    document.getElementById("uploadAlternativasImg").value = "";
    renderQuestoes();
    alert("Questão adicionada!");
  } catch (e) {
    alert("Erro ao adicionar questão: " + e.message);
  }
}

function renderQuestoes() {
  const lista = document.getElementById("listaQuestoes");
  const resumo = document.getElementById("resumoQuestoes");
  
  if (questoesTemp.length === 0) {
    resumo.textContent = "Nenhuma questão adicionada ainda.";
    lista.innerHTML = "";
    return;
  }
  
  const letras = ["A","B","C","D"];
      resumo.textContent = questoesTemp.length + " questão(ões) adicionada(s)";
  lista.innerHTML = questoesTemp.map((q,i) => {
    let html = `<div class="questao-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-weight:600;">Questão ${i+1}</span>
        <button class="btn btn-danger btn-sm" onclick="removerQuestao(${i})">✕</button>
      </div>
      ${q.descritor ? `<span class="badge badge-green">${q.descritor}</span> ` : ""}
      
      ${q.textoAntes ? `<p style="font-style:italic;font-size:13px;margin-bottom:5px;white-space:pre-wrap;">${q.textoAntes}</p>` : ""}
      
      ${q.imagens && q.imagens.length ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin:5px 0;">` + q.imagens.map(img=>`<img src="${img}" style="max-height:100px; flex: 0 1 auto; object-fit: contain;">`).join("") + `</div>` : ""}
      
      <p style="margin-bottom:10px;"><b>${q.pergunta}</b></p>`;
    
    if (q.alternativas && q.alternativas.length) {
      html += `<div style="margin-top:10px;">`;
      q.alternativas.forEach((alt, j) => {
        if (q.tipoAlt === "imagem") {
          html += `<div style="margin:5px 0;"><img src="${alt}" style="max-height:80px;"></div>`;
        } else {
          html += `<div>(${letras[j]}) ${alt}</div>`;
        }
      });
      html += `</div>`;
    } else {
      html += `<div style="margin-top:10px; border: 1px dashed #ccc; padding: 10px;"><i>Campo de resposta escrita</i></div>`;
    }
    
    html += `</div>`;
    return html;
  }).join("");
}

function removerQuestao(i) {
  questoesTemp.splice(i, 1);
  renderQuestoes();
}

async function salvarProva() {
  const nome = document.getElementById("nomeProva").value.trim();
  const ano = document.getElementById("anoProva").value;
  const disciplina = document.getElementById("disciplinaProva").value;
  const tempo = document.getElementById("tempoProva").value;
  const valor = document.getElementById("valorProva").value;
  
  if (!nome || !ano) { alert("Preencha nome e ano"); return; }
  if (questoesTemp.length === 0) { alert("Adicione pelo menos uma questão"); return; }
  
  try {
    await db.collection("simulados").add({
      nome, ano, disciplina, tempo: tempo||null, valor: valor||8,
      questoes: questoesTemp,
      criadoPor: usuario.uid, criadoEm: new Date()
    });
    
    alert("Prova salva!");
    document.getElementById("nomeProva").value = "";
    document.getElementById("anoProva").value = "";
    document.getElementById("disciplinaProva").value = "";
    document.getElementById("tempoProva").value = "";
    document.getElementById("valorProva").value = "";
    questoesTemp = [];
    renderQuestoes();
    trocarAba("banco");
  } catch(e) { alert("Erro: "+e.message); }
}

async function abrirConfig() {
  try {
    const userDoc = await db.collection("users").doc(usuario.uid).get();
    const dados = userDoc.exists ? userDoc.data() : {};
    const cab = dados.cabecalho || {};
    document.getElementById("cfgNomeEscola").value = cab.nomeEscola || "";
    document.getElementById("cfgEndereco").value = cab.endereco || "";
    document.getElementById("cfgNomeProfessor").value = cab.nomeProfessor || dados.nome || "";
    document.getElementById("cfgTextoLivre").value = cab.textoLivre || "";
    if (cab.logoUrl) document.getElementById("previewLogo").innerHTML = '<img src="'+cab.logoUrl+'" style="max-height:60px;">';
    document.getElementById("modalConfig").classList.add("active");
  } catch(e) { alert("Erro: "+e.message); }
}

function fecharConfig() {
  document.getElementById("modalConfig").classList.remove("active");
}

function uploadLogo() {
  const file = document.getElementById("inputLogo").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("previewLogo").innerHTML = '<img src="'+e.target.result+'" style="max-height:60px;">';
    logoData = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function salvarConfig() {
  try {
    // Busca configurações existentes para preservar logo se não houver upload novo
    const userDoc = await db.collection("users").doc(usuario.uid).get();
    const existingCabecalho = userDoc.exists ? userDoc.data().cabecalho || {} : {};
    
    await db.collection("users").doc(usuario.uid).update({
      cabecalho: {
        nomeEscola: document.getElementById("cfgNomeEscola").value.trim(),
        endereco: document.getElementById("cfgEndereco").value.trim(),
        logoUrl: logoData || existingCabecalho.logoUrl || "",
        nomeProfessor: document.getElementById("cfgNomeProfessor").value.trim(),
        textoLivre: document.getElementById("cfgTextoLivre").value.trim()
      }
    });
    alert("Configurações salvas com sucesso!");
    fecharConfig();
  } catch(e) { alert("Erro: "+e.message); }
}

async function sair() {
  await auth.signOut();
  localStorage.removeItem("usuario");
  window.location.href = "index.html";
}

carregarTurmas();
mudouTipoAlternativa();

window.trocarAba = trocarAba;
window.criarTurma = criarTurma;
window.abrirTurma = abrirTurma;
window.fecharTurma = fecharTurma;
window.trocarAbaTurma = trocarAbaTurma;
window.adicionarAluno = adicionarAluno;
window.removerAluno = removerAluno;
window.excluirTurma = excluirTurma;
window.mostrarAtribuirProvas = mostrarAtribuirProvas;
window.atribuirProva = atribuirProva;
window.removerProva = removerProva;
window.ocultarAtribuirProvas = ocultarAtribuirProvas;
window.filtrarProvas = filtrarProvas;
window.verProva = verProva;
window.fecharVerProva = fecharVerProva;
window.excluirProva = excluirProva;
window.gerarPDF = gerarPDF;
window.atualizarDescritores = atualizarDescritores;
window.mudouTipoQuestao = mudouTipoQuestao;
window.mudouTipoAlternativa = mudouTipoAlternativa;
window.adicionarQuestao = adicionarQuestao;
window.removerQuestao = removerQuestao;
window.salvarProva = salvarProva;
window.abrirConfig = abrirConfig;
window.fecharConfig = fecharConfig;
window.uploadLogo = uploadLogo;
window.salvarConfig = salvarConfig;
window.sair = sair;
