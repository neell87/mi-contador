// Tests del núcleo contable. Usa una BD SQLite en memoria (DB_PATH=':memory:')
// para no tocar nunca data/contador.db. Cada assert compara centavos exactos:
// nada de tolerancias ni floats.

process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const contabilidad = require('../src/services/contabilidad');

const insCuenta = db.prepare(
  'INSERT INTO cuentas (nombre, tipo, saldo_inicial) VALUES (?, ?, ?)'
);
const insCategoria = db.prepare('INSERT INTO categorias (nombre, tipo) VALUES (?, ?)');
const insMov = db.prepare(`
  INSERT INTO movimientos (fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id, descripcion)
  VALUES (@fecha, @monto, @tipo, @cuenta_id, @cuenta_destino_id, @categoria_id, @descripcion)
`);

function mov({ fecha, monto, tipo, cuenta_id, cuenta_destino_id = null, categoria_id = null, descripcion = null }) {
  insMov.run({ fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id, descripcion });
}

// Limpia todas las tablas antes de cada test para que no se contaminen entre sí.
function limpiarBD() {
  db.exec('DELETE FROM movimientos; DELETE FROM cuentas; DELETE FROM categorias;');
}

test.beforeEach(() => {
  limpiarBD();
});

// ---------------------------------------------------------------------------
// saldoCuenta
// ---------------------------------------------------------------------------

test('saldoCuenta: suma ingresos, resta gastos, aplica transferencias en ambos sentidos', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 10000).lastInsertRowid; // $100.00
  const c2 = insCuenta.run('Ahorro', 'ahorro', 0).lastInsertRowid;

  mov({ fecha: '2026-08-01', monto: 5000, tipo: 'ingreso', cuenta_id: c1 });      // +50.00
  mov({ fecha: '2026-08-02', monto: 2000, tipo: 'gasto', cuenta_id: c1 });        // -20.00
  mov({ fecha: '2026-08-03', monto: 1000, tipo: 'transferencia', cuenta_id: c1, cuenta_destino_id: c2 }); // c1 -10, c2 +10

  // c1: 10000 + 5000 - 2000 - 1000 = 12000
  assert.equal(contabilidad.saldoCuenta(c1), 12000);
  // c2: 0 + 1000 (recibida) = 1000
  assert.equal(contabilidad.saldoCuenta(c2), 1000);
});

test('saldoCuenta: cuenta inexistente devuelve null', () => {
  assert.equal(contabilidad.saldoCuenta(999), null);
});

// ---------------------------------------------------------------------------
// balancePorCuenta
// ---------------------------------------------------------------------------

test('balancePorCuenta: lista cuentas activas con su saldo y el patrimonio total', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 10000).lastInsertRowid;
  const c2 = insCuenta.run('Ahorro', 'ahorro', 5000).lastInsertRowid;
  db.prepare('INSERT INTO cuentas (nombre, tipo, saldo_inicial, activo) VALUES (?,?,?,0)')
    .run('Cerrada', 'efectivo', 999999); // inactiva: no debe aparecer

  mov({ fecha: '2026-08-01', monto: 3000, tipo: 'gasto', cuenta_id: c1 });

  const resultado = contabilidad.balancePorCuenta();

  assert.equal(resultado.cuentas.length, 2);
  const porNombre = Object.fromEntries(resultado.cuentas.map(c => [c.nombre, c.saldo]));
  assert.equal(porNombre['Efectivo'], 7000);  // 10000 - 3000
  assert.equal(porNombre['Ahorro'], 5000);
  assert.equal(resultado.patrimonio_total, 12000); // 7000 + 5000, la cerrada no cuenta
});

test('balancePorCuenta: una cuenta de crédito es pasivo, su saldo_inicial (deuda) resta del patrimonio', () => {
  const credito = insCuenta.run('Tarjeta', 'credito', 50000).lastInsertRowid; // debo $500 desde el alta

  const resultado = contabilidad.balancePorCuenta();

  assert.equal(resultado.cuentas.length, 1);
  assert.equal(resultado.cuentas[0].es_pasivo, true);
  assert.equal(resultado.cuentas[0].saldo, -50000); // deuda con signo claro: negativo
  assert.equal(resultado.patrimonio_total, -50000); // una cuenta de crédito sola da patrimonio negativo
});

test('balancePorCuenta: patrimonio neto = activos - deuda con una cuenta débito y una de crédito', () => {
  const debito = insCuenta.run('Débito', 'debito', 100000).lastInsertRowid; // $1000 de activo
  const credito = insCuenta.run('Tarjeta', 'credito', 0).lastInsertRowid;
  mov({ fecha: '2026-08-05', monto: 30000, tipo: 'gasto', cuenta_id: credito }); // cargo de $300 a la tarjeta

  const resultado = contabilidad.balancePorCuenta();
  const porNombre = Object.fromEntries(resultado.cuentas.map(c => [c.nombre, c]));

  assert.equal(porNombre['Débito'].es_pasivo, false);
  assert.equal(porNombre['Débito'].saldo, 100000);
  assert.equal(porNombre['Tarjeta'].es_pasivo, true);
  assert.equal(porNombre['Tarjeta'].saldo, -30000); // el cargo aumenta la deuda
  assert.equal(resultado.patrimonio_total, 70000); // 1000 - 300 = 700 (en centavos: 70000)
});

test('balancePorCuenta: un pago (ingreso) a la tarjeta reduce la deuda', () => {
  const credito = insCuenta.run('Tarjeta', 'credito', 50000).lastInsertRowid; // debo $500
  mov({ fecha: '2026-08-10', monto: 20000, tipo: 'ingreso', cuenta_id: credito }); // abono $200

  const resultado = contabilidad.balancePorCuenta();
  assert.equal(resultado.cuentas[0].saldo, -30000); // ahora debo $300
});

// ---------------------------------------------------------------------------
// totalesMes / comparativaMensual
// ---------------------------------------------------------------------------

test('totalesMes: un movimiento del día 1 cuenta en ese mes, no en el anterior (límites por texto, sin Date/UTC)', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;

  mov({ fecha: '2026-08-01', monto: 7500, tipo: 'ingreso', cuenta_id: c1 }); // primer día del mes
  mov({ fecha: '2026-07-31', monto: 4200, tipo: 'ingreso', cuenta_id: c1 }); // último día del mes anterior

  const agosto = contabilidad.totalesMes('2026-08');
  const julio = contabilidad.totalesMes('2026-07');

  assert.equal(agosto.ingreso, 7500); // el del día 1 cuenta en agosto...
  assert.equal(julio.ingreso, 4200);  // ...y el del día 31 se queda en julio, no se corre por zona horaria
});

test('totalesMes: solo suma movimientos dentro del rango del mes indicado', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;
  const comida = insCategoria.run('Comida', 'gasto').lastInsertRowid;

  mov({ fecha: '2026-07-31', monto: 100000, tipo: 'gasto', cuenta_id: c1, categoria_id: comida }); // mes anterior, no cuenta
  mov({ fecha: '2026-08-01', monto: 2000, tipo: 'ingreso', cuenta_id: c1 });
  mov({ fecha: '2026-08-15', monto: 1500, tipo: 'gasto', cuenta_id: c1, categoria_id: comida });
  mov({ fecha: '2026-08-31', monto: 500, tipo: 'gasto', cuenta_id: c1, categoria_id: comida });
  mov({ fecha: '2026-09-01', monto: 999999, tipo: 'gasto', cuenta_id: c1 }); // mes siguiente, no cuenta

  const t = contabilidad.totalesMes('2026-08');

  assert.equal(t.mes, '2026-08');
  assert.equal(t.ingreso, 2000);
  assert.equal(t.gasto, 2000); // 1500 + 500
  assert.equal(t.balance, 0);  // 2000 - 2000
  assert.deepEqual(t.gasto_por_categoria, [{ categoria: 'Comida', total: 2000 }]);
});

test('comparativaMensual: calcula variación % contra el mes anterior', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;

  // Julio: ingreso 10000, gasto 4000
  mov({ fecha: '2026-07-10', monto: 10000, tipo: 'ingreso', cuenta_id: c1 });
  mov({ fecha: '2026-07-15', monto: 4000, tipo: 'gasto', cuenta_id: c1 });

  // Agosto: ingreso 15000 (+50%), gasto 6000 (+50%)
  mov({ fecha: '2026-08-10', monto: 15000, tipo: 'ingreso', cuenta_id: c1 });
  mov({ fecha: '2026-08-15', monto: 6000, tipo: 'gasto', cuenta_id: c1 });

  const cmp = contabilidad.comparativaMensual('2026-08');

  assert.equal(cmp.mes_actual.mes, '2026-08');
  assert.equal(cmp.mes_anterior.mes, '2026-07');
  assert.equal(cmp.mes_actual.ingreso, 15000);
  assert.equal(cmp.mes_anterior.ingreso, 10000);
  assert.equal(cmp.variacion_ingreso_pct, 50);
  assert.equal(cmp.variacion_gasto_pct, 50);
  // balance julio = 6000, balance agosto = 9000 -> +50%
  assert.equal(cmp.variacion_balance_pct, 50);
});

test('comparativaMensual: diciembre compara contra noviembre y enero contra diciembre del año anterior', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;
  mov({ fecha: '2025-12-05', monto: 1000, tipo: 'ingreso', cuenta_id: c1 });
  mov({ fecha: '2026-01-05', monto: 2000, tipo: 'ingreso', cuenta_id: c1 });

  const cmp = contabilidad.comparativaMensual('2026-01');
  assert.equal(cmp.mes_anterior.mes, '2025-12');
  assert.equal(cmp.mes_anterior.ingreso, 1000);
  assert.equal(cmp.mes_actual.ingreso, 2000);
  assert.equal(cmp.variacion_ingreso_pct, 100);
});

test('comparativaMensual: si el mes anterior fue 0 y el actual también, la variación es 0 (sin cambio)', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;
  mov({ fecha: '2026-08-01', monto: 100, tipo: 'ingreso', cuenta_id: c1 }); // rompe el 0-0 solo si hiciera falta
  // Sin movimientos de gasto en julio ni en agosto -> variación de gasto no es infinita, es null (no cero) porque hay 0->0
  const cmp = contabilidad.comparativaMensual('2026-08');
  assert.equal(cmp.mes_anterior.gasto, 0);
  assert.equal(cmp.mes_actual.gasto, 0);
  assert.equal(cmp.variacion_gasto_pct, 0);
});

test('comparativaMensual: si el mes anterior fue 0 y el actual tiene movimiento, la variación no es un número (null)', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;
  mov({ fecha: '2026-08-15', monto: 3000, tipo: 'gasto', cuenta_id: c1 });
  const cmp = contabilidad.comparativaMensual('2026-08');
  assert.equal(cmp.mes_anterior.gasto, 0);
  assert.equal(cmp.mes_actual.gasto, 3000);
  assert.equal(cmp.variacion_gasto_pct, null);
});

// ---------------------------------------------------------------------------
// gastoPorCategoria
// ---------------------------------------------------------------------------

test('gastoPorCategoria: agrupa por categoría, incluye "sin categoría" y respeta el rango', () => {
  const c1 = insCuenta.run('Efectivo', 'efectivo', 0).lastInsertRowid;
  const comida = insCategoria.run('Comida', 'gasto').lastInsertRowid;
  const transporte = insCategoria.run('Transporte', 'gasto').lastInsertRowid;

  mov({ fecha: '2026-08-01', monto: 1000, tipo: 'gasto', cuenta_id: c1, categoria_id: comida });
  mov({ fecha: '2026-08-02', monto: 500, tipo: 'gasto', cuenta_id: c1, categoria_id: comida });
  mov({ fecha: '2026-08-03', monto: 2000, tipo: 'gasto', cuenta_id: c1, categoria_id: transporte });
  mov({ fecha: '2026-08-04', monto: 300, tipo: 'gasto', cuenta_id: c1, categoria_id: null });
  mov({ fecha: '2026-08-04', monto: 999, tipo: 'ingreso', cuenta_id: c1 }); // no es gasto, no cuenta

  const resultado = contabilidad.gastoPorCategoria('2026-08-01', '2026-08-04');
  // hasta es exclusivo: el movimiento del día 04 queda fuera
  assert.deepEqual(resultado, [
    { categoria: 'Transporte', total: 2000 },
    { categoria: 'Comida', total: 1500 }
  ]);
});

// ---------------------------------------------------------------------------
// helpers de fecha / porcentaje puros
// ---------------------------------------------------------------------------

test('mesActualISO: usa el mes calendario local, no se corre por conversión a UTC en zonas negativas', (t) => {
  const tzOriginal = process.env.TZ;
  process.env.TZ = 'America/Mexico_City'; // UTC-6 fijo (sin horario de verano)
  // En UTC son las 03:00 del 1 de septiembre, pero en UTC-6 todavía son
  // las 21:00 del 31 de agosto: mesActualISO debe seguir dando agosto.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-01T03:00:00Z') });
  try {
    assert.equal(contabilidad.mesActualISO(), '2026-08');
  } finally {
    t.mock.timers.reset();
    process.env.TZ = tzOriginal;
  }
});

test('rangoDeMes: calcula el rango [inicio, finExclusivo) correctamente, incluido diciembre', () => {
  assert.deepEqual(contabilidad.rangoDeMes('2026-02'), { inicio: '2026-02-01', finExclusivo: '2026-03-01' });
  assert.deepEqual(contabilidad.rangoDeMes('2026-12'), { inicio: '2026-12-01', finExclusivo: '2027-01-01' });
});

test('mesAnteriorISO: retrocede un mes, incluido el cruce de año', () => {
  assert.equal(contabilidad.mesAnteriorISO('2026-08'), '2026-07');
  assert.equal(contabilidad.mesAnteriorISO('2026-01'), '2025-12');
});

test('variacionPct: redondea a 2 decimales y evita división entre cero', () => {
  assert.equal(contabilidad.variacionPct(150, 100), 50);
  assert.equal(contabilidad.variacionPct(50, 100), -50);
  assert.equal(contabilidad.variacionPct(100, 3), 3233.33);
  assert.equal(contabilidad.variacionPct(0, 0), 0);
  assert.equal(contabilidad.variacionPct(500, 0), null);
});

// ---------------------------------------------------------------------------
// pesos (presentación, no cálculo)
// ---------------------------------------------------------------------------

test('pesos: formatea centavos como string con 2 decimales', () => {
  assert.equal(contabilidad.pesos(123456), '1,234.56');
  assert.equal(contabilidad.pesos(0), '0.00');
});
