# OfiTrack — Control horario y gestión de personal

Herramienta interna de gestión de personal: fichajes con cálculo automático
de horas extra contra el turno asignado cada día, calendario semanal de
turnos, solicitud/aprobación de ausencias con % de absentismo, panel de
informes con gráficas, cambio de contraseña propio y emails automáticos, y
gestión de empleados y roles.

## Demo en vivo

**[alvarofo-ofitrack.onrender.com](https://alvarofo-ofitrack.onrender.com)** · forma parte de mi portfolio: **[alvarofernandez03.github.io](https://alvarofernandez03.github.io/)**

Dentro tienes una cinta con las cuentas de prueba para entrar con un clic
(contraseña de todas: `empleado123`):

| Cuenta | Email |
|---|---|
| Administrador | `admin@ofitrack.com` |
| Responsable de equipo | `javier@ofitrack.com` |
| Trabajador | `pedro@ofitrack.com` |

Está en el plan gratuito de Render: si nadie la ha usado en un rato, tarda
hasta un minuto en despertar. Los datos son de ejemplo y se reinician solos
cada vez que despierta, así que puedes tocar lo que quieras.

<details>
<summary>Cómo funciona el modo demo</summary>

La demo pública arranca con la variable `DEMO=1`. Con ella, `backend/demo.js`
añade la cinta con las cuentas de prueba a cada página y bloquea lo que
dejaría fuera a las siguientes visitas (cambiar la contraseña de una cuenta de
prueba, desactivarla...). Sin `DEMO=1`, en tu ordenador, la app funciona
exactamente igual que siempre. La configuración de Render está en el
`render.yaml` del [repositorio del portfolio](https://github.com/AlvaroFernandez03/AlvaroFernandez03.github.io).

</details>

## Diseño

El proyecto tiene identidad visual propia, construida alrededor de una idea:
**fichar es lo primero que alguien hace cada mañana, así que ese momento
debe sentirse bien y no como un trámite gris.**

- **Un solo momento memorable**: el botón de fichar vive dentro de un anillo
  que se rellena según las horas que llevas de tu jornada, y cambia a ámbar
  cuando entras en horas extra. Es información y recompensa visual a la vez.
  El resto de la interfaz se mantiene tranquila y ordenada alrededor de eso,
  en vez de repartir animaciones por todas partes.
- **Los colores significan cosas**, no decoran: verde = dentro/aprobado,
  ámbar = horas extra/pendiente, coral = ausencia/rechazado, índigo =
  acciones y estructura. El mismo código de color se mantiene en las tablas,
  las etiquetas de estado y las gráficas de informes.
- **Tipografía**: Bricolage Grotesque para titulares y cifras (tiene
  carácter, no es la tipografía por defecto de cualquier panel), e Inter
  para datos y tablas, donde lo que importa es leer rápido.
- Fondo en papel cálido (#F7F5F2) en lugar del gris oficina habitual.
- Respeta `prefers-reduced-motion`, tiene foco visible por teclado y se
  adapta a móvil.

## Estructura

```
ofitrack/
├── backend/
│   ├── db/                 -> base de datos + datos de ejemplo
│   ├── routes/               -> auth, employees, departments, clockins, shifts, schedule, absences, reports
│   ├── middleware/             -> requireAuth (sesión) y requireRole (permisos por rol)
│   ├── services/email.js        -> envío de emails con Resend (opcional)
│   ├── utils/                    -> shiftHours.js, businessDays.js, hoursCalculator.js
│   └── server.js
└── frontend/
    ├── index.html            -> login
    ├── fichar.html             -> reloj, botón entrada/salida y resumen del día
    ├── mi-historial.html        -> historial personal de los últimos 30 días
    ├── turnos.html                -> calendario semanal de turnos
    ├── ausencias.html               -> solicitar ausencias + (responsable/admin) aprobar y ver % absentismo
    ├── informes.html                  -> panel de gráficas (responsable/admin)
    ├── perfil.html                      -> datos propios + cambio de contraseña
    ├── panel-equipo.html                  -> estado de hoy del equipo (responsable/admin)
    └── empleados.html                       -> alta/edición de empleados (solo admin)
```

## Cómo ejecutarlo

1. `cd backend && npm install`
2. Copia `.env.example` como `.env` y cambia `JWT_SECRET`
3. `npm start`
4. Abre **http://localhost:3000**

**Nota**: `informes.html` carga la librería Chart.js desde una CDN externa (jsdelivr), así que necesitas conexión a internet para ver las gráficas (el resto de la web funciona sin conexión).

## Cómo activar los emails (opcional)

Sin configurar nada, la web funciona igual mas no se envían emails. Para activarlos:

1. Crea una cuenta gratuita en [resend.com](https://resend.com)
2. Genera una API key y ponla en `RESEND_API_KEY` dentro de `.env`
3. Reinicia el servidor

Con eso se envía automáticamente:
- Un email al empleado cuando su solicitud de ausencia es **aprobada o rechazada**
- Un aviso de seguridad cuando **cambia su contraseña** (por si no ha sido él)

**Importante**: sin verificar un dominio propio en Resend, solo puedes enviar a la dirección con la que te registraste en Resend — perfecto para probarlo tú mismo.

## Cuentas de prueba (contraseña para todas: `empleado123`)

| Email | Rol | Ve |
|---|---|---|
| admin@ofitrack.com | Administrador | Todo, informes de toda la empresa |
| javier@ofitrack.com | Responsable (Almacén) | Su equipo, informes solo de su equipo |
| sara@ofitrack.com | Responsable (Oficina) | Su equipo, informes solo de su equipo |
| pedro@ofitrack.com | Trabajador | Solo lo suyo (sin acceso a informes) |

## Datos de ejemplo ya cargados

Para que el panel de informes tenga contenido real desde el primer momento
(sin tener que fichar manualmente durante semanas), el proyecto viene con:

- **Fichajes simulados de los últimos ~14 días** (solo días laborables) para
  los 6 trabajadores de ejemplo, con algo de variabilidad y horas extra
  ocasionales — así las gráficas de horas y horas extra no salen vacías.
  **El día de hoy se deja siempre sin fichar a propósito**, para que puedas
  probar tú mismo el fichaje real en `fichar.html` sin que se mezcle con
  los datos de prueba.
- **Varias ausencias ya aprobadas**, repartidas entre distintos empleados y
  con los 4 tipos representados (vacaciones, baja médica, personal, otro),
  para que el % de absentismo y el gráfico de tipos de ausencia salgan
  poblados y variados.

Todo esto se genera una sola vez, la primera vez que arrancas el proyecto
(si borras `backend/db/ofitrack.db` y vuelves a arrancar, se regenera).

## El panel de informes (`informes.html`)

Accesible para responsable y admin (cada uno ve su alcance: el admin, toda
la empresa; el responsable, solo su equipo). Incluye 4 gráficas, todas sobre
el rango de fechas que elijas:

1. **Horas trabajadas y horas extra por empleado** (barras agrupadas)
2. **Tendencia de horas trabajadas del equipo día a día** (línea)
3. **% de absentismo por empleado** (barras horizontales)
4. **Distribución de tipos de ausencia aprobados** (donut)

Todos los cálculos se hacen en el backend a partir de los fichajes y
ausencias reales guardados en la base de datos — no hay datos inventados en
las gráficas.

## Qué es ya funcional

- ✅ Login con roles (trabajador / responsable / admin)
- ✅ Fichar entrada/salida con cálculo automático de horas extra contra el turno del día
- ✅ Calendario semanal de turnos
- ✅ Solicitud y aprobación de ausencias, con % de absentismo automático
- ✅ Panel de informes con 4 gráficas (Chart.js), filtrable por fechas
- ✅ **Cambio de contraseña propio** (`perfil.html`), pidiendo siempre la contraseña actual
- ✅ **Emails automáticos** (opcionales): ausencia aprobada/rechazada, aviso de cambio de contraseña
- ✅ Panel de equipo en tiempo real, gestión de empleados

## Ideas para más adelante

El proyecto está terminado como herramienta de RRHH. Si algún día se retoma:

1. **Panel de inicio unificado** para responsable/admin: fichajes de hoy + solicitudes pendientes + alertas en una sola pantalla.
2. **Exportar informes a CSV**, para llevar los datos a una nómina o a Excel.
3. Un módulo de **operaciones** (pedidos, cargas y descargas) — aunque encajaría mejor como proyecto aparte, para que esta herramienta siga siendo específica de gestión de personal.

## Notas de seguridad

- Cambia `JWT_SECRET` en `.env` antes de usarlo en serio.
- Proyecto de práctica: antes de usarlo con datos reales convendría revisar la normativa laboral aplicable, y añadir validaciones/HTTPS/backups adecuados.
