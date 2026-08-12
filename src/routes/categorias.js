const express = require('express');
const router = express.Router();
const db = require('../db');

// Listar categorías, opcionalmente filtradas por tipo (?tipo=gasto|ingreso)
router.get('/', (req, res) => {
  const { tipo } = req.query;
  const rows = (tipo === 'gasto' || tipo === 'ingreso')
    ? db.prepare('SELECT * FROM categorias WHERE tipo = ? ORDER BY nombre').all(tipo)
    : db.prepare('SELECT * FROM categorias ORDER BY tipo, nombre').all();
  res.json(rows);
});

module.exports = router;
