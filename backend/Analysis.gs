/**
 * Análisis tras cada sesión (sección 7).
 *
 * completeSession programa `analizarPendientes` a 1 minuto, para que la sesión siguiente ya esté
 * adaptada aunque Gloria haga dos el mismo día. `respaldoNocturno` (23:00, hora de Colombia) procesa
 * cualquier sesión completada sin analizar. Cada análisis guarda una versión nueva del perfil y prepara
 * la sesión siguiente: una pregunta adaptada, las afirmaciones de validación (sesión 7), las hipótesis
 * y respuestas de la Gloria virtual para calibrar (23–27) y los pares de la prueba a ciegas (29–30).
 */

var MAX_INTENTOS_ANALISIS = 3;
var MINUTOS_REINTENTO_ANALISIS = 10;
var TECNICAS = ['narrativa', 'think_aloud', 'decisiones_criticas', 'star', 'sjt', 'laddering', 'caso_giro',
  'intuicion_analisis', 'steelman', 'abc'];
var ENFOQUES = ['conductual', 'cognitivo', 'emocional', 'social', 'economia_conductual', 'lenguaje', 'vocal',
  'personalidad', 'cultural'];

/** Disparador único tras completar una sesión (y reintentos). */
function analizarPendientes() {
  limpiarDisparadoresUnicos_();
  var bloqueo = LockService.getScriptLock();
  // Si otro análisis está en marcha, este disparador termina sin hacer nada: aquel procesará la cola.
  if (!bloqueo.tryLock(1000)) return;
  var pendientes;
  try {
    pendientes = leer_('Sesiones').filter(function (s) {
      return s['estado'] === 'completada' && !esVerdadero_(s['analizada']) &&
        Number(s['intentos_análisis'] || 0) < MAX_INTENTOS_ANALISIS;
    }).map(function (s) { return Number(s['sesión_n']); }).sort(function (a, b) { return a - b; });
  } finally {
    bloqueo.releaseLock();
  }
  pendientes.forEach(function (n) {
    try {
      analizarSesion(n);
    } catch (err) {
      var fila = leer_('Sesiones').filter(function (s) { return Number(s['sesión_n']) === n; })[0];
      var intentos = Number(fila['intentos_análisis'] || 0) + 1;
      actualizar_('Sesiones', fila._fila, { 'intentos_análisis': intentos });
      registrar_('analisis_error', 'Sesión ' + n + ' (intento ' + intentos + '): ' + String(err && err.message || err).slice(0, 1500));
      if (intentos < MAX_INTENTOS_ANALISIS) programarAnalisis_(MINUTOS_REINTENTO_ANALISIS);
    }
  });
}

/** Disparador nocturno: respaldo para cualquier sesión completada sin analizar (sin límite de intentos). */
function respaldoNocturno() {
  leer_('Sesiones').forEach(function (s) {
    if (s['estado'] === 'completada' && !esVerdadero_(s['analizada']) &&
      Number(s['intentos_análisis'] || 0) >= MAX_INTENTOS_ANALISIS) {
      actualizar_('Sesiones', s._fila, { 'intentos_análisis': MAX_INTENTOS_ANALISIS - 1 });
    }
  });
  analizarPendientes();
}

/** Borra los disparadores únicos ya ejecutados de analizarPendientes (Apps Script no los borra solo). */
function limpiarDisparadoresUnicos_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'analizarPendientes') ScriptApp.deleteTrigger(t);
    });
  } catch (err) {
    registrar_('disparador_error', String(err && err.message || err));
  }
}

function faseDe_(n) {
  if (!n) return 'fin del programa';
  if (n <= 7) return 'fase 1: identidad, voz y contexto';
  if (n <= 14) return 'fase 2: metodología y criterio profesional';
  if (n <= 22) return 'fase 3: situaciones difíciles con clientes';
  if (n <= 28) return 'fase 4: calibración';
  return 'fase 5: prueba a ciegas y cierre';
}

function perfilVigente_() {
  var filas = leer_('Perfil');
  return filas.length ? filas[filas.length - 1] : null;
}

/** Analiza una sesión completada y prepara la siguiente. Se puede ejecutar a mano desde el editor. */
function analizarSesion(n) {
  n = Number(n);
  var sesiones = leer_('Sesiones');
  var fila = sesiones.filter(function (s) { return Number(s['sesión_n']) === n; })[0];
  if (!fila || fila['estado'] !== 'completada') throw new Error('La sesión ' + n + ' no está completada.');
  var siguiente = n < TOTAL_SESIONES ? n + 1 : null;
  var filaSiguiente = siguiente ? sesiones.filter(function (s) { return Number(s['sesión_n']) === siguiente; })[0] : null;
  // Si Gloria ya empezó la siguiente, no se toca: solo se actualiza el perfil.
  var prepararSiguiente = !!(filaSiguiente && filaSiguiente['estado'] === 'pendiente');

  var perfil = perfilVigente_();
  var respuestas = leer_('Respuestas').filter(function (r) { return Number(r['sesión_n']) === n; })
    .sort(function (a, b) { return new Date(a['fecha_hora']) - new Date(b['fecha_hora']); });
  var planeadas = siguiente ? preguntasDeSesion_(siguiente) : [];

  var usuario = rellenar_(PROMPTS.analisis_sesion.usuario, {
    sesion: n,
    fase_actual: faseDe_(n),
    sesion_siguiente: siguiente || 'ninguna (fin del programa)',
    fase_siguiente: faseDe_(siguiente),
    tecnicas: TECNICAS.join(', '),
    enfoques: ENFOQUES.join(', '),
    version_perfil: perfil ? perfil['versión'] : 0,
    perfil_vigente: perfil ? perfil['perfil_markdown'] : '(todavía no hay perfil: esta es la primera sesión analizada)',
    hipotesis_vigentes: perfil ? perfil['hipótesis'] : '[]',
    respuestas: respuestas.map(formatearRespuesta_).join('\n\n'),
    ipip: resumenIpip_(),
    preguntas_siguiente: planeadas.filter(function (p) { return !p['generar']; }).map(function (p) {
      return '- [' + p['pregunta_id'] + '] (' + p['técnica'] + ', ' + p['enfoque'] + ', ' + p['modalidad'] + ') ' +
        [p['contexto'], p['texto']].filter(function (t) { return t; }).join(' ');
    }).join('\n') || '(ninguna)',
  });

  var resultado = llamarClaude_({
    modelo: MODELO_ANALISIS,
    sistema: PROMPTS.analisis_sesion.sistema,
    usuario: usuario,
    esfuerzo: 'medium',
    maxTokens: 16000,
    esquema: ESQUEMA_ANALISIS,
  });

  agregar_('Perfil', {
    'versión': perfil ? Number(perfil['versión']) + 1 : 1,
    fecha: ahora_(),
    perfil_markdown: resultado.perfil_markdown,
    'hipótesis': JSON.stringify(resultado.hipotesis || []),
    huecos_detectados: JSON.stringify(resultado.huecos || []),
    'frases_características': JSON.stringify(resultado.frases_caracteristicas || []),
    'sesión_n': n,
  });

  if (prepararSiguiente) {
    aplicarPreguntaAdaptada_(siguiente, resultado.pregunta_adaptada);
    expandirMarcadores_(siguiente, resultado);
  }
  actualizar_('Sesiones', fila._fila, { analizada: true });
  registrar_('analisis', 'Sesión ' + n + ' analizada; perfil v' + (perfil ? Number(perfil['versión']) + 1 : 1));
  return resultado;
}

var ESQUEMA_ANALISIS = {
  type: 'object',
  properties: {
    perfil_markdown: { type: 'string' },
    hipotesis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hipotesis: { type: 'string' },
          evidencia_a_favor: { type: 'string' },
          explicaciones_alternativas: { type: 'string' },
          estado: { type: 'string', enum: ['pendiente', 'reforzada', 'confirmada', 'matizada', 'descartada'] },
        },
        required: ['hipotesis', 'evidencia_a_favor', 'explicaciones_alternativas', 'estado'],
        additionalProperties: false,
      },
    },
    huecos: { type: 'array', items: { type: 'string' } },
    frases_caracteristicas: { type: 'array', items: { type: 'string' } },
    pregunta_adaptada: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: ['ninguna', 'anadir', 'reemplazar'] },
        reemplaza_id: { type: 'string' },
        tecnica: { type: 'string', enum: TECNICAS },
        enfoque: { type: 'string', enum: ENFOQUES },
        modalidad: { type: 'string', enum: ['escrita', 'voz', 'contrarreloj'] },
        contexto: { type: 'string' },
        texto: { type: 'string' },
        motivo: { type: 'string' },
      },
      required: ['accion', 'reemplaza_id', 'tecnica', 'enfoque', 'modalidad', 'contexto', 'texto', 'motivo'],
      additionalProperties: false,
    },
    afirmaciones_validacion: { type: 'array', items: { type: 'string' } },
    hipotesis_a_validar: { type: 'array', items: { type: 'string' } },
  },
  required: ['perfil_markdown', 'hipotesis', 'huecos', 'frases_caracteristicas', 'pregunta_adaptada',
    'afirmaciones_validacion', 'hipotesis_a_validar'],
  additionalProperties: false,
};

function formatearRespuesta_(r) {
  var lineas = [
    '### ' + r['pregunta_id'] + (esVerdadero_(r['es_repregunta']) ? ' (repregunta de ' + r['padre_id'] + ')' : '') +
      ' · ' + r['técnica'] + ' · ' + r['enfoque'] + ' · ' + r['modalidad'],
    'Pregunta: ' + r['texto_pregunta'],
  ];
  var datos = jsonSeguro_(r['datos'], {});
  if (r['tipo'] === 'likert') {
    lineas.push('Respuesta (Mini-IPIP, 1 a 5): ' + r['respuesta_original']);
    return lineas.join('\n');
  }
  if (datos.respuesta_virtual) lineas.push('Respuesta de la Gloria virtual que se le mostró: ' + datos.respuesta_virtual);
  if (datos.eleccion) lineas.push('Eligió: ' + datos.eleccion);
  lineas.push('Respuesta' + (r['modalidad'] === 'voz' ? ' (transcripción en bruto)' : '') + ': ' + (r['respuesta_original'] || '(vacía)'));
  if (r['respuesta_editada']) lineas.push('Versión editada por ella: ' + r['respuesta_editada']);
  var metricas = [];
  if (r['duración_seg']) metricas.push('duración ' + r['duración_seg'] + ' s');
  if (r['palabras']) metricas.push(r['palabras'] + ' palabras');
  if (r['ppm']) metricas.push(r['ppm'] + ' palabras/min');
  if (r['pausas_largas'] !== '' && r['pausas_largas'] !== undefined) metricas.push(r['pausas_largas'] + ' pausas largas');
  if (esVerdadero_(r['escuchó_pregunta'])) metricas.push('escuchó la pregunta en voz alta');
  if (esVerdadero_(r['cambió_a_texto'])) metricas.push('prefirió escribir en vez de hablar');
  if (metricas.length) lineas.push('Métricas: ' + metricas.join(', '));
  return lineas.join('\n');
}

/** Puntuación media por rasgo del Mini-IPIP (1 a 5, con los ítems inversos ya invertidos). */
function resumenIpip_() {
  var claves = {};
  MINI_IPIP.items.forEach(function (it) { claves[it.id] = it; });
  var suma = {};
  var cuenta = {};
  leer_('Respuestas').filter(function (r) { return r['tipo'] === 'likert'; }).forEach(function (r) {
    var valores = jsonSeguro_(r['respuesta_original'], {});
    Object.keys(valores).forEach(function (id) {
      var item = claves[id];
      var v = Number(valores[id]);
      if (!item || !(v >= 1 && v <= 5)) return;
      var puntuacion = item.clave === '-' ? 6 - v : v;
      suma[item.rasgo] = (suma[item.rasgo] || 0) + puntuacion;
      cuenta[item.rasgo] = (cuenta[item.rasgo] || 0) + 1;
    });
  });
  var rasgos = Object.keys(suma);
  if (!rasgos.length) return '(sin datos todavía)';
  return rasgos.map(function (rasgo) {
    return rasgo + ': ' + (suma[rasgo] / cuenta[rasgo]).toFixed(1) + ' (' + cuenta[rasgo] + ' de 4 ítems)';
  }).join('\n') + '\nReferencia orientativa: contrastar con lo observado, nunca usar como etiqueta.';
}

function nuevaFilaPregunta_(n, base) {
  return {
    pregunta_id: base.pregunta_id,
    'sesión_n': n,
    orden: base.orden,
    'técnica': base.tecnica,
    enfoque: base.enfoque,
    modalidad: base.modalidad,
    contexto: base.contexto || '',
    texto: base.texto,
    origen: 'generada',
    estado: 'activa',
    tipo: base.tipo || 'abierta',
    opciones: base.opciones ? JSON.stringify(base.opciones) : '',
    limite_seg: base.limite_seg || '',
    datos: base.datos ? JSON.stringify(base.datos) : '',
    padre_id: '',
    generar: '',
  };
}

function aplicarPreguntaAdaptada_(n, adaptada) {
  if (!adaptada || adaptada.accion === 'ninguna' || !String(adaptada.texto || '').trim()) return;
  var planeadas = preguntasDeSesion_(n);
  var base = {
    pregunta_id: 'S' + (n < 10 ? '0' : '') + n + '-A' + Utilities.getUuid().slice(0, 4),
    tecnica: adaptada.tecnica,
    enfoque: adaptada.enfoque,
    modalidad: adaptada.modalidad,
    contexto: adaptada.contexto,
    texto: adaptada.texto,
    limite_seg: adaptada.modalidad === 'contrarreloj' ? 90 : '',
  };
  var reemplazada = adaptada.accion === 'reemplazar'
    ? planeadas.filter(function (p) { return String(p['pregunta_id']) === adaptada.reemplaza_id && !p['generar']; })[0]
    : null;
  if (reemplazada) {
    base.orden = Number(reemplazada['orden']);
    actualizar_('Preguntas', reemplazada._fila, { estado: 'reemplazada' });
  } else {
    // Añadida antes de la última pregunta de la sesión (que suele ser la de cierre o un caso).
    var ordenes = planeadas.map(function (p) { return Number(p['orden']); });
    base.orden = ordenes.length ? Math.max.apply(null, ordenes) - 0.5 : 1;
  }
  agregar_('Preguntas', nuevaFilaPregunta_(n, base));
  registrar_('pregunta_adaptada', 'Sesión ' + n + ': ' + adaptada.accion + ' · ' + adaptada.motivo);
}

/** Sustituye los marcadores de la sesión siguiente por preguntas generadas a partir del perfil. */
function expandirMarcadores_(n, analisis) {
  preguntasDeSesion_(n).forEach(function (p) {
    var tipo = p['generar'];
    if (!tipo) return;
    try {
      if (tipo === 'validacion') expandirLista_(n, p, 'validacion', analisis.afirmaciones_validacion, 'afirmacion');
      if (tipo === 'hipotesis') expandirLista_(n, p, 'hipotesis', analisis.hipotesis_a_validar, 'hipotesis');
      if (tipo === 'calibracion') generarCalibracion_(p);
      if (tipo === 'ciego') generarParesCiegos_(n, p);
    } catch (err) {
      // El marcador queda sin resolver: al iniciar la sesión se convierte en pregunta abierta o se omite.
      registrar_('generacion_error', p['pregunta_id'] + ': ' + String(err && err.message || err).slice(0, 1000));
    }
  });
}

function expandirLista_(n, marcador, tipo, textos, campo) {
  var lista = (textos || []).map(function (t) { return String(t || '').trim(); }).filter(function (t) { return t; });
  var cantidad = Number(jsonSeguro_(marcador['datos'], {}).cantidad) || lista.length;
  lista = lista.slice(0, cantidad);
  if (!lista.length) return;
  lista.forEach(function (texto, i) {
    var datos = {};
    datos[campo] = texto;
    agregar_('Preguntas', nuevaFilaPregunta_(n, {
      pregunta_id: marcador['pregunta_id'] + '-' + (i + 1),
      orden: Number(marcador['orden']) + i / 100,
      tecnica: marcador['técnica'],
      enfoque: marcador['enfoque'],
      modalidad: 'escrita',
      contexto: marcador['contexto'],
      texto: texto,
      tipo: tipo,
      datos: datos,
    }));
  });
  actualizar_('Preguntas', marcador._fila, { estado: 'reemplazada' });
}

/** Contexto común para que la Gloria virtual responda: perfil, frases y ejemplos reales. */
function contextoVirtual_() {
  var perfil = perfilVigente_();
  if (!perfil) throw new Error('Todavía no hay perfil.');
  var frases = jsonSeguro_(perfil['frases_características'], []);
  return {
    perfil: perfil['perfil_markdown'],
    frases: frases.map(function (f) { return '- ' + f; }).join('\n') || '(ninguna todavía)',
    ejemplos: ejemplosReales_(8).map(function (e) {
      return '<ejemplo>\nSituación: ' + e.situacion + '\nRespuesta de Gloria: ' + e.respuesta + '\n</ejemplo>';
    }).join('\n') || '(ninguno todavía)',
  };
}

function respuestaVirtual_(situacion, modo) {
  var ctx = contextoVirtual_();
  var instrucciones = {
    calibracion: 'Responde al cliente como lo haría Gloria en un chat o por escrito.',
    ciego: 'Responde a la pregunta como Gloria respondió en el programa de entrevistas: en primera persona, con su forma de construir las ideas y una extensión parecida a sus respuestas reales. Si la pregunta se respondió por voz, escribe como ella lo diría hablando.',
  };
  var resultado = llamarClaude_({
    modelo: MODELO_ANALISIS,
    sistema: rellenar_(PROMPTS.calibracion.sistema, {
      perfil: ctx.perfil,
      frases: ctx.frases,
      ejemplos: ctx.ejemplos,
      instruccion_modo: instrucciones[modo],
    }),
    usuario: rellenar_(PROMPTS.calibracion.usuario, { situacion: situacion }),
    esfuerzo: 'medium',
    maxTokens: 8000,
    esquema: {
      type: 'object',
      properties: { respuesta: { type: 'string' } },
      required: ['respuesta'],
      additionalProperties: false,
    },
  });
  var texto = String(resultado.respuesta || '').trim();
  if (!texto) throw new Error('La Gloria virtual devolvió una respuesta vacía.');
  return texto;
}

function generarCalibracion_(marcador) {
  var datos = jsonSeguro_(marcador['datos'], {});
  var situacion = datos.situacion || marcador['contexto'];
  datos.situacion = situacion;
  datos.respuesta_virtual = respuestaVirtual_(situacion, 'calibracion');
  actualizar_('Preguntas', marcador._fila, { datos: JSON.stringify(datos), generar: '' });
}

/**
 * Prueba a ciegas: elige respuestas reales de Gloria (abiertas, de extensión media, no usadas antes),
 * genera la versión virtual de cada una y las presenta como A y B en orden aleatorio.
 */
function generarParesCiegos_(n, marcador) {
  var cantidad = Number(jsonSeguro_(marcador['datos'], {}).cantidad) || 4;
  var usadas = {};
  leer_('Preguntas').forEach(function (p) {
    if (p['tipo'] === 'ciego') {
      var d = jsonSeguro_(p['datos'], {});
      if (d.respuesta_id) usadas[d.respuesta_id] = true;
    }
  });
  var candidatas = leer_('Respuestas').filter(function (r) {
    var palabras = Number(r['palabras']);
    return r['tipo'] === 'abierta' && !esVerdadero_(r['es_repregunta']) && palabras >= 30 && palabras <= 260 &&
      Number(r['sesión_n']) >= 3 && Number(r['sesión_n']) <= 22 && !usadas[r['id']];
  });
  // Variedad: como mucho una respuesta por sesión, repartidas entre las fases.
  var porSesion = {};
  candidatas.forEach(function (r) {
    if (!porSesion[r['sesión_n']]) porSesion[r['sesión_n']] = r;
  });
  var elegidas = mezclar_(Object.keys(porSesion).map(function (k) { return porSesion[k]; })).slice(0, cantidad);
  if (!elegidas.length) throw new Error('No hay respuestas reales suficientes para la prueba a ciegas.');
  var creadas = 0;
  elegidas.forEach(function (r, i) {
    var real = r['respuesta_editada'] || r['respuesta_original'];
    var virtual = respuestaVirtual_(r['texto_pregunta'], 'ciego');
    var realEsA = Math.random() < 0.5;
    agregar_('Preguntas', nuevaFilaPregunta_(n, {
      pregunta_id: marcador['pregunta_id'] + '-' + (i + 1),
      orden: Number(marcador['orden']) + i / 100,
      tecnica: 'ciego',
      enfoque: 'lenguaje',
      modalidad: 'escrita',
      contexto: marcador['contexto'],
      texto: '¿Cuál de las dos respuestas es tuya? Cuéntame en qué te fijaste.',
      tipo: 'ciego',
      datos: {
        pregunta_original: r['texto_pregunta'],
        a: realEsA ? real : virtual,
        b: realEsA ? virtual : real,
        real: realEsA ? 'a' : 'b',
        respuesta_id: r['id'],
      },
    }));
    creadas += 1;
  });
  if (creadas) actualizar_('Preguntas', marcador._fila, { estado: 'reemplazada' });
}

function mezclar_(lista) {
  var copia = lista.slice();
  for (var i = copia.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = copia[i];
    copia[i] = copia[j];
    copia[j] = t;
  }
  return copia;
}

/**
 * Pares situación → respuesta real de Gloria, para los ejemplos de la Gloria virtual.
 * Incluye su propia versión cuando corrigió a la Gloria virtual en la calibración.
 */
function ejemplosReales_(maximo) {
  var lista = [];
  leer_('Respuestas').forEach(function (r) {
    var datos = jsonSeguro_(r['datos'], {});
    var texto = String(r['respuesta_editada'] || r['respuesta_original'] || '').trim();
    var palabras = contarPalabras_(texto);
    if (r['tipo'] === 'calibracion' && datos.eleccion && datos.eleccion !== 'Así lo diría' && palabras >= 5) {
      lista.push({
        situacion: String(r['texto_pregunta']).split('\n')[0],
        respuesta: texto,
        sesion: Number(r['sesión_n']),
        tecnica: 'calibracion',
        enfoque: r['enfoque'],
        modalidad: r['modalidad'],
        etiquetas: ['calibracion', 'correccion_de_gloria', r['enfoque']],
      });
      return;
    }
    if ((r['tipo'] === 'abierta' || r['tipo'] === 'opciones') && palabras >= 10 && String(r['pregunta_id']) !== 'S01-P1') {
      lista.push({
        situacion: String(r['texto_pregunta']),
        respuesta: texto,
        sesion: Number(r['sesión_n']),
        tecnica: r['técnica'],
        enfoque: r['enfoque'],
        modalidad: r['modalidad'],
        etiquetas: [faseDe_(Number(r['sesión_n'])), r['técnica'], r['enfoque']]
          .concat(esVerdadero_(r['es_repregunta']) ? ['repregunta'] : []),
      });
    }
  });
  if (!maximo) return lista;
  // Para el prompt: las correcciones de calibración primero y, después, variedad de enfoques.
  var vistos = {};
  var seleccion = [];
  lista.filter(function (e) { return e.tecnica === 'calibracion'; }).concat(lista).forEach(function (e) {
    var clave = e.tecnica === 'calibracion' ? 'cal-' + seleccion.length : e.enfoque;
    if (seleccion.length < maximo && !vistos[clave] && seleccion.indexOf(e) < 0) {
      vistos[clave] = true;
      seleccion.push(e);
    }
  });
  return seleccion;
}
