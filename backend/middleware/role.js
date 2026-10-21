// middleware/role.js
// Debe usarse SIEMPRE después de requireAuth. A diferencia del gimnasio (que
// solo tenía "user"/"admin"), aquí hay tres niveles, así que este middleware
// es una "fábrica": requireRole("admin") o requireRole("admin", "responsable")
// devuelve una función de middleware ya configurada con esos roles permitidos.

const db = require("../db/database");

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const employee = db.prepare("SELECT role FROM employees WHERE id = ?").get(req.userId);

    if (!employee || !allowedRoles.includes(employee.role)) {
      return res.status(403).json({ error: "No tienes permisos para acceder a esto." });
    }

    // Guardamos el rol para que la propia ruta pueda usarlo si necesita
    // distinguir comportamiento entre "admin" y "responsable", por ejemplo.
    req.userRole = employee.role;
    next();
  };
}

module.exports = requireRole;
