// Inicio de sesión del administrador: compara con ADMIN_EMAIL y ADMIN_PASSWORD (variables de Vercel)
import { crearToken, igualSeguro, responder, leerCuerpo } from './_lib.js';

const intentos = new Map(); // freno simple contra adivinar la clave (por instancia)

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' });
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return responder(res, 500, { error: 'Faltan las variables ADMIN_EMAIL y ADMIN_PASSWORD en Vercel.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const r = intentos.get(ip) || { n: 0, desde: Date.now() };
  if (Date.now() - r.desde > 15 * 60 * 1000) { r.n = 0; r.desde = Date.now(); }
  if (r.n >= 10) return responder(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });

  const { email, password } = await leerCuerpo(req);
  const ok = igualSeguro(String(email || '').trim().toLowerCase(), String(process.env.ADMIN_EMAIL).trim().toLowerCase())
           & igualSeguro(String(password || ''), String(process.env.ADMIN_PASSWORD));
  if (!ok) { r.n++; intentos.set(ip, r); return responder(res, 401, { error: 'Correo o contraseña incorrectos.' }); }
  intentos.delete(ip);
  return responder(res, 200, { token: crearToken(), email: String(process.env.ADMIN_EMAIL).trim().toLowerCase() });
}
