// Frontend mínimo. Los montos se muestran en pesos pero se envían en centavos.
// Todas las cifras (saldos, totales, variaciones) las calcula el servidor;
// aquí solo se piden, se formatean y se pintan.

const $ = (id) => document.getElementById(id);
const pesos = (c) => (c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
const pad2 = (n) => String(n).padStart(2, '0');
// Fecha/mes de un instante en hora LOCAL, no UTC: toISOString() convierte a
// UTC y en zonas negativas (p. ej. UTC-6) puede adelantar el día o el mes.
const fechaISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // 'YYYY-MM-DD'
const mesISO = (d) => fechaISO(d).slice(0, 7); // 'YYYY-MM'
const nombreMes = (mesRef) => {
  const [anio, mes] = mesRef.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, 1));
  const nombre = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};
const sumarMeses = (mesRef, delta) => {
  const [anio, mes] = mesRef.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

let mesReportes = mesISO(new Date());

async function cargarResumen() {
  try {
    const r = await fetch('/api/reportes/mes').then(x => x.json());
    $('resumen-cifras').innerHTML = `
      <p>Ingresos: <strong>$${pesos(r.ingreso_mes)}</strong></p>
      <p>Gastos: <strong>$${pesos(r.gasto_mes)}</strong></p>
      <p>Balance: <strong>$${pesos(r.balance_mes)}</strong></p>`;
  } catch { $('resumen-cifras').textContent = 'Sin conexión.'; }
}

async function cargarMovimientos() {
  try {
    const rows = await fetch('/api/movimientos').then(x => x.json());
    $('lista-mov').innerHTML = rows.map(m => `
      <li>
        <span>${m.fecha} · ${m.descripcion || m.categoria || m.tipo}</span>
        <strong class="${m.tipo}">${m.tipo === 'gasto' ? '-' : '+'}$${pesos(m.monto)}</strong>
      </li>`).join('');
  } catch { /* offline: se queda lo cacheado */ }
}

// Cuentas y categorías para los selects del formulario de captura.
async function cargarCuentas() {
  try {
    const cuentas = await fetch('/api/cuentas').then(x => x.json());
    $('mov-cuenta').innerHTML = cuentas
      .map(c => `<option value="${c.id}">${c.nombre} ($${pesos(c.saldo)})</option>`)
      .join('') || '<option value="">Sin cuentas</option>';
  } catch { /* offline: se queda lo cacheado */ }
}

async function cargarCategorias() {
  const tipo = $('mov-tipo').value;
  try {
    const categorias = await fetch(`/api/categorias?tipo=${tipo}`).then(x => x.json());
    $('mov-categoria').innerHTML = '<option value="">Sin categoría</option>' +
      categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  } catch { /* offline: se queda lo cacheado */ }
}

$('mov-tipo').addEventListener('change', cargarCategorias);

$('btn-guardar').addEventListener('click', async () => {
  const monto = Math.round(parseFloat($('mov-monto').value) * 100); // a centavos
  const cuenta_id = Number($('mov-cuenta').value);
  if (!Number.isInteger(monto) || monto <= 0) return alert('Monto inválido');
  if (!cuenta_id) return alert('Elige una cuenta');
  await fetch('/api/movimientos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fecha: fechaISO(new Date()),
      monto,
      tipo: $('mov-tipo').value,
      cuenta_id,
      categoria_id: $('mov-categoria').value ? Number($('mov-categoria').value) : null,
      descripcion: $('mov-desc').value || null
    })
  });
  $('mov-monto').value = ''; $('mov-desc').value = '';
  cargarResumen(); cargarMovimientos(); cargarCuentas(); cargarBalance();
});

// ---------------------------------------------------------------------------
// Reportes: comparativa mes vs. mes anterior + balance por cuenta.
// Todas las cifras vienen ya calculadas de /api/reportes/*.
// ---------------------------------------------------------------------------

// pct viene del núcleo tal cual el servidor lo calculó (nunca se recalcula
// aquí): null = no hubo mes anterior con qué comparar (concepto nuevo);
// 0 = sin cambio real; cualquier otro número = variación %.
function filaVariacion(etiqueta, valorActual, pct) {
  let texto, clase;
  if (pct === null) {
    texto = '↑ nuevo';
    clase = 'nuevo';
  } else if (pct === 0) {
    texto = '0%';
    clase = 'neutro';
  } else {
    texto = `${pct > 0 ? '+' : ''}${pct}%`;
    clase = pct > 0 ? 'ingreso' : 'gasto';
  }
  return `
    <div class="fila-reporte">
      <span>${etiqueta}</span>
      <span>$${pesos(valorActual)} <small class="${clase}">(${texto})</small></span>
    </div>`;
}

async function cargarComparativa() {
  $('reportes-mes-actual').textContent = nombreMes(mesReportes);
  try {
    const c = await fetch(`/api/reportes/comparativa?mes=${mesReportes}`).then(x => x.json());
    $('comparativa').innerHTML =
      filaVariacion('Ingresos', c.mes_actual.ingreso, c.variacion_ingreso_pct) +
      filaVariacion('Gastos', c.mes_actual.gasto, c.variacion_gasto_pct) +
      filaVariacion('Balance', c.mes_actual.balance, c.variacion_balance_pct) +
      `<p class="muted">vs. ${nombreMes(c.mes_anterior.mes)}: ingresos $${pesos(c.mes_anterior.ingreso)},
       gastos $${pesos(c.mes_anterior.gasto)}, balance $${pesos(c.mes_anterior.balance)}</p>`;
  } catch { $('comparativa').textContent = 'Sin conexión.'; }
}

async function cargarBalance() {
  try {
    const b = await fetch('/api/reportes/balance').then(x => x.json());
    $('balance-cuentas').innerHTML =
      '<ul>' + b.cuentas.map(c => `
        <li><span>${c.nombre}</span><strong>$${pesos(c.saldo)}</strong></li>
      `).join('') + '</ul>' +
      `<p class="patrimonio">Patrimonio total: <strong>$${pesos(b.patrimonio_total)}</strong></p>`;
  } catch { $('balance-cuentas').textContent = 'Sin conexión.'; }
}

$('btn-mes-anterior').addEventListener('click', () => {
  mesReportes = sumarMeses(mesReportes, -1);
  cargarComparativa();
});
$('btn-mes-siguiente').addEventListener('click', () => {
  mesReportes = sumarMeses(mesReportes, 1);
  cargarComparativa();
});

$('btn-preguntar').addEventListener('click', async () => {
  const pregunta = $('pregunta').value.trim();
  if (!pregunta) return;
  $('respuesta-ia').textContent = 'Pensando…';
  const r = await fetch('/api/asistente/preguntar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta })
  }).then(x => x.json());
  // Si la IA respondió, la mostramos; si no, mostramos las cifras duras.
  $('respuesta-ia').textContent = r.respuesta
    || `Gasto del mes: $${pesos(r.datos.gasto_mes)} · Balance: $${pesos(r.datos.balance_mes)}`;
});

cargarResumen();
cargarMovimientos();
cargarCuentas();
cargarCategorias();
cargarComparativa();
cargarBalance();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
