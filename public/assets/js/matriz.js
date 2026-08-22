/*
 * Matriz ejecutiva.
 *
 * Traduce los KPIs del mes a las cinco filas con que la Dirección de RRHH
 * lleva los temas al comité, siguiendo el formato de análisis de la skill
 * director-rrhh-mineria (diagnóstico → dependencia → riesgo → decisión).
 *
 * El color de cada fila es institucional y semántico:
 *   Objetivo primario    verde   #D9EAD3
 *   Éxito a 6 meses      verde   #D9EAD3
 *   Dependencia crítica  naranja #FCE5CD
 *   Riesgo principal     naranja #FCE5CD
 *   Relaciones / riesgos gris    #F2F2F2
 */
import { fmt, el, estadoVsMeta } from './util.js';
import { serie, seriePorUnidad, ultimoValor } from './kpi.js';

const FILAS = [
  ['objetivo', 'Objetivo primario'],
  ['exito', 'Éxito a 6 meses'],
  ['dependencia', 'Dependencia crítica'],
  ['riesgo', 'Riesgo principal'],
  ['relaciones', 'Relaciones / riesgos laborales'],
];

const COLUMNAS = [
  ['plantilla', 'Plantilla, rotación y ausentismo'],
  ['costo', 'Nómina, costo laboral y productividad'],
  ['desarrollo', 'Capacitación y relaciones laborales'],
];

function dato(txt) { return `<span class="dato">${txt}</span>`; }

const hay = (...vs) => vs.every((v) => Number.isFinite(v));

/* "$—" no es un monto: cuando no hay dato, el guion va solo. */
const mxn2 = (v) => (hay(v) ? `$${fmt.dec(v, 2)}` : '—');
const unid = (v, d, u) => (hay(v) ? `${fmt.dec(v, d)} ${u}` : '—');

/* Nombre de cada hoja de hechos en el idioma del comité, para poder decir
   qué falta capturar en lugar de afirmar un estado que nadie midió. */
const NOMBRE_HOJA = {
  movimientos: 'movimientos de personal',
  ausentismo: 'ausentismo',
  nomina: 'nómina y costo laboral',
  capacitacion: 'capacitación',
  relaciones: 'relaciones laborales',
};

/** Unidad con el peor valor de un KPI. */
function peorUnidad(porUnidad, almacen, id, direccion = 'menor_mejor') {
  let peor = null;
  for (const [uid, s] of porUnidad) {
    const { valor } = ultimoValor(s, id);
    if (!Number.isFinite(valor)) continue;
    if (!peor || (direccion === 'menor_mejor' ? valor > peor.valor : valor < peor.valor)) {
      peor = { uid, valor, nombre: almacen.unidadPorId.get(uid)?.unidad || uid };
    }
  }
  return peor;
}

export function construirMatriz(almacen, filtro) {
  const s = serie(almacen, filtro);
  const porUnidad = seriePorUnidad(almacen, filtro);
  const v = (id) => ultimoValor(s, id).valor;
  const meta = (k) => almacen.metaPorKpi.get(k);
  const mv = (k) => meta(k)?.meta;

  const rot = v('rotacionAnualizada');
  const rotVol = v('rotacionVoluntaria');
  const aus = v('ausentismo');
  const covCrit = v('coberturaCritica');
  const cov = v('coberturaPlantilla');
  const he = v('pctHorasExtra');
  const varP = v('varPresupuesto');
  const cpt = v('costoPorTonelada');
  const prod = v('productividad');
  const dc3 = v('cumplimientoDc3');
  const plan = v('cumplimientoPlanCap');
  const comp = v('coberturaCompetencias');
  const enps = v('enps');
  const riesgo = v('riesgoSindical');
  const confl = v('conflictosAbiertos');
  const cct = v('diasARevisionCct');
  const pctCont = v('pctContratistas');
  const diasCob = v('diasCobertura');
  const rotTemp = v('rotacionTemprana');

  const peorRot = peorUnidad(porUnidad, almacen, 'rotacionAnualizada');
  const peorHe = peorUnidad(porUnidad, almacen, 'pctHorasExtra');
  const peorDc3 = peorUnidad(porUnidad, almacen, 'cumplimientoDc3', 'mayor_mejor');
  const peorEnps = peorUnidad(porUnidad, almacen, 'enps', 'mayor_mejor');

  const brechaRot = Number.isFinite(rot) && Number.isFinite(mv('rotacion_anualizada'))
    ? rot - mv('rotacion_anualizada') : null;

  const celdas = {
    objetivo: {
      plantilla: `Bajar la rotación anualizada de ${dato(fmt.pct(rot))} a la meta de `
        + `${dato(fmt.pct(mv('rotacion_anualizada')))} y sostener la cobertura de puestos `
        + `críticos por arriba de ${dato(fmt.pct(mv('cobertura_critica')))} `
        + `(hoy ${dato(fmt.pct(covCrit))}).`,
      costo: `Contener el costo laboral dentro del presupuesto (desviación actual `
        + `${dato(fmt.pct(varP))}) reduciendo horas extra de ${dato(fmt.pct(he))} a `
        + `${dato(fmt.pct(mv('pct_horas_extra')))} sin afectar toneladas movidas.`,
      desarrollo: `Cerrar el cumplimiento DC-3 en ${dato(fmt.pct(mv('cumplimiento_dc3')))} `
        + `(hoy ${dato(fmt.pct(dc3))}) y llevar la matriz de competencias críticas a `
        + `${dato(fmt.pct(mv('cobertura_competencias')))} (hoy ${dato(fmt.pct(comp))}).`,
    },
    exito: {
      plantilla: `Rotación voluntaria ≤ ${dato(fmt.pct(mv('rotacion_voluntaria')))} `
        + `(hoy ${dato(fmt.pct(rotVol))}), ausentismo ≤ ${dato(fmt.pct(mv('ausentismo')))} `
        + `(hoy ${dato(fmt.pct(aus))}) y tiempo de cobertura ≤ `
        + `${dato(unid(mv('dias_cobertura'), 0, 'días'))} (hoy ${dato(unid(diasCob, 0, 'días'))}).`,
      costo: `Costo laboral por tonelada ≤ ${dato(mxn2(mv('costo_por_tonelada')))} `
        + `(hoy ${dato(mxn2(cpt))}) y productividad ≥ `
        + `${dato(unid(mv('productividad'), 2, 't/HH'))} (hoy ${dato(unid(prod, 2, 't/HH'))}).`,
      desarrollo: `Plan de capacitación ejecutado al ${dato(fmt.pct(mv('cumplimiento_plan_cap')))} `
        + `(hoy ${dato(fmt.pct(plan))}) y eNPS ≥ ${dato(unid(mv('enps'), 0, 'pts'))} `
        + `(hoy ${dato(unid(enps, 0, 'pts'))}).`,
    },
    dependencia: {
      plantilla: `Capacidad real de reclutamiento en ${peorRot ? peorRot.nombre : 'las unidades críticas'}: `
        + `con ${dato(hay(v('vacantesAbiertas')) ? fmt.entero(v('vacantesAbiertas')) + ' vacantes' : '— vacantes')} abiertas y `
        + `${dato(unid(diasCob, 0, 'días'))} de cobertura, ninguna meta de plantilla se sostiene `
        + `sin fortalecer atracción local y hospedaje de turno.`,
      costo: `Programa de producción y disponibilidad de equipo. La horas extra de `
        + `${dato(fmt.pct(he))} son consecuencia de ausentismo (${dato(fmt.pct(aus))}) `
        + `y de plazas no cubiertas: sin cerrar plantilla, el sobrecosto no baja por decreto.`,
      desarrollo: `Liberación de personal operativo por parte de Operaciones y Mantenimiento. `
        + (!hay(plan)
          ? `El avance del plan no está capturado: sin ese dato no se sabe si `
            + `hay brecha que recuperar ni cuánta.`
          : plan < 100
            ? `Sin ventanas de turno protegidas, el ${dato(fmt.pct(100 - plan))} `
              + `faltante del plan no se recupera.`
            : `El plan va ejecutado al ${dato(fmt.pct(plan))}; sostenerlo depende de que `
              + `las ventanas de turno se mantengan protegidas en el siguiente trimestre.`),
    },
    riesgo: {
      plantilla: !hay(rot)
        ? `La rotación todavía no se puede medir: falta capturar `
          + `${dato(NOMBRE_HOJA.movimientos)}. El riesgo no es que esté `
          + `controlada, es que no se está midiendo: sin bajas capturadas no `
          + `hay cómo detectar una fuga de personal en curso.`
        : brechaRot !== null && brechaRot > 0
        ? `Rotación ${dato(fmt.dec(brechaRot, 1) + ' pp')} arriba de meta, concentrada en `
          + `${peorRot ? dato(peorRot.nombre) : 'unidades operativas'} `
          + `(${peorRot ? fmt.pct(peorRot.valor) : '—'}). Rotación temprana de `
          + `${dato(fmt.pct(rotTemp))} indica falla de selección e inducción, no de compensación.`
        : `Rotación dentro de meta; el riesgo se desplaza a la dependencia de contratistas `
          + `(${dato(fmt.pct(pctCont))} de la fuerza total).`,
      costo: `Sobrecosto de horas extra en ${peorHe ? dato(peorHe.nombre) : 'unidades operativas'} `
        + `(${peorHe ? fmt.pct(peorHe.valor) : '—'}) con riesgo de fatiga y de reclamo por `
        + `jornada. Desviación presupuestal acumulada del mes: ${dato(fmt.pct(varP))}.`,
      desarrollo: `Exposición legal por DC-3: ${peorDc3 ? dato(peorDc3.nombre) : '—'} en `
        + `${peorDc3 ? fmt.pct(peorDc3.valor) : '—'} de cumplimiento. Un requerimiento de la `
        + `autoridad laboral o un incidente con personal sin constancia vigente es un hallazgo directo.`,
    },
    relaciones: {
      plantilla: `${dato(fmt.pct(v('pctSindicalizacion')))} de la plantilla propia sindicalizada. `
        + `Cualquier ajuste de dotación o de esquema de turno pasa por mesa sindical antes de `
        + `comunicarse a la operación.`,
      costo: `Revisión salarial más próxima en ${dato(hay(cct) ? fmt.entero(cct) + ' días' : '—')}. `
        + `El costo de horas extra es hoy el argumento más fuerte de la contraparte para pedir `
        + `plazas de base: conviene llegar a la mesa con plantilla cerrada.`,
      desarrollo: `Nivel de riesgo sindical ${dato(hay(riesgo) ? riesgo + '/5' : '—')}, `
        + `${dato(hay(confl) ? fmt.entero(confl) + ' conflictos' : '— conflictos')} abiertos y eNPS más bajo en `
        + `${peorEnps ? dato(peorEnps.nombre) : '—'} (${peorEnps ? fmt.dec(peorEnps.valor, 0) : '—'} pts). `
        + `Capacitación y liderazgo de primera línea son la palanca de clima disponible sin costo de nómina.`,
    },
  };

  const tabla = el('table', { clase: 'matriz' });
  const thead = el('thead');
  const trh = el('tr');
  trh.append(el('th', { scope: 'col', texto: `Matriz ejecutiva · ${fmt.periodoLargo(ultimoValor(s, 'headcountTotal').periodo)}` }));
  for (const [, nombre] of COLUMNAS) trh.append(el('th', { scope: 'col', texto: nombre }));
  thead.append(trh);
  tabla.append(thead);

  const tbody = el('tbody');
  for (const [clase, etiqueta] of FILAS) {
    const tr = el('tr', { clase });
    tr.append(el('th', { scope: 'row', texto: etiqueta }));
    for (const [colId] of COLUMNAS) {
      tr.append(el('td', { html: celdas[clase][colId] }));
    }
    tbody.append(tr);
  }
  tabla.append(tbody);

  /* Próxima decisión requerida: cierre ejecutivo del formato de la skill. */
  const decisiones = [];

  /*
   * Un módulo sin capturar es la primera decisión, antes que cualquier
   * desviación. Si no se dice aquí, la matriz cierra con "no hay desviación
   * que requiera decisión inmediata" — que con media base vacía es la
   * conclusión más peligrosa que puede leer un comité: no hay desviación
   * porque no hay medición.
   */
  const capturado = s.at(-1)?.crudo?._filas || {};
  const sinCaptura = Object.keys(NOMBRE_HOJA).filter((h) => !capturado[h]);
  if (sinCaptura.length) {
    decisiones.push(`asignar responsable y fecha para la captura de `
      + `${sinCaptura.map((h) => NOMBRE_HOJA[h]).join(', ')}: `
      + `${sinCaptura.length === 1 ? 'ese módulo' : 'esos módulos'} no se está`
      + `${sinCaptura.length === 1 ? '' : 'n'} reportando al comité`);
  }
  if (estadoVsMeta(rot, mv('rotacion_anualizada'), 'menor_mejor') === 'alerta') {
    decisiones.push(`autorizar el paquete de retención y cierre de plantilla en `
      + `${peorRot ? peorRot.nombre : 'las unidades fuera de meta'}`);
  }
  if (estadoVsMeta(he, mv('pct_horas_extra'), 'menor_mejor') === 'alerta') {
    decisiones.push('definir el techo de horas extra por unidad y quién lo autoriza');
  }
  if (estadoVsMeta(dc3, mv('cumplimiento_dc3'), 'mayor_mejor') === 'alerta') {
    decisiones.push('aprobar el plan de regularización DC-3 con fecha comprometida');
  }
  if (Number.isFinite(cct) && cct < 120) {
    decisiones.push(`fijar el mandato de negociación antes de la revisión salarial (${fmt.entero(cct)} días)`);
  }
  if (!decisiones.length) {
    decisiones.push('ratificar metas del siguiente semestre; no hay desviación '
      + 'que requiera decisión inmediata');
  }

  return { tabla, decisiones };
}

export function bloqueDecisiones(decisiones) {
  const caja = el('table', { clase: 'matriz' });
  const thead = el('thead');
  thead.append(el('tr', {}, [el('th', { scope: 'col', texto: 'Próxima decisión requerida' })]));
  caja.append(thead);
  const tbody = el('tbody');
  decisiones.forEach((d, i) => {
    const tr = el('tr', { clase: 'dependencia' });
    tr.append(el('td', { html: `<strong>${i + 1}.</strong> ${d.charAt(0).toUpperCase()}${d.slice(1)}.` }));
    tbody.append(tr);
  });
  caja.append(tbody);
  return caja;
}
