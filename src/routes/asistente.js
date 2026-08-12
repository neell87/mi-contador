const express = require('express');
const router = express.Router();
const db = require('../db');
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

// Compara nombres de categoría ignorando acentos y mayúsculas/minúsculas.
function normalizar(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// Sugerencia de categoría para un movimiento nuevo. La IA solo propone un
// nombre; aquí se valida contra las categorías reales de ese tipo y solo se
// acepta si coincide con una que ya existe. Nunca se crea una categoría
// nueva a partir de la respuesta de la IA: el usuario decide.
router.post('/categorizar', async (req, res) => {
  const { descripcion, tipo } = req.body || {};
  if (!descripcion || !String(descripcion).trim()) {
    return res.status(400).json({ error: 'Falta la descripción' });
  }
  if (tipo !== 'gasto' && tipo !== 'ingreso') {
    return res.status(400).json({ error: "tipo debe ser 'gasto' o 'ingreso'" });
  }

  const categorias = db.prepare(
    'SELECT id, nombre FROM categorias WHERE tipo = ? ORDER BY nombre'
  ).all(tipo);

  const nombreSugerido = await ia.sugerirCategoria(descripcion, categorias.map(c => c.nombre));
  const encontrada = nombreSugerido
    ? categorias.find(c => normalizar(c.nombre) === normalizar(nombreSugerido))
    : null;

  res.json({ sugerencia: encontrada ? { id: encontrada.id, nombre: encontrada.nombre } : null });
});

module.exports = router;
