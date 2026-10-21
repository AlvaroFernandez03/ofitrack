// db/database.js
const path = require("path");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "ofitrack.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// ---------------------------------------------------------------------------
// TABLAS
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('worker', 'responsable', 'admin')) DEFAULT 'worker',
    department_id INTEGER,
    manager_id INTEGER,               -- id del responsable que supervisa a este empleado (NULL si no tiene)
    daily_hours REAL NOT NULL DEFAULT 8, -- jornada diaria pactada, para calcular horas extra
    active INTEGER NOT NULL DEFAULT 1,   -- 1 = activo, 0 = dado de baja (soft delete, conserva el historial)
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (department_id) REFERENCES departments (id),
    FOREIGN KEY (manager_id) REFERENCES employees (id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS clock_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );
`);

// Tipos de turno disponibles (p. ej. "Mañana 08:00-15:00"). Los gestiona el admin.
db.exec(`
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL, -- formato "HH:MM"
    end_time TEXT NOT NULL,   -- formato "HH:MM" (si es menor que start_time, se entiende que cruza medianoche)
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Qué turno tiene asignado cada empleado en cada fecha concreta. Un empleado
// solo puede tener UN turno por día (restricción UNIQUE), así que asignar
// uno nuevo para un día que ya tenía turno debe hacerse actualizando la fila
// existente, no insertando una segunda.
db.exec(`
  CREATE TABLE IF NOT EXISTS shift_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,     -- formato "YYYY-MM-DD"
    shift_id INTEGER NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (shift_id) REFERENCES shifts (id),
    UNIQUE (employee_id, date)
  );
`);

// Solicitudes de ausencia (vacaciones, baja médica, etc.), con flujo de aprobación.
db.exec(`
  CREATE TABLE IF NOT EXISTS absences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('vacaciones', 'baja_medica', 'personal', 'otro')),
    start_date TEXT NOT NULL, -- "YYYY-MM-DD"
    end_date TEXT NOT NULL,   -- "YYYY-MM-DD" (puede ser igual a start_date si es un solo día)
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('pendiente', 'aprobada', 'rechazada')) DEFAULT 'pendiente',
    reviewed_by INTEGER,      -- quién la aprobó/rechazó (NULL mientras esté pendiente)
    requested_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees (id),
    FOREIGN KEY (reviewed_by) REFERENCES employees (id)
  );
`);

// ---------------------------------------------------------------------------
// DATOS DE EJEMPLO (solo la primera vez que arranca el proyecto)
// ---------------------------------------------------------------------------
const deptCount = db.prepare("SELECT COUNT(*) AS count FROM departments").get().count;

if (deptCount === 0) {
  const insertDept = db.prepare("INSERT INTO departments (name) VALUES (?)");
  const rrhhId = insertDept.run("Recursos Humanos").lastInsertRowid;
  const almacenId = insertDept.run("Almacén y Logística").lastInsertRowid;
  const oficinaId = insertDept.run("Administración").lastInsertRowid;

  const insertEmp = db.prepare(`
    INSERT INTO employees (name, email, password_hash, role, department_id, manager_id, daily_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Contraseña por defecto para TODOS los usuarios de ejemplo: "empleado123"
  // (bcrypt genera un hash distinto cada vez aunque la contraseña sea igual,
  // así que esto es normal y no es un fallo de seguridad).
  const defaultPassword = bcrypt.hashSync("empleado123", 10);

  // 1) Administrador
  const adminId = insertEmp.run(
    "Ana Martín (Admin)", "admin@ofitrack.com", defaultPassword, "admin", oficinaId, null, 8
  ).lastInsertRowid;

  // 2) Responsables de equipo
  const respAlmacenId = insertEmp.run(
    "Javier Ortega (Responsable Almacén)", "javier@ofitrack.com", defaultPassword, "responsable", almacenId, adminId, 8
  ).lastInsertRowid;
  const respOficinaId = insertEmp.run(
    "Sara Domínguez (Responsable Oficina)", "sara@ofitrack.com", defaultPassword, "responsable", oficinaId, adminId, 8
  ).lastInsertRowid;

  // 3) Trabajadores repartidos entre los dos equipos
  insertEmp.run("Pedro Navarro", "pedro@ofitrack.com", defaultPassword, "worker", almacenId, respAlmacenId, 8);
  insertEmp.run("Lucía Fernández", "lucia@ofitrack.com", defaultPassword, "worker", almacenId, respAlmacenId, 8);
  insertEmp.run("Marcos Iglesias", "marcos@ofitrack.com", defaultPassword, "worker", almacenId, respAlmacenId, 6);
  insertEmp.run("Elena Vidal", "elena@ofitrack.com", defaultPassword, "worker", oficinaId, respOficinaId, 8);
  insertEmp.run("Raúl Molina", "raul@ofitrack.com", defaultPassword, "worker", oficinaId, respOficinaId, 8);
  insertEmp.run("Cristina Blanco", "cristina@ofitrack.com", defaultPassword, "worker", rrhhId, respOficinaId, 7);

  console.log("✅ Datos de ejemplo creados. Contraseña para todos: empleado123");
  console.log("   Admin: admin@ofitrack.com | Responsables: javier@ofitrack.com, sara@ofitrack.com");

  // --- Tipos de turno de ejemplo ---
  const insertShift = db.prepare("INSERT INTO shifts (name, start_time, end_time) VALUES (?, ?, ?)");
  const mananaId = insertShift.run("Mañana", "08:00", "15:00").lastInsertRowid;
  const tardeId = insertShift.run("Tarde", "15:00", "22:00").lastInsertRowid;
  insertShift.run("Noche", "22:00", "06:00"); // cruza medianoche (end_time < start_time)

  // --- Asignamos turnos para la semana actual (de lunes a viernes), así el
  //     calendario se ve ya poblado la primera vez que lo abres. Calculamos
  //     el lunes de la semana en la que estemos hoy, sea cual sea el día. ---
  function mondayOfThisWeek() {
    const now = new Date();
    const day = now.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
    const diff = day === 0 ? -6 : 1 - day; // si es domingo, el lunes fue hace 6 días
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  }
  function toDateString(d) {
    // Construimos "YYYY-MM-DD" a partir de los componentes LOCALES de la
    // fecha (no con toISOString(), que usa UTC y podría dar el día
    // equivocado según la zona horaria del ordenador que ejecute esto).
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const monday = mondayOfThisWeek();
  const insertAssignment = db.prepare(
    "INSERT INTO shift_assignments (employee_id, date, shift_id) VALUES (?, ?, ?)"
  );

  // Buscamos los ids de los empleados de ejemplo por su email, ya insertados arriba.
  const byEmail = (email) => db.prepare("SELECT id FROM employees WHERE email = ?").get(email).id;
  const pedroId = byEmail("pedro@ofitrack.com");
  const luciaId = byEmail("lucia@ofitrack.com");
  const marcosId = byEmail("marcos@ofitrack.com");
  const elenaId = byEmail("elena@ofitrack.com");
  const raulId = byEmail("raul@ofitrack.com");
  const cristinaId = byEmail("cristina@ofitrack.com");

  // "today" a medianoche: la usamos como referencia para calcular tanto las
  // fechas de las ausencias de ejemplo como los fichajes simulados de más abajo.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 5; i++) { // lunes(0) a viernes(4)
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = toDateString(date);

    insertAssignment.run(pedroId, dateStr, mananaId);
    insertAssignment.run(luciaId, dateStr, tardeId);
    insertAssignment.run(elenaId, dateStr, mananaId);
    insertAssignment.run(raulId, dateStr, tardeId);
    if (i % 2 === 0) insertAssignment.run(marcosId, dateStr, mananaId); // lunes, miércoles, viernes
  }

  // --- Ausencias de ejemplo, para ver el flujo completo desde el principio ---
  const insertAbsence = db.prepare(`
    INSERT INTO absences (employee_id, type, start_date, end_date, reason, status, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const nextWeek = new Date(monday);
  nextWeek.setDate(monday.getDate() + 7);
  const inTwoWeeks = new Date(monday);
  inTwoWeeks.setDate(monday.getDate() + 14);

  // Una pendiente de revisar (para que el responsable tenga algo que aprobar/rechazar)
  insertAbsence.run(
    luciaId, "vacaciones", toDateString(nextWeek), toDateString(new Date(nextWeek.getTime() + 3 * 86400000)),
    "Viaje familiar ya reservado", "pendiente", null, null
  );
  // Una ya aprobada (cuenta para el % de absentismo)
  insertAbsence.run(
    marcosId, "baja_medica", toDateString(monday), toDateString(new Date(monday.getTime() + 1 * 86400000)),
    "Gripe", "aprobada", respAlmacenId, new Date().toISOString()
  );
  // Una rechazada, para ver también ese estado
  insertAbsence.run(
    raulId, "personal", toDateString(inTwoWeeks), toDateString(inTwoWeeks),
    "Gestión personal", "rechazada", respOficinaId, new Date().toISOString()
  );

  // Resta "n" DÍAS LABORABLES (no naturales) hacia atrás desde una fecha,
  // saltándose sábados y domingos. La usamos para las fechas de las
  // ausencias de ejemplo, así siempre caen en día laborable sin importar
  // qué día de la semana sea "hoy" cuando arranques el proyecto por primera vez.
  function subtractBusinessDays(fromDate, n) {
    const d = new Date(fromDate);
    let remaining = n;
    while (remaining > 0) {
      d.setDate(d.getDate() - 1);
      const weekday = d.getDay();
      if (weekday !== 0 && weekday !== 6) remaining--;
    }
    return d;
  }

  // --- Más ausencias APROBADAS y ya pasadas, repartidas entre varios
  //     empleados de ambos equipos, para que el % de absentismo y el
  //     gráfico de "tipos de ausencia" del panel de informes tengan
  //     variedad real desde el primer momento. ---
  const tenDaysAgo = subtractBusinessDays(today, 7);   // 7º día laborable hacia atrás
  const nineDaysAgo = subtractBusinessDays(today, 6);  // 6º día laborable hacia atrás
  const sevenDaysAgo = subtractBusinessDays(today, 4); // 4º día laborable hacia atrás
  const sixDaysAgo = subtractBusinessDays(today, 3);   // 3er día laborable hacia atrás
  const threeDaysAgo = subtractBusinessDays(today, 1); // día laborable anterior

  // Lucía (equipo Almacén): 1 día de baja médica ya pasado, aparte de su
  // solicitud de vacaciones pendiente para la semana que viene.
  insertAbsence.run(
    luciaId, "baja_medica", toDateString(threeDaysAgo), toDateString(threeDaysAgo),
    "Migraña", "aprobada", respAlmacenId, new Date().toISOString()
  );

  // Elena (equipo Oficina): 1 día de asunto personal (día laborable).
  insertAbsence.run(
    elenaId, "personal", toDateString(sixDaysAgo), toDateString(sixDaysAgo),
    "Cita médica", "aprobada", respOficinaId, new Date().toISOString()
  );

  // Cristina (equipo Oficina): 3 días de vacaciones ya disfrutados.
  insertAbsence.run(
    cristinaId, "vacaciones", toDateString(tenDaysAgo), toDateString(sevenDaysAgo),
    "Puente", "aprobada", respOficinaId, new Date().toISOString()
  );

  // Otra más de "otro" tipo, para que el gráfico de tarta tenga las 4 categorías.
  insertAbsence.run(
    pedroId, "otro", toDateString(nineDaysAgo), toDateString(nineDaysAgo),
    "Trámite administrativo", "aprobada", respAlmacenId, new Date().toISOString()
  );

  // ---------------------------------------------------------------------------
  // FICHAJES SIMULADOS de las últimas 2 semanas, para que el panel de
  // informes (horas, horas extra, tendencias) tenga datos reales desde el
  // primer momento, sin que tengas que fichar manualmente durante 14 días.
  // A propósito NO tocamos el día de HOY, para que puedas seguir probando
  // el fichaje real en fichar.html sin que se mezcle con estos datos de prueba.
  // ---------------------------------------------------------------------------
  function formatTimestamp(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}:00`;
  }

  // Un pequeño generador de números "aleatorios pero con buena pinta", solo
  // para variar un poco los horarios simulados (no necesita ser criptográficamente
  // aleatorio, es únicamente para que los datos de ejemplo no sean todos idénticos).
  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  const insertClockIn = db.prepare(
    "INSERT INTO clock_ins (employee_id, type, timestamp) VALUES (?, ?, ?)"
  );

  // employeesForSeed: cada empleado con su hora de entrada "habitual" y su jornada.
  const employeesForSeed = [
    { id: pedroId, baseStartHour: 8, dailyHours: 8 },
    { id: luciaId, baseStartHour: 15, dailyHours: 8 }, // turno de tarde
    { id: marcosId, baseStartHour: 8, dailyHours: 6 },
    { id: elenaId, baseStartHour: 8, dailyHours: 8 },
    { id: raulId, baseStartHour: 15, dailyHours: 8 },  // turno de tarde
    { id: cristinaId, baseStartHour: 9, dailyHours: 7 },
  ];

  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(today.getDate() - daysAgo);
    const weekday = day.getDay(); // 0 = domingo, 6 = sábado
    if (weekday === 0 || weekday === 6) continue; // nos saltamos los fines de semana

    employeesForSeed.forEach((emp) => {
      // Pequeña variación en la hora de entrada (entre 0 y 12 minutos tarde).
      const entryMinuteOffset = Math.floor(randomBetween(0, 12));
      const entry = new Date(day);
      entry.setHours(emp.baseStartHour, entryMinuteOffset, 0, 0);

      // La mayoría de días termina justo a su jornada; en aprox. 1 de cada 3
      // días hace un poco (o bastante) de horas extra, para que las gráficas
      // de horas extra tengan datos interesantes que mostrar.
      const doesOvertime = Math.random() < 0.35;
      const extraHours = doesOvertime ? randomBetween(0.5, 2.5) : 0;
      const totalHours = emp.dailyHours + extraHours;

      const exit = new Date(entry.getTime() + totalHours * 60 * 60 * 1000);

      // Salvaguarda importante: si sumar la jornada + las horas extra
      // empujara la salida más allá de medianoche (por ejemplo, alguien que
      // entra a las 15:00 y hace varias horas extra), el fichaje de salida
      // caería en el día siguiente y rompería el cálculo de horas (quedaría
      // registrado como si esa persona hubiera seguido fichada desde hace
      // días). Para evitarlo, si eso ocurre, recortamos la salida a las
      // 23:45 del mismo día en el que entró.
      if (exit.getDate() !== entry.getDate() || exit.getMonth() !== entry.getMonth()) {
        exit.setTime(entry.getTime());
        exit.setHours(23, 45, 0, 0);
      }

      insertClockIn.run(emp.id, "in", formatTimestamp(entry));
      insertClockIn.run(emp.id, "out", formatTimestamp(exit));
    });
  }

  console.log("✅ Fichajes simulados de los últimos 14 días añadidos (hoy queda libre para que pruebes el fichaje real).");
}

module.exports = db;
