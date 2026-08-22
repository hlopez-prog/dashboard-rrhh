"""
Diagnóstico de la base de datos: convierte los errores del validador en una
lista de pendientes accionable.

    python3 etl/diagnostico.py                 # revisa data/BASE_RRHH.xlsx
    python3 etl/diagnostico.py otro_libro.xlsx  # revisa cualquier archivo

El validador (etl/validate.py) es un semáforo: dice sí o no, y suelta una
línea por celda. Cuando faltan 400 celdas eso son 400 líneas iguales y nadie
las lee. Este script agrupa esas líneas por problema y responde, para cada
grupo, las únicas tres preguntas que importan al que va a corregir:

    qué pasa · en qué filas · qué escribo

No valida nada nuevo ni cambia datos. Siempre termina con éxito: es un
reporte, no una puerta. La puerta es validate.py.

Deja además DIAGNOSTICO.html, que es el mismo reporte para imprimir o
mandar por correo a quien captura.
"""
import html
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema  # noqa: E402
import validate  # noqa: E402
import cargar as cargador  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA_HTML = os.path.join(RAIZ, "DIAGNOSTICO.html")

# Colores institucionales (los mismos del tablero).
NEGRO, GRIS, VERDE, NARANJA = "#000000", "#F2F2F2", "#D9EAD3", "#FCE5CD"

# Qué significa cada columna, en el idioma de quien captura. Sin esto el
# reporte dice "falta headcount" y el que corrige no sabe qué escribir.
COLUMNAS = {
    "headcount": "el número de personas que estaban en esa área ese mes",
    "tipo_relacion": "si esa fila cuenta personal Propio o Contratista",
    "turno": "el esquema de turno del área",
    "periodo": "el mes del cierre, escrito AAAA-MM (ejemplo: 2026-07)",
    "unidad_id": "la clave de la unidad, tal como está en la hoja dim_unidad",
    "area_id": "la clave del área, tal como está en la hoja dim_area",
    "horas_programadas": "las horas que se debían trabajar en el mes",
    "horas_ausencia": "las horas que no se trabajaron",
    "costo_ordinario": "la nómina ordinaria del mes en pesos",
    "horas_ordinarias": "las horas hombre ordinarias del mes",
    "altas": "las contrataciones del mes",
    "bajas_voluntarias": "las renuncias del mes",
    "bajas_involuntarias": "las bajas decididas por la empresa",
    "horas_real": "las horas de capacitación que sí se dieron",
    "dc3_requeridos": "las constancias DC-3 que se debían emitir",
    "dc3_emitidos": "las constancias DC-3 emitidas",
    "sindicato": "el nombre del sindicato titular del CCT",
    "trabajadores_sindicalizados": "cuántos trabajadores están sindicalizados",
    "riesgo_sindical": "el riesgo sindical del 1 al 5",
    "kpi": "la clave del indicador",
    "meta": "el valor de la meta",
    "direccion": "si para ese indicador es mejor un número menor o mayor",
}

QUE_HACER = {
    "vacia_obligatoria":
        "Escribe el dato en cada una de esas filas. Es una columna "
        "obligatoria: sin ella la fila no significa nada y el tablero no "
        "puede publicarse. Si de verdad no hay dato para ese mes, borra la "
        "fila completa en lugar de dejarla a medias.",
    "llave_duplicada":
        "Hay dos filas que dicen ser el mismo mes, la misma unidad y la "
        "misma área. Una de las dos sobra: si son el mismo dato, borra la "
        "repetida; si son dos áreas distintas, dales su propia clave en la "
        "hoja dim_area.",
    "fuera_catalogo":
        "El valor escrito no está en la lista permitida. Elígelo del menú "
        "desplegable de la celda, o pídeme que lo agregue al catálogo si es "
        "un valor real de la operación que faltaba.",
    "fk_inexistente":
        "La clave no existe en la hoja de catálogo. Primero dala de alta en "
        "el catálogo (dim_unidad o dim_area) y después úsala en los hechos.",
    "periodo_invalido":
        "El mes debe escribirse como texto AAAA-MM: 2026-07, no jul-26 ni "
        "01/07/2026. Si Excel lo convirtió en fecha, formatea la columna "
        "como Texto y vuelve a escribirlo.",
    "no_numerico":
        "En una celda que espera un número hay texto. Quita comas, guiones, "
        "'N/A' y espacios: deja el número solo, o la celda vacía si la "
        "columna es opcional.",
    "regla":
        "Los dos datos de la fila se contradicen entre sí. Revisa cuál de "
        "los dos está mal capturado; el tablero no puede decidirlo.",
    "otro": "Revisa la celda indicada.",
}

ORDEN_CLASES = ["vacia_obligatoria", "llave_duplicada", "periodo_invalido",
                "no_numerico", "fuera_catalogo", "fk_inexistente", "regla",
                "otro"]


def rangos(nums):
    """[4,5,6,9,10,20] → '4-6, 9-10, 20'. Para no imprimir 400 números."""
    xs = sorted({n for n in nums if n})
    if not xs:
        return "—"
    piezas, ini, prev = [], xs[0], xs[0]
    for n in xs[1:]:
        if n == prev + 1:
            prev = n
            continue
        piezas.append(f"{ini}-{prev}" if prev > ini else f"{ini}")
        ini = prev = n
    piezas.append(f"{ini}-{prev}" if prev > ini else f"{ini}")
    return ", ".join(piezas)


def recortar(texto, piezas=18):
    """Muestra los primeros rangos y dice cuántos quedaron fuera, en lugar
    de cortar la lista a media cifra."""
    partes = texto.split(", ")
    if len(partes) <= piezas:
        return texto
    return (", ".join(partes[:piezas])
            + f"  … y {len(partes) - piezas} rangos más")


def agrupar(errores):
    """Un grupo por (hoja, clase de problema, columna), del más grande al menor."""
    grupos = {}
    for e in errores:
        clave = (getattr(e, "tabla", "?"), getattr(e, "clase", "otro"),
                 getattr(e, "columna", None))
        g = grupos.setdefault(clave, {"filas": [], "ejemplos": []})
        g["filas"].append(getattr(e, "fila", None))
        if len(g["ejemplos"]) < 3:
            g["ejemplos"].append(str(e))
    orden = sorted(grupos.items(),
                   key=lambda kv: (-len(kv[1]["filas"]),
                                   ORDEN_CLASES.index(kv[0][1])
                                   if kv[0][1] in ORDEN_CLASES else 99))
    return orden


def que_pasa(tabla, clase, columna, n):
    filas = "1 fila" if n == 1 else f"{n:,} filas".replace(",", ",")
    if clase == "vacia_obligatoria":
        sig = COLUMNAS.get(columna)
        cola = f", que es {sig}" if sig else ""
        return f"{filas} de la hoja {tabla} no tienen '{columna}'{cola}."
    if clase == "llave_duplicada":
        return (f"{filas} de la hoja {tabla} repiten una combinación que "
                f"debe ser única: {columna}.")
    if clase == "regla":
        return f"{filas} de la hoja {tabla} incumplen la regla: {columna}."
    if clase == "fuera_catalogo":
        return f"{filas} de la hoja {tabla} traen un '{columna}' que no existe."
    if clase == "fk_inexistente":
        return (f"{filas} de la hoja {tabla} apuntan a un '{columna}' que no "
                f"está dado de alta en el catálogo.")
    if clase == "periodo_invalido":
        return f"{filas} de la hoja {tabla} tienen el mes mal escrito."
    if clase == "no_numerico":
        return f"{filas} de la hoja {tabla} tienen texto en '{columna}'."
    return f"{filas} de la hoja {tabla}: {columna or 'revisar'}."


def forma_txt(n, k):
    """(9, 52) → '52 unidades-mes con 9 filas'."""
    return (f"{k} unidad-mes con {n} fila{'s' if n != 1 else ''}" if k == 1
            else f"{k} unidades-mes con {n} fila{'s' if n != 1 else ''}")


def bloques(tablas):
    """
    Forma de los bloques: cuántas filas trae cada unidad-mes y qué códigos de
    área se repiten dentro del bloque.

    Es la pregunta que explica la mayoría de las llaves duplicadas. Si un mes
    trae 9 filas por unidad y el catálogo solo tiene 7 áreas, no hay forma de
    que el bloque cuadre: o faltan dos áreas en el catálogo, o sobran dos
    filas. El validador solo ve "llave duplicada"; esto dice por qué.
    """
    salida = []
    areas_catalogo = len(tablas.get("dim_area", []))
    for t in schema.ORDEN_CARGA:
        cols = schema.TABLAS[t]["columnas"]
        if "area_id" not in cols or "periodo" not in cols:
            continue
        conteos, repetidas = {}, {}
        for fila in tablas.get(t, []):
            clave = (str(fila.get("periodo")), str(fila.get("unidad_id")))
            conteos.setdefault(clave, []).append(str(fila.get("area_id")))
        formas = {}
        for clave, areas in conteos.items():
            formas[len(areas)] = formas.get(len(areas), 0) + 1
            # Se cuenta una vez por bloque, no una vez por fila: un área que
            # aparece dos veces en un bloque es UN bloque con el problema.
            for a in {x for x in areas if areas.count(x) > 1}:
                repetidas[a] = repetidas.get(a, 0) + 1
        if not formas:
            continue
        salida.append({
            "hoja": t,
            "formas": sorted(formas.items()),
            "repetidas": sorted(repetidas.items(), key=lambda kv: -kv[1]),
            "areas_catalogo": areas_catalogo,
        })
    return salida


def estabilidad_areas(tablas, umbral=2):
    """
    ¿El área que produce sigue siendo la misma mes con mes?

    Una unidad minera produce por una o dos áreas: la planta y el tajo. Esas
    áreas producen todos los meses. Si a lo largo del año la tonelada aparece
    reportada en seis áreas distintas, la columna area_id no está describiendo
    áreas: perdió la correspondencia con los números de su propia fila. Pasa
    al pegar un export cuyas filas se ordenaron sin arrastrar la etiqueta.

    Es la revisión que ninguna regla por fila puede hacer, porque cada fila
    aislada se ve perfectamente válida. Solo la serie delata la mezcla.
    """
    filas = []
    por_unidad = {}
    for f in tablas.get("fact_nomina", []):
        ton = f.get("toneladas_movidas")
        u = str(f.get("unidad_id"))
        d = por_unidad.setdefault(u, {"meses": set(), "areas": {}})
        d["meses"].add(str(f.get("periodo")))
        if ton not in (None, "", 0):
            a = str(f.get("area_id"))
            d["areas"][a] = d["areas"].get(a, 0) + 1
    for u, d in sorted(por_unidad.items()):
        if not d["areas"]:
            continue
        filas.append({
            "unidad": u,
            "meses": len(d["meses"]),
            "areas": sorted(d["areas"].items(), key=lambda kv: -kv[1]),
            "sospechoso": len(d["areas"]) > umbral,
        })
    return filas


def cobertura(tablas):
    """Qué meses trae cada hoja. Revela las hojas que se quedaron atrás."""
    filas = []
    for t in schema.ORDEN_CARGA:
        if "periodo" not in schema.TABLAS[t]["columnas"]:
            continue
        pers = sorted({str(f.get("periodo", "")) for f in tablas.get(t, [])})
        pers = [p for p in pers if validate.RE_PERIODO.match(p)]
        filas.append({
            "hoja": t,
            "registros": len(tablas.get(t, [])),
            "meses": len(pers),
            "desde": pers[0] if pers else "—",
            "hasta": pers[-1] if pers else "—",
        })
    return filas


# ----------------------------------------------------------------- consola
def imprimir(fuente_txt, grupos, avisos, cob, blq, est, total):
    print("=" * 70)
    print("DIAGNÓSTICO DE LA BASE DE DATOS — Dashboard de RRHH")
    print("=" * 70)
    print(f"Libro: {fuente_txt}")
    print(f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print()

    if not grupos:
        print("✓ No hay nada que corregir: la base pasa la validación.")
    else:
        print(f"{total:,} celdas por corregir, agrupadas en {len(grupos)} "
              f"problemas distintos.")
        print("Todo se corrige en el libro de Excel. No hay que tocar el "
              "tablero ni el código.")
    print()
    print("-" * 70)
    print("COBERTURA POR HOJA")
    print(f"  {'hoja':<28}{'registros':>10}{'meses':>7}   rango")
    for f in cob:
        print(f"  {f['hoja']:<28}{f['registros']:>10}{f['meses']:>7}   "
              f"{f['desde']} → {f['hasta']}")
    print("  Si una hoja trae muchos menos meses que las demás, el tablero "
          "va a mostrar\n  huecos en esos indicadores: no es un error, es "
          "información que falta.")
    print()

    if any(f["sospechoso"] for f in est):
        print("-" * 70)
        print("ALERTA: LA COLUMNA area_id NO ES ESTABLE")
        print("  Una unidad produce por una o dos áreas, y son las mismas todos")
        print("  los meses. Estas unidades reportan tonelada en más áreas que eso:")
        for f in est:
            marca = "  ✗" if f["sospechoso"] else "  ·"
            areas = ", ".join(f"{a} ({k} meses)" for a, k in f["areas"])
            print(f"{marca} {f['unidad']}  {f['meses']} meses  →  {len(f['areas'])} "
                  f"áreas con producción: {areas}")
        print("  Cuando la tonelada salta de área en área, el problema no son dos")
        print("  filas duplicadas: la columna area_id perdió la correspondencia con")
        print("  los números de su propia fila. Hay que volver a exportar el origen")
        print("  arrastrando la columna de área junto con las cifras.")
        print()

    if any(len(b["formas"]) > 1 or b["repetidas"] for b in blq):
        print("-" * 70)
        print("FORMA DE LOS BLOQUES  (filas por unidad y mes)")
        for b in blq:
            formas = ", ".join(forma_txt(n, k) for n, k in b["formas"])
            print(f"  {b['hoja']:<28} {formas}")
            if b["repetidas"]:
                reps = ", ".join(f"{a} ({k} bloques)" for a, k in b["repetidas"])
                print(f"  {'':<28} código de área repetido dentro del bloque: {reps}")
        print(f"  El catálogo dim_area tiene {blq[0]['areas_catalogo']} áreas. Si un "
              f"bloque trae más filas\n  que áreas del catálogo, dos filas terminan "
              f"con el mismo código: o faltan\n  áreas en el catálogo, o sobran filas "
              f"en el bloque. Esa decisión no la puede\n  tomar el validador.")
        print()

    for i, ((tabla, clase, columna), g) in enumerate(grupos, 1):
        n = len(g["filas"])
        print("-" * 70)
        print(f"PENDIENTE {i} de {len(grupos)}   ·   hoja {tabla}"
              + (f"   ·   columna {columna}" if columna else ""))
        print(f"  Qué pasa:   {que_pasa(tabla, clase, columna, n)}")
        print(f"  En qué filas: {recortar(rangos(g['filas']))}")
        print("  Qué hacer:")
        for linea in envolver(QUE_HACER.get(clase, QUE_HACER['otro']), 64):
            print(f"      {linea}")
        print()

    if avisos:
        print("-" * 70)
        print("AVISOS (no detienen la publicación)")
        for a in avisos:
            print(f"  · {a}")
        print()
    print("=" * 70)


def envolver(texto, ancho):
    palabras, linea, out = texto.split(), "", []
    for p in palabras:
        if len(linea) + len(p) + 1 > ancho:
            out.append(linea)
            linea = p
        else:
            linea = f"{linea} {p}".strip()
    if linea:
        out.append(linea)
    return out


# -------------------------------------------------------------------- html
def escribir_html(fuente_txt, grupos, avisos, cob, blq, est, total):
    e = html.escape
    p = []
    p.append("<!DOCTYPE html><html lang='es'><head><meta charset='utf-8'>")
    p.append("<meta name='viewport' content='width=device-width,initial-scale=1'>")
    p.append("<title>Diagnóstico de la base de datos · Dashboard de RRHH</title>")
    p.append(f"""<style>
 *{{box-sizing:border-box}}
 body{{font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
   color:#1a1a1a;max-width:980px;margin:0 auto;padding:28px 20px 60px}}
 .banner{{background:{GRIS};border:1px solid #d5d5d0;padding:18px 20px;
   margin-bottom:22px}}
 h1{{font-size:21px;margin:0 0 6px}}
 h2{{font-size:15px;text-transform:uppercase;letter-spacing:.06em;
   margin:34px 0 10px;padding-bottom:6px;border-bottom:2px solid {NEGRO}}}
 .meta{{color:#5c5a55;font-size:13px}}
 table{{border-collapse:collapse;width:100%;margin:10px 0 6px;font-size:14px}}
 th{{background:{NEGRO};color:#fff;text-align:left;padding:8px 10px;
   font-weight:600}}
 td{{border-bottom:1px solid #e4e4e0;padding:7px 10px;vertical-align:top}}
 td.num{{text-align:right;font-variant-numeric:tabular-nums}}
 .card{{border:1px solid #d5d5d0;margin:0 0 16px}}
 .card h3{{margin:0;padding:10px 14px;background:{NEGRO};color:#fff;
   font-size:14px;font-weight:600}}
 .card dl{{margin:0}}
 .card dt{{padding:9px 14px 2px;font-weight:600;font-size:12px;
   text-transform:uppercase;letter-spacing:.05em;color:#5c5a55}}
 .card dd{{margin:0;padding:0 14px 9px}}
 .card dd.hacer{{background:{VERDE};padding:10px 14px}}
 .card dd.filas{{font-family:ui-monospace,Menlo,Consolas,monospace;
   font-size:13px;word-break:break-word}}
 .aviso{{background:{NARANJA};border:1px solid #e8c9a6;padding:12px 14px;
   margin:0 0 10px}}
 .ok{{background:{VERDE};border:1px solid #b9d3ae;padding:16px 18px;
   font-weight:600}}
 .nota{{color:#5c5a55;font-size:13px;margin-top:4px}}
 @media print{{body{{max-width:none}}.card{{page-break-inside:avoid}}}}
</style></head><body>""")

    p.append("<div class='banner'>")
    p.append("<h1>Diagnóstico de la base de datos</h1>")
    p.append("<div class='meta'>Dashboard de RRHH · "
             f"{e(fuente_txt)} · "
             f"{datetime.now().strftime('%d/%m/%Y %H:%M')}</div>")
    p.append("</div>")

    if not grupos:
        p.append("<p class='ok'>La base pasa la validación. No hay nada que "
                 "corregir: al subir el libro, el tablero se republica.</p>")
    else:
        p.append(f"<p><strong>{total:,}</strong> celdas por corregir, "
                 f"agrupadas en <strong>{len(grupos)}</strong> pendientes. "
                 "Todo se corrige en el libro de Excel: no hay que tocar el "
                 "tablero ni el código.</p>")

    p.append("<h2>Cobertura por hoja</h2>")
    p.append("<table><thead><tr><th>Hoja</th><th>Registros</th>"
             "<th>Meses</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>")
    for f in cob:
        p.append(f"<tr><td>{e(f['hoja'])}</td>"
                 f"<td class='num'>{f['registros']:,}</td>"
                 f"<td class='num'>{f['meses']}</td>"
                 f"<td>{e(f['desde'])}</td><td>{e(f['hasta'])}</td></tr>")
    p.append("</tbody></table>")
    p.append("<p class='nota'>Una hoja con menos meses que las demás no es un "
             "error: es información que todavía no se ha capturado. El tablero "
             "muestra “—” en esos meses en lugar de inventar un cero.</p>")

    if any(f["sospechoso"] for f in est):
        p.append("<h2>Alerta: la columna area_id no es estable</h2>")
        p.append("<div class='aviso'>Una unidad minera produce por una o dos "
                 "áreas, y son las mismas todos los meses. Cuando la tonelada "
                 "aparece reportada en seis áreas distintas a lo largo del año, "
                 "la columna <em>area_id</em> perdió la correspondencia con los "
                 "números de su propia fila. Eso no se arregla borrando filas "
                 "duplicadas: hay que volver a exportar el origen arrastrando la "
                 "columna de área junto con las cifras.</div>")
        p.append("<table><thead><tr><th>Unidad</th><th>Meses</th>"
                 "<th>Áreas que reportan producción</th><th>Detalle</th>"
                 "</tr></thead><tbody>")
        for f in est:
            fondo = f" style='background:{NARANJA}'" if f["sospechoso"] else ""
            areas = ", ".join(f"{a} ({k})" for a, k in f["areas"])
            icono = "▲ revisar" if f["sospechoso"] else "● estable"
            p.append(f"<tr{fondo}><td>{e(f['unidad'])}</td>"
                     f"<td class='num'>{f['meses']}</td>"
                     f"<td>{len(f['areas'])} &nbsp; {icono}</td>"
                     f"<td>{e(areas)}</td></tr>")
        p.append("</tbody></table>")

    if any(len(b["formas"]) > 1 or b["repetidas"] for b in blq):
        p.append("<h2>Forma de los bloques</h2>")
        p.append("<p class='nota'>Cuántas filas trae cada unidad en cada mes. "
                 f"El catálogo <em>dim_area</em> tiene "
                 f"{blq[0]['areas_catalogo']} áreas: si un bloque trae más "
                 "filas que eso, dos filas acaban con el mismo código de área "
                 "y la validación las marca como duplicadas.</p>")
        p.append("<table><thead><tr><th>Hoja</th><th>Filas por unidad y mes</th>"
                 "<th>Código de área repetido</th></tr></thead><tbody>")
        for b in blq:
            formas = "; ".join(forma_txt(n, k) for n, k in b["formas"])
            reps = ", ".join(f"{a} ({k})" for a, k in b["repetidas"]) or "—"
            p.append(f"<tr><td>{e(b['hoja'])}</td><td>{e(formas)}</td>"
                     f"<td>{e(reps)}</td></tr>")
        p.append("</tbody></table>")

    if grupos:
        p.append("<h2>Pendientes por corregir</h2>")
        for i, ((tabla, clase, columna), g) in enumerate(grupos, 1):
            n = len(g["filas"])
            tit = f"Pendiente {i} · hoja {tabla}"
            if columna:
                tit += f" · columna {columna}"
            p.append("<div class='card'>")
            p.append(f"<h3>{e(tit)}</h3><dl>")
            p.append("<dt>Qué pasa</dt>"
                     f"<dd>{e(que_pasa(tabla, clase, columna, n))}</dd>")
            p.append("<dt>En qué filas del Excel</dt>"
                     f"<dd class='filas'>{e(rangos(g['filas']))}</dd>")
            p.append("<dt>Qué hacer</dt>"
                     f"<dd class='hacer'>{e(QUE_HACER.get(clase, QUE_HACER['otro']))}</dd>")
            if g["ejemplos"]:
                p.append("<dt>Ejemplos tal como los reporta la validación</dt>"
                         "<dd class='filas'>"
                         + "<br>".join(e(x) for x in g["ejemplos"]) + "</dd>")
            p.append("</dl></div>")

    if avisos:
        p.append("<h2>Avisos</h2>")
        p.append("<p class='nota'>No detienen la publicación del tablero.</p>")
        for a in avisos:
            p.append(f"<div class='aviso'>{e(a)}</div>")

    p.append("</body></html>")
    with open(SALIDA_HTML, "w", encoding="utf-8") as f:
        f.write("\n".join(p))
    return SALIDA_HTML


def main(libro=None):
    try:
        tablas, config, fuente = cargador.cargar(libro)
    except SystemExit as ex:
        print(f"No se pudo leer la base: {ex}")
        return 0

    errores, avisos = validate.validar(
        tablas, "excel" if fuente != "csv" else "csv")
    grupos = agrupar(errores)
    cob = cobertura(tablas)
    blq = bloques(tablas)
    est = estabilidad_areas(tablas)
    fuente_txt = cargador.describir_fuente(fuente)

    imprimir(fuente_txt, grupos, avisos, cob, blq, est, len(errores))
    ruta = escribir_html(fuente_txt, grupos, avisos, cob, blq, est, len(errores))
    print(f"Reporte para imprimir o enviar: {os.path.relpath(ruta, RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
