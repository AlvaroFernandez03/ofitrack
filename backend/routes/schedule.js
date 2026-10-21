// routes/schedule.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const router = express.Router();

// ---------------------------------------------------------------------------
// Función auxiliar: dada una fecha cualquiera dentro de una semana, devuelve
// las 7 fechas ("YYYY-MM-DD") de esa semana, empezando en lunes.
// ---------------------------------------------------------------------------
function weekDatesFrom(anchorDateStr) {
  // new Date("YYYY-MM-DD") lo interpreta como medianoche UTC; le sumamos la
  // hora local a mediodía para evitar que un desfase de zona horaria nos
  // cambie el día al hacer los cálculos siguientes.
  const anchor = new Date(anchorDateStr + "T12:00:00");
  const day = anchor.getDay(); // 0 = domingo ... 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day2 = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day2}`);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// GET /api/schedule?start=YYYY-MM-DD — calendario del equipo (admin/responsable)
// ---------------------------------------------------------------------------
router.get("/", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const anchor = req.query.start || new Date().toISOString().slice(0, 10);
  const weekDates = weekDatesFrom(anchor);

  const team =
    req.userRole === "admin"
      ? db.prepare("SELECT id, name FROM employees WHERE active = 1 ORDER BY name").all()
      : db.prepare("SELECT id, name FROM employees WHERE manager_id = ? AND active = 1 ORDER BY name").all(req.userId);

  const placeholders = weekDates.map(() => "?").join(",");
  const assignments =
    team.length === 0
      ? []
      : db
          .prepare(
            `SELECT sa.id, sa.employee_id, sa.date, sa.shift_id, s.name AS shift_name, s.start_time, s.end_time
             FROM shift_assignments sa
             JOIN shifts s ON s.id = sa.shift_id
             WHERE sa.date IN (${placeholders}) AND sa.employee_id IN (${team.map(() => "?").join(",")})`
          )
          .all(...weekDates, ...team.map((t) => t.id));

  res.json({ week_start: weekDates[0], week_dates: weekDates, team, assignments });
});

// ---------------------------------------------------------------------------
// GET /api/schedule/me?start=YYYY-MM-DD — mi propio calendario (solo lectura)
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  const anchor = req.query.start || new Date().toISOString().slice(0, 10);
  const weekDates = weekDatesFrom(anchor);
  const placeholders = weekDates.map(() => "?").join(",");

  const assignments = db
    .prepare(
      `SELECT sa.date, sa.shift_id, s.name AS shift_name, s.start_time, s.end_time
       FROM shift_assignments sa
       JOIN shifts s ON s.id = sa.shift_id
       WHERE sa.employee_id = ? AND sa.date IN (${placeholders})`
    )
    .all(req.userId, ...weekDates);

  res.json({ week_start: weekDates[0], week_dates: weekDates, assignments });
});

// ---------------------------------------------------------------------------
// POST /api/schedule — asignar (o cambiar) el turno de un empleado en un día
// { employee_id, date, shift_id }
// ---------------------------------------------------------------------------
router.post("/", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { employee_id, date, shift_id } = req.body;
  if (!employee_id || !date || !shift_id) {
    return res.status(400).json({ error: "Faltan datos (empleado, fecha o turno)." });
  }

  // Un responsable solo puede tocar el calendario de SU equipo, nunca el de
  // otro equipo, aunque conociera el id de ese empleado.
  if (req.userRole === "responsable") {
    const employee = db.prepare("SELECT manager_id FROM employees WHERE id = ?").get(employee_id);
    if (!employee || employee.manager_id !== req.userId) {
      return res.status(403).json({ error: "Ese empleado no pertenece a tu equipo." });
    }
  }

  // "INSERT ... ON CONFLICT" es un "upsert": si ya existía una asignación
  // para ese empleado+fecha (choca con la restricción UNIQUE), en vez de dar
  // error, ACTUALIZA la fila existente con el nuevo turno.
  db.prepare(
    `INSERT INTO shift_assignments (employee_id, date, shift_id) VALUES (?, ?, ?)
     ON CONFLICT (employee_id, date) DO UPDATE SET shift_id = excluded.shift_id`
  ).run(employee_id, date, shift_id);

  res.status(201).json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/schedule — quitar el turno de un empleado en un día
// { employee_id, date } (se pasan por query string)
// ---------------------------------------------------------------------------
router.delete("/", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { employee_id, date } = req.query;
  if (!employee_id || !date) {
    return res.status(400).json({ error: "Faltan datos (empleado o fecha)." });
  }

  if (req.userRole === "responsable") {
    const employee = db.prepare("SELECT manager_id FROM employees WHERE id = ?").get(employee_id);
    if (!employee || employee.manager_id !== req.userId) {
      return res.status(403).json({ error: "Ese empleado no pertenece a tu equipo." });
    }
  }

  db.prepare("DELETE FROM shift_assignments WHERE employee_id = ? AND date = ?").run(employee_id, date);
  res.json({ success: true });
});

module.exports = router;
