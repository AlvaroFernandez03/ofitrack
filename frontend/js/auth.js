// js/auth.js
const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("ofitrack_token");
}
function getStoredUser() {
  const raw = localStorage.getItem("ofitrack_user");
  return raw ? JSON.parse(raw) : null;
}
function saveSession(token, user) {
  localStorage.setItem("ofitrack_token", token);
  localStorage.setItem("ofitrack_user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("ofitrack_token");
  localStorage.removeItem("ofitrack_user");
}
function logout() {
  clearSession();
  window.location.href = "index.html";
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error en la petición.");
  return data;
}

// SQLite devuelve las fechas como "2026-01-15 10:00:00" (con espacio, sin
// "T" ni zona horaria). La mayoría de navegadores lo interpretan bien, pero
// Safari puede fallar ("Invalid Date"). Esta función lo normaliza siempre
// al formato ISO real antes de construir un objeto Date, para que funcione
// igual en cualquier navegador.
function parseServerDate(timestamp) {
  return new Date(timestamp.replace(" ", "T"));
}

// Si la página no tiene sesión válida, redirige al login. Se llama al
// principio de cada página protegida (todas menos index.html).
function requireLogin() {
  if (!getToken()) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function renderNavUserArea() {
  const user = getStoredUser();

  const userArea = document.getElementById("nav-user-area");
  if (userArea && user) {
    // Mostramos solo el nombre de pila: es una herramienta que se usa a
    // diario, y el nombre completo con el rol entre paréntesis ocupa mucho
    // y no aporta nada útil una vez has iniciado sesión.
    const firstName = user.name.split(" ")[0];
    userArea.innerHTML = `
      <span class="user-name">${firstName}</span>
      <button id="logout-btn" class="btn btn-outline btn-sm">Salir</button>
    `;
    document.getElementById("logout-btn").addEventListener("click", logout);
  }

  // Mostramos/ocultamos los enlaces del menú según el rol del usuario logueado.
  const teamLink = document.getElementById("nav-team-link");
  const employeesLink = document.getElementById("nav-employees-link");
  const reportsLink = document.getElementById("nav-reports-link");
  if (teamLink) teamLink.classList.toggle("hidden", !(user && (user.role === "responsable" || user.role === "admin")));
  if (employeesLink) employeesLink.classList.toggle("hidden", !(user && user.role === "admin"));
  if (reportsLink) reportsLink.classList.toggle("hidden", !(user && (user.role === "responsable" || user.role === "admin")));

  markCurrentNavLink();
}

// Marca en el menú la página en la que estás ahora mismo, comparando el
// href de cada enlace con el nombre del archivo actual de la URL. Así no
// hay que acordarse de poner una clase "activa" a mano en cada HTML.
function markCurrentNavLink() {
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar nav a").forEach((link) => {
    if (link.getAttribute("href") === currentFile) {
      link.classList.add("is-current");
    }
  });
}

document.addEventListener("DOMContentLoaded", renderNavUserArea);
