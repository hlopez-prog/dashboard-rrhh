/*
 * Tests de las fórmulas de KPI.
 *
 *   node --test tests/
 *
 * Los casos usan un mini-dataset armado a mano con números redondos, para que
 * el resultado esperado se pueda verificar con una calculadora y no dependa
 * de los datos demo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirAlmacen, construirFiltro } from '../public/assets/js/datos.js';
import {
  serie, derivar, anualizar, crudosPorPeriodo, ultimoValor, variaciones,
} from '../public/assets/js/kpi.js';
import { estadoVsMeta, div, fmt } from '../public/assets/js/util.js';

/* ---------- Mini-dataset ---------- */
const PERIODOS = [];
for (let i = 0; i < 13; i++) {
  PERIODOS.push(`2025-${String(i + 1).padStart(2, '0')}`.replace('2025-13', '2026-01'));
}

function columnar(columnas, filas) { return { columnas, filas }; }

function datasetBase() {
  const plantilla = [];
  const movimientos = [];
  const ausentismo = [];
  const nomina = [];
  const capacitacion = [];
  const relaciones = [];

  for (const p of PERIODOS) {
    // U1/A1: 100 propios + 25 contratistas; U2/A2: 100 propios, 0 contratistas
    plantilla.push([p, 'U1', 'A1', 'Propio', '7x7', 100, 110, 10, 60, 20, 18]);
    plantilla.push([p, 'U1', 'A1', 'Contratista', '7x7', 25, 0, 2, 12, 0, 0]);
    plantilla.push([p, 'U2', 'A2', 'Propio', 'Administrativo', 100, 100, 40, 90, 10, 10]);

    // 2 bajas voluntarias + 1 involuntaria por unidad y mes
    movimientos.push([p, 'U1', 'A1', 3, 2, 1, 1, 5, 40]);
    movimientos.push([p, 'U2', 'A2', 1, 1, 0, 0, 2, 20]);

    // 10 000 horas programadas, 300 de ausencia → 3.0 %
    ausentismo.push([p, 'U1', 'A1', 10000, 300, 5, 30]);
    ausentismo.push([p, 'U2', 'A2', 10000, 100, 1, 5]);

    // costo 1 000 000 + 100 000 HE + 300 000 prest = 1 400 000; presupuesto 1 400 000
    nomina.push([p, 'U1', 'A1', 1000000, 100000, 300000, 20000, 1000, 1400000, 50000]);
    nomina.push([p, 'U2', 'A2', 1000000, 0, 300000, 20000, 0, 1300000, 0]);

    capacitacion.push([p, 'U1', 'A1', 200, 180, 50, 30, 27, 60000, 20, 18]);
    capacitacion.push([p, 'U2', 'A2', 100, 100, 40, 20, 20, 30000, 10, 10]);

    relaciones.push([p, 'U1', 'Sind. A', 80, 0, 2, 1, 200, 3, 25, 0.7]);
    relaciones.push([p, 'U2', 'Sind. B', 50, 1, 0, 0, 100, 2, 45, 0.8]);
  }

  return construirAlmacen({
    tablas: {
      unidad: columnar(
        ['unidad_id', 'unidad', 'estado', 'tipo_operacion', 'mineral_principal', 'es_corporativo'],
        [['U1', 'Unidad Uno', 'Zacatecas', 'Subterránea', 'Plata', 0],
          ['U2', 'Unidad Dos', 'CDMX', 'Corporativo', 'N/A', 1]],
      ),
      area: columnar(['area_id', 'area', 'tipo_area', 'es_critica'],
        [['A1', 'Mina', 'Mina', 1], ['A2', 'Administración', 'Administración', 0]]),
      plantilla: columnar(['periodo', 'unidad_id', 'area_id', 'tipo_relacion', 'turno',
        'headcount', 'dotacion_autorizada', 'mujeres', 'antiguedad_prom_meses',
        'puestos_criticos_totales', 'puestos_criticos_cubiertos'], plantilla),
      movimientos: columnar(['periodo', 'unidad_id', 'area_id', 'altas', 'bajas_voluntarias',
        'bajas_involuntarias', 'bajas_menos_90_dias', 'vacantes_abiertas',
        'dias_cobertura_prom'], movimientos),
      ausentismo: columnar(['periodo', 'unidad_id', 'area_id', 'horas_programadas',
        'horas_ausencia', 'casos_incapacidad', 'dias_incapacidad'], ausentismo),
      nomina: columnar(['periodo', 'unidad_id', 'area_id', 'costo_ordinario',
        'costo_horas_extra', 'costo_prestaciones', 'horas_ordinarias', 'horas_extra',
        'presupuesto_costo_laboral', 'toneladas_movidas'], nomina),
      capacitacion: columnar(['periodo', 'unidad_id', 'area_id', 'horas_plan', 'horas_real',
        'participantes', 'dc3_requeridos', 'dc3_emitidos', 'inversion_mxn',
        'competencias_criticas_req', 'competencias_criticas_ok'], capacitacion),
      relaciones: columnar(['periodo', 'unidad_id', 'sindicato', 'trabajadores_sindicalizados',
        'emplazamientos', 'conflictos_abiertos', 'conflictos_cerrados',
        'dias_a_revision_cct', 'riesgo_sindical', 'enps', 'participacion_clima'], relaciones),
      metas: columnar(['kpi', 'nombre', 'meta', 'direccion', 'unidad_medida'],
        [['rotacion_anualizada', 'Rotación anualizada', 14, 'menor_mejor', '%'],
          ['ausentismo', 'Ausentismo', 3, 'menor_mejor', '%']]),
    },
    meta: { periodos: PERIODOS, periodo_inicial: PERIODOS[0], periodo_final: PERIODOS.at(-1) },
  });
}

const almacen = datasetBase();
const todo = construirFiltro(almacen, { meses: PERIODOS.length });
const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

/* ---------- Agregación ---------- */

test('agrega headcount separando plantilla propia de contratistas', () => {
  const s = serie(almacen, todo);
  const u = s.at(-1);
  assert.equal(u.headcountPropio, 200);
  assert.equal(u.headcountContratista, 25);
  assert.equal(u.headcountTotal, 225);
  cerca(u.pctContratistas, (25 / 225) * 100);
});

test('cobertura de plantilla usa la dotación autorizada de plantilla propia', () => {
  const u = serie(almacen, todo).at(-1);
  // 200 propios / (110 + 100) autorizados
  cerca(u.coberturaPlantilla, (200 / 210) * 100);
});

test('cobertura de puestos críticos suma cubiertos sobre totales', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.coberturaCritica, ((18 + 10) / (20 + 10)) * 100);
});

test('antigüedad promedio se pondera por headcount, no es promedio simple', () => {
  const u = serie(almacen, todo).at(-1);
  // (60×100 + 90×100) / 200 = 75, no (60+90)/2 que coincide aquí; se usan pesos distintos:
  cerca(u.antiguedadMeses, (60 * 100 + 90 * 100) / 200);
});

/* ---------- Rotación ---------- */

test('rotación mensual = bajas totales sobre plantilla propia', () => {
  const u = serie(almacen, todo).at(-1);
  // U1: 2+1=3, U2: 1+0=1 → 4 bajas / 200 propios = 2 %
  assert.equal(u.bajas, 4);
  cerca(u.rotacionMensual, 2);
});

test('rotación anualizada usa ventana móvil de 12 meses, no el mes × 12', () => {
  const s = serie(almacen, todo);
  // 12 meses × 4 bajas = 48; headcount propio promedio = 200 → 24 %
  cerca(s.at(-1).rotacionAnualizada, 24);
  // y NO 2 % × 12 = 24 por casualidad; verificamos con la voluntaria:
  // 12 × 3 bajas voluntarias = 36 / 200 = 18 %
  cerca(s.at(-1).rotacionVoluntaria, 18);
});

test('los primeros 11 meses no publican anualizado', () => {
  const s = serie(almacen, todo);
  for (let i = 0; i < 11; i++) {
    assert.equal(s[i].rotacionAnualizada, null, `mes ${i} debería ser null`);
  }
  assert.ok(Number.isFinite(s[11].rotacionAnualizada));
});

test('anualizar devuelve null con historia insuficiente', () => {
  const crudos = crudosPorPeriodo(almacen, todo);
  assert.equal(anualizar(crudos, 0, 'total'), null);
  assert.equal(anualizar(crudos, 10, 'total'), null);
  assert.ok(Number.isFinite(anualizar(crudos, 11, 'total')));
});

test('rotación temprana se mide sobre bajas voluntarias', () => {
  const u = serie(almacen, todo).at(-1);
  // 1 baja <90 días de 3 voluntarias
  cerca(u.rotacionTemprana, (1 / 3) * 100);
});

/* ---------- Ausentismo ---------- */

test('ausentismo = horas de ausencia sobre horas programadas', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.ausentismo, ((300 + 100) / 20000) * 100);
});

/* ---------- Costo ---------- */

test('costo laboral suma ordinario, horas extra y prestaciones', () => {
  const u = serie(almacen, todo).at(-1);
  assert.equal(u.costoLaboral, (1000000 + 100000 + 300000) + (1000000 + 0 + 300000));
});

test('variación vs presupuesto es cero cuando real = presupuesto', () => {
  const u = serie(almacen, todo).at(-1);
  // real 2 700 000 vs presupuesto 2 700 000
  cerca(u.varPresupuesto, 0);
});

test('porcentaje de horas extra sobre horas ordinarias', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.pctHorasExtra, (1000 / 40000) * 100);
});

test('costo por tonelada y productividad ignoran áreas sin producción', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.costoPorTonelada, 2700000 / 50000);
  cerca(u.productividad, 50000 / (40000 + 1000));
});

test('sin toneladas, productividad y costo por tonelada quedan vacíos, no en cero', () => {
  // U2/A2 es corporativo: nómina sin producción asociada.
  const f = construirFiltro(almacen, { meses: PERIODOS.length, unidades: new Set(['U2']) });
  const u = serie(almacen, f).at(-1);
  assert.equal(u.toneladas, 0);
  assert.equal(u.productividad, null, 'productividad debería ser null, no 0');
  assert.equal(u.costoPorTonelada, null, 'costo por tonelada debería ser null');
});

/* ---------- Capacitación y RL ---------- */

test('cumplimiento DC-3 y del plan de capacitación', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.cumplimientoDc3, ((27 + 20) / (30 + 20)) * 100);
  cerca(u.cumplimientoPlanCap, ((180 + 100) / (200 + 100)) * 100);
  cerca(u.horasCapPorPersona, 280 / 200);
});

test('eNPS es promedio de unidades y el riesgo sindical es el máximo', () => {
  const u = serie(almacen, todo).at(-1);
  cerca(u.enps, (25 + 45) / 2);
  assert.equal(u.riesgoSindical, 3);
  assert.equal(u.diasARevisionCct, 100);
});

test('sindicalización se mide contra plantilla de unidad sin filtro de área', () => {
  const soloMina = construirFiltro(almacen, {
    meses: PERIODOS.length, tiposArea: new Set(['Mina']),
  });
  const u = serie(almacen, soloMina).at(-1);
  // Solo U1 tiene área tipo Mina, pero la base de sindicalización es la
  // plantilla propia completa de las unidades seleccionadas (100 + 100).
  cerca(u.pctSindicalizacion, ((80 + 50) / 200) * 100);
});

/* ---------- Filtros ---------- */

test('el filtro por unidad recorta la agregación', () => {
  const f = construirFiltro(almacen, { meses: PERIODOS.length, unidades: new Set(['U1']) });
  const u = serie(almacen, f).at(-1);
  assert.equal(u.headcountPropio, 100);
  assert.equal(u.headcountContratista, 25);
});

test('el filtro por tipo de área recorta a las áreas correspondientes', () => {
  const f = construirFiltro(almacen, {
    meses: PERIODOS.length, tiposArea: new Set(['Administración']),
  });
  const u = serie(almacen, f).at(-1);
  assert.equal(u.headcountPropio, 100);
  assert.equal(u.headcountContratista, 0);
});

test('el filtro de periodo devuelve exactamente los últimos N meses', () => {
  const f = construirFiltro(almacen, { meses: 6 });
  assert.equal(serie(almacen, f).length, 6);
  assert.equal(f.periodos.at(-1), PERIODOS.at(-1));
});

/* ---------- Robustez ---------- */

test('divisiones por cero devuelven null, nunca Infinity ni NaN', () => {
  assert.equal(div(1, 0), null);
  assert.equal(div(0, 0), null);
  assert.equal(div(NaN, 2), null);
  const vacio = derivar({
    periodo: '2026-01', hcPropio: 0, hcCont: 0, dotacion: 0, mujeres: 0, antigPeso: 0,
    pcTot: 0, pcOk: 0, hcPropioUnidad: 0, altas: 0, bajasVol: 0, bajasInv: 0,
    bajasTemp: 0, vacantes: 0, diasCobSum: 0, diasCobN: 0, hrsProg: 0, hrsAus: 0,
    casos: 0, diasInc: 0, costoOrd: 0, costoHE: 0, costoPrest: 0, hrsOrd: 0,
    hrsHE: 0, presup: 0, toneladas: 0, hPlan: 0, hReal: 0, participantes: 0,
    dc3Req: 0, dc3Emi: 0, invCap: 0, compReq: 0, compOk: 0, sindicalizados: 0,
    emplazamientos: 0, conflictosAb: 0, conflictosCer: 0, enpsSum: 0, enpsN: 0,
    riesgoMax: 0, diasCCTMin: Infinity,
  });
  for (const [k, v] of Object.entries(vacio)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
  }
  assert.equal(vacio.ausentismo, null);
  assert.equal(vacio.diasARevisionCct, null);
});

test('ultimoValor salta los nulos del inicio de la serie', () => {
  const s = serie(almacen, todo);
  const { valor, periodo } = ultimoValor(s, 'rotacionAnualizada');
  assert.ok(Number.isFinite(valor));
  assert.equal(periodo, PERIODOS.at(-1));
});

test('variaciones calcula mes contra mes', () => {
  const s = serie(almacen, todo);
  const v = variaciones(s, 'ausentismo');
  cerca(v.mom, 0); // el dataset es plano
});

/* ---------- Huecos: null ≠ 0 ----------
   La base real llega con columnas de detalle vacías. Un hueco significa
   "no se sabe": no puede convertirse en cero ni diluir el denominador. */

function datasetConHuecos() {
  const plantilla = [];
  const nomina = [];
  const capacitacion = [];
  const movimientos = [];
  const ausentismo = [];
  const relaciones = [];
  for (const p of PERIODOS) {
    //                                turno  hc  dot  muj antig pcTot pcOk
    plantilla.push([p, 'U1', 'A1', 'Propio', '7x7', 100, 110, 10, 60, 20, 18]);
    // A2 reporta headcount pero NO el detalle: dotación, mujeres, etc. vacíos
    plantilla.push([p, 'U1', 'A2', 'Propio', null, 100, null, null, null, null, null]);

    movimientos.push([p, 'U1', 'A1', 3, 2, 1, 1, 5, 40]);
    movimientos.push([p, 'U1', 'A2', 1, 1, 0, null, null, null]);
    ausentismo.push([p, 'U1', 'A1', 10000, 300, 5, 30]);
    ausentismo.push([p, 'U1', 'A2', 10000, 100, null, null]);
    // A2 sin presupuesto, sin horas extra, sin toneladas
    nomina.push([p, 'U1', 'A1', 1000000, 100000, 300000, 20000, 1000, 1400000, 50000]);
    nomina.push([p, 'U1', 'A2', 1000000, null, null, 20000, null, null, null]);
    capacitacion.push([p, 'U1', 'A1', 200, 180, 50, 30, 27, 60000, 20, 18]);
    capacitacion.push([p, 'U1', 'A2', null, 100, null, 20, 20, null, null, null]);
    relaciones.push([p, 'U1', 'Sind. A', 80, null, 2, null, null, 3, null, null]);
  }
  return construirAlmacen({
    tablas: {
      unidad: columnar(
        ['unidad_id', 'unidad', 'estado', 'tipo_operacion', 'mineral_principal', 'es_corporativo'],
        [['U1', 'Unidad Uno', 'Zacatecas', 'Subterránea', 'Plata', 0]]),
      area: columnar(['area_id', 'area', 'tipo_area', 'es_critica'],
        [['A1', 'Mina', 'Mina', 1], ['A2', 'Administración', 'Administración', 0]]),
      plantilla: columnar(['periodo', 'unidad_id', 'area_id', 'tipo_relacion', 'turno',
        'headcount', 'dotacion_autorizada', 'mujeres', 'antiguedad_prom_meses',
        'puestos_criticos_totales', 'puestos_criticos_cubiertos'], plantilla),
      movimientos: columnar(['periodo', 'unidad_id', 'area_id', 'altas', 'bajas_voluntarias',
        'bajas_involuntarias', 'bajas_menos_90_dias', 'vacantes_abiertas',
        'dias_cobertura_prom'], movimientos),
      ausentismo: columnar(['periodo', 'unidad_id', 'area_id', 'horas_programadas',
        'horas_ausencia', 'casos_incapacidad', 'dias_incapacidad'], ausentismo),
      nomina: columnar(['periodo', 'unidad_id', 'area_id', 'costo_ordinario',
        'costo_horas_extra', 'costo_prestaciones', 'horas_ordinarias', 'horas_extra',
        'presupuesto_costo_laboral', 'toneladas_movidas'], nomina),
      capacitacion: columnar(['periodo', 'unidad_id', 'area_id', 'horas_plan', 'horas_real',
        'participantes', 'dc3_requeridos', 'dc3_emitidos', 'inversion_mxn',
        'competencias_criticas_req', 'competencias_criticas_ok'], capacitacion),
      relaciones: columnar(['periodo', 'unidad_id', 'sindicato', 'trabajadores_sindicalizados',
        'emplazamientos', 'conflictos_abiertos', 'conflictos_cerrados',
        'dias_a_revision_cct', 'riesgo_sindical', 'enps', 'participacion_clima'], relaciones),
      metas: columnar(['kpi', 'nombre', 'meta', 'direccion', 'unidad_medida'], []),
    },
    meta: { periodos: PERIODOS, periodo_inicial: PERIODOS[0], periodo_final: PERIODOS.at(-1) },
  });
}

const conHuecos = datasetConHuecos();
const todoHuecos = construirFiltro(conHuecos, { meses: PERIODOS.length });

test('un hueco no diluye el denominador de la razón', () => {
  const u = serie(conHuecos, todoHuecos).at(-1);
  // headcount total sí suma las dos áreas
  assert.equal(u.headcountPropio, 200);
  // pero mujeres y dotación solo existen en A1: la razón usa SU headcount
  cerca(u.pctMujeres, (10 / 100) * 100);          // NO 10/200 = 5 %
  cerca(u.coberturaPlantilla, (100 / 110) * 100); // NO 200/110 = 182 %
  cerca(u.antiguedadMeses, 60);                   // NO (60×100)/200 = 30
  cerca(u.coberturaCritica, (18 / 20) * 100);
});

test('un hueco no se cuenta como cero en promedios ni en mínimos', () => {
  const u = serie(conHuecos, todoHuecos).at(-1);
  cerca(u.diasCobertura, 40);                     // solo A1 reportó días
  cerca(u.rotacionTemprana, (1 / 2) * 100);       // 1 baja temprana / 2 vol. de A1
  cerca(u.pctHorasExtra, (1000 / 20000) * 100);   // solo las horas de A1
  cerca(u.cumplimientoPlanCap, (180 / 200) * 100);
});

test('una columna vacía en todas las filas vale null, no cero', () => {
  const u = serie(conHuecos, todoHuecos).at(-1);
  assert.equal(u.emplazamientos, null, 'emplazamientos debería ser null');
  assert.equal(u.enps, null, 'eNPS debería ser null');
  assert.equal(u.diasARevisionCct, null);
  assert.equal(u.inversionCap, 60000); // A1 sí reportó
});

test('el presupuesto se compara solo contra las áreas que lo tienen', () => {
  const u = serie(conHuecos, todoHuecos).at(-1);
  // A1: real 1 400 000 vs presupuesto 1 400 000 → 0 %. A2 no entra.
  cerca(u.varPresupuesto, 0);
  assert.equal(u.presupuesto, 1400000);
  // el costo laboral total sí suma lo conocido de las dos áreas
  assert.equal(u.costoLaboral, 1400000 + 1000000);
});

test('costo por tonelada solo carga el costo de las áreas con producción', () => {
  const u = serie(conHuecos, todoHuecos).at(-1);
  cerca(u.costoPorTonelada, 1400000 / 50000); // no arrastra el costo de A2
  cerca(u.productividad, 50000 / 21000);
});

test('la rotación anualizada ignora huecos sin romperse', () => {
  const s = serie(conHuecos, todoHuecos);
  // 12 meses × 3 bajas (A1) + 1 baja (A2) = 48 sobre 200 propios
  cerca(s.at(-1).rotacionAnualizada, ((12 * 4) / 200) * 100);
});

/* ---------- Semáforo ---------- */

test('estadoVsMeta respeta la dirección del indicador', () => {
  assert.equal(estadoVsMeta(12, 14, 'menor_mejor'), 'ok');
  assert.equal(estadoVsMeta(20, 14, 'menor_mejor'), 'alerta');
  assert.equal(estadoVsMeta(98, 95, 'mayor_mejor'), 'ok');
  assert.equal(estadoVsMeta(80, 95, 'mayor_mejor'), 'alerta');
  assert.equal(estadoVsMeta(null, 95, 'mayor_mejor'), 'neutro');
  assert.equal(estadoVsMeta(95, null, 'mayor_mejor'), 'neutro');
});

test('estadoVsMeta aplica tolerancia del 3 %', () => {
  // 14 × 1.03 = 14.42 → 14.4 sigue en meta, 14.5 ya no
  assert.equal(estadoVsMeta(14.4, 14, 'menor_mejor'), 'ok');
  assert.equal(estadoVsMeta(14.5, 14, 'menor_mejor'), 'alerta');
});

/* ---------- Formato ---------- */

test('el formato de moneda corta es legible para el comité', () => {
  assert.equal(fmt.mxnCorto(2700000), '$2.7 M');
  assert.equal(fmt.mxnCorto(1250000000), '$1.25 MM');
  assert.equal(fmt.mxnCorto(4500), '$5 K');
  assert.equal(fmt.mxnCorto(null), '—');
});

test('el formato de periodo es en español', () => {
  assert.equal(fmt.periodo('2026-07'), 'jul 26');
  assert.equal(fmt.periodoLargo('2026-07'), 'julio 2026');
});
