const express = require('express');
const router = express.Router();
const contabilidad = require('../services/contabilidad');
const ia = require('../services/ia');

// El usuario pregunta en lenguaje natural.
// 1) El núcleo calcula (fuente de la verdad). 2) La IA solo redacta.
router.post('/preguntar', async (req, res) => {
  const { pregunta } = req.body || {};
  if (!pregunta) return res.status(400).json({ error: 'Falta la pregunta' });

  const datos = contabilidad.resumenMes();          // cifras exactas
  const respuesta = await ia.explicarFinanzas(datos, pregunta); // texto (puede ser null)

  // Aunque la IA falle, devolvemos los datos duros.
  res.json({ datos, respuesta });
});

module.exports = router;
