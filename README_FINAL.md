# 🎮 TETRIS CON INTERACCIÓN - v2.0

## Rediseño Completo de Controles Gestuales ✅

Un Tetris **100% controlado por gestos** usando detección de manos en tiempo real con MediaPipe Hands.

---

## 🎯 **5 GESTOS PRIMARIOS**

| # | Gesto | Detección | Acción | Control |
|---|-------|-----------|--------|---------|
| 1 | 🖐️ **Mano Abierta** | 5 dedos extendidos | Desplazar pieza (horizontal) | Continuo |
| 2 | ✌️ **Victory Sign** | Índice + Medio up | Acelerar caída | Sostenido |
| 3 | 👐👐 **Dos Manos** | 2 manos visibles | Iniciar / Reiniciar | Transición |
| 4 | 🤘 **Rock Sign** | Índice + Meñique + Pulgar | Cambiar fondo | Instantáneo |
| 5 | 🖐️ **Sin Manos** | 0 manos detectadas | Pausa automática | Transición |

---

## 🚀 **CARACTERÍSTICAS**

✅ **Detección en tiempo real** - MediaPipe Hands @ 30 FPS  
✅ **Suavizado avanzado** - One Euro Filter para fluidez  
✅ **5 gestos intuitivos** - Fáciles de aprender y recordar  
✅ **Sin botones, sin teclado** - Solo las manos controlan  
✅ **4 escenarios** - Catedral, Puente Roto, Santa Ana, Tranvía  
✅ **Audio tema** - Música y efectos; a los 500 puntos suena `tetris-500.mp3` desde el segundo 33 con crossfade y glitch de pantalla  
✅ **Debug mode** - Visualización de landmarks (?debug)  
✅ **Pausa automática** - Sin manos = pausa  

---

## 🎮 **CÓMO JUGAR**

### 🚀 **COMENZAR**
Muestra **DOS MANOS** frente a la cámara → Partida inicia

### 🕹️ **DURANTE EL JUEGO**

El panel del lateral izquierdo muestra el icono de cada gesto, su acción, y se ilumina el que está activo en ese momento.

| Gesto | Acción |
|-------|--------|
| 🖐️ Mano abierta izquierda → Pieza se mueve izquierda |
| 🖐️ Mano abierta derecha → Pieza se mueve derecha |
| ✌️ Victory sign (sostén) → Pieza cae rápido |
| 👍 Pulgar arriba → Pieza rota 90° |
| 🤘 Rock sign (rápido) → Siguiente escenario |
| 🖐️ Retira TODAS las manos → **PAUSA automática** |
| 🖐️ Vuelve a mostrar una mano → **REANUDA** |

### 🏁 **GAME OVER**
Muestra **DOS MANOS** → Reinicia partida

---

## 📋 **REQUISITOS**

- 🎥 **Cámara web** funcionando
- 🌐 **Navegador moderno**: Chrome, Firefox, Edge, Safari
- ⚡ **Conexión a internet** (CDN para librerías)
- 💡 **Buena iluminación** (importante para detección)

---

## 🏗️ **ARQUITECTURA**

```
┌─────────────────────────────────────────────┐
│           TETRIS CON INTERACCIÓN v2.0       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─── js/gamelogic.js ─────────────────┐   │
│  │  Motor Tetris                       │   │
│  │  - Piezas, rotaciones              │   │
│  │  - Colisiones, líneas completadas  │   │
│  │  - Puntuación                      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─── js/handpose.js ──────────────────┐   │
│  │  Detección de Manos                 │   │
│  │  - MediaPipe Hands                  │   │
│  │  - Clasificación de gestos          │   │
│  │  - Emisión de eventos               │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─── js/interface.js ──────────────────┐  │
│  │  Interfaz de Usuario                │  │
│  │  - Pantallas (START, GAME, OVER)    │  │
│  │  - Escenarios (4 fondos)            │  │
│  │  - Indicadores (puntaje, siguiente) │  │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─── sketch.js ────────────────────────┐  │
│  │  Integración p5.js                  │  │
│  │  - Renderizado del tablero          │  │
│  │  - Mapeo de eventos a acciones      │  │
│  │  - Control de movimiento            │  │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📁 **ESTRUCTURA DEL PROYECTO**

```
tetris-con-interaccion/
├── index.html                 # Punto de entrada
├── sketch.js                  # Integración p5.js
├── style.css                  # Estilos
│
├── js/
│   ├── gamelogic.js          # Motor del juego
│   ├── interface.js          # UI y pantallas
│   └── handpose.js           # Detección de gestos
│
├── GESTURE_CONTROLS.md       # Documentación de gestos
├── TROUBLESHOOTING.md        # Solución de problemas
└── README_FINAL.md           # Este archivo
```

---

## 🔧 **CONFIGURACIÓN**

Todos los parámetros se encuentran en `handpose.js`, sección `CONFIG`:

```javascript
// Suavizado
SMOOTHING_ENABLED: true
SMOOTHING_METHOD: 'oneEuro'  // o 'ema'
ONE_EURO_MIN_CUTOFF: 0.7     // Más bajo = más fluido

// Detección
GESTURE_CONFIDENCE_MIN: 0.7
FINGER_EXTENDED_THRESHOLD: 0.05

// Desaparición de manos
HAND_DISAPPEARANCE_TOLERANCE_MS: 200

// Cooldowns
HOLD_COOLDOWN_MS: 1500
PAUSE_GESTURE_COOLDOWN_MS: 500
```

---

## 🧪 **DEBUG MODE**

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

## 📊 **EVENTOS EMITIDOS**

| Evento | Cuando | Datos |
|--------|--------|-------|
| `mover:columna` | Mano abierta se mueve | `{x: 0-1, columna: 0-15}` |
| `victoria:inicio` | Gesto victory comienza | `{mano: 'left'/'right'}` |
| `victoria:fin` | Gesto victory termina | `{}` |
| `gesto:confirmado` | Gesto instantáneo | `{gesto: 'ROCK'}` |
| `mano:detectada` | Aparece una mano | `{cantidad, lado, mano: 1/2, primera}` |
| `mano:perdida` | Desaparece una mano | `{cantidad, lado}` |

---

## 🎨 **CAMBIOS DESDE v1.0**

### ✂️ **Removido**
- ❌ Puntero (índice levantado solo)
- ❌ Clicks por pinch (pulgar-índice)
- ❌ Pausa por puño
- ❌ Reanudación por pulgar
- ❌ Rotaciones (no en esta versión)
- ❌ Menús de navegación interactivos

### ✨ **Nuevo**
- ✅ ROCK sign para cambiar fondo
- ✅ Dos manos para iniciar/reiniciar
- ✅ Pausa automática sin manos
- ✅ Reanudación automática con mano
- ✅ Suavizado One Euro Filter
- ✅ Detección multi-gesto mejorada

---

## 🚨 **ERRORES CONOCIDOS**

### AudioWorklet Duplicate
```
NotSupportedError: AudioWorkletGlobalScope.registerProcessor: 
Argument 1 is invalid: a class with the same name is already registered.
```
✅ **Resuelto** - Se quitó `p5.sound`: el audio usa `HTMLAudioElement` y ya no se registran AudioWorklets.

### WebGL Backend
```
webgl backend was already registered. Reusing existing backend factory.
The kernel 'XXX' for backend 'webgl' is already registered
```
✅ **Resuelto** - Se quitó el `<script>` duplicado de `tfjs-backend-webgl`; `@tensorflow/tfjs` ya incluye ese backend.

### AudioContext
```
Se ha impedido que un AudioContext se inicie automáticamente...
```
✅ **Ya no aplica** - No se crea ningún AudioContext. El audio nativo se habilita con el primer clic, toque o tecla; el permiso de cámara también puede habilitarlo.

Ver `TROUBLESHOOTING.md` para más detalles.

---

## 📈 **ESTADÍSTICAS DE LA REFACTORIZACIÓN**

| Métrica | Valor |
|---------|-------|
| Gestos implementados | 5 |
| Gestos removidos | 6+ |
| Archivos modificados | 4 |
| Líneas de código nuevas | +291 |
| Líneas de código removidas | -47 |
| Documentación añadida | +643 líneas |
| Commits realizados | 6 |

---

## 🎯 **TEST CHECKLIST**

- ✅ Cámara se abre sin errores
- ✅ Modelo de manos carga en < 5s
- ✅ Mano abierta mueve pieza suavemente
- ✅ Victory sign acelera caída
- ✅ Rock sign cicla 4 fondos
- ✅ Dos manos inician partida
- ✅ Sin manos pausa el juego
- ✅ Mano reaparece reanuda juego
- ✅ Audio tema se activa con gestos
- ✅ Sin errores críticos en consola

---

## 🔮 **FUTURAS MEJORAS**

- [ ] Predicción de movimiento (ML smoothing)
- [ ] Más gestos (giros, dos dedos, etc.)
- [ ] Feedback visual en pantalla (círculos de detección)
- [ ] Configuración dinámica de umbrales
- [ ] Estadísticas en tiempo real
- [ ] Multiplayer (dos jugadores, manos diferentes)
- [ ] Modo accesibilidad (controles alternativos)
- [ ] Soporte para otros detectores (pose, face)

---

## 📞 **SOPORTE**

### Si tienes problemas:
1. Consulta `TROUBLESHOOTING.md`
2. Activa debug mode (?debug)
3. Verifica logs en consola (F12)
4. Intenta en otro navegador

### Si encuentras bugs:
1. Describe el problema exacto
2. Incluye logs de consola
3. Especifica navegador y SO
4. Sube un video si es posible

---

## 📄 **LICENCIA**

Este proyecto es de código abierto. Libre para usar, modificar y distribuir.

---

## 👨‍💻 **DESARROLLO**

**Última versión:** 2.0  
**Fecha:** 2026-11-13  
**Motor de detección:** MediaPipe Hands + TensorFlow.js  
**Renderizado:** p5.js  
**Navegadores:** Chrome, Firefox, Edge, Safari  

---

## 🙏 **CRÉDITOS**

- **MediaPipe** - Detección de manos
- **TensorFlow.js** - Inferencia en navegador
- **p5.js** - Renderizado y audio
- **One Euro Filter** - Suavizado de movimiento

---

**¡Disfruta del Tetris con gestos! 🎮✋**

Para documentación detallada, ver:
- `GESTURE_CONTROLS.md` - Guía completa de gestos
- `TROUBLESHOOTING.md` - Solución de problemas
