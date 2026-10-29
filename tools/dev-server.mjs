// Servidor de desarrollo: sirve frontend/index.html y responde a sus peticiones con el backend
// real de backend/*.gs cargado en el simulador de Apps Script (tools/gas-harness.mjs).
// Los datos viven en memoria y la API de Claude está simulada: no hace falta ninguna cuenta.
//
//   node tools/dev-server.mjs            → http://localhost:8787  (código de acceso: «prueba»)
//   PORT=9000 node tools/dev-server.mjs
//
// Rutas de ayuda para pruebas: POST /__dev/avanzar?min=N (adelanta el reloj del servidor),
// POST /__dev/disparadores (ejecuta ya los análisis programados), GET /__dev/filas?hoja=Respuestas.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearProyecto } from './gas-harness.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const puerto = Number(process.env.PORT || 8787);

export function crearServidor({ ahora = new Date(), retrasoAnalisisMs = 1500 } = {}) {
  const proyecto = crearProyecto({ ahora, propiedades: { ACCESS_CODE: 'prueba', BLIND_CODE: 'equipo-prueba' } });
  proyecto.ejecutar('setup');

  const servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const leerCuerpo = () =>
      new Promise((resolver) => {
        let cuerpo = '';
        req.on('data', (c) => (cuerpo += c));
        req.on('end', () => resolver(cuerpo));
      });

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = readFileSync(join(raiz, 'frontend/index.html'), 'utf8').replace(
        '<script>',
        "<script>window.GLORIA_BACKEND_URL = '/exec';</script>\n<script>",
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'POST' && url.pathname === '/exec') {
      return leerCuerpo().then((cuerpo) => {
        const salida = proyecto.contexto.doPost({ postData: { contents: cuerpo } });
        // Como Apps Script: los análisis programados se ejecutan poco después.
        if (proyecto.disparadores.some((d) => d.despuesMs !== undefined)) {
          setTimeout(() => proyecto.ejecutarDisparadoresUnicos(), retrasoAnalisisMs);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(salida.getContent());
      });
    }
    if (req.method === 'POST' && url.pathname === '/__dev/avanzar') {
      proyecto.avanzar(Number(url.searchParams.get('min') || 0));
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/__dev/disparadores') {
      const n = proyecto.ejecutarDisparadoresUnicos();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ejecutados: n }));
    }
    if (req.method === 'GET' && url.pathname === '/__dev/filas') {
      const filas = proyecto.filas(url.searchParams.get('hoja') || 'Respuestas');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(filas));
    }
    res.writeHead(404);
    res.end('No encontrado');
  });
  return { servidor, proyecto };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { servidor } = crearServidor();
  servidor.listen(puerto, () => {
    console.log(`Gloria Virtual (modo desarrollo): http://localhost:${puerto}  · código de acceso: «prueba»`);
    console.log(`Prueba a ciegas: http://localhost:${puerto}/?modo=ciego  · código: «equipo-prueba»`);
  });
}
