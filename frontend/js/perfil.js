// js/perfil.js
if (!requireLogin()) throw new Error("Redirigiendo a login...");

const ROLE_LABELS = { worker: "Trabajador", responsable: "Responsable", admin: "Administrador" };

document.addEventListener("DOMContentLoaded", async () => {
  await loadMyProfile();
  document.getElementById("password-form").addEventListener("submit", handlePasswordChange);
});

async function loadMyProfile() {
  try {
    const me = await apiFetch("/employees/me");
    document.getElementById("p-name").textContent = me.name;
    document.getElementById("p-email").textContent = me.email;
    document.getElementById("p-role").textContent = ROLE_LABELS[me.role] || me.role;
    document.getElementById("p-department").textContent = me.department_name || "—";
    document.getElementById("p-manager").textContent = me.manager_name || "—";
    document.getElementById("p-hours").textContent = me.daily_hours + "h / día";
  } catch (err) {
    document.getElementById("profile-info").innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const msg = document.getElementById("password-form-msg");
  msg.textContent = "";
  msg.className = "form-message";

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    msg.textContent = "La nueva contraseña y su confirmación no coinciden.";
    msg.classList.add("error");
    return;
  }

  try {
    await apiFetch("/employees/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    msg.textContent = "Contraseña actualizada correctamente.";
    msg.classList.add("success");
    document.getElementById("password-form").reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error");
  }
}
