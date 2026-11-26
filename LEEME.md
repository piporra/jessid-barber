# Jessid Barber · Reservas de hora

Página de reservas para clientes (`/`) + panel de Jessid (`/admin`).
Funciona con **Vercel** (página y funciones del servidor) y **Neon** (base de datos Postgres, plan gratis).

## La base de datos ya está creada
Proyecto de Neon **jessid-barber** (región São Paulo), con las tablas, los 9 servicios, el horario
(lunes a sábado 10:00–15:00 y 16:00–20:00, colación 15:00–16:00) y los datos del local ya cargados. El archivo `neon.sql` es el mismo
esquema por si algún día hay que recrearla (se puede ejecutar de nuevo sin perder datos).

## Publicar (una sola vez)

1. **GitHub**: crea un repositorio nuevo (por ejemplo `jessid-barber`) y sube todos los archivos de esta
   carpeta, incluida la carpeta `api` y la carpeta `admin`.
2. **Vercel** → *Add New → Project* → elige el repo → *Framework Preset: Other* → antes de *Deploy*,
   abre **Environment Variables** y agrega estas tres:

   | Nombre | Valor |
   |---|---|
   | `DATABASE_URL` | La conexión de Neon: en console.neon.tech → proyecto **jessid-barber** → botón **Connect** → copia la *connection string* |
   | `ADMIN_EMAIL` | El correo con que Jessid entrará al panel |
   | `ADMIN_PASSWORD` | La clave del panel (larga, que no use en otro lado) |

3. **Deploy**. Listo:
   - Clientes: `https://tu-proyecto.vercel.app`
   - Panel: `https://tu-proyecto.vercel.app/admin`

Si cambias una variable después, en Vercel ve a *Deployments → ⋯ → Redeploy* para que tome el cambio.
Cambiar `ADMIN_PASSWORD` cierra la sesión del panel en todos los teléfonos.

## Cómo funciona

**Modo actual: solo reserva de hora** (se paga en el local)
- El cliente elige servicio → día → hora → nombre y teléfono. La hora queda reservada al tiro, con un código.
- Puede cancelar en **Ver mi reserva** (código + teléfono) y la hora se libera.
- Máximo 2 horas futuras por teléfono.
- Jessid ve la agenda en el panel, agrega reservas manuales, cancela, y manda la confirmación por WhatsApp con un clic.

**Cobro con Webpay** (opcional, a futuro): panel → Ajustes → "Cobrar al reservar con Webpay", y pegar el link
de pago de cada servicio (panel → Servicios). La hora se guarda 20 minutos mientras el cliente paga; él informa
el n° del comprobante y Jessid confirma en "Por revisar".

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | Página de reservas para clientes |
| `admin/index.html` | Panel de Jessid |
| `api/db.js`, `api/rpc.js`, `api/login.js` | Funciones del servidor (Vercel) que hablan con Neon |
| `api/_lib.js` | Conexión a Neon y sesión del panel |
| `api.js` | Conecta las páginas con esas funciones |
| `comun.js`, `estilos.css`, `logo.png` | Cálculo de horas, diseño y logo |
| `neon.sql` | Esquema de la base de datos |
| `package.json`, `vercel.json` | Configuración para Vercel (región São Paulo) |

## Seguridad
- Los clientes solo pueden leer servicios, horario y bloqueos, y reservar/consultar/cancelar con su código y teléfono.
  No pueden ver las reservas de otros.
- La reserva se valida en la base de datos (horario, choques de hora, bloqueos), aunque alguien manipule la página.
- El panel exige el correo y la clave de las variables de Vercel; la sesión dura 30 días.
  Tras 10 intentos fallidos se bloquea el ingreso por unos minutos.
