-- =====================================================================
--  Jessid Barber · Reservas de hora
--  Esquema de la base de datos (Neon / Postgres).
--  Se puede volver a ejecutar sin perder datos.
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

create table if not exists ajustes (
  id                   int primary key default 1 check (id = 1),
  nombre               text not null default 'Jessid Barber',
  direccion            text default 'Calle Lourdes 899, Peralillo',
  whatsapp             text default '987540500',
  intervalo_min        int  not null default 30,   -- cada cuántos minutos se ofrecen horas
  anticipacion_min     int  not null default 60,   -- mínimo de minutos de anticipación para reservar
  dias_max             int  not null default 30,   -- hasta cuántos días hacia adelante se puede reservar
  politica_cancelacion text default 'Si no puedes venir, cancela tu hora desde "Ver mi reserva" o escríbenos por WhatsApp.'
);

create table if not exists servicios (
  id           serial primary key,
  nombre       text not null,
  descripcion  text default '',
  duracion_min int  not null check (duracion_min > 0),
  precio       int  not null check (precio >= 0),
  activo       boolean not null default true,
  orden        int not null default 0
);

-- dia: 0 = domingo, 1 = lunes ... 6 = sábado
create table if not exists horario (
  dia             smallint primary key check (dia between 0 and 6),
  abierto         boolean not null default true,
  apertura        time not null default '10:00',
  cierre          time not null default '20:00',
  colacion_inicio time,
  colacion_fin    time
);

-- Días u horas sin atención. Sin horas = día completo.
create table if not exists bloqueos (
  id          serial primary key,
  fecha       date not null,
  hora_inicio time,
  hora_fin    time,
  motivo      text default ''
);

create table if not exists reservas (
  id               uuid primary key default gen_random_uuid(),
  codigo           text unique not null,
  servicio_id      int references servicios(id) on delete set null,
  servicio_nombre  text not null,
  precio           int  not null,
  fecha            date not null,
  hora_inicio      time not null,
  hora_fin         time not null,
  cliente_nombre   text not null,
  cliente_telefono text not null,
  cliente_email    text default '',
  estado           text not null default 'confirmada' check (estado in ('confirmada','cancelada')),
  nota_admin       text default '',
  origen           text not null default 'web' check (origen in ('web','admin')),
  creado_en        timestamptz not null default now()
);
create index if not exists reservas_fecha_idx on reservas (fecha);

-- ---------- Datos iniciales ------------------------------------------

insert into ajustes (id) values (1) on conflict do nothing;

insert into horario (dia, abierto, apertura, cierre, colacion_inicio, colacion_fin) values
  (0, false, '10:00', '20:00', null, null),
  (1, true,  '10:00', '20:00', '15:00', '16:00'),
  (2, true,  '10:00', '20:00', '15:00', '16:00'),
  (3, true,  '10:00', '20:00', '15:00', '16:00'),
  (4, true,  '10:00', '20:00', '15:00', '16:00'),
  (5, true,  '10:00', '20:00', '15:00', '16:00'),
  (6, true,  '10:00', '20:00', '15:00', '16:00')
on conflict do nothing;

insert into servicios (nombre, descripcion, duracion_min, precio, orden)
select * from (values
  ('Corte degradado',            '',                               30, 10000, 1),
  ('Cortes clásicos',            '',                               30, 10000, 2),
  ('Corte de niños',             '',                               30, 10000, 3),
  ('Corte + barba',              'Corte y barba en la misma hora', 60, 17000, 4),
  ('Barba',                      '',                               30,  7000, 5),
  ('Cejas y líneas',             '',                               15,  1000, 6),
  ('Diseños freestyle',          'Dibujos y líneas en el pelo',    30,  8000, 7),
  ('Rizos permanentes + corte',  '',                              180, 50000, 8),
  ('Colorimetría + corte',       'Visos, color y similares',      300, 60000, 9)
) v
where not exists (select 1 from servicios);

-- ---------- Funciones auxiliares --------------------------------------

-- Hora local de Chile
create or replace function ahora_cl() returns timestamp
language sql stable as $$ select (now() at time zone 'America/Santiago'); $$;

-- Últimos 8 dígitos del teléfono (para comparar sin importar +56, espacios, etc.)
create or replace function tel_norm(t text) returns text
language sql immutable as $$ select right(regexp_replace(coalesce(t,''), '\D', '', 'g'), 8); $$;

-- ---------- Funciones que usa la página de reservas -------------------

-- Horas ocupadas en un rango de fechas (sin datos personales)
create or replace function horas_ocupadas(p_desde date, p_hasta date)
returns table (fecha date, hora_inicio time, hora_fin time)
language sql stable as $$
  select r.fecha, r.hora_inicio, r.hora_fin
  from reservas r
  where r.fecha between p_desde and p_hasta and r.estado = 'confirmada';
$$;

create or replace function crear_reserva(
  p_servicio_id int, p_fecha date, p_hora time,
  p_nombre text, p_telefono text, p_email text default ''
) returns json
language plpgsql as $$
declare
  a ajustes; s servicios; h horario;
  v_fin time; v_codigo text;
begin
  select * into a from ajustes where id = 1;
  select * into s from servicios where id = p_servicio_id and activo;
  if not found then raise exception 'El servicio no está disponible.'; end if;
  if length(trim(coalesce(p_nombre,''))) < 2 then raise exception 'Ingresa tu nombre.'; end if;
  if length(tel_norm(p_telefono)) < 8 then raise exception 'Ingresa un teléfono válido.'; end if;

  v_fin := p_hora + make_interval(mins => s.duracion_min);
  if v_fin <= p_hora then raise exception 'El servicio excede el horario del día.'; end if;
  if (p_fecha + p_hora) < ahora_cl() + make_interval(mins => a.anticipacion_min) then
    raise exception 'Esa hora ya no está disponible (se requiere % minutos de anticipación).', a.anticipacion_min;
  end if;
  if p_fecha > (ahora_cl())::date + a.dias_max then
    raise exception 'Solo se puede reservar hasta % días hacia adelante.', a.dias_max;
  end if;

  select * into h from horario where dia = extract(dow from p_fecha);
  if not found or not h.abierto then raise exception 'Ese día no hay atención.'; end if;
  if p_hora < h.apertura or v_fin > h.cierre then raise exception 'La hora está fuera del horario de atención.'; end if;
  if h.colacion_inicio is not null and h.colacion_fin is not null
     and p_hora < h.colacion_fin and v_fin > h.colacion_inicio then
    raise exception 'La hora cruza con el horario de colación.';
  end if;

  if exists (select 1 from bloqueos b where b.fecha = p_fecha and (
        b.hora_inicio is null or b.hora_fin is null
        or (p_hora < b.hora_fin and v_fin > b.hora_inicio))) then
    raise exception 'Esa hora no está disponible.';
  end if;

  -- Evita que dos personas tomen la misma hora al mismo tiempo
  perform pg_advisory_xact_lock(hashtext('reservas-' || p_fecha::text));

  if exists (select 1 from reservas r where r.fecha = p_fecha and r.estado = 'confirmada'
             and p_hora < r.hora_fin and v_fin > r.hora_inicio) then
    raise exception 'Alguien acaba de tomar esa hora. Elige otra, por favor.';
  end if;

  -- Máximo 2 horas futuras reservadas por internet con el mismo teléfono
  if (select count(*) from reservas r where tel_norm(r.cliente_telefono) = tel_norm(p_telefono)
      and r.origen = 'web' and r.estado = 'confirmada' and (r.fecha + r.hora_inicio) >= ahora_cl()) >= 2 then
    raise exception 'Ya tienes 2 horas reservadas. Si necesitas otra, escríbenos por WhatsApp.';
  end if;

  loop
    v_codigo := upper(substr(translate(md5(gen_random_uuid()::text), '01', ''), 1, 6));
    exit when length(v_codigo) = 6 and not exists (select 1 from reservas where codigo = v_codigo);
  end loop;

  insert into reservas (codigo, servicio_id, servicio_nombre, precio, fecha, hora_inicio, hora_fin,
                        cliente_nombre, cliente_telefono, cliente_email, estado)
  values (v_codigo, s.id, s.nombre, s.precio, p_fecha, p_hora, v_fin,
          trim(p_nombre), trim(p_telefono), trim(coalesce(p_email,'')), 'confirmada');

  return json_build_object('codigo', v_codigo, 'precio', s.precio, 'servicio', s.nombre,
                           'fecha', p_fecha, 'hora_inicio', p_hora, 'hora_fin', v_fin, 'estado', 'confirmada');
end $$;

create or replace function consultar_reserva(p_codigo text, p_telefono text)
returns json
language sql stable as $$
  select json_build_object(
    'codigo', codigo, 'servicio', servicio_nombre, 'precio', precio,
    'fecha', fecha, 'hora_inicio', hora_inicio, 'hora_fin', hora_fin,
    'cliente_nombre', cliente_nombre, 'estado', estado,
    'puede_cancelar', (estado = 'confirmada' and (fecha + hora_inicio) > ahora_cl()))
  from reservas
  where codigo = upper(trim(p_codigo)) and tel_norm(cliente_telefono) = tel_norm(p_telefono);
$$;

-- El cliente cancela su hora (solo si aún no ocurre)
create or replace function cancelar_reserva(p_codigo text, p_telefono text)
returns json
language plpgsql as $$
declare r reservas;
begin
  select * into r from reservas where codigo = upper(trim(p_codigo))
    and tel_norm(cliente_telefono) = tel_norm(p_telefono) for update;
  if not found then raise exception 'No encontramos una reserva con ese código y teléfono.'; end if;
  if r.estado = 'cancelada' then return json_build_object('estado', 'cancelada'); end if;
  if (r.fecha + r.hora_inicio) <= ahora_cl() then raise exception 'Esta hora ya pasó.'; end if;
  update reservas set estado = 'cancelada',
         nota_admin = trim(coalesce(nota_admin,'') || ' Cancelada por el cliente desde la app.')
   where id = r.id;
  return json_build_object('estado', 'cancelada');
end $$;
