import { db } from "../core/firebase-app.js";

export const CONFIG_PADRAO = {
  nomeEscola: "",
  endereco: "",
  telefone: "",
  cnpj: "",
  logoUrl: "",
  mostrarNomeProfessor: true,
  nomeProfessor: "",
  textoLivrePadrao: ""
};

function getLegacyConfig() {
  try {
    const local = JSON.parse(window.localStorage.getItem("configProfessor") || "null");
    if (!local) {
      return {};
    }

    return {
      nomeEscola: local.nomeEscola || "",
      endereco: local.endereco || "",
      telefone: local.telefone || "",
      cnpj: local.cnpj || "",
      logoUrl: local.logoUrl || "",
      mostrarNomeProfessor: local.mostrarNomeProfessor !== false,
      nomeProfessor: local.nomeProfessor || "",
      textoLivrePadrao: local.textoLivrePadrao || local.textoLivre || ""
    };
  } catch (error) {
    return {};
  }
}

export async function getConfiguracoesProfessor(uid) {
  if (!uid) {
    return { ...CONFIG_PADRAO, ...getLegacyConfig() };
  }

  const doc = await db.collection("configuracoes").doc(uid).get();
  return doc.exists
    ? { ...CONFIG_PADRAO, ...getLegacyConfig(), ...doc.data() }
    : { ...CONFIG_PADRAO, ...getLegacyConfig() };
}

export async function saveConfiguracoesProfessor(uid, payload) {
  if (!uid) {
    throw new Error("Professor nao identificado.");
  }

  const record = {
    ...CONFIG_PADRAO,
    ...payload,
    atualizadoEm: new Date()
  };

  const docRef = db.collection("configuracoes").doc(uid);
  const doc = await docRef.get();

  if (!doc.exists) {
    record.criadoEm = new Date();
  }

  await docRef.set(record, { merge: true });
  return record;
}
