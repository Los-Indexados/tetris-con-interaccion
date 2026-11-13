# Gesture Controls - Tetris con Interacción v2

## Overview

El juego ahora se controla exclusivamente mediante **5 gestos primarios** detectados por la cámara web usando MediaPipe Hands.

---

## Gestos Implementados

### 1. 🖐️ **Mano Abierta** - Desplazamiento Horizontal

**Detección:** 5 dedos extendidos

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
- Solo funciona durante una partida activa
- Al soltar el gesto, la velocidad vuelve a la normal

**Eventos:** 
- `victoria:inicio { mano, timestamp }`
- `victoria:fin { timestamp }`

**Notas:**
- El pulgar se ignora (puede estar en cualquier posición)
- Cooldown interno de 300ms para evitar parpadeos del detector

---

### 3. 👐👐 **Dos Manos** - Iniciar / Reiniciar

**Detección:** Ambas manos visibles en la cámara

**Comportamiento:**
- En pantalla START: Inicia una nueva partida
- En pantalla GAME OVER: Reinicia la partida
- En pantalla de juego: Sin efecto

**Evento:** `dos:manos { cantidad: 2, timestamp }`

**Notas:**
- Se emite una sola vez cuando pasan de 1 a 2 manos

---

### 4. 🤘 **Rock Sign** - Ciclar Fondos

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

### 5. 🖐️ **Sin Manos** - Pausa Automática

**Detección:** Ninguna mano visible en la cámara

**Comportamiento:**
- Pausa la partida automáticamente
- Cuando reaparece una mano, reanuda desde donde se pausó
- Solo funciona durante una partida activa

**Eventos:**
- `mano:perdida { timestamp }` → Pausa si está jugando
- `mano:detectada { cantidad, timestamp }` → Reanuda si está pausado

**Notas:**
- Tolerancia de desaparición: 200ms (evita falsas pausas por parpadeos)
- Mantiene el estado del juego intacto

---

## Flujo de Eventos

### Inicio de Partida

```
Pantalla START
    ↓
Usuario muestra DOS MANOS
    ↓
Evento: dos:manos
    ↓
sketch.js: ui.trigger('start')
    ↓
Pantalla GAME, partida inicia
```

### Juego Activo

```
JUEGO ACTIVO + SIN MANOS
    ↓
Evento: mano:perdida
    ↓
sketch.js: ui.trigger('pause')
    ↓
Pantalla PAUSED

PANTALLA PAUSED + MANO REAPARECE
    ↓
Evento: mano:detectada
    ↓
sketch.js: ui.trigger('resume')
    ↓
Pantalla GAME (reanuda)
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
  ONE_EURO_MIN_CUTOFF: 0.7     // Más bajo = más fluido
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
  
  // Gestos instantáneos (sin hold)
  GESTURES_INSTANT: ['ROCK']
  
  // Gestos continuos
  GESTURES_CONTINUOUS: ['MANO_ABIERTA_IZQUIERDA', 'MANO_ABIERTA_DERECHA', 'VICTORIA']
  
  // Control de movimiento
  MOVEMENT_CONTROL_ENABLED: true
  MOVEMENT_COLUMNS: 16
  MOVEMENT_EDGE_MARGIN: 0.1  // Margen de calibración
  MOVEMENT_JITTER_THRESHOLD: 0.01
}
```

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
**Gestos Activos:** 5 (Mano abierta, Victory, Dos manos, Rock, Sin manos)
