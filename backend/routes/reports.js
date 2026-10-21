// routes/reports.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { getExpectedHours, computeWorkedHours, groupByDay } = require("../utils/hoursCalculator");
const { overlapBusinessDays } = require("../utils/businessDays");

const router = express.Router();

// Devuelve el equipo visible para quien pregunta: todos los activos si es
// admin, o solo su equipo si es responsable. Se reutiliza en varios informes.
function getVisibleTeam(req) {
  return req.userRole === "admin"
    ? db.prepare("SELECT id, name, daily_hours FROM employees WHERE active = 1").all()
    : db.prepare("SELECT id, name, daily_hours FROM employees WHERE manager_id = ? AND active = 1").all(req.userId);
}

// ---------------------------------------------------------------------------
// GET /api/reports/overtime?from=&to= — horas trabajadas y extra acumuladas
// por empleado en el periodo (para el gráfico de barras)
// ---------------------------------------------------------------------------
router.get("/overtime", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "Debes indicar 'from' y 'to' (YYYY-MM-DD)." });

  const team = getVisibleTeam(req);

  const result = team.map((emp) => {
    const clockIns = db
      .prepare(
        `SELECT * FROM clock_ins
         WHERE employee_id = ? AND timestamp >= ? AND timestamp < datetime(?, '+1 day')
         ORDER BY timestamp ASC`
      )
      .all(emp.id, from, to);

    const grouped = groupByDay(clockIns);
    let totalHours = 0;
    let totalOvertime = 0;

    Object.entries(grouped).forEach(([day, entries]) => {
      const { hours } = computeWorkedHours(entries);
      const expected = getExpectedHours(emp.id, day, emp.daily_hours);
      totalHours += hours;
      totalOvertime += Math.max(0, hours - expected);
    });

    return {
      employee_id: emp.id,
      name: emp.name,
      total_hours: Number(totalHours.toFixed(1)),
      total_overtime: Number(totalOvertime.toFixed(1)),
    };
  });

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/reports/hours-trend?from=&to= — total de horas trabajadas del
// equipo, día a día (para el gráfico de tendencia/línea)
// ---------------------------------------------------------------------------
router.get("/hours-trend", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "Debes indicar 'from' y 'to' (YYYY-MM-DD)." });

  const team = getVisibleTeam(req);
  if (team.length === 0) return res.json([]);

  const placeholders = team.map(() => "?").join(",");

  const clockIns = db
    .prepare(
      `SELECT * FROM clock_ins
       WHERE employee_id IN (${placeholders}) AND timestamp >= ? AND timestamp < datetime(?, '+1 day')
       ORDER BY timestamp ASC`
    )
    .all(...team.map((t) => t.id), from, to);

  const byEmployee = {};
  clockIns.forEach((c) => {
    (byEmployee[c.employee_id] = byEmployee[c.employee_id] || []).push(c);
  });

  const totalsByDay = {};
  Object.values(byEmployee).forEach((employeeClockIns) => {
    const grouped = groupByDay(employeeClockIns);
    Object.entries(grouped).forEach(([day, entries]) => {
      const { hours } = computeWorkedHours(entries);
      totalsByDay[day] = (totalsByDay[day] || 0) + hours;
    });
  });

  const result = Object.entries(totalsByDay)
    .map(([date, hours]) => ({ date, hours: Number(hours.toFixed(1)) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/reports/absence-types?from=&to= — días de ausencia aprobados por
// tipo, dentro del periodo (para el gráfico de tarta)
// ---------------------------------------------------------------------------
router.get("/absence-types", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "Debes indicar 'from' y 'to' (YYYY-MM-DD)." });

  const team = getVisibleTeam(req);
  if (team.length === 0) return res.json([]);

  const placeholders = team.map(() => "?").join(",");
  const absences = db
    .prepare(
      `SELECT type, start_date, end_date FROM absences
       WHERE employee_id IN (${placeholders}) AND status = 'aprobada' AND start_date <= ? AND end_date >= ?`
    )
    .all(...team.map((t) => t.id), to, from);

  const totalsByType = {};
  absences.forEach((a) => {
    const days = overlapBusinessDays(a.start_date, a.end_date, from, to);
    totalsByType[a.type] = (totalsByType[a.type] || 0) + days;
  });

  const result = Object.entries(totalsByType).map(([type, days]) => ({ type, days }));
  res.json(result);
});

module.exports = router;
