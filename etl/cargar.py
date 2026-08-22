"""
Carga de la base de datos, con precedencia explícita de la fuente.

    1. data/BASE_RRHH.xlsx   ← fuente de verdad: el libro que edita RRHH
    2. data/csv/*.csv        ← respaldo, para equipos que exportan de un ERP

Un solo punto de entrada (`cargar()`) para que validate.py y build.py nunca
puedan estar leyendo fuentes distintas.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema  # noqa: E402
import excel  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(RAIZ, "data", "csv")


def _cargar_csv():
    tablas = {}
    for tabla in schema.ORDEN_CARGA:
        definicion = schema.TABLAS[tabla]["columnas"]
        esperados = list(definicion.keys())
        ruta = os.path.join(CSV_DIR, f"{tabla}.csv")
        if not os.path.exists(ruta):
            raise SystemExit(f"Falta data/csv/{tabla}.csv y no hay libro de Excel.")
        with open(ruta, newline="", encoding="utf-8-sig") as f:
            lector = csv.reader(f)
            encabezados = [h.strip() for h in next(lector, [])]
            if encabezados != esperados:
                raise SystemExit(
                    f"{tabla}.csv: encabezados incorrectos.\n"
                    f"  esperado: {esperados}\n  recibido: {encabezados}")
            filas = []
            for n, cruda in enumerate(lector, start=2):
                if not any((c or "").strip() for c in cruda):
                    continue
                fila = {c: (cruda[i].strip() if i < len(cruda) else "")
                        for i, c in enumerate(esperados)}
                fila["_n"] = n
                filas.append(fila)
        tablas[tabla] = filas

    # Sin el libro no hay celda de origen. Se asume DEMO por prudencia: mostrar
    # el aviso de datos de demostración por error es menos grave que ocultarlo.
    # Se puede forzar con ORIGEN_DATOS=REAL.
    origen = os.environ.get("ORIGEN_DATOS", "DEMO").strip().upper()
    if origen not in ("DEMO", "REAL"):
        origen = "DEMO"
    return tablas, {"origen": origen, "organizacion": os.environ.get(
        "ORG_NOMBRE", "Minera Rio Tinto")}


def cargar(libro=None):
    """
    Devuelve (tablas, config, fuente).

    `libro` permite revisar un archivo cualquiera sin meterlo al repositorio:
    sirve para diagnosticar el libro de un cierre antes de subirlo.
    """
    ruta = libro or excel.LIBRO
    if os.path.exists(ruta):
        tablas, config = excel.leer(ruta)
        return tablas, config, ruta if libro else "excel"
    if libro:
        raise SystemExit(f"No existe el archivo {libro}")
    tablas, config = _cargar_csv()
    return tablas, config, "csv"


def describir_fuente(fuente):
    if fuente == "excel":
        return "data/BASE_RRHH.xlsx (libro de Excel)"
    if fuente == "csv":
        return "data/csv/*.csv (respaldo)"
    return f"{fuente} (libro de Excel)"
