# 🎮 TETRIS CON INTERACCIÓN - v2.0

Un Tetris **100% controlado por gestos** usando detección de manos en tiempo real con MediaPipe Hands.

---

## 🎯 CONTROLES GESTUALES

| # | Gesto | Detección | Acción |
|---|-------|-----------|--------|
| 1 | 🖐️ **Mano abierta** | Índice y medio extendidos + al menos uno de anular/meñique | Mover la pieza horizontalmente |
| 2 | ✌️ **Victory sign** | Índice y medio extendidos; anular y meñique no extendidos | Acelerar la caída mientras se sostiene |
| 3 | 👍 **Pulgar arriba** | Pulgar levantado; dedos largos doblados o relajados | Rotar la pieza 90° en sentido horario (cada 600 ms) |
| 4 | 🤘 **Rock sign** | Índice, meñique y pulgar extendidos | Cambiar de escenario (cada 600 ms) |
| 5 | 👐 **Dos manos** | Dos manos visibles | Iniciar / reiniciar |
| 6 | 🖐️ **Sin manos** | Ninguna mano visible | Pausa automática tras 500 ms |

- El pulgar no se exige para la mano abierta.
- La pausa se cancela si una mano reaparece dentro de los 500 ms.
- El panel lateral muestra la guía de gestos y la vista previa del próximo escenario.

---

## 🚀 CARACTERÍSTICAS

✅ **Detección en tiempo real** - MediaPipe Hands @ 30 FPS  
✅ **Suavizado avanzado** - One Euro Filter para fluidez  
✅ **Controles intuitivos** - Mano abierta, victory, pulgar, rock y dos manos  
✅ **Sin botones, sin teclado** - Solo las manos controlan  
✅ **4 escenarios** - Catedral, Puente Roto, Santa Ana, Tranvía  
✅ **Audio tema** - Música y efectos; a los 500 puntos suena `tetris-500.mp3` desde el segundo 33 con crossfade y glitch de pantalla  
✅ **Pausa con margen** - Sin manos durante 500 ms = pausa; si vuelve una mano antes, la partida sigue  
✅ **Game Over con retorno** - Si pasan 20 s sin mostrar las dos manos, vuelve a la pantalla de inicio  
✅ **Debug mode** - Visualización de landmarks con `?debug`  
✅ **Vista previa** - Panel lateral con el próximo escenario

---

## 🎮 CÓMO JUGAR

### 🚀 Comenzar
Muestra **DOS MANOS** frente a la cámara → la partida inicia.

### 🕹️ Durante el juego

| Gesto | Acción |
|-------|--------|
| 🖐️ Mano abierta a la izquierda → Pieza se mueve a la izquierda |
| 🖐️ Mano abierta a la derecha → Pieza se mueve a la derecha |
| ✌️ Victory sign (sostén) → Pieza cae rápido |
| 👍 Pulgar arriba → Pieza rota 90° |
| 🤘 Rock sign (rápido) → Siguiente escenario |
| 🖐️ Retira TODAS las manos → **PAUSA automática** tras 500 ms |
| 🖐️ Vuelve a mostrar una mano → **REANUDA** |

### 🏁 Game Over
Muestra **DOS MANOS** → reinicia la partida.  
Si pasan **20 s** sin mostrar las dos manos, vuelve solo a la pantalla de inicio.

---

## 📋 REQUISITOS

- 🎥 **Cámara web** funcionando
- 🌐 **Navegador moderno**: Chrome, Firefox, Edge, Safari
- ⚡ **Conexión a internet** (CDN para librerías)
- 💡 **Buena iluminación** (importante para la detección)

---

## 🏗️ ARQUITECTURA

```
┌─────────────────────────────────────────────┐
│           TETRIS CON INTERACCIÓN v2.0       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─── js/gamelogic.js ─────────────────┐    │
│  │  Motor Tetris                       │    │
│  │  - Piezas, rotaciones               │    │
│  │  - Colisiones, líneas completadas   │    │
│  │  - Puntuación                       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─── js/handpose.js ──────────────────┐    │
│  │  Detección de Manos                 │    │
│  │  - MediaPipe Hands                  │    │
│  │  - Clasificación de gestos          │    │
│  │  - Emisión de eventos               │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─── js/interface.js ─────────────────┐    │
│  │  Interfaz de Usuario                │    │
│  │  - Pantallas: ready/game/paused/over│    │
│  │  - Escenarios (4 fondos)            │    │
│  │  - Puntaje, siguiente y guía        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─── sketch.js ───────────────────────┐    │
│  │  Integración p5.js                  │    │
│  │  - Renderizado del tablero          │    │
│  │  - Mapeo de eventos a acciones      │    │
│  │  - Control de movimiento            │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
tetris-con-interaccion/
├── index.html                 # Punto de entrada
├── sketch.js                  # Integración p5.js
├── style.css                  # Estilos
├── README.md                  # Documentación completa
│
├── js/
│   ├── gamelogic.js           # Motor del juego
│   ├── interface.js           # UI, pantallas y escenarios
│   └── handpose.js            # Detección de gestos
│
├── Catedral.png               # Escenario
├── Puente Roto.png            # Escenario
├── Santa Ana.png              # Escenario
├── Tranvía.png                # Escenario
│
├── tetris.mp3                 # Música de partida
├── linea.mp3                  # Efecto al completar línea
├── gameover.mp3               # Efecto de derrota
└── tetris-500.mp3             # Música desde los 500 puntos
```

---

## 🔧 CONFIGURACIÓN

Los parámetros de detección están en `js/handpose.js`, sección `CONFIG`:

```javascript
// Suavizado
SMOOTHING_ENABLED: true
SMOOTHING_METHOD: 'oneEuro'  // o 'ema'
ONE_EURO_MIN_CUTOFF: 4.0     // Más alto = menos retardo (~130 ms)
ONE_EURO_BETA: 0.3

// Detección
GESTURE_CONFIDENCE_MIN: 0.7
FINGER_EXTENDED_RATIO: 1.35      // Nudillo→punta vs nudillo→PIP
THUMB_FINGER_PROXIMITY_RATIO: 0.4

// Desaparición de manos (suavizado)
HAND_DISAPPEARANCE_TOLERANCE_MS: 200

// Cooldowns
HOLD_COOLDOWN_MS: 1500
PAUSE_GESTURE_COOLDOWN_MS: 500
INSTANT_COOLDOWNS: { ROCK: 600, PULGAR_ARRIBA: 600 }
```

El margen de pausa sin manos (500 ms) se configura en `sketch.js` como
`MARGEN_PAUSA_SIN_MANOS_MS`.

### Detección de gestos

- La extensión de cada dedo se mide comparando **nudillo→punta** contra
  **nudillo→PIP**, relativo al propio dedo. Así funciona a distintas distancias,
  con la mano inclinada o apuntando a la cámara.
- **VICTORIA** acepta que anular y meñique estén doblados **o relajados**; solo
  se exige que no estén claramente extendidos.
- **PULGAR ARRIBA** valida el pulgar por su distancia al centro de la palma y
  tolera un dedo largo relajado.
- **MANO ABIERTA** tolera un dedo largo relajado, pero exige índice y medio
  extendidos.
- El suavizado One Euro responde en aproximadamente 130 ms.

---

## 🧪 DEBUG MODE

Abre el juego con `?debug` en la URL:

```
http://localhost:8000/?debug
```

**Mostrará:**
- 21 puntos clave de las manos (landmarks)
- Esqueleto del movimiento en verde
- Logs en consola de cada gesto
- Información de FPS de detección

---

## 📊 EVENTOS EMITIDOS

| Evento | Cuándo | Datos |
|--------|--------|-------|
| `mover:columna` | Mano abierta se mueve | `{x: 0-1, columna: 0-15}` |
| `victoria:inicio` | Gesto victory comienza | `{mano: 'left'/'right'}` |
| `victoria:fin` | Gesto victory termina | `{}` |
| `gesto:confirmado` | Gesto instantáneo | `{gesto: 'ROCK' / 'PULGAR_ARRIBA', manoDuena}` |
| `mano:detectada` | Aparece una mano | `{cantidad, lado, mano: 1/2, primera}` |
| `mano:perdida` | Desaparece una mano | `{cantidad, lado}` |

---

## 🎨 CAMBIOS DESDE v1.0

### ✂️ Removido
- ❌ Puntero (índice levantado solo)
- ❌ Clicks por pinch (pulgar-índice)
- ❌ Pausa por puño
- ❌ Reanudación por pulgar
- ❌ Menús de navegación interactivos

### ✨ Nuevo
- ✅ Pulgar arriba para rotar la pieza
- ✅ ROCK sign para cambiar de escenario
- ✅ Dos manos para iniciar/reiniciar
- ✅ Pausa automática sin manos, con 500 ms de margen
- ✅ Reanudación automática con una mano
- ✅ Suavizado One Euro Filter
- ✅ Detección multi-gesto mejorada
- ✅ Vista previa del próximo escenario en el panel lateral

---

## 🚨 SOLUCIÓN DE PROBLEMAS

### ❌ AudioWorklet: "a class with the same name is already registered"

```
NotSupportedError: AudioWorkletGlobalScope.registerProcessor:
Argument 1 is invalid: a class with the same name is already registered.
```

✅ **Resuelto** - Se quitó `p5.sound`: el audio usa `HTMLAudioElement` y ya no
se registran AudioWorklets. No requiere acción.

### ❌ Reproducción de audio bloqueada

```
Se ha impedido que un AudioContext se inicie automáticamente.
```

✅ **Ya implementado** - El primer clic, toque o tecla habilita los
reproductores. Si no escuchás nada, hacé un clic en la página una vez. El
permiso de cámara también puede habilitarlo. La música se reintenta al iniciar
o reanudar la partida.

### ✅ WebGL backend: "already registered"

```
webgl backend was already registered. Reusing existing backend factory.
The kernel 'XXX' for backend 'webgl' is already registered
```

✅ **Resuelto** - Se quitó el `<script>` duplicado de `tfjs-backend-webgl`;
`@tensorflow/tfjs` ya incluye ese backend. No requiere acción.

### ✅ Source map 404 y avisos de sensores de p5.js

```
Error en el mapeo fuente: request failed with status 404
El uso del sensor de orientación está obsoleto.
```

✅ **Ignorar** - Son avisos de desarrollo de la CDN y de p5.js. No afectan el
juego.

### ❌ Cámara no se abre / "Permission denied"

1. Verificá que diste permiso de cámara al navegador.
2. Recargá la página (`F5`).
3. Cerrá otras pestañas o aplicaciones que usen la cámara.
4. Comprobá que la cámara funcione en otra aplicación.
5. En Windows: Configuración > Privacidad > Cámara.
6. En Linux: verificá que `udev` esté configurado.

Si persiste, el juego carga pero no puede leer gestos.

### ❌ Gestos no detectados

1. Acercate más a la cámara.
2. Mejorá la iluminación de las manos.
3. Evitá fondos con líneas parecidas a las manos.
4. Movete más despacio.
5. Activá `?debug` para ver los landmarks.
6. Ajustá `FINGER_EXTENDED_RATIO` o `THUMB_FINGER_PROXIMITY_RATIO` si hace falta.

### ❌ Las manos se detectan pero el juego no responde

1. Verificá que estés en la pantalla de juego.
2. Activá `?debug` para ver qué gesto se reconoce.
3. Abrí DevTools (F12) y revisá la consola.
4. Comprobá que `window.HandPose` exista.

### ❌ ROCK no cambia el fondo

1. Recargá con `Ctrl+F5` para evitar caché.
2. Verificá que los cuatro `.png` estén en la raíz.
3. Probá el cambio manual desde la consola:

```javascript
window.TetrisUI.setScenario('puente-roto');
window.TetrisUI.getScenario();
```

### ❌ El juego se congela o la pieza se mueve a saltos

1. Cerrá otras pestañas y aplicaciones.
2. Desactivá `?debug`.
3. Reducí la resolución de la cámara en `js/handpose.js` si es necesario.
4. Ajustá el suavizado (`SMOOTHING_ENABLED`, `ONE_EURO_MIN_CUTOFF`).
5. En Chromium, activá la aceleración por hardware.

### ❌ Pantalla negra / "Cannot read property 'estaActivo' of null"

1. Verificá que exista `<main id="tetris-app"></main>` en `index.html`.
2. Comprobá el orden de los scripts: motor → interfaz → manos → `sketch.js`.
3. Recargá la página.
4. En consola, `window.juego` debe mostrar el motor.

### 🧪 Diagnóstico rápido

Ejecutá esto en la consola del navegador:

```javascript
console.log('p5:', typeof p5 !== 'undefined');
console.log('TetrisUI:', typeof window.TetrisUI !== 'undefined');
console.log('HandPose:', typeof window.HandPose !== 'undefined');
console.log('Motor:', window.juego !== undefined);
console.log('Pantalla:', window.TetrisUI.getScreen());
console.log('Fondo:', window.TetrisUI.getScenario());
console.log('Juego activo:', window.juego.estaActivo());
```

### 📱 Navegadores soportados

| Navegador | Soporte | Notas |
|-----------|---------|-------|
| Chrome/Chromium | ✅ Full | Mejor soporte, WebGL rápido |
| Firefox | ✅ Full | Buen soporte, un poco más lento |
| Safari (Mac) | ⚠️ Parcial | Cámara funciona pero lento |
| Safari (iOS) | ❌ No | Restricciones de permisos |
| Edge | ✅ Full | Idéntico a Chrome |
| Opera | ✅ Full | Idéntico a Chrome |

### 🆘 Si nada funciona

1. Recargá con `Ctrl+F5` (fuerza sin caché).
2. Cerrá todas las pestañas del juego.
3. Reiniciá el navegador.
4. Limpiá el almacenamiento: DevTools > Application > Clear storage.
5. Mirá la consola (F12) y copiá el error real.

---

## 📈 TEST CHECKLIST

- ✅ Cámara se abre sin errores
- ✅ Modelo de manos carga en < 5 s
- ✅ Mano abierta mueve la pieza suavemente
- ✅ Victory sign acelera la caída
- ✅ Pulgar arriba rota la pieza
- ✅ Rock sign cicla los 4 fondos
- ✅ Dos manos inician la partida
- ✅ Sin manos pausa tras 500 ms
- ✅ Una mano reaparece y reanuda
- ✅ Audio se activa con el primer gesto o clic
- ✅ Sin errores críticos en consola

---

## 🔮 FUTURAS MEJORAS

- [ ] Predicción de movimiento (ML smoothing)
- [ ] Más gestos (giros, dos dedos, etc.)
- [ ] Feedback visual en pantalla (círculos de detección)
- [ ] Configuración dinámica de umbrales
- [ ] Estadísticas en tiempo real
- [ ] Multiplayer (dos jugadores, manos diferentes)
- [ ] Modo accesibilidad (controles alternativos)
- [ ] Soporte para otros detectores (pose, face)

---

## 📄 LICENCIA

Este proyecto es de código abierto. Libre para usar, modificar y distribuir.

---

## 👨‍💻 DESARROLLO

**Última versión:** 2.0  
**Fecha:** 2026-11-19  
**Motor de detección:** MediaPipe Hands + TensorFlow.js  
**Renderizado:** p5.js  
**Audio:** HTMLAudioElement  
**Navegadores:** Chrome, Firefox, Edge, Safari

---

## 🙏 CRÉDITOS

- **MediaPipe** - Detección de manos
- **TensorFlow.js** - Inferencia en navegador
- **p5.js** - Renderizado
- **One Euro Filter** - Suavizado de movimiento

---

**¡Disfruta del Tetris con gestos! 🎮✋**
