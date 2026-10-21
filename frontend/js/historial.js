// js/historial.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

document.addEventListener("DOMContentLoaded", loadHistory);

async function loadHistory() {
  const tbody = document.getElementById("history-body");
  tbody.innerHTML = "<tr><td colspan='4'>Cargando...</td></tr>";

  try {
    const days = await apiFetch("/clockins/me?days=30");

    if (days.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4'>Todavía no tienes fichajes registrados.</td></tr>";
      return;
    }

    tbody.innerHTML = "";
    days.forEach((d) => {
      const entradas = d.entries
        .map((e) => `${e.type === "in" ? "Entrada" : "Salida"} ${formatTime(e.timestamp)}`)
        .join(" · ");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatDate(d.date)}</td>
        <td>${entradas}</td>
        <td>${d.hours_worked.toFixed(2)}h</td>
        <td>${d.overtime > 0 ? `<span style="color:var(--overtime); font-weight:600;">+${d.overtime.toFixed(2)}h</span>` : "—"}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="form-message error">${err.message}</td></tr>`;
  }
}

function formatDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}
function formatTime(isoTimestamp) {
  return parseServerDate(isoTimestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
