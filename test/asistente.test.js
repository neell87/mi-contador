// Tests del endpoint de categorización automática. Usa una BD SQLite en
// memoria (DB_PATH=':memory:') y reemplaza ia.sugerirCategoria por un stub:
// nunca se llama a Ollama de verdad en los tests.

process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const db = require('../src/db');
const ia = require('../src/services/ia');
const asistenteRouter = require('../src/routes/asistente');

const insCategoria = db.prepare('INSERT INTO categorias (nombre, tipo) VALUES (?, ?)');

function limpiarBD() {
  db.exec('DELETE FROM movimientos; DELETE FROM cuentas; DELETE FROM categorias;');
}

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/asistente', asistenteRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => {
  server.close();
});

test.beforeEach(() => {
  limpiarBD();
});

async function categorizar(body) {
  const r = await fetch(`${baseUrl}/api/asistente/categorizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}

test('categorizar: la IA sugiere un nombre que coincide con una categoría real -> responde su id', async () => {
  const comidaId = insCategoria.run('Comida', 'gasto').lastInsertRowid;
  insCategoria.run('Transporte', 'gasto');
  ia.sugerirCategoria = async () => 'Comida';

  const { status, body } = await categorizar({ descripcion: 'tacos al pastor', tipo: 'gasto' });

  assert.equal(status, 200);
  assert.deepEqual(body, { sugerencia: { id: comidaId, nombre: 'Comida' } });
});

test('categorizar: la IA sugiere un nombre que no existe entre las categorías -> sugerencia null', async () => {
  insCategoria.run('Comida', 'gasto');
  ia.sugerirCategoria = async () => 'Mascotas'; // no está en la lista real

  const { status, body } = await categorizar({ descripcion: 'croquetas para el gato', tipo: 'gasto' });

  assert.equal(status, 200);
  assert.deepEqual(body, { sugerencia: null });
});

test('categorizar: la IA falla o hace timeout (devuelve null) -> sugerencia null', async () => {
  insCategoria.run('Comida', 'gasto');
  ia.sugerirCategoria = async () => null;

  const { status, body } = await categorizar({ descripcion: 'algo', tipo: 'gasto' });

  assert.equal(status, 200);
  assert.deepEqual(body, { sugerencia: null });
});

test('categorizar: hace match ignorando acentos y mayúsculas/minúsculas', async () => {
  const comidaId = insCategoria.run('Comida', 'gasto').lastInsertRowid;

  ia.sugerirCategoria = async () => 'comida'; // minúsculas
  const r1 = await categorizar({ descripcion: 'tacos', tipo: 'gasto' });
  assert.deepEqual(r1.body, { sugerencia: { id: comidaId, nombre: 'Comida' } });

  ia.sugerirCategoria = async () => 'CÓMIDA'; // mayúsculas + variación de acento
  const r2 = await categorizar({ descripcion: 'tacos', tipo: 'gasto' });
  assert.deepEqual(r2.body, { sugerencia: { id: comidaId, nombre: 'Comida' } });
});

test('categorizar: 400 si falta la descripción', async () => {
  const { status, body } = await categorizar({ descripcion: '  ', tipo: 'gasto' });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('categorizar: 400 si el tipo no es "gasto" ni "ingreso"', async () => {
  const { status, body } = await categorizar({ descripcion: 'algo', tipo: 'transferencia' });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('categorizar: solo compara contra categorías del tipo pedido, no mezcla gasto/ingreso', async () => {
  insCategoria.run('Sueldo', 'ingreso');
  ia.sugerirCategoria = async () => 'Sueldo'; // existe, pero como ingreso, no como gasto

  const { body } = await categorizar({ descripcion: 'pago quincenal', tipo: 'gasto' });
  assert.deepEqual(body, { sugerencia: null });
});

test('categorizar: nunca crea una categoría nueva a partir de la respuesta de la IA', async () => {
  insCategoria.run('Comida', 'gasto');
  ia.sugerirCategoria = async () => 'Mascotas'; // no existe

  await categorizar({ descripcion: 'croquetas', tipo: 'gasto' });

  const categorias = db.prepare('SELECT nombre FROM categorias').all().map((c) => c.nombre);
  assert.deepEqual(categorias, ['Comida']); // sigue habiendo solo la que ya existía
});
