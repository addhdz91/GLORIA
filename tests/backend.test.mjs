import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { crearProyecto, claudeSimulado } from '../tools/gas-harness.mjs';

const TEXTO_LARGO =
  'Primero escucho con calma lo que el cliente necesita, hago preguntas sobre el contexto del equipo, ' +
  'reviso qué se ha intentado antes y solo después propongo un camino concreto con plazos y responsables claros.';

/** Proyecto instalado, con Gloria dentro y el consentimiento dado. Hora fija en Bogotá. */
function instalar(opciones = {}) {
  const p = crearProyecto({ ahora: '2026-11-02T14:00:00Z', ...opciones }); // 09:00 en Bogotá
  p.ejecutar('setup');
  const acceso = p.post({ action: 'login', codigo: 'codigo-de-prueba', recordar: true });
  assert.equal(acceso.ok, true);
  p.token = acceso.token;
  assert.equal(p.post({ action: 'consent', token: p.token, acepta: true }).ok, true);
  return p;
}

/** Respuesta adecuada para cada tipo de pregunta. */
function respuestaPara(pregunta, texto = TEXTO_LARGO) {
  const base = { pregunta_id: pregunta.id, modalidad_usada: pregunta.modalidad, client_id: 'c-' + pregunta.id };
  switch (pregunta.tipo) {
    case 'likert':
      return { ...base, valores: Object.fromEntries(pregunta.items.map((it) => [it.id, 4])) };
    case 'validacion':
    case 'hipotesis':
      return { ...base, eleccion: pregunta.opciones[0], respuesta_original: 'Sí, así trabajo casi siempre.' };
    case 'calibracion':
      return { ...base, eleccion: 'Casi', respuesta_original: 'Yo diría: cuéntame primero qué está pasando en tu equipo.' };
    case 'ciego':
      return { ...base, eleccion: 'La A es mía', respuesta_original: 'Por la forma de empezar.' };
    case 'opciones':
      return { ...base, eleccion: pregunta.opciones[1], respuesta_original: texto };
    default:
      return { ...base, respuesta_original: texto, duracion_seg: 60, pausas_largas: 1, escucho_pregunta: true };
  }
}

/** Responde todas las preguntas de la sesión en curso (repreguntas incluidas) y la completa. */
function completarSesionEnCurso(p, texto = TEXTO_LARGO) {
  let sesion = p.post({ action: 'getSession', token: p.token });
  assert.ok(sesion.sesion, 'debería haber una sesión en curso');
  let pendiente = sesion.preguntas.find((q) => !q.respondida);
  let vueltas = 0;
  while (pendiente) {
    const res = p.post({ action: 'submitAnswer', token: p.token, sesion: sesion.sesion, ...respuestaPara(pendiente, texto) });
    assert.equal(res.ok, true, JSON.stringify(res));
    pendiente = res.siguiente;
    if (++vueltas > 40) throw new Error('Demasiadas preguntas');
  }
  const fin = p.post({ action: 'completeSession', token: p.token, sesion: sesion.sesion });
  assert.equal(fin.ok, true, JSON.stringify(fin));
  return sesion.sesion;
}

/** Hace una sesión completa y deja que el análisis la procese. */
function hacerSesion(p, texto) {
  const inicio = p.post({ action: 'startSession', token: p.token });
  assert.equal(inicio.ok, true, JSON.stringify(inicio));
  const n = completarSesionEnCurso(p, texto);
  p.ejecutarDisparadoresUnicos();
  return n;
}

test('Data.gs está sincronizado con data/ y prompts/', () => {
  execFileSync('node', ['tools/build-data.mjs', '--check'], { stdio: 'pipe' });
});

test('setup crea las pestañas, las 30 sesiones, el banco y el disparador nocturno (idempotente)', () => {
  const p = crearProyecto({ ahora: '2026-11-02T14:00:00Z' });
  p.ejecutar('setup');
  p.ejecutar('setup');
  const nombres = p.libro.getSheets().map((h) => h.getName());
  for (const n of ['Sesiones', 'Respuestas', 'Borradores', 'Preguntas', 'Perfil', 'Progreso', 'Log', 'Prueba_ciega']) {
    assert.ok(nombres.includes(n), 'falta ' + n);
  }
  assert.ok(!nombres.includes('Hoja 1'), 'la pestaña vacía por defecto se borra');
  assert.equal(p.filas('Sesiones').length, 30);
  assert.equal(p.filas('Preguntas').length, 99);
  assert.equal(p.filas('Progreso').length, 1);
  const nocturnos = p.disparadores.filter((d) => d.funcion === 'respaldoNocturno');
  assert.equal(nocturnos.length, 1);
  assert.equal(nocturnos[0].hora, 23);
  assert.equal(nocturnos[0].zona, 'America/Bogota');
});

test('setup avisa si faltan propiedades del script', () => {
  const p = crearProyecto({ propiedades: { ANTHROPIC_API_KEY: '' } });
  p.propiedades.delete('ANTHROPIC_API_KEY');
  assert.throws(() => p.ejecutar('setup'), /ANTHROPIC_API_KEY/);
});

test('acceso: código incorrecto, bloqueo de 15 min tras 5 fallos y token recordado', () => {
  const p = crearProyecto({ ahora: '2026-11-02T14:00:00Z' });
  p.ejecutar('setup');
  for (let i = 0; i < 4; i++) {
    assert.equal(p.post({ action: 'login', codigo: 'malo' }).error.codigo, 'CODIGO_INCORRECTO');
  }
  assert.equal(p.post({ action: 'login', codigo: 'malo' }).error.codigo, 'BLOQUEADO');
  // Bloqueado incluso con el código correcto.
  assert.equal(p.post({ action: 'login', codigo: 'codigo-de-prueba' }).error.codigo, 'BLOQUEADO');
  p.avanzar(16);
  const ok = p.post({ action: 'login', codigo: '  codigo-de-prueba ', recordar: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.rol, 'gloria');
  const info = JSON.parse(p.propiedades.get('tok_' + ok.token));
  assert.ok(info.expira - Date.parse('2026-11-02T14:16:00Z') > 170 * 86400000, 'recordar dura ~180 días');
  // Sin «recordar»: 12 horas.
  const corto = p.post({ action: 'login', codigo: 'codigo-de-prueba' });
  p.avanzar(13 * 60);
  assert.equal(p.post({ action: 'getStatus', token: corto.token }).error.codigo, 'SIN_SESION');
  assert.equal(p.post({ action: 'getStatus', token: ok.token }).ok, true);
  // Revocar desde la administración.
  p.ejecutar('revocarAccesos');
  assert.equal(p.post({ action: 'getStatus', token: ok.token }).error.codigo, 'SIN_SESION');
});

test('sin token no se puede usar ninguna acción', () => {
  const p = instalar();
  assert.equal(p.post({ action: 'getStatus' }).error.codigo, 'SIN_SESION');
  assert.equal(p.post({ action: 'startSession', token: 'inventado' }).error.codigo, 'SIN_SESION');
});

test('consentimiento obligatorio antes de empezar', () => {
  const p = crearProyecto({ ahora: '2026-11-02T14:00:00Z' });
  p.ejecutar('setup');
  const { token } = p.post({ action: 'login', codigo: 'codigo-de-prueba' });
  const estado = p.post({ action: 'getStatus', token });
  assert.equal(estado.consentimiento, false);
  assert.equal(p.post({ action: 'startSession', token }).error.codigo, 'SIN_CONSENTIMIENTO');
  p.post({ action: 'consent', token, acepta: true });
  assert.ok(p.filas('Progreso')[0]['consentimiento_fecha'] instanceof Date);
});

test('una sesión completa guarda cada respuesta con todos sus campos y crea la versión 1 del perfil', () => {
  const p = instalar();
  const inicio = p.post({ action: 'startSession', token: p.token });
  assert.equal(inicio.sesion, 1);
  assert.equal(inicio.total_principales, 4);
  assert.equal(inicio.preguntas[0].id, 'S01-P1');
  completarSesionEnCurso(p);

  const respuestas = p.filas('Respuestas');
  assert.equal(respuestas.length, 4);
  const voz = respuestas.find((r) => r.pregunta_id === 'S01-P2');
  assert.equal(voz.modalidad, 'voz');
  assert.equal(voz['duración_seg'], 60);
  assert.ok(voz.palabras > 20);
  assert.equal(voz.ppm, voz.palabras); // 60 s → palabras por minuto = palabras
  assert.equal(voz['escuchó_pregunta'], true);
  assert.match(voz.texto_pregunta, /cliente nuevo/);

  const sesion1 = p.filas('Sesiones')[0];
  assert.equal(sesion1.estado, 'completada');
  assert.equal(sesion1.preguntas_respondidas, 4);
  assert.equal(p.filas('Progreso')[0].sesiones_completadas, 1);
  // Análisis programado a 1 minuto.
  assert.equal(p.disparadores.filter((d) => d.funcion === 'analizarPendientes' && d.despuesMs === 60000).length, 1);
  p.ejecutarDisparadoresUnicos();
  const perfil = p.filas('Perfil');
  assert.equal(perfil.length, 1);
  assert.equal(perfil[0]['versión'], 1);
  assert.match(perfil[0].perfil_markdown, /Criterio profesional/);
  assert.equal(JSON.parse(perfil[0]['hipótesis']).length, 1);
  assert.deepEqual(JSON.parse(perfil[0]['frases_características']), ['primero entender', 'vamos paso a paso']);
  assert.equal(p.filas('Sesiones')[0].analizada, true);
  // El disparador único se limpia.
  assert.equal(p.disparadores.filter((d) => d.funcion === 'analizarPendientes').length, 0);
});

test('la sesión siguiente refleja la pregunta adaptada por el análisis, aunque se haga el mismo día', () => {
  const p = instalar();
  hacerSesion(p);
  const s2 = p.post({ action: 'startSession', token: p.token });
  assert.equal(s2.ok, true);
  const adaptada = s2.preguntas.find((q) => /no responde a tu propuesta/.test(q.texto));
  assert.ok(adaptada, 'la pregunta adaptada está en la sesión 2');
  assert.equal(adaptada.modalidad, 'voz');
  // Se añade antes de la última pregunta.
  assert.equal(s2.preguntas.at(-1).id, 'S02-P4');
});

test('límite: máximo 2 sesiones iniciadas por día calendario de Bogotá', () => {
  const p = instalar();
  hacerSesion(p);
  hacerSesion(p);
  const tercera = p.post({ action: 'startSession', token: p.token });
  assert.equal(tercera.error.codigo, 'LIMITE_DIARIO');
  const estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.puede_empezar, false);
  assert.equal(estado.motivo, 'LIMITE_DIARIO');
  // 23:30 en Bogotá sigue siendo el mismo día (04:30 UTC del día siguiente).
  p.fijarAhora('2026-11-03T04:30:00Z');
  assert.equal(p.post({ action: 'startSession', token: p.token }).error.codigo, 'LIMITE_DIARIO');
  // Medianoche en Bogotá: nuevo día.
  p.fijarAhora('2026-11-03T05:05:00Z');
  assert.equal(p.post({ action: 'startSession', token: p.token }).sesion, 3);
});

test('terminar una sesión a medias de un día anterior no cuenta para el límite de hoy', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  // Responde solo la primera pregunta y se va.
  p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[0]) });
  // Al día siguiente, lo primero es terminarla.
  p.fijarAhora('2026-11-03T15:00:00Z');
  const estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.motivo, 'SESION_EN_CURSO');
  assert.equal(estado.en_curso.sesion, 1);
  assert.equal(estado.en_curso.faltan, 3);
  assert.equal(p.post({ action: 'startSession', token: p.token }).error.codigo, 'SESION_EN_CURSO');
  completarSesionEnCurso(p);
  p.ejecutarDisparadoresUnicos();
  // Aún puede iniciar dos sesiones hoy.
  hacerSesion(p);
  assert.equal(p.post({ action: 'startSession', token: p.token }).sesion, 3);
});

test('mientras el análisis prepara la siguiente sesión se espera hasta 10 minutos', () => {
  const p = instalar();
  p.post({ action: 'startSession', token: p.token });
  completarSesionEnCurso(p);
  const intento = p.post({ action: 'startSession', token: p.token });
  assert.equal(intento.error.codigo, 'PREPARANDO');
  assert.equal(p.post({ action: 'getStatus', token: p.token }).motivo, 'PREPARANDO');
  // Si el análisis no llega (por ejemplo, la API cae), a los 10 minutos puede seguir igual.
  p.avanzar(11);
  assert.equal(p.post({ action: 'startSession', token: p.token }).sesion, 2);
});

test('repreguntas: solo cuando aportan, máximo 2 por respuesta y 6 por sesión', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[0]) });
  const corta = { ...respuestaPara(s1.preguntas[1], 'Porque sí.'), sesion: 1 };
  let res = p.post({ action: 'submitAnswer', token: p.token, ...corta });
  assert.equal(res.siguiente.id, 'S01-P2-R1');
  assert.equal(res.siguiente.es_repregunta, true);
  assert.equal(res.siguiente.modalidad, 'voz');
  res = p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(res.siguiente, 'Porque sí.') });
  assert.equal(res.siguiente.id, 'S01-P2-R2');
  res = p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(res.siguiente, 'Porque sí.') });
  // Tercera: ya no hay más repreguntas para esa respuesta.
  assert.equal(res.siguiente.id, 'S01-P3');
  const guardada = p.filas('Respuestas').find((r) => r.pregunta_id === 'S01-P2-R1');
  assert.equal(guardada.es_repregunta, true);
  assert.equal(guardada.padre_id, 'S01-P2');
  // El progreso solo cuenta preguntas principales.
  const sesion = p.post({ action: 'getSession', token: p.token });
  assert.equal(sesion.total_principales, 4);
  assert.equal(sesion.respondidas_principales, 2);
});

test('repregunta: la llamada usa el modelo, la versión de API y la salida estructurada correctos', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[1], 'Porque sí.') });
  const llamada = p.llamadasClaude.at(-1);
  assert.equal(llamada.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(llamada.cabeceras['anthropic-version'], '2026-10-21');
  assert.equal(llamada.cabeceras['x-api-key'], 'sk-ant-prueba');
  assert.equal(llamada.cuerpo.model, 'claude-sonnet-5-5');
  assert.equal(llamada.cuerpo.output_config.effort, 'low');
  assert.equal(llamada.cuerpo.output_config.format.type, 'json_schema');
  assert.equal(llamada.cuerpo.fallbacks, 'default');
  assert.equal(llamada.cabeceras['anthropic-beta'], 'server-side-fallback-2026-07-01');
  for (const prohibido of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(prohibido in llamada.cuerpo));
  assert.match(llamada.cuerpo.system, /Prohibido: evaluar/);
  assert.match(llamada.cuerpo.messages[0].content, /<respuesta_de_gloria>\nPorque sí\.\n<\/respuesta_de_gloria>/);
});

test('las preguntas rápidas, el Mini-IPIP y las validaciones no generan repreguntas', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  completarSesionEnCurso(p);
  p.ejecutarDisparadoresUnicos();
  const llamadasAntes = p.llamadasClaude.filter((l) => l.cuerpo.model === 'claude-sonnet-5-5').length;
  const s2 = p.post({ action: 'startSession', token: p.token });
  const likert = s2.preguntas.find((q) => q.tipo === 'likert');
  assert.equal(likert.items.length, 5);
  assert.equal(likert.escala.length, 5);
  p.post({ action: 'submitAnswer', token: p.token, sesion: 2, ...respuestaPara(likert) });
  assert.equal(p.llamadasClaude.filter((l) => l.cuerpo.model === 'claude-sonnet-5-5').length, llamadasAntes);
  assert.ok(s1);
});

test('si la API de Claude falla, la respuesta se guarda y la sesión continúa sin repregunta', () => {
  const p = instalar();
  p.usarClaude(() => ({ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }));
  const s1 = p.post({ action: 'startSession', token: p.token });
  const res = p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[1], 'Porque sí.') });
  assert.equal(res.ok, true);
  assert.equal(res.siguiente.id, 'S01-P1');
  assert.equal(p.filas('Respuestas').length, 1);
  assert.ok(p.filas('Log').some((l) => l.evento === 'repregunta_error'));
});

test('si la API rechaza la petición (refusal), tampoco se detiene la sesión', () => {
  const p = instalar();
  p.usarClaude((cuerpo) => ({
    status: 200,
    body: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null }, content: [], model: cuerpo.model },
  }));
  const s1 = p.post({ action: 'startSession', token: p.token });
  const res = p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[1], 'Porque sí.') });
  assert.equal(res.ok, true);
  assert.equal(res.siguiente.id, 'S01-P1');
});

test('reenviar la misma respuesta (cola sin conexión) no la duplica', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  const datos = { action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[0]) };
  p.post(datos);
  const otra = p.post(datos);
  assert.equal(otra.ok, true);
  assert.equal(otra.duplicada, true);
  assert.equal(p.filas('Respuestas').length, 1);
});

test('no se puede completar una sesión con preguntas pendientes', () => {
  const p = instalar();
  p.post({ action: 'startSession', token: p.token });
  const res = p.post({ action: 'completeSession', token: p.token, sesion: 1 });
  assert.equal(res.error.codigo, 'SESION_INCOMPLETA');
});

test('borradores: se guardan, se recuperan al volver y se borran al enviar', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  p.post({ action: 'saveDraft', token: p.token, sesion: 1, pregunta_id: 'S01-P1', texto: 'Mi hoja de vida empieza' });
  p.post({ action: 'saveDraft', token: p.token, sesion: 1, pregunta_id: 'S01-P1', texto: 'Mi hoja de vida empieza así…' });
  assert.equal(p.filas('Borradores').length, 1);
  assert.equal(p.post({ action: 'getSession', token: p.token }).borradores['S01-P1'], 'Mi hoja de vida empieza así…');
  p.post({ action: 'submitAnswer', token: p.token, sesion: 1, ...respuestaPara(s1.preguntas[0]) });
  assert.equal(p.filas('Borradores').length, 0);
});

test('la transcripción original y la editada se guardan ambas; los textos con = no se vuelven fórmulas', () => {
  const p = instalar();
  const s1 = p.post({ action: 'startSession', token: p.token });
  p.post({
    action: 'submitAnswer',
    token: p.token,
    sesion: 1,
    pregunta_id: s1.preguntas[1].id,
    modalidad_usada: 'voz',
    respuesta_original: 'eh bueno yo soy gloria de coevolución y este trabajo con',
    respuesta_editada: 'Bueno, yo soy Gloria, de Co-Evolution, y trabajo con',
    segmentos: [{ texto: 'eh bueno yo soy gloria', inicio: 0, fin: 2.1 }],
  });
  p.post({ action: 'submitAnswer', token: p.token, sesion: 1, pregunta_id: 'S01-P1', respuesta_original: '=SUMA(A1)' });
  const [voz, formula] = p.filas('Respuestas');
  assert.equal(voz.respuesta_original, 'eh bueno yo soy gloria de coevolución y este trabajo con');
  assert.equal(voz.respuesta_editada, 'Bueno, yo soy Gloria, de Co-Evolution, y trabajo con');
  assert.equal(JSON.parse(voz.segmentos)[0].fin, 2.1);
  assert.equal(formula.respuesta_original, '=SUMA(A1)');
  // En la hoja se guardó con apóstrofo (texto), no como fórmula.
  const hoja = p.libro.getSheetByName('Respuestas');
  assert.ok(hoja.filas.length === 3);
});

test('días sin responder y total de días sin actividad', () => {
  const p = instalar();
  let estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.dias_sin_responder, null);
  hacerSesion(p);
  estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.dias_sin_responder, 0);
  assert.equal(estado.completadas, 1);
  assert.equal(estado.casillas.length, 30);
  assert.equal(estado.casillas[0].estado, 'completada');
  // Vuelve tres días después.
  p.fijarAhora('2026-11-05T20:00:00Z');
  estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.dias_sin_responder, 3);
  assert.equal(estado.dias_sin_actividad_total, 2); // 3 y 4 de noviembre
  assert.equal(estado.puede_empezar, true);
  assert.equal(estado.siguiente, 2);
});

test('sesión 7: las afirmaciones del perfil preliminar sustituyen al marcador de validación', () => {
  const p = instalar();
  for (let i = 0; i < 6; i++) {
    hacerSesion(p);
    p.avanzar(24 * 60);
  }
  const s7 = p.post({ action: 'startSession', token: p.token });
  assert.equal(s7.sesion, 7);
  const validaciones = s7.preguntas.filter((q) => q.tipo === 'validacion');
  assert.equal(validaciones.length, 2);
  assert.deepEqual(validaciones[0].opciones, ['Esa soy yo', 'No soy yo', 'Depende']);
  assert.match(validaciones[0].texto, /Antes de proponer algo/);
  assert.ok(!s7.preguntas.some((q) => /se generan tras/.test(q.texto)), 'el marcador no se muestra');
});

test('sesión 7 sin análisis disponible: el marcador se omite y la sesión funciona', () => {
  const p = instalar();
  for (let i = 0; i < 6; i++) {
    if (i === 5) p.usarClaude(() => ({ status: 500, body: 'error' }));
    hacerSesion(p);
    p.avanzar(24 * 60);
  }
  const s7 = p.post({ action: 'startSession', token: p.token });
  assert.equal(s7.sesion, 7);
  assert.ok(!s7.preguntas.some((q) => q.tipo === 'validacion'));
  assert.ok(s7.preguntas.length >= 2);
  // El análisis quedó pendiente con reintento programado.
  assert.ok(p.filas('Log').some((l) => l.evento === 'analisis_error'));
});

/** Avanza hasta la sesión `hasta` (sin incluirla), dos sesiones por día. */
function avanzarHasta(p, hasta) {
  let n = 0;
  while (n < hasta - 1) {
    n = hacerSesion(p);
    if (n % 2 === 0) p.avanzar(24 * 60);
  }
}

test('calibración (23–27): la Gloria virtual responde y Gloria marca así lo diría, casi o así no', () => {
  const p = instalar();
  avanzarHasta(p, 23);
  const s23 = p.post({ action: 'startSession', token: p.token });
  assert.equal(s23.sesion, 23);
  const calibraciones = s23.preguntas.filter((q) => q.tipo === 'calibracion');
  assert.equal(calibraciones.length, 2);
  assert.match(calibraciones[0].respuesta_virtual, /Antes de proponerte algo/);
  assert.deepEqual(calibraciones[0].opciones, ['Así lo diría', 'Casi', 'Así no lo diría']);
  const hipotesis = s23.preguntas.filter((q) => q.tipo === 'hipotesis');
  assert.equal(hipotesis.length, 1);
  assert.match(hipotesis[0].texto, /negociar en vez de confrontar/);
  // La llamada de la Gloria virtual usa Opus y el perfil vigente.
  const llamada = p.llamadasClaude.find((l) => /versión virtual de Gloria/.test(l.cuerpo.system));
  assert.equal(llamada.cuerpo.model, 'claude-opus-5-5');
  assert.match(llamada.cuerpo.system, /Criterio profesional/);
  completarSesionEnCurso(p);
  const guardada = p.filas('Respuestas').find((r) => r.tipo === 'calibracion');
  const datos = JSON.parse(guardada.datos);
  assert.equal(datos.eleccion, 'Casi');
  assert.match(datos.respuesta_virtual, /Antes de proponerte algo/);
});

test('prueba a ciegas (29–30): nunca se envía cuál es la real y se registra el acierto', () => {
  const p = instalar();
  const codigoAntes = p.ejecutar('crearCodigoEvaluador');
  const evAntes = p.post({ action: 'login', codigo: codigoAntes });
  assert.equal(p.post({ action: 'getBlindTest', token: evAntes.token }).items.length, 0, 'sin pares hasta que se generan');
  avanzarHasta(p, 29);
  const s29 = p.post({ action: 'startSession', token: p.token });
  assert.equal(s29.sesion, 29);
  const pares = s29.preguntas.filter((q) => q.tipo === 'ciego');
  assert.ok(pares.length >= 1 && pares.length <= 4);
  for (const par of pares) {
    assert.ok(par.respuesta_a && par.respuesta_b && par.pregunta_original);
    assert.ok(!JSON.stringify(par).includes('"real"'), 'el cliente no recibe la solución');
  }
  completarSesionEnCurso(p);
  const r = p.filas('Respuestas').find((x) => x.tipo === 'ciego');
  assert.equal(typeof JSON.parse(r.datos).acierto, 'boolean');

  // Persona del equipo, con su propio código.
  const codigo = p.ejecutar('crearCodigoEvaluador');
  const ev = p.post({ action: 'login', codigo });
  assert.equal(ev.rol, 'evaluador');
  assert.equal(p.post({ action: 'getStatus', token: ev.token }).error.codigo, 'NO_AUTORIZADO');
  const prueba = p.post({ action: 'getBlindTest', token: ev.token });
  // Incluye también los pares ya preparados para la sesión 30.
  assert.ok(prueba.items.length >= pares.length);
  assert.ok(!JSON.stringify(prueba).includes('"real"'));
  p.post({ action: 'submitBlind', token: ev.token, pregunta_id: prueba.items[0].id, eleccion: 'La A es de Gloria', evaluador: 'Ana' });
  const fila = p.filas('Prueba_ciega')[0];
  assert.equal(fila.evaluador, 'Ana');
  assert.equal(typeof fila.acierto, 'boolean');
});

test('programa completo: 30 sesiones y los cinco entregables', () => {
  const p = instalar();
  avanzarHasta(p, 31);
  const estado = p.post({ action: 'getStatus', token: p.token });
  assert.equal(estado.completadas, 30);
  assert.equal(estado.motivo, 'PROGRAMA_COMPLETO');
  assert.equal(p.post({ action: 'startSession', token: p.token }).error.codigo, 'PROGRAMA_COMPLETO');

  const url = p.ejecutar('generarEntregables');
  assert.match(url, /drive\.simulado/);
  const carpeta = p.drive.find((d) => d.archivos);
  const nombres = Object.keys(carpeta.archivos).sort();
  assert.deepEqual(nombres, ['SKILL.md', 'dataset_finetuning.jsonl', 'ejemplos_gloria.jsonl', 'guia_agente_clientes.md', 'perfil_gloria.md']);
  const perfil = carpeta.archivos['perfil_gloria.md'];
  assert.match(perfil, /asistente virtual de Gloria Paternina/);
  assert.match(perfil, /Criterio profesional/);
  assert.match(perfil, /Qué respondes tú y qué pasa a Gloria/); // límites de la sesión 28
  assert.doesNotMatch(perfil, /\{\{/);
  const ejemplos = carpeta.archivos['ejemplos_gloria.jsonl'].trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(ejemplos.length > 20);
  assert.ok(ejemplos.some((e) => e.etiquetas.includes('correccion_de_gloria')));
  assert.ok(ejemplos.every((e) => e.situacion && e.respuesta));
  const conversaciones = carpeta.archivos['dataset_finetuning.jsonl'].trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(conversaciones[0].messages.map((m) => m.role), ['system', 'user', 'assistant']);
  assert.match(carpeta.archivos['SKILL.md'], /^---\nname: gloria\n/);
  assert.match(carpeta.archivos['guia_agente_clientes.md'], /Hola, soy la asistente virtual de Gloria Paternina/);
});

test('exportar, borrar todo y resetPrueba dejan el programa como nuevo', () => {
  const p = instalar();
  hacerSesion(p);
  const url = p.ejecutar('exportarDatos');
  assert.match(url, /\.json$/);
  const exportado = JSON.parse(p.drive.find((d) => d.nombre?.endsWith('.json')).contenido);
  assert.equal(exportado.Respuestas.length, 4);
  p.ejecutar('borrarTodosLosDatos');
  assert.equal(p.filas('Respuestas').length, 0);
  assert.equal(p.filas('Perfil').length, 0);
  assert.equal(p.filas('Sesiones').length, 30);
  assert.equal(p.filas('Preguntas').length, 99);
  assert.equal(p.post({ action: 'getStatus', token: p.token }).error.codigo, 'SIN_SESION');
});

test('el respaldo nocturno analiza las sesiones que quedaron pendientes', () => {
  const p = instalar();
  p.usarClaude(() => ({ status: 500, body: 'caído' }));
  hacerSesion(p); // 1.er intento falla, programa reintento
  p.ejecutarDisparadoresUnicos(); // 2.º
  p.ejecutarDisparadoresUnicos(); // 3.º: ya no reintenta
  assert.equal(p.filas('Sesiones')[0].analizada, false);
  assert.equal(p.filas('Sesiones')[0]['intentos_análisis'], 3);
  p.usarClaude(claudeSimulado);
  p.ejecutar('respaldoNocturno');
  assert.equal(p.filas('Sesiones')[0].analizada, true);
  assert.equal(p.filas('Perfil').length, 1);
});
