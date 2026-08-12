# Mi Contador — contexto para Claude Code

Asistente de contabilidad personal. Corre en un servidor propio (Ubuntu, **solo
CPU, sin GPU**) y se usa desde el celular como **PWA**. Es de **uso personal**.

## Regla de oro (no negociable)

**La IA nunca calcula un número.** Todos los montos, totales, IVA, saldos y
balances los produce el núcleo contable (SQL + JS determinista). La IA local
solo recibe cifras ya calculadas y las **explica en español**, categoriza gastos
y redacta resúmenes. Si la IA falla o está lenta, la app sigue funcionando con
los datos duros.

Cualquier función que devuelva dinero debe ser determinista y testeable. Si te
descubres pidiéndole a la IA que sume, redondee o aplique un porcentaje: PARA y
muévelo al núcleo contable.

## Decisiones de diseño fijas

- **Dinero en centavos como enteros.** `1250`, no `12.50`. Nunca flotantes para
  dinero. Se divide entre 100 solo al presentar.
- **Stack:** Node + Express + better-sqlite3 + HTML/JS vanilla. Sin frameworks
  de frontend. Mismo estilo que el resto de mis sistemas.
- **IA local:** Ollama en `http://localhost:11434`, modelo `qwen3:4b` (o el tag
  que exista al instalar; verificar con `ollama list`). Modelo pequeño porque es
  CPU. Prompts cortos. Timeout y fallback siempre.
- **PWA:** manifest + service worker, instalable, servida por HTTPS detrás de
  Nginx. Funciona offline para consultar lo ya cacheado.
- **Base de datos:** un archivo SQLite (`data/contador.db`). Migraciones simples
  vía `schema.sql`.

## Estructura

```
src/
  server.js              arranque Express + estáticos
  db.js                  conexión better-sqlite3, aplica schema.sql
  schema.sql             tablas
  seed.js                categorías y cuentas de ejemplo (opcional)
  services/
    contabilidad.js      TODA la aritmética vive aquí (fuente de la verdad)
    ia.js                puente con Ollama; solo redacta, nunca calcula
  routes/
    cuentas.js
    movimientos.js
    reportes.js          consultas SQL agregadas
    asistente.js         orquesta: calcula con contabilidad.js -> redacta con ia.js
public/
  index.html  app.js  styles.css
  manifest.json  sw.js
  icons/               icon-192.png, icon-512.png (faltan, generarlos)
```

## Qué falta construir (orden sugerido)

1. Completar `routes/movimientos.js` y `routes/cuentas.js` (CRUD).
2. Ampliar `services/contabilidad.js`: saldo por cuenta, gasto por categoría y
   mes, comparativa mes vs mes anterior, balance general. **Con tests.**
3. Frontend `app.js`: formulario de captura, lista de movimientos, pantalla de
   reportes, y el chat del asistente.
4. Categorización automática: al capturar un gasto sin categoría, pedir a la IA
   una sugerencia (`ia.sugerirCategoria`) que el usuario confirma. La IA sugiere,
   no decide.
5. Service worker: caché del cascarón + estrategia network-first para datos.
6. Generar los iconos PWA (192 y 512 px).

## Cómo correr en desarrollo

```bash
npm install
npm run seed      # opcional, datos de ejemplo
npm run dev       # nodemon en :4040
```

Producción: `pm2 start ecosystem.config.js` detrás de Nginx con HTTPS.

## Estilo

- Comentarios y textos de UI en español.
- Código directo y completo, no fragmentos a medias.
- Nombres de tablas/columnas en español, consistentes con `schema.sql`.
