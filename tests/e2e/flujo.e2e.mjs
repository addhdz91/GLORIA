// E2E: el frontend real contra el backend real (simulador de Apps Script, API de Claude simulada).
// Ejecutar: npm run e2e   (usa Playwright con Chromium; PLAYWRIGHT_CHROMIUM_PATH si ya está instalado)
// CAPTURAS=/ruta guarda capturas de cada pantalla.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { crearServidor } from '../../tools/dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const CAPTURAS = process.env.CAPTURAS || '';
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const LARGO =
  'Primero escucho con calma lo que el cliente necesita y le pregunto qué han intentado antes, quiénes participan y qué esperan lograr. ' +
  'Después propongo un camino concreto, con pasos pequeños y acuerdos claros, y lo revisamos juntos cada semana.';

/** Reconocimiento de voz simulado: al empezar «dice» dos frases. */
const VOZ_SIMULADA = () => {
  class ReconocimientoSimulado {
    start() {
      if (this.emitido) return;
      this.emitido = true;
      const frases = window.__frasesVoz || ['bueno eh yo diría que primero escucho', 'y luego decido'];
      setTimeout(() => this.onsoundstart && this.onsoundstart(), 30);
      frases.forEach((f, i) =>
        setTimeout(() => {
          const res = [{ transcript: f }];
          res.isFinal = true;
          this.onresult && this.onresult({ resultIndex: 0, results: [res] });
        }, 200 * (i + 1)),
      );
    }
    stop() {
      setTimeout(() => this.onend && this.onend(), 10);
    }
    abort() {}
  }
  window.webkitSpeechRecognition = ReconocimientoSimulado;
  window.SpeechRecognition = ReconocimientoSimulado;
};

let servidor, proyecto, navegador, base;

before(async () => {
  ({ servidor, proyecto } = crearServidor({ ahora: new Date('2026-11-02T14:00:00Z'), retrasoAnalisisMs: 300 }));
  await new Promise((r) => servidor.listen(0, r));
  base = `http://localhost:${servidor.address().port}`;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  navegador = await chromium.launch({ executablePath });
});

after(async () => {
  await navegador?.close();
  servidor?.close();
});

async function nuevaPagina(opciones = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    locale: 'es-CO',
    hasTouch: true,
    ...opciones,
  });
  await contexto.addInitScript(VOZ_SIMULADA);
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  return { contexto, pagina, errores };
}

async function captura(pagina, nombre) {
  if (!CAPTURAS) return;
  await pagina.waitForTimeout(400); // fin de la animación de entrada
  await pagina.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
}

/** Sin desplazamiento horizontal y botones visibles de al menos 48 px de alto (sección 3.6). */
async function comprobarDiseno(pagina, donde) {
  const problemas = await pagina.evaluate(() => {
    const out = [];
    const raiz = document.documentElement;
    if (raiz.scrollWidth > raiz.clientWidth + 1) out.push(`scroll horizontal ${raiz.scrollWidth} > ${raiz.clientWidth}`);
    for (const b of document.querySelectorAll('button, input[type=checkbox], .opcion')) {
      const r = b.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
      if (!visible || b.closest('.oculto')) continue;
      const casilla = b.matches('input[type=checkbox]');
      const alto = casilla ? b.closest('label').getBoundingClientRect().height : r.height;
      if (alto < 44) out.push(`objetivo táctil pequeño (${Math.round(alto)} px): ${b.textContent.trim() || b.getAttribute('aria-label') || b.id}`);
    }
    return out;
  });
  assert.deepEqual(problemas, [], donde);
}

async function filas(hoja) {
  return (await fetch(`${base}/__dev/filas?hoja=${hoja}`)).json();
}

test('Gloria: acceso, consentimiento, tutorial, sesión 1 completa (escrita, voz, repreguntas, borrador, sin conexión)', async () => {
  const { contexto, pagina, errores } = await nuevaPagina();
  await pagina.goto(base);

  // 1. Acceso
  await pagina.getByRole('heading', { name: 'Hola, Gloria' }).waitFor();
  await comprobarDiseno(pagina, 'acceso');
  await captura(pagina, '01-acceso');
  await pagina.getByLabel('Código de acceso').fill('incorrecto');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByText('El código no es correcto').waitFor();
  await pagina.getByLabel('Código de acceso').fill('prueba');
  await pagina.getByRole('button', { name: 'Entrar' }).click();

  // 2. Consentimiento
  await pagina.getByRole('heading', { name: 'Antes de empezar' }).waitFor();
  await comprobarDiseno(pagina, 'consentimiento');
  await captura(pagina, '02-consentimiento');
  assert.equal(await pagina.getByRole('button', { name: 'Continuar' }).isDisabled(), true);
  await pagina.getByLabel('He leído esta información y acepto participar.').check();
  await pagina.getByRole('button', { name: 'Continuar' }).click();

  // 3. Tutorial (3 pantallas, con prueba del micrófono)
  await pagina.getByRole('heading', { name: 'Responder escribiendo' }).waitFor();
  await pagina.getByRole('button', { name: 'Siguiente' }).click();
  await pagina.getByRole('heading', { name: 'Responder hablando' }).waitFor();
  await pagina.getByRole('button', { name: 'Probar el micrófono' }).click();
  await pagina.getByText('bueno eh yo diría que primero escucho').waitFor();
  await comprobarDiseno(pagina, 'tutorial');
  await captura(pagina, '03-tutorial-voz');
  await pagina.getByRole('button', { name: 'Saltar el tutorial' }).click();

  // 4. Panel
  await pagina.getByRole('heading', { name: 'Hola, Gloria' }).waitFor();
  await pagina.getByText('0 de 30').waitFor();
  await comprobarDiseno(pagina, 'panel');
  await captura(pagina, '04-panel-inicio');
  await pagina.getByRole('button', { name: 'Empezar sesión 1' }).click();

  // 5. Pregunta escrita + borrador que sobrevive a cerrar el navegador
  await pagina.getByText('Sesión 1 · Pregunta 1 de 4').waitFor();
  await pagina.getByRole('heading', { name: /Pega aquí tu hoja de vida/ }).waitFor();
  await comprobarDiseno(pagina, 'pregunta escrita');
  await pagina.getByLabel('Tu respuesta', { exact: true }).fill('Soy coach y consultora desde hace');
  await pagina.waitForTimeout(1800);
  await captura(pagina, '05-pregunta-escrita');
  await pagina.reload();
  await pagina.getByRole('button', { name: /Continuar sesión 1 \(te faltan 4 preguntas\)/ }).click();
  assert.equal(await pagina.getByLabel('Tu respuesta', { exact: true }).inputValue(), 'Soy coach y consultora desde hace');
  await pagina.getByLabel('Tu respuesta', { exact: true }).fill('Soy coach y consultora desde hace más de veinte años. ' + LARGO);
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();

  // 6. Pregunta por voz: transcripción en vivo, «Terminé», edición y repregunta
  await pagina.getByText('Sesión 1 · Pregunta 2 de 4').waitFor();
  await pagina.getByRole('button', { name: 'Escuchar pregunta' }).waitFor();
  await pagina.getByRole('button', { name: 'Empezar a hablar' }).click();
  await pagina.getByText('Escuchando…').waitFor();
  await pagina.locator('#transcripcion').getByText('y luego decido').waitFor();
  await comprobarDiseno(pagina, 'pregunta voz');
  await captura(pagina, '06-pregunta-voz');
  await pagina.getByRole('button', { name: 'Terminé' }).click();
  const editor = pagina.getByLabel('Tu respuesta', { exact: true });
  await editor.waitFor();
  assert.equal(await editor.inputValue(), 'bueno eh yo diría que primero escucho y luego decido');
  await editor.fill('Bueno, yo diría que primero escucho y luego decido.');
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();
  // Respuesta corta: aparece una repregunta.
  await pagina.getByText('Una pregunta más sobre esto').waitFor();
  await pagina.getByRole('heading', { name: '¿Qué te hizo decidirlo así en ese momento?' }).waitFor();
  await captura(pagina, '07-repregunta');
  const voz = (await filas('Respuestas')).find((r) => r.pregunta_id === 'S01-P2');
  assert.equal(voz.respuesta_original, 'bueno eh yo diría que primero escucho y luego decido');
  assert.equal(voz.respuesta_editada, 'Bueno, yo diría que primero escucho y luego decido.');
  assert.equal(JSON.parse(voz.segmentos).length, 2);
  // Responde la repregunta escribiendo, con detalle (sin más repreguntas).
  await pagina.getByRole('button', { name: 'Prefiero escribirla' }).click();
  await pagina.getByLabel('Tu respuesta', { exact: true }).fill(LARGO);
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();

  // 7. Sin conexión: la respuesta queda en el dispositivo y se envía al volver
  await pagina.getByText('Sesión 1 · Pregunta 3 de 4').waitFor();
  await contexto.setOffline(true);
  await pagina.getByRole('button', { name: 'Prefiero escribirla' }).click();
  await pagina.getByLabel('Tu respuesta', { exact: true }).fill(LARGO);
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();
  await pagina.getByText('Guardado en este dispositivo, se enviará al recuperar conexión.').waitFor();
  await pagina.getByText('Sesión 1 · Pregunta 4 de 4').waitFor();
  await captura(pagina, '08-sin-conexion');
  assert.ok(!(await filas('Respuestas')).some((r) => r.pregunta_id === 'S01-P3'));
  await contexto.setOffline(false);
  await pagina.waitForFunction(() => !JSON.parse(localStorage.getItem('gv_cola') || '[]').length);
  assert.ok((await filas('Respuestas')).some((r) => r.pregunta_id === 'S01-P3'));

  // 8. Respuesta vacía: confirmación antes de enviar
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();
  await pagina.getByRole('heading', { name: 'Tu respuesta está vacía' }).waitFor();
  await pagina.getByRole('button', { name: 'Seguir respondiendo' }).click();
  await pagina.getByLabel('Tu respuesta', { exact: true }).fill(LARGO);
  await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();

  // 9. Cierre
  await pagina.getByRole('heading', { name: 'Gracias, Gloria' }).waitFor();
  await pagina.getByText('Sesión 1 de 30 completada').waitFor();
  await comprobarDiseno(pagina, 'cierre');
  await captura(pagina, '09-cierre');
  const sesiones = await filas('Sesiones');
  assert.equal(sesiones[0].estado, 'completada');
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('Gloria: sesión 2 con opciones, personalidad (Mini-IPIP) y límite de 2 sesiones al día', async () => {
  const { contexto, pagina, errores } = await nuevaPagina();
  await pagina.goto(base);
  await pagina.getByLabel('Código de acceso').fill('prueba');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  // El análisis de la sesión 1 ya se ejecutó; el tutorial se marcó como visto en el servidor.
  await pagina.getByText('1 de 30').waitFor();
  await pagina.getByRole('button', { name: 'Empezar sesión 2' }).click();

  for (let vueltas = 0; vueltas < 10; vueltas++) {
    await pagina.locator('#p-pregunta:not(.oculto), #p-cierre:not(.oculto)').waitFor();
    if (await pagina.locator('#p-cierre:not(.oculto)').count()) break;
    const contador = await pagina.locator('#pregunta-contador').textContent();
    await pagina.locator('#zona-respuesta > *').first().waitFor();
    if (await pagina.locator('.likert-item').count()) {
      await comprobarDiseno(pagina, 'likert');
      await captura(pagina, '10-personalidad');
      // Intentar enviar sin responder todo muestra qué falta.
      await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();
      await pagina.getByText('Te falta responder 5 frases.').waitFor();
      for (const grupo of await pagina.locator('.escala').all()) await grupo.getByRole('radio').nth(3).click();
    } else {
      if (await pagina.getByRole('radiogroup', { name: /Opciones/ }).count()) {
        await pagina.getByRole('radio').nth(1).click();
        await captura(pagina, '11-opciones');
      }
      if (await pagina.getByRole('button', { name: 'Prefiero escribirla' }).count()) {
        await pagina.getByRole('button', { name: 'Prefiero escribirla' }).click();
      }
      await pagina.locator('#respuesta-texto').fill(LARGO);
    }
    await pagina.getByRole('button', { name: 'Enviar respuesta' }).click();
    await pagina.waitForFunction((c) => document.querySelector('#pregunta-contador')?.textContent !== c || !document.querySelector('#p-cierre.oculto'), contador);
  }
  await pagina.getByText('Sesión 2 de 30 completada').waitFor();
  await pagina.getByText('Tu próxima sesión estará disponible mañana.').waitFor();
  await pagina.getByRole('button', { name: 'Volver al inicio' }).click();
  await pagina.getByText('Por hoy es suficiente. Tu próxima sesión estará disponible mañana.').waitFor();
  assert.equal(await pagina.getByRole('button', { name: 'Empezar sesión 3' }).isDisabled(), true);
  await captura(pagina, '12-panel-limite-diario');
  const ipip = (await filas('Respuestas')).find((r) => r.tipo === 'likert');
  assert.equal(Object.keys(JSON.parse(ipip.respuesta_original)).length, 5);
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('Gloria vuelve días después: mensaje cálido, días sin responder, tamaño de letra y modo oscuro', async () => {
  await fetch(`${base}/__dev/avanzar?min=${3 * 24 * 60}`, { method: 'POST' });
  const { contexto, pagina, errores } = await nuevaPagina({ colorScheme: 'light' });
  await pagina.goto(base);
  await pagina.getByLabel('Código de acceso').fill('prueba');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByText('Qué bueno verte de nuevo. Retomemos donde lo dejaste.').waitFor();
  await pagina.getByText('Tu última respuesta fue hace 3 días.').waitFor();
  await pagina.getByRole('button', { name: 'Empezar sesión 3' }).waitFor();
  // A+ y modo oscuro se recuerdan en el dispositivo.
  const antes = await pagina.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await pagina.getByRole('button', { name: 'Aumentar el tamaño del texto' }).click();
  const despues = await pagina.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  assert.ok(despues > antes);
  await pagina.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  const fondo = await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(fondo, 'rgb(36, 39, 43)');
  await comprobarDiseno(pagina, 'panel oscuro y letra grande');
  await captura(pagina, '13-panel-oscuro');
  await pagina.reload();
  await pagina.getByText('Qué bueno verte de nuevo').waitFor();
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'oscuro');
  await pagina.getByRole('button', { name: 'Empezar sesión 3' }).click();
  await pagina.getByText('Sesión 3 · Pregunta 1').waitFor();
  await captura(pagina, '14-pregunta-oscuro');
  // Salir y continuar después: vuelve al panel con «Continuar sesión 3».
  await pagina.locator('#respuesta-texto').fill('Al CEO le diría que');
  await pagina.getByRole('button', { name: 'Salir y continuar después' }).click();
  await pagina.getByRole('button', { name: /Continuar sesión 3/ }).waitFor();
  const borrador = (await filas('Borradores')).find((b) => b.pregunta_id === 'S03-P1');
  assert.equal(borrador.texto, 'Al CEO le diría que');
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('escritorio (1280 px): una columna centrada y sin desplazamiento horizontal', async () => {
  const { contexto, pagina } = await nuevaPagina({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, hasTouch: false });
  await pagina.goto(base);
  await pagina.getByLabel('Código de acceso').fill('prueba');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByRole('button', { name: /Continuar sesión 3/ }).click();
  await pagina.getByText('Sesión 3 · Pregunta 1').waitFor();
  assert.equal(await pagina.locator('#respuesta-texto').inputValue(), 'Al CEO le diría que');
  const ancho = await pagina.evaluate(() => document.querySelector('main').getBoundingClientRect().width);
  assert.ok(ancho <= 760, 'columna centrada de ancho legible');
  await comprobarDiseno(pagina, 'escritorio');
  await captura(pagina, '15-escritorio');
  await contexto.close();
});

test('prueba a ciegas para el equipo: link aparte con su propio código', async () => {
  const { contexto, pagina, errores } = await nuevaPagina();
  await pagina.goto(`${base}/?modo=ciego`);
  await pagina.getByRole('heading', { name: 'Prueba a ciegas' }).waitFor();
  await pagina.getByLabel('Código de acceso').fill('equipo-prueba');
  await pagina.getByLabel('Tu nombre').fill('Ana');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.getByRole('heading', { name: 'Todavía no hay pares para revisar' }).waitFor();
  assert.deepEqual(errores, []);
  await contexto.close();
});
