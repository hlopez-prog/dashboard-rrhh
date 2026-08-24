/*
 * Motor de KPIs del Dashboard de RRHH.
 *
 * Este archivo es la ÚNICA definición de cómo se calcula cada indicador.
 * Si un número del comité se discute, se discute aquí. Los tests de
 * tests/kpi.test.mjs verifican estas fórmulas contra casos armados a mano.
 *
 * Reglas de cálculo declaradas:
 *  - Las tasas de rotación se calculan sobre PLANTILLA PROPIA. Los
 *    contratistas no rotan en nómina propia; se reportan aparte.
 *  - "Anualizada" = suma de bajas de los últimos 12 meses sobre el
 *    headcount propio promedio de esos mismos 12 meses (no es el mes ×12).
 *  - Costo laboral = ordinario + horas extra + prestaciones.
 *  - Ausentismo = horas de ausencia / horas programadas.
 *  - Los meses incompletos al inicio de la serie no producen valor
 *    anualizado (devuelven null) en lugar de un número engañoso.
 *  - Una celda vacía en la base NO es un cero. Llega como null y significa
 *    "no se sabe". Cada razón se calcula SOLO sobre las filas donde su
 *    numerador y su denominador son ambos conocidos: por eso hay
 *    acumuladores en pareja (dotacion / hcPropioDot, mujeres /
 *    hcPropioMuj, …). Si se sumara el denominador completo contra un
 *    numerador parcial, el porcentaje saldría diluido y nadie lo notaría.
 *    Si de un indicador no se conoce ni una fila, el resultado es null y
 *    el tablero muestra "—".
 */
import { aplicar } from './datos.js';
import { div } from './util.js';

const CAMPOS_CRUDOS = [
  'hcPropio', 'hcCont', 'dotacion', 'hcPropioDot', 'mujeres', 'hcPropioMuj',
  'antigPeso', 'hcPropioAntig', 'pcTot', 'pcOk', 'hcPropioUnidad',
  'altas', 'bajasVol', 'bajasInv', 'bajasTemp', 'bajasVolTemp',
  'vacantes', 'diasCobSum', 'diasCobN',
  'hrsProg', 'hrsAus', 'casos', 'diasInc',
  'costoOrd', 'costoHE', 'costoPrest', 'hrsOrd', 'hrsHE', 'hrsOrdHE',
  'presup', 'costoPresup', 'toneladas', 'costoTon', 'horasTon',
  'hPlan', 'hReal', 'hRealPlan', 'participantes', 'dc3Req', 'dc3Emi', 'invCap',
  'compReq', 'compOk',
  'sindicalizados', 'emplazamientos', 'conflictosAb', 'conflictosCer',
  'enpsSum', 'enpsN', 'riesgoMax', 'diasCCTMin',
];

/*
 * De qué hoja sale cada acumulador. Es la pieza que permite distinguir los
 * dos silencios que no significan lo mismo:
 *
 *   La hoja del mes no se capturó   → no se sabe nada. Publicar 0 bajas
 *                                     diría "no se fue nadie", y nadie lo
 *                                     verificó.
 *   La hoja se capturó y no hay fila
 *   de esa categoría                → la categoría no ocurrió. Un área sin
 *                                     fila de contratistas no tiene
 *                                     contratistas: ahí el cero es el dato.
 *
 * Sin esta distinción hay que elegir entre inventar ceros o llenar de
 * guiones un tablero que sí tiene la información.
 */
const ORIGEN = {
  hcPropio: 'plantilla', hcCont: 'plantilla', hcPropioUnidad: 'plantilla',
  dotacion: 'plantilla', hcPropioDot: 'plantilla',
  mujeres: 'plantilla', hcPropioMuj: 'plantilla',
  antigPeso: 'plantilla', hcPropioAntig: 'plantilla',
  pcTot: 'plantilla', pcOk: 'plantilla',
  altas: 'movimientos', bajasVol: 'movimientos', bajasInv: 'movimientos',
  bajasTemp: 'movimientos', bajasVolTemp: 'movimientos',
  vacantes: 'movimientos', diasCobSum: 'movimientos',
  hrsProg: 'ausentismo', hrsAus: 'ausentismo',
  casos: 'ausentismo', diasInc: 'ausentismo',
  costoOrd: 'nomina', costoHE: 'nomina', costoPrest: 'nomina',
  hrsOrd: 'nomina', hrsHE: 'nomina', hrsOrdHE: 'nomina',
  presup: 'nomina', costoPresup: 'nomina',
  toneladas: 'nomina', costoTon: 'nomina', horasTon: 'nomina',
  hPlan: 'capacitacion', hReal: 'capacitacion', hRealPlan: 'capacitacion',
  participantes: 'capacitacion', dc3Req: 'capacitacion',
  dc3Emi: 'capacitacion', invCap: 'capacitacion',
  compReq: 'capacitacion', compOk: 'capacitacion',
  sindicalizados: 'relaciones', emplazamientos: 'relaciones',
  conflictosAb: 'relaciones', conflictosCer: 'relaciones',
  enpsSum: 'relaciones',
};

/* Acumuladores que vienen de una columna declarada opcional en
   etl/schema.py, o del par que la acompaña. Aquí, una hoja capturada con la
   columna vacía tampoco sabe: la ausencia es del dato, no de la categoría. */
const DE_COLUMNA_OPCIONAL = new Set([
  'dotacion', 'hcPropioDot', 'mujeres', 'hcPropioMuj',
  'antigPeso', 'hcPropioAntig', 'pcTot', 'pcOk',
  'bajasTemp', 'bajasVolTemp', 'vacantes', 'diasCobSum',
  'casos', 'diasInc',
  'costoOrd', 'costoHE', 'costoPrest', 'hrsOrd', 'hrsHE', 'hrsOrdHE',
  'presup', 'costoPresup', 'toneladas', 'costoTon', 'horasTon',
  'hPlan', 'hRealPlan', 'participantes', 'invCap', 'compReq', 'compOk',
  'emplazamientos', 'conflictosCer',
]);

/** True solo si el valor llegó capturado (null/undefined/NaN = no se sabe). */
export function conocido(v) {
  return v !== null && v !== undefined && Number.isFinite(v);
}

/** Trata un hueco como cero SOLO para sumar componentes de un total. */
function n0(v) { return conocido(v) ? v : 0; }

/**
 * Total de varios componentes tolerante a huecos.
 * Si no se conoce ninguno, el total es null: no hay nada que sumar.
 * Si se conoce alguno, el total es la suma de los conocidos.
 */
function total(...valores) {
  const c = valores.filter(conocido);
  return c.length ? c.reduce((a, b) => a + b, 0) : null;
}

function crudoVacio(periodo) {
  const o = { periodo, _vistos: {}, _filas: {} };
  for (const c of CAMPOS_CRUDOS) o[c] = 0;
  o.riesgoMax = null;
  o.diasCCTMin = Infinity;
  return o;
}

/**
 * Suma v en c[campo] si v es conocido y registra que hubo dato.
 * @returns {boolean} si el valor se contabilizó.
 */
function sum(c, campo, v) {
  if (!conocido(v)) return false;
  c[campo] += v;
  c._vistos[campo] = (c._vistos[campo] || 0) + 1;
  return true;
}

/* Cierra el mes: lo que no se sabe pasa de 0 a null. */
function cerrarHuecos(c) {
  for (const [campo, hoja] of Object.entries(ORIGEN)) {
    if (!c._filas[hoja]) c[campo] = null;                      // hoja sin capturar
    else if (DE_COLUMNA_OPCIONAL.has(campo) && !c._vistos[campo]) c[campo] = null;
  }
  return c;
}

/**
 * Agrega las tablas de hechos por periodo aplicando el filtro activo.
 * @returns {Array<Object>} crudos ordenados por periodo ascendente.
 */
export function crudosPorPeriodo(almacen, filtro, unidadUnica = null) {
  const f = unidadUnica
    ? { ...filtro, unidades: new Set([unidadUnica]), pasa: filtro.pasa }
    : filtro;
  const pasa = (r) => f.unidades.has(r.unidad_id)
    && (r.area_id === undefined || f.areas.has(r.area_id))
    && f.setPeriodos.has(r.periodo);

  const mapa = new Map(f.periodos.map((p) => [p, crudoVacio(p)]));
  const g = (p) => mapa.get(p);

  for (const r of almacen.plantilla) {
    if (!pasa(r)) continue;
    const c = g(r.periodo); if (!c) continue;
    c._filas.plantilla = (c._filas.plantilla || 0) + 1;
    if (r.tipo_relacion !== 'Propio') { sum(c, 'hcCont', r.headcount); continue; }

    sum(c, 'hcPropio', r.headcount);
    /* Cada razón acumula su propio denominador: solo entran las filas que
       traen el dato de arriba Y el headcount contra el que se compara. */
    if (sum(c, 'dotacion', r.dotacion_autorizada)) sum(c, 'hcPropioDot', r.headcount);
    if (sum(c, 'mujeres', r.mujeres)) sum(c, 'hcPropioMuj', r.headcount);
    if (conocido(r.antiguedad_prom_meses) && conocido(r.headcount)) {
      sum(c, 'antigPeso', r.antiguedad_prom_meses * r.headcount);
      sum(c, 'hcPropioAntig', r.headcount);
    }
    /* Puestos críticos: el par cubiertos/totales solo suma si ambos están.
       Sumar totales sin cubiertos hundiría la cobertura sin motivo. */
    if (conocido(r.puestos_criticos_totales) && conocido(r.puestos_criticos_cubiertos)) {
      sum(c, 'pcTot', r.puestos_criticos_totales);
      sum(c, 'pcOk', r.puestos_criticos_cubiertos);
    }
  }

  /* Headcount propio de la unidad SIN filtro de área: base correcta para
     tasas que se reportan a nivel unidad (sindicalización). */
  for (const r of almacen.plantilla) {
    if (r.tipo_relacion !== 'Propio') continue;
    if (!f.unidades.has(r.unidad_id) || !f.setPeriodos.has(r.periodo)) continue;
    const c = g(r.periodo); if (c) sum(c, 'hcPropioUnidad', r.headcount);
  }

  for (const r of aplicar(almacen.movimientos, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c._filas.movimientos = (c._filas.movimientos || 0) + 1;
    sum(c, 'altas', r.altas);
    sum(c, 'bajasVol', r.bajas_voluntarias);
    sum(c, 'bajasInv', r.bajas_involuntarias);
    if (sum(c, 'bajasTemp', r.bajas_menos_90_dias)) {
      sum(c, 'bajasVolTemp', r.bajas_voluntarias);
    }
    sum(c, 'vacantes', r.vacantes_abiertas);
    /* El promedio de días de cobertura se divide entre las áreas que lo
       reportaron, no entre todas las áreas. */
    if (sum(c, 'diasCobSum', r.dias_cobertura_prom)) c.diasCobN += 1;
  }

  for (const r of aplicar(almacen.ausentismo, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c._filas.ausentismo = (c._filas.ausentismo || 0) + 1;
    sum(c, 'hrsProg', r.horas_programadas);
    sum(c, 'hrsAus', r.horas_ausencia);
    sum(c, 'casos', r.casos_incapacidad);
    sum(c, 'diasInc', r.dias_incapacidad);
  }

  for (const r of aplicar(almacen.nomina, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c._filas.nomina = (c._filas.nomina || 0) + 1;
    sum(c, 'costoOrd', r.costo_ordinario);
    sum(c, 'costoHE', r.costo_horas_extra);
    sum(c, 'costoPrest', r.costo_prestaciones);
    sum(c, 'hrsOrd', r.horas_ordinarias);
    if (sum(c, 'hrsHE', r.horas_extra)) sum(c, 'hrsOrdHE', r.horas_ordinarias);

    /* Costo y horas de la fila: si NINGÚN componente se conoce, el total
       es null (no hay nada que sumar), no cero. costo_ordinario y
       horas_ordinarias pueden faltar mes a mes en nómina real sin que eso
       signifique "costo cero" — ver OPCIONALES en etl/schema.py. */
    const costoFila = total(r.costo_ordinario, r.costo_horas_extra, r.costo_prestaciones);
    const horasFila = total(r.horas_ordinarias, r.horas_extra);
    /* Real contra presupuesto: solo las áreas que tienen presupuesto. */
    if (sum(c, 'presup', r.presupuesto_costo_laboral)) {
      sum(c, 'costoPresup', costoFila);
    }
    /* Costo por tonelada y productividad: solo las áreas con producción
       declarada, con el costo y las horas de esas mismas áreas. */
    if (sum(c, 'toneladas', r.toneladas_movidas)) {
      sum(c, 'costoTon', costoFila);
      sum(c, 'horasTon', horasFila);
    }
  }

  for (const r of aplicar(almacen.capacitacion, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c._filas.capacitacion = (c._filas.capacitacion || 0) + 1;
    sum(c, 'hReal', r.horas_real);
    if (sum(c, 'hPlan', r.horas_plan)) sum(c, 'hRealPlan', r.horas_real);
    sum(c, 'participantes', r.participantes);
    sum(c, 'dc3Req', r.dc3_requeridos);
    sum(c, 'dc3Emi', r.dc3_emitidos);
    sum(c, 'invCap', r.inversion_mxn);
    if (conocido(r.competencias_criticas_req) && conocido(r.competencias_criticas_ok)) {
      sum(c, 'compReq', r.competencias_criticas_req);
      sum(c, 'compOk', r.competencias_criticas_ok);
    }
  }

  for (const r of almacen.relaciones) {
    if (!f.unidades.has(r.unidad_id) || !f.setPeriodos.has(r.periodo)) continue;
    const c = g(r.periodo); if (!c) continue;
    c._filas.relaciones = (c._filas.relaciones || 0) + 1;
    sum(c, 'sindicalizados', r.trabajadores_sindicalizados);
    sum(c, 'emplazamientos', r.emplazamientos);
    sum(c, 'conflictosAb', r.conflictos_abiertos);
    sum(c, 'conflictosCer', r.conflictos_cerrados);
    /* El eNPS promedio solo cuenta las unidades que aplicaron la encuesta. */
    if (sum(c, 'enpsSum', r.enps)) c.enpsN += 1;
    if (conocido(r.riesgo_sindical)) {
      c.riesgoMax = c.riesgoMax === null
        ? r.riesgo_sindical : Math.max(c.riesgoMax, r.riesgo_sindical);
    }
    if (conocido(r.dias_a_revision_cct) && r.dias_a_revision_cct > 0) {
      c.diasCCTMin = Math.min(c.diasCCTMin, r.dias_a_revision_cct);
    }
  }

  return f.periodos.map((p) => cerrarHuecos(mapa.get(p)));
}

/** Métricas derivadas de un mes. */
export function derivar(c) {
  const fuerza = total(c.hcPropio, c.hcCont);
  const bajas = total(c.bajasVol, c.bajasInv);
  const costoTotal = total(c.costoOrd, c.costoHE, c.costoPrest);
  const p = (x) => (conocido(x) ? x * 100 : null);
  return {
    periodo: c.periodo,
    crudo: c,
    headcountTotal: fuerza,
    headcountPropio: c.hcPropio,
    headcountContratista: c.hcCont,
    pctContratistas: p(div(c.hcCont, fuerza)),
    coberturaPlantilla: p(div(c.hcPropioDot, c.dotacion)),
    coberturaCritica: p(div(c.pcOk, c.pcTot)),
    antiguedadMeses: div(c.antigPeso, c.hcPropioAntig),
    pctMujeres: p(div(c.mujeres, c.hcPropioMuj)),
    altas: c.altas,
    bajas,
    bajasVoluntarias: c.bajasVol,
    bajasInvoluntarias: c.bajasInv,
    rotacionMensual: p(div(bajas, c.hcPropio)),
    rotacionTemprana: p(div(c.bajasTemp, c.bajasVolTemp)),
    vacantesAbiertas: c.vacantes,
    diasCobertura: div(c.diasCobSum, c.diasCobN),
    ausentismo: p(div(c.hrsAus, c.hrsProg)),
    casosIncapacidad: c.casos,
    diasIncapacidadPor100: p(div(c.diasInc, c.hcPropio)),
    costoLaboral: costoTotal,
    costoHorasExtra: c.costoHE,
    pctHorasExtra: p(div(c.hrsHE, c.hrsOrdHE)),
    presupuesto: c.presup,
    varPresupuesto: p(div(conocido(c.presup) ? c.costoPresup - c.presup : null, c.presup)),
    costoPorEmpleado: div(costoTotal, c.hcPropio),
    toneladas: c.toneladas,
    /* Sin toneladas no hay ratio de productividad: se devuelve vacío en
       lugar de 0, que se leería como "productividad nula". */
    costoPorTonelada: c.toneladas > 0 ? div(c.costoTon, c.toneladas) : null,
    productividad: c.toneladas > 0 ? div(c.toneladas, c.horasTon) : null,
    cumplimientoPlanCap: p(div(c.hRealPlan, c.hPlan)),
    cumplimientoDc3: p(div(c.dc3Emi, c.dc3Req)),
    horasCapPorPersona: div(c.hReal, c.hcPropio),
    coberturaCompetencias: p(div(c.compOk, c.compReq)),
    inversionCapPorPersona: div(c.invCap, c.hcPropio),
    inversionCap: c.invCap,
    enps: div(c.enpsSum, c.enpsN),
    riesgoSindical: c.riesgoMax,
    emplazamientos: c.emplazamientos,
    conflictosAbiertos: c.conflictosAb,
    diasARevisionCct: Number.isFinite(c.diasCCTMin) ? c.diasCCTMin : null,
    pctSindicalizacion: p(div(c.sindicalizados, c.hcPropioUnidad)),
  };
}

/**
 * Ventana móvil de 12 meses. Devuelve null si no hay 12 meses de historia,
 * para no publicar un anualizado calculado con datos incompletos.
 */
export function anualizar(crudos, i, campoBajas) {
  if (i < 11) return null;
  const v = crudos.slice(i - 11, i + 1);
  const campos = campoBajas === 'total' ? ['bajasVol', 'bajasInv'] : ['bajasVol'];
  /* Sin un solo mes con bajas capturadas no hay rotación que anualizar.
     Devolver 0 % diría "no se fue nadie en doce meses". */
  if (!v.some((c) => campos.some((k) => conocido(c[k])))) return null;
  const bajas = v.reduce((t, c) => t + campos.reduce((s, k) => s + n0(c[k]), 0), 0);
  const hcProm = v.reduce((t, c) => t + n0(c.hcPropio), 0) / v.length;
  const r = div(bajas, hcProm);
  return r === null ? null : r * 100;
}

/** Serie completa de métricas con los anualizados incluidos. */
export function serie(almacen, filtro, unidadUnica = null) {
  const crudos = crudosPorPeriodo(almacen, filtro, unidadUnica);
  return crudos.map((c, i) => ({
    ...derivar(c),
    rotacionAnualizada: anualizar(crudos, i, 'total'),
    rotacionVoluntaria: anualizar(crudos, i, 'vol'),
  }));
}

/** Serie por unidad: Map<unidad_id, Array<metricas>>. */
export function seriePorUnidad(almacen, filtro) {
  const m = new Map();
  for (const id of filtro.unidades) m.set(id, serie(almacen, filtro, id));
  return m;
}

/* ------------------------------------------------------------------
   Catálogo de KPIs: nombre, formato, meta y de dónde sale el valor.
   Este catálogo alimenta las tarjetas y la matriz ejecutiva.
   ------------------------------------------------------------------ */
export const CATALOGO = {
  plantilla: [
    { id: 'headcountTotal', nombre: 'Fuerza laboral total', formato: 'entero', unidad: 'personas' },
    { id: 'headcountPropio', nombre: 'Plantilla propia', formato: 'entero', unidad: 'personas' },
    { id: 'pctContratistas', nombre: 'Contratistas', formato: 'pct', meta: 'pct_contratistas' },
    { id: 'coberturaPlantilla', nombre: 'Cobertura de plantilla', formato: 'pct', meta: 'cobertura_plantilla' },
    { id: 'rotacionAnualizada', nombre: 'Rotación anualizada', formato: 'pct', meta: 'rotacion_anualizada' },
    { id: 'rotacionVoluntaria', nombre: 'Rotación voluntaria', formato: 'pct', meta: 'rotacion_voluntaria' },
    { id: 'rotacionTemprana', nombre: 'Rotación temprana (<90 d)', formato: 'pct', meta: 'rotacion_temprana' },
    { id: 'coberturaCritica', nombre: 'Cobertura puestos críticos', formato: 'pct', meta: 'cobertura_critica' },
    { id: 'ausentismo', nombre: 'Ausentismo', formato: 'pct', meta: 'ausentismo' },
    { id: 'diasCobertura', nombre: 'Días para cubrir vacante', formato: 'dec', unidad: 'días', meta: 'dias_cobertura' },
    { id: 'vacantesAbiertas', nombre: 'Vacantes abiertas', formato: 'entero', unidad: 'plazas' },
    { id: 'antiguedadMeses', nombre: 'Antigüedad promedio', formato: 'dec', unidad: 'meses' },
  ],
  costo: [
    { id: 'costoLaboral', nombre: 'Costo laboral del mes', formato: 'mxnCorto' },
    { id: 'varPresupuesto', nombre: 'Variación vs presupuesto', formato: 'pct', meta: 'var_presupuesto' },
    { id: 'pctHorasExtra', nombre: 'Horas extra', formato: 'pct', meta: 'pct_horas_extra' },
    { id: 'costoHorasExtra', nombre: 'Costo de horas extra', formato: 'mxnCorto' },
    { id: 'costoPorTonelada', nombre: 'Costo laboral por tonelada', formato: 'mxn2', unidad: 'MXN/t', meta: 'costo_por_tonelada' },
    { id: 'productividad', nombre: 'Productividad', formato: 'dec2', unidad: 't/HH', meta: 'productividad' },
    { id: 'costoPorEmpleado', nombre: 'Costo por empleado', formato: 'mxnCorto', unidad: 'MXN/mes' },
    { id: 'toneladas', nombre: 'Toneladas movidas', formato: 'numCorto', unidad: 't' },
  ],
  desarrollo: [
    { id: 'cumplimientoPlanCap', nombre: 'Cumplimiento plan de capacitación', formato: 'pct', meta: 'cumplimiento_plan_cap' },
    { id: 'cumplimientoDc3', nombre: 'Cumplimiento DC-3', formato: 'pct', meta: 'cumplimiento_dc3' },
    { id: 'horasCapPorPersona', nombre: 'Horas de capacitación por persona', formato: 'dec2', unidad: 'HH', meta: 'horas_cap_por_persona' },
    { id: 'coberturaCompetencias', nombre: 'Cobertura matriz de competencias', formato: 'pct', meta: 'cobertura_competencias' },
    { id: 'inversionCapPorPersona', nombre: 'Inversión por persona', formato: 'mxn', unidad: 'MXN' },
    { id: 'enps', nombre: 'eNPS', formato: 'dec', unidad: 'pts', meta: 'enps' },
    { id: 'pctSindicalizacion', nombre: 'Sindicalización', formato: 'pct' },
    { id: 'conflictosAbiertos', nombre: 'Conflictos laborales abiertos', formato: 'entero', unidad: 'casos' },
  ],
};

/** Último valor no nulo de la serie para un id de KPI. */
export function ultimoValor(s, id) {
  for (let i = s.length - 1; i >= 0; i--) {
    if (Number.isFinite(s[i][id])) return { valor: s[i][id], periodo: s[i].periodo, i };
  }
  return { valor: null, periodo: null, i: -1 };
}

/** Variación contra el mes anterior y contra el mismo mes del año pasado. */
export function variaciones(s, id) {
  const { valor, i } = ultimoValor(s, id);
  if (i < 0) return { valor: null, mom: null, yoy: null };
  const prev = i > 0 && Number.isFinite(s[i - 1][id]) ? s[i - 1][id] : null;
  const ant = i >= 12 && Number.isFinite(s[i - 12][id]) ? s[i - 12][id] : null;
  return {
    valor,
    mom: prev === null ? null : valor - prev,
    yoy: ant === null ? null : valor - ant,
  };
}
