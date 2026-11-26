// Utilidades compartidas por las funciones de /api (Vercel no publica archivos que empiezan con _)
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

let sql = null;
// Ejecuta una consulta y devuelve las filas. La conexión viene de la variable DATABASE_URL de Vercel.
export async function q(text, params = []) {
  if (globalThis.__consultaLocal) return globalThis.__consultaLocal(text, params); // solo para pruebas locales
  if (!process.env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL en Vercel.');
  sql ??= neon(process.env.DATABASE_URL);
  return sql.query(text, params);
}

// ---------- Sesión del administrador (token firmado, dura 30 días) ----------
const DURACION = 30 * 24 * 3600 * 1000;
const secreto = () => crypto.createHash('sha256')
  .update(String(process.env.ADMIN_PASSWORD || '') + '|' + String(process.env.DATABASE_URL || '') + '|jessid').digest();
const firmar = (datos) => crypto.createHmac('sha256', secreto()).update(datos).digest('base64url');

export function crearToken() {
  const datos = Buffer.from(JSON.stringify({ rol: 'admin', exp: Date.now() + DURACION })).toString('base64url');
  return datos + '.' + firmar(datos);
}
export function esAdmin(req) {
  try {
    const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const [datos, firma] = t.split('.');
    if (!datos || !firma || !process.env.ADMIN_PASSWORD) return false;
    const esperada = firmar(datos);
    if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return false;
    return JSON.parse(Buffer.from(datos, 'base64url').toString()).exp > Date.now();
  } catch { return false; }
}
export function igualSeguro(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

export function responder(res, codigo, cuerpo) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}
// Convierte los errores de Postgres en un mensaje legible (los RAISE EXCEPTION de las funciones ya vienen en español)
export function mensajeError(e) {
  const m = String((e && e.message) || e || '');
  if (e && e.code === 'P0001') return m;               // error lanzado por nuestras funciones SQL
  if (/DATABASE_URL/.test(m)) return m;
  console.error(e);
  return 'Ocurrió un error en el servidor. Intenta de nuevo.';
}
export async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {};
}
