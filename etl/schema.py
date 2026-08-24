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
# Esquemas de turno reales de la operación. Se ampliaron en agosto 2026 con
# 14x7, 5x2 y 20x10, que aparecieron al cargar el primer cierre real: el
# catálogo original salió de los datos demo, no de la operación.
TURNOS = ["7x7", "4x3", "5x2", "14x7", "14x14", "20x10", "Administrativo"]
# Tipos de área de la operación. Ampliado en agosto 2026 con Exploración y
# Metalurgia, que existen en la estructura real de Minera Rio Tinto.
TIPOS_AREA = ["Mina", "Planta", "Metalurgia", "Exploración", "Mantenimiento", "Seguridad", "Administración"]
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

# --- Columnas que pueden venir sin dato ----------------------------------
# Regla para decidir: es OPCIONAL cuando su ausencia solo impide calcular el
# indicador que la usa; es OBLIGATORIA cuando sin ella la fila no significa
# nada — la llave, y la magnitud base de cada hoja.
#
# Una columna opcional vacía NO se convierte en cero. Un cero es una
# afirmación: "no hubo mujeres en esta área", "la antigüedad promedio es de
# cero meses". Vacío significa "no lo sabemos", y el tablero lo muestra como
# "—". Inventar ceros es la forma más rápida de que un tablero mienta.
OPCIONALES = {
    "fact_plantilla": {
        "turno", "dotacion_autorizada", "mujeres", "antiguedad_prom_meses",
        "puestos_criticos_totales", "puestos_criticos_cubiertos",
    },
    "fact_movimientos": {
        "bajas_menos_90_dias", "vacantes_abiertas", "dias_cobertura_prom",
    },
    "fact_ausentismo": {"casos_incapacidad", "dias_incapacidad"},
    "fact_nomina": {
        "costo_horas_extra", "costo_prestaciones", "horas_extra",
        "presupuesto_costo_laboral", "toneladas_movidas",
        # costo_ordinario y horas_ordinarias todavía no se capturan mes a
        # mes en nómina real (2026-08): se declaran opcionales para que el
        # resto de la hoja (presupuesto, toneladas) se publique ya. El día
        # que lleguen, basta llenar la celda; no hace falta tocar código.
        "costo_ordinario", "horas_ordinarias",
    },
    "fact_capacitacion": {
        "horas_plan", "participantes", "inversion_mxn",
        "competencias_criticas_req", "competencias_criticas_ok",
    },
    "fact_relaciones_laborales": {
        "emplazamientos", "conflictos_cerrados", "dias_a_revision_cct",
        "enps", "participacion_clima",
    },
    "dim_unidad": {"mineral_principal"},
}


def es_opcional(tabla, columna):
    return columna in OPCIONALES.get(tabla, ())


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

def _conocido(*valores):
    """True solo si todos los valores están presentes."""
    return all(v is not None and str(v).strip() != "" for v in valores)


# Reglas de negocio: (tabla, descripción, función sobre la fila).
# Una celda vacía no viola ninguna regla: su ausencia ya la reporta el paso
# de columnas obligatorias. Repetirla aquí duplicaría cada error y haría
# ver 800 problemas donde hay 400.
# Cada regla devuelve True cuando no puede evaluarse por falta de dato: una
# regla no evaluable no es una regla violada, y reportarla como error
# escondería los errores de verdad.
REGLAS = [
    ("fact_plantilla", "headcount no puede ser negativo", lambda r: not _conocido(r["headcount"]) or r["headcount"] >= 0),
    ("fact_plantilla", "tipo_relacion debe estar en catálogo",
     lambda r: not _conocido(r["tipo_relacion"]) or r["tipo_relacion"] in TIPOS_RELACION),
    ("fact_plantilla", "turno debe estar en catálogo", lambda r: not _conocido(r["turno"]) or r["turno"] in TURNOS),
    ("fact_plantilla", "puestos críticos cubiertos <= totales",
     lambda r: (not _conocido(r["puestos_criticos_cubiertos"],
                         r["puestos_criticos_totales"])
                or r["puestos_criticos_cubiertos"] <= r["puestos_criticos_totales"])),
    ("fact_ausentismo", "horas_ausencia <= horas_programadas",
     lambda r: (not _conocido(r["horas_ausencia"], r["horas_programadas"])
                or r["horas_ausencia"] <= r["horas_programadas"])),
    ("fact_ausentismo", "horas_programadas > 0", lambda r: not _conocido(r["horas_programadas"]) or r["horas_programadas"] > 0),
    ("fact_nomina", "horas_ordinarias > 0", lambda r: not _conocido(r["horas_ordinarias"]) or r["horas_ordinarias"] > 0),
    ("fact_nomina", "costos no negativos",
     lambda r: all(v >= 0 for v in (r["costo_ordinario"], r["costo_horas_extra"],
                                     r["costo_prestaciones"]) if _conocido(v))),
    ("fact_capacitacion", "dc3_emitidos <= dc3_requeridos",
     lambda r: (not _conocido(r["dc3_emitidos"], r["dc3_requeridos"])
                or r["dc3_emitidos"] <= r["dc3_requeridos"])),
    ("fact_relaciones_laborales", "riesgo_sindical entre 1 y 5",
     lambda r: not _conocido(r["riesgo_sindical"]) or 1 <= r["riesgo_sindical"] <= 5),
    ("fact_relaciones_laborales", "enps entre -100 y 100",
     lambda r: not _conocido(r["enps"]) or -100 <= r["enps"] <= 100),
    ("dim_area", "tipo_area debe estar en catálogo",
     lambda r: not _conocido(r["tipo_area"]) or r["tipo_area"] in TIPOS_AREA),
    ("metas", "direccion debe estar en catálogo",
     lambda r: not _conocido(r["direccion"]) or r["direccion"] in DIRECCION_META),
]
