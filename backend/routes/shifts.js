// routes/shifts.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const router = express.Router();

// GET /api/shifts -> cualquier empleado logueado puede ver los tipos de turno existentes
router.get("/", requireAuth, (req, res) => {
  const shifts = db.prepare("SELECT * FROM shifts ORDER BY start_time").all();
  res.json(shifts);
});

// POST /api/shifts -> crear un tipo de turno nuevo (solo admin)
router.post("/", requireAuth, requireRole("admin"), (req, res) => {
  const { name, start_time, end_time } = req.body;
  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: "Nombre, hora de inicio y hora de fin son obligatorios." });
  }

  const result = db
    .prepare("INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)")
    .run(name.trim(), start_time, end_time);

  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/shifts/:id -> borrar un tipo de turno (solo admin)
router.delete("/:id", requireAuth, requireRole("admin"), (req, res) => {
  // Si hay asignaciones que usan este turno, las borramos también (si no, la
  // clave foránea quedaría apuntando a un turno que ya no existe).
  db.prepare("DELETE FROM shift_assignments WHERE shift_id = ?").run(req.params.id);
  db.prepare("DELETE FROM shifts WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
