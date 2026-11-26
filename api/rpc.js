// Funciones públicas que usa la página de reservas (definidas en neon.sql)
import { q, responder, mensajeError, leerCuerpo } from './_lib.js';

const FUNCIONES = {
  horas_ocupadas:    ['p_desde', 'p_hasta'],
  crear_reserva:     ['p_servicio_id', 'p_fecha', 'p_hora', 'p_nombre', 'p_telefono', 'p_email'],
  consultar_reserva: ['p_codigo', 'p_telefono'],
  cancelar_reserva:  ['p_codigo', 'p_telefono'],
  informar_pago:     ['p_codigo', 'p_telefono', 'p_comprobante']
};
const DEVUELVE_FILAS = new Set(['horas_ocupadas']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' });
  try {
    const { fn, args = {} } = await leerCuerpo(req);
    const permitidos = FUNCIONES[fn];
    if (!permitidos) return responder(res, 400, { error: 'Función no permitida.' });
    const nombres = permitidos.filter(k => args[k] !== undefined && args[k] !== null);
    const valores = nombres.map(k => String(args[k]).slice(0, 200));
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
