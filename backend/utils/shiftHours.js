// utils/shiftHours.js
// Calcula cuántas horas dura un turno a partir de sus horas de inicio/fin
// (formato "HH:MM"). Si la hora de fin es "menor" que la de inicio (por
// ejemplo, 22:00 -> 06:00), entendemos que el turno cruza la medianoche, y
// sumamos 24 horas para que la resta dé un resultado positivo y correcto.
function shiftDurationHours(startTime, endTime) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // el turno termina "al día siguiente"
  }

  return (endMinutes - startMinutes) / 60;
}

module.exports = { shiftDurationHours };
