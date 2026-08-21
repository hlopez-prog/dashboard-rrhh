/*
 * Capa de datos: descarga dashboard.json (formato columnar), lo hidrata a
 * objetos y expone el almacén consultable.
 *
 * El JSON viene columnar ({columnas, filas}) para pesar ~50% menos; la
 * hidratación a objetos ocurre una sola vez al cargar.
 */

export function hidratar(tabla) {
  const { columnas, filas } = tabla;
  return filas.map((f) => {
    const o = {};
    for (let i = 0; i < columnas.length; i++) o[columnas[i]] = f[i];
    return o;
  });
}

export async function cargarDatos(url = 'data/dashboard.json') {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${r.status})`);
  return construirAlmacen(await r.json());
}

export function construirAlmacen(bruto) {
  const t = bruto.tablas;
  const almacen = {
    meta: bruto.meta,
    unidades: hidratar(t.unidad),
    areas: hidratar(t.area),
    plantilla: hidratar(t.plantilla),
    movimientos: hidratar(t.movimientos),
    ausentismo: hidratar(t.ausentismo),
    nomina: hidratar(t.nomina),
    capacitacion: hidratar(t.capacitacion),
    relaciones: hidratar(t.relaciones),
    metas: hidratar(t.metas),
  };

  almacen.unidadPorId = new Map(almacen.unidades.map((u) => [u.unidad_id, u]));
  almacen.areaPorId = new Map(almacen.areas.map((a) => [a.area_id, a]));
  almacen.metaPorKpi = new Map(almacen.metas.map((m) => [m.kpi, m]));
  almacen.periodos = [...new Set(almacen.plantilla.map((p) => p.periodo))].sort();

  return almacen;
}

/**
 * Filtro activo del dashboard.
 * @typedef {{unidades:Set<string>, tiposArea:Set<string>, periodos:string[]}} Filtro
 */

export function construirFiltro(almacen, { unidades, tiposArea, meses }) {
  const uni = unidades && unidades.size
    ? new Set(unidades)
    : new Set(almacen.unidades.map((u) => u.unidad_id));

  const tipos = tiposArea && tiposArea.size
    ? new Set(tiposArea)
    : new Set(almacen.areas.map((a) => a.tipo_area));

  const areas = new Set(
    almacen.areas.filter((a) => tipos.has(a.tipo_area)).map((a) => a.area_id),
  );

  const n = Number(meses) || almacen.periodos.length;
  const periodos = almacen.periodos.slice(-n);

  return {
    unidades: uni,
    tiposArea: tipos,
    areas,
    periodos,
    setPeriodos: new Set(periodos),
    /* Filtro por fila de tabla de hechos con unidad_id + area_id */
    pasa(f) {
      return this.unidades.has(f.unidad_id)
        && (f.area_id === undefined || this.areas.has(f.area_id))
        && this.setPeriodos.has(f.periodo);
    },
  };
}

export function aplicar(filas, filtro) {
  return filas.filter((f) => filtro.pasa(f));
}
