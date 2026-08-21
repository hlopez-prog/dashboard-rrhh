"""
Validador de la base de datos del Dashboard de RRHH.

Corre en CI antes de construir el tablero. Si algo falla, el despliegue se
detiene: es preferible un tablero con los datos del mes pasado que uno con
números equivocados en el comité.

    python3 etl/validate.py            # exit 0 = ok, exit 1 = errores

Lee la fuente que indique etl/cargar.py (el libro de Excel, o los CSV de
respaldo) y verifica:
  1. Que exista cada hoja/archivo del esquema, con encabezados exactos.
  2. Tipos de dato por columna.
  3. Llaves primarias únicas y sin nulos.
  4. Integridad referencial contra las dimensiones.
  5. Reglas de negocio (schema.REGLAS).
  6. Continuidad de periodos (sin meses faltantes intermedios).
  7. Catálogos cerrados.

Los números de fila que reporta corresponden a la fila real de Excel, para que
quien captura pueda ir directo a la celda.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schema  # noqa: E402
import cargar as cargador  # noqa: E402

RE_PERIODO = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

CATALOGOS = {
    "tipo_relacion": schema.TIPOS_RELACION,
    "turno": schema.TURNOS,
    "tipo_area": schema.TIPOS_AREA,
    "direccion": schema.DIRECCION_META,
}


def validar(tablas, fuente):
    errores = []
    avisos = []
    etiqueta = "hoja" if fuente == "excel" else "archivo"

    def err(tabla, msg, fila=None):
        ref = f" fila {fila}" if fila else ""
        errores.append(f"[{etiqueta} {tabla}{ref}] {msg}")

    # --- 1/2. Tipos y valores obligatorios ---
    for tabla, filas in tablas.items():
        definicion = schema.TABLAS[tabla]["columnas"]
        for fila in filas:
            n = fila.get("_n")
            for col, tipo in definicion.items():
                v = fila.get(col, "")
                if tipo == "s":
                    if not str(v).strip():
                        err(tabla, f"'{col}' está vacía", n)
                elif tipo == "p":
                    if not RE_PERIODO.match(str(v).strip()):
                        err(tabla, f"periodo inválido '{v}' en '{col}'; "
                                   f"se escribe AAAA-MM", n)
                else:
                    if v == "" or v is None:
                        err(tabla, f"'{col}' numérica está vacía", n)
                        fila[col] = 0
                        continue
                    try:
                        num = float(v)
                    except (TypeError, ValueError):
                        err(tabla, f"'{col}' tiene el texto '{v}' donde se "
                                   f"espera un número", n)
                        fila[col] = 0
                        continue
                    fila[col] = int(num) if tipo == "i" else num

    # --- 7. Catálogos cerrados ---
    for tabla, filas in tablas.items():
        definicion = schema.TABLAS[tabla]["columnas"]
        for col, permitidos in CATALOGOS.items():
            if col not in definicion:
                continue
            for fila in filas:
                if str(fila.get(col, "")).strip() not in permitidos:
                    err(tabla, f"'{col}' = '{fila.get(col)}' fuera de catálogo. "
                               f"Permitidos: {', '.join(permitidos)}", fila.get("_n"))

    # --- 3. Llaves primarias ---
    for tabla, filas in tablas.items():
        pk = schema.TABLAS[tabla]["pk"]
        vistas = {}
        for fila in filas:
            clave = tuple(str(fila.get(c, "")) for c in pk)
            if clave in vistas:
                err(tabla, f"llave duplicada {clave}; ya estaba en la fila "
                           f"{vistas[clave]}", fila.get("_n"))
            else:
                vistas[clave] = fila.get("_n")

    # --- 4. Integridad referencial ---
    for tabla, fks in schema.FKS.items():
        if tabla not in tablas:
            continue
        for col, dim in fks.items():
            if dim not in tablas:
                continue
            dim_pk = schema.TABLAS[dim]["pk"][0]
            validos = {str(f.get(dim_pk, "")) for f in tablas[dim]}
            for fila in tablas[tabla]:
                if str(fila.get(col, "")) not in validos:
                    err(tabla, f"'{col}' = '{fila.get(col)}' no existe en "
                               f"{dim}; agrégalo primero al catálogo",
                        fila.get("_n"))

    # --- 5. Reglas de negocio ---
    for tabla, descripcion, regla in schema.REGLAS:
        if tabla not in tablas:
            continue
        for fila in tablas[tabla]:
            try:
                ok = regla(fila)
            except Exception as e:  # noqa: BLE001
                ok = False
                descripcion = f"{descripcion} (no se pudo evaluar: {e})"
            if not ok:
                err(tabla, f"regla violada: {descripcion}", fila.get("_n"))

    # --- 6. Continuidad de periodos ---
    for tabla, filas in tablas.items():
        if "periodo" not in schema.TABLAS[tabla]["columnas"]:
            continue
        pers = sorted({str(f.get("periodo", "")) for f in filas
                       if RE_PERIODO.match(str(f.get("periodo", "")))})
        if not pers:
            continue
        y, m = int(pers[0][:4]), int(pers[0][5:7])
        esperado = []
        for _ in range(len(pers)):
            esperado.append(f"{y:04d}-{m:02d}")
            m += 1
            if m == 13:
                m, y = 1, y + 1
        faltantes = sorted(set(esperado) - set(pers))
        if faltantes:
            avisos.append(f"[{etiqueta} {tabla}] meses faltantes en la serie: "
                          f"{', '.join(faltantes)}")

    # --- Metas mínimas ---
    if "metas" in tablas:
        kpis = {str(f.get("kpi", "")) for f in tablas["metas"]}
        requeridos = {"rotacion_anualizada", "ausentismo", "cobertura_plantilla",
                      "pct_horas_extra", "cumplimiento_dc3"}
        faltan = requeridos - kpis
        if faltan:
            avisos.append(f"[{etiqueta} metas] sin meta definida para: "
                          f"{', '.join(sorted(faltan))}")

    return errores, avisos


def main():
    print("Validación de la base de datos — Dashboard de RRHH")
    print("-" * 60)
    try:
        tablas, config, fuente = cargador.cargar()
    except SystemExit as e:
        print(f"✗ {e}")
        return 1

    print(f"  Fuente: {cargador.describir_fuente(fuente)}")
    print(f"  Origen declarado: {config['origen']}")
    print("-" * 60)
    for t in schema.ORDEN_CARGA:
        print(f"  {t:<28} {len(tablas.get(t, [])):>6} registros")
    print("-" * 60)

    errores, avisos = validar(tablas, fuente)
    for a in avisos:
        print(f"AVISO   {a}")
    if errores:
        print(f"\n{len(errores)} ERROR(ES):\n")
        for e in errores[:60]:
            print(f"  ✗ {e}")
        if len(errores) > 60:
            print(f"  … y {len(errores) - 60} más")
        print("\nCorrige la celda indicada en el libro y vuelve a subirlo.")
        return 1
    print("\n✓ Base de datos válida.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
