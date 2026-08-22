"""
Construye el JSON que consume el Dashboard de RRHH.

    python3 etl/build.py

Flujo:
    data/BASE_RRHH.xlsx  →  validación  →  public/data/dashboard.json
                                        →  data/csv/*.csv (export para diff)

El JSON sale en formato columnar compacto (columnas + filas como arreglos)
para pesar la mitad que un arreglo de objetos.

Ni el JSON ni el export CSV son fuente de verdad: se reconstruyen en cada
push. La fuente de verdad es el libro de Excel.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema  # noqa: E402
import validate  # noqa: E402
import cargar as cargador  # noqa: E402
import excel  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "public", "data")

NOMBRE_SALIDA = {
    "dim_unidad": "unidad",
    "dim_area": "area",
    "fact_plantilla": "plantilla",
    "fact_movimientos": "movimientos",
    "fact_ausentismo": "ausentismo",
    "fact_nomina": "nomina",
    "fact_capacitacion": "capacitacion",
    "fact_relaciones_laborales": "relaciones",
    "metas": "metas",
}


def a_columnar(tabla, filas):
    columnas = list(schema.TABLAS[tabla]["columnas"].items())
    salida = []
    for fila in filas:
        registro = []
        for col, tipo in columnas:
            v = fila.get(col, "")
            if v is None or (isinstance(v, str) and v.strip() == ""):
                # null en el JSON: el tablero lo distingue de un cero y lo
                # muestra como "—" en lugar de contarlo como dato.
                registro.append(None)
            elif tipo in ("s", "p"):
                registro.append(str(v).strip())
            elif tipo == "i":
                registro.append(int(v))
            else:
                registro.append(round(float(v), 4))
        salida.append(registro)
    return {"columnas": [c for c, _ in columnas], "filas": salida}


def commit_actual():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=RAIZ,
            stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:  # noqa: BLE001
        return (os.environ.get("GITHUB_SHA", "") or "local")[:7]


def main():
    print("Paso 1/4 · Cargando y validando la base de datos\n")
    if validate.main() != 0:
        print("\nBuild abortado: corrige los datos primero.")
        return 1

    tablas, config, fuente = cargador.cargar()
    # Reaplica la coerción de tipos que hace el validador
    validate.validar(tablas, fuente)

    print("\nPaso 2/4 · Construyendo dashboard.json")
    salida = {"tablas": {}}
    for tabla in schema.ORDEN_CARGA:
        salida["tablas"][NOMBRE_SALIDA[tabla]] = a_columnar(tabla, tablas[tabla])

    idx = salida["tablas"]["plantilla"]["columnas"].index("periodo")
    periodos = sorted({f[idx] for f in salida["tablas"]["plantilla"]["filas"]})

    salida["meta"] = {
        "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commit": commit_actual(),
        "periodos": periodos,
        "periodo_inicial": periodos[0] if periodos else None,
        "periodo_final": periodos[-1] if periodos else None,
        "organizacion": config["organizacion"],
        "es_demo": config["origen"] == "DEMO",
        "fuente": cargador.describir_fuente(fuente),
        "conteo_filas": {k: len(v["filas"]) for k, v in salida["tablas"].items()},
    }

    os.makedirs(DESTINO, exist_ok=True)
    ruta = os.path.join(DESTINO, "dashboard.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))

    kb = os.path.getsize(ruta) / 1024
    print(f"  public/data/dashboard.json  ({kb:.0f} KB)")
    print(f"  periodos: {periodos[0]} → {periodos[-1]}  ({len(periodos)} meses)")

    print("\nPaso 3/4 · Exportando CSV para diff legible en git")
    if fuente == "excel":
        excel.exportar_csv(tablas)
    else:
        print("  (la fuente ya es CSV, no hay nada que exportar)")

    print("\nPaso 4/4 · Verificando integridad del JSON")
    with open(ruta, encoding="utf-8") as f:
        vuelta = json.load(f)

    # Sin dimensiones ni plantilla no hay tablero: eso sí es un error.
    # Una hoja de hechos vacía, en cambio, es un módulo que todavía no se
    # captura. El tablero lo muestra como "—", que es la verdad. Abortar
    # aquí obligaría a inventar un mes de nómina para poder publicar.
    IMPRESCINDIBLES = ("unidad", "area", "plantilla")
    vacias = []
    for nombre, t in vuelta["tablas"].items():
        if not t["filas"]:
            if nombre in IMPRESCINDIBLES:
                raise SystemExit(f"La tabla '{nombre}' quedó vacía y sin ella "
                                 f"no se puede construir el tablero.")
            vacias.append(nombre)
        assert all(len(r) == len(t["columnas"]) for r in t["filas"]), \
            f"tabla '{nombre}' con filas de ancho inconsistente"
    print("  ✓ JSON consistente")
    if vacias:
        print(f"  · sin capturar todavía: {', '.join(vacias)}")
        print("    esos indicadores se publican como “—”, no como cero")
    print("✓ Build completo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
