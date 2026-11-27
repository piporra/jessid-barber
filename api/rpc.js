// Funciones públicas que usa la página de reservas (definidas en neon.sql)
import { q, responder, mensajeError, leerCuerpo } from './_lib.js';

const FUNCIONES = {
  horas_ocupadas:    ['p_desde', 'p_hasta'],
  crear_reserva:     ['p_servicio_id', 'p_fecha', 'p_hora', 'p_nombre', 'p_telefono', 'p_email'],
  crear_reserva_grupo: ['p_items', 'p_fecha', 'p_hora', 'p_nombre', 'p_telefono', 'p_email'],
  consultar_reserva: ['p_codigo', 'p_telefono'],
  cancelar_reserva:  ['p_codigo', 'p_telefono'],
  reserva_por_token: ['p_token'],
  cancelar_por_token:['p_token']
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVUELVE_FILAS = new Set(['horas_ocupadas']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' });
  try {
    const { fn, args = {} } = await leerCuerpo(req);
    const permitidos = FUNCIONES[fn];
    if (!permitidos) return responder(res, 400, { error: 'Función no permitida.' });
    if ('p_token' in args && !UUID.test(String(args.p_token))) {
      return fn === 'reserva_por_token' ? responder(res, 200, { data: null }) : responder(res, 400, { error: 'El link de cancelación no es válido.' });
    }
    const nombres = permitidos.filter(k => args[k] !== undefined && args[k] !== null);
    const valores = nombres.map(k => k === 'p_items'
      ? (typeof args[k] === 'string' ? args[k] : JSON.stringify(args[k])).slice(0, 2000)
      : String(args[k]).slice(0, 200));
    const lista = nombres.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const texto = DEVUELVE_FILAS.has(fn)
      ? `select coalesce(json_agg(t), '[]'::json) as j from ${fn}(${lista}) t`
      : `select to_json(${fn}(${lista})) as j`;
    const filas = await q(texto, valores);
    return responder(res, 200, { data: filas[0] ? filas[0].j : null });
  } catch (e) {
    return responder(res, 400, { error: mensajeError(e) });
  }
}
