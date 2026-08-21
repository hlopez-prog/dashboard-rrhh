"""
Generador de la base de datos DEMO del Dashboard de RRHH.

Produce datos sintéticos realistas de una minera mexicana multi-unidad con
24 meses de historia. Determinista (seed fija): dos corridas producen el
mismo dataset, para que los tests y el diff de git sean estables.

    python3 etl/seed_demo.py            # escribe data/csv/*.csv
    python3 etl/excel.py crear          # arma data/BASE_RRHH.xlsx con esos datos

ADVERTENCIA: son datos ficticios de demostración. La base de datos real es
data/BASE_RRHH.xlsx; este script solo sirve para regenerar el dataset de
demostración desde cero.
"""
import csv
import os
import random

random.seed(20260820)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "data", "csv")

MES_FINAL = (2026, 7)  # último mes cerrado
N_MESES = 24


def periodos():
    y, m = MES_FINAL
    out = []
    for _ in range(N_MESES):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(out))


PERIODOS = periodos()

UNIDADES = [
    # unidad_id, unidad, estado, tipo_operacion, mineral, corporativo
    ("U01", "Mina La Esperanza", "Zacatecas", "Subterránea", "Plata-Zinc", 0),
    ("U02", "Mina San Rafael", "Durango", "Cielo abierto", "Oro", 0),
    ("U03", "Unidad El Refugio", "Sonora", "Cielo abierto", "Cobre", 0),
    ("U04", "Planta Concentradora Norte", "Chihuahua", "Planta", "Plomo-Zinc", 0),
    ("U05", "Corporativo", "Ciudad de México", "Corporativo", "N/A", 1),
]

AREAS = [
    # area_id, area, tipo_area, es_critica
    ("A01", "Mina Subterránea", "Mina", 1),
    ("A02", "Mina Tajo", "Mina", 1),
    ("A03", "Planta de Beneficio", "Planta", 1),
    ("A04", "Mantenimiento", "Mantenimiento", 1),
    ("A05", "Seguridad y Salud", "Seguridad", 0),
    ("A06", "Administración y RRHH", "Administración", 0),
]

# Estructura por unidad: area -> (headcount_propio_base, contratistas_base, turno)
ESTRUCTURA = {
    "U01": {
        "A01": (420, 260, "7x7"),
        "A03": (150, 40, "4x3"),
        "A04": (185, 95, "4x3"),
        "A05": (34, 6, "Administrativo"),
        "A06": (48, 8, "Administrativo"),
    },
    "U02": {
        "A02": (380, 300, "14x14"),
        "A03": (165, 45, "4x3"),
        "A04": (170, 110, "4x3"),
        "A05": (30, 5, "Administrativo"),
        "A06": (41, 7, "Administrativo"),
    },
    "U03": {
        "A02": (455, 340, "14x14"),
        "A03": (205, 55, "4x3"),
        "A04": (210, 125, "4x3"),
        "A05": (38, 8, "Administrativo"),
        "A06": (52, 9, "Administrativo"),
    },
    "U04": {
        "A03": (295, 90, "4x3"),
        "A04": (130, 70, "4x3"),
        "A05": (22, 4, "Administrativo"),
        "A06": (33, 6, "Administrativo"),
    },
    "U05": {
        "A05": (12, 0, "Administrativo"),
        "A06": (96, 14, "Administrativo"),
    },
}

# Perfil de riesgo/desempeño por unidad (multiplicadores)
# Perfil por unidad. Calibrado para que el tablero demo muestre una mezcla
# realista de indicadores en meta y fuera de meta: dos unidades con problema
# claro, una intermedia y dos sanas. Un tablero donde todo está en rojo no
# sirve para validar el semáforo.
PERFIL = {
    "U01": {"rot": 1.45, "aus": 1.28, "he": 1.42, "cap": 0.955, "riesgo": 4},
    "U02": {"rot": 1.00, "aus": 0.92, "he": 1.00, "cap": 0.995, "riesgo": 2},
    "U03": {"rot": 1.55, "aus": 1.12, "he": 1.28, "cap": 0.970, "riesgo": 3},
    "U04": {"rot": 0.78, "aus": 0.80, "he": 0.82, "cap": 1.020, "riesgo": 2},
    "U05": {"rot": 0.78, "aus": 0.62, "he": 0.55, "cap": 1.030, "riesgo": 1},
}

SINDICATOS = {
    "U01": "Sindicato Nacional Minero Metalúrgico - Sec. 12",
    "U02": "Sindicato Minero Independiente Durango",
    "U03": "Sindicato Nacional Minero Metalúrgico - Sec. 41",
    "U04": "Sindicato de Trabajadores de la Industria Metalúrgica",
    "U05": "No sindicalizado",
}

SALARIO_MES = {  # costo ordinario mensual promedio por persona (MXN)
    "A01": 24500, "A02": 26800, "A03": 22400,
    "A04": 25600, "A05": 27300, "A06": 34500,
}


def estacional(i, amp, fase=0.0):
    """Onda anual suave: rotación y ausentismo suben en temporadas."""
    import math
    return amp * math.sin(2 * math.pi * ((i % 12) / 12.0) + fase)


def tendencia(i, delta):
    """Deriva lineal a lo largo de los 24 meses."""
    return delta * (i / (N_MESES - 1))


def r(v, pct=0.06):
    """Ruido multiplicativo."""
    return v * (1 + random.uniform(-pct, pct))


def escribir(nombre, encabezados, filas):
    ruta = os.path.join(DESTINO, f"{nombre}.csv")
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(encabezados)
        w.writerows(filas)
    print(f"  {nombre}.csv  ({len(filas)} filas)")


def main():
    os.makedirs(DESTINO, exist_ok=True)
    print(f"Generando base demo: {PERIODOS[0]} → {PERIODOS[-1]}")

    escribir("dim_unidad",
             ["unidad_id", "unidad", "estado", "tipo_operacion",
              "mineral_principal", "es_corporativo"], UNIDADES)
    escribir("dim_area", ["area_id", "area", "tipo_area", "es_critica"], AREAS)

    plantilla, movs, aus, nom, cap, rl = [], [], [], [], [], []

    for i, per in enumerate(PERIODOS):
        for uid, _, _, _, _, _ in UNIDADES:
            p = PERFIL[uid]
            hc_unidad_propio = 0
            for aid, (base_prop, base_cont, turno) in ESTRUCTURA[uid].items():
                critica = dict((a[0], a[3]) for a in AREAS)[aid]

                # ---------- Plantilla ----------
                crec = 1 + tendencia(i, 0.06) + estacional(i, 0.015)
                hc_prop = max(1, int(r(base_prop * crec, 0.03)))
                hc_cont = max(0, int(r(base_cont * (1 + tendencia(i, 0.11)), 0.07)))
                hc_unidad_propio += hc_prop

                autorizada = int(base_prop * 1.06)
                pct_mujeres = 0.30 if aid == "A06" else (0.19 if aid == "A05" else 0.09)
                antig = r(78 - 26 * (p["rot"] - 0.8), 0.08)

                pc_tot = max(2, int(hc_prop * (0.16 if critica else 0.07)))
                brecha = 0.042 * p["rot"] + max(0.0, estacional(i, 0.02))
                pc_ok = max(0, int(pc_tot * (1 - brecha)))

                plantilla.append([
                    per, uid, aid, "Propio", turno, hc_prop, autorizada,
                    int(hc_prop * pct_mujeres), round(antig, 1), pc_tot, pc_ok,
                ])
                if hc_cont > 0:
                    plantilla.append([
                        per, uid, aid, "Contratista", turno, hc_cont, 0,
                        int(hc_cont * pct_mujeres * 0.55), round(antig * 0.32, 1), 0, 0,
                    ])

                # ---------- Movimientos ----------
                tasa_baja = (0.0092 * p["rot"]) * (1 + estacional(i, 0.22, 1.1)) \
                            * (1 + tendencia(i, 0.10))
                # round, no int: truncar sesga sistemáticamente a la baja en
                # áreas pequeñas y las dejaba con rotación cero perpetua.
                bajas = max(0, round(r(hc_prop * tasa_baja, 0.20)))
                bajas_vol = int(bajas * random.uniform(0.62, 0.80))
                bajas_inv = bajas - bajas_vol
                temprana = int(bajas_vol * random.uniform(0.22, 0.42))
                altas = max(0, int(r(bajas * random.uniform(0.85, 1.30), 0.18)))
                vac = max(0, int(r((autorizada - hc_prop) * 0.55 + bajas * 0.7, 0.25)))
                dias_cob = r((32 if critica else 23) * (1 + tendencia(i, 0.14)), 0.12)
                movs.append([per, uid, aid, altas, bajas_vol, bajas_inv,
                             temprana, vac, round(dias_cob, 1)])

                # ---------- Ausentismo ----------
                hrs_prog = hc_prop * (192 if turno != "Administrativo" else 176)
                tasa_aus = 0.0270 * p["aus"] * (1 + estacional(i, 0.26, 0.4)) \
                           * (1 + tendencia(i, 0.08))
                hrs_aus = min(hrs_prog * 0.20, r(hrs_prog * tasa_aus, 0.14))
                casos = max(0, int(r(hc_prop * 0.026 * p["aus"], 0.22)))
                dias_inc = int(casos * random.uniform(3.4, 8.2))
                aus.append([per, uid, aid, round(hrs_prog, 1), round(hrs_aus, 1),
                            casos, dias_inc])

                # ---------- Nómina y productividad ----------
                sal = SALARIO_MES[aid] * (1 + tendencia(i, 0.083))  # revisión salarial
                costo_ord = r(hc_prop * sal, 0.03)
                tasa_he = 0.0455 * p["he"] * (1 + estacional(i, 0.30, 0.9)) \
                          * (1 + tendencia(i, 0.14))
                hrs_ord = hc_prop * (192 if turno != "Administrativo" else 176)
                hrs_he = r(hrs_ord * tasa_he, 0.16)
                costo_he = hrs_he * (sal / 192) * 2.0
                prest = costo_ord * random.uniform(0.33, 0.39)
                presupuesto = (costo_ord + prest) * 1.045 + costo_he * 0.72
                if aid in ("A01", "A02", "A03"):
                    ton = r(hc_prop * (1180 if aid != "A03" else 1520)
                            * (1 + tendencia(i, 0.045)), 0.07)
                else:
                    ton = 0.0
                nom.append([per, uid, aid, round(costo_ord), round(costo_he),
                            round(prest), round(hrs_ord, 1), round(hrs_he, 1),
                            round(presupuesto), round(ton, 1)])

                # ---------- Capacitación ----------
                h_plan = hc_prop * (2.6 if critica else 1.7)
                h_real = r(h_plan * min(1.02, p["cap"] * (1 + estacional(i, 0.10, 2.0))), 0.10)
                dc3_req = max(1, int(hc_prop * 0.30))
                dc3_emi = int(dc3_req * min(0.995, p["cap"] * random.uniform(0.975, 1.015)))
                inv = h_real * random.uniform(255, 420)
                comp_req = pc_tot
                comp_ok = max(0, int(comp_req * min(0.985, p["cap"] * random.uniform(0.955, 1.0))))
                cap.append([per, uid, aid, round(h_plan, 1), round(h_real, 1),
                            max(1, int(hc_prop * 0.45)), dc3_req, dc3_emi,
                            round(inv), comp_req, comp_ok])

            # ---------- Relaciones laborales (por unidad) ----------
            sindicalizados = 0 if uid == "U05" else int(hc_unidad_propio * random.uniform(0.68, 0.86))
            empl = 0
            if uid != "U05" and random.random() < 0.055 * p["riesgo"]:
                empl = 1
            abiertos = max(0, int(r(p["riesgo"] * 1.6 * (1 + tendencia(i, 0.28)), 0.30)))
            cerrados = max(0, int(abiertos * random.uniform(0.35, 0.85)))
            # revisión de CCT cada 24 meses, salarial cada 12
            dias_cct = (365 - ((i * 30 + {"U01": 40, "U02": 190, "U03": 95,
                                          "U04": 260, "U05": 0}[uid]) % 365))
            enps = r(43 - 6.5 * (p["riesgo"] - 1) + tendencia(i, -0.14) * 30, 0.09)
            rl.append([per, uid, SINDICATOS[uid], sindicalizados, empl, abiertos,
                       cerrados, 0 if uid == "U05" else dias_cct, p["riesgo"],
                       round(enps, 1), round(r(0.72, 0.10), 3)])

    escribir("fact_plantilla",
             ["periodo", "unidad_id", "area_id", "tipo_relacion", "turno",
              "headcount", "dotacion_autorizada", "mujeres",
              "antiguedad_prom_meses", "puestos_criticos_totales",
              "puestos_criticos_cubiertos"], plantilla)
    escribir("fact_movimientos",
             ["periodo", "unidad_id", "area_id", "altas", "bajas_voluntarias",
              "bajas_involuntarias", "bajas_menos_90_dias", "vacantes_abiertas",
              "dias_cobertura_prom"], movs)
    escribir("fact_ausentismo",
             ["periodo", "unidad_id", "area_id", "horas_programadas",
              "horas_ausencia", "casos_incapacidad", "dias_incapacidad"], aus)
    escribir("fact_nomina",
             ["periodo", "unidad_id", "area_id", "costo_ordinario",
              "costo_horas_extra", "costo_prestaciones", "horas_ordinarias",
              "horas_extra", "presupuesto_costo_laboral", "toneladas_movidas"], nom)
    escribir("fact_capacitacion",
             ["periodo", "unidad_id", "area_id", "horas_plan", "horas_real",
              "participantes", "dc3_requeridos", "dc3_emitidos", "inversion_mxn",
              "competencias_criticas_req", "competencias_criticas_ok"], cap)
    escribir("fact_relaciones_laborales",
             ["periodo", "unidad_id", "sindicato", "trabajadores_sindicalizados",
              "emplazamientos", "conflictos_abiertos", "conflictos_cerrados",
              "dias_a_revision_cct", "riesgo_sindical", "enps",
              "participacion_clima"], rl)

    metas = [
        ["rotacion_anualizada", "Rotación anualizada", 14.0, "menor_mejor", "%"],
        ["rotacion_voluntaria", "Rotación voluntaria anualizada", 9.5, "menor_mejor", "%"],
        ["ausentismo", "Tasa de ausentismo", 3.0, "menor_mejor", "%"],
        ["cobertura_plantilla", "Cobertura de plantilla autorizada", 97.0, "mayor_mejor", "%"],
        ["cobertura_critica", "Cobertura de puestos críticos", 95.0, "mayor_mejor", "%"],
        ["rotacion_temprana", "Rotación temprana (<90 días)", 18.0, "menor_mejor", "%"],
        ["dias_cobertura", "Días para cubrir vacante", 32.0, "menor_mejor", "días"],
        ["pct_contratistas", "Contratistas sobre fuerza total", 32.0, "menor_mejor", "%"],
        ["pct_horas_extra", "Horas extra sobre ordinarias", 6.0, "menor_mejor", "%"],
        ["var_presupuesto", "Variación vs presupuesto", 1.5, "menor_mejor", "%"],
        ["costo_por_tonelada", "Costo laboral por tonelada", 48.0, "menor_mejor", "MXN/t"],
        ["productividad", "Productividad", 4.40, "mayor_mejor", "t/HH"],
        ["cumplimiento_plan_cap", "Cumplimiento del plan de capacitación", 95.0, "mayor_mejor", "%"],
        ["cumplimiento_dc3", "Cumplimiento DC-3", 98.0, "mayor_mejor", "%"],
        ["horas_cap_por_persona", "Horas de capacitación por persona", 2.10, "mayor_mejor", "HH"],
        ["cobertura_competencias", "Cobertura de matriz de competencias", 95.0, "mayor_mejor", "%"],
        ["enps", "eNPS", 30.0, "mayor_mejor", "pts"],
    ]
    escribir("metas", ["kpi", "nombre", "meta", "direccion", "unidad_medida"], metas)
    print("Listo.")


if __name__ == "__main__":
    main()
