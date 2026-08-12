const express = require('express');
const router = express.Router();
const contabilidad = require('../services/contabilidad');

// Resumen del mes actual (cifras exactas, sin IA)
router.get('/mes', (req, res) => {
  res.json(contabilidad.resumenMes());
});

// Comparativa del mes vs el mes anterior. ?mes=YYYY-MM opcional (default: mes actual)
router.get('/comparativa', (req, res) => {
  const { mes } = req.query;
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: 'Parámetro "mes" inválido, formato esperado YYYY-MM' });
  }
  try {
    res.json(contabilidad.comparativaMensual(mes || undefined));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Balance por cuenta + patrimonio total (cifras exactas, sin IA)
router.get('/balance', (req, res) => {
  res.json(contabilidad.balancePorCuenta());
});

module.exports = router;
