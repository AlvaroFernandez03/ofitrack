// routes/departments.js
const express = require("express");
const db = require("../db/database");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const router = express.Router();

// GET /api/departments -> cualquier usuario logueado puede verlos (se usan en formularios)
router.get("/", requireAuth, (req, res) => {
  const departments = db.prepare("SELECT * FROM departments ORDER BY name").all();
  res.json(departments);
});

// POST /api/departments -> solo admin puede crear departamentos nuevos
router.post("/", requireAuth, requireRole("admin"), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre del departamento es obligatorio." });
  }

  try {
    const result = db.prepare("INSERT INTO departments (name) VALUES (?)").run(name.trim());
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (err) {
    res.status(409).json({ error: "Ya existe un departamento con ese nombre." });
  }
});

module.exports = router;
