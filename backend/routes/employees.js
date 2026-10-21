// routes/employees.js
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { sendPasswordChangedEmail } = require("../services/email");

const router = express.Router();

// Consulta reutilizable con los datos "seguros" de un empleado (sin password_hash),
// incluyendo el nombre de su departamento y de su responsable para mostrarlos ya listos.
const SAFE_SELECT = `
  SELECT e.id, e.name, e.email, e.role, e.department_id, e.manager_id, e.daily_hours, e.active,
         d.name AS department_name, m.name AS manager_name
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN employees m ON m.id = e.manager_id
`;

// ---------------------------------------------------------------------------
// GET /api/employees -> listado, distinto según el rol de quien pregunta
// ---------------------------------------------------------------------------
router.get("/", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  let employees;

  if (req.userRole === "admin") {
    // El admin ve a todo el mundo (incluidos los dados de baja, para poder consultarlos).
    employees = db.prepare(`${SAFE_SELECT} ORDER BY e.active DESC, e.name`).all();
  } else {
    // Un responsable solo ve a las personas que tiene asignadas como manager_id.
    employees = db
      .prepare(`${SAFE_SELECT} WHERE e.manager_id = ? AND e.active = 1 ORDER BY e.name`)
      .all(req.userId);
  }

  res.json(employees);
});

// GET /api/employees/me -> datos propios (cualquier empleado, para su perfil/cabecera)
router.get("/me", requireAuth, (req, res) => {
  const employee = db.prepare(`${SAFE_SELECT} WHERE e.id = ?`).get(req.userId);
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado." });
  res.json(employee);
});

// ---------------------------------------------------------------------------
// PUT /api/employees/me/password -> cualquier empleado cambia SU PROPIA
// contraseña, siempre que confirme la contraseña actual (no hace falta ser
// admin: es una acción de autoservicio).
// ---------------------------------------------------------------------------
router.put("/me/password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Debes indicar tu contraseña actual y la nueva." });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
  }

  const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(req.userId);
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado." });

  // Exigimos la contraseña actual antes de dejar cambiarla: así, si alguien
  // deja su sesión abierta en un ordenador compartido, no basta con eso
  // para poder secuestrarle la cuenta cambiándole la contraseña sin más.
  const currentMatches = bcrypt.compareSync(current_password, employee.password_hash);
  if (!currentMatches) {
    return res.status(401).json({ error: "La contraseña actual no es correcta." });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE employees SET password_hash = ? WHERE id = ?").run(newHash, req.userId);

  res.json({ success: true });

  // Aviso de seguridad por email en segundo plano: si alguien cambiara tu
  // contraseña sin que fueras tú, te enterarías. No bloquea la respuesta.
  sendPasswordChangedEmail(employee);
});

// ---------------------------------------------------------------------------
// POST /api/employees -> dar de alta un empleado nuevo (solo admin)
// ---------------------------------------------------------------------------
router.post("/", requireAuth, requireRole("admin"), (req, res) => {
  const { name, email, password, role, department_id, manager_id, daily_hours } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Nombre, email, contraseña y rol son obligatorios." });
  }
  if (!["worker", "responsable", "admin"].includes(role)) {
    return res.status(400).json({ error: "Rol no válido." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  const existing = db.prepare("SELECT id FROM employees WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "Ya existe un empleado con ese email." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db
    .prepare(
      `INSERT INTO employees (name, email, password_hash, role, department_id, manager_id, daily_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      email.toLowerCase(),
      passwordHash,
      role,
      department_id || null,
      manager_id || null,
      Number(daily_hours) || 8
    );

  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// PUT /api/employees/:id -> editar un empleado existente (solo admin)
// ---------------------------------------------------------------------------
router.put("/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { name, role, department_id, manager_id, daily_hours, active } = req.body;

  const existing = db.prepare("SELECT id FROM employees WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Empleado no encontrado." });

  db.prepare(
    `UPDATE employees
     SET name = ?, role = ?, department_id = ?, manager_id = ?, daily_hours = ?, active = ?
     WHERE id = ?`
  ).run(
    name,
    role,
    department_id || null,
    manager_id || null,
    Number(daily_hours) || 8,
    active ? 1 : 0,
    req.params.id
  );

  res.json({ success: true });
});

module.exports = router;
