const express = require('express');
const router = express.Router();
const db = require('../db');
const contabilidad = require('../services/contabilidad');

// Listar cuentas con su saldo actual (calculado por el núcleo)
router.get('/', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas WHERE activo = 1 ORDER BY nombre').all();
  const conSaldo = cuentas.map(c => ({ ...c, saldo: contabilidad.saldoCuenta(c.id) }));
  res.json(conSaldo);
});

router.post('/', (req, res) => {
  const { nombre, tipo, saldo_inicial } = req.body || {};
  if (!nombre || !tipo) return res.status(400).json({ error: 'Faltan datos' });
  const info = db.prepare(
    'INSERT INTO cuentas (nombre, tipo, saldo_inicial) VALUES (?, ?, ?)'
  ).run(nombre, tipo, Number.isInteger(saldo_inicial) ? saldo_inicial : 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
