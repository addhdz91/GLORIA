/**
 * Gloria Virtual · backend (Google Apps Script).
 *
 * Endpoints (doPost con el campo «action»), reglas de sesiones y avance (sección 3.3),
 * almacenamiento en Google Sheets y repreguntas en vivo con la API de Claude.
 * Secretos en Script Properties: ACCESS_CODE, ANTHROPIC_API_KEY, SHEET_ID (y, opcional,
 * BLIND_CODE para la persona del equipo que hace la prueba a ciegas).
 */

var ZONA = 'America/Bogota';
var TOTAL_SESIONES = 30;
var MAX_SESIONES_DIA = 2;
var MAX_REPREGUNTAS_RESPUESTA = 2;
var MAX_REPREGUNTAS_SESION = 6;
var DIAS_TOKEN_RECORDAR = 180;
var HORAS_TOKEN = 12;
var MAX_FALLOS_ACCESO = 5;
var MINUTOS_BLOQUEO = 15;
/** Tras completar una sesión, se espera hasta este tiempo a que el análisis prepare la siguiente. */
var MINUTOS_PREPARANDO = 10;

var MODELO_REPREGUNTA = 'claude-sonnet-5-5';
var MODELO_ANALISIS = 'claude-opus-5-5';
var API_URL = 'https://api.anthropic.com/v1/messages';
var API_VERSION = '2026-10-21';

/** Pestañas de la hoja y sus columnas (las de la especificación primero, luego las añadidas). */
var HOJAS = {
  Sesiones: ['sesión_n', 'estado', 'fecha_inicio', 'fecha_fin', 'preguntas_total', 'preguntas_respondidas',
    'analizada', 'intentos_análisis'],
  Respuestas: ['id', 'fecha_hora', 'sesión_n', 'pregunta_id', 'es_repregunta', 'padre_id', 'técnica', 'enfoque',
    'modalidad', 'texto_pregunta', 'respuesta_original', 'respuesta_editada', 'duración_seg', 'palabras', 'ppm',
    'pausas_largas', 'escuchó_pregunta', 'cambió_a_texto', 'tipo', 'datos', 'segmentos', 'client_id'],
  Borradores: ['sesión_n', 'pregunta_id', 'texto', 'fecha_hora'],
  Preguntas: ['pregunta_id', 'sesión_n', 'orden', 'técnica', 'enfoque', 'modalidad', 'contexto', 'texto', 'origen',
    'estado', 'tipo', 'opciones', 'limite_seg', 'datos', 'padre_id', 'generar'],
  Perfil: ['versión', 'fecha', 'perfil_markdown', 'hipótesis', 'huecos_detectados', 'frases_características',
    'sesión_n'],
  Progreso: ['fecha_inicio_programa', 'última_actividad', 'sesiones_completadas', 'consentimiento_fecha',
    'tutorial_visto'],
  Log: ['fecha_hora', 'evento', 'detalle'],
  Prueba_ciega: ['fecha_hora', 'evaluador', 'pregunta_id', 'eleccion', 'acierto', 'comentario'],
};

/** Columnas de texto libre: se guardan como texto plano (sin fórmulas ni conversión a fechas). */
var COLUMNAS_TEXTO = ['texto_pregunta', 'respuesta_original', 'respuesta_editada', 'texto', 'contexto',
  'perfil_markdown', 'hipótesis', 'huecos_detectados', 'frases_características', 'detalle', 'datos', 'opciones',
  'segmentos', 'comentario', 'pregunta_id', 'padre_id', 'id', 'client_id'];

var OPCIONES_TIPO = {
  validacion: ['Esa soy yo', 'No soy yo', 'Depende'],
  hipotesis: ['Lo confirmo', 'Lo matizo', 'Lo descarto'],
  calibracion: ['Así lo diría', 'Casi', 'Así no lo diría'],
  ciego: ['La A es mía', 'La B es mía', 'No lo sé'],
};

// ───────────────────────────── Entrada HTTP ─────────────────────────────

function doGet() {
  return ContentService.createTextOutput('Gloria Virtual: backend activo.');
}

/**
 * El frontend envía `text/plain` (sin preflight CORS) con un JSON: { action, token, ...datos }.
 * Siempre responde 200 con { ok: true, ... } o { ok: false, error: { codigo, mensaje } }.
 */
function doPost(e) {
  var respuesta;
  try {
    var datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    respuesta = despachar_(datos);
  } catch (err) {
    respuesta = errorRespuesta_(err);
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta)).setMimeType(ContentService.MimeType.JSON);
}

function despachar_(datos) {
  var accion = String(datos.action || '');
  if (accion === 'login') return login_(datos);
  var sesion = autenticar_(datos.token);
  var soloGloria = function () {
    if (sesion.rol !== 'gloria') throw errorApp_('NO_AUTORIZADO', 'No tienes acceso a esta acción.');
  };
  switch (accion) {
    case 'getStatus': soloGloria(); return conOk_(estado_());
    case 'consent': soloGloria(); return consentir_(datos);
    case 'tutorial': soloGloria(); return marcarTutorial_();
    case 'startSession': soloGloria(); return iniciarSesion_();
    case 'getSession': soloGloria(); return conOk_(sesionActual_());
    case 'saveDraft': soloGloria(); return guardarBorrador_(datos);
    case 'submitAnswer': soloGloria(); return enviarRespuesta_(datos);
    case 'completeSession': soloGloria(); return completarSesion_(datos);
    case 'logout': return cerrarSesion_(datos.token);
    case 'getBlindTest': return conOk_(pruebaCiega_(sesion));
    case 'submitBlind': return enviarPruebaCiega_(sesion, datos);
    default: throw errorApp_('ACCION_DESCONOCIDA', 'Acción no reconocida.');
  }
}

function conOk_(obj) {
  obj.ok = true;
  return obj;
}

function errorApp_(codigo, mensaje, extra) {
  var err = new Error(mensaje);
  err.codigo = codigo;
  err.extra = extra || null;
  return err;
}

function errorRespuesta_(err) {
  if (err && err.codigo) {
    return { ok: false, error: { codigo: err.codigo, mensaje: err.message, extra: err.extra } };
  }
  registrar_('error', String((err && err.stack) || err).slice(0, 1500));
  return { ok: false, error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo falló en el servidor. Inténtalo de nuevo en un momento.' } };
}

// ───────────────────────────── Tiempo ─────────────────────────────

/** Hora actual. Las pruebas pueden fijarla con __AHORA_PRUEBA__ (en Apps Script no existe). */
function ahora_() {
  if (typeof __AHORA_PRUEBA__ !== 'undefined' && __AHORA_PRUEBA__) return new Date(__AHORA_PRUEBA__);
  return new Date();
}

/** Día calendario en Bogotá, «yyyy-MM-dd». */
function dia_(fecha) {
  return Utilities.formatDate(new Date(fecha), ZONA, 'yyyy-MM-dd');
}

/** Días calendario entre dos días «yyyy-MM-dd» (b − a). */
function diasEntre_(a, b) {
  var ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86400000);
}

// ───────────────────────────── Hoja de cálculo ─────────────────────────────

function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw errorApp_('SIN_CONFIGURAR', 'Falta SHEET_ID en las propiedades del script.');
  return SpreadsheetApp.openById(id);
}

function hoja_(nombre) {
  var hoja = libro_().getSheetByName(nombre);
  if (!hoja) throw errorApp_('SIN_CONFIGURAR', 'Falta la pestaña «' + nombre + '». Ejecuta setup().');
  return hoja;
}

/** Filas de una pestaña como objetos { columna: valor, _fila: n }. */
function leer_(nombre) {
  var hoja = hoja_(nombre);
  var ultima = hoja.getLastRow();
  var columnas = HOJAS[nombre];
  if (ultima < 2) return [];
  var valores = hoja.getRange(2, 1, ultima - 1, columnas.length).getValues();
  return valores.map(function (fila, i) {
    var obj = { _fila: i + 2 };
    columnas.forEach(function (col, j) {
      obj[col] = fila[j];
    });
    return obj;
  });
}

/** Un texto que empiece por =, +, - o @ se guarda con apóstrofo para que Sheets no lo interprete. */
function celda_(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string' && /^[=+\-@]/.test(valor)) return "'" + valor;
  return valor;
}

function agregar_(nombre, obj) {
  var fila = HOJAS[nombre].map(function (col) {
    return celda_(obj[col]);
  });
  hoja_(nombre).appendRow(fila);
}

function actualizar_(nombre, numFila, cambios) {
  var hoja = hoja_(nombre);
  var columnas = HOJAS[nombre];
  Object.keys(cambios).forEach(function (col) {
    var j = columnas.indexOf(col);
    if (j < 0) throw new Error('Columna desconocida: ' + col);
    hoja.getRange(numFila, j + 1).setValue(celda_(cambios[col]));
  });
}

function registrar_(evento, detalle) {
  try {
    agregar_('Log', { fecha_hora: ahora_(), evento: evento, detalle: String(detalle || '').slice(0, 5000) });
  } catch (err) {
    Logger.log(evento + ': ' + detalle);
  }
}

function progreso_() {
  var filas = leer_('Progreso');
  if (!filas.length) throw errorApp_('SIN_CONFIGURAR', 'Falta la fila de progreso. Ejecuta setup().');
  return filas[0];
}

function jsonSeguro_(texto, porDefecto) {
  if (texto === '' || texto === null || texto === undefined) return porDefecto;
  if (typeof texto === 'object') return texto;
  try {
    return JSON.parse(texto);
  } catch (err) {
    return porDefecto;
  }
}

function esVerdadero_(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function contarPalabras_(texto) {
  var limpio = String(texto || '').trim();
  return limpio ? limpio.split(/\s+/).length : 0;
}

function conBloqueo_(fn) {
  var bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(20000);
  try {
    return fn();
  } finally {
    bloqueo.releaseLock();
  }
}

// ───────────────────────────── Acceso ─────────────────────────────

function login_(datos) {
  return conBloqueo_(function () {
    var props = PropertiesService.getScriptProperties();
    var ahora = ahora_().getTime();
    var bloqueadoHasta = Number(props.getProperty('login_bloqueado_hasta') || 0);
    if (bloqueadoHasta > ahora) {
      var minutos = Math.ceil((bloqueadoHasta - ahora) / 60000);
      throw errorApp_('BLOQUEADO', 'Demasiados intentos. Vuelve a intentarlo en ' + minutos + ' minutos.', { minutos: minutos });
    }
    var codigo = String(datos.codigo || '').trim();
    var acceso = String(props.getProperty('ACCESS_CODE') || '').trim();
    var ciego = String(props.getProperty('BLIND_CODE') || '').trim();
    if (!acceso) throw errorApp_('SIN_CONFIGURAR', 'Falta ACCESS_CODE en las propiedades del script.');
    var rol = codigo && codigo === acceso ? 'gloria' : codigo && ciego && codigo === ciego ? 'evaluador' : null;
    if (!rol) {
      var fallos = Number(props.getProperty('login_fallos') || 0) + 1;
      if (fallos >= MAX_FALLOS_ACCESO) {
        props.setProperty('login_bloqueado_hasta', String(ahora + MINUTOS_BLOQUEO * 60000));
        props.setProperty('login_fallos', '0');
        registrar_('acceso_bloqueado', fallos + ' intentos fallidos');
        throw errorApp_('BLOQUEADO', 'Demasiados intentos. Vuelve a intentarlo en ' + MINUTOS_BLOQUEO + ' minutos.', { minutos: MINUTOS_BLOQUEO });
      }
      props.setProperty('login_fallos', String(fallos));
      throw errorApp_('CODIGO_INCORRECTO', 'El código no es correcto. Revísalo e inténtalo de nuevo.');
    }
    props.setProperty('login_fallos', '0');
    limpiarTokensCaducados_(props, ahora);
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    var recordar = !!datos.recordar;
    var expira = ahora + (recordar ? DIAS_TOKEN_RECORDAR * 86400000 : HORAS_TOKEN * 3600000);
    props.setProperty('tok_' + token, JSON.stringify({ rol: rol, expira: expira, recordar: recordar }));
    registrar_('acceso', rol + (recordar ? ' (recordar dispositivo)' : ''));
    return { ok: true, token: token, rol: rol, recordar: recordar };
  });
}

function limpiarTokensCaducados_(props, ahora) {
  var todas = props.getProperties();
  Object.keys(todas).forEach(function (clave) {
    if (clave.indexOf('tok_') !== 0) return;
    var info = jsonSeguro_(todas[clave], null);
    if (!info || info.expira < ahora) props.deleteProperty(clave);
  });
}

function autenticar_(token) {
  if (!token) throw errorApp_('SIN_SESION', 'Tu acceso caducó. Escribe tu código otra vez.');
  var info = jsonSeguro_(PropertiesService.getScriptProperties().getProperty('tok_' + token), null);
  if (!info || info.expira < ahora_().getTime()) {
    throw errorApp_('SIN_SESION', 'Tu acceso caducó. Escribe tu código otra vez.');
  }
  return info;
}

function cerrarSesion_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('tok_' + token);
  return { ok: true };
}

// ───────────────────────────── Estado y panel ─────────────────────────────

function consentir_(datos) {
  if (!datos.acepta) throw errorApp_('SIN_CONSENTIMIENTO', 'Para continuar necesitamos tu aceptación.');
  return conBloqueo_(function () {
    var progreso = progreso_();
    var cambios = {};
    if (!progreso['consentimiento_fecha']) cambios['consentimiento_fecha'] = ahora_();
    if (!progreso['fecha_inicio_programa']) cambios['fecha_inicio_programa'] = ahora_();
    if (Object.keys(cambios).length) actualizar_('Progreso', progreso._fila, cambios);
    registrar_('consentimiento', 'Aceptado');
    return { ok: true };
  });
}

function marcarTutorial_() {
  var progreso = progreso_();
  if (!esVerdadero_(progreso['tutorial_visto'])) actualizar_('Progreso', progreso._fila, { tutorial_visto: true });
  return { ok: true };
}

/** Resumen para el panel de inicio (sección 3.2). Todo se calcula en el servidor. */
function estado_() {
  var hoy = dia_(ahora_());
  var progreso = progreso_();
  var sesiones = leer_('Sesiones');
  var respuestas = leer_('Respuestas');

  var completadas = sesiones.filter(function (s) { return s['estado'] === 'completada'; }).length;
  var enCurso = sesiones.filter(function (s) { return s['estado'] === 'en curso'; })[0] || null;
  var iniciadasHoy = sesiones.filter(function (s) {
    return s['fecha_inicio'] && dia_(s['fecha_inicio']) === hoy;
  }).length;

  var diasConRespuesta = {};
  respuestas.forEach(function (r) {
    if (r['fecha_hora']) diasConRespuesta[dia_(r['fecha_hora'])] = true;
  });
  var ultima = progreso['última_actividad'] ? dia_(progreso['última_actividad']) : null;
  var diasSinResponder = ultima ? diasEntre_(ultima, hoy) : null;

  var diasSinActividadTotal = 0;
  if (progreso['fecha_inicio_programa']) {
    var inicio = dia_(progreso['fecha_inicio_programa']);
    var activosAntes = Object.keys(diasConRespuesta).filter(function (d) { return d >= inicio && d < hoy; }).length;
    diasSinActividadTotal = Math.max(0, diasEntre_(inicio, hoy) - activosAntes);
  }

  var motivo = null;
  var preparandoMin = 0;
  if (enCurso) motivo = 'SESION_EN_CURSO';
  else if (completadas >= TOTAL_SESIONES) motivo = 'PROGRAMA_COMPLETO';
  else if (iniciadasHoy >= MAX_SESIONES_DIA) motivo = 'LIMITE_DIARIO';
  else {
    preparandoMin = minutosPreparando_(sesiones);
    if (preparandoMin > 0) motivo = 'PREPARANDO';
  }

  var enCursoInfo = null;
  if (enCurso) {
    var preguntas = preguntasDeSesion_(enCurso['sesión_n']);
    var contestadas = idsRespondidos_(respuestas, enCurso['sesión_n']);
    var principales = preguntas.filter(function (p) { return !p['padre_id']; });
    var faltan = preguntas.filter(function (p) { return !contestadas[p['pregunta_id']]; });
    enCursoInfo = {
      sesion: Number(enCurso['sesión_n']),
      total: principales.length,
      respondidas: principales.filter(function (p) { return contestadas[p['pregunta_id']]; }).length,
      faltan: faltan.filter(function (p) { return !p['padre_id']; }).length || (faltan.length ? 1 : 0),
    };
  }

  var siguiente = sesiones.filter(function (s) { return s['estado'] === 'pendiente'; })
    .map(function (s) { return Number(s['sesión_n']); }).sort(function (a, b) { return a - b; })[0] || null;

  return {
    consentimiento: !!progreso['consentimiento_fecha'],
    tutorial_visto: esVerdadero_(progreso['tutorial_visto']),
    total: TOTAL_SESIONES,
    completadas: completadas,
    casillas: sesiones.map(function (s) {
      return { n: Number(s['sesión_n']), estado: s['estado'] };
    }).sort(function (a, b) { return a.n - b.n; }),
    en_curso: enCursoInfo,
    siguiente: siguiente,
    iniciadas_hoy: iniciadasHoy,
    max_por_dia: MAX_SESIONES_DIA,
    puede_empezar: !motivo,
    motivo: motivo,
    preparando_min: preparandoMin,
    dias_sin_responder: diasSinResponder,
    dias_sin_actividad_total: diasSinActividadTotal,
    ultima_actividad: progreso['última_actividad'] ? new Date(progreso['última_actividad']).toISOString() : null,
  };
}

/** Minutos que faltan para dar por preparada la siguiente sesión (0 si ya está o si el análisis tarda demasiado). */
function minutosPreparando_(sesiones) {
  var pendientes = sesiones.filter(function (s) {
    return s['estado'] === 'completada' && !esVerdadero_(s['analizada']) && s['fecha_fin'];
  });
  if (!pendientes.length) return 0;
  var ultimaFin = Math.max.apply(null, pendientes.map(function (s) { return new Date(s['fecha_fin']).getTime(); }));
  var restante = MINUTOS_PREPARANDO * 60000 - (ahora_().getTime() - ultimaFin);
  return restante > 0 ? Math.ceil(restante / 60000) : 0;
}

// ───────────────────────────── Sesiones ─────────────────────────────

/** Preguntas activas de una sesión, en orden. */
function preguntasDeSesion_(n) {
  return leer_('Preguntas').filter(function (p) {
    return Number(p['sesión_n']) === Number(n) && p['estado'] === 'activa';
  }).sort(function (a, b) { return Number(a['orden']) - Number(b['orden']); });
}

function idsRespondidos_(respuestas, n) {
  var ids = {};
  respuestas.forEach(function (r) {
    if (Number(r['sesión_n']) === Number(n)) ids[r['pregunta_id']] = true;
  });
  return ids;
}

function iniciarSesion_() {
  return conBloqueo_(function () {
    var info = estado_();
    if (!info.consentimiento) throw errorApp_('SIN_CONSENTIMIENTO', 'Primero necesitamos tu aceptación.');
    if (info.motivo === 'SESION_EN_CURSO') {
      throw errorApp_('SESION_EN_CURSO', 'Tienes una sesión a medias. Termínala antes de empezar otra.', { sesion: info.en_curso.sesion });
    }
    if (info.motivo === 'PROGRAMA_COMPLETO') throw errorApp_('PROGRAMA_COMPLETO', 'Ya completaste las 30 sesiones.');
    if (info.motivo === 'LIMITE_DIARIO') {
      throw errorApp_('LIMITE_DIARIO', 'Por hoy es suficiente. Tu próxima sesión estará disponible mañana.');
    }
    if (info.motivo === 'PREPARANDO') {
      throw errorApp_('PREPARANDO', 'Estamos preparando tu próxima sesión. Estará lista en unos minutos.', { minutos: info.preparando_min });
    }
    var n = info.siguiente;
    prepararPreguntasSesion_(n);
    var preguntas = preguntasDeSesion_(n);
    if (!preguntas.length) throw errorApp_('SIN_PREGUNTAS', 'La sesión ' + n + ' no tiene preguntas. Avisa al administrador.');
    var fila = leer_('Sesiones').filter(function (s) { return Number(s['sesión_n']) === n; })[0];
    actualizar_('Sesiones', fila._fila, {
      estado: 'en curso',
      fecha_inicio: ahora_(),
      preguntas_total: preguntas.length,
      preguntas_respondidas: 0,
    });
    registrar_('sesion_iniciada', 'Sesión ' + n);
    return conOk_(sesionActual_());
  });
}

/**
 * Resuelve los marcadores que el análisis no pudo sustituir: una calibración sin respuesta
 * virtual pasa a pregunta abierta («¿cómo le responderías tú?»); el resto se omite.
 */
function prepararPreguntasSesion_(n) {
  preguntasDeSesion_(n).forEach(function (p) {
    if (!p['generar']) return;
    if (p['generar'] === 'calibracion') {
      var datos = jsonSeguro_(p['datos'], {});
      if (!datos.respuesta_virtual) {
        actualizar_('Preguntas', p._fila, {
          tipo: 'abierta',
          técnica: 'sjt',
          texto: '¿Cómo le responderías tú? Escríbelo tal cual lo enviarías.',
          generar: '',
        });
      }
      return;
    }
    actualizar_('Preguntas', p._fila, { estado: 'omitida' });
  });
}

/** Sesión en curso con sus preguntas para el frontend (sin datos internos, p. ej. cuál respuesta es la real). */
function sesionActual_() {
  var enCurso = leer_('Sesiones').filter(function (s) { return s['estado'] === 'en curso'; })[0];
  if (!enCurso) return { sesion: null };
  var n = Number(enCurso['sesión_n']);
  var respuestas = leer_('Respuestas');
  var contestadas = idsRespondidos_(respuestas, n);
  var preguntas = preguntasDeSesion_(n);
  var numero = 0;
  var totalPrincipales = preguntas.filter(function (p) { return !p['padre_id']; }).length;
  var lista = preguntas.map(function (p) {
    if (!p['padre_id']) numero += 1;
    return preguntaParaCliente_(p, numero, totalPrincipales, !!contestadas[p['pregunta_id']]);
  });
  var borradores = {};
  leer_('Borradores').forEach(function (b) {
    if (Number(b['sesión_n']) === n) borradores[b['pregunta_id']] = String(b['texto'] || '');
  });
  var actual = lista.filter(function (p) { return !p.respondida; })[0] || null;
  return {
    sesion: n,
    total_sesiones: TOTAL_SESIONES,
    preguntas: lista,
    actual: actual ? actual.id : null,
    total_principales: totalPrincipales,
    respondidas_principales: lista.filter(function (p) { return !p.es_repregunta && p.respondida; }).length,
    borradores: borradores,
  };
}

function preguntaParaCliente_(p, numero, total, respondida) {
  var tipo = p['tipo'] || 'abierta';
  var datos = jsonSeguro_(p['datos'], {});
  var salida = {
    id: String(p['pregunta_id']),
    numero: numero,
    total: total,
    es_repregunta: !!p['padre_id'],
    padre_id: p['padre_id'] ? String(p['padre_id']) : null,
    tipo: tipo,
    modalidad: p['modalidad'] || 'escrita',
    contexto: String(p['contexto'] || ''),
    texto: String(p['texto'] || ''),
    opciones: jsonSeguro_(p['opciones'], null) || OPCIONES_TIPO[tipo] || null,
    limite_seg: p['limite_seg'] ? Number(p['limite_seg']) : null,
    respondida: respondida,
  };
  if (tipo === 'likert') {
    salida.items = MINI_IPIP.items.filter(function (it) { return it.sesion === Number(datos.bloque_ipip); })
      .map(function (it) { return { id: it.id, texto: it.texto }; });
    salida.escala = MINI_IPIP.escala;
    salida.instruccion = MINI_IPIP.instruccion;
  }
  if (tipo === 'calibracion') salida.respuesta_virtual = String(datos.respuesta_virtual || '');
  if (tipo === 'ciego') {
    salida.pregunta_original = String(datos.pregunta_original || '');
    salida.respuesta_a = String(datos.a || '');
    salida.respuesta_b = String(datos.b || '');
  }
  return salida;
}

function guardarBorrador_(datos) {
  var n = Number(datos.sesion);
  var id = String(datos.pregunta_id || '');
  if (!n || !id) throw errorApp_('DATOS_INVALIDOS', 'Faltan datos del borrador.');
  return conBloqueo_(function () {
    var existente = leer_('Borradores').filter(function (b) {
      return Number(b['sesión_n']) === n && String(b['pregunta_id']) === id;
    })[0];
    var texto = String(datos.texto || '').slice(0, 50000);
    if (existente) actualizar_('Borradores', existente._fila, { texto: texto, fecha_hora: ahora_() });
    else agregar_('Borradores', { 'sesión_n': n, pregunta_id: id, texto: texto, fecha_hora: ahora_() });
    return { ok: true };
  });
}

function borrarBorrador_(n, id) {
  var hoja = hoja_('Borradores');
  leer_('Borradores').filter(function (b) {
    return Number(b['sesión_n']) === n && String(b['pregunta_id']) === id;
  }).reverse().forEach(function (b) {
    hoja.deleteRow(b._fila);
  });
}

/**
 * Guarda una respuesta (idempotente por pregunta: si llega dos veces desde la cola sin conexión,
 * la segunda no duplica) y decide si hay repregunta. Si la API de Claude falla, la sesión sigue.
 */
function enviarRespuesta_(datos) {
  var n = Number(datos.sesion);
  var id = String(datos.pregunta_id || '');
  var guardado = conBloqueo_(function () {
    var sesion = leer_('Sesiones').filter(function (s) { return Number(s['sesión_n']) === n; })[0];
    if (!sesion || sesion['estado'] !== 'en curso') {
      throw errorApp_('SESION_NO_ACTIVA', 'Esta sesión ya no está en curso.');
    }
    var pregunta = preguntasDeSesion_(n).filter(function (p) { return String(p['pregunta_id']) === id; })[0];
    if (!pregunta) throw errorApp_('PREGUNTA_INVALIDA', 'No encontramos esa pregunta en la sesión.');
    var respuestas = leer_('Respuestas');
    if (idsRespondidos_(respuestas, n)[id]) return { duplicada: true, pregunta: pregunta };

    var fila = filaRespuesta_(pregunta, datos, n);
    agregar_('Respuestas', fila);
    borrarBorrador_(n, id);
    var progreso = progreso_();
    actualizar_('Progreso', progreso._fila, { 'última_actividad': fila.fecha_hora });
    if (!pregunta['padre_id']) {
      var contestadas = idsRespondidos_(respuestas, n);
      contestadas[id] = true;
      var principales = preguntasDeSesion_(n).filter(function (p) { return !p['padre_id']; });
      actualizar_('Sesiones', sesion._fila, {
        preguntas_respondidas: principales.filter(function (p) { return contestadas[p['pregunta_id']]; }).length,
      });
    }
    return { duplicada: false, pregunta: pregunta, fila: fila };
  });

  if (!guardado.duplicada) {
    try {
      decidirRepregunta_(n, guardado.pregunta, guardado.fila);
    } catch (err) {
      registrar_('repregunta_error', String(err && err.message || err).slice(0, 1000));
    }
  }
  var sesion = sesionActual_();
  var siguiente = sesion.preguntas ? sesion.preguntas.filter(function (p) { return !p.respondida; })[0] || null : null;
  return { ok: true, duplicada: guardado.duplicada, siguiente: siguiente, sesion_terminada: !siguiente, estado_sesion: sesion };
}

function filaRespuesta_(pregunta, datos, n) {
  var tipo = pregunta['tipo'] || 'abierta';
  var original = String(datos.respuesta_original || '');
  var editada = datos.respuesta_editada ? String(datos.respuesta_editada) : '';
  var extra = {};
  if (tipo === 'likert') {
    extra.valores = datos.valores || {};
    original = JSON.stringify(extra.valores);
  }
  if (OPCIONES_TIPO[tipo] || jsonSeguro_(pregunta['opciones'], null)) {
    if (datos.eleccion !== undefined && datos.eleccion !== null && datos.eleccion !== '') extra.eleccion = String(datos.eleccion);
  }
  if (tipo === 'ciego') {
    var info = jsonSeguro_(pregunta['datos'], {});
    var elegida = extra.eleccion === 'La A es mía' ? 'a' : extra.eleccion === 'La B es mía' ? 'b' : null;
    extra.acierto = elegida ? elegida === info.real : null;
  }
  if (tipo === 'calibracion') extra.respuesta_virtual = jsonSeguro_(pregunta['datos'], {}).respuesta_virtual || '';
  var textoBase = editada || original;
  var duracion = Number(datos.duracion_seg) || 0;
  var palabras = tipo === 'likert' ? 0 : contarPalabras_(textoBase);
  var ppm = datos.ppm !== undefined && datos.ppm !== null && datos.ppm !== ''
    ? Number(datos.ppm)
    : (pregunta['modalidad'] === 'voz' && duracion > 0 ? Math.round(palabras / (duracion / 60)) : '');
  var texto = [pregunta['contexto'], pregunta['texto']].filter(function (t) { return t; }).join('\n');
  return {
    id: Utilities.getUuid(),
    fecha_hora: ahora_(),
    'sesión_n': n,
    pregunta_id: String(pregunta['pregunta_id']),
    es_repregunta: !!pregunta['padre_id'],
    padre_id: pregunta['padre_id'] || '',
    'técnica': pregunta['técnica'],
    enfoque: pregunta['enfoque'],
    modalidad: datos.modalidad_usada || pregunta['modalidad'],
    texto_pregunta: texto,
    respuesta_original: original,
    respuesta_editada: editada && editada !== original ? editada : '',
    'duración_seg': duracion || '',
    palabras: palabras,
    ppm: ppm,
    pausas_largas: datos.pausas_largas !== undefined ? Number(datos.pausas_largas) || 0 : '',
    'escuchó_pregunta': !!datos.escucho_pregunta,
    'cambió_a_texto': !!datos.cambio_a_texto,
    tipo: tipo,
    datos: Object.keys(extra).length ? JSON.stringify(extra) : '',
    segmentos: datos.segmentos ? JSON.stringify(datos.segmentos).slice(0, 45000) : '',
    client_id: String(datos.client_id || ''),
  };
}

// ───────────────────────────── Repreguntas (sección 6.4) ─────────────────────────────

var TIPOS_CON_REPREGUNTA = ['abierta', 'opciones'];

function decidirRepregunta_(n, pregunta, fila) {
  if (TIPOS_CON_REPREGUNTA.indexOf(pregunta['tipo'] || 'abierta') < 0) return;
  if (pregunta['modalidad'] === 'contrarreloj') return;
  var raizId = String(pregunta['padre_id'] || pregunta['pregunta_id']);
  var todas = leer_('Preguntas').filter(function (p) { return Number(p['sesión_n']) === n; });
  var deEstaRespuesta = todas.filter(function (p) { return String(p['padre_id']) === raizId; }).length;
  var enSesion = todas.filter(function (p) { return p['origen'] === 'repregunta'; }).length;
  if (deEstaRespuesta >= MAX_REPREGUNTAS_RESPUESTA || enSesion >= MAX_REPREGUNTAS_SESION) return;
  if (!fila.palabras) return;

  var raiz = todas.filter(function (p) { return String(p['pregunta_id']) === raizId; })[0] || pregunta;
  var anteriores = leer_('Respuestas').filter(function (r) {
    return r['tipo'] !== 'likert' && Number(r['palabras']) > 0 && String(r['id']) !== String(fila.id);
  });
  var media = anteriores.length
    ? Math.round(anteriores.reduce(function (s, r) { return s + Number(r['palabras']); }, 0) / anteriores.length)
    : 0;
  var hilo = '';
  if (pregunta['padre_id']) {
    var previas = leer_('Respuestas').filter(function (r) {
      return String(r['pregunta_id']) === raizId || String(r['padre_id']) === raizId;
    });
    hilo = '<hilo_previo>\n' + previas.map(function (r) {
      return 'Pregunta: ' + r['texto_pregunta'] + '\nRespuesta: ' + (r['respuesta_editada'] || r['respuesta_original']);
    }).join('\n\n') + '\n</hilo_previo>';
  }
  var usuario = rellenar_(PROMPTS.repregunta.usuario, {
    sesion: n,
    tecnica: raiz['técnica'],
    enfoque: raiz['enfoque'],
    modalidad: fila.modalidad,
    repreguntas_previas: deEstaRespuesta,
    repreguntas_sesion: enSesion,
    palabras_media: media || 'sin datos',
    palabras: fila.palabras,
    contexto: pregunta['contexto'] || '',
    pregunta: pregunta['texto'],
    respuesta: fila.respuesta_editada || fila.respuesta_original,
    hilo_previo: hilo,
  });
  var resultado = llamarClaude_({
    modelo: MODELO_REPREGUNTA,
    sistema: PROMPTS.repregunta.sistema,
    usuario: usuario,
    esfuerzo: 'low',
    maxTokens: 2000,
    esquema: {
      type: 'object',
      properties: {
        repreguntar: { type: 'boolean' },
        repregunta: { type: 'string' },
        motivo: { type: 'string' },
      },
      required: ['repreguntar', 'repregunta', 'motivo'],
      additionalProperties: false,
    },
    reintentos: 0,
  });
  registrar_('repregunta', JSON.stringify({ pregunta: raizId, repreguntar: resultado.repreguntar, motivo: resultado.motivo }));
  var texto = String(resultado.repregunta || '').trim();
  if (!resultado.repreguntar || !texto) return;
  conBloqueo_(function () {
    var k = deEstaRespuesta + 1;
    agregar_('Preguntas', {
      pregunta_id: raizId + '-R' + k,
      'sesión_n': n,
      orden: Number(raiz['orden']) + k / 100,
      'técnica': raiz['técnica'],
      enfoque: raiz['enfoque'],
      modalidad: raiz['modalidad'] === 'voz' ? 'voz' : 'escrita',
      contexto: '',
      texto: texto,
      origen: 'repregunta',
      estado: 'activa',
      tipo: 'abierta',
      opciones: '',
      limite_seg: '',
      datos: '',
      padre_id: raizId,
      generar: '',
    });
  });
}

/** Sustituye los marcadores {{clave}} de una plantilla. */
function rellenar_(plantilla, valores) {
  return String(plantilla).replace(/\{\{(\w+)\}\}/g, function (m, clave) {
    return valores[clave] === undefined || valores[clave] === null ? '' : String(valores[clave]);
  });
}

function completarSesion_(datos) {
  var n = Number(datos.sesion);
  var resultado = conBloqueo_(function () {
    var sesion = leer_('Sesiones').filter(function (s) { return Number(s['sesión_n']) === n; })[0];
    if (!sesion) throw errorApp_('SESION_NO_ACTIVA', 'Sesión no encontrada.');
    if (sesion['estado'] === 'completada') return { yaCompletada: true };
    if (sesion['estado'] !== 'en curso') throw errorApp_('SESION_NO_ACTIVA', 'Esta sesión no está en curso.');
    var contestadas = idsRespondidos_(leer_('Respuestas'), n);
    var faltan = preguntasDeSesion_(n).filter(function (p) { return !contestadas[p['pregunta_id']]; });
    if (faltan.length) {
      throw errorApp_('SESION_INCOMPLETA', 'Aún quedan preguntas por responder.', { faltan: faltan.length });
    }
    actualizar_('Sesiones', sesion._fila, { estado: 'completada', fecha_fin: ahora_(), analizada: false });
    var completadas = leer_('Sesiones').filter(function (s) { return s['estado'] === 'completada'; }).length;
    actualizar_('Progreso', progreso_()._fila, { sesiones_completadas: completadas });
    registrar_('sesion_completada', 'Sesión ' + n);
    return { yaCompletada: false };
  });
  if (!resultado.yaCompletada) programarAnalisis_(1);
  var info = estado_();
  return {
    ok: true,
    sesion: n,
    completadas: info.completadas,
    total: TOTAL_SESIONES,
    proxima: info.completadas >= TOTAL_SESIONES ? 'fin' : info.iniciadas_hoy >= MAX_SESIONES_DIA ? 'manana' : 'hoy',
  };
}

/** Programa un análisis único dentro de unos minutos (sección 7). */
function programarAnalisis_(minutos) {
  try {
    ScriptApp.newTrigger('analizarPendientes').timeBased().after(minutos * 60000).create();
  } catch (err) {
    registrar_('disparador_error', String(err && err.message || err));
  }
}

// ───────────────────────────── Prueba a ciegas (fase 5) ─────────────────────────────

/** Pares para la persona del equipo (link aparte con BLIND_CODE). Nunca incluye cuál es la real. */
function pruebaCiega_(sesion) {
  var hechas = {};
  leer_('Prueba_ciega').forEach(function (f) { hechas[f['pregunta_id']] = true; });
  // Solo pares ya generados (los marcadores del banco, sin respuestas, no se muestran).
  var items = leer_('Preguntas').filter(function (p) {
    return p['tipo'] === 'ciego' && p['estado'] === 'activa' && !p['generar'];
  }).map(function (p) {
    var datos = jsonSeguro_(p['datos'], {});
    return {
      id: String(p['pregunta_id']),
      pregunta_original: String(datos.pregunta_original || ''),
      respuesta_a: String(datos.a || ''),
      respuesta_b: String(datos.b || ''),
      respondida: !!hechas[p['pregunta_id']],
    };
  });
  return { rol: sesion.rol, items: items, opciones: ['La A es de Gloria', 'La B es de Gloria', 'No lo sé'] };
}

function enviarPruebaCiega_(sesion, datos) {
  var id = String(datos.pregunta_id || '');
  var item = leer_('Preguntas').filter(function (p) {
    return String(p['pregunta_id']) === id && p['tipo'] === 'ciego';
  })[0];
  if (!item) throw errorApp_('PREGUNTA_INVALIDA', 'No encontramos ese par de respuestas.');
  var info = jsonSeguro_(item['datos'], {});
  var eleccion = String(datos.eleccion || '');
  var elegida = /A/.test(eleccion) && !/B/.test(eleccion) ? 'a' : /B/.test(eleccion) && !/A/.test(eleccion) ? 'b' : null;
  agregar_('Prueba_ciega', {
    fecha_hora: ahora_(),
    evaluador: String(datos.evaluador || sesion.rol).slice(0, 80),
    pregunta_id: id,
    eleccion: eleccion,
    acierto: elegida ? elegida === info.real : '',
    comentario: String(datos.comentario || '').slice(0, 5000),
  });
  return { ok: true };
}

// ───────────────────────────── API de Claude ─────────────────────────────

/**
 * Llama a la API de Claude (Messages) y devuelve el JSON que exige `esquema` (salidas estructuradas).
 * Lanza un error si la API falla, rechaza la petición o corta la respuesta; quien llama decide qué
 * hacer (la sesión de Gloria nunca se detiene por esto).
 */
function llamarClaude_(op) {
  var clave = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY en las propiedades del script.');
  var cuerpo = {
    model: op.modelo,
    max_tokens: op.maxTokens || 16000,
    system: op.sistema,
    messages: [{ role: 'user', content: op.usuario }],
    output_config: {
      effort: op.esfuerzo || 'medium',
      format: { type: 'json_schema', schema: op.esquema },
    },
    // Si un clasificador de seguridad rechaza la petición, la API la reintenta en el modelo recomendado.
    fallbacks: 'default',
  };
  var intentos = (op.reintentos === undefined ? 2 : op.reintentos) + 1;
  var ultimoError = null;
  for (var i = 0; i < intentos; i++) {
    if (i > 0) Utilities.sleep(2000 * i);
    var res = UrlFetchApp.fetch(API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': clave,
        'anthropic-version': API_VERSION,
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true,
    });
    var codigo = res.getResponseCode();
    var texto = res.getContentText();
    if (codigo === 200) return extraerJson_(JSON.parse(texto));
    ultimoError = new Error('API de Claude ' + codigo + ': ' + texto.slice(0, 500));
    // Solo se reintentan los errores pasajeros (límite de uso, sobrecarga, servidor).
    if (!(codigo === 429 || codigo >= 500)) break;
  }
  throw ultimoError;
}

function extraerJson_(mensaje) {
  if (mensaje.stop_reason === 'refusal') {
    var categoria = mensaje.stop_details && mensaje.stop_details.category;
    throw new Error('La API rechazó la petición' + (categoria ? ' (' + categoria + ')' : '') + '.');
  }
  if (mensaje.stop_reason === 'max_tokens') throw new Error('La respuesta de la API quedó cortada (max_tokens).');
  var texto = (mensaje.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('');
  return JSON.parse(texto);
}
