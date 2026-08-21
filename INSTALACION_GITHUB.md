# Instalación en GitHub — paso a paso

Guía para **repositorio público en plan gratuito**, cargando todo **desde el
navegador**, sin instalar git ni usar terminal.

Tiempo estimado: 15 minutos la primera vez.

---

## Antes de empezar: lee esto

Un repositorio público expone los archivos y **todo el historial** a cualquiera
en internet. Borrar un archivo después no lo borra del historial.

> **Con esta configuración, carga únicamente el libro con los datos demo
> sintéticos que ya viene incluido. No subas el cierre real de nómina, plantilla
> ni relaciones laborales de Minera Rio Tinto.**

Cuando quieras cargar datos reales necesitas repositorio privado, y eso requiere
**GitHub Team** o superior. La sección final de esta guía explica cómo migrar.

Nota: aun con datos reales, el modelo está diseñado para que no haya un registro
por persona — todo va agregado por unidad, área y mes. Sin nombres, sin número
de empleado, sin salarios individuales. Mantenlo así.

---

## Paso 1 · Descomprimir el paquete

Descomprime `dashboard-rrhh-github.zip`. Debe quedarte una carpeta
`dashboard-rrhh` con este contenido:

```
data/        ← aquí vive BASE_RRHH.xlsx, la base de datos
etl/         plantillas/    public/       tests/
README.md    INSTALACION_GITHUB.md       package.json
deploy.yml   ← este archivo se usa en el Paso 4, no se arrastra en el Paso 3
```

Dentro de `data/` está **`BASE_RRHH.xlsx`**: ese archivo *es* la base de datos
del tablero. Ábrelo un momento para conocerlo — trae una hoja `LEEME` con
instrucciones y una hoja por cada tabla.

Déjala abierta en una ventana del explorador de archivos. La vas a necesitar.

---

## Paso 2 · Crear el repositorio

1. Entra a **https://github.com** e inicia sesión.
   Si no tienes cuenta: **Sign up**, es gratuita.
2. Arriba a la derecha, botón **+** → **New repository**.
3. Llena así:

   | Campo | Valor |
   |---|---|
   | **Owner** | tu usuario (o la organización de Minera Rio Tinto si ya existe) |
   | **Repository name** | `dashboard-rrhh` |
   | **Description** | `Dashboard de RRHH para operación minera multi-unidad` |
   | **Visibilidad** | **Public** |
   | Add a README file | **dejar SIN marcar** |
   | Add .gitignore | **None** |
   | Choose a license | **None** |

   Dejar el README sin marcar importa: así GitHub te lleva directo a la
   pantalla de carga y no tienes que resolver un conflicto después.

4. **Create repository**.

Vas a caer en una pantalla que dice *"Quick setup"*. No cierres esta pestaña.

---

## Paso 3 · Subir los archivos

1. En esa pantalla, busca la frase *"…or **uploading an existing file**"* y haz
   clic en **uploading an existing file**.

2. Ve a la ventana del explorador donde tienes la carpeta `dashboard-rrhh`
   descomprimida. **Entra a la carpeta** y selecciona todo su contenido:

   - `data`, `etl`, `plantillas`, `public`, `tests` (las carpetas)
   - `README.md`, `INSTALACION_GITHUB.md`, `package.json`

   La carpeta `data` lleva adentro el libro `BASE_RRHH.xlsx` y la subcarpeta
   `csv`. Se sube tal cual, no hay que abrirla.

   Con `Ctrl+A` (Windows) o `Cmd+A` (Mac) seleccionas todo de una vez.

   > **Importante:** selecciona el *contenido* de la carpeta, no la carpeta
   > `dashboard-rrhh` completa. Si arrastras la carpeta entera, todo queda un
   > nivel más abajo y el tablero no encuentra sus archivos.
   >
   > **No arrastres `deploy.yml`.** Ese va aparte, en el Paso 4.

3. Arrástralos a la zona que dice *"Drag files here to add them to your
   repository"*.

4. Espera a que termine de listar los archivos. Deben aparecer **43 archivos**,
   incluido `data/BASE_RRHH.xlsx`. Si ves muchos menos, vuelve a arrastrar:
   probablemente soltaste antes de que el navegador terminara de leer las
   subcarpetas.

5. Abajo, en **Commit changes**, escribe:

   ```
   Carga inicial del Dashboard de RRHH
   ```

6. Botón verde **Commit changes**.

---

## Paso 4 · Crear el archivo de automatización

Este es el paso que la gente se salta y por el que después "no pasa nada". El
archivo vive en una carpeta oculta (`.github`), y los navegadores no suben
carpetas ocultas de forma confiable. Por eso se crea a mano.

### Si el enlace directo te da 404

Prueba abrir solo el repositorio, sin nada más:
`https://github.com/TU-USUARIO/dashboard-rrhh`

| ¿Qué pasó? | Qué significa |
|---|---|
| **También da 404** | El usuario o el nombre del repositorio no coinciden. Abre tu foto de perfil → **Your repositories** y copia el nombre exacto. Y verifica que el usuario sea tu *nombre de usuario* (el de la URL de tu perfil), no tu nombre para mostrar |
| **Sí abre, pero está vacío** | No existe la rama `main`: un repositorio sin archivos no tiene ramas, así que cualquier URL que termine en `/main` da 404. El **Paso 3 no se completó**. Vuelve a subir los archivos |
| **Abre y ya tiene archivos** | Revisa el nombre de la rama en el selector de la pestaña **Code**. Si dice `master` en vez de `main`, ajusta las URL |

En cualquier caso, la ruta por menú funciona siempre y no depende de la URL:
**pestaña Code → botón `Add file ▾` → Create new file**. El botón está en la
misma barra del selector de rama, a la izquierda del botón verde `Code`.

### Los pasos

1. En la página principal de tu repositorio: **Add file** → **Create new file**.

2. En el campo del nombre del archivo, escribe **exactamente** esto:

   ```
   .github/workflows/deploy.yml
   ```

   Al escribir cada `/`, GitHub va creando las carpetas solo. Cuando termines
   verás las carpetas dibujadas arriba del campo.

3. Abre el archivo **`deploy.yml`** que viene en el paquete (con Notepad,
   TextEdit o cualquier editor de texto), selecciona **todo** su contenido,
   cópialo y pégalo en el editor grande de GitHub.

   > Pega el contenido tal cual. El formato YAML es sensible a los espacios al
   > inicio de cada línea: no lo reindentes ni lo "acomodes".

4. Abajo, en **Commit changes…**, escribe `Agrega automatización de publicación`
   y confirma con **Commit changes**.

Al guardar, GitHub arranca la primera corrida automáticamente.

---

## Paso 5 · Activar GitHub Pages

1. En tu repositorio: pestaña **Settings** (engrane, arriba a la derecha).
2. Menú izquierdo: **Pages**.
3. En **Build and deployment → Source**, cambia el desplegable a
   **GitHub Actions**.

   No tienes que elegir rama ni carpeta: al seleccionar *GitHub Actions* esas
   opciones desaparecen. Eso es lo correcto.

No hay botón de guardar: el cambio se aplica al seleccionarlo.

---

## Paso 6 · Correr la publicación

1. Pestaña **Actions**.
2. Verás la corrida que arrancó en el Paso 4. Si activaste Pages después de que
   arrancó, esa primera corrida puede haber fallado al publicar — es normal.
   Para relanzarla: menú izquierdo → **Validar y publicar Dashboard de RRHH**
   → botón **Run workflow** → **Run workflow**.
3. Haz clic en la corrida para ver el avance. Son dos trabajos en orden:

   | Trabajo | Qué hace | Duración |
   |---|---|---|
   | **verificar** | Valida los datos, construye el JSON, corre 28 pruebas de KPI y 23 pruebas de interfaz en un navegador real | 3–4 min la primera vez |
   | **publicar** | Sube el sitio a GitHub Pages | 30 seg |

   La primera corrida tarda más porque descarga Chromium. Las siguientes bajan
   a ~2 minutos.

4. Cuando los dos trabajos tengan ✅, listo.

---

## Paso 7 · Abrir el tablero

La dirección es:

```
https://TU-USUARIO.github.io/dashboard-rrhh/
```

Sustituyendo `TU-USUARIO` por tu usuario de GitHub. También la encuentras en
**Actions** → la corrida → trabajo **publicar** → el resumen muestra la URL.

Si te da 404, espera un minuto y recarga: la primera publicación tarda en
propagarse.

---

## Paso 8 · Verificar que quedó bien

Recorre esta lista en el tablero abierto:

- [ ] El encabezado dice **Cierre julio 2026** y muestra un `commit` de 7 caracteres.
- [ ] En la pestaña **Base de datos**, la sección de trazabilidad dice
      `fuente: data/BASE_RRHH.xlsx (libro de Excel)`.
- [ ] Aparece la franja naranja de **Datos de demostración**.
- [ ] Las tarjetas muestran números, no guiones.
- [ ] Las cinco pestañas abren sin error: Resumen ejecutivo, Plantilla, Nómina,
      Capacitación, Base de datos.
- [ ] En **Resumen ejecutivo**, la matriz tiene encabezado negro y las filas en
      verde, naranja y gris.
- [ ] Al pasar el cursor sobre una gráfica sale el globo con los valores.
- [ ] Al hacer clic en un chip de unidad, los números cambian.
- [ ] El botón **Ver tabla** de cualquier gráfica muestra los datos en tabla.

Si algo de esto falla, ve a la sección de problemas al final.

---

## Uso mensual: subir el cierre

El trabajo del mes se hace **en Excel**, no en GitHub.

### a) Bajar el libro

1. En el repositorio, entra a la carpeta **`data`**.
2. Clic en **`BASE_RRHH.xlsx`**.
3. Botón **Download raw file** (el icono de descarga, arriba a la derecha del
   recuadro del archivo).

> Baja el libro cada mes antes de capturar, en lugar de trabajar sobre una copia
> local vieja. Así siempre partes de lo último que se publicó, y si alguien más
> del equipo cargó algo, no lo pisas.

### b) Capturar el cierre

Abre el libro en Excel y, en **cada hoja de hechos**, agrega las filas del mes
nuevo con el `periodo` correspondiente — por ejemplo `2026-08`.

- **Agregar filas, no sobrescribir las anteriores.** El tablero calcula rotación
  y las demás tasas anualizadas con ventana móvil de 12 meses: si borras
  historia, esos indicadores dejan de poder calcularse.
- Las columnas de catálogo (`unidad_id`, `area_id`, `tipo_relacion`, `turno`)
  tienen **desplegable**: úsalo en lugar de escribir a mano.
- La hoja **LEEME** muestra el conteo de registros de cada hoja. Después de
  capturar, revisa que los números crecieron en las hojas que tocaste.
- Si cambian las metas del año, se editan en la hoja **`metas`**.
- Guarda en formato **.xlsx** (no .xls, no .csv) y **con el mismo nombre**:
  `BASE_RRHH.xlsx`.

### c) Subir el libro

1. En el repositorio, entra a la carpeta **`data`**.
2. **Add file** → **Upload files**.
3. Arrastra tu `BASE_RRHH.xlsx`. GitHub reemplaza el anterior porque tiene el
   mismo nombre.
4. Mensaje del commit: `Cierre 2026-08`.
5. **Commit changes**.

Y ya. La pestaña **Actions** valida y republica sola en un par de minutos. No
tienes que tocar nada más.

### Cómo revisar qué cambió

Como el `.xlsx` es binario, GitHub no puede mostrar el diff de un Excel. Por eso
el proceso exporta automáticamente los datos a `data/csv/`: entra a esa carpeta,
abre cualquier archivo y usa el historial (**History**) para ver, línea por
línea, qué número cambió en cada cierre y quién lo cambió. Esos CSV se
regeneran solos — no los edites.

**Si la validación falla, el tablero no se actualiza y conserva el cierre
anterior.** Eso es intencional: es mejor llegar al comité con el dato del mes
pasado que con un dato equivocado.

Para ver qué salió mal: **Actions** → la corrida en rojo → trabajo
**verificar** → paso **Validar esquema, llaves y reglas de negocio**. El error
te dice **la hoja, la fila y la regla** que se violó. Por ejemplo:

```
✗ [hoja fact_ausentismo fila 148] regla violada: horas_ausencia <= horas_programadas
```

Eso se lee así: abre el libro, ve a la hoja `fact_ausentismo`, fila 148, y
corrige. Vuelve a subir el libro y listo.

### Errores de captura más comunes en Excel

| Problema | Qué verás | Solución |
|---|---|---|
| Excel convierte `2026-08` en fecha | `periodo inválido '2026-08-01 00:00:00'` | La columna `periodo` ya viene formateada como **Texto**. No cambies ese formato. Si ya pasó: selecciona la columna → Formato de celdas → Texto → vuelve a escribir el valor |
| Se renombró o movió una columna | `encabezados incorrectos` con la lista esperada | Restaura el nombre y el orden exactos. Lo más seguro es bajar el libro del repositorio y volver a capturar |
| Se usó una clave que no existe | `'unidad_id' = 'U07' no existe en dim_unidad` | Agrega primero la unidad a la hoja `dim_unidad`, después úsala |
| Se duplicó una fila | `llave duplicada ('2026-08', 'U01', 'A01', 'Propio')` | Borra la fila repetida. Cada combinación de llave va una sola vez |
| Se escribió texto en un campo numérico | `'headcount' tiene el texto 'cuarenta'` | Escribe el número |
| Se dejó una celda vacía | `'headcount' numérica está vacía` | Pon `0` si de verdad no hay dato |

El archivo `plantillas/DICCIONARIO.md` documenta cada columna, su tipo y su
regla de validación. También está anotada la llave primaria en el comentario del
primer encabezado de cada hoja del libro (el triangulito rojo).

---

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| No aparece nada en **Actions** | El archivo del Paso 4 no quedó en la ruta correcta | Verifica que exista `.github/workflows/deploy.yml`. Si quedó como `deploy.yml` en la raíz, bórralo y repite el Paso 4 |
| Error `Get Pages site failed` | Falta el Paso 5 | Settings → Pages → Source: **GitHub Actions**. Luego relanza el workflow |
| El workflow no arranca y el archivo se ve como texto plano | Mala indentación al pegar el YAML | Borra el archivo y repite el Paso 4 copiando de nuevo, sin reformatear |
| 404 al abrir la URL | El trabajo **publicar** no terminó, o falta propagación | Revisa que ambos trabajos estén en ✅ y espera un minuto |
| Falla en **Validar esquema…** | Un CSV con problema | Lee el error: trae tabla, fila y regla |
| La página carga pero dice que no pudo cargar la base de datos | Los archivos quedaron un nivel más abajo | Revisa que en la raíz del repo se vean `data`, `etl`, `public`. Si ves una carpeta `dashboard-rrhh`, repite el Paso 3 seleccionando el contenido, no la carpeta |
| Falla con `no tiene las hojas: …` | Se renombró o borró una hoja del libro | Los nombres de hoja deben ser exactos. Baja el libro del repositorio y vuelve a capturar sobre ese |
| El tablero se ve sin colores ni formato | Falta `public/assets/styles.css` | Repite el Paso 3 asegurándote de que suban las subcarpetas |

---

## Pasar a privado, para datos reales

Cuando la Dirección autorice cargar el cierre real:

1. Contratar **GitHub Team** en la organización (por usuario/mes) — es el plan
   mínimo que permite Pages en repositorio privado.
2. **Settings → General → Danger Zone → Change repository visibility →
   Make private**.
3. Abrir `data/BASE_RRHH.xlsx`, hoja **LEEME**, y cambiar la celda
   **Origen de los datos** de `DEMO` a `REAL`. Eso retira el aviso naranja.
4. Capturar el cierre real y subir el libro.

> **Si alcanzaste a subir datos reales mientras el repositorio era público, no
> basta con hacerlo privado.** El historial de git conserva todo. En ese caso
> crea un repositorio nuevo, privado, y sube solo el estado actual de los
> archivos, sin historial.

Ten presente que, incluso con repositorio privado en Team, la **URL del sitio
publicado sigue siendo accesible** para quien la conozca — no aparece en
buscadores, pero no está autenticada. Restringir el sitio a miembros de la
organización requiere **GitHub Enterprise Cloud**.

Alternativa sin costo si los datos deben quedarse dentro: mantener el
repositorio privado **sin publicar sitio**, y usar el generador de archivo
único (`python3 etl/standalone.py`) para circular el tablero como un HTML que
se abre con doble clic. Eso sí requiere que alguien lo corra en su máquina.

---

## Referencia rápida

| Necesito… | Dónde |
|---|---|
| Capturar el cierre del mes | `data/BASE_RRHH.xlsx`, hojas `fact_*` |
| Cambiar una meta | Hoja `metas` del libro, columna `meta` |
| Agregar una unidad minera | Una fila en la hoja `dim_unidad` y sus filas de hechos |
| Quitar el aviso de datos demo | Hoja `LEEME`, celda **Origen de los datos** → `REAL` |
| Cambiar el nombre de la organización | Hoja `LEEME`, celda `C8` |
| Ver qué cambió en el último cierre | Carpeta `data/csv/` → cualquier archivo → **History** |
| Ver la definición de un KPI | `public/assets/js/kpi.js` |
| Ver qué significa una columna | `plantillas/DICCIONARIO.md` |
| Plantillas para exportar de un ERP | `plantillas/*.csv` |
