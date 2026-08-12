const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());

// API
app.use('/api/cuentas', require('./routes/cuentas'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/asistente', require('./routes/asistente'));

// PWA (estáticos)
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 4040;
app.listen(PORT, () => console.log(`Mi Contador escuchando en :${PORT}`));
