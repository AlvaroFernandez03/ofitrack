// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const employeeRoutes = require("./routes/employees");
const departmentRoutes = require("./routes/departments");
const clockinRoutes = require("./routes/clockins");
const shiftRoutes = require("./routes/shifts");
const scheduleRoutes = require("./routes/schedule");
const absenceRoutes = require("./routes/absences");
const reportRoutes = require("./routes/reports");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Solo en la demo pública del portfolio (DEMO=1): cinta con las cuentas de prueba. Ver demo.js.
require("./demo")(app, path.join(__dirname, "..", "frontend"));
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/clockins", clockinRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/absences", absenceRoutes);
app.use("/api/reports", reportRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`✅ OfiTrack corriendo en http://localhost:${PORT}`);
});
