/*
 * Primitivas de gráfico en SVG puro — sin dependencias externas, para que el
 * dashboard funcione en GitHub Pages sin CDN ni build de JavaScript.
 *
 * PALETA DE SERIES
 * Los pasteles institucionales (verde #D9EAD3 / naranja #FCE5CD) son
 * rellenos SEMÁNTICOS: significan "en meta" y "riesgo". No pueden
 * identificar series, porque el mismo color significaría dos cosas. Las
 * series usan la paleta de abajo.
 *
 * Ampliada a 8 tonos en agosto 2026, al pasar de 5 a 8 unidades mineras.
 * NO se inventaron tonos: se adoptó el orden validado de la paleta de
 * referencia, verificado sobre superficie blanca con
 *
 *   node scripts/validate_palette.js \
 *     "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" \
 *     --mode light --surface "#FFFFFF"
 *   → TODAS LAS VERIFICACIONES PASAN
 *     separación CVD peor par adyacente ΔE 9.1 (protan)
 *     visión normal peor par ΔE 19.6
 *     AVISO de contraste en aqua, amarillo y magenta → por eso cada gráfico
 *     lleva etiquetas directas visibles y botón "ver tabla" (regla de alivio).
 *
 * El ORDEN es el mecanismo de seguridad para daltonismo, no es decorativo:
 * no lo reordenes sin volver a correr el validador. Y si algún día hacen
 * falta más de 8 series, no se agrega un noveno tono a mano — se agrupa o
 * se factoriza en gráficos pequeños. Ver TOPE_SERIES abajo.
 *
 * Orden fijo: la serie 3 es siempre aqua, aunque se filtre la serie 2.
 * El color sigue a la entidad, nunca a su posición en el ranking.
 */
import { fmt, esc, el } from './util.js';

export const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/* Cuántas series puede identificar la paleta sin repetir color. Pasado ese
   número, repetir tonos haría que dos unidades se vieran iguales: es peor
   que no dibujarlas. Quien llame recorta y lo dice en pantalla. */
export const TOPE_SERIES = PALETA.length;
const INK_MUTED = '#79776f';
const GRID = '#e2e2de';
const EJE = '#c4c4be';
const NEGRO = '#000000';
const SUPERFICIE = '#ffffff';

const NS = 'http://www.w3.org/2000/svg';

export function color(i) { return PALETA[i % PALETA.length]; }

function s(tag, attrs = {}, hijos = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    n.setAttribute(k, String(v));
  }
  for (const h of [].concat(hijos)) {
    if (h) n.append(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return n;
}

const FORMATOS = {
  entero: (v) => fmt.entero(v),
  dec: (v) => fmt.dec(v, 1),
  dec2: (v) => fmt.dec(v, 2),
  pct: (v) => fmt.pct(v, 1),
  mxn: (v) => fmt.mxn(v),
  mxn2: (v) => `$${fmt.dec(v, 2)}`,
  mxnCorto: (v) => fmt.mxnCorto(v),
  numCorto: (v) => fmt.numCorto(v),
};

export function formatear(v, formato = 'dec') {
  if (!Number.isFinite(v)) return '—';
  return (FORMATOS[formato] || FORMATOS.dec)(v);
}

/* Convierte a número para graficar. Un hueco (null / vacío) NO es cero:
   se vuelve NaN para que el tooltip diga "—" y no dibuje una barra. */
export function num(v) {
  return (v === null || v === undefined || v === '') ? NaN : Number(v);
}

/* Ticks "redondos" en el eje Y. */
function ticks(min, max, objetivo = 5) {
  if (min === max) { min -= 1; max += 1; }
  const bruto = (max - min) / objetivo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const desde = Math.floor(min / paso) * paso;
  const hasta = Math.ceil(max / paso) * paso;
  const out = [];
  for (let v = desde; v <= hasta + paso * 1e-9; v += paso) out.push(Number(v.toFixed(10)));
  return out;
}

/* Un tooltip por gráfico, reutilizado. */
function montarTooltip(contenedor) {
  let tt = contenedor.querySelector(':scope > .tooltip');
  if (!tt) {
    tt = el('div', { clase: 'tooltip', role: 'status', 'aria-live': 'polite' });
    contenedor.append(tt);
  }
  return {
    mostrar(x, y, html) {
      tt.innerHTML = html;
      tt.dataset.visible = 'true';
      const r = contenedor.getBoundingClientRect();
      const w = tt.offsetWidth || 160;
      let px = x + 14;
      if (px + w > r.width) px = Math.max(4, x - w - 14);
      tt.style.left = `${px}px`;
      tt.style.top = `${Math.max(4, y - 12)}px`;
    },
    ocultar() { tt.dataset.visible = 'false'; },
  };
}

function marcoSvg(ancho, alto) {
  return s('svg', {
    viewBox: `0 0 ${ancho} ${alto}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    style: `max-height:${alto}px`,
  });
}

function ejes(svg, { x0, x1, y0, y1 }, tk, escalaY, formato) {
  for (const t of tk) {
    const y = escalaY(t);
    svg.append(s('line', {
      x1: x0, x2: x1, y1: y, y2: y,
      stroke: t === 0 ? EJE : GRID, 'stroke-width': 1,
      'shape-rendering': 'crispEdges',
    }));
    svg.append(s('text', {
      x: x0 - 7, y: y + 3.5, 'text-anchor': 'end',
      fill: INK_MUTED, 'font-size': 10.5,
    }, formatear(t, formato)));
  }
  svg.append(s('line', {
    x1: x0, x2: x1, y1: y1, y2: y1, stroke: EJE, 'stroke-width': 1,
    'shape-rendering': 'crispEdges',
  }));
}

/* Se recorre desde el final hacia atrás: así el último periodo siempre
   aparece y nunca se solapa con el penúltimo rótulo dibujado. */
function etiquetasX(svg, etiquetas, xDe, y, cada = 1) {
  for (let i = etiquetas.length - 1; i >= 0; i -= cada) {
    svg.append(s('text', {
      x: xDe(i), y, 'text-anchor': 'middle', fill: INK_MUTED, 'font-size': 10.5,
    }, etiquetas[i]));
  }
}

/* =====================================================================
   Gráfico de líneas con crosshair + tooltip
   cfg: { series:[{nombre,valores:[]}], etiquetas:[], formato, meta:{valor,etiqueta} }
   ===================================================================== */
export function lineas(contenedor, cfg) {
  const { series, etiquetas, formato = 'dec', meta = null, altura = 250 } = cfg;
  const W = 760, H = altura;
  const m = { t: 16, r: 68, b: 26, l: 54 };
  const x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;

  const todos = series.flatMap((se) => se.valores.filter(Number.isFinite));
  if (meta && Number.isFinite(meta.valor)) todos.push(meta.valor);
  if (!todos.length) return el('p', { clase: 'nota', texto: 'Sin datos en el rango seleccionado.' });

  let min = Math.min(...todos), max = Math.max(...todos);
  const noNegativos = min >= 0;
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1;
  min -= pad; max += pad;
  /* Un indicador que no puede ser negativo (tasas, costos) nunca dibuja
     eje por debajo de cero: invita a leer valores que no existen. */
  if (noNegativos) min = Math.max(0, min);
  if (min > 0 && min < (max - min) * 0.6) min = 0;

  const tk = ticks(min, max);
  const tMin = Math.min(...tk), tMax = Math.max(...tk);
  const eY = (v) => y1 - ((v - tMin) / (tMax - tMin)) * (y1 - y0);
  const n = etiquetas.length;
  const eX = (i) => n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0);

  const svg = marcoSvg(W, H);
  svg.append(s('title', {}, cfg.titulo || 'Serie de tiempo'));
  ejes(svg, { x0, x1, y0, y1 }, tk, eY, formato);
  etiquetasX(svg, etiquetas, eX, H - 8, Math.max(1, Math.ceil(n / 12)));

  /* Línea de meta: guion, negro, etiquetada — nunca un color de serie. */
  if (meta && Number.isFinite(meta.valor)) {
    const y = eY(meta.valor);
    svg.append(s('line', {
      x1: x0, x2: x1, y1: y, y2: y, stroke: NEGRO, 'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    }));
    svg.append(s('text', {
      x: x1 + 5, y: y + 3.5, fill: NEGRO, 'font-size': 10.5, 'font-weight': 700,
    }, `Meta ${formatear(meta.valor, formato)}`));
  }

  series.forEach((se, si) => {
    const c = se.color || color(si);
    const pts = se.valores.map((v, i) => Number.isFinite(v) ? [eX(i), eY(v)] : null);
    /* Un solo path por tramo contiguo: los huecos no se interpolan. */
    let d = '', abierto = false;
    for (const p of pts) {
      if (!p) { abierto = false; continue; }
      d += `${abierto ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
      abierto = true;
    }
    svg.append(s('path', {
      d, fill: 'none', stroke: c, 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    /* Etiqueta directa al final: identidad sin depender del color. */
    const ult = [...pts].reverse().find(Boolean);
    if (ult && series.length <= TOPE_SERIES) {
      svg.append(s('circle', {
        cx: ult[0], cy: ult[1], r: 3.4, fill: c, stroke: SUPERFICIE, 'stroke-width': 2,
      }));
      if (!meta) {
        svg.append(s('text', {
          x: ult[0] + 7, y: ult[1] + 3.5, fill: c, 'font-size': 10.5, 'font-weight': 700,
        }, se.abrev || se.nombre));
      }
    }
  });

  /* Crosshair */
  const guia = s('line', {
    y1: y0, y2: y1, stroke: NEGRO, 'stroke-width': 1, opacity: 0,
    'stroke-dasharray': '3 3', 'pointer-events': 'none',
  });
  const puntos = series.map((se, si) => s('circle', {
    r: 4.5, fill: se.color || color(si), stroke: SUPERFICIE, 'stroke-width': 2,
    opacity: 0, 'pointer-events': 'none',
  }));
  svg.append(guia, ...puntos);

  const captura = s('rect', {
    x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0),
    fill: 'transparent', style: 'cursor:crosshair',
  });
  svg.append(captura);

  const tt = montarTooltip(contenedor);
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - x0) / (x1 - x0)) * (n - 1))));
    const gx = eX(i);
    guia.setAttribute('x1', gx); guia.setAttribute('x2', gx); guia.setAttribute('opacity', 0.55);
    let filas = '';
    series.forEach((se, si) => {
      const v = se.valores[i];
      const p = puntos[si];
      if (Number.isFinite(v)) {
        p.setAttribute('cx', gx); p.setAttribute('cy', eY(v)); p.setAttribute('opacity', 1);
      } else p.setAttribute('opacity', 0);
      filas += `<div class="tt-fila"><i class="tt-marca" style="background:${se.color || color(si)}"></i>`
        + `<span>${esc(se.nombre)}</span><span class="tt-val">${formatear(v, formato)}</span></div>`;
    });
    const cr = contenedor.getBoundingClientRect();
    tt.mostrar(ev.clientX - cr.left, ev.clientY - cr.top,
      `<div class="tt-titulo">${esc(etiquetas[i])}</div>${filas}`);
  };
  captura.addEventListener('mousemove', mover);
  captura.addEventListener('mouseleave', () => {
    guia.setAttribute('opacity', 0);
    puntos.forEach((p) => p.setAttribute('opacity', 0));
    tt.ocultar();
  });

  return svg;
}

/* =====================================================================
   Barras verticales — agrupadas o apiladas
   cfg: { series:[{nombre,valores}], etiquetas, apilado, formato }
   ===================================================================== */
export function barras(contenedor, cfg) {
  const { series, etiquetas, formato = 'entero', apilado = false, meta = null, altura = 250 } = cfg;
  const W = 760, H = altura;
  const m = { t: 16, r: apilado || !meta ? 20 : 68, b: 26, l: 58 };
  const x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
  const n = etiquetas.length;
  if (!n || !series.length) return el('p', { clase: 'nota', texto: 'Sin datos en el rango seleccionado.' });

  const totales = etiquetas.map((_, i) => apilado
    ? series.reduce((t, se) => t + (num(se.valores[i]) || 0), 0)
    : Math.max(...series.map((se) => num(se.valores[i]) || 0)));
  const minVals = etiquetas.map((_, i) => apilado
    ? 0 : Math.min(...series.map((se) => num(se.valores[i]) || 0)));
  let max = Math.max(...totales, meta && Number.isFinite(meta.valor) ? meta.valor : -Infinity);
  let min = Math.min(0, ...minVals);
  const tk = ticks(min, max * 1.06);
  const tMin = Math.min(...tk), tMax = Math.max(...tk);
  const eY = (v) => y1 - ((v - tMin) / (tMax - tMin)) * (y1 - y0);

  const anchoBanda = (x1 - x0) / n;
  const anchoGrupo = anchoBanda * 0.68;
  const anchoBarra = apilado ? anchoGrupo : anchoGrupo / series.length;

  const svg = marcoSvg(W, H);
  svg.append(s('title', {}, cfg.titulo || 'Gráfico de barras'));
  ejes(svg, { x0, x1, y0, y1 }, tk, eY, formato);
  etiquetasX(svg, etiquetas, (i) => x0 + anchoBanda * (i + 0.5), H - 8,
    Math.max(1, Math.ceil(n / 12)));

  const tt = montarTooltip(contenedor);
  const conTooltip = (nodo, titulo, filas) => {
    nodo.addEventListener('mousemove', (ev) => {
      const cr = contenedor.getBoundingClientRect();
      tt.mostrar(ev.clientX - cr.left, ev.clientY - cr.top,
        `<div class="tt-titulo">${esc(titulo)}</div>${filas}`);
    });
    nodo.addEventListener('mouseleave', () => tt.ocultar());
  };

  etiquetas.forEach((et, i) => {
    let acumulado = 0;
    const filasTt = series.map((se, si) => {
      const v = num(se.valores[i]);
      return `<div class="tt-fila"><i class="tt-marca" style="background:${se.color || color(si)}"></i>`
        + `<span>${esc(se.nombre)}</span><span class="tt-val">${formatear(v, formato)}</span></div>`;
    }).join('');

    series.forEach((se, si) => {
      const v = num(se.valores[i]) || 0;
      const c = se.color || color(si);
      let x, y, h;
      if (apilado) {
        x = x0 + anchoBanda * i + (anchoBanda - anchoGrupo) / 2;
        y = eY(acumulado + v);
        h = Math.max(0, eY(acumulado) - eY(acumulado + v));
        acumulado += v;
        /* Separador de 2px entre segmentos, del color de la superficie. */
        h = Math.max(0, h - (si < series.length - 1 ? 2 : 0));
      } else {
        x = x0 + anchoBanda * i + (anchoBanda - anchoGrupo) / 2 + anchoBarra * si;
        const base = eY(Math.max(0, tMin));
        y = Math.min(eY(v), base);
        h = Math.abs(base - eY(v));
      }
      const r = s('rect', {
        x: x + (apilado ? 0 : 1), y,
        width: Math.max(1, anchoBarra - (apilado ? 0 : 2)),
        height: Math.max(0.5, h),
        fill: c, rx: 3,
      });
      conTooltip(r, et, filasTt);
      svg.append(r);
    });
  });

  if (meta && Number.isFinite(meta.valor)) {
    const y = eY(meta.valor);
    svg.append(s('line', {
      x1: x0, x2: x1, y1: y, y2: y, stroke: NEGRO, 'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
    }));
    svg.append(s('text', {
      x: x1 + 5, y: y + 3.5, fill: NEGRO, 'font-size': 10.5, 'font-weight': 700,
    }, `Meta ${formatear(meta.valor, formato)}`));
  }

  /* Banda de captura por categoría, de alto completo: el objetivo de hover
     debe ser mayor que la marca, sobre todo en barras delgadas. Va al final
     para quedar encima, y resalta la banda activa. */
  const realce = s('rect', {
    y: y0, height: Math.max(1, y1 - y0), fill: NEGRO, opacity: 0,
    'pointer-events': 'none',
  });
  svg.append(realce);
  etiquetas.forEach((et, i) => {
    const filasTt = series.map((se, si) => {
      const v = num(se.valores[i]);
      return `<div class="tt-fila"><i class="tt-marca" style="background:${se.color || color(si)}"></i>`
        + `<span>${esc(se.nombre)}</span><span class="tt-val">${formatear(v, formato)}</span></div>`;
    }).join('');
    const banda = s('rect', {
      x: x0 + anchoBanda * i, y: y0,
      width: Math.max(1, anchoBanda), height: Math.max(1, y1 - y0),
      fill: 'transparent',
    });
    banda.addEventListener('mousemove', (ev) => {
      realce.setAttribute('x', x0 + anchoBanda * i);
      realce.setAttribute('width', Math.max(1, anchoBanda));
      realce.setAttribute('opacity', 0.045);
      const cr = contenedor.getBoundingClientRect();
      tt.mostrar(ev.clientX - cr.left, ev.clientY - cr.top,
        `<div class="tt-titulo">${esc(et)}</div>${filasTt}`);
    });
    banda.addEventListener('mouseleave', () => {
      realce.setAttribute('opacity', 0);
      tt.ocultar();
    });
    svg.append(banda);
  });
  return svg;
}

/* =====================================================================
   Barras horizontales con etiqueta directa de valor
   cfg: { items:[{etiqueta, valores:[{nombre,valor,color}]}], formato, apilado }
   ===================================================================== */
export function barrasH(contenedor, cfg) {
  const { items, formato = 'entero', apilado = true, meta = null } = cfg;
  if (!items.length) return el('p', { clase: 'nota', texto: 'Sin datos en el rango seleccionado.' });
  const W = 760;
  const filaAlto = 30;
  const m = { t: 10, r: 96, b: 24, l: 168 };
  const H = m.t + m.b + items.length * filaAlto;
  const x0 = m.l, x1 = W - m.r;

  const totales = items.map((it) => apilado
    ? it.valores.reduce((t, v) => t + (num(v.valor) || 0), 0)
    : Math.max(...it.valores.map((v) => num(v.valor) || 0)));
  const max = Math.max(...totales, meta && Number.isFinite(meta.valor) ? meta.valor : -Infinity, 1);
  const tk = ticks(0, max * 1.02, 4);
  const tMax = Math.max(...tk);
  const eX = (v) => x0 + (v / tMax) * (x1 - x0);

  const svg = marcoSvg(W, H);
  svg.append(s('title', {}, cfg.titulo || 'Comparativo por categoría'));
  for (const t of tk) {
    svg.append(s('line', {
      x1: eX(t), x2: eX(t), y1: m.t, y2: H - m.b, stroke: GRID, 'stroke-width': 1,
      'shape-rendering': 'crispEdges',
    }));
    svg.append(s('text', {
      x: eX(t), y: H - m.b + 14, 'text-anchor': 'middle', fill: INK_MUTED, 'font-size': 10.5,
    }, formatear(t, formato)));
  }
  svg.append(s('line', {
    x1: x0, x2: x0, y1: m.t, y2: H - m.b, stroke: EJE, 'stroke-width': 1,
    'shape-rendering': 'crispEdges',
  }));

  const tt = montarTooltip(contenedor);
  items.forEach((it, i) => {
    const yc = m.t + i * filaAlto + filaAlto / 2;
    svg.append(s('text', {
      x: x0 - 9, y: yc + 4, 'text-anchor': 'end', fill: '#0b0b0b', 'font-size': 11.5,
    }, it.etiqueta));

    const filasTt = it.valores.map((v) =>
      `<div class="tt-fila"><i class="tt-marca" style="background:${v.color || color(0)}"></i>`
      + `<span>${esc(v.nombre)}</span><span class="tt-val">${formatear(v.valor, formato)}</span></div>`,
    ).join('');

    let acc = 0;
    it.valores.forEach((v, vi) => {
      const val = num(v.valor) || 0;
      const xIni = apilado ? eX(acc) : x0;
      const ancho = Math.max(1, eX(val) - x0 - (apilado ? 0 : 0));
      const alto = apilado ? 15 : Math.max(4, 15 / it.valores.length - 2);
      const y = apilado ? yc - 7.5 : yc - 7.5 + vi * (alto + 2);
      const r = s('rect', {
        x: xIni, y, width: apilado ? Math.max(1, eX(acc + val) - eX(acc) - 2) : ancho,
        height: alto, fill: v.color || color(vi), rx: 3,
      });
      r.addEventListener('mousemove', (ev) => {
        const cr = contenedor.getBoundingClientRect();
        tt.mostrar(ev.clientX - cr.left, ev.clientY - cr.top,
          `<div class="tt-titulo">${esc(it.etiqueta)}</div>${filasTt}`);
      });
      r.addEventListener('mouseleave', () => tt.ocultar());
      svg.append(r);
      acc += val;
    });

    svg.append(s('text', {
      x: eX(apilado ? acc : Math.max(...it.valores.map((v) => num(v.valor) || 0))) + 7,
      y: yc + 4, fill: '#0b0b0b', 'font-size': 11, 'font-weight': 700,
    }, formatear(apilado ? acc : Math.max(...it.valores.map((v) => num(v.valor) || 0)), formato)));
  });

  if (meta && Number.isFinite(meta.valor)) {
    svg.append(s('line', {
      x1: eX(meta.valor), x2: eX(meta.valor), y1: m.t, y2: H - m.b,
      stroke: NEGRO, 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
    }));
  }
  return svg;
}

/* Sparkline compacta para las tarjetas de KPI. */
export function sparkline(valores, tinte = '#4a4a48') {
  const v = valores.filter(Number.isFinite);
  if (v.length < 2) return el('div', { clase: 'kpi-sparkline' });
  const W = 200, H = 26;
  let min = Math.min(...v), max = Math.max(...v);
  if (min === max) { min -= 1; max += 1; }
  const svg = marcoSvg(W, H);
  svg.setAttribute('aria-hidden', 'true');
  const n = valores.length;
  let d = '', abierto = false;
  valores.forEach((val, i) => {
    if (!Number.isFinite(val)) { abierto = false; return; }
    const x = (i / (n - 1)) * W;
    const y = H - 3 - ((val - min) / (max - min)) * (H - 6);
    d += `${abierto ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    abierto = true;
  });
  svg.append(s('path', {
    d, fill: 'none', stroke: tinte, 'stroke-width': 1.75,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.75,
  }));
  const cont = el('div', { clase: 'kpi-sparkline' });
  cont.append(svg);
  return cont;
}

/* Leyenda: presente siempre que haya 2+ series (identidad nunca solo por color). */
export function leyenda(series, tipo = 'linea') {
  if (series.length < 2) return null;
  const l = el('div', { clase: 'leyenda' });
  series.forEach((se, i) => {
    l.append(el('span', {}, [
      el('i', {
        clase: `marca ${tipo === 'linea' ? 'linea' : ''}`,
        estilo: `background:${se.color || color(i)}`,
      }),
      se.nombre,
    ]));
  });
  return l;
}
