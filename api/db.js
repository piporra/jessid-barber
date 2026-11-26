// Lectura y edición de tablas. Los clientes solo pueden LEER ajustes, servicios activos, horario y bloqueos.
// Todo lo demás (reservas, cambios) requiere la sesión del administrador.
import { q, esAdmin, responder, mensajeError, leerCuerpo } from './_lib.js';

const TABLAS = {
  ajustes:  { pk: 'id',  publica: true, cols: ['id', 'nombre', 'direccion', 'whatsapp', 'minutos_bloqueo', 'intervalo_min', 'anticipacion_min', 'dias_max', 'politica_cancelacion', 'cobrar_online'] },
  servicios:{ pk: 'id',  publica: true, cols: ['id', 'nombre', 'descripcion', 'duracion_min', 'precio', 'link_pago', 'activo', 'orden'] },
  horario:  { pk: 'dia', publica: true, cols: ['dia', 'abierto', 'apertura', 'cierre', 'colacion_inicio', 'colacion_fin'] },
  bloqueos: { pk: 'id',  publica: true, cols: ['id', 'fecha', 'hora_inicio', 'hora_fin', 'motivo'] },
  reservas: { pk: 'id',  publica: false, cols: ['id', 'codigo', 'servicio_id', 'servicio_nombre', 'precio', 'fecha', 'hora_inicio', 'hora_fin',
    'cliente_nombre', 'cliente_telefono', 'cliente_email', 'estado', 'comprobante', 'expira_en', 'reembolso', 'nota_admin', 'origen', 'creado_en'] }
};
const OPS = { eq: '=', gte: '>=', lte: '<=' };
const id = (c) => '"' + c + '"';

function armarWhere(t, filtros, params) {
  const partes = [];
  const cond = (f) => {
    if (!t.cols.includes(f.c) || !OPS[f.op]) throw new Error('Filtro no permitido');
    params.push(f.v === null ? null : String(f.v));
    return `${id(f.c)} ${OPS[f.op]} $${params.length}`;
  };
  for (const f of filtros || []) {
    if (f.o) partes.push('(' + f.o.map(cond).join(' or ') + ')');
    else partes.push(cond(f));
  }
  return partes.length ? ' where ' + partes.join(' and ') : '';
}
function limpiar(t, obj) {
  const v = {};
  for (const [k, x] of Object.entries(obj || {})) if (t.cols.includes(k) && k !== 'creado_en') v[k] = x;
  return v;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' });
  try {
    const { tabla, op = 'select', filtros = [], orden = [], valor } = await leerCuerpo(req);
    const admin = esAdmin(req);
    if (tabla === 'admins') return admin ? responder(res, 200, { data: [{ user_id: 'admin' }] }) : responder(res, 401, { error: 'Sesión vencida' });
    const t = TABLAS[tabla];
    if (!t) return responder(res, 400, { error: 'Tabla no permitida' });
    if (!admin && !(op === 'select' && t.publica)) return responder(res, 401, { error: 'Sesión vencida. Vuelve a entrar.' });

    const params = [];
    if (op === 'select') {
      let w = armarWhere(t, filtros, params);
      if (tabla === 'servicios' && !admin) w += (w ? ' and' : ' where') + ' activo';
      const ord = orden.filter(([c]) => t.cols.includes(c)).map(([c, asc]) => id(c) + (asc === false ? ' desc' : '')).join(', ');
      const texto = `select coalesce(json_agg(x), '[]'::json) as j from (select * from ${tabla}${w}${ord ? ' order by ' + ord : ''} limit 2000) x`;
      const filas = await q(texto, params);
      return responder(res, 200, { data: filas[0].j });
    }
    if (op === 'insert' || op === 'upsert') {
      for (const fila of (Array.isArray(valor) ? valor : [valor]).slice(0, 200)) {
        const v = limpiar(t, fila), ks = Object.keys(v);
        if (!ks.length) continue;
        const ps = ks.map(k => v[k] === null ? null : (typeof v[k] === 'object' ? JSON.stringify(v[k]) : String(v[k])));
        let texto = `insert into ${tabla} (${ks.map(id).join(', ')}) values (${ks.map((_, i) => '$' + (i + 1)).join(', ')})`;
        if (op === 'upsert') texto += ` on conflict (${id(t.pk)}) do update set ` + ks.filter(k => k !== t.pk).map(k => `${id(k)} = excluded.${id(k)}`).join(', ');
        await q(texto, ps);
      }
      return responder(res, 200, { data: null });
    }
    if (op === 'update') {
      const v = limpiar(t, valor), ks = Object.keys(v);
      if (!ks.length) return responder(res, 400, { error: 'Nada que guardar' });
      if (!filtros.length) return responder(res, 400, { error: 'Falta el filtro' });
      ks.forEach(k => params.push(v[k] === null ? null : String(v[k])));
      const sets = ks.map((k, i) => `${id(k)} = $${i + 1}`).join(', ');
      await q(`update ${tabla} set ${sets}${armarWhere(t, filtros, params)}`, params);
      return responder(res, 200, { data: null });
    }
    if (op === 'delete') {
      if (!filtros.length) return responder(res, 400, { error: 'Falta el filtro' });
      await q(`delete from ${tabla}${armarWhere(t, filtros, params)}`, params);
      return responder(res, 200, { data: null });
    }
    return responder(res, 400, { error: 'Operación no permitida' });
  } catch (e) {
    return responder(res, 400, { error: mensajeError(e) });
  }
}
