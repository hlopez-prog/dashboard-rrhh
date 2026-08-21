/*
 * Dashboard de RRHH — Minera Rio Tinto
 * Orquestador de la interfaz: filtros, paneles, tarjetas y gráficos.
 */
import { cargarDatos, construirFiltro } from './datos.js';
import {
  serie, seriePorUnidad, CATALOGO, ultimoValor, variaciones,
} from './kpi.js';
import * as g from './graficos.js';
import { construirMatriz, bloqueDecisiones } from './matriz.js';
import {
  fmt, el, estadoVsMeta, ICONO, TEXTO_ESTADO,
} from './util.js';

const estado = {
  almacen: null,
  panel: 'resumen',
  unidades: new Set(),
  tiposArea: new Set(),
  meses: 24,
};

const PANELES = [
  ['resumen', 'Resumen ejecutivo'],
  ['plantilla', 'Plantilla, rotación y ausentismo'],
  ['costo', 'Nómina y costo laboral'],
  ['desarrollo', 'Capacitación y relaciones laborales'],
  ['datos', 'Base de datos'],
];

/* ------------------------------------------------------------------ */
/* Componentes                                                         */
/* ------------------------------------------------------------------ */

function tarjeta(def, s, almacen) {
  const m = def.meta ? almacen.metaPorKpi.get(def.meta) : null;
  const { valor, mom } = variaciones(s, def.id);
  const est = m ? estadoVsMeta(valor, m.meta, m.direccion) : 'neutro';

  const nodo = el('div', {
    clase: `kpi ${est === 'ok' ? 'en-meta' : est === 'alerta' ? 'fuera-meta' : ''}`,
  });
  nodo.append(el('div', { clase: 'kpi-nombre', texto: def.nombre }));

  const val = el('div', { clase: 'kpi-valor', texto: g.formatear(valor, def.formato) });
  if (def.unidad && def.formato !== 'pct') {
    val.append(el('span', { clase: 'unidad', texto: def.unidad }));
  }
  nodo.append(val);

  const pie = el('div', { clase: 'kpi-pie' });
  /* Estado siempre con icono + etiqueta: el color nunca informa solo. */
  pie.append(el('span', {
    clase: `etiqueta-estado ${est}`,
    texto: `${ICONO[est]} ${m ? `${TEXTO_ESTADO[est]} · meta ${g.formatear(m.meta, def.formato)}` : TEXTO_ESTADO[est]}`,
  }));
  if (Number.isFinite(mom)) {
    pie.append(el('span', {
      texto: `${fmt.delta(mom, def.formato === 'entero' ? 0 : 1)} vs mes ant.`,
      title: 'Variación contra el mes anterior',
    }));
  }
  nodo.append(pie);
  nodo.append(g.sparkline(s.map((x) => x[def.id])));
  return nodo;
}

function rejillaKpis(defs, s, almacen) {
  const r = el('div', { clase: 'rejilla' });
  for (const d of defs) r.append(tarjeta(d, s, almacen));
  return r;
}

/** Marco de gráfico: título, nota, leyenda, SVG y alternancia a tabla. */
function marco({ titulo, nota, dibujar, series, tipoLeyenda = 'linea', tabla, clase = '' }) {
  const caja = el('div', { clase: `grafico ${clase}`.trim() });
  const enc = el('div', { clase: 'grafico-encabezado' });
  enc.append(el('h3', { texto: titulo }));
  const cuerpo = el('div');
  let mostrandoTabla = false;

  const btn = el('button', {
    clase: 'ver-tabla', type: 'button', 'aria-expanded': 'false',
    texto: 'Ver tabla',
  });
  if (tabla) enc.append(btn);
  caja.append(enc);
  if (nota) caja.append(el('p', { clase: 'nota', texto: nota }));
  caja.append(cuerpo);

  const pintar = () => {
    cuerpo.replaceChildren();
    if (mostrandoTabla && tabla) {
      cuerpo.append(el('div', { clase: 'tabla-envoltura' }, [tabla()]));
    } else {
      cuerpo.append(dibujar(caja));
      if (series && series.length > 1) {
        const l = g.leyenda(series, tipoLeyenda);
        if (l) cuerpo.append(l);
      }
    }
  };

  btn.addEventListener('click', () => {
    mostrandoTabla = !mostrandoTabla;
    btn.textContent = mostrandoTabla ? 'Ver gráfico' : 'Ver tabla';
    btn.setAttribute('aria-expanded', String(mostrandoTabla));
    pintar();
  });
  pintar();
  return caja;
}

/** Tabla genérica: filas = periodos, columnas = series. */
function tablaSeries(etiquetas, series, formato) {
  const t = el('table', { clase: 'datos' });
  const thead = el('thead');
  const trh = el('tr');
  trh.append(el('th', { scope: 'col', texto: 'Periodo' }));
  for (const se of series) trh.append(el('th', { scope: 'col', texto: se.nombre }));
  thead.append(trh);
  t.append(thead);
  const tb = el('tbody');
  etiquetas.forEach((et, i) => {
    const tr = el('tr');
    tr.append(el('th', { scope: 'row', texto: et }));
    for (const se of series) {
      tr.append(el('td', { texto: g.formatear(se.valores[i], formato) }));
    }
    tb.append(tr);
  });
  t.append(tb);
  return t;
}

/** Tabla comparativa por unidad con semáforo institucional. */
function tablaPorUnidad(almacen, filtro, defs) {
  const porUnidad = seriePorUnidad(almacen, filtro);
  const t = el('table', { clase: 'datos' });
  const thead = el('thead');
  const trh = el('tr');
  trh.append(el('th', { scope: 'col', texto: 'Unidad' }));
  for (const d of defs) trh.append(el('th', { scope: 'col', texto: d.nombre }));
  thead.append(trh);
  t.append(thead);

  const tb = el('tbody');
  for (const [uid, s] of porUnidad) {
    const u = almacen.unidadPorId.get(uid);
    const tr = el('tr');
    tr.append(el('th', { scope: 'row', texto: u ? u.unidad : uid }));
    for (const d of defs) {
      const m = d.meta ? almacen.metaPorKpi.get(d.meta) : null;
      const { valor } = ultimoValor(s, d.id);
      const est = m ? estadoVsMeta(valor, m.meta, m.direccion) : 'neutro';
      tr.append(el('td', {
        clase: est === 'ok' ? 'celda-ok' : est === 'alerta' ? 'celda-alerta' : '',
        texto: `${g.formatear(valor, d.formato)}${m ? ` ${ICONO[est]}` : ''}`,
        title: m ? `${TEXTO_ESTADO[est]} · meta ${g.formatear(m.meta, d.formato)}` : '',
      }));
    }
    tb.append(tr);
  }
  /* Fila de consolidado del grupo */
  const sTot = serie(almacen, filtro);
  const trT = el('tr', { clase: 'total' });
  trT.append(el('th', { scope: 'row', texto: 'Consolidado grupo' }));
  for (const d of defs) {
    trT.append(el('td', { texto: g.formatear(ultimoValor(sTot, d.id).valor, d.formato) }));
  }
  tb.append(trT);
  t.append(tb);
  return t;
}

function seccion(titulo, subtitulo, hijos) {
  const s = el('section', { clase: 'seccion' });
  s.append(el('h2', { texto: titulo }));
  if (subtitulo) s.append(el('p', { clase: 'subtitulo', texto: subtitulo }));
  for (const h of [].concat(hijos)) if (h) s.append(h);
  return s;
}

function leyendaPaleta() {
  return el('div', { clase: 'leyenda-paleta' }, [
    el('span', {}, [el('i', { estilo: 'background:#D9EAD3' }), 'Objetivo / en meta']),
    el('span', {}, [el('i', { estilo: 'background:#FCE5CD' }), 'Dependencia crítica / riesgo']),
    el('span', {}, [el('i', { estilo: 'background:#F2F2F2' }), 'Relaciones y riesgos laborales']),
    el('span', {}, [el('i', { estilo: 'background:#000000' }), 'Encabezado de tabla']),
    el('span', { texto: '● En meta   ▲ Fuera de meta   – Sin meta definida' }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Series auxiliares                                                   */
/* ------------------------------------------------------------------ */

function seriesUnidad(almacen, filtro, id) {
  const porUnidad = seriePorUnidad(almacen, filtro);
  const orden = almacen.unidades
    .map((u) => u.unidad_id)
    .filter((id2) => porUnidad.has(id2));
  /* El color sigue al índice de la unidad en dim_unidad: filtrar no repinta. */
  return orden.map((uid) => {
    const idx = almacen.unidades.findIndex((u) => u.unidad_id === uid);
    const u = almacen.unidadPorId.get(uid);
    return {
      nombre: u ? u.unidad : uid,
      abrev: (u ? u.unidad : uid).replace(/^(Mina|Unidad|Planta Concentradora)\s+/, ''),
      color: g.color(idx),
      valores: porUnidad.get(uid).map((x) => x[id]),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Paneles                                                             */
/* ------------------------------------------------------------------ */

function panelResumen(almacen, filtro) {
  const s = serie(almacen, filtro);
  const etiquetas = s.map((x) => fmt.periodo(x.periodo));
  const { tabla, decisiones } = construirMatriz(almacen, filtro);
  const frag = document.createDocumentFragment();

  const destacados = [
    CATALOGO.plantilla[0], CATALOGO.plantilla[4], CATALOGO.plantilla[8],
    CATALOGO.costo[0], CATALOGO.costo[1], CATALOGO.costo[2],
    CATALOGO.desarrollo[1], CATALOGO.desarrollo[5],
  ];

  frag.append(seccion('Indicadores del mes',
    `Cierre de ${fmt.periodoLargo(s.at(-1)?.periodo)}. Variación contra el mes anterior.`,
    [rejillaKpis(destacados, s, almacen), leyendaPaleta()]));

  frag.append(seccion('Matriz ejecutiva',
    'Lectura de comité: objetivo, dependencia y riesgo por frente de trabajo.',
    [el('div', { clase: 'tabla-envoltura' }, [tabla]),
      el('div', { clase: 'tabla-envoltura', estilo: 'margin-top:12px' }, [bloqueDecisiones(decisiones)])]));

  const serRot = seriesUnidad(almacen, filtro, 'rotacionAnualizada');
  frag.append(seccion('Tendencia y tablero por unidad', null, [
    el('div', { clase: 'rejilla-2' }, [
      marco({
        titulo: 'Rotación anualizada por unidad',
        nota: 'Suma de bajas de los últimos 12 meses sobre plantilla propia promedio. Los primeros 11 meses no producen valor.',
        series: serRot,
        dibujar: (c) => g.lineas(c, {
          series: serRot, etiquetas, formato: 'pct',
          meta: { valor: almacen.metaPorKpi.get('rotacion_anualizada')?.meta },
          titulo: 'Rotación anualizada por unidad',
        }),
        tabla: () => tablaSeries(etiquetas, serRot, 'pct'),
      }),
      marco({
        titulo: 'Ausentismo por unidad',
        nota: 'Horas de ausencia sobre horas programadas.',
        series: seriesUnidad(almacen, filtro, 'ausentismo'),
        dibujar: (c) => g.lineas(c, {
          series: seriesUnidad(almacen, filtro, 'ausentismo'), etiquetas, formato: 'pct',
          meta: { valor: almacen.metaPorKpi.get('ausentismo')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, seriesUnidad(almacen, filtro, 'ausentismo'), 'pct'),
      }),
    ]),
    el('div', { clase: 'tabla-envoltura', estilo: 'margin-top:12px' }, [
      tablaPorUnidad(almacen, filtro, [
        CATALOGO.plantilla[4], CATALOGO.plantilla[8], CATALOGO.plantilla[7],
        CATALOGO.costo[2], CATALOGO.costo[1], CATALOGO.desarrollo[1], CATALOGO.desarrollo[5],
      ]),
    ]),
  ]));
  return frag;
}

function panelPlantilla(almacen, filtro) {
  const s = serie(almacen, filtro);
  const etiquetas = s.map((x) => fmt.periodo(x.periodo));
  const frag = document.createDocumentFragment();

  frag.append(seccion('Plantilla, rotación y ausentismo',
    `Cierre de ${fmt.periodoLargo(s.at(-1)?.periodo)}.`,
    [rejillaKpis(CATALOGO.plantilla, s, almacen)]));

  const bajas = [
    { nombre: 'Bajas voluntarias', color: g.PALETA[0], valores: s.map((x) => x.bajasVoluntarias) },
    { nombre: 'Bajas involuntarias', color: g.PALETA[1], valores: s.map((x) => x.bajasInvoluntarias) },
    { nombre: 'Altas', color: g.PALETA[2], valores: s.map((x) => x.altas) },
  ];
  const serRotVol = seriesUnidad(almacen, filtro, 'rotacionVoluntaria');

  /* Fuerza laboral por área: propio vs contratista */
  const ultimo = filtro.periodos.at(-1);
  const porArea = new Map();
  for (const r of almacen.plantilla) {
    if (r.periodo !== ultimo || !filtro.unidades.has(r.unidad_id) || !filtro.areas.has(r.area_id)) continue;
    const a = almacen.areaPorId.get(r.area_id);
    const clave = a ? a.area : r.area_id;
    if (!porArea.has(clave)) porArea.set(clave, { propio: 0, cont: 0 });
    porArea.get(clave)[r.tipo_relacion === 'Propio' ? 'propio' : 'cont'] += r.headcount;
  }
  const itemsArea = [...porArea.entries()]
    .sort((a, b) => (b[1].propio + b[1].cont) - (a[1].propio + a[1].cont))
    .map(([etiqueta, v]) => ({
      etiqueta,
      valores: [
        { nombre: 'Plantilla propia', valor: v.propio, color: g.PALETA[0] },
        { nombre: 'Contratistas', valor: v.cont, color: g.PALETA[1] },
      ],
    }));

  frag.append(seccion('Movimiento de personal', null, [
    el('div', { clase: 'rejilla-2' }, [
      marco({
        titulo: 'Altas y bajas por mes',
        nota: 'Plantilla propia. Las bajas se separan por naturaleza porque la palanca de gestión es distinta.',
        series: bajas, tipoLeyenda: 'barra',
        dibujar: (c) => g.barras(c, { series: bajas, etiquetas, formato: 'entero' }),
        tabla: () => tablaSeries(etiquetas, bajas, 'entero'),
      }),
      marco({
        titulo: 'Rotación voluntaria anualizada por unidad',
        nota: 'La rotación voluntaria es la que responde a compensación, liderazgo y condiciones de turno.',
        series: serRotVol,
        dibujar: (c) => g.lineas(c, {
          series: serRotVol, etiquetas, formato: 'pct',
          meta: { valor: almacen.metaPorKpi.get('rotacion_voluntaria')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, serRotVol, 'pct'),
      }),
    ]),
  ]));

  frag.append(seccion('Composición de la fuerza laboral',
    `Distribución al cierre de ${fmt.periodoLargo(ultimo)}.`, [
      marco({
        titulo: 'Fuerza laboral por área: plantilla propia vs contratistas',
        nota: 'La dependencia de contratistas es un riesgo de continuidad operacional y de responsabilidad solidaria.',
        series: [
          { nombre: 'Plantilla propia', color: g.PALETA[0] },
          { nombre: 'Contratistas', color: g.PALETA[1] },
        ],
        tipoLeyenda: 'barra',
        dibujar: (c) => g.barrasH(c, { items: itemsArea, formato: 'entero', apilado: true }),
        tabla: () => {
          const t = el('table', { clase: 'datos' });
          t.append(el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', texto: 'Área' }),
            el('th', { scope: 'col', texto: 'Propio' }),
            el('th', { scope: 'col', texto: 'Contratistas' }),
            el('th', { scope: 'col', texto: 'Total' }),
          ])]));
          const tb = el('tbody');
          for (const it of itemsArea) {
            const p = it.valores[0].valor, c2 = it.valores[1].valor;
            tb.append(el('tr', {}, [
              el('th', { scope: 'row', texto: it.etiqueta }),
              el('td', { texto: fmt.entero(p) }),
              el('td', { texto: fmt.entero(c2) }),
              el('td', { texto: fmt.entero(p + c2) }),
            ]));
          }
          t.append(tb);
          return t;
        },
      }),
      el('div', { clase: 'tabla-envoltura', estilo: 'margin-top:12px' }, [
        tablaPorUnidad(almacen, filtro, CATALOGO.plantilla.slice(2, 10)),
      ]),
    ]));
  return frag;
}

function panelCosto(almacen, filtro) {
  const s = serie(almacen, filtro);
  const etiquetas = s.map((x) => fmt.periodo(x.periodo));
  const frag = document.createDocumentFragment();

  frag.append(seccion('Nómina, costo laboral y productividad',
    `Cierre de ${fmt.periodoLargo(s.at(-1)?.periodo)}. Montos en MXN nominales.`,
    [rejillaKpis(CATALOGO.costo, s, almacen)]));

  const presup = [
    { nombre: 'Costo laboral real', color: g.PALETA[0], valores: s.map((x) => x.costoLaboral) },
    { nombre: 'Presupuesto', color: g.PALETA[3], valores: s.map((x) => x.presupuesto) },
  ];
  const serHe = seriesUnidad(almacen, filtro, 'pctHorasExtra');
  const serCpt = seriesUnidad(almacen, filtro, 'costoPorTonelada');

  const ultimo = filtro.periodos.at(-1);
  const itemsUnidad = [];
  for (const u of almacen.unidades) {
    if (!filtro.unidades.has(u.unidad_id)) continue;
    let ord = 0, he = 0, pr = 0;
    for (const r of almacen.nomina) {
      if (r.periodo !== ultimo || r.unidad_id !== u.unidad_id || !filtro.areas.has(r.area_id)) continue;
      ord += r.costo_ordinario; he += r.costo_horas_extra; pr += r.costo_prestaciones;
    }
    if (ord + he + pr === 0) continue;
    itemsUnidad.push({
      etiqueta: u.unidad,
      valores: [
        { nombre: 'Ordinario', valor: ord, color: g.PALETA[0] },
        { nombre: 'Horas extra', valor: he, color: g.PALETA[1] },
        { nombre: 'Prestaciones', valor: pr, color: g.PALETA[2] },
      ],
    });
  }

  frag.append(seccion('Control presupuestal y sobrecosto', null, [
    el('div', { clase: 'rejilla-2' }, [
      marco({
        titulo: 'Costo laboral real vs presupuesto',
        nota: 'Costo laboral = ordinario + horas extra + prestaciones.',
        series: presup, tipoLeyenda: 'barra',
        dibujar: (c) => g.barras(c, { series: presup, etiquetas, formato: 'mxnCorto' }),
        tabla: () => tablaSeries(etiquetas, presup, 'mxn'),
      }),
      marco({
        titulo: 'Horas extra sobre horas ordinarias',
        nota: 'Arriba de meta es señal de plantilla incompleta o ausentismo, y riesgo de fatiga.',
        series: serHe,
        dibujar: (c) => g.lineas(c, {
          series: serHe, etiquetas, formato: 'pct',
          meta: { valor: almacen.metaPorKpi.get('pct_horas_extra')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, serHe, 'pct'),
      }),
      marco({
        titulo: 'Costo laboral por tonelada movida',
        nota: 'Solo áreas con producción asociada (mina y planta).',
        series: serCpt,
        dibujar: (c) => g.lineas(c, {
          series: serCpt, etiquetas, formato: 'mxn2',
          meta: { valor: almacen.metaPorKpi.get('costo_por_tonelada')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, serCpt, 'mxn2'),
      }),
      marco({
        titulo: 'Composición del costo laboral por unidad',
        clase: 'ancho-total',
        nota: `Cierre de ${fmt.periodoLargo(ultimo)}.`,
        series: [
          { nombre: 'Ordinario', color: g.PALETA[0] },
          { nombre: 'Horas extra', color: g.PALETA[1] },
          { nombre: 'Prestaciones', color: g.PALETA[2] },
        ],
        tipoLeyenda: 'barra',
        dibujar: (c) => g.barrasH(c, { items: itemsUnidad, formato: 'mxnCorto', apilado: true }),
        tabla: () => {
          const t = el('table', { clase: 'datos' });
          t.append(el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', texto: 'Unidad' }),
            el('th', { scope: 'col', texto: 'Ordinario' }),
            el('th', { scope: 'col', texto: 'Horas extra' }),
            el('th', { scope: 'col', texto: 'Prestaciones' }),
            el('th', { scope: 'col', texto: 'Total' }),
          ])]));
          const tb = el('tbody');
          for (const it of itemsUnidad) {
            const [a, b, c2] = it.valores.map((v) => v.valor);
            tb.append(el('tr', {}, [
              el('th', { scope: 'row', texto: it.etiqueta }),
              el('td', { texto: fmt.mxn(a) }),
              el('td', { texto: fmt.mxn(b) }),
              el('td', { texto: fmt.mxn(c2) }),
              el('td', { texto: fmt.mxn(a + b + c2) }),
            ]));
          }
          t.append(tb);
          return t;
        },
      }),
    ]),
    el('div', { clase: 'tabla-envoltura', estilo: 'margin-top:12px' }, [
      tablaPorUnidad(almacen, filtro, CATALOGO.costo.slice(0, 6)),
    ]),
  ]));
  return frag;
}

function panelDesarrollo(almacen, filtro) {
  const s = serie(almacen, filtro);
  const etiquetas = s.map((x) => fmt.periodo(x.periodo));
  const frag = document.createDocumentFragment();

  frag.append(seccion('Capacitación, competencias y relaciones laborales',
    `Cierre de ${fmt.periodoLargo(s.at(-1)?.periodo)}.`,
    [rejillaKpis(CATALOGO.desarrollo, s, almacen)]));

  const serDc3 = seriesUnidad(almacen, filtro, 'cumplimientoDc3');
  const serEnps = seriesUnidad(almacen, filtro, 'enps');
  const planCap = [
    { nombre: 'Horas plan', color: g.PALETA[3], valores: s.map((x) => x.crudo.hPlan) },
    { nombre: 'Horas ejecutadas', color: g.PALETA[0], valores: s.map((x) => x.crudo.hReal) },
  ];

  frag.append(seccion('Ejecución del plan y cumplimiento normativo', null, [
    el('div', { clase: 'rejilla-2' }, [
      marco({
        titulo: 'Horas hombre de capacitación: plan vs ejecutado',
        nota: 'La brecha acumulada no se recupera sin ventanas de turno protegidas.',
        series: planCap, tipoLeyenda: 'barra',
        dibujar: (c) => g.barras(c, { series: planCap, etiquetas, formato: 'numCorto' }),
        tabla: () => tablaSeries(etiquetas, planCap, 'dec'),
      }),
      marco({
        titulo: 'Cumplimiento DC-3 por unidad',
        nota: 'Constancias de competencias emitidas sobre requeridas. Es exposición legal directa.',
        series: serDc3,
        dibujar: (c) => g.lineas(c, {
          series: serDc3, etiquetas, formato: 'pct',
          meta: { valor: almacen.metaPorKpi.get('cumplimiento_dc3')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, serDc3, 'pct'),
      }),
      marco({
        titulo: 'eNPS por unidad',
        nota: 'Indicador de clima. Lecturas por debajo de meta anticipan rotación voluntaria y tensión sindical.',
        series: serEnps,
        dibujar: (c) => g.lineas(c, {
          series: serEnps, etiquetas, formato: 'dec',
          meta: { valor: almacen.metaPorKpi.get('enps')?.meta },
        }),
        tabla: () => tablaSeries(etiquetas, serEnps, 'dec'),
      }),
      tablaRelacionesLaborales(almacen, filtro),
    ]),
    el('div', { clase: 'tabla-envoltura', estilo: 'margin-top:12px' }, [
      tablaPorUnidad(almacen, filtro, CATALOGO.desarrollo.slice(0, 6)),
    ]),
  ]));
  return frag;
}

function tablaRelacionesLaborales(almacen, filtro) {
  const ultimo = filtro.periodos.at(-1);
  /* Siete columnas no caben en media rejilla: ocupa la fila completa. */
  const caja = el('div', { clase: 'grafico ancho-total' });
  caja.append(el('div', { clase: 'grafico-encabezado' }, [
    el('h3', { texto: 'Tablero de relaciones laborales' }),
  ]));
  caja.append(el('p', {
    clase: 'nota',
    texto: 'Riesgo sindical en escala 1–5. Las celdas grises corresponden a la lectura de relaciones laborales.',
  }));
  const t = el('table', { clase: 'datos' });
  t.append(el('thead', {}, [el('tr', {}, [
    el('th', { scope: 'col', texto: 'Unidad' }),
    el('th', { scope: 'col', texto: 'Sindicalizados' }),
    el('th', { scope: 'col', texto: 'Emplazamientos' }),
    el('th', { scope: 'col', texto: 'Conflictos abiertos' }),
    el('th', { scope: 'col', texto: 'Días a revisión' }),
    el('th', { scope: 'col', texto: 'Riesgo sindical' }),
    el('th', { scope: 'col', texto: 'eNPS' }),
  ])]));
  const tb = el('tbody');
  for (const r of almacen.relaciones) {
    if (r.periodo !== ultimo || !filtro.unidades.has(r.unidad_id)) continue;
    const u = almacen.unidadPorId.get(r.unidad_id);
    const alto = r.riesgo_sindical >= 3;
    tb.append(el('tr', {}, [
      el('th', { scope: 'row', texto: u ? u.unidad : r.unidad_id, title: r.sindicato }),
      el('td', { clase: 'celda-neutra', texto: fmt.entero(r.trabajadores_sindicalizados) }),
      el('td', { clase: r.emplazamientos > 0 ? 'celda-alerta' : 'celda-neutra', texto: fmt.entero(r.emplazamientos) }),
      el('td', { clase: r.conflictos_abiertos > 3 ? 'celda-alerta' : 'celda-neutra', texto: fmt.entero(r.conflictos_abiertos) }),
      el('td', {
        clase: r.dias_a_revision_cct > 0 && r.dias_a_revision_cct < 120 ? 'celda-alerta' : 'celda-neutra',
        texto: r.dias_a_revision_cct > 0 ? fmt.entero(r.dias_a_revision_cct) : 'N/A',
      }),
      el('td', {
        clase: alto ? 'celda-alerta' : 'celda-ok',
        texto: `${alto ? ICONO.alerta : ICONO.ok} ${r.riesgo_sindical}/5`,
      }),
      el('td', { clase: r.enps >= 30 ? 'celda-ok' : 'celda-alerta', texto: fmt.dec(r.enps, 0) }),
    ]));
  }
  t.append(tb);
  caja.append(el('div', { clase: 'tabla-envoltura' }, [t]));
  return caja;
}

function panelDatos(almacen) {
  const m = almacen.meta;
  const frag = document.createDocumentFragment();
  const filas = Object.entries(m.conteo_filas);

  const t = el('table', { clase: 'datos' });
  t.append(el('thead', {}, [el('tr', {}, [
    el('th', { scope: 'col', texto: 'Tabla' }),
    el('th', { scope: 'col', texto: 'Registros' }),
    el('th', { scope: 'col', texto: 'Hoja del libro' }),
  ])]));
  const tb = el('tbody');
  const hoja = {
    unidad: 'dim_unidad', area: 'dim_area', plantilla: 'fact_plantilla',
    movimientos: 'fact_movimientos', ausentismo: 'fact_ausentismo',
    nomina: 'fact_nomina', capacitacion: 'fact_capacitacion',
    relaciones: 'fact_relaciones_laborales', metas: 'metas',
  };
  for (const [k, v] of filas) {
    tb.append(el('tr', {}, [
      el('th', { scope: 'row', texto: k }),
      el('td', { texto: fmt.entero(v) }),
      el('td', { texto: hoja[k] || k }),
    ]));
  }
  t.append(tb);

  frag.append(seccion('Origen y actualización de los datos',
    'La base de datos es el libro de Excel data/BASE_RRHH.xlsx del repositorio: '
    + 'una hoja por tabla. GitHub Actions lo valida y construye el JSON que lee '
    + 'este tablero. Para actualizar, se sube el libro con el cierre del mes.',
    [el('div', { clase: 'tabla-envoltura' }, [t])]));

  const proc = el('div', { clase: 'grafico' });
  proc.append(el('h3', { texto: 'Cómo se actualiza' }));
  proc.append(el('ol', {
    html: '<li>RRHH captura el cierre del mes en <code>data/BASE_RRHH.xlsx</code>, '
      + 'agregando filas con el periodo nuevo en cada hoja.</li>'
      + '<li>Sube el libro al repositorio desde la web de GitHub, reemplazando el anterior.</li>'
      + '<li>GitHub Actions lee el libro y valida encabezados, tipos, llaves, '
      + 'integridad referencial y reglas de negocio.</li>'
      + '<li>Si la validación pasa, exporta los CSV para dejar el cambio auditable, '
      + 'reconstruye <code>dashboard.json</code> y publica en GitHub Pages.</li>'
      + '<li>Si falla, el despliegue se detiene, el error indica la hoja y la fila, '
      + 'y el tablero conserva los datos del cierre anterior.</li>',
  }));
  frag.append(seccion('Proceso de actualización', null, [proc]));

  const meta = el('div', { clase: 'grafico' });
  meta.append(el('h3', { texto: 'Trazabilidad de esta publicación' }));
  meta.append(el('p', {
    clase: 'nota',
    texto: `Generado ${m.generado_utc} UTC · commit ${m.commit} · `
      + `periodos ${m.periodo_inicial} a ${m.periodo_final} · `
      + `origen: ${m.es_demo ? 'DATOS DEMO SINTÉTICOS' : 'datos de operación'}`
      + (m.fuente ? ` · fuente: ${m.fuente}` : ''),
  }));
  frag.append(seccion('Trazabilidad', null, [meta]));
  return frag;
}

/* ------------------------------------------------------------------ */
/* Filtros y render                                                    */
/* ------------------------------------------------------------------ */

function construirFiltros(almacen) {
  const cont = document.getElementById('filtros');
  cont.replaceChildren();

  const campoMeses = el('div', { clase: 'campo' });
  campoMeses.append(el('label', { for: 'sel-meses', texto: 'Periodo' }));
  const sel = el('select', { id: 'sel-meses' });
  for (const [v, t] of [[6, 'Últimos 6 meses'], [12, 'Últimos 12 meses'],
    [24, 'Últimos 24 meses']]) {
    sel.append(el('option', { value: v, texto: t, selected: estado.meses === v }));
  }
  sel.addEventListener('change', () => { estado.meses = Number(sel.value); render(); });
  campoMeses.append(sel);

  const campoUni = el('div', { clase: 'campo' });
  campoUni.append(el('label', { texto: 'Unidad' }));
  const chipsUni = el('div', { clase: 'chips' });
  almacen.unidades.forEach((u, i) => {
    const activo = estado.unidades.size === 0 || estado.unidades.has(u.unidad_id);
    const b = el('button', {
      clase: 'chip', type: 'button', 'aria-pressed': String(activo),
      title: `${u.estado} · ${u.tipo_operacion} · ${u.mineral_principal}`,
    }, [
      el('i', { clase: 'punto', estilo: `background:${g.color(i)}` }),
      u.unidad,
    ]);
    b.addEventListener('click', () => {
      if (estado.unidades.size === 0) {
        estado.unidades = new Set(almacen.unidades.map((x) => x.unidad_id));
      }
      if (estado.unidades.has(u.unidad_id)) estado.unidades.delete(u.unidad_id);
      else estado.unidades.add(u.unidad_id);
      if (estado.unidades.size === 0) estado.unidades = new Set();
      render();
    });
    chipsUni.append(b);
  });
  campoUni.append(chipsUni);

  const tipos = [...new Set(almacen.areas.map((a) => a.tipo_area))];
  const campoArea = el('div', { clase: 'campo' });
  campoArea.append(el('label', { texto: 'Tipo de área' }));
  const chipsArea = el('div', { clase: 'chips' });
  for (const t of tipos) {
    const activo = estado.tiposArea.size === 0 || estado.tiposArea.has(t);
    const b = el('button', { clase: 'chip', type: 'button', 'aria-pressed': String(activo), texto: t });
    b.addEventListener('click', () => {
      if (estado.tiposArea.size === 0) estado.tiposArea = new Set(tipos);
      if (estado.tiposArea.has(t)) estado.tiposArea.delete(t);
      else estado.tiposArea.add(t);
      render();
    });
    chipsArea.append(b);
  }
  campoArea.append(chipsArea);

  const acciones = el('div', { clase: 'filtros-acciones' });
  acciones.append(el('button', {
    clase: 'boton', type: 'button', texto: 'Limpiar filtros',
    onclick: () => { estado.unidades = new Set(); estado.tiposArea = new Set(); estado.meses = 24; render(); },
  }));
  acciones.append(el('button', {
    clase: 'boton boton-primario', type: 'button', texto: 'Imprimir / PDF',
    onclick: () => window.print(),
  }));

  cont.append(el('div', { clase: 'filtros-inner' }, [campoMeses, campoUni, campoArea, acciones]));
}

function construirNav() {
  const nav = document.getElementById('nav');
  const inner = el('div', { clase: 'nav-inner', role: 'tablist' });
  for (const [id, nombre] of PANELES) {
    const b = el('button', {
      type: 'button', role: 'tab', id: `tab-${id}`,
      'aria-selected': String(estado.panel === id), 'aria-controls': 'panel',
      texto: nombre,
    });
    b.addEventListener('click', () => {
      estado.panel = id;
      for (const otro of inner.children) {
        otro.setAttribute('aria-selected', String(otro === b));
      }
      render(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    inner.append(b);
  }
  nav.replaceChildren(inner);
}

function render(reconstruirFiltros = true) {
  const { almacen } = estado;
  if (reconstruirFiltros) construirFiltros(almacen);

  const filtro = construirFiltro(almacen, {
    unidades: estado.unidades.size ? estado.unidades : null,
    tiposArea: estado.tiposArea.size ? estado.tiposArea : null,
    meses: estado.meses,
  });

  const panel = document.getElementById('panel');
  panel.replaceChildren();
  panel.setAttribute('aria-labelledby', `tab-${estado.panel}`);

  const sinUnidad = filtro.unidades.size === 0;
  if (sinUnidad) {
    panel.append(el('p', { clase: 'error-carga', texto: 'Selecciona al menos una unidad.' }));
    return;
  }

  try {
    if (estado.panel === 'resumen') panel.append(panelResumen(almacen, filtro));
    else if (estado.panel === 'plantilla') panel.append(panelPlantilla(almacen, filtro));
    else if (estado.panel === 'costo') panel.append(panelCosto(almacen, filtro));
    else if (estado.panel === 'desarrollo') panel.append(panelDesarrollo(almacen, filtro));
    else panel.append(panelDatos(almacen));
  } catch (e) {
    panel.append(el('div', { clase: 'error-carga' }, [
      el('strong', { texto: 'Error al construir el panel.' }),
      el('code', { texto: String(e && e.stack || e) }),
    ]));
    throw e;
  }
  document.body.dataset.listo = 'true';
}

function pintarBanner(almacen) {
  const m = almacen.meta;
  document.getElementById('org').textContent = m.organizacion;
  document.getElementById('banner-meta').innerHTML =
    `Cierre <strong>${fmt.periodoLargo(m.periodo_final)}</strong><br>`
    + `${m.periodos.length} meses de historia · publicado ${m.generado_utc.slice(0, 10)}<br>`
    + `commit <strong>${m.commit}</strong>`;
  if (m.es_demo) {
    document.getElementById('aviso').hidden = false;
  }
}

async function iniciar() {
  const panel = document.getElementById('panel');
  try {
    estado.almacen = await cargarDatos();
  } catch (e) {
    panel.replaceChildren(el('div', { clase: 'error-carga' }, [
      el('strong', { texto: 'No se pudo cargar la base de datos del dashboard.' }),
      el('p', {
        texto: 'Genera el archivo de datos y sirve la carpeta public/ por HTTP '
          + '(los módulos ES no cargan desde file://):',
      }),
      el('code', { texto: 'python3 etl/build.py\npython3 -m http.server 8000 --directory public' }),
      el('code', { texto: String(e && e.message || e) }),
    ]));
    document.body.dataset.listo = 'error';
    return;
  }
  pintarBanner(estado.almacen);
  construirNav();
  render();
}

iniciar();
