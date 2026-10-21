// utils/hoursCalculator.js
const db = require("../db/database");
const { shiftDurationHours } = require("./shiftHours");

// ¿Cuántas horas se esperan de este empleado en esta fecha concreta? Si tiene
// un turno asignado ese día, usamos la duración de ese turno; si no, su
// jornada por defecto (daily_hours).
function getExpectedHours(employeeId, dateStr, defaultDailyHours) {
  const assignment = db
    .prepare(
      `SELECT s.start_time, s.end_time
       FROM shift_assignments sa
       JOIN shifts s ON s.id = sa.shift_id
       WHERE sa.employee_id = ? AND sa.date = ?`
    )
    .get(employeeId, dateStr);

  if (!assignment) return defaultDailyHours;
  return shiftDurationHours(assignment.start_time, assignment.end_time);
}

// Dado un array de fichajes de UN MISMO DÍA (ordenados ascendente), calcula
// las horas trabajadas emparejando entradas con salidas secuencialmente.
function computeWorkedHours(dayClockIns, now = new Date()) {
  let totalMs = 0;
  let stillClockedIn = false;
  let openEntry = null;

  for (const entry of dayClockIns) {
    if (entry.type === "in") {
      openEntry = entry;
    } else if (entry.type === "out" && openEntry) {
      totalMs += new Date(entry.timestamp) - new Date(openEntry.timestamp);
      openEntry = null;
    }
  }

  if (openEntry) {
    stillClockedIn = true;
    totalMs += now - new Date(openEntry.timestamp);
  }

  const hours = totalMs / (1000 * 60 * 60);
  return { hours: Math.max(0, hours), stillClockedIn };
}

// Agrupa una lista de fichajes (de varios días) en { "2026-01-15": [...], ... }
function groupByDay(clockIns) {
  const groups = {};
  clockIns.forEach((c) => {
    const day = c.timestamp.slice(0, 10);
    (groups[day] = groups[day] || []).push(c);
  });
  return groups;
}

module.exports = { getExpectedHours, computeWorkedHours, groupByDay };
