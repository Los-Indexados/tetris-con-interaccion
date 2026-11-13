# Troubleshooting - Tetris con Interacción

## Errores Comunes y Soluciones

---

### ❌ **AudioWorklet: "a class with the same name is already registered"**

**Síntoma:**
```
NotSupportedError: AudioWorkletGlobalScope.registerProcessor: 
Argument 1 is invalid: a class with the same name is already registered.
```

**Causa:** p5.sound intenta registrar un AudioWorklet múltiples veces (caché del navegador)

**Solución:** ✅ **RESUELTO**
- Se quitó `p5.sound` del proyecto: el audio usa `HTMLAudioElement`
- Sin AudioContext ni AudioWorklets, este error ya no aparece

**Acción requerida:** Ninguna.

---

### ❌ **Reproducción de audio bloqueada**

**Síntoma:**
```
Se ha impedido que un AudioContext se inicie automáticamente. 
Debe crearse o reanudarse después de un gesto del usuario en la página.
```

**Causa:** Política de seguridad de navegadores modernos (evita auto-play de audio)

**Solución:** ✅ **NORMAL Y ESPERADO**
- El audio nativo puede quedar bloqueado hasta que el navegador lo permita
- El juego sigue funcionando en silencio, sin errores en consola
- La música se reintenta al iniciar o reanudar la partida

**Acción requerida:** Ninguna.

---

### ✅ **WebGL backend: "already registered" (resuelto)**

**Síntoma:**
```
webgl backend was already registered. Reusing existing backend factory. 
tfjs@4.11.0:17:183884
The kernel '_FusedMatMul' for backend 'webgl' is already registered
The kernel 'Abs' for backend 'webgl' is already registered
... (cientos de kernels)
```

**Causa:** Se cargaba `@tensorflow/tfjs` y además `@tensorflow/tfjs-backend-webgl`; el paquete `tfjs` ya incluye ese backend.

**Solución:** ✅ **RESUELTO**
- Se quitó el `<script>` duplicado de `tfjs-backend-webgl` de `index.html`
- La detección de manos sigue usando el backend WebGL incluido en `tfjs`

**Acción requerida:** Ninguna.

---

### ❌ **Error en el mapeo fuente (Source Map)**

**Síntoma:**
```
Error en el mapeo fuente: Error: request failed with status 404
Stack in the worker: networkRequest...
URL del recurso: https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0
URL del mapa fuente: tf.min.js.map
```

**Causa:** CDN no sirve source maps (solo dev tools)

**Solución:** ✅ **IGNORAR - ES SOLO DEV TOOLS**
- No afecta el funcionamiento
- Solo se ve en la consola del navegador
- El código ejecuta normalmente

**Acción requerida:** Ninguna.

---

### ❌ **"El uso del sensor de orientación está obsoleto"**

**Síntoma:**
```
El uso del sensor de orientación está obsoleto. p5.min.js:2:467567
El uso del sensor de moviento está obsoleto. p5.min.js:2:467567
```

**Causa:** p5.js usa APIs antiguas para acelerómetro

**Solución:** ✅ **IGNORAR - NO AFECTA EL JUEGO**
- Esto es de p5.js, no de nuestro código
- No interfiere con la detección de manos
- El juego funciona normalmente en desktop

**Acción requerida:** Ninguna.

---

### ❌ **Cámara no se abre / "Permission denied"**

**Síntoma:**
```
❌ Error de cámara: NotAllowedError: Permission denied by system
```

**Causa:** Navegador o SO rechaza acceso a la cámara

**Soluciones:**
1. ✅ Verifica que diste permiso de cámara al navegador
2. ✅ Recarga la página (`F5`)
3. ✅ Cierra otras pestañas que usen la cámara
4. ✅ Comprueba que tu cámara funcione (prueba con otra app)
5. ✅ En Linux, asegúrate que `udev` esté configurado
6. ✅ En Windows, verifica permisos en Configuración > Privacidad > Cámara

**Si persiste:** El juego seguirá funcionando sin cámara (pero sin gestos)

---

### ❌ **Gestos no se detectan / "Manos no detectadas"**

**Síntoma:**
```
🖐️ Predicciones de hand-pose-detection: 0 manos detectadas
```

**Causa:** Las manos no están visibles o se detectan mal

**Soluciones:**
1. ✅ Acércate más a la cámara
2. ✅ Mejora la iluminación (las manos deben estar bien iluminadas)
3. ✅ Evita fondos con las mismas líneas que las manos
4. ✅ Mueve las manos más lentamente (el detector es sensible a movimientos)
5. ✅ Activa debug mode: `?debug` en la URL para ver los landmarks
6. ✅ Ajusta umbrales en `handpose.js` si es necesario

**Debug:**
```
http://localhost:8000/?debug
```

Esto mostrará los 21 puntos de las manos en tiempo real.

---

### ❌ **Las manos se detectan pero los gestos no funcionan**

**Síntoma:**
```
✅ Cámara activa
✅ Modelo cargado
🖐️ Predicciones: 2 manos detectadas
❌ Pero el juego no responde a gestos
```

**Causa:** Los gestos se detectan pero no se emiten eventos

**Soluciones:**
1. ✅ Verifica que estés en la pantalla GAME (no menú)
2. ✅ Activa `?debug` para ver qué gesto se detecta
3. ✅ Comprueba que `sketch.js` está escuchando los eventos
4. ✅ Abre DevTools (F12) y mira la consola
5. ✅ Verifica que `handpose.js` esté cargado: `window.HandPose` debe existir

**Debug:**
```javascript
// En la consola del navegador:
console.log(window.HandPose);  // Debe mostrar el objeto del módulo
console.log(window.HandPose.getState());  // Estado actual
window.HandPose.setDebug(true);  // Activar debug a mano
```

---

### ❌ **El fondo no cambia con ROCK**

**Síntoma:**
```
🤘 ROCK: acción por transición
Pero el fondo sigue igual
```

**Causa:** 
- El gesto se detecta pero `ui.setScenario()` falla
- El fondo está mal cacheado

**Soluciones:**
1. ✅ Recarga la página (`Ctrl+F5` fuerza sin caché)
2. ✅ Verifica que los 4 fondos estén en `/` como `.png`
3. ✅ Comprueba que `BACKGROUNDS` en `sketch.js` coincida con IDs reales
4. ✅ Activa debug: `console.log()` en el evento de ROCK
5. ✅ Abre DevTools y verifica que `ui.setScenario()` existe

**Debug:**
```javascript
// En la consola:
window.TetrisUI.setScenario('puente-roto');  // Cambiar manualmente
window.TetrisUI.getScenario();  // Ver fondo actual
```

---

### ❌ **El juego se congela / "jank" / movimientos entrecortados**

**Síntoma:**
```
La pieza se mueve a saltos en lugar de suavemente
```

**Causa:**
- FPS bajo (muchos procesos en background)
- Detección de manos muy pesada
- Canvas muy grande

**Soluciones:**
1. ✅ Cierra otras pestañas/aplicaciones
2. ✅ Reduce la resolución de la cámara en `handpose.js` (línea 93-94)
3. ✅ Desactiva debug mode
4. ✅ Ajusta parámetros de suavizado: 
   - `SMOOTHING_ENABLED: false` para más responsividad
   - `ONE_EURO_MIN_CUTOFF: 1.0` para menos suavizado
5. ✅ En navegadores Chromium, activa Hardware Acceleration en configuración

**Medir FPS:**
```javascript
// En la consola:
console.log('FPS detección:', window.HandPose.getState().detection.detectionFps);
```

---

### ❌ **Pantalla negra / Canvas no renderiza**

**Síntoma:**
```
El juego inicia pero no se ve nada (pantalla negra)
```

**Causa:**
- p5.js canvas no se monta correctamente
- Contenedor `#tui-app` no existe o está oculto

**Soluciones:**
1. ✅ Verifica que exista `<main id="tetris-app"></main>` en HTML
2. ✅ Comprueba que el CSS no oculte el elemento
3. ✅ Recarga la página
4. ✅ Abre DevTools (F12) y ejecuta:
   ```javascript
   document.getElementById('tetris-app');  // Debe mostrar el elemento
   document.querySelector('[data-tui-board]');  // Debe mostrar el board
   ```

---

### ❌ **"Cannot read property 'estaActivo' of null"**

**Síntoma:**
```
TypeError: Cannot read property 'estaActivo' of null
```

**Causa:** El motor del juego no está inicializado

**Soluciones:**
1. ✅ Verifica que `sketch.js` ejecutó `window.setup()`
2. ✅ Comprueba que `gamelogic.js` está cargado antes
3. ✅ Recarga la página
4. ✅ En consola: `console.log(window.juego)` debe mostrar el motor

---

## 🧪 Verificación Rápida

Ejecuta esto en la consola para diagnosticar problemas:

```javascript
// Verificar cargas básicas
console.log('✅ p5:', typeof p5 !== 'undefined');
console.log('✅ TetrisUI:', typeof window.TetrisUI !== 'undefined');
console.log('✅ HandPose:', typeof window.HandPose !== 'undefined');
console.log('✅ Tetris (motor):', typeof window.Tetris !== 'undefined');
console.log('✅ Juego (instancia):', window.juego !== undefined);

// Estado de detección
console.log('🎥 Cámara activa:', window.HandPose.getState().camera.isActive);
console.log('🤖 Modelo cargado:', window.HandPose.getState().detection.isModelReady);
console.log('👐 Manos detectadas:', window.HandPose.getState().detection.handsDetected);

// Estado del juego
console.log('🎮 Pantalla:', window.TetrisUI.getScreen());
console.log('🎨 Fondo:', window.TetrisUI.getScenario());
console.log('🏃 Juego activo:', window.juego.estaActivo());
console.log('⏸️  Pausado:', window.juego.pausado);

// Simular gestos (para testing)
document.dispatchEvent(new CustomEvent('dos:manos', {detail: {cantidad: 2}}));
document.dispatchEvent(new CustomEvent('gesto:confirmado', {detail: {gesto: 'ROCK'}}));
```

---

## 📱 Navegadores Soportados

| Navegador | Soporte | Notas |
|-----------|---------|-------|
| Chrome/Chromium | ✅ Full | Mejor soporte, WebGL rápido |
| Firefox | ✅ Full | Buen soporte, un poco más lento |
| Safari (Mac) | ⚠️ Parcial | Cámara funciona pero lento |
| Safari (iOS) | ❌ No | Restricciones de permisos |
| Edge | ✅ Full | Idéntico a Chrome |
| Opera | ✅ Full | Idéntico a Chrome |

---

## 🆘 Si Nada Funciona

1. ✅ Recarga la página: `Ctrl+F5` (fuerza sin caché)
2. ✅ Cierra todas las pestañas del juego (evita conflictos)
3. ✅ Reinicia el navegador completamente
4. ✅ Limpia caché: DevTools > Application > Clear storage
5. ✅ Abre DevTools (F12) y mira la consola para errores reales
6. ✅ Si hay errores, cópialos y reporta en Issues

---

## 📊 Checklist de Testing

- [ ] Cámara se abre sin errores
- [ ] Modelo de manos carga en < 5 segundos
- [ ] Manos se detectan (ves los logs `👐 Predicciones: X manos`)
- [ ] MANO ABIERTA mueve pieza suavemente
- [ ] ROCK cambia fondo correctamente
- [ ] VICTORY acelera la caída
- [ ] DOS MANOS inician partida
- [ ] SIN MANOS pausa el juego
- [ ] Audio tema inicia después del primer gesto
- [ ] No hay errores críticos en la consola
- [ ] FPS de detección >= 20 (ideal >= 30)

---

**Última actualización:** 2026-11-13  
**Versión:** 2.0  
**Navegadores testeados:** Chrome 119, Firefox 121, Safari 17
