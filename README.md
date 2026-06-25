# NEXUS SURVEILLANCE

Sistema profesional de monitoreo multicámara en tiempo real con WebRTC.

## Requisitos

- Node.js 18+
- ngrok instalado (`npm install -g ngrok` o descargar desde ngrok.com)

## Instalación

```bash
# 1. Clonar/descomprimir el proyecto
# 2. Copiar variables de entorno
cp .env.example .env

# 3. Instalar dependencias raíz
npm install

# 4. Instalar dependencias del cliente
cd client && npm install && cd ..
```

## Desarrollo

```bash
# Terminal 1: Iniciar ngrok
ngrok http 3000
# Copiar la URL HTTPS generada (ej: https://xxxx.ngrok-free.app)

# Editar .env con la nueva URL
# BASE_URL=https://xxxx.ngrok-free.app

# Terminal 2: Iniciar el sistema completo
npm run dev
```

El dashboard estará en: http://localhost:5173  
El backend en: http://localhost:3000

## Producción

```bash
npm run build
npm start
```

El sistema completo corre en: http://localhost:3000

## Cómo conectar una cámara

1. Abrir el dashboard en el navegador del PC
2. El QR se genera automáticamente en el panel derecho
3. Escanear el QR con el teléfono móvil
4. El teléfono abrirá `/mobile` automáticamente
5. Conceder permisos de cámara cuando se solicite
6. El video aparece en el dashboard en segundos

## 🛰️ Narrador de Seguridad IA (visión + voz + subtítulos)

Cada cámara conectada es analizada periódicamente por un modelo de visión que
describe lo que ve, enfocado en seguridad: si aparece una persona, la
describe de la forma más completa posible (ropa, qué está haciendo, qué
lleva consigo, comportamiento relevante) y, mientras siga en escena, sigue
narrando lo que hace (sin repetir la descripción completa cada vez — solo la
novedad). El texto se convierte a voz con `edge-tts` y se muestra como
subtítulo sobre el video correspondiente.

### Cómo funciona

```
<video> del dashboard
      │  (cada VITE_NARRATION_INTERVAL_MS, por defecto 6s)
      ▼
canvas → JPEG base64 ── socket.emit('vision:frame') ──▶ servidor
                                                            │
                                              ┌─────────────▼─────────────┐
                                              │     VisionModelWheel       │
                                              │  (rueda de modelos NIM,    │
                                              │   reintenta con el         │
                                              │   siguiente si uno falla)  │
                                              └─────────────┬─────────────┘
                                                            │ descripción (texto)
                                              ┌─────────────▼─────────────┐
                                              │  edge-tts (Node, sin API   │
                                              │  key) → audio MP3 + cues   │
                                              └─────────────┬─────────────┘
                                                            │
                              socket.emit('narration:update') / ('narration:status')
                                                            │
                                                            ▼
                                      <audio> + subtítulo sobre el CameraTile
```

- **Rueda de modelos** (`server/visionWheel.js`): si un modelo falla (timeout,
  rate-limit, error HTTP, respuesta vacía), se prueba automáticamente el
  siguiente de la lista `VISION_MODEL_WHEEL`, hasta agotarla.
- **Contexto por cámara** (`server/narrationEngine.js`): si en el frame
  anterior había una persona y sigue presente, el prompt le pide al modelo
  que narre la *continuación* de la acción en vez de repetir la descripción
  completa. Si no hay nada relevante, el modelo responde `SIN_NOVEDAD` y no
  se genera audio/subtítulo (para no saturar con narración constante).
- **Un solo "micrófono" a la vez**: si hay varias cámaras conectadas, solo
  una reproduce audio en cada momento (para que las voces no se superpongan);
  el resto sigue mostrando subtítulos en silencio. Se cambia con el ícono de
  parlante en cada tarjeta de cámara.
- **Interruptor maestro**: botón "IA SEGURIDAD ON/OFF" en el header.

### Configuración

1. Crea una cuenta en [build.nvidia.com](https://build.nvidia.com) y genera
   una API key (`nvapi-...`).
2. En `.env` (raíz del proyecto), agrega `NVIDIA_NIM_API_KEY=nvapi-...` y
   ajusta `VISION_MODEL_WHEEL` / `TTS_VOICE` si quieres otros modelos o voz.
3. `npm install` ya incluye `edge-tts-universal` (no requiere Python ni
   cuenta de Microsoft — usa el mismo servicio gratuito que "Leer en voz
   alta" de Microsoft Edge).
4. Reinicia el servidor (`npm run dev` / `npm start`).

### Notas importantes

- **Licencia de `edge-tts-universal`: AGPL-3.0.** Si vas a ofrecer este
  dashboard como servicio en red a terceros (no solo uso interno), revisa las
  obligaciones de AGPL (publicar el código fuente del servidor). Si eso es un
  problema para tu caso de uso, puedes reemplazar `server/ttsEngine.js` por
  una llamada al `edge-tts` de Python (licencia MIT) vía `child_process`,
  manteniendo el resto del pipeline intacto.
- **Privacidad**: los frames se envían al backend (y de ahí a la API de
  NVIDIA) para su análisis. Si esto va a apuntar a espacios donde transitan
  terceros, infórmales que hay cámaras con análisis por IA, según corresponda
  según la normativa local.
- **Multi-viewer**: si abres el dashboard en más de una pestaña/dispositivo
  viendo la misma cámara, cada una dispara su propio análisis (no se
  deduplica entre viewers todavía) — para uso normal de un solo dashboard
  esto no es un problema.
- **Costo/latencia**: cada cámara activa genera ~1 llamada al modelo de
  visión + 1 síntesis de voz cada `VITE_NARRATION_INTERVAL_MS`. Ajusta el
  intervalo según tu plan de NVIDIA NIM.
- Estado en vivo de la rueda de modelos: `GET /api/narration/status`.

## Troubleshooting

- **No conecta WebRTC**: Verificar que `BASE_URL` en `.env` sea la URL ngrok activa
- **ngrok cambió URL**: Actualizar `.env` y reiniciar el servidor (`npm run dev`)
- **iOS no conecta**: Usar Safari (mejor soporte WebRTC en iOS)
- **Cámara no aparece en móvil**: Asegurarse de abrir la URL por HTTPS (ngrok la provee)
- **Error CORS**: Verificar que el header `ngrok-skip-browser-warning` esté presente
- **Pantalla en negro**: El navegador puede bloquear autoplay; tocar la pantalla del móvil
- **No hay subtítulos ni voz**: revisa que `NVIDIA_NIM_API_KEY` esté configurada y que el botón "IA SEGURIDAD" del header esté en ON; mira `GET /api/narration/status` y la consola del servidor para ver qué modelo respondió (o si todos fallaron)
- **No se escucha audio pero sí aparecen subtítulos**: esa cámara no tiene el "micrófono" — haz clic en el ícono de parlante de su tarjeta

## Arquitectura

```
Teléfono (offerer) ──WebRTC──> Dashboard (answerer)
         │                           │                    Frame (cada N seg)
         └──── Socket.IO signaling ──┤                           │
                       │             └──── vision:frame ────────▶│
                   Express server                                │
                   (relay WebRTC + IA)◀── VisionModelWheel (NIM) ┘
                       │
                  edge-tts (Node)
                       │
        narration:update (texto + audio + cues) ──▶ Dashboard
                                              (audio + subtítulos)
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `BASE_URL` | URL pública de ngrok (HTTPS) |
| `PORT` | Puerto del servidor Express (default: 3000) |
| `NVIDIA_NIM_API_KEY` | API key de NVIDIA NIM (`nvapi-...`) para el Narrador de Seguridad IA |
| `NIM_BASE_URL` | Endpoint de NIM (cloud o autohospedado). Default: `https://integrate.api.nvidia.com/v1` |
| `VISION_MODEL_WHEEL` | Rueda de modelos de visión separados por coma, con fallback automático |
| `TTS_VOICE` / `TTS_RATE` / `TTS_VOLUME` | Voz y prosodia de `edge-tts` para la narración |
| `NARRATION_MAX_SENTENCES` | Máximo de frases por narración generada |
| `NARRATION_CONTEXT_TTL_MS` | Tiempo (ms) tras el cual una cámara sin frames "olvida" el contexto previo |
| `VITE_NARRATION_INTERVAL_MS` (cliente) | Cada cuántos ms el dashboard captura/analiza un frame por cámara |
