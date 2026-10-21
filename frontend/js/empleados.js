// js/empleados.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const currentUser = getStoredUser();
if (!currentUser || currentUser.role !== "admin") {
  window.location.href = "fichar.html";
  throw new Error("Sin permisos.");
}

let editingId = null;
let departmentsCache = [];
let managersCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  await loadDepartments();
  await loadEmployees();

  document.getElementById("employee-form").addEventListener("submit", handleSubmit);
  document.getElementById("cancel-edit-btn").addEventListener("click", resetForm);
});

async function loadDepartments() {
  departmentsCache = await apiFetch("/departments");
  const select = document.getElementById("f-department");
  select.innerHTML =
    `<option value="">Sin departamento</option>` +
    departmentsCache.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
}

async function loadEmployees() {
  const tbody = document.getElementById("employees-body");
  tbody.innerHTML = "<tr><td colspan='7'>Cargando...</td></tr>";

  try {
    const employees = await apiFetch("/employees");

    // Guardamos qué empleados pueden ser "responsable" de otros, para el desplegable del formulario.
    managersCache = employees.filter((e) => e.role === "responsable" || e.role === "admin");
    const managerSelect = document.getElementById("f-manager");
    managerSelect.innerHTML =
      `<option value="">Sin responsable</option>` +
      managersCache.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");

    tbody.innerHTML = "";
    employees.forEach((emp) => {
      const row = document.createElement("tr");
      if (!emp.active) row.style.opacity = "0.5";

      row.innerHTML = `
        <td>${emp.name}</td>
        <td>${emp.email}</td>
        <td><span class="badge role-${emp.role}">${roleLabel(emp.role)}</span></td>
        <td>${emp.department_name || "—"}</td>
        <td>${emp.manager_name || "—"}</td>
        <td>${emp.daily_hours}h</td>
        <td>
          <button class="btn btn-outline" data-edit-id="${emp.id}" style="padding:6px 12px; font-size:0.8rem;">Editar</button>
        </td>
      `;
      tbody.appendChild(row);

      row.querySelector("[data-edit-id]").addEventListener("click", () => startEdit(emp));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="form-message error">${err.message}</td></tr>`;
  }
}

function roleLabel(role) {
  return { worker: "Trabajador", responsable: "Responsable", admin: "Admin" }[role] || role;
}

function startEdit(emp) {
  editingId = emp.id;
  document.getElementById("f-name").value = emp.name;
  document.getElementById("f-email").value = emp.email;
  document.getElementById("f-email").disabled = true; // el email no se puede cambiar una vez creado
  document.getElementById("f-password-field").classList.add("hidden"); // al editar no se cambia la contraseña aquí
  document.getElementById("f-role").value = emp.role;
  document.getElementById("f-department").value = emp.department_id || "";
  document.getElementById("f-manager").value = emp.manager_id || "";
  document.getElementById("f-daily-hours").value = emp.daily_hours;
  document.getElementById("f-active").checked = !!emp.active;
  document.getElementById("f-active-field").classList.remove("hidden");
  document.getElementById("form-title").textContent = `Editando: ${emp.name}`;
  document.getElementById("cancel-edit-btn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  document.getElementById("employee-form").reset();
  document.getElementById("f-email").disabled = false;
  document.getElementById("f-password-field").classList.remove("hidden");
  document.getElementById("f-active-field").classList.add("hidden");
  document.getElementById("form-title").textContent = "Dar de alta un empleado";
  document.getElementById("cancel-edit-btn").classList.add("hidden");
}

async function handleSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById("form-msg");
  msg.textContent = "";
  msg.className = "form-message";

  const payload = {
    name: document.getElementById("f-name").value.trim(),
    email: document.getElementById("f-email").value.trim(),
    role: document.getElementById("f-role").value,
    department_id: document.getElementById("f-department").value || null,
    manager_id: document.getElementById("f-manager").value || null,
    daily_hours: document.getElementById("f-daily-hours").value,
  };

  try {
    if (editingId) {
      payload.active = document.getElementById("f-active").checked;
      await apiFetch(`/employees/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      msg.textContent = "Empleado actualizado.";
    } else {
      payload.password = document.getElementById("f-password").value;
      await apiFetch("/employees", { method: "POST", body: JSON.stringify(payload) });
      msg.textContent = "Empleado dado de alta correctamente.";
    }
    msg.classList.add("success");
    resetForm();
    await loadEmployees();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}
