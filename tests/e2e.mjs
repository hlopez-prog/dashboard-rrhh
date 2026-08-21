/*
 * Prueba end-to-end del Dashboard de RRHH.
 *
 *   node tests/e2e.mjs                 # corre y falla con exit 1 si algo rompe
 *   node tests/e2e.mjs --capturas      # además guarda PNG en tests/capturas/
 *
 * Levanta un servidor estático sobre public/, abre el tablero en Chromium y
 * verifica que:
 *   - no haya errores de consola ni excepciones de página
 *   - cada módulo renderice tarjetas, gráficos SVG y tablas
 *   - los filtros de unidad, área y periodo recalculen la vista
 *   - la alternancia "Ver tabla" funcione (regla de alivio de contraste)
 *   - el tooltip aparezca al pasar el cursor sobre una serie
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const PUBLICO = path.join(RAIZ, 'public');
const CAPTURAS = path.join(AQUI, 'capturas');
const guardarCapturas = process.argv.includes('--capturas');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function servidor(puerto = 0) {
  const s = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(PUBLICO, url === '/' ? 'index.html' : url);
    if (!f.startsWith(PUBLICO)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => s.listen(puerto, '127.0.0.1', () => r(s)));
}

let fallos = 0;
const resultados = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    resultados.push(`  ✓ ${nombre}`);
  } catch (e) {
    fallos++;
    resultados.push(`  ✗ ${nombre}\n      ${e.message}`);
  }
}

function afirmar(cond, msg) {
  if (!cond) throw new Error(msg);
}

const MODULOS = [
  ['tab-resumen', 'Resumen ejecutivo'],
  ['tab-plantilla', 'Plantilla, rotación y ausentismo'],
  ['tab-costo', 'Nómina y costo laboral'],
  ['tab-desarrollo', 'Capacitación y relaciones laborales'],
  ['tab-datos', 'Base de datos'],
];

async function main() {
  if (!fs.existsSync(path.join(PUBLICO, 'data', 'dashboard.json'))) {
    console.error('Falta public/data/dashboard.json — corre primero: python3 etl/build.py');
    process.exit(1);
  }
  if (guardarCapturas) fs.mkdirSync(CAPTURAS, { recursive: true });

  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}`;
  /* CHROMIUM_BIN permite apuntar a un Chromium ya instalado (CI, contenedor). */
  const navegador = await chromium.launch(
    process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {},
  );
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const pagina = await ctx.newPage();

  const problemas = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problemas.push(`${m.type()}: ${m.text()}`);
  });
  pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`));
  pagina.on('requestfailed', (r) => problemas.push(`requestfailed: ${r.url()}`));

  console.log(`Dashboard de RRHH · pruebas E2E  (${base})\n`);

  await pagina.goto(base, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('body[data-listo="true"]', { timeout: 15000 });

  await prueba('el tablero carga sin errores de consola', () => {
    afirmar(problemas.length === 0, `problemas: ${problemas.join(' | ')}`);
  });

  await prueba('el banner muestra el cierre y el commit', async () => {
    const t = await pagina.textContent('#banner-meta');
    afirmar(/Cierre/.test(t), 'no aparece el mes de cierre');
    afirmar(/commit/.test(t), 'no aparece el commit');
  });

  await prueba('el aviso de datos demo está visible', async () => {
    afirmar(await pagina.isVisible('#aviso'), 'el aviso demo debería mostrarse con .demo presente');
  });

  await prueba('la matriz ejecutiva tiene las cinco filas institucionales', async () => {
    const clases = await pagina.$$eval('table.matriz tbody tr', (rs) => rs.map((r) => r.className));
    for (const c of ['objetivo', 'exito', 'dependencia', 'riesgo', 'relaciones']) {
      afirmar(clases.includes(c), `falta la fila '${c}'`);
    }
  });

  await prueba('los encabezados de tabla son negros con texto blanco', async () => {
    const est = await pagina.$eval('table.matriz thead th', (n) => {
      const c = getComputedStyle(n);
      return { fondo: c.backgroundColor, texto: c.color };
    });
    afirmar(est.fondo === 'rgb(0, 0, 0)', `fondo del th = ${est.fondo}`);
    afirmar(est.texto === 'rgb(255, 255, 255)', `color del th = ${est.texto}`);
  });

  await prueba('las filas de objetivo usan el verde institucional #D9EAD3', async () => {
    const c = await pagina.$eval('table.matriz tr.objetivo td',
      (n) => getComputedStyle(n).backgroundColor);
    afirmar(c === 'rgb(217, 234, 211)', `fondo = ${c}`);
  });

  await prueba('las filas de riesgo usan el naranja institucional #FCE5CD', async () => {
    const c = await pagina.$eval('table.matriz tr.riesgo td',
      (n) => getComputedStyle(n).backgroundColor);
    afirmar(c === 'rgb(252, 229, 205)', `fondo = ${c}`);
  });

  await prueba('las celdas de relaciones usan el gris institucional #F2F2F2', async () => {
    const c = await pagina.$eval('table.matriz tr.relaciones td',
      (n) => getComputedStyle(n).backgroundColor);
    afirmar(c === 'rgb(242, 242, 242)', `fondo = ${c}`);
  });

  await prueba('el banner de título usa el gris institucional', async () => {
    const c = await pagina.$eval('.banner', (n) => getComputedStyle(n).backgroundColor);
    afirmar(c === 'rgb(242, 242, 242)', `fondo = ${c}`);
  });

  await prueba('cada tarjeta de KPI trae icono y etiqueta de estado, no solo color', async () => {
    const etiquetas = await pagina.$$eval('.kpi .etiqueta-estado', (ns) => ns.map((n) => n.textContent.trim()));
    afirmar(etiquetas.length >= 6, `solo ${etiquetas.length} etiquetas de estado`);
    afirmar(etiquetas.every((t) => /^[●▲–]/.test(t)), 'alguna etiqueta no lleva icono');
  });

  await prueba('los KPIs muestran valores numéricos, no marcadores vacíos', async () => {
    const valores = await pagina.$$eval('.kpi-valor', (ns) => ns.map((n) => n.textContent.trim()));
    const vacios = valores.filter((v) => v === '—' || v === '');
    afirmar(vacios.length === 0, `${vacios.length} de ${valores.length} tarjetas sin valor`);
  });

  /* --- Recorrido por módulos --- */
  for (const [tab, nombre] of MODULOS) {
    await pagina.click(`#${tab}`);
    await pagina.waitForTimeout(500);
    await prueba(`el módulo "${nombre}" renderiza contenido`, async () => {
      const secciones = await pagina.$$eval('#panel .seccion', (n) => n.length);
      afirmar(secciones >= 1, 'el panel quedó vacío');
      const err = await pagina.$('#panel .error-carga');
      afirmar(!err, 'el panel muestra un error');
      if (tab !== 'tab-datos') {
        const svgs = await pagina.$$eval('#panel svg', (n) => n.length);
        afirmar(svgs >= 1, 'no hay ningún gráfico SVG');
      }
    });
    if (guardarCapturas) {
      await pagina.screenshot({
        path: path.join(CAPTURAS, `${tab.replace('tab-', '')}.png`),
        fullPage: true,
      });
    }
  }

  /* --- Interacción --- */
  await pagina.click('#tab-plantilla');
  await pagina.waitForTimeout(400);

  await prueba('el botón "Ver tabla" alterna gráfico y tabla', async () => {
    const btn = await pagina.$('#panel .ver-tabla');
    afirmar(btn, 'no hay botón "Ver tabla"');
    await btn.click();
    await pagina.waitForTimeout(200);
    afirmar(await btn.textContent() === 'Ver gráfico', 'el botón no cambió de etiqueta');
    const tablas = await pagina.$$eval('#panel table.datos', (n) => n.length);
    afirmar(tablas >= 1, 'no apareció ninguna tabla de datos');
    await btn.click();
    await pagina.waitForTimeout(200);
    afirmar(await btn.textContent() === 'Ver tabla', 'el botón no volvió a su estado');
  });

  /* El objetivo de hover debe ser la banda completa de la categoría, no solo
     la marca: se prueba en el centro vertical del área de trazado. */
  for (const [tipo, indice] of [['barras', 0], ['líneas', 1]]) {
    await prueba(`el tooltip aparece al pasar el cursor (${tipo})`, async () => {
      const graficos = await pagina.$$('#panel .grafico');
      const svg = await graficos[indice].$('svg');
      /* mouse.move usa coordenadas del viewport: el gráfico debe estar visible. */
      await svg.scrollIntoViewIfNeeded();
      await pagina.waitForTimeout(150);
      const caja = await svg.boundingBox();
      await pagina.mouse.move(caja.x + caja.width * 0.55, caja.y + caja.height * 0.45);
      await pagina.waitForTimeout(250);
      const visible = await graficos[indice].$$eval('.tooltip[data-visible="true"]', (n) => n.length);
      afirmar(visible >= 1, 'ningún tooltip visible');
      const texto = await graficos[indice].$eval('.tooltip', (n) => n.textContent);
      afirmar(/\d/.test(texto), `el tooltip no muestra valores: "${texto}"`);
    });
  }

  await prueba('filtrar por una unidad reduce el headcount reportado', async () => {
    await pagina.click('#tab-plantilla');
    await pagina.waitForTimeout(400);
    const antes = await pagina.textContent('#panel .kpi .kpi-valor');
    /* Los chips se reconstruyen en cada render: hay que volver a consultarlos. */
    for (let i = 4; i >= 1; i--) {
      const chips = await pagina.$$('#filtros .campo:nth-of-type(2) .chip');
      await chips[i].click();
      await pagina.waitForTimeout(250);
    }
    const despues = await pagina.textContent('#panel .kpi .kpi-valor');
    afirmar(antes !== despues, `el valor no cambió (${antes})`);
    const n = (s) => Number(s.replace(/[^\d]/g, ''));
    afirmar(n(despues) < n(antes), `${despues} debería ser menor que ${antes}`);
  });

  await prueba('"Limpiar filtros" restablece la vista completa', async () => {
    await pagina.click('#filtros .boton');
    await pagina.waitForTimeout(500);
    const activos = await pagina.$$eval('#filtros .chips .chip[aria-pressed="true"]', (n) => n.length);
    afirmar(activos >= 5, `solo ${activos} chips activos tras limpiar`);
  });

  await prueba('cambiar el rango a 6 meses recorta el eje de tiempo', async () => {
    await pagina.selectOption('#sel-meses', '6');
    await pagina.waitForTimeout(500);
    /* Se mide dentro del primer gráfico, no en todo el panel: hay tablas
       comparativas por unidad que siempre están visibles. */
    const grafico = (await pagina.$$('#panel .grafico'))[0];
    await (await grafico.$('.ver-tabla')).click();
    await pagina.waitForTimeout(250);
    const filas = await grafico.$$eval('table.datos tbody tr', (n) => n.length);
    afirmar(filas === 6, `la tabla tiene ${filas} filas, se esperaban 6`);
    await pagina.selectOption('#sel-meses', '24');
    await pagina.waitForTimeout(400);
  });

  await prueba('no aparecieron errores nuevos durante la interacción', () => {
    afirmar(problemas.length === 0, `problemas: ${problemas.slice(0, 5).join(' | ')}`);
  });

  console.log(resultados.join('\n'));
  console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas pasaron.`);
  if (guardarCapturas) console.log(`Capturas en ${path.relative(RAIZ, CAPTURAS)}/`);

  await navegador.close();
  srv.close();
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
