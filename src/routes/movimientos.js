const express = require('express');
const router = express.Router();
const db = require('../db');

// Listar (más recientes primero)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, c.nombre AS categoria, cu.nombre AS cuenta
    FROM movimientos m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    LEFT JOIN cuentas cu ON cu.id = m.cuenta_id
    ORDER BY m.fecha DESC, m.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

// Crear. monto llega en CENTAVOS (entero).
router.post('/', (req, res) => {
  const { fecha, monto, tipo, cuenta_id, categoria_id, descripcion, cuenta_destino_id } = req.body || {};
  if (!fecha || !Number.isInteger(monto) || monto <= 0 || !tipo || !cuenta_id) {
    return res.status(400).json({ error: 'Datos inválidos (monto debe ser entero de centavos > 0)' });
  }
  const info = db.prepare(`
    INSERT INTO movimientos (fecha, monto, tipo, cuenta_id, cuenta_destino_id, categoria_id, descripcion)
    VALUES (@fecha, @monto, @tipo, @cuenta_id, @cuenta_destino_id, @categoria_id, @descripcion)
  `).run({
    fecha, monto, tipo, cuenta_id,
    cuenta_destino_id: cuenta_destino_id || null,
    categoria_id: categoria_id || null,
    descripcion: descripcion || null
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

// Eliminar
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM movimientos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
