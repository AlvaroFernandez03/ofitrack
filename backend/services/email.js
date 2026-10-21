// services/email.js
//
// Envío de emails con Resend. Igual que en el proyecto del gimnasio: si no
// has configurado RESEND_API_KEY en tu .env, este módulo no envía nada (y
// lo avisa por consola una sola vez), para que el resto de la web funcione
// con normalidad aunque no hayas montado el email.

const { Resend } = require("resend");

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = "OfiTrack <onboarding@resend.dev>";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

let warnedOnce = false;
function warnIfNotConfigured() {
  if (!resend && !warnedOnce) {
    console.log("ℹ️  RESEND_API_KEY no configurada: los emails no se enviarán (ver README).");
    warnedOnce = true;
  }
}

function wrapEmailHtml(title, bodyHtml) {
  return `
  <div style="font-family: Arial, sans-serif; background:#f4f5f7; padding:32px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;">
      <div style="background:#1f2937; color:#ffffff; padding:20px 28px;">
        <span style="font-size:19px; font-weight:bold;">Ofi<span style="color:#60a5fa;">Track</span></span>
      </div>
      <div style="padding:28px;">
        <h1 style="font-size:19px; color:#1f2937; margin:0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="background:#f4f5f7; color:#6b7280; text-align:center; padding:14px; font-size:11px;">
        OFITRACK — PROYECTO DE PRÁCTICA / PORTFOLIO
      </div>
    </div>
  </div>`;
}

const TYPE_LABELS = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  personal: "Asunto personal",
  otro: "Otro",
};

// ---------------------------------------------------------------------------
// sendAbsenceReviewedEmail — al aprobar/rechazar una solicitud de ausencia
// ---------------------------------------------------------------------------
async function sendAbsenceReviewedEmail(employee, absence) {
  warnIfNotConfigured();
  if (!resend) return;

  const isApproved = absence.status === "aprobada";
  const color = isApproved ? "#16a34a" : "#dc2626";
  const statusLabel = isApproved ? "Aprobada ✅" : "Rechazada ❌";

  try {
    await resend.emails.send({
      from: FROM,
      to: [employee.email],
      subject: `Tu solicitud de ausencia ha sido ${isApproved ? "aprobada" : "rechazada"}`,
      html: wrapEmailHtml(
        "Solicitud de ausencia revisada",
        `<p style="color:#374151; line-height:1.6;">Hola ${employee.name}, tu solicitud ha sido revisada:</p>
         <table style="width:100%; margin:16px 0; font-size:14px; color:#1f2937;">
           <tr><td style="padding:4px 0; color:#6b7280;">Tipo</td><td style="text-align:right; font-weight:600;">${TYPE_LABELS[absence.type] || absence.type}</td></tr>
           <tr><td style="padding:4px 0; color:#6b7280;">Fechas</td><td style="text-align:right;">${absence.start_date} → ${absence.end_date}</td></tr>
           <tr><td style="padding:4px 0; color:#6b7280;">Estado</td><td style="text-align:right; font-weight:700; color:${color};">${statusLabel}</td></tr>
         </table>
         <a href="${FRONTEND_URL}/ausencias.html"
            style="display:inline-block; margin-top:10px; background:#2563eb; color:#ffffff;
                   padding:11px 20px; border-radius:6px; text-decoration:none; font-weight:600; font-size:13px;">
           Ver mis solicitudes
         </a>`
      ),
    });
  } catch (err) {
    console.error("No se pudo enviar el email de revisión de ausencia:", err.message);
  }
}

// ---------------------------------------------------------------------------
// sendPasswordChangedEmail — aviso de seguridad al cambiar la contraseña
// ---------------------------------------------------------------------------
async function sendPasswordChangedEmail(employee) {
  warnIfNotConfigured();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: [employee.email],
      subject: "Tu contraseña de OfiTrack ha cambiado",
      html: wrapEmailHtml(
        "Contraseña actualizada 🔒",
        `<p style="color:#374151; line-height:1.6;">
           Hola ${employee.name}, te confirmamos que tu contraseña se ha cambiado correctamente.
         </p>
         <p style="color:#6b7280; line-height:1.6; font-size:13px;">
           Si no has sido tú quien ha hecho este cambio, contacta cuanto antes con tu administrador.
         </p>`
      ),
    });
  } catch (err) {
    console.error("No se pudo enviar el email de aviso de contraseña:", err.message);
  }
}

module.exports = { sendAbsenceReviewedEmail, sendPasswordChangedEmail };
