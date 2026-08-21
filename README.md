# Dashboard de RRHH — Minera Rio Tinto

Tablero de indicadores de Recursos Humanos para operación minera multi-unidad.
Se alimenta de una base de datos versionada en este repositorio y se publica
solo si los datos pasan validación.

| | |
|---|---|
| **Alcance** | Corporativo + unidades mineras, con jerarquía unidad → área → turno |
| **Módulos** | Plantilla, rotación y ausentismo · Nómina, costo laboral y productividad · Capacitación, competencias y relaciones laborales |
| **Base de datos** | Libro de Excel `data/BASE_RRHH.xlsx` — una hoja por tabla |
| **Publicación** | GitHub Pages, automática en cada `push` a `main` |
| **Dependencias en runtime** | Ninguna. SVG y JavaScript nativo, sin CDN |

---

## Cómo se actualiza el tablero

```
data/BASE_RRHH.xlsx  →  etl/validate.py  →  etl/build.py  →  dashboard.json  →  GitHub Pages
   (Excel, RRHH)          (¿datos sanos?)         │           (lo lee el tablero)
                                                  └──────→  data/csv/*.csv
                                                            (diff legible en git)
```

1. RRHH captura el cierre del mes en **`data/BASE_RRHH.xlsx`**: una hoja por
   tabla, con listas desplegables y hoja de instrucciones incluidas.
2. Sube el libro al repositorio. Basta arrastrarlo en la interfaz web de GitHub:
   cuenta como commit.
3. GitHub Actions lee el libro y valida encabezados, tipos, llaves primarias,
   integridad referencial, catálogos y reglas de negocio; luego corre los tests
   de KPI y las pruebas end-to-end.
4. Si todo pasa, exporta `data/csv/` para dejar el cambio auditable, reconstruye
   `dashboard.json` y publica.
5. **Si la validación falla, el despliegue se detiene.** El error señala la hoja
   y la fila del libro, y el tablero conserva el cierre anterior. Es preferible
   un dato viejo a un dato equivocado en comité.

No hay servidor ni base de datos administrada. La fuente de verdad es un archivo
de Excel versionado en git, con historial y autoría de cada cierre.

### ¿Por qué también hay CSV, si la base es Excel?

Un `.xlsx` es un archivo binario: git puede guardarlo, pero no puede mostrar
*qué cambió adentro*. El export automático a `data/csv/` resuelve eso — el diff
del cierre mensual queda legible línea por línea en GitHub, y se puede auditar
quién cambió qué número y cuándo. Nadie edita esos CSV a mano: se regeneran en
cada build a partir del libro.

---

## Estructura

```
dashboard-rrhh/
├── data/
│   ├── BASE_RRHH.xlsx           LA BASE DE DATOS — esto es lo que edita RRHH
│   │                            LEEME · dim_unidad · dim_area · fact_plantilla
│   │                            fact_movimientos · fact_ausentismo · fact_nomina
│   │                            fact_capacitacion · fact_relaciones_laborales · metas
│   └── csv/                     export automático, para diff legible en git
├── etl/
│   ├── schema.py                ÚNICA definición del modelo de datos
│   ├── excel.py                 crea y lee el libro de Excel
│   ├── cargar.py                precedencia de fuente: Excel, luego CSV
│   ├── validate.py              validación que corre en CI
│   ├── build.py                 construye public/data/dashboard.json
│   ├── standalone.py            arma el HTML de un solo archivo
│   ├── seed_demo.py             genera la base demo determinista
│   └── plantillas.py            genera plantillas/ y el diccionario de datos
├── public/                      el sitio que se publica
│   ├── index.html
│   ├── assets/styles.css        sistema visual institucional
│   └── assets/js/
│       ├── datos.js             descarga e hidratación del JSON
│       ├── kpi.js               ÚNICA definición de cada fórmula de KPI
│       ├── graficos.js          primitivas SVG y paleta de series
│       ├── matriz.js            matriz ejecutiva para comité
│       ├── util.js              formato, semáforo, helpers de DOM
│       └── app.js               filtros, paneles y render
├── plantillas/                  CSV vacíos + DICCIONARIO.md
├── INSTALACION_GITHUB.md        guía de instalación paso a paso
├── GUIA_VISUAL_GITHUB.html      la misma guía con maquetas de cada pantalla
├── tests/
│   ├── test_datos.py            lectura del libro y captura de errores reales
│   ├── kpi.test.mjs             fórmulas verificadas con casos a mano
│   └── e2e.mjs                  render, filtros, colores, tooltips
└── .github/workflows/deploy.yml
```

---

## Correr en local

Requiere Python 3 con `openpyxl` (`pip install openpyxl`) y Node 22 para las
pruebas.

```bash
python3 etl/build.py                          # lee el Excel, valida, construye
python3 -m http.server 8000 --directory public
# abrir http://localhost:8000
```

Se necesita servir por HTTP: los módulos ES no cargan desde `file://`.

Regenerar el dataset de demostración desde cero:

```bash
python3 etl/seed_demo.py      # escribe data/csv/
python3 etl/excel.py crear    # arma data/BASE_RRHH.xlsx con esos datos
```

Pruebas:

```bash
python3 -m unittest discover -s tests   # lectura del Excel y validador
node --test "tests/**/*.test.mjs"       # fórmulas de KPI
node tests/e2e.mjs --capturas           # interfaz en Chromium, guarda PNG
```

### Versión de un solo archivo

```bash
python3 etl/standalone.py            # dist/dashboard-rrhh.html
```

Empaqueta CSS, JavaScript y datos en un HTML autocontenido: se abre con doble
clic, sin servidor y sin red. Sirve para revisar el cierre en sitio o mandarlo
por correo. Es una foto del mes en que se generó — la versión de GitHub Pages
es la que se actualiza sola.

---

## Seguridad de los datos

**Si el repositorio es público, no cargues datos reales de RRHH.** Un repo
público expone los CSV y el historial completo a cualquiera en internet, y
borrar un archivo no lo borra del historial de git.

| Situación | Qué puedes cargar |
|---|---|
| Repo **público** (plan gratuito) | Solo los datos demo sintéticos |
| Repo **privado** (GitHub Team o superior) | Datos reales agregados. El sitio publicado sigue teniendo URL pública, aunque no indexada |
| Repo privado + **Enterprise Cloud** | Datos reales, con el sitio restringido a miembros de la organización |

El modelo de datos ya está diseñado para reducir la exposición: todo está
agregado por unidad, área y mes. **No hay un solo registro por persona, ni
nombre, ni número de empleado, ni salario individual.** Mantenlo así — es la
diferencia entre un tablero de gestión y una base de datos personales sujeta
a la LFPDPPP.

Para migrar de público a privado más adelante: *Settings → General → Danger
Zone → Change repository visibility*. Si alcanzaste a subir datos reales a un
repo público, no basta con hacerlo privado: crea un repositorio nuevo y sube
solo el estado actual, sin historial.

---

## Puesta en marcha en GitHub

1. Crear el repositorio y subir este contenido a `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push a `main`. El workflow valida, construye y publica.
4. La URL queda en la pestaña Actions, en el resumen del job *Publicar*.

Para cargar los datos reales:

1. Abrir `data/BASE_RRHH.xlsx`.
2. En la hoja **LEEME**, cambiar la celda **Origen de los datos** de `DEMO` a
   `REAL`. Eso retira el aviso naranja del tablero.
3. Reemplazar el contenido de las hojas de datos con el cierre real.
4. Subir el libro al repositorio.

Verificar antes de subir, si tienes Python a mano:

```bash
python3 etl/build.py    # falla con la hoja y la fila si algo está mal
```

---

## Indicadores

Definiciones completas en `public/assets/js/kpi.js`. Reglas transversales:

- **Todas las tasas de rotación se calculan sobre plantilla propia.** Los
  contratistas se reportan aparte, como proporción de la fuerza total.
- **"Anualizada" es ventana móvil de 12 meses**: bajas de los últimos 12 meses
  sobre headcount propio promedio de esos 12 meses. No es el mes multiplicado
  por doce. Los primeros 11 meses de la serie no publican valor: devuelven
  vacío en lugar de un número calculado con historia incompleta.
- **Costo laboral** = ordinario + horas extra + prestaciones.
- **Ausentismo** = horas de ausencia / horas programadas.
- El semáforo aplica **3 % de tolerancia** sobre la meta antes de marcar
  desviación, para no encender alertas por ruido de redondeo.

### Plantilla, rotación y ausentismo

Fuerza laboral total · plantilla propia · % contratistas · cobertura de
plantilla autorizada · rotación anualizada, voluntaria y temprana (<90 días) ·
cobertura de puestos críticos · ausentismo · días para cubrir vacante ·
vacantes abiertas · antigüedad promedio.

### Nómina, costo laboral y productividad

Costo laboral del mes · variación vs presupuesto · % y costo de horas extra ·
costo laboral por tonelada · productividad (t/HH) · costo por empleado ·
toneladas movidas.

### Capacitación, competencias y relaciones laborales

Cumplimiento del plan de capacitación · cumplimiento DC-3 · horas por persona ·
cobertura de la matriz de competencias · inversión por persona · eNPS ·
% de sindicalización · conflictos abiertos · riesgo sindical · días a revisión
de CCT.

---

## Sistema visual

Paleta institucional definida por la Dirección:

| Uso | Color |
|---|---|
| Encabezados de tabla, texto blanco | `#000000` |
| Objetivo primario · Éxito a 6 meses · en meta | `#D9EAD3` |
| Dependencia crítica · Riesgo principal · fuera de meta | `#FCE5CD` |
| Banner de título · celdas de relaciones y riesgos | `#F2F2F2` |

Los pasteles verde y naranja son **rellenos semánticos**: significan "en meta" y
"riesgo". Por eso no identifican series de gráfico — el mismo color no puede
significar dos cosas en el mismo tablero. Las series usan una paleta aparte,
validada para daltonismo sobre superficie blanca:

```
#2A78D6  #B45F06  #1BAF7A  #7D3C98  #EDA100
separación CVD del peor par adyacente ΔE 12.0 · visión normal ΔE 24.2
```

Dos consecuencias de diseño que conviene no deshacer:

- **El estado nunca se comunica solo por color.** Cada tarjeta y cada celda de
  semáforo lleva icono (`●` en meta, `▲` fuera de meta, `–` sin meta) y
  etiqueta con el valor de la meta.
- **Cada gráfico tiene botón "Ver tabla".** Dos colores de la paleta quedan por
  debajo de 3:1 de contraste sobre blanco; la tabla y las etiquetas directas son
  la vía de lectura alterna obligatoria.

El orden de color sigue a la unidad en `dim_unidad`, no a su posición en el
ranking: filtrar unidades no repinta las que quedan.

---

## Extender el tablero

**Agregar una columna a una tabla existente**

1. Añadirla en `etl/schema.py` (`TABLAS[...]["columnas"]`), al final para no
   romper los datos ya capturados.
2. Agregar la regla de negocio en `schema.REGLAS` si aplica.
3. Regenerar el libro y las plantillas:
   `python3 etl/excel.py crear && python3 etl/plantillas.py`.
4. Acumularla en `crudosPorPeriodo` y derivarla en `derivar` (`kpi.js`).

La columna nueva aparece en la hoja correspondiente del libro, con su formato y
su validación. El orden de las columnas del libro debe coincidir con el esquema:
por eso se agregan al final.

**Agregar un KPI**

1. Derivarlo en `derivar()` de `kpi.js`.
2. Registrarlo en `CATALOGO` del módulo correspondiente.
3. Agregar su meta en la hoja `metas` del libro, con `direccion` correcta.
4. Agregar el caso a `tests/kpi.test.mjs` — con números verificables a mano.

**Agregar una unidad minera**

Una fila en la hoja `dim_unidad` y sus filas de hechos. La clave nueva aparece
sola en los desplegables de las demás hojas, y la unidad aparece sola en
filtros, gráficos y matriz. Con más de cinco unidades conviene revisar la paleta: hay
cinco slots validados, y un sexto color exige volver a correr el validador de
la paleta, no inventar un tono.

---

## Notas

- El dataset incluido es **sintético**. La celda *Origen de los datos* de la
  hoja LEEME (`DEMO`) enciende el aviso en el tablero; se cambia a `REAL` al
  cargar datos de la operación.
- Los datos son agregados por unidad, área y mes: el repositorio no contiene
  información personal identificable, y no debería contenerla.
- El tablero calcula en el navegador. Con más de ~50 unidades-área × 60 meses
  conviene mover la agregación a `build.py`.
