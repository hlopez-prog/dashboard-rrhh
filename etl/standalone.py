"""
Construye una versión del tablero en UN SOLO ARCHIVO HTML.

    python3 etl/standalone.py

Escribe dist/dashboard-rrhh.html: CSS, JavaScript y datos embebidos en el
documento. Sirve para revisar el tablero sin montar el repositorio, mandarlo
por correo o abrirlo desde una USB en sitio, donde no hay red.

La versión de GitHub Pages (public/) sigue siendo la oficial: se actualiza
sola. Este archivo es una foto del cierre en que se generó.
"""
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(RAIZ, "public")
DIST = os.path.join(RAIZ, "dist")

# Orden de dependencias: cada módulo solo usa lo definido arriba de él.
MODULOS = ["util.js", "datos.js", "kpi.js", "graficos.js", "matriz.js", "app.js"]

# app.js consume graficos como namespace (`g.lineas`). Al aplanar los módulos
# ese namespace desaparece, así que se reconstruye a mano.
SHIM_NAMESPACE = """
/* Reemplazo del namespace `import * as g from './graficos.js'` al aplanar. */
const g = {
  PALETA, color, formatear, lineas, barras, barrasH, sparkline, leyenda,
};
"""

RE_IMPORT = re.compile(r"^import\s[\s\S]*?from\s+'[^']*';\s*$", re.MULTILINE)
RE_EXPORT = re.compile(r"^export\s+(?=(?:default\s+)?(?:function|const|let|class|async))",
                       re.MULTILINE)


def aplanar(nombre):
    ruta = os.path.join(PUB, "assets", "js", nombre)
    with open(ruta, encoding="utf-8") as f:
        codigo = f.read()
    codigo = RE_IMPORT.sub("", codigo)
    codigo = RE_EXPORT.sub("", codigo)
    if "export" in codigo:
        restos = [l for l in codigo.splitlines() if l.strip().startswith("export")]
        if restos:
            raise SystemExit(f"{nombre}: quedaron exports sin resolver: {restos}")
    return f"\n/* ======== {nombre} ======== */\n{codigo}"


def main():
    datos_ruta = os.path.join(PUB, "data", "dashboard.json")
    if not os.path.exists(datos_ruta):
        raise SystemExit("Falta public/data/dashboard.json — corre primero: python3 etl/build.py")

    with open(datos_ruta, encoding="utf-8") as f:
        datos = json.load(f)
    with open(os.path.join(PUB, "assets", "styles.css"), encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(PUB, "index.html"), encoding="utf-8") as f:
        html = f.read()

    js = "".join(aplanar(m) for m in MODULOS[:4])
    js += SHIM_NAMESPACE
    js += "".join(aplanar(m) for m in MODULOS[4:])

    # En la versión de un archivo los datos ya están en memoria: no hay fetch.
    js = js.replace(
        "    estado.almacen = await cargarDatos();",
        "    estado.almacen = construirAlmacen(DATOS_EMBEBIDOS);",
    )
    if "DATOS_EMBEBIDOS" not in js:
        raise SystemExit("No se pudo sustituir la carga de datos en app.js")

    cabecera = (
        f"/* Datos del cierre {datos['meta']['periodo_final']}, "
        f"generados {datos['meta']['generado_utc']} */\n"
        "const DATOS_EMBEBIDOS = "
        + json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )

    # Reemplaza <link> por <style> y <script src> por el bundle.
    html = html.replace(
        '  <link rel="stylesheet" href="assets/styles.css">',
        f"  <style>\n{css}\n  </style>",
    )
    html = html.replace(
        '  <script type="module" src="assets/js/app.js"></script>',
        '  <script type="module">\n' + cabecera + js + "\n  </script>",
    )
    html = html.replace(
        "<title>Dashboard de RRHH · Minera Rio Tinto</title>",
        f"<title>Dashboard de RRHH · Minera Rio Tinto · cierre "
        f"{datos['meta']['periodo_final']}</title>",
    )
    if "assets/" in html:
        sobrantes = [l.strip() for l in html.splitlines() if "assets/" in l]
        raise SystemExit(f"Quedaron referencias externas: {sobrantes}")

    os.makedirs(DIST, exist_ok=True)
    salida = os.path.join(DIST, "dashboard-rrhh.html")
    with open(salida, "w", encoding="utf-8") as f:
        f.write(html)

    kb = os.path.getsize(salida) / 1024
    print(f"  dist/dashboard-rrhh.html  ({kb:.0f} KB, autocontenido)")
    print(f"  cierre {datos['meta']['periodo_final']} · "
          f"{len(datos['meta']['periodos'])} meses de historia")


if __name__ == "__main__":
    main()
