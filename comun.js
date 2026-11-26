// Utilidades compartidas entre la página de reservas y el panel de administración
(function () {
  const TZ = 'America/Santiago';
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // "HH:MM[:SS]" → minutos desde medianoche
  const aMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const aHora = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  // Fecha y hora actual en Chile, sin depender de la zona horaria del teléfono
  function ahoraCL() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
  }

  const fechaUTC = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const diaSemana = (f) => fechaUTC(f).getUTCDay();
  function sumarDias(f, n) { const d = fechaUTC(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fechaLarga(f) { const d = fechaUTC(f); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; }
  function fechaCorta(f) { const d = fechaUTC(f); return { dia: DIAS_CORTO[d.getUTCDay()], num: d.getUTCDate(), mes: MESES_CORTO[d.getUTCMonth()] }; }
  const clp = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
  const hhmm = (t) => (t || '').slice(0, 5);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

  // Horas disponibles para un servicio en una fecha.
  // ocupadas: [{fecha, hora_inicio, hora_fin}] ; bloqueos: [{fecha, hora_inicio, hora_fin}]
  function horasDisponibles({ fecha, duracion, horario, bloqueos, ocupadas, ajustes, ignorarAnticipacion }) {
    const h = horario.find(x => x.dia === diaSemana(fecha));
    if (!h || !h.abierto) return [];
    const bl = bloqueos.filter(b => b.fecha === fecha);
    if (bl.some(b => !b.hora_inicio || !b.hora_fin)) return [];
    const ocup = ocupadas.filter(o => o.fecha === fecha).map(o => [aMin(o.hora_inicio), aMin(o.hora_fin)]);
    bl.forEach(b => ocup.push([aMin(b.hora_inicio), aMin(b.hora_fin)]));
    if (h.colacion_inicio && h.colacion_fin) ocup.push([aMin(h.colacion_inicio), aMin(h.colacion_fin)]);

    const ahora = ahoraCL();
    let minimo = -1;
    if (fecha < ahora.fecha) return [];
    if (fecha === ahora.fecha) minimo = ahora.min + (ignorarAnticipacion ? 0 : ajustes.anticipacion_min);

    const paso = Math.max(5, ajustes.intervalo_min || 30);
    const ini = aMin(h.apertura), fin = aMin(h.cierre), res = [];
    for (let t = ini; t + duracion <= fin; t += paso) {
      if (t < minimo) continue;
      if (ocup.some(([a, b]) => t < b && t + duracion > a)) continue;
      res.push(aHora(t));
    }
    return res;
  }

  // Link de WhatsApp (Chile: agrega 56 si falta)
  function linkWhatsapp(tel, texto) {
    let n = soloDigitos(tel);
    if (n.length === 9) n = '56' + n;
    if (n.length === 8) n = '569' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto || '')}`;
  }

  function cliente() {
    const c = window.APP_CONFIG || {};
    return window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  }

  window.U = { TZ, DIAS, aMin, aHora, ahoraCL, diaSemana, sumarDias, fechaLarga, fechaCorta, clp, hhmm, esc,
    soloDigitos, horasDisponibles, linkWhatsapp, cliente };
})();
