# Mi Contador

Asistente de contabilidad **personal** con IA local. PWA en el celular, backend
Node/Express en un servidor Ubuntu **sin GPU**. La IA local (Ollama) solo
interpreta y redacta; **todas las cifras las calcula el núcleo contable**.

## Requisitos

- Node.js 18+ (fetch nativo).
- Ollama instalado en el servidor.

## 1. IA local (Ollama)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:4b      # si va lento en CPU, prueba qwen3:1.7b
ollama list               # confirma el nombre exacto del tag
```

Para que no se descargue de RAM entre consultas (CPU): exporta
`OLLAMA_KEEP_ALIVE=-1` (ya está en `ecosystem.config.js`).

## 2. App

```bash
npm install
npm run seed     # cuentas y categorías de ejemplo (opcional)
npm run dev      # desarrollo en http://localhost:4040
```

## 3. Producción

```bash
pm2 start ecosystem.config.js
```

Detrás de Nginx con **HTTPS** (obligatorio para instalar la PWA en el celular).

## Iconos

Faltan `public/icons/icon-192.png` y `icon-512.png`. Genera un par simples
(fondo verde #0f6e56, un símbolo o la inicial) para que la PWA sea instalable.

## Regla de oro

La IA nunca produce un número. El núcleo contable (`src/services/contabilidad.js`)
es la única fuente de cifras. Si Ollama falla, la app sigue mostrando los datos.

## Siguientes pasos

Ver `CLAUDE.md` — está la lista ordenada de lo que falta construir.
