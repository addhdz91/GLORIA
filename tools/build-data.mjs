// Genera backend/Data.gs a partir de data/*.json y prompts/*.md.
// Apps Script no puede leer el repositorio: el banco, el Mini-IPIP y los prompts viajan
// dentro de Data.gs, que el administrador pega junto al resto de archivos de backend/.
// Uso: node tools/build-data.mjs        (escribe Data.gs)
//      node tools/build-data.mjs --check (falla si Data.gs no está al día)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(raiz, ruta), 'utf8');

/** Separa un prompt en sus secciones «## Sistema» y «## Usuario». */
function seccionesPrompt(md) {
  const sistema = md.split(/^## Sistema\s*$/m)[1]?.split(/^## Usuario\s*$/m)[0];
  const usuario = md.split(/^## Usuario\s*$/m)[1];
  if (!sistema || !usuario) throw new Error('El prompt necesita las secciones «## Sistema» y «## Usuario».');
  return { sistema: sistema.trim(), usuario: usuario.trim() };
}

/** La plantilla final es todo lo que va después de la primera línea «---». */
function plantillaFinal(md) {
  const partes = md.split(/^---\s*$/m);
  if (partes.length < 2) throw new Error('gloria_virtual.md necesita una línea «---» antes de la plantilla.');
  return partes.slice(1).join('---').trim();
}

const banco = JSON.parse(leer('data/banco_preguntas.json'));
const ipip = JSON.parse(leer('data/mini_ipip_es.json'));
const prompts = {
  repregunta: seccionesPrompt(leer('prompts/repregunta.md')),
  analisis_sesion: seccionesPrompt(leer('prompts/analisis_sesion.md')),
  calibracion: seccionesPrompt(leer('prompts/calibracion.md')),
  gloria_virtual: plantillaFinal(leer('prompts/gloria_virtual.md')),
};

const salida = `// GENERADO por tools/build-data.mjs a partir de data/ y prompts/. No lo edites a mano:
// cambia los archivos de origen y ejecuta «node tools/build-data.mjs».

var BANCO_PREGUNTAS = ${JSON.stringify(banco, null, 2)};

var MINI_IPIP = ${JSON.stringify(ipip, null, 2)};

var PROMPTS = ${JSON.stringify(prompts, null, 2)};
`;

const destino = join(raiz, 'backend/Data.gs');
if (process.argv.includes('--check')) {
  let actual = '';
  try {
    actual = readFileSync(destino, 'utf8');
  } catch {
    // Sin archivo: no está al día.
  }
  if (actual !== salida) {
    console.error('backend/Data.gs no está al día. Ejecuta: node tools/build-data.mjs');
    process.exit(1);
  }
  console.log('backend/Data.gs está al día.');
} else {
  writeFileSync(destino, salida);
  console.log(`backend/Data.gs generado (${banco.preguntas.length} preguntas, ${ipip.items.length} ítems del Mini-IPIP).`);
}
