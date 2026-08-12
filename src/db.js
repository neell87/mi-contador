const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DB_PATH permite apuntar a otro archivo (o ':memory:') en los tests,
// sin tocar el archivo real de producción.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'contador.db');

if (DB_PATH !== ':memory:') {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Aplica el esquema al arrancar (idempotente por los IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
