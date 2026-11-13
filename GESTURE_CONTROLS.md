# Gesture Controls - Tetris con Interacción v2

## Overview

El juego ahora se controla exclusivamente mediante **5 gestos primarios** detectados por la cámara web usando MediaPipe Hands.

---

## Gestos Implementados

### 1. 🖐️ **Mano Abierta** - Desplazamiento Horizontal

**Detección:** Índice, medio, anular y meñique extendidos (el pulgar no se exige)

**Comportamiento:**
- La posición horizontal de la palma (X) se mapea directamente a una columna (0-15)
- El desplazamiento es **absoluto**: la pieza se mueve hacia donde está la mano
- Proporcional: borde izquierdo de cámara = columna 0; borde derecho = columna 15

**Evento:** `mover:columna { x: 0-1, columna: 0-15, timestamp }`

**Notas:**
- Funciona solo durante el juego activo
- La cámara está espejada; sketch.js invierte las coordenadas

---

### 2. ✌️ **Victory Sign** - Caída Acelerada

**Detección:** Índice y medio levantados, anular y meñique doblados

**Comportamiento:**
- Mantener el gesto acelera la caída de la pieza
- La aceleración sigue mientras el gesto esté detectado: no depende de un evento de inicio
- Al cambiar de gesto (o al pausarse la partida) la velocidad vuelve a la normal
- Solo funciona durante una partida activa

**Eventos:** 
- `victoria:inicio { mano, timestamp }` (transición)
- `victoria:fin { timestamp }` (transición)

**Notas:**
- `sketch.js` lee el gesto actual en cada frame; los eventos quedan como aviso de transición
- El pulgar se ignora (puede estar en cualquier posición)
- La mano abierta se reconoce con los cuatro dedos largos (el pulgar no se exige)
- El filtro One Euro está configurado para responder en ~130 ms, así el gesto arranca y corta a tiempo

---

### 3. 👍 **Pulgar Arriba** - Rotar Pieza

**Detección:** Pulgar levantado y los otros cuatro dedos doblados

**Comportamiento:**
- Cada confirmación gira la pieza 90° en sentido horario
- Solo funciona durante una partida activa
- El gesto se confirma como instantáneo con 300ms de cooldown (no hace falta sostenerlo)

**Evento:** `gesto:confirmado { gesto: 'PULGAR_ARRIBA', manoDuena, timestamp }`

**Notas:**
- `sketch.js` lo traduce a `motor.rotar()`; el wall-kick del motor resuelve los choques laterales
- No hay gesto para rotar en antihorario

---

### 4. 👐👐 **Dos Manos** - Iniciar / Reiniciar

**Detección:** Dos manos visibles al mismo tiempo

**Comportamiento:**
- En pantalla de espera (solo el escenario visible): inicia la partida
- En pantalla GAME OVER: reinicia la partida
- Durante el juego: la partida sigue normalmente (no pausa)

**Evento:** `mano:detectada { cantidad: 2, lado, mano, primera, timestamp }`

**Notas:**
- No hay evento aparte para dos manos: la cantidad visible viaja en
  `mano:detectada` / `mano:perdida`
- `mano` es el ordinal de aparición (1 = primera detectada, 2 = segunda)

---

### 5. 🤘 **Rock Sign** - Ciclar Fondos

**Detección:** Índice, meñique y pulgar levantados; medio y anular doblados

**Comportamiento:**
- Cada gesto cambia al siguiente fondo disponible
- Cicla en orden: Catedral → Puente Roto → Santa Ana → Tranvía → (repeat)
- Disponible en cualquier momento

**Evento:** `gesto:confirmado { gesto: 'ROCK', manoDuena, timestamp }`

**Notas:**
- Cooldown interno: 300ms para evitar spam
- Solo se activa en flanco de subida (gesto nuevamente después de relajarse)

---

### 6. 🖐️ **Sin Manos** - Pausa Automática

**Detección:** Ninguna mano visible en la cámara

**Comportamiento:**
- Pausa la partida automáticamente
- Cuando reaparece una mano, reanuda desde donde se pausó
- Solo funciona durante una partida activa

**Eventos:**
- `mano:perdida { cantidad: 0, lado, timestamp }` → Pausa si estaba jugando
- `mano:detectada { cantidad, lado, mano, primera, timestamp }` → Reanuda si está pausado

**Notas:**
- Solo se pausa con CERO manos: si desaparece una de las dos, el juego sigue
- Tolerancia de desaparición: 200ms (evita falsas pausas por parpadeos)
- Mantiene el estado del juego intacto

---

## Flujo de Eventos

### Inicio de Partida

```
Escenario de Tetris (sin partida)
    ↓
Usuario muestra DOS MANOS
    ↓
Evento: mano:detectada { cantidad: 2 }
    ↓
sketch.js: Tetris.accionSegunManos('ready', 2) => 'iniciar'
    ↓
Pantalla GAME, partida inicia
```

### Juego Activo

```
JUEGO ACTIVO + CERO MANOS
    ↓
Evento: mano:perdida { cantidad: 0 }
    ↓
sketch.js: Tetris.accionSegunManos('game', 0) => 'pausar'
    ↓
Pantalla PAUSA (solo el texto)

PANTALLA PAUSA + UNA MANO REAPARECE
    ↓
Evento: mano:detectada { cantidad: 1 }
    ↓
sketch.js: Tetris.accionSegunManos('paused', 1) => 'reanudar'
    ↓
Pantalla GAME (reanuda sola)
```

### Cambio de Fondo

```
Gesto ROCK detectado y confirmado
    ↓
Evento: gesto:confirmado {gesto: 'ROCK'}
    ↓
sketch.js: backgroundIndex++
    ↓
ui.setScenario(BACKGROUNDS[backgroundIndex])
    ↓
Fondo cambia (disponible en cualquier pantalla)
```

---

## Configuración (handpose.js)

### Umbrales de Detección

```javascript
CONFIG = {
  // Suavizado
  SMOOTHING_ENABLED: true
  SMOOTHING_METHOD: 'oneEuro'  // 'ema' o 'oneEuro'
  ONE_EURO_MIN_CUTOFF: 4.0     // Más alto = menos retardo (pose más reactiva)
  ONE_EURO_BETA: 0.3           // Respuesta extra con movimiento rápido
  DEADZONE_THRESHOLD: 0.002    // Movimiento mínimo ignorado
  
  // Desaparición de manos
  HAND_DISAPPEARANCE_TOLERANCE_MS: 200  // Tolerancia antes de "mano:perdida"
  
  // Gestos
  GESTURE_CONFIDENCE_MIN: 0.7
  GESTURE_ENABLED: true
  FINGER_EXTENDED_THRESHOLD: 0.05  // Distancia mínima punta-articulación
  HAND_MOVEMENT_THRESHOLD: 0.006   // Cambio mínimo X entre frames
  
  // Cooldowns
  HOLD_COOLDOWN_MS: 1500  // Cooldown entre gestos con sostenimiento
  PAUSE_GESTURE_COOLDOWN_MS: 500  // Cooldown antigesto de pausa
  
  // Gestos instantáneos (sin hold); cada uno tiene su propio cooldown de 300 ms
  GESTURES_INSTANT: ['ROCK', 'PULGAR_ARRIBA']
  
  // Gestos continuos
  GESTURES_CONTINUOUS: ['MANO_ABIERTA_IZQUIERDA', 'MANO_ABIERTA_DERECHA', 'VICTORIA']
  
  // Control de movimiento
  MOVEMENT_CONTROL_ENABLED: true
  MOVEMENT_COLUMNS: 16
  MOVEMENT_EDGE_MARGIN: 0.1  // Margen de calibración
  MOVEMENT_JITTER_THRESHOLD: 0.01
}
```

### Prioridad y cruces de gestos

- Con dos manos, los gestos discretos (VICTORIA, ROCK, PULGAR_ARRIBA) funcionan
  con cualquiera de las dos; la mano principal solo define el control horizontal.
- Un puño de descanso en la otra mano no bloquea el movimiento.
- Cada gesto instantáneo tiene su propio cooldown de 300 ms: ROCK y
  PULGAR_ARRIBA pueden usarse seguidos sin bloquearse.
- Mientras ROCK siga detectado avanza un escenario cada 300 ms; al cambiar de
  gesto se detiene. Un destello corto cambia un solo escenario.

---

## Debugging

### Activar Debug Visual

Abre la URL con parámetro `?debug`:

```
http://localhost:8000/?debug
```

Esto dibujará:
- Puntos clave de las manos (21 landmarks)
- Esqueleto del movimiento
- Centro de palma
- Logs en consola de cada gesto detectado

### Consola

Observa los logs para:
- `✅ Cámara activa`
- `✅ Modelo hand-pose-detection cargado`
- `🎯 Gesto: ROCK (Dueña: left)`
- `👐 DOS MANOS: iniciar/reiniciar`
- `🤘 ROCK: acción por transición`
- `🎨 Fondo cambiado a: catedral`

---

## Gestos Removidos

❌ **Puntero** (índice levantado solo) - No más cursor de mano  
❌ **Clicks** (pulgar-índice pinch) - No más clics por pinch  
❌ **Pausa por puño** - Reemplazado por "sin manos"  
❌ **Reanudación por pulgar** - Reemplazado por reaparición de mano  
❌ **Rotaciones** (pulgar en partida) - No implementadas  

---

## Testing Checklist

- [ ] Mano abierta mueve la pieza horizontalmente suavemente
- [ ] Victory sign acelera la caída correctamente
- [ ] Dos manos inician partida desde START
- [ ] Dos manos reinician desde GAME OVER
- [ ] Rock sign cicla los 4 fondos
- [ ] Sin manos pausa la partida
- [ ] Reaparición de mano reanuda
- [ ] Todos los gestos no interfieren entre sí
- [ ] Debug mode muestra esqueleto correcto
- [ ] No hay falsos positivos por parpadeos del detector
- [ ] Cambio de fondo no interrumpe el juego

---

## Notas Técnicas

### Coordinadas

- **Cámara:** Espejada por default (driver o "Mirror my camera")
- **Handpose.js:** Coordenadas de cámara (X=0 izquierda, X=1 derecha)
- **sketch.js:** Invierte X antes de mapear a columnas (`espejoX = 1 - x`)

### Eventos Internos (no consumidos externamente)

- `gesto:detectado`
- `gesto:perdido`
- `gesto:ignorado`
- `gesto:progreso`
- `mano:detectada`
- `mano:perdida`
- `modo:cambiado`

### Ciclo de Detección

1. Captura video de la cámara (p5.js)
2. MediaPipe Hands detecta 21 landmarks por mano
3. Suavizado (One Euro Filter o EMA)
4. Clasificación de gesto (detectGesture)
5. Emit de eventos (CustomEvent)
6. sketch.js escucha y ejecuta acciones
7. Motor Tetris actualiza estado
8. p5.js dibuja en el canvas

---

## Futuras Mejoras

- [ ] Configuración de umbrales en tiempo real via UI
- [ ] Calibración de cámara (zoom, orientación)
- [ ] Predicción de movimiento para suavidad
- [ ] Soporte para más gestos (rotaciones, giros)
- [ ] Feedback visual en pantalla (círculos/barras de progreso)
- [ ] Estadísticas de desempeño del detector

---

**Versión:** 2.0  
**Fecha:** 2026-11-13  
**Motor de Detección:** MediaPipe Hands + TensorFlow.js  
**Gestos Activos:** 5 (Mano abierta, Victoria, Pulgar arriba, Rock, Sin manos) + regla de dos manos
