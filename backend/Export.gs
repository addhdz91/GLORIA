/**
 * Entregables finales (sección 8). Ejecuta generarEntregables() desde el editor al terminar las
 * 30 sesiones (también funciona antes, con lo que haya). Crea una carpeta en Google Drive con:
 *   1. perfil_gloria.md          Instrucciones de sistema de la Gloria virtual.
 *   2. ejemplos_gloria.jsonl     Pares pregunta → respuesta reales, etiquetados por situación.
 *   3. dataset_finetuning.jsonl  El mismo material en formato de conversación.
 *   4. SKILL.md                  Skill «/gloria» para usar la Gloria virtual dentro de Claude.
 *   5. guia_agente_clientes.md   Cómo conectarla a la web de Co-Evolution o a WhatsApp.
 */

var MENSAJE_TRANSPARENCIA = 'Hola, soy la asistente virtual de Gloria Paternina. Respondo como ella lo haría y, cuando haga falta, te pongo en contacto directo con ella.';
var MENSAJE_DERIVACION_DEFECTO = 'Esto prefiero que lo veas directamente con Gloria. Le paso tu mensaje para que te contacte personalmente; si quieres, déjame tu nombre, tu empresa y el mejor medio para escribirte.';

function generarEntregables() {
  var archivos = construirEntregables_();
  var carpeta = DriveApp.createFolder('Gloria Virtual · entregables ' + Utilities.formatDate(ahora_(), ZONA, 'yyyy-MM-dd HH.mm'));
  Object.keys(archivos).forEach(function (nombre) {
    carpeta.createFile(nombre, archivos[nombre], MimeType.PLAIN_TEXT);
  });
  registrar_('entregables', Object.keys(archivos).join(', '));
  Logger.log('Entregables listos: ' + carpeta.getUrl());
  return carpeta.getUrl();
}

/** Contenido de los cinco entregables (separado de Drive para poder probarlo). */
function construirEntregables_() {
  var perfil = perfilVigente_();
  if (!perfil) throw new Error('Todavía no hay perfil: hace falta al menos una sesión analizada.');
  var frases = jsonSeguro_(perfil['frases_características'], []);
  var ejemplos = ejemplosReales_(0);
  var limites = limitesDeGloria_();
  var derivacion = respuestaDe_('S28-P3') || MENSAJE_DERIVACION_DEFECTO;
  var ejemplosPrompt = ejemplosParaPrompt_(ejemplos, 12);

  var perfilFinal = rellenar_(PROMPTS.gloria_virtual, {
    limites: limites,
    mensaje_derivacion: '«' + derivacion + '»',
    perfil: perfil['perfil_markdown'],
    frases: frases.map(function (f) { return '- «' + f + '»'; }).join('\n') || '(sin frases registradas)',
    ejemplos: ejemplosPrompt,
  });

  var sistemaCorto = 'Eres la asistente virtual de Gloria Paternina Cárdenas (Co-Evolution). Responde como ella lo haría y preséntate siempre como su asistente virtual, nunca como la Gloria real.';

  return {
    'perfil_gloria.md': perfilFinal,
    'ejemplos_gloria.jsonl': ejemplos.map(function (e) {
      return JSON.stringify({
        situacion: e.situacion,
        respuesta: e.respuesta,
        sesion: e.sesion,
        tecnica: e.tecnica,
        enfoque: e.enfoque,
        modalidad: e.modalidad,
        etiquetas: e.etiquetas,
      });
    }).join('\n') + (ejemplos.length ? '\n' : ''),
    'dataset_finetuning.jsonl': ejemplos.map(function (e) {
      return JSON.stringify({
        messages: [
          { role: 'system', content: sistemaCorto },
          { role: 'user', content: e.situacion },
          { role: 'assistant', content: e.respuesta },
        ],
      });
    }).join('\n') + (ejemplos.length ? '\n' : ''),
    'SKILL.md': skillGloria_(perfil, frases, limites, derivacion, ejemplosPrompt),
    'guia_agente_clientes.md': guiaAgente_(derivacion),
  };
}

/** Texto de una respuesta concreta de Gloria (la versión editada si la hay). */
function respuestaDe_(preguntaId) {
  var r = leer_('Respuestas').filter(function (x) { return String(x['pregunta_id']) === preguntaId; })[0];
  return r ? String(r['respuesta_editada'] || r['respuesta_original'] || '').trim() : '';
}

function limitesDeGloria_() {
  var partes = [];
  var temas = respuestaDe_('S28-P1');
  var nunca = respuestaDe_('S28-P2');
  var crisis = respuestaDe_('S28-P4');
  if (temas) partes.push('### Qué respondes tú y qué pasa a Gloria (en sus palabras)\n\n' + temas);
  if (nunca) partes.push('### Lo que nunca debes prometer, decir o hacer (en sus palabras)\n\n' + nunca);
  if (crisis) partes.push('### Si alguien escribe en un momento de crisis personal (en sus palabras)\n\n' + crisis);
  if (!partes.length) {
    partes.push('Gloria aún no definió sus límites (sesión 28). Mientras tanto, deriva a la Gloria real todo lo que sea precio, contratación, agenda, quejas o temas personales delicados.');
  }
  return partes.join('\n\n');
}

function ejemplosParaPrompt_(ejemplos, maximo) {
  var porEnfoque = {};
  var seleccion = [];
  ejemplos.filter(function (e) { return e.tecnica === 'calibracion'; }).concat(ejemplos).forEach(function (e) {
    var clave = e.tecnica === 'calibracion' ? 'calibracion' : e.enfoque;
    porEnfoque[clave] = (porEnfoque[clave] || 0) + 1;
    if (seleccion.length < maximo && porEnfoque[clave] <= 3 && seleccion.indexOf(e) < 0) seleccion.push(e);
  });
  if (!seleccion.length) return '(sin ejemplos todavía)';
  return seleccion.map(function (e) {
    return '<ejemplo situacion="' + e.etiquetas.join(', ') + '">\nCliente o situación: ' + e.situacion +
      '\nGloria: ' + e.respuesta + '\n</ejemplo>';
  }).join('\n\n');
}

function skillGloria_(perfil, frases, limites, derivacion, ejemplosPrompt) {
  return [
    '---',
    'name: gloria',
    'description: Responde como Gloria Paternina Cárdenas, coach y consultora de Co-Evolution, para atender o preparar mensajes a clientes con su criterio profesional y su voz. Úsala cuando haya que redactar o revisar una respuesta a un cliente "como lo haría Gloria".',
    '---',
    '',
    '# /gloria · la Gloria virtual',
    '',
    'Perfil generado el ' + Utilities.formatDate(new Date(perfil['fecha']), ZONA, 'yyyy-MM-dd') + ' (versión ' + perfil['versión'] + ') a partir de 30 sesiones de entrevistas con Gloria.',
    '',
    '## Reglas',
    '',
    '- Preséntate siempre como la asistente virtual de Gloria: «' + MENSAJE_TRANSPARENCIA + '» Nunca te hagas pasar por la Gloria real.',
    '- Responde con su criterio, su registro (tú o usted según el interlocutor) y sus expresiones, sin caricaturizarlas.',
    '- No prometas resultados, garantías, precios ni fechas sin que Gloria los confirme.',
    '- Lo que sabes de persuasión y de cómo presenta el valor sirve para sonar como ella, nunca para presionar a un cliente.',
    '- Para derivar a la Gloria real usa: «' + derivacion + '»',
    '',
    '## Límites',
    '',
    limites,
    '',
    '## Perfil',
    '',
    perfil['perfil_markdown'],
    '',
    '## Frases características',
    '',
    frases.map(function (f) { return '- «' + f + '»'; }).join('\n') || '(sin frases registradas)',
    '',
    '## Ejemplos',
    '',
    ejemplosPrompt,
    '',
  ].join('\n');
}

function guiaAgente_(derivacion) {
  return [
    '# Guía para el agente de atención a clientes',
    '',
    'Cómo conectar la Gloria virtual a un chatbot en la web de Co-Evolution o en WhatsApp.',
    '',
    '## 1. Qué necesitas',
    '',
    '- `perfil_gloria.md`: son las instrucciones de sistema completas (perfil, límites, ejemplos y reglas de transparencia).',
    '- Una clave de la API de Claude (console.anthropic.com) con un límite de gasto mensual, distinta de la usada en las entrevistas.',
    '- Una plataforma de chat: un widget web o la API de WhatsApp Business (directamente o a través de un proveedor como Twilio, 360dialog o el que uses).',
    '',
    '## 2. Cómo funciona cada mensaje',
    '',
    '1. Llega un mensaje del cliente.',
    '2. Tu servidor llama a la API de Claude (`POST https://api.anthropic.com/v1/messages`) con el contenido de `perfil_gloria.md` en `system` y la conversación en `messages`. Modelo recomendado: `claude-opus-5-5` (o `claude-sonnet-5-5` si priorizas rapidez y coste).',
    '3. Responde al cliente con el texto devuelto.',
    '4. Guarda la conversación para que Gloria pueda revisarla.',
    '',
    'Mantén las instrucciones de sistema idénticas entre mensajes y activa el caché de prompts (`cache_control`) para que cada respuesta cueste menos.',
    '',
    '## 3. Transparencia (obligatorio)',
    '',
    'El primer mensaje de cada conversación debe ser este o uno equivalente:',
    '',
    '> ' + MENSAJE_TRANSPARENCIA,
    '',
    'Si el cliente pregunta si habla con Gloria, la asistente debe aclarar que es su asistente virtual. Muestra también un aviso de privacidad del chat conforme a la Ley 1581 de 2012.',
    '',
    '## 4. Derivación a la Gloria real',
    '',
    'Pasa la conversación a Gloria (por correo, WhatsApp o tu CRM) cuando:',
    '',
    '- el cliente pide hablar con ella, una cita, una propuesta formal, precios o condiciones de contratación;',
    '- hay una queja, un conflicto o un tema ético;',
    '- la persona está en una crisis personal o en riesgo (además, facilita las líneas de ayuda: en Colombia, la Línea 106 o el 123);',
    '- la asistente no sabe cómo actuaría Gloria;',
    '- cualquier caso de los «Límites» de `perfil_gloria.md`.',
    '',
    'Mensaje de derivación que Gloria eligió:',
    '',
    '> ' + derivacion,
    '',
    'Recomendación práctica: pide a la asistente que añada una etiqueta oculta (por ejemplo `[DERIVAR]`) al final de la respuesta cuando haya que derivar; tu servidor la quita antes de enviarla y crea el aviso para Gloria.',
    '',
    '## 5. Antes de abrirlo al público',
    '',
    '- Prueba 20–30 conversaciones típicas y difíciles y que Gloria las revise.',
    '- Revisa las conversaciones de la primera semana y ajusta `perfil_gloria.md` si algo no suena a ella.',
    '- Define cuánto tiempo guardas las conversaciones y quién puede verlas.',
    '',
  ].join('\n');
}
