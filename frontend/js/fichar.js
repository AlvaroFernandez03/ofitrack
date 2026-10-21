// js/fichar.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

let currentStatus = null;

// Circunferencia del anillo: 2 × π × radio (el radio es 52 en el SVG).
// La usamos para calcular cuánto hay que "descubrir" del trazo según el
// progreso de la jornada. Debe coincidir con el stroke-dasharray del HTML.
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

document.addEventListener("DOMContentLoaded", () => {
  renderGreeting();
  updateClock();
  setInterval(updateClock, 1000);

  loadStatus();
  // Refresco periódico: si estás fichado, las horas van subiendo solas sin
  // que tengas que recargar la página.
  setInterval(loadStatus, 30000);

  document.getElementById("clock-btn").addEventListener("click", handleClockClick);
});

function renderGreeting() {
  const user = getStoredUser();
  const firstName = user ? user.name.split(" ")[0] : "";
  const hour = new Date().getHours();

  // Saludo según la hora del día: un detalle pequeño, pero hace que la
  // herramienta se sienta menos impersonal cuando la abres cada mañana.
  let greeting = "Buenas noches";
  if (hour >= 6 && hour < 13) greeting = "Buenos días";
  else if (hour >= 13 && hour < 21) greeting = "Buenas tardes";

  document.getElementById("greeting").textContent = `${greeting}, ${firstName}`;

  const dateText = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // Primera letra en mayúscula ("lunes 3 de marzo" -> "Lunes 3 de marzo")
  document.getElementById("today-date").textContent =
    dateText.charAt(0).toUpperCase() + dateText.slice(1);
}

function updateClock() {
  const now = new Date();
  document.getElementById("live-clock").textContent = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadStatus() {
  try {
    currentStatus = await apiFetch("/clockins/status");
    renderStatus();
  } catch (err) {
    document.getElementById("clock-status").textContent = err.message;
  }
}

function renderStatus() {
  const statusEl = document.getElementById("clock-status");
  const btn = document.getElementById("clock-btn");
  const ring = document.getElementById("ring-progress");

  btn.disabled = false;

  if (currentStatus.is_clocked_in) {
    // El punto que late indica "en curso" de un vistazo, sin tener que leer.
    statusEl.innerHTML = `<span class="pulse-dot"></span>Trabajando`;
    statusEl.className = "clock-status in";
    btn.textContent = "Fichar salida";
    btn.className = "clock-btn salida";
  } else {
    const hasWorkedToday = currentStatus.hours_worked_today > 0;
    statusEl.textContent = hasWorkedToday ? "Jornada finalizada" : "Sin fichar";
    statusEl.className = "clock-status out";
    btn.textContent = "Fichar entrada";
    btn.className = "clock-btn entrada";
  }

  // Progreso del anillo: qué porcentaje de tu jornada llevas hecho.
  const target = currentStatus.daily_hours || 8;
  const worked = currentStatus.hours_worked_today;
  const ratio = Math.min(1, worked / target);

  // stroke-dashoffset va de "circunferencia completa" (vacío) a 0 (lleno).
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - ratio);
  // Si ya has superado tu jornada, el anillo pasa a ámbar: estás en horas extra.
  ring.classList.toggle("overtime", currentStatus.overtime_today > 0);

  document.getElementById("hours-today").textContent = formatHours(worked);
  document.getElementById("daily-target").textContent = formatHours(target);

  const overtimeEl = document.getElementById("overtime-today");
  overtimeEl.textContent = formatHours(currentStatus.overtime_today);
  overtimeEl.classList.toggle("val-overtime", currentStatus.overtime_today > 0);
}

// Formatea las horas con coma decimal, como se escriben en español.
function formatHours(hours) {
  return hours.toFixed(1).replace(".", ",");
}

async function handleClockClick() {
  const btn = document.getElementById("clock-btn");
  btn.disabled = true;

  const type = currentStatus.is_clocked_in ? "out" : "in";
  try {
    await apiFetch("/clockins", { method: "POST", body: JSON.stringify({ type }) });
    await loadStatus();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}
