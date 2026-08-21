"""
Pruebas de la base de datos en Excel y del validador.

    python3 -m unittest discover -s tests -v

Verifican tres cosas que importan en la operación mensual:
  1. Que el libro se lea igual que se escribió (ida y vuelta sin pérdida).
  2. Que un error de captura realista sea detectado, con la fila correcta.
  3. Que el libro traiga las ayudas de captura que RRHH necesita.
"""
import os
import shutil
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "etl"))

import schema  # noqa: E402
import excel  # noqa: E402
import validate  # noqa: E402
import cargar as cargador  # noqa: E402

from openpyxl import load_workbook  # noqa: E402


def libro_existe():
    return os.path.exists(excel.LIBRO)


@unittest.skipUnless(libro_existe(), "falta data/BASE_RRHH.xlsx")
class TestLecturaLibro(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tablas, cls.config = excel.leer()

    def test_estan_todas_las_hojas(self):
        for tabla in schema.ORDEN_CARGA:
            self.assertIn(tabla, self.tablas, f"falta la hoja {tabla}")

    def test_ninguna_hoja_vacia(self):
        for tabla, filas in self.tablas.items():
            self.assertGreater(len(filas), 0, f"la hoja {tabla} no tiene registros")

    def test_encabezados_exactos_y_en_orden(self):
        wb = load_workbook(excel.LIBRO, read_only=True)
        for tabla in schema.ORDEN_CARGA:
            esperados = list(schema.TABLAS[tabla]["columnas"].keys())
            ws = wb[tabla]
            reales = [ws.cell(row=1, column=j).value
                      for j in range(1, len(esperados) + 1)]
            self.assertEqual(reales, esperados, f"encabezados de {tabla}")
        wb.close()

    def test_los_periodos_se_leen_como_texto_aaaa_mm(self):
        # Excel convierte "2026-08" en fecha si la columna no es texto.
        for fila in self.tablas["fact_plantilla"][:50]:
            self.assertRegex(str(fila["periodo"]), r"^\d{4}-(0[1-9]|1[0-2])$")

    def test_los_numeros_se_leen_como_numeros(self):
        fila = self.tablas["fact_nomina"][0]
        self.assertIsInstance(fila["costo_ordinario"], (int, float))
        self.assertGreater(fila["costo_ordinario"], 0)

    def test_la_configuracion_viene_de_la_hoja_leeme(self):
        self.assertIn(self.config["origen"], ("DEMO", "REAL"))
        self.assertTrue(self.config["organizacion"])

    def test_el_libro_pasa_la_validacion(self):
        errores, _ = validate.validar(excel.leer()[0], "excel")
        self.assertEqual(errores, [], f"primeros errores: {errores[:5]}")

    def test_la_carga_da_precedencia_al_libro_de_excel(self):
        _, _, fuente = cargador.cargar()
        self.assertEqual(fuente, "excel")


@unittest.skipUnless(libro_existe(), "falta data/BASE_RRHH.xlsx")
class TestAyudasDeCaptura(unittest.TestCase):
    """El libro es la herramienta de captura: debe guiar a quien lo llena."""

    @classmethod
    def setUpClass(cls):
        cls.wb = load_workbook(excel.LIBRO)

    @classmethod
    def tearDownClass(cls):
        cls.wb.close()

    def test_tiene_hoja_de_instrucciones_al_inicio(self):
        self.assertEqual(self.wb.sheetnames[0], excel.HOJA_LEEME)

    def test_los_encabezados_son_negros_con_texto_blanco(self):
        ws = self.wb["fact_plantilla"]
        celda = ws["A1"]
        self.assertEqual(celda.fill.fgColor.rgb, excel.NEGRO)
        self.assertEqual(celda.font.color.rgb, excel.BLANCO)
        self.assertTrue(celda.font.bold)

    def test_el_encabezado_queda_congelado(self):
        for tabla in schema.ORDEN_CARGA:
            self.assertEqual(self.wb[tabla].freeze_panes, "A2", f"hoja {tabla}")

    def test_las_columnas_de_catalogo_tienen_desplegable(self):
        ws = self.wb["fact_plantilla"]
        rangos = [str(dv.sqref) for dv in ws.data_validations.dataValidation]
        self.assertTrue(rangos, "la hoja no tiene ninguna validación")
        listas = [dv for dv in ws.data_validations.dataValidation if dv.type == "list"]
        self.assertGreaterEqual(len(listas), 3,
                                "faltan listas para tipo_relacion, turno, unidad_id, area_id")

    def test_la_llave_primaria_esta_anotada_en_la_hoja(self):
        for tabla in schema.ORDEN_CARGA:
            comentario = self.wb[tabla]["A1"].comment
            self.assertIsNotNone(comentario, f"hoja {tabla} sin nota de llave")
            for col in schema.TABLAS[tabla]["pk"]:
                self.assertIn(col, comentario.text, f"hoja {tabla}")

    def test_la_celda_de_origen_solo_acepta_demo_o_real(self):
        ws = self.wb[excel.HOJA_LEEME]
        listas = [dv for dv in ws.data_validations.dataValidation if dv.type == "list"]
        self.assertTrue(any("DEMO" in (dv.formula1 or "") for dv in listas))


@unittest.skipUnless(libro_existe(), "falta data/BASE_RRHH.xlsx")
class TestValidadorAtrapaErrores(unittest.TestCase):
    """
    Errores de captura realistas. Cada uno debe detenerse ANTES de publicar,
    y el mensaje debe traer el número de fila del libro.
    """

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.copia = os.path.join(self.dir, "BASE.xlsx")
        shutil.copy(excel.LIBRO, self.copia)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _validar_tras_editar(self, hoja, celda, valor):
        wb = load_workbook(self.copia)
        wb[hoja][celda] = valor
        wb.save(self.copia)
        wb.close()
        tablas, _ = excel.leer(self.copia)
        return validate.validar(tablas, "excel")[0]

    def test_atrapa_ausentismo_mayor_que_horas_programadas(self):
        # horas_ausencia (col E) por arriba de horas_programadas (col D)
        errores = self._validar_tras_editar("fact_ausentismo", "E2", 999999)
        self.assertTrue(any("horas_ausencia <= horas_programadas" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")
        self.assertTrue(any("fila 2" in e for e in errores))

    def test_atrapa_periodo_mal_escrito(self):
        errores = self._validar_tras_editar("fact_plantilla", "A2", "ago-2026")
        self.assertTrue(any("periodo inválido" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_atrapa_unidad_inexistente(self):
        errores = self._validar_tras_editar("fact_nomina", "B2", "U99")
        self.assertTrue(any("no existe en dim_unidad" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_atrapa_texto_donde_va_numero(self):
        errores = self._validar_tras_editar("fact_plantilla", "F2", "cuarenta")
        self.assertTrue(any("donde se" in e and "número" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_atrapa_valor_fuera_de_catalogo(self):
        errores = self._validar_tras_editar("fact_plantilla", "D2", "Eventual")
        self.assertTrue(any("fuera de catálogo" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_atrapa_dc3_emitidos_mayor_que_requeridos(self):
        errores = self._validar_tras_editar("fact_capacitacion", "H2", 999999)
        self.assertTrue(any("dc3_emitidos <= dc3_requeridos" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_atrapa_llave_duplicada(self):
        wb = load_workbook(self.copia)
        ws = wb["dim_unidad"]
        ws["A3"] = ws["A2"].value  # dos unidades con la misma clave
        wb.save(self.copia)
        wb.close()
        tablas, _ = excel.leer(self.copia)
        errores = validate.validar(tablas, "excel")[0]
        self.assertTrue(any("llave duplicada" in e for e in errores),
                        f"errores obtenidos: {errores[:3]}")

    def test_un_libro_valido_no_produce_errores(self):
        tablas, _ = excel.leer(self.copia)
        self.assertEqual(validate.validar(tablas, "excel")[0], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
