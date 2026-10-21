// js/ausencias.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const currentUser = getStoredUser();
const isManagerView = currentUser && (currentUser.role === "responsable" || currentUser.role === "admin");

const TYPE_LABELS = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  personal: "Asunto personal",
  otro: "Otro",
};

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("absence-form").addEventListener("submit", handleRequestSubmit);
  await loadMyAbsences();

  if (isManagerView) {
    document.getElementById("manager-section").classList.remove("hidden");
    await loadTeamAbsences();

    // Por defecto, calculamos las estadísticas del mes en curso.
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById("stats-from").value = toDateInputValue(firstOfMonth);
    document.getElementById("stats-to").value = toDateInputValue(today);

    document.getElementById("stats-form").addEventListener("submit", (e) => {
      e.preventDefault();
      loadStats();
    });
    await loadStats();
  }
});

function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Solicitar una ausencia nueva
// ---------------------------------------------------------------------------
async function handleRequestSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("absence-form-msg");
  msg.textContent = "";
  msg.className = "form-message";

  try {
    await apiFetch("/absences", {
      method: "POST",
      body: JSON.stringify({
        type: document.getElementById("a-type").value,
        start_date: document.getElementById("a-start").value,
        end_date: document.getElementById("a-end").value,
        reason: document.getElementById("a-reason").value.trim(),
      }),
    });
    msg.textContent = "Solicitud enviada correctamente.";
    msg.classList.add("success");
    document.getElementById("absence-form").reset();
    await loadMyAbsences();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}

// ---------------------------------------------------------------------------
// Mis solicitudes (todo el mundo, incluidos responsables y admin: ellos
// también son empleados que pueden pedir vacaciones)
// ---------------------------------------------------------------------------
async function loadMyAbsences() {
  const tbody = document.getElementById("my-absences-body");
  tbody.innerHTML = "<tr><td colspan='5'>Cargando...</td></tr>";

  try {
    const absences = await apiFetch("/absences/me");
    if (absences.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>Todavía no has solicitado ninguna ausencia.</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    absences.forEach((a) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${TYPE_LABELS[a.type] || a.type}</td>
        <td>${a.start_date} → ${a.end_date}</td>
        <td>${a.reason || "—"}</td>
        <td><span class="badge status-${a.status}">${statusLabel(a.status)}</span></td>
        <td>${a.status === "pendiente" ? `<button class="btn btn-outline" data-cancel-id="${a.id}" style="padding:5px 10px; font-size:0.78rem;">Cancelar</button>` : ""}</td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll("[data-cancel-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Cancelar esta solicitud?")) return;
        try {
          await apiFetch(`/absences/${btn.dataset.cancelId}`, { method: "DELETE" });
          await loadMyAbsences();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="form-message error">${err.message}</td></tr>`;
  }
}

function statusLabel(status) {
  return { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" }[status] || status;
}

// ---------------------------------------------------------------------------
// Solicitudes del equipo (responsable/admin): aprobar/rechazar
// ---------------------------------------------------------------------------
async function loadTeamAbsences() {
  const tbody = document.getElementById("team-absences-body");
  tbody.innerHTML = "<tr><td colspan='6'>Cargando...</td></tr>";

  try {
    const absences = await apiFetch("/absences/team");
    if (absences.length === 0) {
      tbody.innerHTML = "<tr><td colspan='6'>No hay solicitudes de tu equipo todavía.</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    absences.forEach((a) => {
      const row = document.createElement("tr");
      const actions =
        a.status === "pendiente"
          ? `<button class="btn btn-primary" data-approve-id="${a.id}" style="padding:5px 10px; font-size:0.78rem;">Aprobar</button>
             <button class="btn btn-danger" data-reject-id="${a.id}" style="padding:5px 10px; font-size:0.78rem;">Rechazar</button>`
          : "—";

      row.innerHTML = `
        <td>${a.employee_name}</td>
        <td>${TYPE_LABELS[a.type] || a.type}</td>
        <td>${a.start_date} → ${a.end_date}</td>
        <td>${a.reason || "—"}</td>
        <td><span class="badge status-${a.status}">${statusLabel(a.status)}</span></td>
        <td style="display:flex; gap:6px;">${actions}</td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll("[data-approve-id]").forEach((btn) => {
      btn.addEventListener("click", () => reviewAbsence(btn.dataset.approveId, "aprobada"));
    });
    tbody.querySelectorAll("[data-reject-id]").forEach((btn) => {
      btn.addEventListener("click", () => reviewAbsence(btn.dataset.rejectId, "rechazada"));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="form-message error">${err.message}</td></tr>`;
  }
}

async function reviewAbsence(id, status) {
  try {
    await apiFetch(`/absences/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
    await loadTeamAbsences();
    await loadStats(); // aprobar una ausencia puede cambiar el % de absentismo, así que refrescamos
  } catch (err) {
    alert(err.message);
  }
}

// ---------------------------------------------------------------------------
// Estadísticas de % de absentismo por empleado, en el periodo elegido
// ---------------------------------------------------------------------------
async function loadStats() {
  const tbody = document.getElementById("stats-body");
  tbody.innerHTML = "<tr><td colspan='4'>Calculando...</td></tr>";

  const from = document.getElementById("stats-from").value;
  const to = document.getElementById("stats-to").value;
  if (!from || !to) return;

  try {
    const stats = await apiFetch(`/absences/stats?from=${from}&to=${to}`);

    if (stats.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4'>No tienes empleados asignados todavía.</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    stats.forEach((s) => {
      const row = document.createElement("tr");
      const barClass = s.absenteeism_pct >= 15 ? "stats-bar-fill high" : "stats-bar-fill";
      row.innerHTML = `
        <td>${s.name}</td>
        <td>${s.absent_days} / ${s.total_business_days} días laborables</td>
        <td style="min-width:140px;">
          <div class="stats-bar-track"><div class="${barClass}" style="width:${Math.min(100, s.absenteeism_pct)}%;"></div></div>
        </td>
        <td><strong>${s.absenteeism_pct}%</strong></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="form-message error">${err.message}</td></tr>`;
  }
}
