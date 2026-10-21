// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/database");

const router = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son obligatorios." });
  }

  const employee = db
    .prepare("SELECT * FROM employees WHERE email = ? AND active = 1")
    .get(email.toLowerCase());

  if (!employee) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  const passwordMatches = bcrypt.compareSync(password, employee.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  const token = jwt.sign({ userId: employee.id }, process.env.JWT_SECRET, { expiresIn: "12h" });

  res.json({
    token,
    user: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      daily_hours: employee.daily_hours,
    },
  });
});

module.exports = router;
