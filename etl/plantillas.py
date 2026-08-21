"""
Genera las plantillas de carga vacías a partir del esquema.

    python3 etl/plantillas.py

Escribe en plantillas/:
  - un CSV por tabla, solo con los encabezados en el orden exacto que espera
    el validador (útil para exportar desde un ERP)
  - DICCIONARIO.md con el tipo, la descripción y la regla de cada columna

La plantilla principal de captura es el propio libro data/BASE_RRHH.xlsx: ya
trae las hojas, los encabezados y las listas desplegables. Estos CSV son el
respaldo para quien prefiera exportar de un sistema.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "plantillas")

TIPO_LEGIBLE = {
    "s": "texto",
    "i": "entero",
    "f": "decimal",
    "p": "periodo (YYYY-MM)",
}

DESCRIPCIONES = {
    "unidad_id": "Clave de la unidad minera. Debe existir en dim_unidad.",
    "unidad": "Nombre de la unidad como se reporta al comité.",
    "estado": "Estado de la República donde opera la unidad.",
    "tipo_operacion": "Subterránea, Cielo abierto, Planta o Corporativo.",
    "mineral_principal": "Mineral principal de la unidad.",
    "es_corporativo": "1 si es oficina corporativa, 0 si es unidad operativa.",
    "area_id": "Clave del área. Debe existir en dim_area.",
    "area": "Nombre del área o departamento.",
    "tipo_area": f"Uno de: {', '.join(schema.TIPOS_AREA)}.",
    "es_critica": "1 si el área sostiene continuidad operacional, 0 si no.",
    "periodo": "Mes cerrado de nómina en formato YYYY-MM.",
    "tipo_relacion": f"Uno de: {', '.join(schema.TIPOS_RELACION)}.",
    "turno": f"Esquema de turno. Uno de: {', '.join(schema.TURNOS)}.",
    "headcount": "Personas activas al último día del mes.",
    "dotacion_autorizada": "Plazas autorizadas. Solo para plantilla propia; 0 en contratistas.",
    "mujeres": "Personas mujeres incluidas en headcount.",
    "antiguedad_prom_meses": "Antigüedad promedio en meses del headcount reportado.",
    "puestos_criticos_totales": "Plazas clasificadas como críticas en el área.",
    "puestos_criticos_cubiertos": "Plazas críticas efectivamente ocupadas. Nunca mayor al total.",
    "altas": "Ingresos del mes a plantilla propia.",
    "bajas_voluntarias": "Renuncias del mes.",
    "bajas_involuntarias": "Rescisiones, terminaciones y bajas por la empresa.",
    "bajas_menos_90_dias": "Bajas voluntarias con menos de 90 días de antigüedad.",
    "vacantes_abiertas": "Plazas autorizadas sin cubrir al cierre del mes.",
    "dias_cobertura_prom": "Días promedio entre requisición y alta (time-to-fill).",
    "horas_programadas": "Horas hombre programadas en el mes. Debe ser mayor a cero.",
    "horas_ausencia": "Horas no laboradas por ausencia. Nunca mayor a las programadas.",
    "casos_incapacidad": "Casos de incapacidad iniciados en el mes.",
    "dias_incapacidad": "Días de incapacidad acumulados en el mes.",
    "costo_ordinario": "Sueldo ordinario devengado del mes, en MXN.",
    "costo_horas_extra": "Costo de tiempo extraordinario del mes, en MXN.",
    "costo_prestaciones": "Prestaciones y carga social del mes, en MXN.",
    "horas_ordinarias": "Horas hombre ordinarias del mes.",
    "horas_extra": "Horas hombre extraordinarias del mes.",
    "presupuesto_costo_laboral": "Presupuesto autorizado de costo laboral del mes, en MXN.",
    "toneladas_movidas": "Toneladas atribuibles al área. 0 en áreas sin producción.",
    "horas_plan": "Horas hombre de capacitación planeadas para el mes.",
    "horas_real": "Horas hombre de capacitación ejecutadas.",
    "participantes": "Personas distintas que asistieron a capacitación.",
    "dc3_requeridos": "Constancias DC-3 requeridas por normativa.",
    "dc3_emitidos": "Constancias DC-3 emitidas. Nunca mayor a las requeridas.",
    "inversion_mxn": "Inversión en capacitación del mes, en MXN.",
    "competencias_criticas_req": "Competencias críticas que la matriz exige cubrir.",
    "competencias_criticas_ok": "Competencias críticas acreditadas.",
    "sindicato": "Nombre del sindicato titular del CCT.",
    "trabajadores_sindicalizados": "Personas de plantilla propia bajo el CCT.",
    "emplazamientos": "Emplazamientos a huelga notificados en el mes.",
    "conflictos_abiertos": "Conflictos laborales individuales o colectivos vigentes.",
    "conflictos_cerrados": "Conflictos resueltos en el mes.",
    "dias_a_revision_cct": "Días a la próxima revisión salarial o de CCT. 0 si no aplica.",
    "riesgo_sindical": "Escala 1 a 5 evaluada por Relaciones Laborales.",
    "enps": "eNPS de la unidad, de -100 a 100.",
    "participacion_clima": "Proporción de participación en la encuesta, de 0 a 1.",
    "kpi": "Identificador del KPI usado por el dashboard. No cambiar.",
    "nombre": "Nombre legible del KPI.",
    "meta": "Valor de la meta anual autorizada.",
    "direccion": f"Uno de: {', '.join(schema.DIRECCION_META)}.",
    "unidad_medida": "Unidad en que se expresa la meta (%, días, MXN/t, etc.).",
}


def main():
    os.makedirs(DESTINO, exist_ok=True)
    lineas = [
        "# Diccionario de datos — Dashboard de RRHH",
        "",
        "Generado por `etl/plantillas.py` a partir de `etl/schema.py`. No editar a mano.",
        "",
        "Reglas generales:",
        "",
        "- `periodo` siempre en formato `YYYY-MM` y sin meses faltantes en la serie.",
        "- Montos en MXN nominales, sin signo de pesos ni separador de miles.",
        "- Decimales con punto, no con coma.",
        "- Una sola fila por combinación de llave primaria (se indica en cada tabla).",
        "- Archivos en UTF-8. Si Excel los guarda con BOM, el validador lo tolera.",
        "",
    ]

    for tabla in schema.ORDEN_CARGA:
        definicion = schema.TABLAS[tabla]
        columnas = list(definicion["columnas"].keys())
        ruta = os.path.join(DESTINO, f"{tabla}.csv")
        with open(ruta, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(columnas)

        lineas.append(f"## `{tabla}.csv`")
        lineas.append("")
        lineas.append(f"Llave primaria: {', '.join(f'`{c}`' for c in definicion['pk'])}")
        lineas.append("")
        lineas.append("| Columna | Tipo | Descripción |")
        lineas.append("|---|---|---|")
        for c in columnas:
            tipo = TIPO_LEGIBLE[definicion["columnas"][c]]
            lineas.append(f"| `{c}` | {tipo} | {DESCRIPCIONES.get(c, '')} |")
        lineas.append("")

        reglas = [d for t, d, _ in schema.REGLAS if t == tabla]
        if reglas:
            lineas.append("Reglas validadas en CI:")
            lineas.append("")
            for d in reglas:
                lineas.append(f"- {d}")
            lineas.append("")

        print(f"  plantillas/{tabla}.csv")

    with open(os.path.join(DESTINO, "DICCIONARIO.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    print("  plantillas/DICCIONARIO.md")


if __name__ == "__main__":
    main()
