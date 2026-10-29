# Gloria Virtual

Plataforma de **30 sesiones** para capturar la forma de escribir, hablar, razonar, sentir y actuar de **Gloria Paternina Cárdenas** (Co-Evolution) y, con eso, crear una asistente virtual que responda a clientes como lo haría ella.

- **Gloria** solo necesita un link y un código: responde escribiendo o hablando desde el celular o el computador. Todo se guarda solo y retoma donde lo dejó.
- **El administrador** instala una vez el backend (Google Sheets + Apps Script) y publica la página (GitHub Pages).
- Tras cada sesión, Claude actualiza el perfil de Gloria y adapta la sesión siguiente. Al terminar, se generan los cinco entregables para la Gloria virtual.

La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md).

```
[Gloria: navegador] → [frontend/index.html en GitHub Pages]
        │  fetch (text/plain, sin preflight CORS)
        ▼
[Google Apps Script (backend/*.gs)] → Google Sheets (datos)
                                    → API de Claude (repreguntas y análisis)
                                    → disparadores (análisis a 1 min y respaldo nocturno)
```

---

## Guía de instalación (para el administrador)

Necesitas una cuenta de Google y una clave de la API de Claude. No hace falta saber programar: son pasos de copiar y pegar. Calcula unos 30 minutos.

### Antes de empezar: la clave de la API de Claude

1. Entra en <https://console.anthropic.com>, crea una cuenta (o usa la tuya) y añade un método de pago.
2. En **Settings → Limits**, pon un **límite de gasto mensual** de 10 a 20 USD. Es más que suficiente para las 30 sesiones.
3. En **API Keys**, pulsa **Create Key**, llámala `gloria-virtual` y copia la clave (empieza por `sk-ant-`). Guárdala en un lugar seguro: no la vuelvas a ver.
4. **Nunca** compartas la contraseña de una cuenta de Claude: este proyecto solo usa esta clave de API. Desactívala al terminar el programa.

### 1. Crear la hoja de Google y abrir Apps Script

1. Entra en <https://sheets.new> con tu cuenta de Google. Ponle de nombre **Gloria Virtual · datos**.
2. Copia el **ID** de la hoja: es la parte de la dirección entre `/d/` y `/edit`. Por ejemplo, en `https://docs.google.com/spreadsheets/d/1AbC…xYz/edit` el ID es `1AbC…xYz`.
3. En el menú de la hoja, abre **Extensiones → Apps Script**. Se abre el editor en otra pestaña.

### 2. Pegar los archivos de `backend/`

En el editor de Apps Script:

1. Borra el contenido de `Código.gs` (o `Code.gs`) y pega el de [`backend/Code.gs`](backend/Code.gs). Renómbralo a `Code` (tres puntos junto al nombre → **Cambiar nombre**).
2. Con el botón **+ → Secuencia de comandos**, crea `Data`, `Analysis`, `Admin` y `Export` y pega en cada uno el archivo del mismo nombre de la carpeta [`backend/`](backend/). `Data.gs` es largo: contiene el banco de preguntas, el cuestionario de personalidad y los prompts.
3. En **Configuración del proyecto** (rueda dentada), marca **Mostrar el archivo de manifiesto «appsscript.json» en el editor**. Vuelve al editor, abre `appsscript.json` y sustituye su contenido por el de [`backend/appsscript.json`](backend/appsscript.json). Así la zona horaria queda en **America/Bogota**.
4. Guarda (icono del disquete).

### 3. Configurar las propiedades del script (los secretos)

En **Configuración del proyecto → Propiedades del script → Añadir propiedad del script**, crea estas tres:

| Propiedad | Valor |
|---|---|
| `ACCESS_CODE` | El código de acceso de Gloria. Elige uno **nuevo**, fácil de escribir y que no sea un número de documento ni algo ya compartido por chat. Ejemplo: `ceiba-azul-47`. |
| `ANTHROPIC_API_KEY` | La clave de la API de Claude (`sk-ant-…`). |
| `SHEET_ID` | El ID de la hoja del paso 1. |

Estos valores solo viven aquí: nunca van en el repositorio ni en la página.

### 4. Ejecutar `setup()`

1. En el editor, abre `Admin.gs`, elige la función **`setup`** en el desplegable de arriba y pulsa **Ejecutar**.
2. Google te pedirá permisos (hoja de cálculo, conexiones externas, disparadores y Drive). Pulsa **Revisar permisos**, elige tu cuenta y, si aparece «Google no ha verificado esta aplicación», pulsa **Configuración avanzada → Ir a … (no seguro)**. Es tu propio script.
3. Al terminar, la hoja tiene las pestañas `Sesiones`, `Respuestas`, `Borradores`, `Preguntas`, `Perfil`, `Progreso`, `Log` y `Prueba_ciega`, y hay un disparador nocturno a las 23:00 (hora de Colombia) que hace de respaldo del análisis.

### 5. Publicar como aplicación web

1. Pulsa **Implementar → Nueva implementación**. En el engranaje, elige **Aplicación web**.
2. **Ejecutar como: yo**. **Quién tiene acceso: cualquier persona**.
3. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> Cada vez que cambies el código del backend, usa **Implementar → Gestionar implementaciones → Editar → Versión: nueva versión**. Así la URL no cambia.

### 6. Pegar la URL en el frontend

Abre [`frontend/index.html`](frontend/index.html) y busca, casi al final, el bloque:

```js
const CONFIG = {
  BACKEND_URL: 'PEGA_AQUI_LA_URL_DE_TU_APLICACION_WEB',
};
```

Sustituye el texto entre comillas por la URL del paso 5 y guarda (en GitHub puedes editarlo directamente con el lápiz y **Commit changes**). Esta URL no es secreta: sin el código de acceso no da acceso a nada.

### 7. Activar GitHub Pages

1. En el repositorio de GitHub, ve a **Settings → Pages**.
2. En **Source**, elige **Deploy from a branch**, la rama `main` y la carpeta **`/ (root)`**. Guarda.
3. A los pocos minutos, el link de Gloria será: `https://<tu-usuario>.github.io/<repositorio>/frontend/`.

El repositorio puede ser público: solo contiene la página, el banco de preguntas y los prompts, nunca datos de Gloria.

### 8. Probar una sesión completa

Con tu propio código, en el **celular** (Chrome en Android o Safari en iPhone) y en el **computador**:

1. Entra, acepta el consentimiento y prueba el micrófono en el tutorial.
2. Haz la sesión 1 entera: una respuesta escrita, una hablada (con la transcripción en vivo) y pulsa **Escuchar pregunta**.
3. Comprueba en la hoja que aparecen las filas en `Respuestas` y, un minuto después de terminar, una fila en `Perfil`.

### 9. Borrar los datos de la prueba

En el editor, en `Admin.gs`, ejecuta **`resetPrueba`**. El programa queda como recién instalado y se cierran todas las sesiones abiertas.

### 10. Enviar a Gloria el link y el código

Envía el **link** por un canal y el **código** por otro distinto (por ejemplo, el link por correo y el código por WhatsApp o en persona).

---

## Funciones de administración

Se ejecutan desde el editor de Apps Script (desplegable de funciones → **Ejecutar**). El resultado aparece en el **Registro de ejecución**.

| Función | Archivo | Para qué |
|---|---|---|
| `verEstado` | `Admin.gs` | Sesiones completadas, sesión a medias, días sin responder y versión del perfil. |
| `exportarDatos` | `Admin.gs` | Guarda todos los datos en un archivo JSON en tu Google Drive (para consultarlos o entregarlos a Gloria). |
| `revocarAccesos` | `Admin.gs` | Cierra todas las sesiones abiertas («Recordarme en este dispositivo»). |
| `borrarTodosLosDatos` | `Admin.gs` | Borra todos los datos de Gloria si lo pide (Ley 1581 de 2012). Borra también, a mano, los archivos exportados en Drive. |
| `resetPrueba` | `Admin.gs` | Borra los datos de una prueba y reinicia el programa. |
| `crearCodigoEvaluador` | `Admin.gs` | Crea el código para la persona del equipo que hace la prueba a ciegas (fase 5). |
| `analizarSesion` | `Analysis.gs` | Vuelve a analizar una sesión a mano (cambia el `1` por el número: `analizarSesion(1)`). |
| `generarEntregables` | `Export.gs` | Crea en Drive la carpeta con los cinco entregables finales. |

### Prueba a ciegas con alguien del equipo (sesiones 29–30)

1. Ejecuta `crearCodigoEvaluador` y copia el código del registro.
2. Envía a esa persona el link de Gloria con `?modo=ciego` al final (`…/frontend/?modo=ciego`) y el código, por canales separados.
3. Verá los mismos pares de respuestas que Gloria (una real y otra de la Gloria virtual) e intentará distinguirlas. Sus respuestas quedan en la pestaña `Prueba_ciega`.

### Entregables finales (sección 8)

Al terminar las 30 sesiones, ejecuta `generarEntregables`. Crea una carpeta en Drive con:

1. **`perfil_gloria.md`**: las instrucciones de sistema de la Gloria virtual (perfil, límites, ejemplos y reglas de transparencia).
2. **`ejemplos_gloria.jsonl`**: pares situación → respuesta reales de Gloria, etiquetados.
3. **`dataset_finetuning.jsonl`**: el mismo material en formato de conversación.
4. **`SKILL.md`**: la skill `/gloria` para usar la Gloria virtual dentro de Claude (ponla en `.claude/skills/gloria/SKILL.md`).
5. **`guia_agente_clientes.md`**: cómo conectarla a la web de Co-Evolution o a WhatsApp, con el mensaje de transparencia y las reglas de derivación.

---

## Cómo funciona el programa

- **30 sesiones** de 20 a 25 minutos, en cinco fases: identidad y voz (1–7), metodología (8–14), situaciones difíciles (15–22), calibración (23–28) y prueba a ciegas y cierre (29–30). Ver [`data/banco_preguntas.json`](data/banco_preguntas.json).
- **Máximo 2 sesiones iniciadas por día** (hora de Bogotá), controlado en el servidor. Terminar una sesión que quedó a medias de un día anterior no cuenta para el límite del día.
- **Repreguntas en vivo** (`claude-sonnet-5-5`): de 0 a 2 por respuesta y unas 6 por sesión. Nunca evalúan, corrigen, aconsejan ni interpretan a Gloria ([`prompts/repregunta.md`](prompts/repregunta.md)).
- **Análisis tras cada sesión** (`claude-opus-5-5`), un minuto después de completarla: nueva versión del perfil con hipótesis, huecos y frases características, y una pregunta adaptada para la sesión siguiente ([`prompts/analisis_sesion.md`](prompts/analisis_sesion.md)). También prepara las afirmaciones de validación (sesión 7), las respuestas de la Gloria virtual para calibrar (23–27) y los pares de la prueba a ciegas (29–30).
- **Si la API de Claude falla**, la respuesta se guarda igual y la sesión sigue sin repregunta. El análisis se reintenta (3 veces cada 10 minutos y, de respaldo, cada noche).
- **Personalidad**: 20 ítems del Mini-IPIP (sesiones 2–5), solo como complemento del perfil y nunca mostrados como etiqueta ([`data/mini_ipip_es.json`](data/mini_ipip_es.json)).

## Decisiones tomadas (no definidas en la especificación)

- **Sesión siguiente «en preparación».** Si Gloria intenta empezar otra sesión justo al terminar una, el panel le dice que se está preparando y lo vuelve a comprobar cada minuto. Si el análisis tarda más de 10 minutos (por ejemplo, porque la API cae), puede empezar igual con las preguntas del banco.
- **Marcadores que dependen del perfil** (validación, hipótesis, calibración y prueba a ciegas). Si no se pudieron generar a tiempo, una calibración se convierte en «¿Cómo le responderías tú?» y el resto se omite, para que la sesión nunca se bloquee.
- **Columnas añadidas** a las de la especificación: `tipo`, `datos`, `segmentos` y `client_id` en `Respuestas`; `tipo`, `opciones`, `limite_seg`, `datos`, `padre_id` y `generar` en `Preguntas`; `intentos_análisis` en `Sesiones`; `tutorial_visto` en `Progreso`; `sesión_n` en `Perfil`; y la pestaña `Prueba_ciega`.
- **Repreguntas**: no se hacen en las preguntas rápidas a contrarreloj (para no romper la intuición), ni en la personalidad, las validaciones, la calibración o la prueba a ciegas.
- **Borradores**: se guardan en el dispositivo tras 1,5 s sin escribir, en el servidor cada 30 s mientras escribe y al salir o cerrar la pestaña.
- **Acceso recordado**: 180 días con «Recordarme en este dispositivo»; 12 horas sin marcarlo.
- **Rechazos de la API**: las llamadas usan `fallbacks: "default"`. Si un filtro de seguridad rechaza una petición, la API la reintenta en el modelo recomendado.
- **Cola sin conexión**: si falla la red al enviar, la respuesta queda en el dispositivo y Gloria sigue con la pregunta siguiente (sin repregunta). Todo se envía en orden al volver la conexión.

## Desarrollo

No hace falta instalar dependencias para el backend ni para la página.

```bash
node tools/build-data.mjs   # regenera backend/Data.gs tras cambiar data/ o prompts/
npm test                    # pruebas del backend (simulador de Apps Script) y de contraste
npm run dev                 # http://localhost:8787 con el backend real en memoria y Claude simulado (código: «prueba»)
npm run e2e                 # pruebas de punta a punta con Playwright (Chromium)
```

- `tools/gas-harness.mjs` simula en memoria los servicios de Apps Script (Sheets, Properties, disparadores, Drive, UrlFetch) y carga los archivos reales de `backend/`.
- **Si cambias el banco de preguntas o los prompts**, ejecuta `node tools/build-data.mjs` y vuelve a pegar `Data.gs` en Apps Script. `npm test` falla si `Data.gs` no está al día. Las preguntas ya cargadas en la hoja no cambian: para recargarlas en una instalación nueva, usa `resetPrueba`.

## Privacidad y seguridad

- Ley 1581 de 2012: consentimiento explícito en la primera entrada (propósito, datos, quién accede, transcripción de voz por el servicio del navegador, derecho a consultar y borrar) y funciones para exportar y borrar los datos.
- Ningún secreto en el repositorio ni en la página: `ACCESS_CODE`, `ANTHROPIC_API_KEY` y `SHEET_ID` solo en las propiedades del script. Revisa `git diff` antes de cada commit.
- Acceso bloqueado 15 minutos tras 5 códigos incorrectos.
- No se graba audio ni se usa la cámara: solo la transcripción del navegador.
- La Gloria virtual siempre se presenta como asistente virtual y nunca se hace pasar por la Gloria real. Lo que el perfil describe sobre persuasión sirve para que suene como ella, nunca para manipular a clientes.
