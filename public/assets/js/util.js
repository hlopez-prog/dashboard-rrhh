/* Utilidades compartidas: formato de números, fechas y estado vs meta. */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const fmt = {
  entero: (v) => Number.isFinite(v) ? Math.round(v).toLocaleString('es-MX') : '—',
  /* Normaliza el −0: un valor que redondea a cero se imprime sin signo. */
  dec: (v, d = 1) => {
    if (!Number.isFinite(v)) return '—';
    const n = Number(v.toFixed(d)) === 0 ? 0 : v;
    return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct: (v, d = 1) => Number.isFinite(v) ? `${fmt.dec(v, d)}%` : '—',
  mxn: (v) => Number.isFinite(v)
    ? `$${Math.round(v).toLocaleString('es-MX')}`
    : '—',
  /* Montos grandes en formato ejecutivo: $12.4 M */
  mxnCorto: (v) => {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return `$${fmt.dec(v / 1e9, 2)} MM`;
    if (a >= 1e6) return `$${fmt.dec(v / 1e6, 1)} M`;
    if (a >= 1e3) return `$${fmt.dec(v / 1e3, 0)} K`;
    return `$${fmt.entero(v)}`;
  },
  numCorto: (v) => {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return `${fmt.dec(v / 1e6, 2)} M`;
    if (a >= 1e3) return `${fmt.dec(v / 1e3, 1)} K`;
    return fmt.entero(v);
  },
  delta: (v, d = 1) => {
    if (!Number.isFinite(v)) return '—';
    const s = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${s}${fmt.dec(Math.abs(v), d)}`;
  },
  /* '2026-07' → 'jul 26' */
  periodo: (p) => {
    if (!p) return '—';
    const [y, m] = p.split('-');
    return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
  },
  /* '2026-07' → 'julio 2026' */
  periodoLargo: (p) => {
    if (!p) return '—';
    const largo = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const [y, m] = p.split('-');
    return `${largo[Number(m) - 1]} ${y}`;
  },
};

/* Divisón segura: devuelve null en lugar de Infinity/NaN. */
export function div(a, b) {
  return (Number.isFinite(a) && Number.isFinite(b) && b !== 0) ? a / b : null;
}

export function suma(arr, f) {
  return arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
}

export function promedio(arr, f) {
  return arr.length ? suma(arr, f) / arr.length : null;
}

/**
 * Evalúa un valor contra su meta.
 * @returns {'ok'|'alerta'|'neutro'}
 * Tolerancia: hasta 3% de desviación relativa se considera "en meta".
 */
export function estadoVsMeta(valor, meta, direccion, tolerancia = 0.03) {
  if (!Number.isFinite(valor) || !Number.isFinite(meta)) return 'neutro';
  const margen = Math.abs(meta) * tolerancia;
  if (direccion === 'menor_mejor') return valor <= meta + margen ? 'ok' : 'alerta';
  return valor >= meta - margen ? 'ok' : 'alerta';
}

export const ICONO = { ok: '●', alerta: '▲', neutro: '–' };
export const TEXTO_ESTADO = { ok: 'En meta', alerta: 'Fuera de meta', neutro: 'Sin meta' };

/* Crea un elemento con clases, atributos e hijos. */
export function el(tag, props = {}, hijos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'clase') n.className = v;
    else if (k === 'texto') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'estilo') n.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const h of [].concat(hijos)) {
    if (h === null || h === undefined) continue;
    n.append(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return n;
}

/* Escapa texto para usarlo dentro de innerHTML del tooltip. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
