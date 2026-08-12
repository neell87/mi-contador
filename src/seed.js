// Datos de ejemplo para empezar. Ejecutar: npm run seed
const db = require('./db');

const cuentas = [
  ['Efectivo', 'efectivo', 0],
  ['Tarjeta débito', 'debito', 0],
  ['Ahorro', 'ahorro', 0]
];
const categoriasGasto = ['Comida', 'Transporte', 'Salud', 'Servicios', 'Ocio', 'Otros'];
const categoriasIngreso = ['Sueldo', 'Extra', 'Otros'];

const insCuenta = db.prepare('INSERT INTO cuentas (nombre, tipo, saldo_inicial) VALUES (?, ?, ?)');
const insCat = db.prepare('INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES (?, ?)');

const tx = db.transaction(() => {
  const yaHay = db.prepare('SELECT COUNT(*) c FROM cuentas').get().c;
  if (yaHay === 0) cuentas.forEach(c => insCuenta.run(...c));
  categoriasGasto.forEach(n => insCat.run(n, 'gasto'));
  categoriasIngreso.forEach(n => insCat.run(n, 'ingreso'));
});
tx();

console.log('Seed listo: cuentas y categorías de ejemplo.');
