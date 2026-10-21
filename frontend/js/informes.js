// js/informes.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const reportsUser = getStoredUser();
if (!reportsUser || (reportsUser.role !== "admin" && reportsUser.role !== "responsable")) {
  window.location.href = "fichar.html";
  throw new Error("Sin permisos.");
}

const ABSENCE_TYPE_LABELS = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  personal: "Asunto personal",
  otro: "Otro",
};

// Si el script de Chart.js no ha llegado a cargar (bloqueado por un
// navegador, sin conexión, CDN caída...), "Chart" no existiría como
// variable global. Lo comprobamos ANTES de intentar usarlo, para poder
// avisar con un mensaje claro en vez de dejar la página en blanco sin
// explicación y con un error silencioso solo visible en la consola.
if (typeof Chart === "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("chart-lib-error").classList.remove("hidden");
  });
  throw new Error("Chart.js no está disponible.");
}

// Guardamos aquí las instancias de cada gráfica para poder destruirlas y
// volver a crearlas cuando el usuario cambia el rango de fechas (Chart.js
// no permite simplemente "reescribir" los datos de un canvas ya usado sin
// antes destruir la instancia anterior).
let overtimeChart, trendChart, absenceTypesChart;

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("report-from").value = toDateInputValue(firstOfMonth);
  document.getElementById("report-to").value = toDateInputValue(today);

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadAllReports();
  });

  loadAllReports();
});

function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadAllReports() {
  const from = document.getElementById("report-from").value;
  const to = document.getElementById("report-to").value;
  if (!from || !to) return;

  await Promise.all([
    loadOvertimeChart(from, to),
    loadTrendChart(from, to),
    loadAbsenceTypesChart(from, to),
    loadAbsenteeismChart(from, to),
  ]);
}

// ---------------------------------------------------------------------------
// Gráfica 1: horas trabajadas y horas extra por empleado (barras agrupadas)
// ---------------------------------------------------------------------------
async function loadOvertimeChart(from, to) {
  try {
    const data = await apiFetch(`/reports/overtime?from=${from}&to=${to}`);

    if (overtimeChart) overtimeChart.destroy();
    overtimeChart = new Chart(document.getElementById("overtime-chart"), {
      type: "bar",
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          { label: "Horas trabajadas", data: data.map((d) => d.total_hours), backgroundColor: "#3D8168" },
          { label: "Horas extra", data: data.map((d) => d.total_overtime), backgroundColor: "#E0913A" },
        ],
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, title: { display: true, text: "Horas" } } },
      },
    });
  } catch (err) {
    console.error("Error cargando horas extra:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Gráfica 2: tendencia de horas trabajadas del equipo, día a día (línea)
// ---------------------------------------------------------------------------
async function loadTrendChart(from, to) {
  try {
    const data = await apiFetch(`/reports/hours-trend?from=${from}&to=${to}`);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById("trend-chart"), {
      type: "line",
      data: {
        labels: data.map((d) => formatShortDate(d.date)),
        datasets: [
          {
            label: "Horas trabajadas por el equipo",
            data: data.map((d) => d.hours),
            borderColor: "#3B4A7A",
            backgroundColor: "rgba(59, 74, 122, 0.12)",
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, title: { display: true, text: "Horas totales del equipo" } } },
      },
    });
  } catch (err) {
    console.error("Error cargando tendencia de horas:", err.message);
  }
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------------
// Gráfica 3: distribución de tipos de ausencia aprobados (donut)
// ---------------------------------------------------------------------------
async function loadAbsenceTypesChart(from, to) {
  try {
    const data = await apiFetch(`/reports/absence-types?from=${from}&to=${to}`);

    if (absenceTypesChart) absenceTypesChart.destroy();

    if (data.length === 0) {
      document.getElementById("absence-types-empty").classList.remove("hidden");
      document.getElementById("absence-types-chart").classList.add("hidden");
      return;
    }
    document.getElementById("absence-types-empty").classList.add("hidden");
    document.getElementById("absence-types-chart").classList.remove("hidden");

    absenceTypesChart = new Chart(document.getElementById("absence-types-chart"), {
      type: "doughnut",
      data: {
        labels: data.map((d) => ABSENCE_TYPE_LABELS[d.type] || d.type),
        datasets: [
          {
            data: data.map((d) => d.days),
            backgroundColor: ["#3B4A7A", "#C4553F", "#E0913A", "#8B92A3"],
          },
        ],
      },
      options: { responsive: true },
    });
  } catch (err) {
    console.error("Error cargando tipos de ausencia:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Gráfica 4: % de absentismo por empleado (barras), reutilizando el mismo
// endpoint que ya usa ausencias.html
// ---------------------------------------------------------------------------
let absenteeismChart;
async function loadAbsenteeismChart(from, to) {
  try {
    const data = await apiFetch(`/absences/stats?from=${from}&to=${to}`);

    if (absenteeismChart) absenteeismChart.destroy();
    absenteeismChart = new Chart(document.getElementById("absenteeism-chart"), {
      type: "bar",
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            label: "% Absentismo",
            data: data.map((d) => d.absenteeism_pct),
            backgroundColor: data.map((d) => (d.absenteeism_pct >= 15 ? "#C4553F" : "#3B4A7A")),
          },
        ],
      },
      options: {
        responsive: true,
        indexAxis: "y",
        scales: { x: { beginAtZero: true, title: { display: true, text: "% Absentismo" } } },
      },
    });
  } catch (err) {
    console.error("Error cargando absentismo:", err.message);
  }
}
