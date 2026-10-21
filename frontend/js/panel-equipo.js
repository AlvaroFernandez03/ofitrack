// js/panel-equipo.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const currentUser = getStoredUser();
if (!currentUser || (currentUser.role !== "responsable" && currentUser.role !== "admin")) {
  // El backend ya bloquearía cualquier petición desde aquí (requireRole),
  // pero redirigimos antes para no dejar la página a medio cargar.
  window.location.href = "fichar.html";
  throw new Error("Sin permisos.");
}

document.addEventListener("DOMContentLoaded", () => {
  loadTeam();
  setInterval(loadTeam, 30000); // se refresca solo cada 30s, útil si lo dejas en una pantalla del despacho
});

async function loadTeam() {
  const tbody = document.getElementById("team-body");

  try {
    const team = await apiFetch("/clockins/team/today");

    if (team.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>No tienes empleados asignados todavía.</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    team.forEach((emp) => {
      const row = document.createElement("tr");
      const badge = emp.is_clocked_in
        ? `<span class="badge in">Dentro</span>`
        : `<span class="badge out">Fuera</span>`;
      const lastEventText = emp.last_event
        ? `${emp.last_event.type === "in" ? "Entrada" : "Salida"} a las ${parseServerDate(emp.last_event.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
        : "Sin fichajes hoy";

      row.innerHTML = `
        <td>${emp.name}</td>
        <td>${badge}</td>
        <td>${lastEventText}</td>
        <td>${emp.hours_worked_today.toFixed(2)}h</td>
        <td>${emp.overtime_today > 0 ? `<strong style="color:var(--overtime);">+${emp.overtime_today.toFixed(2)}h</strong>` : "—"}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="form-message error">${err.message}</td></tr>`;
  }
}
