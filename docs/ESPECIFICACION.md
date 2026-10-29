# Proyecto: Gloria Virtual

Especificación completa para construir una plataforma de 30 sesiones que capture la forma de escribir, hablar, razonar, sentir y actuar de Gloria Paternina Cárdenas, con el fin de crear un asistente virtual que responda a clientes de Co-Evolution como lo haría ella.

> **Para Claude (quien implemente este proyecto):** este documento es la fuente de verdad. Construye todo lo descrito aquí: frontend, backend, banco de preguntas, prompts y guía de instalación. Si algo no está definido, toma la opción más simple y clara para Gloria y documéntala en el README.

---

## 1. Contexto

- **Persona a capturar:** Gloria Paternina Cárdenas, coach y consultora de **Co-Evolution** (https://www.co-evolution.com.co), firma colombiana de consultoría organizacional, coaching organizacional y ejecutivo, liderazgo consciente, gerencia de proyectos con enfoque PMI y diagnóstico de madurez en sostenibilidad.
- **LinkedIn:** https://www.linkedin.com/in/gloriapaterninac%C3%A0rdenas/ (no se puede leer automáticamente; en la sesión 1 se le pide que pegue su CV o el texto de su perfil).
- **Objetivo final:** una "Gloria virtual" que atienda a distintos clientes y reaccione y responda prácticamente como ella: mismo criterio profesional, misma voz, mismo manejo de situaciones difíciles.
- **Quién usa la plataforma:** solo Gloria. No tiene cuenta de Claude ni conocimientos técnicos.
- **Quién administra:** el dueño del proyecto, con cuenta de Google y una clave de la API de Claude.
- **Zona horaria de referencia:** `America/Bogota` para todo lo que dependa de "un día".

## 2. Principios de diseño (obligatorios)

1. **Extraer, no corregir.** La IA nunca corrige, mejora, evalúa ni da feedback a Gloria sobre sus respuestas. Solo busca entender cómo piensa y hacer que lo exprese más a fondo. Tono curioso, neutro y cálido.
2. **No es una carrera.** El objetivo es la profundidad, no la velocidad. Máximo **2 sesiones por día calendario**.
3. **Lo más simple posible para Gloria.** Un link, un código de acceso y responder. Nada de cuentas ni instalaciones.
4. **Nunca perder nada.** Todo se guarda automáticamente y se retoma exactamente donde quedó.
5. **Conservar todo en bruto.** Las transcripciones de voz se guardan tal cual, con muletillas, repeticiones y autocorrecciones. El análisis se hace aparte.
6. **Adaptativo.** El programa evoluciona sesión a sesión según lo que ya se sabe de ella y lo que falta.
7. **Interpretaciones con humildad.** Ningún rasgo se concluye a partir de una sola respuesta. Las hipótesis se marcan como hipótesis hasta que varias respuestas las confirman, y se validan con Gloria en la fase de calibración.
8. **Privacidad.** Se aplica la Ley 1581 de 2012 de Colombia (protección de datos personales).

## 3. Experiencia de Gloria

### 3.1 Flujo de pantallas
1. **Acceso:** campo para el código. Se valida en el servidor. Opción "Recordarme en este dispositivo" (token de sesión de larga duración, revocable desde la administración).
2. **Bienvenida y consentimiento (solo la primera vez):** propósito, qué datos se guardan, quién los ve, que la voz se transcribe con el servicio del navegador (Google en Chrome, Apple en Safari) y su derecho a consultar y borrar. Acepta con una casilla; se guarda la fecha.
3. **Mini tutorial (solo la primera vez, 3 pantallas, se puede saltar):** cómo responder escribiendo, cómo responder hablando y cómo escuchar una pregunta. Incluye una prueba del micrófono.
4. **Panel de inicio:** ver 3.2.
5. **Pregunta:** una sola pregunta por pantalla (ver 3.4).
6. **Repregunta:** de 0 a 2 por respuesta, con el mismo diseño (ver sección 6).
7. **Cierre de sesión:** agradecimiento breve, "Sesión X de 30 completada" y cuándo puede hacer la siguiente. Sin resúmenes ni valoraciones de lo que respondió.

### 3.2 Panel de inicio y progreso
Lo primero que ve Gloria al entrar:
- **Sesiones completadas:** "12 de 30", con barra o anillo de progreso y una cuadrícula de 30 casillas (completada / en curso / pendiente).
- **Días sin responder:** cuántos días calendario lleva sin responder ninguna pregunta desde su última actividad (por ejemplo "Tu última respuesta fue hace 3 días"). Si respondió hoy, no se muestra.
- **Total de días sin actividad** desde que empezó (dato secundario, más discreto).
- **Botón principal**, que cambia según el estado:
  - Si hay una sesión a medias → **"Continuar sesión 12 (te faltan 3 preguntas)"**. Es obligatorio terminarla antes de empezar otra.
  - Si no hay sesión a medias y aún le quedan sesiones hoy → **"Empezar sesión 13"**.
  - Si ya completó 2 sesiones hoy → mensaje amable: "Por hoy es suficiente. Tu próxima sesión estará disponible mañana." con el botón desactivado.
- Tono de los mensajes de ausencia: cálido y sin culpa. Nunca "vas atrasada" ni rachas perdidas. Ejemplo: "Qué bueno verte de nuevo. Retomemos donde lo dejaste."

### 3.3 Reglas de sesiones y avance
- El programa tiene **30 sesiones**, no 30 días fijos. Gloria avanza a su ritmo.
- **Límite:** máximo 2 sesiones **iniciadas** por día calendario (`America/Bogota`). Terminar una sesión que quedó a medias de un día anterior **no** cuenta para el límite del día actual.
- **Sesión a medias:** si sale en mitad de una sesión, al volver lo primero es terminarla. Se le muestra en qué pregunta va.
- **Guardado automático:**
  - Cada respuesta enviada se guarda en el servidor al instante.
  - Lo que esté escribiendo o dictando se guarda como **borrador** en el dispositivo cada pocos segundos (en `localStorage`, con `try/catch`) y en el servidor al salir de la pantalla. Si cierra el navegador a media frase, el borrador reaparece.
  - Si falla la conexión, la respuesta queda en cola en el dispositivo y se reenvía al recuperar conexión, con un aviso discreto ("Guardado en este dispositivo, se enviará al recuperar conexión").
- El límite diario y el estado de las sesiones se controlan **en el servidor**, no solo en el navegador.

### 3.4 Pantalla de pregunta
- Encabezado discreto: "Sesión 12 · Pregunta 3 de 5" y una barra fina de progreso.
- **Texto de la pregunta grande y legible** (ver 3.6), con el contexto del caso separado visualmente de la pregunta.
- **Botón "Escuchar pregunta"** en todas las preguntas: lee la pregunta en voz alta con `speechSynthesis`, priorizando una voz en español (`es-CO`, luego `es-419`, luego `es-ES`). Control de velocidad (lenta / normal). Botón de pausa.
- Indicador de modalidad:
  - ✍️ **Escrita:** caja de texto amplia que crece con el contenido, contador de palabras discreto.
  - 🎙️ **Voz:** botón grande de micrófono, estado claro ("Escuchando…", "En pausa"), indicador de que se está captando sonido, cronómetro y transcripción en vivo con letra grande. Botones "Pausar" y "Terminé". Enlace discreto "Prefiero escribirla".
  - ⏱️ **Contrarreloj:** temporizador visible y tranquilo (sin colores de alarma ni sonidos estridentes). Al terminar el tiempo se guarda lo que haya.
- Un único botón principal visible por paso ("Enviar respuesta"). Confirmación antes de enviar una respuesta vacía o muy corta.
- Botón "Salir y continuar después" siempre accesible: guarda y vuelve al panel.

### 3.5 Diseño visual
- **Colores que no fatiguen la vista:**
  - Fondo cálido y claro, no blanco puro (por ejemplo tono marfil o arena suave).
  - Texto gris muy oscuro, no negro puro.
  - Un solo color de acento sobrio y poco saturado, tomando como referencia el verde azulado de Co-Evolution (`#0b5e5a`), usado solo para acciones principales y progreso.
  - Sin rojos intensos ni colores fluorescentes. Los errores en un tono terracota suave.
  - **Modo oscuro automático** (según el sistema) con fondo gris carbón, no negro puro, y texto gris claro, no blanco puro. Interruptor manual claro/oscuro.
  - Contraste mínimo **WCAG AA** (4,5:1 en texto normal), comprobado en ambos modos.
  - Colores definidos como variables CSS en `:root`.
- **Tipografía:**
  - Fuente de alta legibilidad, por ejemplo **Atkinson Hyperlegible** o **Source Sans 3** (Google Fonts), con alternativa del sistema.
  - Tamaño base mínimo de 18 px en el texto de respuesta y 20–22 px en la pregunta.
  - Interlineado 1,6, líneas de máximo unos 65 caracteres.
  - Control **A− / A+** para ajustar el tamaño del texto, que se recuerda en el dispositivo.
- **Diseño general:** mucho espacio en blanco, una sola columna centrada, sin distracciones, animaciones suaves y respetando `prefers-reduced-motion`.

### 3.6 Responsive y accesibilidad
- Diseño **móvil primero**; probado en celular (360 px de ancho), tableta y escritorio. Sin desplazamiento horizontal.
- Áreas táctiles de al menos 48 × 48 px.
- En móvil, el botón principal queda fijo abajo y no lo tapa el teclado.
- Navegación con teclado, foco visible, etiquetas `aria` en botones de micrófono y audio, y textos alternativos.
- Mensajes de error comprensibles y con solución ("No pudimos acceder al micrófono. Revisa el permiso o responde escribiendo.").

## 4. Arquitectura

```
[Gloria: navegador] --link--> [Frontend estático: GitHub Pages]
        |  fetch (text/plain, sin preflight CORS)
        v
[Backend: Google Apps Script Web App]
        |-- Google Sheets (almacenamiento)
        |-- API de Claude (repreguntas en vivo + análisis tras cada sesión)
        |-- Disparadores de tiempo (análisis y respaldo nocturno)
```

### Frontend
- Un solo `index.html` con CSS y JS (sin frameworks ni build), alojado en **GitHub Pages**.
- **Voz a texto:** Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), `lang = "es-CO"`, `continuous = true`, `interimResults = true`. Funciona en Chrome (escritorio y Android) y Safari (iOS/macOS).
  - Reiniciar automáticamente el reconocimiento si el navegador lo corta por silencio mientras Gloria no haya pulsado "Terminé".
  - Guardar marcas de tiempo de cada resultado para estimar duración, pausas largas, palabras por minuto y momentos de duda.
  - Si el navegador no soporta voz, mostrar caja de texto con la indicación "escríbelo como lo dirías hablando".
  - Si Gloria edita una transcripción para corregir un error del reconocimiento, guardar **ambas** versiones.
- **Texto a voz:** `speechSynthesis` para el botón "Escuchar pregunta".
- La URL del backend va en una constante de configuración. **Ningún secreto en el frontend.**

### Backend (Google Apps Script)
- Publicado como aplicación web ("Ejecutar como: yo", "Acceso: cualquier persona").
- Endpoints (vía `doPost` con campo `action`):
  - `login` → valida el código contra `ACCESS_CODE` y devuelve un token de sesión.
  - `getStatus` → sesiones completadas, sesión a medias, días sin responder, sesiones disponibles hoy.
  - `startSession` → inicia una sesión si se cumplen las reglas de 3.3; si no, devuelve el motivo.
  - `getSession` → preguntas de la sesión actual y en cuál va.
  - `saveDraft` → guarda un borrador.
  - `submitAnswer` → guarda la respuesta y decide si generar una repregunta (llamada a Claude).
  - `completeSession` → cierra la sesión y programa el análisis.
  - `consent` → registra la aceptación.
- Secretos en **Script Properties**: `ACCESS_CODE`, `ANTHROPIC_API_KEY`, `SHEET_ID`.
- Llamadas a Claude con `UrlFetchApp` a `https://api.anthropic.com/v1/messages`.
  - Repreguntas en vivo: `claude-sonnet-5-5`, respuestas cortas y rápidas.
  - Análisis de sesión: `claude-opus-5-5`.
- Usar `LockService` al escribir para evitar duplicados.
- Límite de intentos de acceso (bloqueo de 15 min tras 5 fallos).
- Si falla la API de Claude, la respuesta se guarda igual y la sesión continúa sin repregunta.

### Almacenamiento (Google Sheets)

| Pestaña | Columnas principales |
|---|---|
| `Sesiones` | sesión_n, estado (pendiente / en curso / completada), fecha_inicio, fecha_fin, preguntas_total, preguntas_respondidas, analizada |
| `Respuestas` | id, fecha_hora, sesión_n, pregunta_id, es_repregunta, padre_id, técnica, enfoque, modalidad, texto_pregunta, respuesta_original, respuesta_editada, duración_seg, palabras, ppm, pausas_largas, escuchó_pregunta, cambió_a_texto |
| `Borradores` | sesión_n, pregunta_id, texto, fecha_hora |
| `Preguntas` | pregunta_id, sesión_n, orden, técnica, enfoque, modalidad, contexto, texto, origen (banco / generada), estado |
| `Perfil` | versión, fecha, perfil_markdown, hipótesis, huecos_detectados, frases_características |
| `Progreso` | fecha_inicio_programa, última_actividad, sesiones_completadas, consentimiento_fecha |
| `Log` | fecha_hora, evento, detalle |

"Días sin responder" se calcula en el servidor a partir de `última_actividad` y de los días con al menos una respuesta.

## 5. Programa de 30 sesiones

Cada sesión dura entre 20 y 25 min y combina:
- **1 pregunta escrita.**
- **1–2 preguntas por voz.**
- **1 caso** de juicio situacional o caso con giro.
- **0–2 repreguntas** generadas en vivo por cada respuesta.
- En las sesiones 2–5, además, un **bloque corto de personalidad** (ver 6.3).

El análisis tras cada sesión puede **reemplazar o añadir una pregunta** de la sesión siguiente para cubrir huecos.

### Fase 1, sesiones 1–7: identidad, voz y contexto
| Sesión | Foco | Ejemplos |
|---|---|---|
| 1 | Consentimiento y trayectoria | Pegar CV/LinkedIn. 🎙️ "Preséntate como lo harías con un cliente nuevo." |
| 2 | Valores y propósito | 🎙️ "¿Por qué haces el trabajo que haces?" con escalera de porqués |
| 3 | Registro según el interlocutor | ✍️ El mismo mensaje para un CEO, un equipo operativo y un posible cliente |
| 4 | Momentos que la formaron | 🎙️ Un momento profesional que te cambió (STAR) |
| 5 | Cultura y forma de relacionarse | 🎙️ "¿Cómo es un buen trato profesional para ti? ¿Tú o usted? ¿Qué te parece una negociación muy directa?" |
| 6 | Agilidad | ⏱️ 5 preguntas rápidas de opinión, 60 s cada una |
| 7 | Validación | Leer afirmaciones del perfil preliminar y marcar "esa soy yo / no soy yo / depende", con comentario |

### Fase 2, sesiones 8–14: metodología y criterio profesional
| Sesión | Foco | Ejemplos |
|---|---|---|
| 8 | Diagnóstico | 🎙️ Pensar en voz alta: "Te llama una empresa con alta rotación. ¿Qué haces primero?" |
| 9 | Preguntas poderosas | ✍️ Las preguntas que más usa en coaching y cuándo usa cada una |
| 10 | Caso de éxito | 🎙️ Método de decisiones críticas sobre un caso real que salió bien |
| 11 | Caso que salió mal | 🎙️ Método de decisiones críticas sobre un caso real que no funcionó |
| 12 | Gerencia de proyectos | Caso: proyecto atrasado, sin alcance claro y con un patrocinador ausente |
| 13 | Sostenibilidad y madurez | ✍️ Cómo explica a una empresa que su madurez en sostenibilidad es baja |
| 14 | Hábitos de trabajo | 🎙️ Antecedente–conducta–consecuencia: "¿Qué haces siempre antes de una primera reunión con un cliente? ¿Qué pasa si no lo haces?" |

### Fase 3, sesiones 15–22: situaciones difíciles con clientes
| Sesión | Foco | Ejemplos |
|---|---|---|
| 15 | Objeción de precio | ✍️ "Es muy caro para nosotros." (cómo presenta el valor, cómo enmarca la propuesta) |
| 16 | Escepticismo | ✍️ "Ya contratamos coaching el año pasado y no sirvió de nada." |
| 17 | Caso con giro | Gerente que pide un taller sobre confianza → nuevo dato: el dueño no suelta el control |
| 18 | Conflicto de equipo | 🎙️ Dos líderes que no se hablan y sabotean el proyecto |
| 19 | Momento emocional | 🎙️ Un colaborador se quiebra en plena sesión. ¿Qué sientes tú y qué haces? |
| 20 | Dilema ético | ✍️ El jefe pide lo que dijo un coachee en confidencialidad |
| 21 | Autoridad y presión | 🎙️ Un directivo poderoso quiere que avales una decisión con la que no estás de acuerdo |
| 22 | Postura contraria | 🎙️ Argumenta lo opuesto a algo que defiendes |

### Fase 4, sesiones 23–28: calibración
- La Gloria virtual (perfil actual) responde a situaciones nuevas y Gloria marca: "así lo diría", "casi" o "así no lo diría". En los dos últimos casos escribe o dice cómo lo diría ella.
- Esto no es corregir a Gloria: es Gloria corrigiendo al clon. Es la fuente de datos más valiosa del programa.
- También se le presentan las **hipótesis** del perfil (por ejemplo "Ante la presión de autoridad, sueles negociar en vez de confrontar") para que las confirme, matice o descarte.
- Sesión 28: **límites y derivación** (qué responde la Gloria virtual, qué pasa a la Gloria real, qué nunca debe prometer).

### Fase 5, sesiones 29–30: prueba a ciegas y cierre
- Se mezclan respuestas reales y virtuales a las mismas preguntas. Gloria (y, si se desea, alguien de su equipo, con un link aparte) intenta distinguirlas.
- Cierre: agradecimiento y resumen del proceso (sin valoraciones de su forma de ser).

## 6. Técnicas de elicitación y enfoques de análisis del comportamiento

### 6.1 Técnicas para hacer aflorar el razonamiento
Cada pregunta indica su técnica en la columna `técnica`.

1. **Pensar en voz alta (think-aloud):** resolver un problema hablando sin filtrar.
2. **Método de decisiones críticas (Critical Decision Method, Gary Klein):** recordar una situación real y profundizar por capas: qué notó primero, qué opciones vio, qué descartó y por qué, qué habría hecho un novato, qué cambiaría.
3. **Incidente crítico / STAR:** situación, tarea, acción y resultado.
4. **Juicio situacional (SJT):** escenario con opciones; elige o escribe la suya y justifica.
5. **Escalera de porqués (laddering):** "¿por qué eso es importante para ti?" hasta llegar a valores.
6. **Caso con información incompleta o cambiante:** añadir un dato a mitad y ver cómo ajusta.
7. **Intuición vs. análisis:** preguntas contrarreloj combinadas con preguntas sin límite.
8. **Postura contraria (steelman):** defender la opinión opuesta a la suya.
9. **Antecedente–conducta–consecuencia (ABC):** qué la lleva a actuar de cierta forma y qué obtiene con ello.

### 6.2 Enfoques de análisis del comportamiento: cuáles se aplican
Revisión de los principales enfoques para entender el comportamiento humano y cómo se usan (o no) en este proyecto. Cada pregunta indica su enfoque en la columna `enfoque`.

| Enfoque | ¿Se aplica? | Para qué sirve aquí | Cómo se recoge |
|---|---|---|---|
| **Psicología conductual** (antecedente–conducta–consecuencia) | Sí | Hábitos de trabajo y rutinas con clientes: qué hace siempre, qué la dispara a actuar y qué consigue | Preguntas ABC sobre rutinas y reacciones (sesiones 14 y repreguntas) |
| **Psicología cognitiva** (atención, interpretación, creencias, sesgos, decisiones) | Sí, núcleo | Cómo interpreta situaciones, qué nota primero, cómo resuelve problemas y decide | Pensar en voz alta, decisiones críticas, casos con giro |
| **Análisis emocional** (qué siente, cómo regula y expresa) | Sí | Cómo reconoce y acompaña emociones de clientes, cómo regula las suyas, cómo expresa empatía con palabras | Preguntando directamente: "¿qué sentiste?", "¿cómo lo manejaste?" (sesión 19 y repreguntas). Nunca se infiere la emoción solo por el tono |
| **Psicología social** (autoridad, influencia, persuasión, grupos) | Sí | Cómo cambia frente a un CEO o un equipo operativo, cómo persuade, cómo maneja la presión de la autoridad y las dinámicas de grupo | Mensajes a distintos interlocutores, casos de presión y conflicto (sesiones 3, 18 y 21) |
| **Economía conductual** (encuadre, anclaje, aversión a la pérdida, prueba social) | Parcialmente | Cómo presenta el valor y el precio, cómo enmarca propuestas, cuánto riesgo asume. **Solo para describir cómo actúa ella**, no para que la Gloria virtual manipule a clientes | Objeciones comerciales y casos de decisión (sesión 15) |
| **Análisis del lenguaje** (léxico, argumentación, discurso, temas que evita) | Sí, núcleo | Voz, expresiones, forma de argumentar, cómo justifica, qué pregunta y qué evita | Todas las respuestas, análisis automático (ver 7) |
| **Comportamiento no verbal** | Solo la parte vocal | Ritmo, pausas, duración y momentos de duda en las respuestas habladas. Cambios de extensión según el tema | Métricas de la voz transcrita. **No se usa cámara ni análisis facial**: es invasivo, poco fiable y no aporta a un asistente escrito |
| **Personalidad** (Big Five) | Sí, como complemento | Una referencia general de rasgos para dar coherencia a la Gloria virtual | Cuestionario corto validado (ver 6.3) contrastado con lo observado en sus respuestas. Nunca como etiqueta |
| **Antropológico y cultural** | Sí | Contexto colombiano: trato tú/usted, relación con la autoridad, concepto de éxito, formas de negociar. Clave para el tono con clientes | Sesión 5 y preguntas de registro |
| **Neurociencia** (EEG, fMRI, medidas fisiológicas) | No | Requiere equipos de laboratorio y no aporta a un asistente conversacional | — |

**Advertencias para el análisis** (deben quedar en el prompt de análisis):
- Ningún dato aislado demuestra un rasgo, una emoción o una intención. Se buscan **patrones** en varias respuestas.
- Ante una respuesta ambigua, se registran **varias explicaciones posibles** y se exploran en sesiones siguientes, en lugar de elegir una.
- Las emociones se infieren preguntando, no solo por el tono o el lenguaje.
- Las hipótesis se validan con Gloria en la fase de calibración.

### 6.3 Bloque de personalidad
- Sesiones 2 a 5: 5 afirmaciones por sesión (20 en total) del **Mini-IPIP** (Donnellan y colaboradores, 2006; ítems del International Personality Item Pool, de dominio público), en una versión en español.
- Formato: escala de 1 a 5 con botones grandes ("Nada parecido a mí" … "Muy parecido a mí").
- El resultado **no se le muestra como etiqueta** a Gloria y solo se usa como complemento del perfil, contrastado con lo observado.

### 6.4 Reglas para las repreguntas en vivo
- Máximo 2 por respuesta y unas 6 por sesión.
- Solo si la respuesta deja algo valioso sin explorar: un "porque sí", una decisión sin justificar, una emoción mencionada de pasada, un caso sin detalle, un cambio brusco de extensión o tono.
- Una sola pregunta corta, en el tono de un buen entrevistador.
- Prohibido: evaluar ("buena respuesta"), corregir, sugerir alternativas, resumir lo que dijo, dar consejos o interpretar su personalidad en voz alta.
- Si la respuesta ya es completa, no repreguntar.

## 7. Dimensiones a capturar y análisis

Orden de prioridad:
1. **Criterio profesional:** cómo diagnostica, metodología, preguntas típicas, qué recomienda y qué nunca recomendaría.
2. **Manejo de situaciones difíciles:** clientes molestos, resistencia al cambio, objeciones, temas emocionales, dilemas éticos, presión de la autoridad, qué hace cuando no sabe algo.
3. **Voz y estilo con clientes:** saludo, cierre, formalidad, tú/usted, expresiones, metáforas, ritmo, si es directa o construye la idea, y cómo cambia según el interlocutor.
4. **Manejo emocional:** cómo nombra emociones, cómo acompaña, cómo regula las suyas.
5. **Experiencias y casos:** trayectoria, casos que usa como ejemplo (anonimizados), errores y aprendizajes.
6. **Vida personal curada:** valores, motivaciones y anécdotas que **ella** compartiría con un cliente. Ella decide qué entra.
7. **Límites y derivación:** qué responde la Gloria virtual y qué pasa a la Gloria real.

### Análisis tras cada sesión
Al completar una sesión, el backend programa un disparador único (a 1 minuto) que analiza esa sesión, para que la siguiente ya esté adaptada aunque Gloria haga 2 sesiones el mismo día. Un disparador nocturno hace de respaldo y procesa cualquier sesión completada sin analizar.

El análisis:
1. Lee las respuestas de la sesión y el perfil vigente.
2. Llama a Claude para actualizar el perfil, analizando:
   - **Razonamiento:** estructura de argumentos (Toulmin: afirmación, evidencia, garantía, matices, límites), qué nota primero, cómo decide.
   - **Lenguaje (estilometría):** longitud de frases, vocabulario frecuente, marcadores de certeza ("siempre", "depende", "creo que"), uso de preguntas, emoción, formalidad, temas que evita.
   - **Oralidad:** muletillas, autocorrecciones, cómo arranca, ritmo (ppm), pausas, si da la conclusión primero o la construye.
   - **Conducta:** rutinas y patrones antecedente–conducta–consecuencia.
   - **Emoción:** cómo nombra, acompaña y regula emociones.
   - **Social y cultural:** cambios según el interlocutor y la autoridad, forma de persuadir, trato y registro.
   - **Decisión:** personas vs. procesos, tolerancia al riesgo, intuitiva vs. metódica, cómo presenta valor y precio.
   - **Personalidad:** contraste entre el Mini-IPIP y lo observado.
3. Guarda una nueva versión en `Perfil` con:
   - el perfil en Markdown por dimensión, con citas textuales cortas de Gloria como evidencia,
   - **hipótesis** pendientes de confirmar (con la evidencia a favor y explicaciones alternativas),
   - **huecos detectados**,
   - **frases y expresiones características** literales.
4. Genera o ajusta 1 pregunta de la sesión siguiente para cubrir el hueco o la hipótesis más importante, respetando la fase del programa.

## 8. Entregables finales (al terminar las 30 sesiones)

Generar desde los datos (función de exportación):
1. **`perfil_gloria.md`**: perfil final completo. Sirve como instrucciones de sistema para la Gloria virtual.
2. **`ejemplos_gloria.jsonl`**: pares pregunta → respuesta reales de Gloria, seleccionados y etiquetados por situación, para usar como ejemplos.
3. **`dataset_finetuning.jsonl`**: el mismo material en formato de conversación, por si más adelante se quiere entrenar un modelo propio.
4. **`SKILL.md` de `/gloria`**: skill para usar a la Gloria virtual dentro de Claude (perfil + reglas + ejemplos + límites).
5. **Guía para el agente de atención a clientes**: cómo conectar el perfil a un chatbot en la web de Co-Evolution o WhatsApp, con el mensaje de transparencia ("Hola, soy la asistente virtual de Gloria…") y las reglas de derivación a la Gloria real.

## 9. Seguridad y privacidad

- **Nunca** compartir credenciales de la cuenta de Claude. Solo se usa una **clave de la API** creada en console.anthropic.com para este proyecto, con **límite de gasto mensual** (sugerido: 10–20 USD), que se desactiva al terminar.
- `ACCESS_CODE`, `ANTHROPIC_API_KEY` y `SHEET_ID` solo en Script Properties. Nada de secretos en el repositorio ni en el HTML. Añadir `.gitignore` y revisar antes de cada commit.
- Elegir un código de acceso nuevo, que no sea un número de documento ni algo ya compartido por chat.
- El repositorio puede ser público para usar GitHub Pages gratis: solo contiene el frontend, el banco de preguntas y los prompts, sin datos de Gloria.
- Consentimiento explícito en la primera entrada (Ley 1581 de 2012): propósito, datos recogidos, quién accede, transcripción de voz por servicio del navegador, derecho a consultar y borrar.
- Funciones de administración para exportar, revocar el acceso recordado y borrar todos los datos de Gloria si lo pide.
- **Transparencia con clientes:** la Gloria virtual debe presentarse como asistente virtual; nunca hacerse pasar por la Gloria real.
- **Uso ético:** el análisis de economía conductual y de persuasión sirve para reflejar cómo es Gloria, no para que la asistente manipule a clientes.

## 10. Estructura del repositorio

```
gloria-virtual/
├── README.md                 # Qué es y guía de instalación paso a paso
├── frontend/
│   └── index.html            # App completa (HTML + CSS + JS)
├── backend/
│   ├── Code.gs               # Endpoints, sesiones, reglas de avance, llamadas a Claude
│   ├── Analysis.gs           # Análisis tras cada sesión y respaldo nocturno
│   ├── Export.gs             # Entregables finales
│   ├── Admin.gs              # Exportar, revocar acceso, borrar datos
│   └── appsscript.json       # Zona horaria America/Bogota
├── data/
│   ├── banco_preguntas.json  # Las 30 sesiones (id, sesión, orden, técnica, enfoque, modalidad, contexto, texto)
│   └── mini_ipip_es.json     # 20 ítems de personalidad
├── prompts/
│   ├── repregunta.md         # Prompt de repreguntas en vivo
│   ├── analisis_sesion.md    # Prompt de actualización de perfil
│   ├── calibracion.md        # Prompt para que la Gloria virtual responda en fase 4
│   └── gloria_virtual.md     # Plantilla del prompt final de la asistente
└── .gitignore
```

## 11. Guía de instalación (para el administrador, no para Gloria)

El README debe explicar, con pasos numerados y sin suponer conocimientos técnicos:
1. Crear la hoja de Google y abrir Extensiones → Apps Script.
2. Pegar los archivos de `backend/`.
3. Configurar Script Properties: `ACCESS_CODE`, `ANTHROPIC_API_KEY`, `SHEET_ID`.
4. Ejecutar `setup()`, que crea las pestañas, carga el banco de preguntas y crea el disparador nocturno (23:00 hora de Colombia).
5. Publicar como aplicación web y copiar la URL.
6. Pegar esa URL en la constante de `frontend/index.html`.
7. Activar GitHub Pages en el repositorio y obtener el link.
8. Probar una sesión completa con un código de prueba, en celular y computador, incluido el micrófono.
9. Ejecutar `resetPrueba()` para borrar los datos de la prueba.
10. Enviar a Gloria el link y el código de acceso por canales separados.

## 12. Criterios de aceptación

**Experiencia**
- [ ] Gloria puede completar una sesión entera desde el celular sin ayuda.
- [ ] El panel muestra sesiones completadas de 30 y días sin responder.
- [ ] No se puede iniciar una tercera sesión el mismo día; terminar una sesión pendiente de días anteriores no cuenta para ese límite. Validado en el servidor.
- [ ] Si deja una sesión a medias, al volver lo primero que ve es "Continuar sesión X".
- [ ] Un borrador a medio escribir o dictar reaparece si cierra el navegador.
- [ ] Sin conexión, la respuesta queda guardada en el dispositivo y se envía al recuperar conexión.
- [ ] Todas las preguntas se pueden escuchar en voz alta en español.
- [ ] La voz se transcribe en vivo en Chrome y Safari; si no se soporta, aparece la alternativa escrita.

**Diseño**
- [ ] Contraste WCAG AA en modo claro y oscuro, sin blanco ni negro puros como fondo.
- [ ] Texto de pregunta de al menos 20 px y control A− / A+ funcionando.
- [ ] Sin desplazamiento horizontal a 360 px de ancho; áreas táctiles de al menos 48 px.
- [ ] Respeta `prefers-reduced-motion` y es navegable con teclado.

**Datos y análisis**
- [ ] Cada respuesta queda en `Respuestas` con todos sus campos, incluida la transcripción original sin limpiar.
- [ ] Las repreguntas nunca evalúan, corrigen, aconsejan ni interpretan su personalidad.
- [ ] Si la API de Claude falla, la respuesta se guarda y la sesión continúa.
- [ ] Tras cada sesión se crea una nueva versión del perfil con hipótesis, huecos y frases características.
- [ ] La sesión siguiente refleja al menos una pregunta adaptada cuando hay huecos relevantes, incluso si se hace el mismo día.
- [ ] Ningún secreto aparece en el repositorio ni en el HTML.
- [ ] La exportación final genera los cinco entregables de la sección 8.
