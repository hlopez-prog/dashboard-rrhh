"""
Esquema único de verdad de la base de datos del Dashboard de RRHH.

Todo el modelo de datos vive aquí. `validate.py` valida los CSV contra este
esquema, `build.py` construye el JSON del dashboard y `seed_demo.py` genera
datos demo con esta misma estructura.

Convenciones:
  - periodo: 'YYYY-MM' (mes cerrado de nómina).
  - Montos en MXN nominales, sin decimales.
  - Horas en horas-hombre (HH).
  - tipo_relacion: 'Propio' | 'Contratista'.
"""

# --- Catálogos permitidos -------------------------------------------------
TIPOS_RELACION = ["Propio", "Contratista"]
TURNOS = ["7x7", "4x3", "14x14", "Administrativo"]
TIPOS_AREA = ["Mina", "Planta", "Mantenimiento", "Seguridad", "Administración"]
DIRECCION_META = ["menor_mejor", "mayor_mejor"]

# --- Definición de tablas -------------------------------------------------
# tipo: s=texto, i=entero, f=decimal, p=periodo YYYY-MM
TABLAS = {
    "dim_unidad": {
        "pk": ["unidad_id"],
        "columnas": {
            "unidad_id": "s",
            "unidad": "s",
            "estado": "s",
            "tipo_operacion": "s",
            "mineral_principal": "s",
            "es_corporativo": "i",
        },
    },
    "dim_area": {
        "pk": ["area_id"],
        "columnas": {
            "area_id": "s",
            "area": "s",
            "tipo_area": "s",
            "es_critica": "i",
        },
    },
    "fact_plantilla": {
        "pk": ["periodo", "unidad_id", "area_id", "tipo_relacion"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "area_id": "s",
            "tipo_relacion": "s",
            "turno": "s",
            "headcount": "i",
            "dotacion_autorizada": "i",
            "mujeres": "i",
            "antiguedad_prom_meses": "f",
            "puestos_criticos_totales": "i",
            "puestos_criticos_cubiertos": "i",
        },
    },
    "fact_movimientos": {
        "pk": ["periodo", "unidad_id", "area_id"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "area_id": "s",
            "altas": "i",
            "bajas_voluntarias": "i",
            "bajas_involuntarias": "i",
            "bajas_menos_90_dias": "i",
            "vacantes_abiertas": "i",
            "dias_cobertura_prom": "f",
        },
    },
    "fact_ausentismo": {
        "pk": ["periodo", "unidad_id", "area_id"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "area_id": "s",
            "horas_programadas": "f",
            "horas_ausencia": "f",
            "casos_incapacidad": "i",
            "dias_incapacidad": "i",
        },
    },
    "fact_nomina": {
        "pk": ["periodo", "unidad_id", "area_id"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "area_id": "s",
            "costo_ordinario": "f",
            "costo_horas_extra": "f",
            "costo_prestaciones": "f",
            "horas_ordinarias": "f",
            "horas_extra": "f",
            "presupuesto_costo_laboral": "f",
            "toneladas_movidas": "f",
        },
    },
    "fact_capacitacion": {
        "pk": ["periodo", "unidad_id", "area_id"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "area_id": "s",
            "horas_plan": "f",
            "horas_real": "f",
            "participantes": "i",
            "dc3_requeridos": "i",
            "dc3_emitidos": "i",
            "inversion_mxn": "f",
            "competencias_criticas_req": "i",
            "competencias_criticas_ok": "i",
        },
    },
    "fact_relaciones_laborales": {
        "pk": ["periodo", "unidad_id"],
        "columnas": {
            "periodo": "p",
            "unidad_id": "s",
            "sindicato": "s",
            "trabajadores_sindicalizados": "i",
            "emplazamientos": "i",
            "conflictos_abiertos": "i",
            "conflictos_cerrados": "i",
            "dias_a_revision_cct": "i",
            "riesgo_sindical": "i",
            "enps": "f",
            "participacion_clima": "f",
        },
    },
    "metas": {
        "pk": ["kpi"],
        "columnas": {
            "kpi": "s",
            "nombre": "s",
            "meta": "f",
            "direccion": "s",
            "unidad_medida": "s",
        },
    },
}

ORDEN_CARGA = [
    "dim_unidad",
    "dim_area",
    "fact_plantilla",
    "fact_movimientos",
    "fact_ausentismo",
    "fact_nomina",
    "fact_capacitacion",
    "fact_relaciones_laborales",
    "metas",
]

# Tablas con FK hacia las dimensiones
FKS = {
    "fact_plantilla": {"unidad_id": "dim_unidad", "area_id": "dim_area"},
    "fact_movimientos": {"unidad_id": "dim_unidad", "area_id": "dim_area"},
    "fact_ausentismo": {"unidad_id": "dim_unidad", "area_id": "dim_area"},
    "fact_nomina": {"unidad_id": "dim_unidad", "area_id": "dim_area"},
    "fact_capacitacion": {"unidad_id": "dim_unidad", "area_id": "dim_area"},
    "fact_relaciones_laborales": {"unidad_id": "dim_unidad"},
}

# Reglas de negocio: (tabla, descripción, función sobre la fila)
REGLAS = [
    ("fact_plantilla", "headcount no puede ser negativo", lambda r: r["headcount"] >= 0),
    ("fact_plantilla", "tipo_relacion debe estar en catálogo",
     lambda r: r["tipo_relacion"] in TIPOS_RELACION),
    ("fact_plantilla", "turno debe estar en catálogo", lambda r: r["turno"] in TURNOS),
    ("fact_plantilla", "puestos críticos cubiertos <= totales",
     lambda r: r["puestos_criticos_cubiertos"] <= r["puestos_criticos_totales"]),
    ("fact_ausentismo", "horas_ausencia <= horas_programadas",
     lambda r: r["horas_ausencia"] <= r["horas_programadas"]),
    ("fact_ausentismo", "horas_programadas > 0", lambda r: r["horas_programadas"] > 0),
    ("fact_nomina", "horas_ordinarias > 0", lambda r: r["horas_ordinarias"] > 0),
    ("fact_nomina", "costos no negativos",
     lambda r: min(r["costo_ordinario"], r["costo_horas_extra"], r["costo_prestaciones"]) >= 0),
    ("fact_capacitacion", "dc3_emitidos <= dc3_requeridos",
     lambda r: r["dc3_emitidos"] <= r["dc3_requeridos"]),
    ("fact_relaciones_laborales", "riesgo_sindical entre 1 y 5",
     lambda r: 1 <= r["riesgo_sindical"] <= 5),
    ("fact_relaciones_laborales", "enps entre -100 y 100",
     lambda r: -100 <= r["enps"] <= 100),
    ("dim_area", "tipo_area debe estar en catálogo", lambda r: r["tipo_area"] in TIPOS_AREA),
    ("metas", "direccion debe estar en catálogo", lambda r: r["direccion"] in DIRECCION_META),
]
