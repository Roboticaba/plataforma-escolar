export function getCurrentUser() {
  return JSON.parse(localStorage.getItem("usuario") || "null");
}

export function requireProfessor() {
  const usuario = getCurrentUser();
  if (!usuario || usuario.role !== "professor") {
    window.location.href = "index.html";
    throw new Error("Usuário sem acesso.");
  }
  return usuario;
}
