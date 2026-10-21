// utils/businessDays.js

// Cuenta cuántos días laborables (de lunes a viernes, ambos inclusive) hay
// entre dos fechas "YYYY-MM-DD". Usamos esto como base de los días
// laborables totales de un periodo, y también para contar cuántos días de
// una ausencia concreta "cuentan" de verdad (un fin de semana de vacaciones
// no debería contar como absentismo, por ejemplo).
function countBusinessDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr + "T12:00:00");
  const end = new Date(endDateStr + "T12:00:00");
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay(); // 0 = domingo, 6 = sábado
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Calcula el solapamiento entre un rango de ausencia y un rango de consulta
// (por ejemplo, una ausencia de vacaciones que empezó el mes pasado pero
// sigue este mes: solo debe contar la parte que cae DENTRO del periodo que
// estamos consultando). Devuelve los días laborables de esa parte solapada.
function overlapBusinessDays(rangeAStart, rangeAEnd, rangeBStart, rangeBEnd) {
  const start = rangeAStart > rangeBStart ? rangeAStart : rangeBStart; // el más tardío de los dos inicios
  const end = rangeAEnd < rangeBEnd ? rangeAEnd : rangeBEnd;           // el más temprano de los dos finales
  if (start > end) return 0; // no hay solapamiento
  return countBusinessDays(start, end);
}

module.exports = { countBusinessDays, overlapBusinessDays };
