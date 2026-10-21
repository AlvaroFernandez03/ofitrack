// routes/absences.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const { countBusinessDays, overlapBusinessDays } = require("../utils/businessDays");
const { sendAbsenceReviewedEmail } = require("../services/email");

const router = express.Router();

const VALID_TYPES = ["vacaciones", "baja_medica", "personal", "otro"];

// ---------------------------------------------------------------------------
// POST /api/absences — solicitar una ausencia nueva
// ---------------------------------------------------------------------------
router.post("/", requireAuth, (req, res) => {
  const { type, start_date, end_date, reason } = req.body;

  if (!type || !start_date || !end_date) {
    return res.status(400).json({ error: "Tipo, fecha de inicio y fecha de fin son obligatorios." });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: "Tipo de ausencia no válido." });
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: "La fecha de fin no puede ser anterior a la de inicio." });
  }

  const result = db
    .prepare(
      `INSERT INTO absences (employee_id, type, start_date, end_date, reason)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.userId, type, start_date, end_date, reason || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// GET /api/absences/me — mis propias solicitudes (cualquier empleado)
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  const absences = db
    .prepare("SELECT * FROM absences WHERE employee_id = ? ORDER BY requested_at DESC")
    .all(req.userId);
  res.json(absences);
});

// ---------------------------------------------------------------------------
// GET /api/absences/team — solicitudes de mi equipo (responsable/admin)
// ---------------------------------------------------------------------------
router.get("/team", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const absences =
    req.userRole === "admin"
      ? db
          .prepare(
            `SELECT a.*, e.name AS employee_name FROM absences a
             JOIN employees e ON e.id = a.employee_id
             ORDER BY a.status = 'pendiente' DESC, a.requested_at DESC`
          )
          .all()
      : db
          .prepare(
            `SELECT a.*, e.name AS employee_name FROM absences a
             JOIN employees e ON e.id = a.employee_id
             WHERE e.manager_id = ?
             ORDER BY a.status = 'pendiente' DESC, a.requested_at DESC`
          )
          .all(req.userId);

  res.json(absences);
});

// ---------------------------------------------------------------------------
// PUT /api/absences/:id/status — aprobar o rechazar una solicitud
// ---------------------------------------------------------------------------
router.put("/:id/status", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { status } = req.body;
  if (!["aprobada", "rechazada"].includes(status)) {
    return res.status(400).json({ error: "Estado no válido." });
  }

  const absence = db
    .prepare(
      `SELECT a.*, e.manager_id, e.name AS employee_name, e.email AS employee_email
       FROM absences a JOIN employees e ON e.id = a.employee_id WHERE a.id = ?`
    )
    .get(req.params.id);
  if (!absence) return res.status(404).json({ error: "Solicitud no encontrada." });

  // Un responsable solo puede revisar solicitudes de SU equipo.
  if (req.userRole === "responsable" && absence.manager_id !== req.userId) {
    return res.status(403).json({ error: "Esta solicitud no pertenece a tu equipo." });
  }

  db.prepare(
    "UPDATE absences SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(status, req.userId, req.params.id);

  res.json({ success: true });

  // Email en segundo plano: si falla o tarda, no afecta a la respuesta ya enviada.
  sendAbsenceReviewedEmail(
    { name: absence.employee_name, email: absence.employee_email },
    { type: absence.type, start_date: absence.start_date, end_date: absence.end_date, status }
  );
});

// ---------------------------------------------------------------------------
// DELETE /api/absences/:id — cancelar una solicitud propia (solo si sigue pendiente)
// ---------------------------------------------------------------------------
router.delete("/:id", requireAuth, (req, res) => {
  const absence = db.prepare("SELECT * FROM absences WHERE id = ?").get(req.params.id);
  if (!absence) return res.status(404).json({ error: "Solicitud no encontrada." });
  if (absence.employee_id !== req.userId) {
    return res.status(403).json({ error: "No puedes cancelar una solicitud que no es tuya." });
  }
  if (absence.status !== "pendiente") {
    return res.status(409).json({ error: "Solo puedes cancelar solicitudes que sigan pendientes." });
  }

  db.prepare("DELETE FROM absences WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/absences/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — % de absentismo
// ---------------------------------------------------------------------------
// Sin employee_id: admin/responsable obtienen el % de CADA empleado de su
// equipo (o de toda la empresa, si son admin) en ese periodo.
router.get("/stats", requireAuth, requireRole("admin", "responsable"), (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "Debes indicar 'from' y 'to' (YYYY-MM-DD)." });
  }

  const team =
    req.userRole === "admin"
      ? db.prepare("SELECT id, name FROM employees WHERE active = 1").all()
      : db.prepare("SELECT id, name FROM employees WHERE manager_id = ? AND active = 1").all(req.userId);

  const totalBusinessDays = countBusinessDays(from, to);

  const result = team.map((emp) => {
    // Cogemos todas las ausencias APROBADAS de este empleado que solapen
    // con el periodo consultado (empiezan antes de que acabe el periodo, y
    // terminan después de que empiece).
    const absences = db
      .prepare(
        `SELECT start_date, end_date FROM absences
         WHERE employee_id = ? AND status = 'aprobada' AND start_date <= ? AND end_date >= ?`
      )
      .all(emp.id, to, from);

    const absentDays = absences.reduce(
      (sum, a) => sum + overlapBusinessDays(a.start_date, a.end_date, from, to),
      0
    );

    const percentage = totalBusinessDays > 0 ? (absentDays / totalBusinessDays) * 100 : 0;

    return {
      employee_id: emp.id,
      name: emp.name,
      absent_days: absentDays,
      total_business_days: totalBusinessDays,
      absenteeism_pct: Number(percentage.toFixed(1)),
    };
  });

  res.json(result);
});

module.exports = router;
