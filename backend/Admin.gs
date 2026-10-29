/**
 * Funciones del administrador. Se ejecutan desde el editor de Apps Script (menú «Ejecutar»),
 * nunca desde el navegador de Gloria.
 *
 *   setup()                 Crea las pestañas, carga el banco de preguntas y el disparador nocturno.
 *   resetPrueba()           Borra los datos de la prueba y deja el programa como nuevo.
 *   exportarDatos()         Copia todos los datos a un archivo JSON en tu Google Drive.
 *   revocarAccesos()        Cierra todas las sesiones abiertas («Recordarme en este dispositivo»).
 *   borrarTodosLosDatos()   Borra todos los datos de Gloria (derecho de supresión, Ley 1581 de 2012).
 *   crearCodigoEvaluador()  Crea el código para la persona del equipo que hace la prueba a ciegas.
 *   verEstado()             Muestra en el registro el estado del programa.
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var faltan = ['ACCESS_CODE', 'ANTHROPIC_API_KEY', 'SHEET_ID'].filter(function (k) { return !props.getProperty(k); });
  if (faltan.length) throw new Error('Faltan propiedades del script: ' + faltan.join(', ') + '. Revisa el paso 3 del README.');

  var libro = libro_();
  Object.keys(HOJAS).forEach(function (nombre) {
    var hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    var columnas = HOJAS[nombre];
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    columnas.forEach(function (col, j) {
      if (COLUMNAS_TEXTO.indexOf(col) >= 0) hoja.getRange(2, j + 1, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  // La hoja nueva trae una pestaña vacía «Hoja 1» / «Sheet1»: se borra si no se usa.
  libro.getSheets().forEach(function (hoja) {
    if (!HOJAS[hoja.getName()] && hoja.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(hoja);
  });

  if (!leer_('Sesiones').length) cargarSesiones_();
  if (!leer_('Preguntas').length) cargarBanco_();
  if (!leer_('Progreso').length) {
    agregar_('Progreso', {
      fecha_inicio_programa: '', 'última_actividad': '', sesiones_completadas: 0, consentimiento_fecha: '',
      tutorial_visto: false,
    });
  }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'respaldoNocturno') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('respaldoNocturno').timeBased().atHour(23).everyDays().inTimezone(ZONA).create();

  registrar_('setup', 'Pestañas, banco (' + BANCO_PREGUNTAS.preguntas.length + ' preguntas) y disparador nocturno listos.');
  Logger.log('Listo. Ahora publica el script como aplicación web (paso 5 del README).');
}

function cargarSesiones_() {
  for (var n = 1; n <= TOTAL_SESIONES; n++) {
    agregar_('Sesiones', {
      'sesión_n': n, estado: 'pendiente', fecha_inicio: '', fecha_fin: '', preguntas_total: '',
      preguntas_respondidas: 0, analizada: false, 'intentos_análisis': 0,
    });
  }
}

/** Copia el banco a la pestaña Preguntas en una sola escritura. */
function cargarBanco_() {
  var columnas = HOJAS.Preguntas;
  var filas = BANCO_PREGUNTAS.preguntas.map(function (p) {
    var datos = {};
    if (p.bloque_ipip) datos.bloque_ipip = p.bloque_ipip;
    if (p.cantidad) datos.cantidad = p.cantidad;
    if (p.generar === 'calibracion') datos.situacion = p.contexto;
    var obj = {
      pregunta_id: p.id,
      'sesión_n': p.sesion,
      orden: p.orden,
      'técnica': p.tecnica,
      enfoque: p.enfoque,
      modalidad: p.modalidad,
      contexto: p.contexto || '',
      texto: p.texto,
      origen: 'banco',
      estado: 'activa',
      tipo: p.tipo || 'abierta',
      opciones: p.opciones ? JSON.stringify(p.opciones) : '',
      limite_seg: p.limite_seg || '',
      datos: Object.keys(datos).length ? JSON.stringify(datos) : '',
      padre_id: '',
      generar: p.generar || '',
    };
    return columnas.map(function (c) { return celda_(obj[c]); });
  });
  hoja_('Preguntas').getRange(2, 1, filas.length, columnas.length).setValues(filas);
}

/** Vacía las filas de datos de una pestaña (deja la cabecera). */
function vaciar_(nombre) {
  var hoja = hoja_(nombre);
  var ultima = hoja.getLastRow();
  if (ultima > 1) hoja.deleteRows(2, ultima - 1);
}

/** Borra los datos de la prueba y deja el programa como recién instalado. */
function resetPrueba() {
  ['Sesiones', 'Respuestas', 'Borradores', 'Preguntas', 'Perfil', 'Progreso', 'Prueba_ciega'].forEach(vaciar_);
  revocarAccesos();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('login_fallos');
  props.deleteProperty('login_bloqueado_hasta');
  cargarSesiones_();
  cargarBanco_();
  agregar_('Progreso', {
    fecha_inicio_programa: '', 'última_actividad': '', sesiones_completadas: 0, consentimiento_fecha: '',
    tutorial_visto: false,
  });
  registrar_('reset', 'Datos de prueba borrados; programa reiniciado.');
  Logger.log('Datos de prueba borrados. El programa está listo para Gloria.');
}

function revocarAccesos() {
  var props = PropertiesService.getScriptProperties();
  var n = 0;
  Object.keys(props.getProperties()).forEach(function (clave) {
    if (clave.indexOf('tok_') === 0) {
      props.deleteProperty(clave);
      n += 1;
    }
  });
  registrar_('accesos_revocados', n + ' sesiones cerradas');
  Logger.log(n + ' sesiones cerradas. Gloria tendrá que volver a escribir su código.');
  return n;
}

/** Todos los datos en un archivo JSON en «Mi unidad» (para consultar o entregar a Gloria). */
function exportarDatos() {
  var datos = { exportado: ahora_().toISOString() };
  Object.keys(HOJAS).forEach(function (nombre) {
    datos[nombre] = leer_(nombre).map(function (fila) {
      delete fila._fila;
      return fila;
    });
  });
  var nombre = 'gloria_virtual_datos_' + Utilities.formatDate(ahora_(), ZONA, 'yyyy-MM-dd_HHmm') + '.json';
  var archivo = DriveApp.createFile(nombre, JSON.stringify(datos, null, 2), MimeType.PLAIN_TEXT);
  registrar_('exportacion', nombre);
  Logger.log('Datos exportados: ' + archivo.getUrl());
  return archivo.getUrl();
}

/**
 * Borra todos los datos de Gloria (respuestas, borradores, perfil, progreso y registro) y cierra
 * sus sesiones. Para borrar también los archivos exportados, bórralos de Google Drive.
 */
function borrarTodosLosDatos() {
  resetPrueba();
  vaciar_('Log');
  registrar_('datos_borrados', 'Todos los datos de Gloria fueron borrados a petición suya.');
  Logger.log('Todos los datos fueron borrados.');
}

/** Código para la persona del equipo que hace la prueba a ciegas (fase 5). Se muestra en el registro. */
function crearCodigoEvaluador() {
  var codigo = 'equipo-' + Utilities.getUuid().slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('BLIND_CODE', codigo);
  registrar_('codigo_evaluador', 'Creado');
  Logger.log('Código para la prueba a ciegas: ' + codigo + '. Envíalo junto al link con «?modo=ciego» al final.');
  return codigo;
}

function verEstado() {
  var info = estado_();
  Logger.log(JSON.stringify({
    completadas: info.completadas,
    en_curso: info.en_curso,
    iniciadas_hoy: info.iniciadas_hoy,
    dias_sin_responder: info.dias_sin_responder,
    perfil_version: (perfilVigente_() || {})['versión'] || 0,
    sin_analizar: leer_('Sesiones').filter(function (s) {
      return s['estado'] === 'completada' && !esVerdadero_(s['analizada']);
    }).map(function (s) { return s['sesión_n']; }),
  }, null, 2));
  return info;
}
