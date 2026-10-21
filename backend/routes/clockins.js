// routes/clockins.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { getExpectedHours, computeWorkedHours, groupByDay } = require("../utils/hoursCalculator");

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/clockins — fichar entrada o salida { type: "in" | "out" }
// ---------------------------------------------------------------------------
router.post("/", requireAuth, (req, res) => {
  const { type } = req.body;
  if (!["in", "out"].includes(type)) {
    return res.status(400).json({ error: "Tipo de fichaje no válido." });
  }

  // Comprobamos cuál fue el último fichaje de este empleado, para no dejar
  // fichar dos entradas (o dos salidas) seguidas sin sentido.
  const last = db
    .prepare("SELECT * FROM clock_ins WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 1")
    .get(req.userId);

  if (type === "in" && last && last.type === "in") {
    return res.status(409).json({ error: "Ya has fichado entrada. Ficha salida antes de volver a entrar." });
  }
  if (type === "out" && (!last || last.type === "out")) {
    return res.status(409).json({ error: "No puedes fichar salida sin haber fichado entrada antes." });
  }

  // Usamos siempre la hora del SERVIDOR (no la que pudiera mandar el
  // navegador), para que nadie pueda manipular su propio fichaje cambiando
  // la hora de su ordenador.
  const result = db
    .prepare("INSERT INTO clock_ins (employee_id, type) VALUES (?, ?)")
    .run(req.userId, type);

  res.status(201).json({ id: result.lastInsertRowid, type });
});

// ---------------------------------------------------------------------------
// GET /api/clockins/status — estado actual + resumen de hoy
// ---------------------------------------------------------------------------
router.get("/status", requireAuth, (req, res) => {
  const employee = db.prepare("SELECT daily_hours FROM employees WHERE id = ?").get(req.userId);

  // datetime('now', 'localtime', 'start of day') calcula la medianoche de
  // hoy directamente en SQLite, para filtrar solo los fichajes de hoy.
  const todayClockIns = db
    .prepare(
      `SELECT * FROM clock_ins
       WHERE employee_id = ? AND timestamp >= datetime('now', 'localtime', 'start of day')
       ORDER BY timestamp ASC`
    )
    .all(req.userId);

  const todayStr = db.prepare("SELECT date('now', 'localtime') AS today").get().today;
  const expectedHours = getExpectedHours(req.userId, todayStr, employee.daily_hours);

  const { hours, stillClockedIn } = computeWorkedHours(todayClockIns);
  const overtime = Math.max(0, hours - expectedHours);

  res.json({
    is_clocked_in: stillClockedIn,
    today_clock_ins: todayClockIns,
    hours_worked_today: Number(hours.toFixed(2)),
    daily_hours: expectedHours,
    overtime_today: Number(overtime.toFixed(2)),
  });
});

// ---------------------------------------------------------------------------
// GET /api/clockins/me?days=30 — mi historial agrupado por día
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  const days = Math.min(90, Number(req.query.days) || 30); // límite razonable para no pedir años de golpe
  const employee = db.prepare("SELECT daily_hours FROM employees WHERE id = ?").get(req.userId);

  const clockIns = db
    .prepare(
      `SELECT * FROM clock_ins
       WHERE employee_id = ? AND timestamp >= datetime('now', 'localtime', '-' || ? || ' days')
       ORDER BY timestamp ASC`
    )
    .all(req.userId, days);

  const grouped = groupByDay(clockIns);

  // Object.entries convierte { "2026-01-15": [...] } en pares [clave, valor],
  // y con .map construimos el resumen final de cada día.
  const summary = Object.entries(grouped)
    .map(([day, entries]) => {
      const { hours } = computeWorkedHours(entries);
      const expectedHours = getExpectedHours(req.userId, day, employee.daily_hours);
      return {
        date: day,
        entries,
        hours_worked: Number(hours.toFixed(2)),
        expected_hours: Number(expectedHours.toFixed(2)),
        overtime: Number(Math.max(0, hours - expectedHours).toFixed(2)),
      };
    })
    // Ordenamos del día más reciente al más antiguo para el historial.
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  res.json(summary);
});

// ---------------------------------------------------------------------------
// GET /api/clockins/team/today — estado de hoy del equipo (responsable/admin)
// ---------------------------------------------------------------------------
router.get("/team/today", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const team =
    req.userRole === "admin"
      ? db.prepare("SELECT id, name, daily_hours FROM employees WHERE active = 1 AND id != ?").all(req.userId)
      : db.prepare("SELECT id, name, daily_hours FROM employees WHERE manager_id = ? AND active = 1").all(req.userId);

  const todayStr = db.prepare("SELECT date('now', 'localtime') AS today").get().today;

  const result = team.map((emp) => {
    const todayClockIns = db
      .prepare(
        `SELECT * FROM clock_ins
         WHERE employee_id = ? AND timestamp >= datetime('now', 'localtime', 'start of day')
         ORDER BY timestamp ASC`
      )
      .all(emp.id);

    const { hours, stillClockedIn } = computeWorkedHours(todayClockIns);
    const expectedHours = getExpectedHours(emp.id, todayStr, emp.daily_hours);

    return {
      id: emp.id,
      name: emp.name,
      is_clocked_in: stillClockedIn,
      hours_worked_today: Number(hours.toFixed(2)),
      expected_hours_today: Number(expectedHours.toFixed(2)),
      overtime_today: Number(Math.max(0, hours - expectedHours).toFixed(2)),
      last_event: todayClockIns.length > 0 ? todayClockIns[todayClockIns.length - 1] : null,
    };
  });

  res.json(result);
});

module.exports = router;
