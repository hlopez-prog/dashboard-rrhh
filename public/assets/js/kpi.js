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
 */
import { aplicar } from './datos.js';
import { div } from './util.js';

const CAMPOS_CRUDOS = [
  'hcPropio', 'hcCont', 'dotacion', 'mujeres', 'antigPeso', 'pcTot', 'pcOk',
  'hcPropioUnidad',
  'altas', 'bajasVol', 'bajasInv', 'bajasTemp', 'vacantes', 'diasCobSum', 'diasCobN',
  'hrsProg', 'hrsAus', 'casos', 'diasInc',
  'costoOrd', 'costoHE', 'costoPrest', 'hrsOrd', 'hrsHE', 'presup', 'toneladas',
  'hPlan', 'hReal', 'participantes', 'dc3Req', 'dc3Emi', 'invCap', 'compReq', 'compOk',
  'sindicalizados', 'emplazamientos', 'conflictosAb', 'conflictosCer',
  'enpsSum', 'enpsN', 'riesgoMax', 'diasCCTMin',
];

function crudoVacio(periodo) {
  const o = { periodo };
  for (const c of CAMPOS_CRUDOS) o[c] = 0;
  o.riesgoMax = 0;
  o.diasCCTMin = Infinity;
  return o;
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
    if (r.tipo_relacion === 'Propio') {
      c.hcPropio += r.headcount;
      c.dotacion += r.dotacion_autorizada;
      c.mujeres += r.mujeres;
      c.antigPeso += r.antiguedad_prom_meses * r.headcount;
      c.pcTot += r.puestos_criticos_totales;
      c.pcOk += r.puestos_criticos_cubiertos;
    } else {
      c.hcCont += r.headcount;
    }
  }

  /* Headcount propio de la unidad SIN filtro de área: base correcta para
     tasas que se reportan a nivel unidad (sindicalización). */
  for (const r of almacen.plantilla) {
    if (r.tipo_relacion !== 'Propio') continue;
    if (!f.unidades.has(r.unidad_id) || !f.setPeriodos.has(r.periodo)) continue;
    const c = g(r.periodo); if (c) c.hcPropioUnidad += r.headcount;
  }

  for (const r of aplicar(almacen.movimientos, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c.altas += r.altas;
    c.bajasVol += r.bajas_voluntarias;
    c.bajasInv += r.bajas_involuntarias;
    c.bajasTemp += r.bajas_menos_90_dias;
    c.vacantes += r.vacantes_abiertas;
    c.diasCobSum += r.dias_cobertura_prom;
    c.diasCobN += 1;
  }

  for (const r of aplicar(almacen.ausentismo, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c.hrsProg += r.horas_programadas;
    c.hrsAus += r.horas_ausencia;
    c.casos += r.casos_incapacidad;
    c.diasInc += r.dias_incapacidad;
  }

  for (const r of aplicar(almacen.nomina, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c.costoOrd += r.costo_ordinario;
    c.costoHE += r.costo_horas_extra;
    c.costoPrest += r.costo_prestaciones;
    c.hrsOrd += r.horas_ordinarias;
    c.hrsHE += r.horas_extra;
    c.presup += r.presupuesto_costo_laboral;
    c.toneladas += r.toneladas_movidas;
  }

  for (const r of aplicar(almacen.capacitacion, { ...f, pasa })) {
    const c = g(r.periodo); if (!c) continue;
    c.hPlan += r.horas_plan;
    c.hReal += r.horas_real;
    c.participantes += r.participantes;
    c.dc3Req += r.dc3_requeridos;
    c.dc3Emi += r.dc3_emitidos;
    c.invCap += r.inversion_mxn;
    c.compReq += r.competencias_criticas_req;
    c.compOk += r.competencias_criticas_ok;
  }

  for (const r of almacen.relaciones) {
    if (!f.unidades.has(r.unidad_id) || !f.setPeriodos.has(r.periodo)) continue;
    const c = g(r.periodo); if (!c) continue;
    c.sindicalizados += r.trabajadores_sindicalizados;
    c.emplazamientos += r.emplazamientos;
    c.conflictosAb += r.conflictos_abiertos;
    c.conflictosCer += r.conflictos_cerrados;
    c.enpsSum += r.enps;
    c.enpsN += 1;
    c.riesgoMax = Math.max(c.riesgoMax, r.riesgo_sindical);
    if (r.dias_a_revision_cct > 0) c.diasCCTMin = Math.min(c.diasCCTMin, r.dias_a_revision_cct);
  }

  return f.periodos.map((p) => mapa.get(p));
}

/** Métricas derivadas de un mes. */
export function derivar(c) {
  const total = c.hcPropio + c.hcCont;
  const bajas = c.bajasVol + c.bajasInv;
  const costoTotal = c.costoOrd + c.costoHE + c.costoPrest;
  const p = (x) => (x === null ? null : x * 100);
  return {
    periodo: c.periodo,
    crudo: c,
    headcountTotal: total,
    headcountPropio: c.hcPropio,
    headcountContratista: c.hcCont,
    pctContratistas: p(div(c.hcCont, total)),
    coberturaPlantilla: p(div(c.hcPropio, c.dotacion)),
    coberturaCritica: p(div(c.pcOk, c.pcTot)),
    antiguedadMeses: div(c.antigPeso, c.hcPropio),
    pctMujeres: p(div(c.mujeres, c.hcPropio)),
    altas: c.altas,
    bajas,
    bajasVoluntarias: c.bajasVol,
    bajasInvoluntarias: c.bajasInv,
    rotacionMensual: p(div(bajas, c.hcPropio)),
    rotacionTemprana: p(div(c.bajasTemp, c.bajasVol)),
    vacantesAbiertas: c.vacantes,
    diasCobertura: div(c.diasCobSum, c.diasCobN),
    ausentismo: p(div(c.hrsAus, c.hrsProg)),
    casosIncapacidad: c.casos,
    diasIncapacidadPor100: p(div(c.diasInc, c.hcPropio)),
    costoLaboral: costoTotal,
    costoHorasExtra: c.costoHE,
    pctHorasExtra: p(div(c.hrsHE, c.hrsOrd)),
    presupuesto: c.presup,
    varPresupuesto: p(div(costoTotal - c.presup, c.presup)),
    costoPorEmpleado: div(costoTotal, c.hcPropio),
    toneladas: c.toneladas,
    /* Sin toneladas no hay ratio de productividad: se devuelve vacío en
       lugar de 0, que se leería como "productividad nula". */
    costoPorTonelada: c.toneladas > 0 ? div(costoTotal, c.toneladas) : null,
    productividad: c.toneladas > 0 ? div(c.toneladas, c.hrsOrd + c.hrsHE) : null,
    cumplimientoPlanCap: p(div(c.hReal, c.hPlan)),
    cumplimientoDc3: p(div(c.dc3Emi, c.dc3Req)),
    horasCapPorPersona: div(c.hReal, c.hcPropio),
    coberturaCompetencias: p(div(c.compOk, c.compReq)),
    inversionCapPorPersona: div(c.invCap, c.hcPropio),
    inversionCap: c.invCap,
    enps: div(c.enpsSum, c.enpsN),
    riesgoSindical: c.riesgoMax || null,
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
  const bajas = v.reduce((t, c) => t + (campoBajas === 'total'
    ? c.bajasVol + c.bajasInv
    : c.bajasVol), 0);
  const hcProm = v.reduce((t, c) => t + c.hcPropio, 0) / v.length;
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
