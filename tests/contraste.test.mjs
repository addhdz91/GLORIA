// Contraste WCAG AA (4,5:1) de los pares de color que usa el frontend, en modo claro y oscuro,
// y sin blanco ni negro puros como fondo (sección 3.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');

function variables(bloque) {
  return Object.fromEntries([...bloque.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const claro = variables(html.split(':root {')[1].split('}')[0]);
const oscuro = variables(html.split(':root[data-tema="oscuro"] {')[1].split('}')[0]);

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const PARES = [
  ['texto', 'fondo'], ['texto', 'superficie'], ['texto', 'superficie-2'], ['texto-suave', 'fondo'],
  ['texto-suave', 'superficie'], ['texto-suave', 'superficie-2'], ['acento', 'fondo'], ['acento', 'superficie'],
  ['sobre-acento', 'acento'], ['texto', 'acento-suave'], ['acento', 'acento-suave'], ['texto', 'error-fondo'],
  ['texto', 'aviso-fondo'],
];

for (const [nombre, tema] of [['claro', claro], ['oscuro', oscuro]]) {
  test(`contraste AA en modo ${nombre}`, () => {
    const fallos = PARES.map(([a, b]) => [a, b, contraste(tema[a], tema[b])]).filter(([, , c]) => c < 4.5)
      .map(([a, b, c]) => `${a} sobre ${b}: ${c.toFixed(2)}`);
    assert.deepEqual(fallos, []);
  });
  test(`modo ${nombre}: sin blanco ni negro puros en fondos y texto`, () => {
    for (const v of ['fondo', 'superficie', 'texto']) assert.ok(!['#ffffff', '#000000'].includes(tema[v]), v);
  });
}
