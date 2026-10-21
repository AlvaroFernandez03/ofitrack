// js/turnos.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const me = getStoredUser();
const isManager = me && (me.role === "responsable" || me.role === "admin");

// currentAnchor guarda la fecha (cualquier día dentro de la semana visible)
// que usamos para pedir la semana al backend. Al pulsar "Semana siguiente"
// o "Semana anterior", simplemente le sumamos/restamos 7 días y recargamos.
let currentAnchor = new Date();
let shiftsCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("prev-week-btn").addEventListener("click", () => changeWeek(-7));
  document.getElementById("next-week-btn").addEventListener("click", () => changeWeek(7));

  // El texto de introducción cambia según lo que puedas hacer en esta página.
  const intro = document.getElementById("turnos-intro");
  if (intro) {
    intro.textContent = isManager
      ? "Asigna el turno de cada persona en cada día. Los cambios se guardan al momento."
      : "Tus turnos asignados para la semana.";
  }

  if (isManager) {
    document.getElementById("manager-view").classList.remove("hidden");
    shiftsCache = await apiFetch("/shifts");
    renderShiftTypesList();
    document.getElementById("new-shift-form").addEventListener("submit", handleNewShift);
    if (me.role === "admin") document.getElementById("shift-types-section").classList.remove("hidden");
    await loadTeamSchedule();
  } else {
    document.getElementById("worker-view").classList.remove("hidden");
    await loadMySchedule();
  }
});

function anchorDateStr() {
  const y = currentAnchor.getFullYear();
  const m = String(currentAnchor.getMonth() + 1).padStart(2, "0");
  const d = String(currentAnchor.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function changeWeek(deltaDays) {
  currentAnchor.setDate(currentAnchor.getDate() + deltaDays);
  if (isManager) await loadTeamSchedule();
  else await loadMySchedule();
}

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------------
// VISTA DE RESPONSABLE/ADMIN — calendario editable de todo el equipo
// ---------------------------------------------------------------------------
async function loadTeamSchedule() {
  const grid = document.getElementById("schedule-grid");
  grid.innerHTML = "<p>Cargando calendario...</p>";

  try {
    const data = await apiFetch(`/schedule?start=${anchorDateStr()}`);
    document.getElementById("week-label").textContent = `Semana del ${formatDayHeader(data.week_dates[0])} al ${formatDayHeader(data.week_dates[6])}`;

    if (data.team.length === 0) {
      grid.innerHTML = "<p>No tienes empleados asignados todavía.</p>";
      return;
    }

    // Indexamos las asignaciones por "employeeId|fecha" para acceso rápido al construir la rejilla.
    const byCell = {};
    data.assignments.forEach((a) => {
      byCell[`${a.employee_id}|${a.date}`] = a;
    });

    grid.innerHTML = "";
    grid.className = "schedule-grid";

    // Cabecera
    grid.appendChild(makeDiv("sch-head", ""));
    data.week_dates.forEach((date) => grid.appendChild(makeDiv("sch-head", formatDayHeader(date))));

    // Una fila por empleado
    data.team.forEach((emp) => {
      grid.appendChild(makeDiv("sch-name", emp.name));

      data.week_dates.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "sch-cell";

        const assignment = byCell[`${emp.id}|${date}`];
        const select = document.createElement("select");
        select.innerHTML =
          `<option value="">Sin turno</option>` +
          shiftsCache.map((s) => `<option value="${s.id}">${s.name} (${s.start_time}-${s.end_time})</option>`).join("");
        if (assignment) select.value = assignment.shift_id;

        select.addEventListener("change", async () => {
          try {
            if (select.value === "") {
              await apiFetch(`/schedule?employee_id=${emp.id}&date=${date}`, { method: "DELETE" });
            } else {
              await apiFetch("/schedule", {
                method: "POST",
                body: JSON.stringify({ employee_id: emp.id, date, shift_id: Number(select.value) }),
              });
            }
          } catch (err) {
            alert(err.message);
            await loadTeamSchedule(); // si algo falla, recargamos para no dejar la vista desincronizada
          }
        });

        cell.appendChild(select);
        grid.appendChild(cell);
      });
    });
  } catch (err) {
    grid.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

function makeDiv(className, text) {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  return div;
}

// ---------------------------------------------------------------------------
// Gestión de tipos de turno (solo admin)
// ---------------------------------------------------------------------------
function renderShiftTypesList() {
  const list = document.getElementById("shift-types-list");
  list.innerHTML = "";
  shiftsCache.forEach((s) => {
    const pill = document.createElement("div");
    pill.className = "shift-type-pill";
    pill.innerHTML = `<span>${s.name} (${s.start_time}-${s.end_time})</span>`;
    if (me.role === "admin") {
      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`¿Borrar el turno "${s.name}"? Se quitará de cualquier día que lo tuviera asignado.`)) return;
        await apiFetch(`/shifts/${s.id}`, { method: "DELETE" });
        shiftsCache = await apiFetch("/shifts");
        renderShiftTypesList();
        await loadTeamSchedule();
      });
      pill.appendChild(delBtn);
    }
    list.appendChild(pill);
  });
}

async function handleNewShift(e) {
  e.preventDefault();
  const msg = document.getElementById("shift-form-msg");
  msg.textContent = "";
  msg.className = "form-message";

  try {
    await apiFetch("/shifts", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("shift-name").value.trim(),
        start_time: document.getElementById("shift-start").value,
        end_time: document.getElementById("shift-end").value,
      }),
    });
    document.getElementById("new-shift-form").reset();
    shiftsCache = await apiFetch("/shifts");
    renderShiftTypesList();
    await loadTeamSchedule();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}

// ---------------------------------------------------------------------------
// VISTA DE TRABAJADOR — solo lectura de mi propio calendario
// ---------------------------------------------------------------------------
async function loadMySchedule() {
  const tbody = document.getElementById("my-schedule-body");
  tbody.innerHTML = "<tr><td colspan='2'>Cargando...</td></tr>";

  try {
    const data = await apiFetch(`/schedule/me?start=${anchorDateStr()}`);
    document.getElementById("week-label").textContent = `Semana del ${formatDayHeader(data.week_dates[0])} al ${formatDayHeader(data.week_dates[6])}`;

    const byDate = {};
    data.assignments.forEach((a) => (byDate[a.date] = a));

    tbody.innerHTML = "";
    data.week_dates.forEach((date) => {
      const a = byDate[date];
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatDayHeader(date)}</td>
        <td>${a ? `${a.shift_name} (${a.start_time} - ${a.end_time})` : "Libre / sin turno asignado"}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2" class="form-message error">${err.message}</td></tr>`;
  }
}
