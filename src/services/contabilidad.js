// Núcleo contable. AQUÍ y solo aquí se calculan cifras de dinero.
// Todo entra y sale en CENTAVOS (enteros). La IA jamás toca estas funciones.
//
// Convención de rangos de fecha: `desde` inclusivo, `hasta` EXCLUSIVO
// (así "mes de agosto" es [2026-08-01, 2026-09-01) sin ambigüedad de
// horas/timezone en fechas tipo 'YYYY-MM-DD').

const db = require('../db');

// ---- helpers de fecha (puro JS, sin tocar la BD, para que sean testeables) ----

// 'YYYY-MM' del mes actual del sistema, en hora local (no UTC: toISOString()
// convierte a UTC y en zonas negativas como UTC-6 puede adelantar el mes).
function mesActualISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
}

// 'YYYY-MM' -> { inicio: 'YYYY-MM-01', finExclusivo: 'YYYY-MM-01' del mes siguiente }
function rangoDeMes(mesRef) {
  const m = /^(\d{4})-(\d{2})$/.exec(mesRef);
  if (!m) throw new Error(`mesRef inválido: "${mesRef}" (formato esperado "YYYY-MM")`);
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const inicio = `${m[1]}-${m[2]}-01`;
  const finExclusivo = mes === 12
    ? `${anio + 1}-01-01`
    : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  return { inicio, finExclusivo };
}

// 'YYYY-MM' -> 'YYYY-MM' del mes inmediato anterior
function mesAnteriorISO(mesRef) {
  const m = /^(\d{4})-(\d{2})$/.exec(mesRef);
  if (!m) throw new Error(`mesRef inválido: "${mesRef}" (formato esperado "YYYY-MM")`);
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`;
}

// ---- saldo de cuentas ----

// Efecto neto de los movimientos de una cuenta (sin contar saldo_inicial):
// ingresos suman, gastos restan, transferencias entran/salen.
function movimientosNeto(cuentaId) {
  const ingresos = db.prepare(
    "SELECT COALESCE(SUM(monto),0) t FROM movimientos WHERE cuenta_id=? AND tipo='ingreso'"
  ).get(cuentaId).t;

  const gastos = db.prepare(
    "SELECT COALESCE(SUM(monto),0) t FROM movimientos WHERE cuenta_id=? AND tipo='gasto'"
  ).get(cuentaId).t;

  const transfSale = db.prepare(
    "SELECT COALESCE(SUM(monto),0) t FROM movimientos WHERE cuenta_id=? AND tipo='transferencia'"
  ).get(cuentaId).t;

  const transfEntra = db.prepare(
    "SELECT COALESCE(SUM(monto),0) t FROM movimientos WHERE cuenta_destino_id=? AND tipo='transferencia'"
  ).get(cuentaId).t;

  return ingresos - gastos - transfSale + transfEntra;
}

// Saldo actual de una cuenta = saldo_inicial + ingresos - gastos +/- transferencias
function saldoCuenta(cuentaId) {
  const cuenta = db.prepare('SELECT saldo_inicial FROM cuentas WHERE id = ?').get(cuentaId);
  if (!cuenta) return null;
  return cuenta.saldo_inicial + movimientosNeto(cuentaId);
}

// Balance general: saldo de cada cuenta activa + patrimonio total.
//
// Las cuentas de tipo 'credito' son un pasivo (deuda), no un activo. Su
// saldo_inicial se captura en positivo ("cuánto debo hoy en esta tarjeta"),
// al revés que en una cuenta normal donde saldo_inicial es dinero a favor;
// por eso aquí se resta en vez de sumarse. Los movimientos (gasto = cargo,
// ingreso = pago/abono) ya restan/suman en la dirección correcta con la
// misma fórmula que cualquier otra cuenta. El resultado queda con "signo
// claro": negativo siempre significa deuda, igual que en cualquier cuenta.
function balancePorCuenta() {
  const cuentas = db.prepare(
    'SELECT id, nombre, tipo, saldo_inicial FROM cuentas WHERE activo = 1 ORDER BY nombre'
  ).all();

  const conSaldo = cuentas.map(c => {
    const esPasivo = c.tipo === 'credito';
    const saldoInicialConSigno = esPasivo ? -c.saldo_inicial : c.saldo_inicial;
    const saldo = saldoInicialConSigno + movimientosNeto(c.id);
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, es_pasivo: esPasivo, saldo };
  });

  const patrimonioTotal = conSaldo.reduce((acc, c) => acc + c.saldo, 0);

  return { cuentas: conSaldo, patrimonio_total: patrimonioTotal };
}

// ---- totales por mes ----

// Totales de ingreso/gasto/balance y gasto por categoría de un mes dado.
// mesRef en formato 'YYYY-MM'; si se omite, usa el mes actual del sistema.
function totalesMes(mesRef) {
  mesRef = mesRef || mesActualISO();
  const { inicio, finExclusivo } = rangoDeMes(mesRef);

  const ingreso = db.prepare(`
    SELECT COALESCE(SUM(monto),0) t FROM movimientos
    WHERE tipo='ingreso' AND fecha >= ? AND fecha < ?
  `).get(inicio, finExclusivo).t;

  const gasto = db.prepare(`
    SELECT COALESCE(SUM(monto),0) t FROM movimientos
    WHERE tipo='gasto' AND fecha >= ? AND fecha < ?
  `).get(inicio, finExclusivo).t;

  const gastoPorCategoria = db.prepare(`
    SELECT c.nombre AS categoria, COALESCE(SUM(m.monto),0) AS total
    FROM movimientos m LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE m.tipo='gasto' AND m.fecha >= ? AND m.fecha < ?
    GROUP BY m.categoria_id
    ORDER BY total DESC
  `).all(inicio, finExclusivo);

  return { mes: mesRef, ingreso, gasto, balance: ingreso - gasto, gasto_por_categoria: gastoPorCategoria };
}

// Total de gasto del mes actual (compatibilidad con código existente)
function totalGastoMes() {
  return totalesMes().gasto;
}

// Total de ingreso del mes actual (compatibilidad con código existente)
function totalIngresoMes() {
  return totalesMes().ingreso;
}

// Gasto por categoría en un rango de fechas explícito.
// desde inclusivo, hasta exclusivo. Sin argumentos, usa el mes actual.
function gastoPorCategoria(desde, hasta) {
  if (!desde || !hasta) {
    const r = rangoDeMes(mesActualISO());
    desde = desde || r.inicio;
    hasta = hasta || r.finExclusivo;
  }
  return db.prepare(`
    SELECT c.nombre AS categoria, COALESCE(SUM(m.monto),0) AS total
    FROM movimientos m LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE m.tipo='gasto' AND m.fecha >= ? AND m.fecha < ?
    GROUP BY m.categoria_id
    ORDER BY total DESC
  `).all(desde, hasta);
}

// Variación porcentual de "actual" respecto a "anterior", redondeada a 2
// decimales. Si el mes anterior fue 0, no hay porcentaje que calcular:
// devuelve null (0 -> algo sería infinito) salvo 0 -> 0 (sin cambio real).
function variacionPct(actual, anterior) {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 10000) / 100;
}

// Comparativa del mes contra el mes inmediato anterior.
// mesRef en formato 'YYYY-MM'; si se omite, usa el mes actual del sistema.
function comparativaMensual(mesRef) {
  mesRef = mesRef || mesActualISO();
  const mesAnterior = mesAnteriorISO(mesRef);

  const actual = totalesMes(mesRef);
  const anterior = totalesMes(mesAnterior);

  return {
    mes_actual: actual,
    mes_anterior: anterior,
    variacion_ingreso_pct: variacionPct(actual.ingreso, anterior.ingreso),
    variacion_gasto_pct: variacionPct(actual.gasto, anterior.gasto),
    variacion_balance_pct: variacionPct(actual.balance, anterior.balance)
  };
}

// Resumen listo para pasar a la IA (cifras ya calculadas)
function resumenMes() {
  const t = totalesMes();
  return {
    ingreso_mes: t.ingreso,
    gasto_mes: t.gasto,
    balance_mes: t.balance,
    gasto_por_categoria: t.gasto_por_categoria
  };
}

// Helper de presentación (no de cálculo): centavos -> "1,234.50"
function pesos(centavos) {
  return (centavos / 100).toLocaleString('es-MX', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

module.exports = {
  saldoCuenta,
  balancePorCuenta,
  gastoPorCategoria,
  totalGastoMes,
  totalIngresoMes,
  totalesMes,
  comparativaMensual,
  resumenMes,
  pesos,
  // exportados para tests / reutilización de helpers de fecha
  mesActualISO,
  rangoDeMes,
  mesAnteriorISO,
  variacionPct
};
