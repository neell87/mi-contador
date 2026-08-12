-- Esquema del contador personal. Todos los montos en CENTAVOS (enteros).

CREATE TABLE IF NOT EXISTS cuentas (
  id             INTEGER PRIMARY KEY,
  nombre         TEXT NOT NULL,                 -- Efectivo, Tarjeta BBVA, Ahorro
  tipo           TEXT NOT NULL,                 -- efectivo | debito | credito | ahorro
  saldo_inicial  INTEGER NOT NULL DEFAULT 0,    -- centavos
  activo         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categorias (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT NOT NULL,                        -- Comida, Transporte, Salud
  tipo    TEXT NOT NULL,                        -- ingreso | gasto
  UNIQUE(nombre, tipo)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id            INTEGER PRIMARY KEY,
  fecha         TEXT NOT NULL,                  -- ISO: 2026-08-12
  monto         INTEGER NOT NULL,               -- centavos, siempre positivo
  tipo          TEXT NOT NULL,                  -- ingreso | gasto | transferencia
  cuenta_id     INTEGER NOT NULL REFERENCES cuentas(id),
  cuenta_destino_id INTEGER REFERENCES cuentas(id),  -- solo transferencias
  categoria_id  INTEGER REFERENCES categorias(id),
  descripcion   TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mov_fecha     ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_mov_categoria ON movimientos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta    ON movimientos(cuenta_id);
