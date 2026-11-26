// Conecta la página con las funciones de /api (Vercel + Neon).
// Ofrece la misma forma de uso que tenía el cliente de Supabase, para no cambiar el resto del código.
(function () {
  const SESION = 'jessid_sesion_admin';
  const leerSesion = () => { try { const s = JSON.parse(localStorage.getItem(SESION)); return s && s.exp > Date.now() ? s : null; } catch (_) { return null; } };
  const ponerSesion = (s) => { try { s ? localStorage.setItem(SESION, JSON.stringify(s)) : localStorage.removeItem(SESION); } catch (_) {} };

  async function llamar(ruta, cuerpo) {
    const s = leerSesion();
    try {
      const r = await fetch('/api/' + ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
        body: JSON.stringify(cuerpo)
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && s && ruta !== 'login') ponerSesion(null);
      if (!r.ok) return { data: null, error: { message: j.error || 'Error ' + r.status, status: r.status } };
      return { data: j.data === undefined ? j : j.data, error: null };
    } catch (e) {
      return { data: null, error: { message: 'Sin conexión. Revisa tu internet e intenta de nuevo.' } };
    }
  }

  class Consulta {
    constructor(tabla) { this.c = { tabla, op: 'select', filtros: [], orden: [] }; this.modo = null; }
    select() { return this; }
    eq(c, v) { this.c.filtros.push({ c, op: 'eq', v }); return this; }
    gte(c, v) { this.c.filtros.push({ c, op: 'gte', v }); return this; }
    lte(c, v) { this.c.filtros.push({ c, op: 'lte', v }); return this; }
    or(expr) {
      const o = expr.replace(/^\(|\)$/g, '').split(',').map(p => { const [c, op, ...v] = p.split('.'); return { c, op, v: v.join('.') }; });
      this.c.filtros.push({ o }); return this;
    }
    order(c, o) { this.c.orden.push([c, !(o && o.ascending === false)]); return this; }
    single() { this.modo = 'single'; return this; }
    maybeSingle() { this.modo = 'maybe'; return this; }
    insert(v) { this.c.op = 'insert'; this.c.valor = v; return this; }
    update(v) { this.c.op = 'update'; this.c.valor = v; return this; }
    upsert(v) { this.c.op = 'upsert'; this.c.valor = v; return this; }
    delete() { this.c.op = 'delete'; return this; }
    then(ok, ko) { return this.run().then(ok, ko); }
    async run() {
      const r = await llamar('db', this.c);
      if (r.error || this.c.op !== 'select') return r;
      if (this.modo === 'single') return r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { message: 'No se encontró el registro' } };
      if (this.modo === 'maybe') return { data: r.data[0] || null, error: null };
      return r;
    }
  }

  window.supabase = {
    createClient() {
      return {
        from: (t) => new Consulta(t),
        rpc: (fn, args) => llamar('rpc', { fn, args }),
        auth: {
          getSession: async () => {
            const s = leerSesion();
            return { data: { session: s ? { access_token: s.token, user: { id: 'admin', email: s.email } } : null }, error: null };
          },
          signInWithPassword: async ({ email, password }) => {
            const r = await llamar('login', { email, password });
            if (r.error) return { data: null, error: r.error };
            ponerSesion({ token: r.data.token, email: r.data.email, exp: Date.now() + 29 * 24 * 3600 * 1000 });
            return { data: { session: leerSesion() }, error: null };
          },
          signOut: async () => { ponerSesion(null); return { error: null }; }
        }
      };
    }
  };
})();
