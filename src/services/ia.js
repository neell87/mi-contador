// Puente con la IA local (Ollama). NUNCA calcula: solo interpreta y redacta
// datos que ya vienen calculados por contabilidad.js.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELO = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct-2507-q4_K_M';
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT || 20000);

async function chat(prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        stream: false,
        options: { temperature: 0.2 },
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return data.message?.content?.trim() || null;
  } catch (e) {
    console.error('[ia] fallo:', e.message);
    return null; // el llamador debe seguir mostrando los datos duros
  } finally {
    clearTimeout(t);
  }
}

// Explica un resumen financiero ya calculado. Los números vienen dados.
async function explicarFinanzas(datosCalculados, pregunta) {
  const prompt = `Eres un asistente contable personal. Responde en español,
breve y claro (máx 4 frases). USA SOLO estos datos ya calculados; no inventes
ni recalcules ninguna cifra. Los montos vienen en centavos:

${JSON.stringify(datosCalculados, null, 2)}

Pregunta: ${pregunta}`;
  return chat(prompt);
}

// Sugiere una categoría para un gasto. El usuario la confirma; la IA no decide.
async function sugerirCategoria(descripcion, categoriasDisponibles) {
  const prompt = `Dada esta descripción de gasto: "${descripcion}"
y estas categorías posibles: ${categoriasDisponibles.join(', ')}
responde SOLO con el nombre exacto de la categoría más probable, sin explicar.`;
  const r = await chat(prompt);
  return r ? r.split('\n')[0].trim() : null;
}

module.exports = { explicarFinanzas, sugerirCategoria };
