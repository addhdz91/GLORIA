// Simulación en memoria de los servicios de Google Apps Script que usa el backend
// (SpreadsheetApp, PropertiesService, LockService, ScriptApp, UrlFetchApp, DriveApp…).
// Carga los archivos reales de backend/ en un contexto aislado de Node, para probarlos sin
// cuenta de Google y para el servidor de desarrollo (tools/dev-server.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHIVOS_BACKEND = ['Data.gs', 'Code.gs', 'Analysis.gs', 'Admin.gs', 'Export.gs'];

/** Lo que Sheets hace al guardar: el apóstrofo inicial solo marca «texto» y no se devuelve. */
function guardarValor(v) {
  if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
  if (v instanceof Date) return new Date(v.getTime());
  return v === undefined || v === null ? '' : v;
}

class Rango {
  constructor(hoja, fila, col, nf, nc) {
    Object.assign(this, { hoja, fila, col, nf, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const fila = this.hoja.filas[this.fila - 1 + i] || [];
      const vals = [];
      for (let j = 0; j < this.nc; j++) {
        const v = fila[this.col - 1 + j];
        vals.push(v instanceof Date ? new Date(v.getTime()) : v === undefined ? '' : v);
      }
      out.push(vals);
    }
    return out;
  }
  setValues(valores) {
    valores.forEach((vals, i) => {
      const idx = this.fila - 1 + i;
      while (this.hoja.filas.length <= idx) this.hoja.filas.push([]);
      vals.forEach((v, j) => {
        this.hoja.filas[idx][this.col - 1 + j] = guardarValor(v);
      });
    });
    return this;
  }
  setValue(v) {
    return this.setValues([[v]]);
  }
  setNumberFormat() {
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class Hoja {
  constructor(nombre) {
    this.nombre = nombre;
    this.filas = [];
  }
  getName() {
    return this.nombre;
  }
  getLastRow() {
    return this.filas.length;
  }
  getMaxRows() {
    return Math.max(1000, this.filas.length);
  }
  getRange(fila, col, nf = 1, nc = 1) {
    return new Rango(this, fila, col, nf, nc);
  }
  appendRow(vals) {
    this.filas.push(vals.map(guardarValor));
  }
  deleteRow(fila) {
    this.filas.splice(fila - 1, 1);
  }
  deleteRows(fila, n) {
    this.filas.splice(fila - 1, n);
  }
  setFrozenRows() {}
}

class Libro {
  constructor() {
    this.hojas = [new Hoja('Hoja 1')];
  }
  getSheetByName(nombre) {
    return this.hojas.find((h) => h.nombre === nombre) || null;
  }
  insertSheet(nombre) {
    const hoja = new Hoja(nombre);
    this.hojas.push(hoja);
    return hoja;
  }
  getSheets() {
    return [...this.hojas];
  }
  deleteSheet(hoja) {
    this.hojas = this.hojas.filter((h) => h !== hoja);
  }
}

function formatearFecha(fecha, zona, formato) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(fecha))
      .map((p) => [p.type, p.value]),
  );
  return formato
    .replace('yyyy', partes.year)
    .replace('MM', partes.month)
    .replace('dd', partes.day)
    .replace('HH', partes.hour)
    .replace('mm', partes.minute);
}

/** Respuesta simulada de la API de Claude según el esquema pedido (sin red). */
export function claudeSimulado(cuerpo) {
  const props = cuerpo.output_config?.format?.schema?.properties || {};
  const usuario = String(cuerpo.messages?.[0]?.content || '');
  let datos;
  if ('repreguntar' in props) {
    const respuesta = (usuario.split('<respuesta_de_gloria>')[1] || '').split('</respuesta_de_gloria>')[0];
    const corta = respuesta.trim().split(/\s+/).length < 25;
    datos = {
      repreguntar: corta,
      repregunta: corta ? '¿Qué te hizo decidirlo así en ese momento?' : '',
      motivo: corta ? 'Decisión sin justificar.' : 'Respuesta completa.',
    };
  } else if ('perfil_markdown' in props) {
    const siguiente = Number((usuario.match(/Sesión siguiente: (\d+)/) || [])[1] || 0);
    datos = {
      perfil_markdown: '## Criterio profesional\n\nPregunta antes de proponer («primero entender»).',
      hipotesis: [
        {
          hipotesis: 'Ante la presión de la autoridad, negocia en vez de confrontar.',
          evidencia_a_favor: 'Sesión 3.',
          explicaciones_alternativas: 'Prudencia con un cliente nuevo.',
          estado: 'pendiente',
        },
      ],
      huecos: ['Cómo presenta el precio.'],
      frases_caracteristicas: ['primero entender', 'vamos paso a paso'],
      pregunta_adaptada: {
        accion: 'anadir',
        reemplaza_id: '',
        tecnica: 'abc',
        enfoque: 'conductual',
        modalidad: 'voz',
        contexto: '',
        texto: '¿Qué haces cuando un cliente no responde a tu propuesta?',
        motivo: 'Hueco: seguimiento comercial.',
      },
      afirmaciones_validacion: siguiente === 7 ? ['Antes de proponer algo, sueles preguntar mucho.', 'Prefieres el usted con directivos.'] : [],
      hipotesis_a_validar:
        siguiente >= 23 && siguiente <= 27 ? ['Ante la presión de la autoridad, sueles negociar en vez de confrontar.'] : [],
    };
  } else if ('respuesta' in props) {
    datos = { respuesta: 'Hola, gracias por escribir. Antes de proponerte algo, cuéntame un poco más de tu equipo.' };
  } else {
    datos = {};
  }
  return {
    status: 200,
    body: {
      id: 'msg_simulado',
      type: 'message',
      role: 'assistant',
      model: cuerpo.model,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(datos) }],
    },
  };
}

/**
 * Crea un «proyecto de Apps Script» en memoria con el backend cargado.
 * opciones.ahora: fecha inicial (ISO o Date). opciones.claude: (cuerpo, opciones) => { status, body }.
 */
export function crearProyecto(opciones = {}) {
  const libro = new Libro();
  const propiedades = new Map(
    Object.entries({
      SHEET_ID: 'hoja-de-prueba',
      ACCESS_CODE: 'codigo-de-prueba',
      ANTHROPIC_API_KEY: 'sk-ant-prueba',
      ...(opciones.propiedades || {}),
    }),
  );
  const disparadores = [];
  const drive = [];
  const registro = [];
  const llamadasClaude = [];
  let claude = opciones.claude || claudeSimulado;

  const contexto = {
    console,
    JSON,
    Math,
    Date,
    __AHORA_PRUEBA__: opciones.ahora ? new Date(opciones.ahora).toISOString() : null,
    SpreadsheetApp: {
      openById(id) {
        if (id !== propiedades.get('SHEET_ID')) throw new Error('Hoja no encontrada: ' + id);
        return libro;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propiedades.has(k) ? propiedades.get(k) : null),
        setProperty: (k, v) => propiedades.set(k, String(v)),
        deleteProperty: (k) => propiedades.delete(k),
        getProperties: () => Object.fromEntries(propiedades),
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }),
    },
    Utilities: {
      formatDate: formatearFecha,
      getUuid: () => randomUUID(),
      sleep() {},
    },
    UrlFetchApp: {
      fetch(url, op) {
        const cuerpo = JSON.parse(op.payload);
        llamadasClaude.push({ url, cabeceras: op.headers, cuerpo });
        const res = claude(cuerpo, op);
        const texto = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
        return { getResponseCode: () => res.status, getContentText: () => texto };
      },
    },
    ScriptApp: {
      newTrigger(funcion) {
        const d = { funcion };
        const constructor = {
          timeBased: () => constructor,
          after: (ms) => ((d.despuesMs = ms), constructor),
          atHour: (h) => ((d.hora = h), constructor),
          everyDays: (n) => ((d.cadaDias = n), constructor),
          inTimezone: (z) => ((d.zona = z), constructor),
          create: () => {
            d.getHandlerFunction = () => funcion;
            disparadores.push(d);
            return d;
          },
        };
        return constructor;
      },
      getProjectTriggers: () => [...disparadores],
      deleteTrigger: (d) => {
        const i = disparadores.indexOf(d);
        if (i >= 0) disparadores.splice(i, 1);
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput(texto) {
        return { texto, setMimeType() { return this; }, getContent() { return texto; } };
      },
    },
    DriveApp: {
      createFile(nombre, contenido) {
        drive.push({ nombre, contenido });
        return { getUrl: () => 'https://drive.simulado/' + encodeURIComponent(nombre) };
      },
      createFolder(nombre) {
        const carpeta = { nombre, archivos: {} };
        drive.push(carpeta);
        return {
          createFile(n, c) {
            carpeta.archivos[n] = c;
            return { getUrl: () => 'https://drive.simulado/' + encodeURIComponent(nombre + '/' + n) };
          },
          getUrl: () => 'https://drive.simulado/' + encodeURIComponent(nombre),
        };
      },
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Logger: { log: (m) => registro.push(String(m)) },
  };
  vm.createContext(contexto);
  for (const archivo of ARCHIVOS_BACKEND) {
    vm.runInContext(readFileSync(join(raiz, 'backend', archivo), 'utf8'), contexto, { filename: archivo });
  }

  const proyecto = {
    contexto,
    libro,
    propiedades,
    disparadores,
    drive,
    registro,
    llamadasClaude,
    /** Cambia la API de Claude simulada (por ejemplo, para que falle). */
    usarClaude(fn) {
      claude = fn;
    },
    /** Fija la hora del servidor. */
    fijarAhora(fecha) {
      contexto.__AHORA_PRUEBA__ = new Date(fecha).toISOString();
    },
    /** Avanza la hora del servidor en minutos. */
    avanzar(minutos) {
      const base = contexto.__AHORA_PRUEBA__ ? new Date(contexto.__AHORA_PRUEBA__) : new Date();
      contexto.__AHORA_PRUEBA__ = new Date(base.getTime() + minutos * 60000).toISOString();
    },
    /** Ejecuta una función del backend por su nombre (como el botón «Ejecutar» del editor). */
    ejecutar(nombre, ...args) {
      return contexto[nombre](...args);
    },
    /** Llama a doPost como lo haría el navegador. */
    post(datos) {
      const salida = contexto.doPost({ postData: { contents: JSON.stringify(datos) } });
      return JSON.parse(salida.getContent());
    },
    /** Filas de una pestaña como objetos. */
    filas(nombre) {
      return contexto.leer_(nombre);
    },
    /** Ejecuta los disparadores únicos pendientes (como haría Apps Script al cumplirse el plazo). */
    ejecutarDisparadoresUnicos() {
      const unicos = disparadores.filter((d) => d.despuesMs !== undefined);
      unicos.forEach((d) => contexto[d.funcion]());
      return unicos.length;
    },
  };
  return proyecto;
}
