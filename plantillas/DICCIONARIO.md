# Diccionario de datos — Dashboard de RRHH

Generado por `etl/plantillas.py` a partir de `etl/schema.py`. No editar a mano.

Reglas generales:

- `periodo` siempre en formato `YYYY-MM` y sin meses faltantes en la serie.
- Montos en MXN nominales, sin signo de pesos ni separador de miles.
- Decimales con punto, no con coma.
- Una sola fila por combinación de llave primaria (se indica en cada tabla).
- Archivos en UTF-8. Si Excel los guarda con BOM, el validador lo tolera.

## `dim_unidad.csv`

Llave primaria: `unidad_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `unidad` | texto | Nombre de la unidad como se reporta al comité. |
| `estado` | texto | Estado de la República donde opera la unidad. |
| `tipo_operacion` | texto | Subterránea, Cielo abierto, Planta o Corporativo. |
| `mineral_principal` | texto | Mineral principal de la unidad. |
| `es_corporativo` | entero | 1 si es oficina corporativa, 0 si es unidad operativa. |

## `dim_area.csv`

Llave primaria: `area_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `area` | texto | Nombre del área o departamento. |
| `tipo_area` | texto | Uno de: Mina, Planta, Mantenimiento, Seguridad, Administración. |
| `es_critica` | entero | 1 si el área sostiene continuidad operacional, 0 si no. |

Reglas validadas en CI:

- tipo_area debe estar en catálogo

## `fact_plantilla.csv`

Llave primaria: `periodo`, `unidad_id`, `area_id`, `tipo_relacion`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `tipo_relacion` | texto | Uno de: Propio, Contratista. |
| `turno` | texto | Esquema de turno. Uno de: 7x7, 4x3, 14x14, Administrativo. |
| `headcount` | entero | Personas activas al último día del mes. |
| `dotacion_autorizada` | entero | Plazas autorizadas. Solo para plantilla propia; 0 en contratistas. |
| `mujeres` | entero | Personas mujeres incluidas en headcount. |
| `antiguedad_prom_meses` | decimal | Antigüedad promedio en meses del headcount reportado. |
| `puestos_criticos_totales` | entero | Plazas clasificadas como críticas en el área. |
| `puestos_criticos_cubiertos` | entero | Plazas críticas efectivamente ocupadas. Nunca mayor al total. |

Reglas validadas en CI:

- headcount no puede ser negativo
- tipo_relacion debe estar en catálogo
- turno debe estar en catálogo
- puestos críticos cubiertos <= totales

## `fact_movimientos.csv`

Llave primaria: `periodo`, `unidad_id`, `area_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `altas` | entero | Ingresos del mes a plantilla propia. |
| `bajas_voluntarias` | entero | Renuncias del mes. |
| `bajas_involuntarias` | entero | Rescisiones, terminaciones y bajas por la empresa. |
| `bajas_menos_90_dias` | entero | Bajas voluntarias con menos de 90 días de antigüedad. |
| `vacantes_abiertas` | entero | Plazas autorizadas sin cubrir al cierre del mes. |
| `dias_cobertura_prom` | decimal | Días promedio entre requisición y alta (time-to-fill). |

## `fact_ausentismo.csv`

Llave primaria: `periodo`, `unidad_id`, `area_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `horas_programadas` | decimal | Horas hombre programadas en el mes. Debe ser mayor a cero. |
| `horas_ausencia` | decimal | Horas no laboradas por ausencia. Nunca mayor a las programadas. |
| `casos_incapacidad` | entero | Casos de incapacidad iniciados en el mes. |
| `dias_incapacidad` | entero | Días de incapacidad acumulados en el mes. |

Reglas validadas en CI:

- horas_ausencia <= horas_programadas
- horas_programadas > 0

## `fact_nomina.csv`

Llave primaria: `periodo`, `unidad_id`, `area_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `costo_ordinario` | decimal | Sueldo ordinario devengado del mes, en MXN. |
| `costo_horas_extra` | decimal | Costo de tiempo extraordinario del mes, en MXN. |
| `costo_prestaciones` | decimal | Prestaciones y carga social del mes, en MXN. |
| `horas_ordinarias` | decimal | Horas hombre ordinarias del mes. |
| `horas_extra` | decimal | Horas hombre extraordinarias del mes. |
| `presupuesto_costo_laboral` | decimal | Presupuesto autorizado de costo laboral del mes, en MXN. |
| `toneladas_movidas` | decimal | Toneladas atribuibles al área. 0 en áreas sin producción. |

Reglas validadas en CI:

- horas_ordinarias > 0
- costos no negativos

## `fact_capacitacion.csv`

Llave primaria: `periodo`, `unidad_id`, `area_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `area_id` | texto | Clave del área. Debe existir en dim_area. |
| `horas_plan` | decimal | Horas hombre de capacitación planeadas para el mes. |
| `horas_real` | decimal | Horas hombre de capacitación ejecutadas. |
| `participantes` | entero | Personas distintas que asistieron a capacitación. |
| `dc3_requeridos` | entero | Constancias DC-3 requeridas por normativa. |
| `dc3_emitidos` | entero | Constancias DC-3 emitidas. Nunca mayor a las requeridas. |
| `inversion_mxn` | decimal | Inversión en capacitación del mes, en MXN. |
| `competencias_criticas_req` | entero | Competencias críticas que la matriz exige cubrir. |
| `competencias_criticas_ok` | entero | Competencias críticas acreditadas. |

Reglas validadas en CI:

- dc3_emitidos <= dc3_requeridos

## `fact_relaciones_laborales.csv`

Llave primaria: `periodo`, `unidad_id`

| Columna | Tipo | Descripción |
|---|---|---|
| `periodo` | periodo (YYYY-MM) | Mes cerrado de nómina en formato YYYY-MM. |
| `unidad_id` | texto | Clave de la unidad minera. Debe existir en dim_unidad. |
| `sindicato` | texto | Nombre del sindicato titular del CCT. |
| `trabajadores_sindicalizados` | entero | Personas de plantilla propia bajo el CCT. |
| `emplazamientos` | entero | Emplazamientos a huelga notificados en el mes. |
| `conflictos_abiertos` | entero | Conflictos laborales individuales o colectivos vigentes. |
| `conflictos_cerrados` | entero | Conflictos resueltos en el mes. |
| `dias_a_revision_cct` | entero | Días a la próxima revisión salarial o de CCT. 0 si no aplica. |
| `riesgo_sindical` | entero | Escala 1 a 5 evaluada por Relaciones Laborales. |
| `enps` | decimal | eNPS de la unidad, de -100 a 100. |
| `participacion_clima` | decimal | Proporción de participación en la encuesta, de 0 a 1. |

Reglas validadas en CI:

- riesgo_sindical entre 1 y 5
- enps entre -100 y 100

## `metas.csv`

Llave primaria: `kpi`

| Columna | Tipo | Descripción |
|---|---|---|
| `kpi` | texto | Identificador del KPI usado por el dashboard. No cambiar. |
| `nombre` | texto | Nombre legible del KPI. |
| `meta` | decimal | Valor de la meta anual autorizada. |
| `direccion` | texto | Uno de: menor_mejor, mayor_mejor. |
| `unidad_medida` | texto | Unidad en que se expresa la meta (%, días, MXN/t, etc.). |

Reglas validadas en CI:

- direccion debe estar en catálogo
