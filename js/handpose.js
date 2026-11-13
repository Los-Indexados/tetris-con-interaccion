// ============================================================================
// TETRIS BODY - MÓDULO DE DETECCIÓN DE MANOS Y GESTOS
// ============================================================================

// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================
const CONFIG = {
  DEBUG: false, // Cambiar a true para ver esqueleto y puntos de las manos
  
  // Configuración de suavizado
  SMOOTHING_ENABLED: true, // Activar/desactivar suavizado
  SMOOTHING_METHOD: 'oneEuro', // 'ema' o 'oneEuro'
  
  // Parámetros EMA (Media Móvil Exponencial)
  EMA_ALPHA: 0.5, // Factor de suavizado (0-1, más alto = menos suavizado)
  
  // Parámetros One Euro
  ONE_EURO_MIN_CUTOFF: 4.0, // Frecuencia de corte mínima (Hz) - más alto = menos retardo
  ONE_EURO_BETA: 0.3, // Parámetro de amortiguación de derivada - más alto = más rápido
  
  // Zona muerta (deadzone)
  DEADZONE_THRESHOLD: 0.002, // Umbral de variación mínima (normalizado 0-1) - más bajo = más sensible
  
  // Tolerancia de desaparición de mano
  HAND_DISAPPEARANCE_TOLERANCE_MS: 200, // Milisegundos para tolerancia
  
  // Configuración de gestos
  GESTURE_CONFIDENCE_MIN: 0.7, // Confianza mínima para detectar gesto
  GESTURE_ENABLED: true, // Activar/desactivar detección de gestos
  
  // Umbrales para detección de dedos extendidos
  FINGER_EXTENDED_THRESHOLD: 0.05, // Distancia mínima entre punta y articulación media
  
  // Umbrales de movimiento
  HAND_MOVEMENT_THRESHOLD: 0.006, // Cambio mínimo de X entre frames para marcar la dirección del gesto

  // Umbral para el clic del puntero: distancia máxima entre pulgar e índice.
  THUMB_INDEX_PINCH_THRESHOLD: 0.04,

  // Un pulgar levantado debe quedar lejos de las articulaciones de los otros
  // dedos; si está envuelto en el puño, queda cerca y gana la pausa.
  THUMB_FINGER_PROXIMITY_THRESHOLD: 0.06,

  // Configuración de sostenimiento (hold)
  HOLD_ENABLED: true, // Activar sostenimiento
  HOLD_DURATION_MS: {},
  HOLD_TOLERANCE_MS: 150, // Tolerancia de fallo momentáneo del detector
  HOLD_COOLDOWN_MS: 1500, // Cooldown después de confirmar

  // Gestos con sostenimiento (requieren hold + barra de progreso)
  GESTURES_WITH_HOLD: [],

  PAUSE_GESTURE_COOLDOWN_MS: 500, // Evita dobles toggles por parpadeo del detector

  // Gestos instantáneos (sin hold, solo cooldown corto)
  GESTURES_INSTANT: ['ROCK', 'PULGAR_ARRIBA'],

  // Gestos continuos (sin hold, se activan mientras duren)
  GESTURES_CONTINUOUS: ['MANO_ABIERTA_IZQUIERDA', 'MANO_ABIERTA_DERECHA', 'VICTORIA'],

  // Control horizontal absoluto con mano abierta.
  // La posición de la palma se mapea al ancho completo de la cuadrícula:
  // el borde izquierdo/derecho de la cámara satura en la columna 0/15.
  MOVEMENT_CONTROL_ENABLED: true,
  MOVEMENT_COLUMNS: 16, // Número de columnas (ancho del tablero)
  MOVEMENT_EDGE_MARGIN: 0.1, // Margen de calibración; fuera de él el objetivo satura en 0/15
  MOVEMENT_JITTER_THRESHOLD: 0.01, // Movimiento mínimo para recalcular el objetivo (~6 px a 640)
  MOVEMENT_MAX_STEPS_PER_EVENT: 4, // Tope para consumidores que usan deltas (compatibilidad)
  MOVEMENT_MODE_INITIAL: 'menu', // Modo inicial: 'menu' o 'juego'
};

// ============================================================================
// SECCIÓN: CÁMARA
// ============================================================================
// Gestiona el acceso a la cámara web, captura de video y manejo de errores.
// Usa p5.js para crear el canvas dentro del contenedor.

const HandPose = (() => {
  // Estado privado del módulo
  const state = {
    camera: {
      video: null,
      canvas: null,
      isActive: false,
      error: null,
      width: 640,
      height: 480,
      fps: 30,
    },
    detection: {
      model: null,
      isModelReady: false,
      hands: [],
      detectionFps: 0,
      frameCount: 0,
      lastFpsTime: Date.now(),
      maxHands: 2,
      trackedHandIds: [], // IDs de las manos siendo rastreadas
      handOrder: [], // Lados ('left'/'right') en orden de aparición: 1ª y 2ª mano
    },
    hands: [],
    gestures: {
      current: null, // Gesto actual detectado
      owner: null, // Mano dueña del gesto ("left" o "right")
      ignored: null, // Mano ignorada por conflicto
      lastUpdate: 0, // Timestamp del último gesto
    },
    hold: {
      active: false, // Si hay un hold en curso
      gesture: null, // Qué gesto se está sosteniendo
      owner: null, // Mano dueña del hold
      startTime: 0, // Cuándo empezó
      progress: 0, // 0-1
      confirmed: false, // Si ya se confirmó
      lastDetectedTime: 0, // Última vez que se detectó el gesto (tolerancia)
      cooldownUntil: 0, // Cooldown hasta este timestamp (gestos con hold)
      instantCooldowns: Object.create(null), // Cooldown independiente por gesto instantáneo
    },
    ui: {
      mode: CONFIG.MOVEMENT_MODE_INITIAL, // 'menu' o 'juego'
      cursorVisible: false, // Si cursor está visible
      cursorX: 0, // Posición X normalizada (0-1)
      cursorY: 0, // Posición Y normalizada (0-1)
      lastConfirmedGesture: null, // Último gesto confirmado
    },
    movement: {
      currentColumn: Math.floor(CONFIG.MOVEMENT_COLUMNS / 2), // Último objetivo (0-15), para debug/estado
      controlHand: null, // Mano que controla el movimiento
      targetColumn: Math.floor(CONFIG.MOVEMENT_COLUMNS / 2), // Objetivo absoluto en coordenadas de cámara
      lastTargetRawX: null, // Última X cruda usada para recalcular el objetivo
    },
  };

  // Callbacks para comunicación con el resto del equipo
  const callbacks = {
    onCameraError: null,
    onCameraActive: null,
    onHandsUpdate: null,
    onGestureDetected: null,
    onGestureConfirmed: null,
  };

  // =========================================================================
  // INICIALIZACIÓN DE p5.js
  // =========================================================================
  let p5Instance = null;

  function setupP5() {
    const sketch = (p) => {
      p.setup = function () {
        // Crear canvas con dimensiones de la cámara
        const canvas = p.createCanvas(state.camera.width, state.camera.height);
        
        // Insertar canvas dentro del contenedor camera-container
        canvas.parent('camera-container');

        // Inicializar cámara después de que p5 esté listo
        initCamera(p);
      };

      p.draw = function () {
        // Dibujar video en el canvas
        if (state.camera.video && state.camera.isActive) {
          p.image(state.camera.video, 0, 0, state.camera.width, state.camera.height);

          // Dibujar DEBUG si está activado
          drawDebugHands(p);
        }
      };

      // Guardar referencia a p5 para usar después
      p5Instance = p;
    };

    // Crear instancia de p5
    new p5(sketch);
  }

  // =========================================================================
  // INICIALIZACIÓN DE LA CÁMARA
  // =========================================================================
  function initCamera(p) {
    try {
      // Solicitar acceso a la cámara web con resolución específica
      state.camera.video = p.createCapture(
        {
          video: {
            width: { ideal: state.camera.width },
            height: { ideal: state.camera.height },
          },
          audio: false,
        },
        onCameraReady
      );

      // Ocultar el elemento video de p5 (ya se dibuja en el canvas)
      state.camera.video.hide();

      // Guardar referencia al canvas
      state.camera.canvas = p.canvas;
    } catch (error) {
      handleCameraError('Error al acceder a la cámara: ' + error.message);
    }
  }

  // =========================================================================
  // MANEJO DE CALLBACKS DE CÁMARA
  // =========================================================================
  function onCameraReady() {
    state.camera.isActive = true;
    state.camera.error = null;

    console.log(
      '✅ Cámara activa - Resolución: ' +
        state.camera.width +
        'x' +
        state.camera.height
    );

    // Iniciar detección de manos una vez que la cámara esté lista
    setTimeout(() => {
      initHandDetection();
    }, 500);

    // Emitir evento de cámara lista
    if (callbacks.onCameraActive) {
      callbacks.onCameraActive({
        isActive: true,
        width: state.camera.width,
        height: state.camera.height,
      });
    }
  }

  function handleCameraError(errorMessage) {
    state.camera.isActive = false;
    state.camera.error = errorMessage;

    console.error('❌ Error de cámara: ' + errorMessage);

    // Emitir evento de error
    if (callbacks.onCameraError) {
      callbacks.onCameraError({
        error: errorMessage,
        isActive: false,
      });
    }
  }

  // =========================================================================
  // SECCIÓN: DETECCIÓN DE MANOS
  // =========================================================================
  // Carga el modelo handPose de ml5.js y detecta manos en tiempo real.
  // Limita a 2 manos máximo, normaliza coordenadas (0-1) e incluye centro de palma.

  let modelLoadRetries = 0;
  const MAX_MODEL_LOAD_RETRIES = 3;

  let waitCount = 0;
  async function initHandDetection() {
    // Esperar a que TensorFlow.js y hand-pose-detection estén disponibles
    if (typeof tf === 'undefined' || typeof handPoseDetection === 'undefined') {
      waitCount++;
      if (waitCount % 4 === 0) { // Log cada 2 segundos
        console.log('⏳ Esperando TensorFlow.js y hand-pose-detection... (' + (waitCount / 2) + 's)');
      }
      setTimeout(initHandDetection, 500);
      return;
    }
    
    waitCount = 0;

    // Verificar que el video esté listo
    if (!state.camera.video || !state.camera.isActive) {
      console.log('⏳ Esperando video...');
      setTimeout(initHandDetection, 500);
      return;
    }

    try {
      console.log('🚀 Cargando modelo hand-pose-detection...');
      
      // Cargar modelo de hand-pose-detection (soporta múltiples manos)
      const detector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'tfjs',
          modelType: 'full',
          maxHands: 2,
        }
      );
      onHandModelReady(detector);
    } catch (error) {
      console.error('❌ Error al cargar modelo:', error.message);
      
      if (modelLoadRetries < MAX_MODEL_LOAD_RETRIES) {
        modelLoadRetries++;
        setTimeout(initHandDetection, 2000);
      } else {
        console.error('❌ Falló cargar modelo después de ' + MAX_MODEL_LOAD_RETRIES + ' intentos');
      }
    }
  }

  function onHandModelReady(detector) {
    if (!detector) {
      console.error('❌ Detector no disponible');
      
      if (modelLoadRetries < MAX_MODEL_LOAD_RETRIES) {
        modelLoadRetries++;
        setTimeout(initHandDetection, 2000);
      }
      return;
    }

    modelLoadRetries = 0; // Reset on success
    state.detection.model = detector;
    state.detection.isModelReady = true;

    console.log('✅ Modelo hand-pose-detection cargado y listo (máx 2 manos)');

    try {
      // Iniciar loop de detección
      detectHands();
    } catch (error) {
      console.error('❌ Error al iniciar detección:', error.message);
    }
  }

  async function detectHands() {
    if (!state.detection.model || !state.detection.isModelReady) {
      return;
    }

    try {
      // hand-pose-detection: estimateHands devuelve {hands: [...]}
      const videoSource = state.camera.video.elt || state.camera.video;
      const predictions = await state.detection.model.estimateHands(videoSource);
      onHandsEstimated(predictions);
    } catch (error) {
      // Silenciar errores de detección transitorios
    }

    // Continuar en el siguiente frame
    requestAnimationFrame(detectHands);
  }

  function onHandsEstimated(predictions) {
    // hand-pose-detection devuelve array de manos directamente
    let handsList = Array.isArray(predictions) ? predictions : [];

    if (!handsList || handsList.length === 0) {
      state.detection.hands = [];
      state.hands = [];
      state.detection.handOrder = [];

      // Sin manos no hay gesto vigente: se limpia para que la UI reciba
      // "gesto:perdido" y "mano:perdida" correctamente.
      state.gestures.current = null;
      state.gestures.owner = null;
      state.gestures.ignored = null;

      resetMovementTracking(state);
      state.movement.controlHand = null;

      updateEventState(state);
      updateMovementControl(state);
      return;
    }

    if (CONFIG.DEBUG && handsList.length > 1) {
      console.log('🖐️ Predicciones de hand-pose-detection: ' + handsList.length + ' manos detectadas');
    }

    // LÓGICA DE RASTREO: Mantener las primeras 2 manos detectadas
    // hand-pose-detection ya proporciona handedness ('Left', 'Right')
    
    // Tomar las primeras 2 manos (máximo)
    const detectedHands = handsList.slice(0, Math.min(handsList.length, state.detection.maxHands));
    
    if (CONFIG.DEBUG && detectedHands.length > 1) {
      console.log('✅ Manos a procesar: ' + detectedHands.length);
    }

    // Procesar cada mano detectada
    const processedHands = detectedHands.map((hand) => {
      // hand-pose-detection devuelve keypoints como array de objetos {x, y, z, name}
      const landmarksPixels = (hand.keypoints || []).map((point) => {
        return [point.x, point.y];
      });

      // Normalizar coordenadas a rango [0, 1]
      const landmarksNormalized = landmarksPixels.map((point) => [
        point[0] / state.camera.width,
        point[1] / state.camera.height,
      ]);

      // Calcular centro de la palma (promedio de los primeros 5 puntos)
      const palmLandmarks = landmarksNormalized.slice(0, 5);
      const palmCenter = [
        palmLandmarks.reduce((sum, p) => sum + p[0], 0) / palmLandmarks.length,
        palmLandmarks.reduce((sum, p) => sum + p[1], 0) / palmLandmarks.length,
      ];

      // hand-pose-detection proporciona handedness ('Left' o 'Right')
      const handedness = (hand.handedness || 'unknown').toLowerCase();

      return {
        side: handedness,
        landmarks: landmarksNormalized,
        palmCenter: palmCenter,
        confidence: hand.score || 0.9,
      };
    });

    // Aplicar suavizado
    const currentTime = Date.now();
    const smoothedHands = applySmoothingFilter(processedHands, currentTime);

    // Manejar desaparición de manos
    handleHandDisappearance(currentTime);

    // Fijar el orden de aparición ANTES de detectar gestos: la primera mano
    // detectada es la que tiene prioridad para controlar.
    updateHandOrder(smoothedHands);

    // Detectar gestos
    detectAllGestures(smoothedHands, currentTime);

    // Procesar sostenimiento (hold)
    processGesturesWithHold(currentTime);

    // Actualizar progreso de hold
    updateHoldProgress(currentTime);

    // Guardar manos detectadas (ya suavizadas)
    state.detection.hands = smoothedHands;
    state.hands = smoothedHands;

    // Actualizar eventos de UI
    updateEventState(state);

    // Actualizar control de movimiento
    updateMovementControl(state);

    // Dibujar debug de movimiento (si está en modo DEBUG)
    if (CONFIG.DEBUG) {
      drawMovementDebug(state, p5Instance);
    }

    // Actualizar FPS de detección
    updateDetectionFps();

    // Emitir evento de actualización de manos
    if (callbacks.onHandsUpdate) {
      callbacks.onHandsUpdate({
        hands: processedHands,
        count: processedHands.length,
        fps: state.detection.detectionFps,
      });
    }
  }

  function updateDetectionFps() {
    state.detection.frameCount++;
    const now = Date.now();
    const elapsed = now - state.detection.lastFpsTime;

    if (elapsed >= 1000) {
      state.detection.detectionFps = state.detection.frameCount;
      state.detection.frameCount = 0;
      state.detection.lastFpsTime = now;
    }
  }

  // =========================================================================
  // SECCIÓN: IDENTIDAD DE LAS MANOS
  // =========================================================================
  // "Primera mano" y "segunda mano" son las manos en el orden en que
  // aparecieron, no el lado que informa el modelo. Así la partida conserva una
  // mano de control estable aunque el detector intercambie izquierda/derecha,
  // y al desaparecer la primera la segunda pasa a ser la principal.
  //
  // Orden resultante: state.detection.handOrder = ['right', 'left'] (ejemplo)
  // Ordinal de cada mano: índice + 1.

  function updateHandOrder(hands) {
    const presentes = (hands || []).map((hand) => hand.side.toLowerCase());

    // Conservar las manos que siguen presentes, sin alterar su orden.
    const orden = state.detection.handOrder.filter((side) => presentes.includes(side));

    // Agregar las nuevas al final, en el orden en que llegaron.
    presentes.forEach((side) => {
      if (!orden.includes(side)) orden.push(side);
    });

    state.detection.handOrder = orden;
  }

  function handOrdinal(side) {
    if (!side) return 0;
    return state.detection.handOrder.indexOf(String(side).toLowerCase()) + 1;
  }

  // Devuelve las manos ordenadas por aparición: la primera es la principal.
  function handsByDetectionOrder(hands) {
    return hands.slice().sort((a, b) => {
      const ordenA = handOrdinal(a.side) || 99;
      const ordenB = handOrdinal(b.side) || 99;
      return ordenA - ordenB;
    });
  }

  // =========================================================================
  // SECCIÓN: SUAVIZADO
  // =========================================================================
  // Suaviza las coordenadas de las manos para eliminar temblor.
  // Usa One Euro o EMA con zona muerta y tolerancia de desaparición.

  // Estado privado de suavizado por mano
  const smoothingState = {
    left: {
      lastUpdateTime: 0,
      disappeared: false,
      landmarks: [], // Puntos suavizados previos
      velocities: [], // Velocidades para One Euro
    },
    right: {
      lastUpdateTime: 0,
      disappeared: false,
      landmarks: [],
      velocities: [],
    },
  };

  // Calcular distancia euclidiana entre dos puntos
  function distance(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Filtro One Euro para suavizar un punto individual (optimizado para fluidez)
  function applyOneEuroFilter(rawPoint, smoothedPoint, velocity, deltaTime) {
    const minCutoff = CONFIG.ONE_EURO_MIN_CUTOFF;
    const beta = CONFIG.ONE_EURO_BETA;

    if (!smoothedPoint) {
      return { point: rawPoint, velocity: [0, 0] };
    }

    // Asegurar deltaTime válido (30-60 FPS typical = 0.016-0.033s)
    const dt = Math.max(0.008, Math.min(0.05, deltaTime));

    // Calcular velocidad instantánea
    const rawVelocity = [
      (rawPoint[0] - smoothedPoint[0]) / dt,
      (rawPoint[1] - smoothedPoint[1]) / dt,
    ];

    // Suavizar velocidad con factor bajo para máxima responsividad
    const alphaVel = 0.5; // Menos suavizado = más responsivo
    const smoothedVelocity = [
      alphaVel * rawVelocity[0] + (1 - alphaVel) * velocity[0],
      alphaVel * rawVelocity[1] + (1 - alphaVel) * velocity[1],
    ];

    // Calcular magnitud de velocidad
    const speed = Math.sqrt(smoothedVelocity[0] ** 2 + smoothedVelocity[1] ** 2);

    // Frecuencia de corte adaptativa
    // Cuando quieto: usa minCutoff (más suavizado)
    // Cuando se mueve: sube cutoff (menos suavizado, más rápido)
    const cutoff = minCutoff + beta * speed;

    // Convertir frecuencia a coeficiente de suavizado usando fórmula más suave
    const r = 2 * Math.PI * cutoff * dt;
    const te = r / (r + 1.0);

    // Aplicar filtro pasa-bajos con interpolación suave
    const filteredPoint = [
      te * rawPoint[0] + (1 - te) * smoothedPoint[0],
      te * rawPoint[1] + (1 - te) * smoothedPoint[1],
    ];

    return {
      point: filteredPoint,
      velocity: smoothedVelocity,
    };
  }

  // Filtro EMA (Media Móvil Exponencial)
  function applyEMAFilter(rawPoint, smoothedPoint, alpha) {
    if (!smoothedPoint) {
      return rawPoint;
    }

    return [
      alpha * rawPoint[0] + (1 - alpha) * smoothedPoint[0],
      alpha * rawPoint[1] + (1 - alpha) * smoothedPoint[1],
    ];
  }

  // Aplicar zona muerta: rechazar cambios menores al umbral
  function applyDeadzone(rawPoint, prevPoint, threshold) {
    if (!prevPoint) {
      return rawPoint;
    }

    const dist = distance(rawPoint, prevPoint);

    // Si cambio es muy pequeño, ignorarlo completamente
    if (dist < threshold) {
      return prevPoint;
    }

    // Si cambio es pequeño pero mayor al umbral, interpolar para suavidad
    if (dist < threshold * 3) {
      const factor = dist / (threshold * 3);
      return [
        prevPoint[0] + (rawPoint[0] - prevPoint[0]) * factor,
        prevPoint[1] + (rawPoint[1] - prevPoint[1]) * factor,
      ];
    }

    return rawPoint;
  }

  // Suavizar todas las manos detectadas
  function applySmoothingFilter(hands, currentTime) {
    if (!CONFIG.SMOOTHING_ENABLED) {
      // Si suavizado desactivado, devolver crudos
      return hands.map((hand) => ({
        ...hand,
        landmarksRaw: hand.landmarks,
        landmarks: hand.landmarks,
      }));
    }

    return hands.map((hand) => {
      const side = hand.side.toLowerCase();
      const sideState = smoothingState[side];

      if (!sideState) {
        return hand; // Fallback si lado desconocido
      }

      // Calcular delta time ANTES de actualizar timestamp
      const deltaTime = Math.max(0.001, (currentTime - sideState.lastUpdateTime) / 1000);

      // Actualizar timestamp
      sideState.lastUpdateTime = currentTime;
      sideState.disappeared = false;

      // Inicializar estado si es necesario
      if (sideState.landmarks.length === 0) {
        sideState.landmarks = hand.landmarks.map((p) => [...p]);
        sideState.velocities = hand.landmarks.map(() => [0, 0]);
        return {
          ...hand,
          landmarksRaw: hand.landmarks,
          landmarks: hand.landmarks,
        };
      }

      // Aplicar suavizado a cada punto
      const smoothedLandmarks = hand.landmarks.map((rawPoint, index) => {
        const prevSmoothed = sideState.landmarks[index];
        const prevVelocity = sideState.velocities[index] || [0, 0];

        // 1. Aplicar zona muerta en punto crudo
        const afterDeadzone = applyDeadzone(
          rawPoint,
          prevSmoothed,
          CONFIG.DEADZONE_THRESHOLD
        );

        // 2. Aplicar filtro elegido
        let smoothedPoint;
        if (CONFIG.SMOOTHING_METHOD === 'oneEuro') {
          const result = applyOneEuroFilter(
            afterDeadzone,
            prevSmoothed,
            prevVelocity,
            deltaTime
          );
          smoothedPoint = result.point;
          sideState.velocities[index] = result.velocity;
        } else {
          smoothedPoint = applyEMAFilter(
            afterDeadzone,
            prevSmoothed,
            CONFIG.EMA_ALPHA
          );
        }

        sideState.landmarks[index] = smoothedPoint;
        return smoothedPoint;
      });

      return {
        ...hand,
        landmarksRaw: hand.landmarks, // Guardar crudos para debug
        landmarks: smoothedLandmarks, // Devolver suavizados
      };
    });
  }

  // Manejar desaparición de manos con tolerancia
  function handleHandDisappearance(currentTime) {
    const tolerance = CONFIG.HAND_DISAPPEARANCE_TOLERANCE_MS;

    Object.keys(smoothingState).forEach((side) => {
      const sideState = smoothingState[side];
      const timeSinceLastUpdate = currentTime - sideState.lastUpdateTime;

      if (timeSinceLastUpdate > tolerance) {
        sideState.disappeared = true;

        // Olvidar la última posición: si la mano reaparece, el primer frame
        // solo fija la referencia y no arrastra un salto de la pieza.
        if (handPositionHistory[side]) {
          handPositionHistory[side].lastPalmX = null;
          handPositionHistory[side].moving = false;
          handPositionHistory[side].direction = null;
        }
        // Limpiar estado después de desaparecer
        if (timeSinceLastUpdate > tolerance + 500) {
          sideState.landmarks = [];
          sideState.velocities = [];
        }
      }
    });
  }

  // =========================================================================
  // SECCIÓN: GESTOS
  // =========================================================================
  // Historial de posiciones de manos para detectar movimiento
  const handPositionHistory = {
    left: { lastPalmX: null, moving: false, direction: null },
    right: { lastPalmX: null, moving: false, direction: null },
  };

  // Detectar si un dedo está claramente doblado. Se compara la distancia
  // MCP→punta con MCP→PIP: en un dedo extendido la punta queda más lejos que
  // la articulación media; en uno doblado, la punta se acerca a la palma.
  // Es invariante a la rotación de la mano (no depende de X/Y absolutas).
  function isFingerCurled(hand, fingerIndices) {
    // fingerIndices: [punta, articulación media (PIP), nudillo (MCP)]
    const tipPoint = hand.landmarks[fingerIndices[0]];
    const pipPoint = hand.landmarks[fingerIndices[1]];
    const mcpPoint = hand.landmarks[fingerIndices[2]];

    if (!tipPoint || !pipPoint || !mcpPoint) return false;

    return distance(mcpPoint, tipPoint) < distance(mcpPoint, pipPoint);
  }

  // Detectar si un dedo está extendido comparando punta con articulación media
  function isFingerExtended(hand, fingerIndices) {
    // fingerIndices: [punta, articulación media]
    const tipPoint = hand.landmarks[fingerIndices[0]];
    const midPoint = hand.landmarks[fingerIndices[1]];

    if (!tipPoint || !midPoint) return false;

    const distance = Math.sqrt(
      (tipPoint[0] - midPoint[0]) ** 2 + (tipPoint[1] - midPoint[1]) ** 2
    );

    return distance > CONFIG.FINGER_EXTENDED_THRESHOLD;
  }

  // Detectar si pulgar está extendido (diferente a otros dedos)
  function isThumbExtended(hand) {
    // Pulgar: punta (4) vs articulación media (2)
    return isFingerExtended(hand, [4, 2]);
  }

  // Detectar si índice está extendido
  function isIndexExtended(hand) {
    // Índice: punta (8) vs articulación media (6)
    return isFingerExtended(hand, [8, 6]);
  }

  // Pulgar realmente levantado: extendido, por encima de su base y lejos de
  // las articulaciones de los otros dedos. Un pulgar envuelto en el puño no
  // cumple la distancia y deja que la pausa tenga prioridad.
  function isThumbUp(hand) {
    if (!isThumbExtended(hand)) return false;

    const tip = hand.landmarks[4];
    const base = hand.landmarks[2];
    if (!tip || !base) return false;

    // La punta del pulgar debe quedar por encima de su base (Y menor).
    if (tip[1] >= base[1]) return false;

    const fingerMids = [6, 10, 14, 18]
      .map((index) => hand.landmarks[index])
      .filter(Boolean);

    const nearFinger = fingerMids.some(
      (point) => distance(tip, point) < CONFIG.THUMB_FINGER_PROXIMITY_THRESHOLD
    );

    return !nearFinger;
  }

  // Detectar gesto de una mano
  function detectGesture(hand, side) {
    // Primero se decide qué dedos están realmente doblados. La prueba radial
    // (nudillo→punta vs nudillo→PIP) es la autoridad: el umbral punta-PIP
    // confunde dedos doblados cuya punta queda cerca de la palma, y eso hacía
    // que un pulgar arriba se clasificara como VICTORIA.
    const indexCurled = isFingerCurled(hand, [8, 6, 5]);
    const middleCurled = isFingerCurled(hand, [12, 10, 9]);
    const ringCurled = isFingerCurled(hand, [16, 14, 13]);
    const pinkyCurled = isFingerCurled(hand, [20, 18, 17]);

    // PUÑO vs PULGAR_ARRIBA: los cuatro dedos largos doblados. Si el pulgar
    // está claramente levantado gana el pulgar; si está envuelto, gana el puño.
    if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
      return isThumbUp(hand) ? 'PULGAR_ARRIBA' : 'PUÑO';
    }

    const indexUp = isIndexExtended(hand);
    const middleUp = isFingerExtended(hand, [12, 10]);
    const ringUp = isFingerExtended(hand, [16, 14]);
    const pinkyUp = isFingerExtended(hand, [20, 18]);

    // VICTORIA: índice y medio extendidos (no doblados); anular y meñique
    // doblados. El pulgar se ignora a propósito.
    if (indexUp && middleUp && !indexCurled && !middleCurled && ringCurled && pinkyCurled) {
      return 'VICTORIA';
    }

    // ROCK: índice y meñique extendidos, medio y anular doblados, pulgar afuera.
    const thumbUp = isThumbExtended(hand);
    if (indexUp && thumbUp && pinkyUp && middleCurled && ringCurled) {
      return 'ROCK';
    }

    // MANO_ABIERTA: los cuatro dedos largos extendidos. El pulgar no se exige
    // porque suele quedar fuera de cuadro o pegado a la palma.
    if (indexUp && middleUp && ringUp && pinkyUp) {
      return 'MANO_ABIERTA';
    }

    return null; // Gesto no reconocido
  }

  // Detectar movimiento de mano abierta (solo para nombrar el gesto: el
  // desplazamiento real de la pieza lo mide updateMovementControl).
  function detectHandMovement(hand, side) {
    const palmX = hand.palmCenter[0];
    const history = handPositionHistory[side];

    if (!history) {
      return null;
    }

    const previousX = history.lastPalmX;

    // La referencia avanza en cada frame: así el gesto refleja el movimiento
    // actual y no se queda "pegado" esperando un salto grande.
    history.lastPalmX = palmX;

    if (previousX === null) {
      history.moving = false;
      history.direction = null;
      return null;
    }

    const diff = palmX - previousX;

    // Si el cambio entre frames es mínimo, la mano está quieta.
    if (Math.abs(diff) < CONFIG.HAND_MOVEMENT_THRESHOLD) {
      history.moving = false;
      history.direction = null;
      return null;
    }

    // Dirección en coordenadas de cámara (el visor se espeja en sketch.js).
    history.direction = diff > 0 ? 'DERECHA' : 'IZQUIERDA';
    history.moving = true;

    return history.direction;
  }

  // Detectar gestos en todas las manos
  function detectAllGestures(hands, currentTime) {
    if (!CONFIG.GESTURE_ENABLED || !hands || hands.length === 0) {
      state.gestures.current = null;
      state.gestures.owner = null;
      state.gestures.ignored = null;
      state.gestures.lastUpdate = currentTime;
      return;
    }

    // Orden de aparición: la mano principal primero.
    const manos = handsByDetectionOrder(hands).map((hand) => {
      const lado = hand.side.toLowerCase();
      return {
        lado,
        gesto: detectGesture(hand, lado),
        movimiento: detectHandMovement(hand, lado),
      };
    });

    // Selección por prioridad (ver elegirGestoDetectado): los gestos discretos
    // funcionan con cualquiera de las dos manos; el movimiento usa la principal.
    const eleccion = elegirGestoDetectado(manos);

    state.gestures.current = eleccion.gesto;
    state.gestures.owner = eleccion.owner;
    state.gestures.ignored = eleccion.ignorada;
    state.gestures.lastUpdate = currentTime;

    // Log en DEBUG
    if (CONFIG.DEBUG && eleccion.gesto) {
      console.log(
        '🎯 Gesto: ' + eleccion.gesto + ' (Dueña: ' + eleccion.owner + ')'
      );
    }
  }

  // =========================================================================
  // SECCIÓN: SOSTENIMIENTO (HOLD)
  // =========================================================================
  // Gestiona sostenimiento de gestos, progreso y cooldown.
  // Requiere mantener gesto durante tiempo configurable para confirmar.

  function updateHoldProgress(currentTime) {
    if (!CONFIG.HOLD_ENABLED) return;

    const hold = state.hold;

    // Si no hay hold activo, nada que hacer
    if (!hold.active) {
      return;
    }

    // Verificar tolerancia: si el gesto desapareció hace más de la tolerancia, cancelar hold
    const timeSinceLastDetected = currentTime - hold.lastDetectedTime;
    if (timeSinceLastDetected > CONFIG.HOLD_TOLERANCE_MS) {
      // Reiniciar hold desde cero
      hold.active = false;
      hold.progress = 0;
      hold.confirmed = false;
      hold.gesture = null;
      hold.owner = null;
      if (CONFIG.DEBUG) {
        console.log('❌ Hold cancelado por timeout de tolerancia');
      }
      return;
    }

    // Calcular progreso (0 a 1)
    const holdDuration = CONFIG.HOLD_DURATION_MS[hold.gesture] || 1000;
    const elapsed = currentTime - hold.startTime;
    hold.progress = Math.min(1, elapsed / holdDuration);

    // Confirmar si alcanzó 100%
    if (hold.progress >= 1 && !hold.confirmed) {
      hold.confirmed = true;
      hold.cooldownUntil = currentTime + CONFIG.HOLD_COOLDOWN_MS;

      // Emitir evento
      if (callbacks.onGestureConfirmed) {
        callbacks.onGestureConfirmed({
          gesture: hold.gesture,
          owner: hold.owner,
        });
      }

      if (CONFIG.DEBUG) {
        console.log('✅ Gesto confirmado: ' + hold.gesture + ' (Dueña: ' + hold.owner + ')');
      }
    }
  }

  // Iniciar o continuar hold con un gesto
  function startOrContinueHold(gesture, owner, currentTime) {
    const hold = state.hold;

    // Verificar cooldown
    if (currentTime < hold.cooldownUntil) {
      return; // En cooldown, ignorar
    }

    // Si ya hay un hold activo del mismo gesto y dueña, continuar
    if (hold.active && hold.gesture === gesture && hold.owner === owner) {
      hold.lastDetectedTime = currentTime;
      return;
    }

    // Si es un gesto diferente o dueña diferente, cancelar y empezar nuevo
    if (hold.active && (hold.gesture !== gesture || hold.owner !== owner)) {
      hold.active = false;
      hold.progress = 0;
      hold.confirmed = false;
    }

    // Iniciar nuevo hold
    if (!hold.active) {
      hold.active = true;
      hold.gesture = gesture;
      hold.owner = owner;
      hold.startTime = currentTime;
      hold.lastDetectedTime = currentTime;
      hold.progress = 0;
      hold.confirmed = false;

      if (CONFIG.DEBUG) {
        console.log('⏱️ Hold iniciado: ' + gesture + ' (Dueña: ' + owner + ')');
      }
    }
  }

  // Procesar gestos detectados: determinar si necesitan sostenimiento
  function processGesturesWithHold(currentTime) {
    if (!CONFIG.HOLD_ENABLED) return;

    const gesture = state.gestures.current;
    const owner = state.gestures.owner;

    if (!gesture || !owner) {
      // No hay gesto detectado, detener hold si está activo
      if (state.hold.active) {
        state.hold.active = false;
        state.hold.progress = 0;
        state.hold.confirmed = false;
        state.hold.gesture = null;
        state.hold.owner = null;
      }
      return;
    }

    // Verificar si es gesto con sostenimiento
    if (CONFIG.GESTURES_WITH_HOLD.includes(gesture)) {
      startOrContinueHold(gesture, owner, currentTime);
    }
    // Gestos instantáneos: confirmar de inmediato con cooldown propio de cada
    // gesto. Así ROCK y PULGAR_ARRIBA no se bloquean entre sí.
    else if (CONFIG.GESTURES_INSTANT.includes(gesture)) {
      const cooldownHasta = state.hold.instantCooldowns[gesture] || 0;
      if (currentTime >= cooldownHasta) {
        if (callbacks.onGestureConfirmed) {
          callbacks.onGestureConfirmed({
            gesture: gesture,
            owner: owner,
          });
        }
        // También se emite el evento público: la integración del juego escucha
        // document, no los callbacks internos.
        HandPose.emitEvent('gesto:confirmado', {
          gesto: gesture,
          manoDuena: owner,
          timestamp: currentTime,
        });
        state.hold.instantCooldowns[gesture] = currentTime + 300;
        if (CONFIG.DEBUG) {
          console.log('⚡ Gesto instantáneo: ' + gesture);
        }
      }
    }
  }

  // =========================================================================
  // SECCIÓN: DEBUG VISUAL
  // =========================================================================
  // Dibuja los 21 puntos clave y el esqueleto de las manos en el canvas.
  // Usa coordenadas normalizadas del módulo de detección.
  // SECCIÓN INDEPENDIENTE: puede eliminarse sin afectar la detección.

  function drawDebugHands(p) {
    if (!CONFIG.DEBUG) {
      return;
    }

    if (!p) {
      return;
    }

    const hands = state.detection.hands;

    // Definir conexiones del esqueleto de la mano (21 puntos)
    const connections = [
      // Pulgar
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Índice
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Medio
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Anular
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Meñique
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palma
      [5, 9], [9, 13], [13, 17],
    ];

    hands.forEach((hand) => {
      // Usar puntos crudos para el esqueleto (si disponibles) o suavizados
      const landmarksForSkeleton = (hand.landmarksRaw && CONFIG.SMOOTHING_ENABLED) 
        ? hand.landmarksRaw 
        : hand.landmarks;

      // Convertir coordenadas normalizadas (0-1) a píxeles para esqueleto
      const landmarksSkeletonPixels = landmarksForSkeleton.map((point) => [
        point[0] * state.camera.width,
        point[1] * state.camera.height,
      ]);

      // Dibujar esqueleto (líneas verdes) usando puntos CRUDOS
      p.stroke(0, 255, 0);
      p.strokeWeight(2);
      connections.forEach((connection) => {
        const start = landmarksSkeletonPixels[connection[0]];
        const end = landmarksSkeletonPixels[connection[1]];

        if (start && end) {
          p.line(start[0], start[1], end[0], end[1]);
        }
      });

      // Dibujar puntos crudos (círculos rojos)
      if (hand.landmarksRaw && CONFIG.SMOOTHING_ENABLED) {
        const landmarksRawPixels = hand.landmarksRaw.map((point) => [
          point[0] * state.camera.width,
          point[1] * state.camera.height,
        ]);

        p.fill(255, 0, 0);
        p.noStroke();
        landmarksRawPixels.forEach((point) => {
          p.ellipse(point[0], point[1], 5);
        });
      }

      // Dibujar puntos suavizados (círculos verdes pequeños) para comparar
      if (CONFIG.SMOOTHING_ENABLED) {
        const landmarksPixels = hand.landmarks.map((point) => [
          point[0] * state.camera.width,
          point[1] * state.camera.height,
        ]);

        p.fill(0, 255, 0);
        p.noStroke();
        landmarksPixels.forEach((point) => {
          p.ellipse(point[0], point[1], 2);
        });
      }

      // Dibujar centro de palma (círculo amarillo)
      const palmCenterPixels = [
        hand.palmCenter[0] * state.camera.width,
        hand.palmCenter[1] * state.camera.height,
      ];
      p.fill(255, 255, 0);
      p.ellipse(palmCenterPixels[0], palmCenterPixels[1], 8);

      // Dibujar etiqueta de mano (izquierda/derecha en amarillo)
      const firstPointSkeletonPixels = landmarksSkeletonPixels[0];
      if (firstPointSkeletonPixels) {
        p.fill(255, 255, 0);
        p.textSize(12);
        p.text(hand.side, firstPointSkeletonPixels[0] + 10, firstPointSkeletonPixels[1] - 10);
      }
    });
  }

  // =========================================================================
  // API PÚBLICA
  // =========================================================================
  return {
    // Iniciar el módulo
    init: function () {
      console.log('🎥 Inicializando módulo de detección de manos...');
      setupP5();
    },

    // Obtener estado actual consultable
    getState: function () {
      return {
        camera: {
          isActive: state.camera.isActive,
          error: state.camera.error,
          width: state.camera.width,
          height: state.camera.height,
        },
        detection: {
          isModelReady: state.detection.isModelReady,
          handsDetected: state.detection.hands.length,
          detectionFps: state.detection.detectionFps,
        },
        hands: state.hands,
        gestures: {
          current: state.gestures.current,
          owner: state.gestures.owner,
          ignored: state.gestures.ignored,
          lastUpdate: state.gestures.lastUpdate,
        },
        hold: {
          active: state.hold.active,
          gesture: state.hold.gesture,
          owner: state.hold.owner,
          progress: state.hold.progress,
          confirmed: state.hold.confirmed,
        },
      };
    },

    // Cambiar modo DEBUG
    setDebug: function (enabled) {
      CONFIG.DEBUG = enabled;
      console.log('🐛 DEBUG: ' + (enabled ? 'ACTIVADO' : 'DESACTIVADO'));
    },

    // Obtener si DEBUG está activo
    isDebug: function () {
      return CONFIG.DEBUG;
    },

    // Iniciar detección de manos
    start: function () {
      if (state.detection.model && state.detection.isModelReady) {
        // Reiniciar loop de detección
        detectHands();
        console.log('▶️ Detección de manos iniciada');
      } else {
        console.warn('⚠️ Modelo no listo para iniciar detección');
      }
    },

    // Detener detección de manos
    stop: function () {
      if (state.detection.model && state.detection.isModelReady) {
        state.detection.hands = [];
        state.hands = [];
        console.log('⏹️ Detección de manos detenida');
      }
    },

    // Obtener manos detectadas con coordenadas normalizadas (suavizadas)
    getHands: function () {
      return state.hands.map((hand) => ({
        side: hand.side,
        landmarks: hand.landmarks, // Suavizados
        landmarksRaw: hand.landmarksRaw || hand.landmarks, // Crudos (para comparar)
        palmCenter: hand.palmCenter,
        confidence: hand.confidence,
      }));
    },

    // Obtener acceso al canvas de p5 (por si el equipo necesita integrarlo)
    getCanvas: function () {
      return state.camera.canvas;
    },

    // Obtener acceso al video (para detectores externos)
    getVideo: function () {
      return state.camera.video;
    },

    // Ajustar parámetros de suavizado en tiempo real
    setSmoothingParams: function (params) {
      if (params.enabled !== undefined) {
        CONFIG.SMOOTHING_ENABLED = params.enabled;
      }
      if (params.method) {
        CONFIG.SMOOTHING_METHOD = params.method; // 'ema' o 'oneEuro'
      }
      if (params.minCutoff !== undefined) {
        CONFIG.ONE_EURO_MIN_CUTOFF = params.minCutoff;
      }
      if (params.beta !== undefined) {
        CONFIG.ONE_EURO_BETA = params.beta;
      }
      if (params.alpha !== undefined) {
        CONFIG.EMA_ALPHA = params.alpha;
      }
      if (params.deadzone !== undefined) {
        CONFIG.DEADZONE_THRESHOLD = params.deadzone;
      }
      if (params.disappearanceTolerance !== undefined) {
        CONFIG.HAND_DISAPPEARANCE_TOLERANCE_MS = params.disappearanceTolerance;
      }
      console.log('✅ Parámetros de suavizado actualizados:', params);
    },

    // Obtener parámetros actuales
    getSmoothingParams: function () {
      return {
        enabled: CONFIG.SMOOTHING_ENABLED,
        method: CONFIG.SMOOTHING_METHOD,
        minCutoff: CONFIG.ONE_EURO_MIN_CUTOFF,
        beta: CONFIG.ONE_EURO_BETA,
        alpha: CONFIG.EMA_ALPHA,
        deadzone: CONFIG.DEADZONE_THRESHOLD,
        disappearanceTolerance: CONFIG.HAND_DISAPPEARANCE_TOLERANCE_MS,
      };
    },

    // Cambiar modo (menú ↔ juego) - cancela sostenimiento en curso
    setGameMode: function (isGameMode) {
      // Cancelar hold activo
      state.hold.active = false;
      state.hold.progress = 0;
      state.hold.confirmed = false;
      state.hold.gesture = null;
      state.hold.owner = null;
      state.hold.cooldownUntil = 0;
      state.hold.instantCooldowns = Object.create(null);
      
      state.ui.mode = isGameMode ? 'juego' : 'menu';

      // Reiniciar el objetivo absoluto: el próximo frame con mano abierta
      // vuelve a calcular la columna según la posición de la palma.
      resetMovementTracking(state);
      state.movement.controlHand = null;

      this.emitEvent('modo:cambiado', {
        modo: state.ui.mode,
        timestamp: Date.now(),
      });
      
      console.log('🎮 Modo: ' + state.ui.mode);
    },

    // Cambiar modo (alternativa más explícita)
    setMode: function (modoNuevo) {
      // Normalizar: 'menu' o 'juego'
      const modo = modoNuevo.toLowerCase();
      if (modo === 'menu') {
        this.setGameMode(false);
      } else if (modo === 'juego') {
        this.setGameMode(true);
      }
    },

    // Obtener objeto de estado consultable para UI
    estado: {
      get manosDetectadas() {
        return state.detection.hands.length > 0;
      },
      get cantidadManos() {
        return state.detection.hands.length;
      },
      get manoPrincipal() {
        return state.detection.handOrder[0] || null;
      },
      get ordenManos() {
        return state.detection.handOrder.slice();
      },
      get modo() {
        return state.ui.mode;
      },
      get gesto() {
        return state.gestures.current;
      },
      get gesticuloSostenimiento() {
        return state.hold.progress;
      },
      get ultimoGestoConfirmado() {
        return state.ui.lastConfirmedGesture;
      },
      get cursor() {
        return {
          visible: state.ui.cursorVisible,
          x: state.ui.cursorX,
          y: state.ui.cursorY,
        };
      },
      get manoDuenaActual() {
        return state.gestures.owner;
      },
      get manoIgnorada() {
        return state.gestures.ignored;
      },
      get movimiento() {
        return {
          columnaActual: state.movement.currentColumn,
          manoControl: state.movement.controlHand,
        };
      },
    },

    // Emitir evento personalizado
    emitEvent: function (eventName, detail) {
      const event = new CustomEvent(eventName, {
        detail: detail || {},
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    },
  };
})();

// =========================================================================
// SECCIÓN: SALIDA DE EVENTOS
// =========================================================================
// Emite eventos personalizados para que la UI reaccione.
//
// EVENTOS DISPONIBLES (escuchar con document.addEventListener):
// - "gesto:detectado"         { gesto, mano, timestamp }
// - "gesto:progreso"          { progreso (0-1), gesto, mano, timestamp }
// - "gesto:confirmado"        { gesto, manoDuena, timestamp }
// - "gesto:perdido"           { gesto, timestamp }
// - "gesto:ignorado"          { manoIgnorada, manoDuena, timestamp }
// - "mano:detectada"          { cantidad, lado, mano (1|2), primera, timestamp }
// - "mano:perdida"            { cantidad, lado, timestamp }
// - "cursor:mostrar"          { x, y, mano, timestamp }
// - "cursor:ocultar"          { timestamp }
// - "cursor:mover"            { x, y, timestamp }
// - "cursor:click"            { x, y, mano, timestamp }
// - "mover:columna"           { columna (0-15), absoluta: true, timestamp }
// - "victoria:inicio"         { mano, timestamp }
// - "victoria:fin"            { timestamp }
// - "modo:cambiado"           { modo (menu/juego), timestamp }
//
// EJEMPLO DE USO:
// document.addEventListener('gesto:confirmado', (e) => {
//   console.log('Gesto confirmado:', e.detail.gesto, 'Mano:', e.detail.manoDuena);
// });
//
// document.addEventListener('cursor:mover', (e) => {
//   console.log('Cursor en:', e.detail.x, e.detail.y);
// });

// Estado anterior para detectar cambios
const eventState = {
  lastGesture: null,
  lastHands: [],
  lastCursorVisible: false,
  lastPinching: false,
};

// =========================================================================
// SECCIÓN: SELECCIÓN DEL GESTO ACTIVO
// =========================================================================
// Con dos manos visibles cada una puede estar haciendo un gesto distinto.
// Reglas, en orden:
//   1. Un gesto discreto (VICTORIA, ROCK, PULGAR_ARRIBA) gana sobre el
//      movimiento, venga de la mano principal o de la secundaria.
//   2. Si no hay gesto discreto, manda la primera mano abierta (la principal
//      si está abierta) para el desplazamiento horizontal.
//   3. Cualquier otro gesto (por ejemplo PUÑO) solo se reporta si es el único:
//      un puño de descanso en la otra mano no debe bloquear el movimiento.
const GESTOS_DISCRETOS = ['VICTORIA', 'ROCK', 'PULGAR_ARRIBA'];

/**
 * @param {{lado: string, gesto: string|null, movimiento: string|null}[]} manos
 *        Manos en orden de aparición (la principal primero).
 * @returns {{gesto: string|null, owner: string|null, ignorada: string|null}}
 */
function elegirGestoDetectado(manos) {
  const conGesto = (manos || []).filter((mano) => mano.gesto);
  if (conGesto.length === 0) return { gesto: null, owner: null, ignorada: null };

  const elegida =
    conGesto.find((mano) => GESTOS_DISCRETOS.indexOf(mano.gesto) !== -1) ||
    conGesto.find((mano) => mano.gesto === 'MANO_ABIERTA') ||
    conGesto[0];

  let gesto = elegida.gesto;
  if (gesto === 'MANO_ABIERTA' && elegida.movimiento) {
    gesto = 'MANO_ABIERTA_' + elegida.movimiento;
  }

  const ignorada = conGesto.find((mano) => mano !== elegida) || null;

  return {
    gesto,
    owner: elegida.lado,
    ignorada: ignorada ? ignorada.lado : null,
  };
}

function updateEventState(state) {
  const now = Date.now();
  const previousGesture = eventState.lastGesture;

  // GESTO DETECTADO / PERDIDO
  // Al cambiar de un gesto reconocido a otro se emiten ambos eventos: el
  // anterior se pierde y el nuevo se detecta. Así los consumidores pueden
  // liberar estados asociados al gesto anterior (por ejemplo, el latch del
  // pulgar que reanuda la partida).
  if (state.gestures.current !== eventState.lastGesture) {
    if (eventState.lastGesture) {
      HandPose.emitEvent('gesto:perdido', {
        gesto: eventState.lastGesture,
        timestamp: now,
      });
    }

    if (state.gestures.current) {
      HandPose.emitEvent('gesto:detectado', {
        gesto: state.gestures.current,
        mano: state.gestures.owner,
        timestamp: now,
      });
    }

    eventState.lastGesture = state.gestures.current;
  }

  // VICTORIA: caída acelerada continua mientras el gesto se mantiene.
  // inicio solo en partida; fin siempre para liberar el estado del consumidor.
  if (
    state.ui.mode === 'juego' &&
    state.gestures.current === 'VICTORIA' &&
    previousGesture !== 'VICTORIA'
  ) {
    HandPose.emitEvent('victoria:inicio', {
      mano: state.gestures.owner,
      timestamp: now,
    });
    if (CONFIG.DEBUG) {
      console.log('✌️ VICTORIA: caída acelerada');
    }
  } else if (previousGesture === 'VICTORIA' && state.gestures.current !== 'VICTORIA') {
    HandPose.emitEvent('victoria:fin', {
      timestamp: now,
    });
    if (CONFIG.DEBUG) {
      console.log('✌️ VICTORIA: fin de caída acelerada');
    }
  }

  // GESTO PROGRESO
  if (state.hold.active && state.hold.progress > 0) {
    HandPose.emitEvent('gesto:progreso', {
      progreso: state.hold.progress,
      gesto: state.hold.gesture,
      mano: state.hold.owner,
      timestamp: now,
    });
  }

  // GESTO CONFIRMADO
  if (state.hold.confirmed && state.hold.gesture !== state.ui.lastConfirmedGesture) {
    state.ui.lastConfirmedGesture = state.hold.gesture;
    HandPose.emitEvent('gesto:confirmado', {
      gesto: state.hold.gesture,
      manoDuena: state.hold.owner,
      timestamp: now,
    });
  }

  // GESTO IGNORADO
  if (state.gestures.ignored) {
    HandPose.emitEvent('gesto:ignorado', {
      manoIgnorada: state.gestures.ignored,
      manoDuena: state.gestures.owner,
      timestamp: now,
    });
  }

  // MANO DETECTADA / PERDIDA
  // "cantidad" es el total visible después del cambio. "lado" y "mano" (1 =
  // primera detectada, 2 = segunda) identifican la mano que apareció o se fue.
  const ladosActuales = state.detection.hands.map((hand) => hand.side.toLowerCase());

  if (ladosActuales.length !== eventState.lastHands.length) {
    const aparecidas = ladosActuales.filter((side) => !eventState.lastHands.includes(side));
    const perdidas = eventState.lastHands.filter((side) => !ladosActuales.includes(side));

    if (ladosActuales.length > eventState.lastHands.length) {
      const lado = aparecidas[aparecidas.length - 1] || null;
      // Ordinal de aparición calculado acá mismo: handOrdinal() vive dentro del
      // IIFE de HandPose y updateEventState está fuera de ese ámbito.
      const mano = lado ? state.detection.handOrder.indexOf(lado) + 1 : 0;
      HandPose.emitEvent('mano:detectada', {
        cantidad: ladosActuales.length,
        lado,
        mano,
        primera: mano === 1,
        timestamp: now,
      });
    } else if (ladosActuales.length < eventState.lastHands.length) {
      const lado = perdidas[perdidas.length - 1] || null;
      HandPose.emitEvent('mano:perdida', {
        cantidad: ladosActuales.length,
        lado,
        timestamp: now,
      });
    }
  }

  eventState.lastHands = ladosActuales;

  // ROCK: cambio de escenario (gesto instantáneo confirmado por el sistema)
  // Se emite automáticamente cuando el gesto es detectado y confirmado
  // por el mecanismo de gestos instantáneos en processGesturesWithHold

}

// =========================================================================
// SECCIÓN: CONTROL DE MOVIMIENTO
// =========================================================================
// Control horizontal ABSOLUTO con mano abierta:
//
//   1. Se identifica la mano abierta con el gesto existente
//      (MANO_ABIERTA / MANO_ABIERTA_IZQUIERDA / MANO_ABIERTA_DERECHA).
//   2. La posición X de la palma se normaliza contra el ancho de detección de
//      la cámara y se convierte directamente a una columna de la cuadrícula
//      (0 .. MOVEMENT_COLUMNS - 1). No se acumulan píxeles ni desplazamientos
//      relativos: el objetivo es siempre la columna real bajo la mano.
//   3. El borde izquierdo/derecho de la cámara satura en la primera/última
//      columna: si la mano llega al extremo, la pieza también puede llegar.
//   4. Se emite "mover:columna" con la columna objetivo absoluta. sketch.js
//      mueve la pieza una casilla por frame hacia ese objetivo, respetando
//      colisiones y límites, y se detiene cuando la pieza lo alcanza.
//
// La cámara está espejada en el visor. Las coordenadas de este módulo son las
// de la cámara; sketch.js invierte el eje X al consumir el evento.
//
// EVENTOS EMITIDOS:
// - "mover:columna"  { columna, x, absoluta: true, timestamp }  (modo JUEGO)
//     x:       posición normalizada 0-1 de la mano en coordenadas de cámara.
//              Es la referencia principal: sketch.js la mapea al ancho real
//              de la cuadrícula y a la huella de la pieza.
//     columna: columna entera equivalente (0-15), por compatibilidad.
// - "menu:izquierda" / "menu:derecha" { timestamp }  (modo MENU)
//
// EJEMPLO:
// document.addEventListener('mover:columna', (e) => {
//   console.log('Mano normalizada:', e.detail.x);
// });

// Olvida la última X usada para calcular el objetivo. El próximo frame con
// mano abierta vuelve a calcular la columna absoluta.
function resetMovementTracking(state) {
  state.movement.lastTargetRawX = null;
}

// Devuelve la mano que está haciendo el gesto de mano abierta, reutilizando
// el reconocimiento de gestos existente.
function findOpenControlHand(state) {
  const gesture = state.gestures.current;

  if (!gesture || gesture.indexOf('MANO_ABIERTA') !== 0) {
    return null;
  }

  const owner = state.gestures.owner;
  if (!owner) {
    return null;
  }

  return (
    state.detection.hands.find(
      (hand) => hand.side.toLowerCase() === owner
    ) || null
  );
}

function updateMovementControl(state) {
  if (!CONFIG.MOVEMENT_CONTROL_ENABLED) {
    return;
  }

  const now = Date.now();
  const numColumns = CONFIG.MOVEMENT_COLUMNS;

  // Con una o dos manos el movimiento sigue funcionando: el gesto pertenece a
  // la mano principal (la primera detectada) y findOpenControlHand la elige a
  // ella, así la pieza no salta de una mano a otra.
  const controlHand = findOpenControlHand(state);

  if (!controlHand) {
    // Sin mano abierta no hay objetivo: la pieza se queda quieta.
    state.movement.controlHand = null;
    resetMovementTracking(state);
    return;
  }

  const side = controlHand.side.toLowerCase();
  if (state.movement.controlHand !== side) {
    state.movement.controlHand = side;
    resetMovementTracking(state);
  }

  const palmX = controlHand.palmCenter[0];
  const lastRawX = state.movement.lastTargetRawX;

  // Filtro de temblor: no recalcular la columna por micro-movimientos del
  // detector. Si la mano se mueve lento, la diferencia con la última X crece
  // hasta superar el umbral y recién ahí se actualiza el objetivo.
  if (lastRawX !== null && Math.abs(palmX - lastRawX) < CONFIG.MOVEMENT_JITTER_THRESHOLD) {
    return;
  }

  state.movement.lastTargetRawX = palmX;

  // Posición de la palma -> ancho completo de la cuadrícula.
  // El margen permite que el centro de la palma alcance las columnas 0 y 15
  // aunque la mano tenga ancho; fuera del margen el objetivo satura.
  const margin = Math.max(0, Math.min(0.45, CONFIG.MOVEMENT_EDGE_MARGIN));
  const usableWidth = Math.max(0.1, 1 - 2 * margin);
  const normalized = Math.min(1, Math.max(0, (palmX - margin) / usableWidth));
  const target = Math.max(
    0,
    Math.min(numColumns - 1, Math.round(normalized * (numColumns - 1)))
  );

  const previous = state.movement.targetColumn;
  state.movement.targetColumn = target;
  state.movement.currentColumn = target;

  if (state.ui.mode === 'juego') {
    HandPose.emitEvent('mover:columna', {
      // x normalizada (0-1, coordenadas de cámara) es la referencia principal:
      // sketch.js la mapea al ancho real de la cuadrícula y de la pieza.
      x: normalized,
      // columna entera equivalente, para compatibilidad con consumidores
      // que ya usaban "columna".
      columna: target,
      absoluta: true,
      timestamp: now,
    });

    if (CONFIG.DEBUG) {
      console.log(
        '➡️ MOVIMIENTO: columna objetivo ' + target +
        ' (X normalizada: ' + normalized.toFixed(3) + ')'
      );
    }
    return;
  }

  if (state.ui.mode === 'menu' && target !== previous) {
    // Coordenadas de cámara: +X equivale a la izquierda en el visor espejado.
    HandPose.emitEvent(target > previous ? 'menu:izquierda' : 'menu:derecha', {
      timestamp: now,
    });

    if (CONFIG.DEBUG) {
      console.log(target > previous ? '⬅️ MENÚ: izquierda' : '➡️ MENÚ: derecha');
    }
  }
}

function drawMovementDebug(state, pInst) {
  if (!CONFIG.DEBUG || !state.camera.canvas) {
    return;
  }

  // Acceder a p5 para dibujar (si está disponible)
  if (pInst) {
    const p = pInst;
    const numColumns = CONFIG.MOVEMENT_COLUMNS;
    const edgeMargin = CONFIG.MOVEMENT_EDGE_MARGIN;
    const canvasWidth = state.camera.width;
    const canvasHeight = state.camera.height;

    // Dibujar líneas de columnas
    p.stroke(100, 100, 100);
    p.strokeWeight(1);

    const usableStart = edgeMargin * canvasWidth;
    const usableEnd = (1 - edgeMargin) * canvasWidth;
    const columnWidth = (usableEnd - usableStart) / (numColumns - 1);

    for (let i = 0; i < numColumns; i++) {
      const x = usableStart + i * columnWidth;
      p.line(x, 0, x, canvasHeight);
    }

    // Resaltar columna activa
    if (state.movement.controlHand) {
      const activeX =
        usableStart + state.movement.currentColumn * columnWidth;
      p.stroke(0, 255, 0);
      p.strokeWeight(3);
      p.line(activeX - 10, 0, activeX - 10, canvasHeight);
      p.line(activeX + 10, 0, activeX + 10, canvasHeight);
    }

    // Mostrar zona útil (márgenes)
    p.stroke(200, 100, 100);
    p.strokeWeight(2);
    p.line(usableStart, 0, usableStart, canvasHeight);
    p.line(usableEnd, 0, usableEnd, canvasHeight);
  }
}

// Agregar método para actualizar eventos de UI
HandPose._updateEventState = updateEventState;
HandPose._updateMovementControl = updateMovementControl;
HandPose._drawMovementDebug = drawMovementDebug;

// =========================================================================
// SECCIÓN: INTEGRACIÓN CON EL TETRIS
// =========================================================================
// Punto único de contacto entre el módulo de detección de manos y el juego.
// Expone una API clara y simple para que el equipo de Tetris pueda enganchar
// acciones de mano directamente a la lógica del juego.
//
// OBJETO PÚBLICO: window.HandPose
//
// MÉTODOS:
// - HandPose.init()                     Inicializar (automático)
// - HandPose.enable()                   Activar detección
// - HandPose.disable()                  Desactivar detección
// - HandPose.setModo('menu' | 'juego')  Cambiar modo
// - HandPose.on(accion, callback)       Registrar listener
// - HandPose.off(accion, callback)      Remover listener
//
// ACCIONES DISPONIBLES (para on() / off()):
// 'moverIzquierda', 'moverDerecha', 'rotarHorario', 'rotarAntihorario',
// 'pausar', 'caidaAceleradaInicio', 'caidaAceleradaFin', 'cursorMover',
// 'cursorClick', 'menuIzquierda', 'menuDerecha'
//
// PROPIEDADES:
// - HandPose.estado                     Objeto consultable con estado actual
// - HandPose.config                     Referencia a CONFIG para ajustes
//
// EJEMPLO:
// HandPose.setModo('juego');
// HandPose.on('moverIzquierda', () => {
//   console.log('Mover pieza izquierda');
// });
// HandPose.on('caidaAceleradaInicio', () => {
//   console.log('Caída acelerada activada');
// });

const HandPoseIntegration = (() => {
  // Mapa de listeners por acción
  const listeners = {
    moverIzquierda: [],
    moverDerecha: [],
    rotarHorario: [],
    rotarAntihorario: [],
    pausar: [],
    caidaAceleradaInicio: [],
    caidaAceleradaFin: [],
    cursorMover: [],
    cursorClick: [],
    menuIzquierda: [],
    menuDerecha: [],
  };

  // Estados interno
  let isEnabled = true;
  let lastCursorX = 0;
  let lastCursorY = 0;
  let lastMovementColumn = null;

  // Mapeo de eventos internos a acciones públicas
  function setupEventListeners() {
    // MOVER COLUMNAS (modo JUEGO)
    document.addEventListener('mover:columna', (e) => {
      if (!isEnabled || !e.detail) return;

      // Evento de sincronización: fija la referencia sin mover la pieza.
      if (e.detail.baseline) {
        if (typeof e.detail.columna === 'number') {
          lastMovementColumn = e.detail.columna;
        }
        return;
      }

      let steps = typeof e.detail.delta === 'number' ? e.detail.delta : 0;

      // Compatibilidad con emisores antiguos que solo enviaban "columna".
      if (steps === 0 && typeof e.detail.columna === 'number') {
        if (lastMovementColumn === null) {
          lastMovementColumn = e.detail.columna;
          return;
        }
        steps = e.detail.columna - lastMovementColumn;
        lastMovementColumn = e.detail.columna;
      }

      if (steps === 0) return;

      // El visor de cámara está espejado: un delta positivo en coordenadas
      // de cámara equivale a mover la mano hacia la izquierda en pantalla.
      const action = steps > 0 ? 'moverIzquierda' : 'moverDerecha';
      const amount = Math.min(
        Math.abs(steps),
        Math.max(1, CONFIG.MOVEMENT_MAX_STEPS_PER_EVENT)
      );

      for (let i = 0; i < amount; i++) {
        emit(action, { steps: amount });
      }
    });

    // NAVEGACIÓN DE MENÚ
    document.addEventListener('menu:izquierda', (e) => {
      if (!isEnabled) return;
      emit('menuIzquierda', {});
    });

    document.addEventListener('menu:derecha', (e) => {
      if (!isEnabled) return;
      emit('menuDerecha', {});
    });

    // VICTORIA: único gesto de caída acelerada.
    document.addEventListener('victoria:inicio', (e) => {
      if (!isEnabled) return;
      emit('caidaAceleradaInicio', {});
    });

    document.addEventListener('victoria:fin', (e) => {
      if (!isEnabled) return;
      emit('caidaAceleradaFin', {});
    });

    // CURSOR: MOVER
    document.addEventListener('cursor:mover', (e) => {
      if (!isEnabled) return;
      lastCursorX = e.detail.x;
      lastCursorY = e.detail.y;
      emit('cursorMover', { x: e.detail.x, y: e.detail.y });
    });

    // CURSOR: CLICK
    document.addEventListener('cursor:click', (e) => {
      if (!isEnabled) return;
      emit('cursorClick', { x: e.detail.x, y: e.detail.y });
    });

    // GESTO CONFIRMADO: PUÑO (pausar en juego)
    document.addEventListener('gesto:confirmado', (e) => {
      if (!isEnabled) return;
      if (e.detail.gesto === 'PUÑO') {
        emit('pausar', { mano: e.detail.manoDuena });
      }
    });

    // GESTO INSTANTÁNEO: PULGAR ARRIBA (rotación)
    document.addEventListener('gesto:confirmado', (e) => {
      if (!isEnabled) return;
      if (e.detail.gesto === 'PULGAR_ARRIBA') {
        // Detectar si es derecha (mano izquierda) o izquierda (mano derecha)
        const mano = e.detail.manoDuena;
        if (mano === 'left') {
          emit('rotarHorario', { mano });
        } else {
          emit('rotarAntihorario', { mano });
        }
      }
    });
  }

  function emit(accion, data) {
    if (listeners[accion]) {
      listeners[accion].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('❌ Error en listener de "' + accion + '":', error);
        }
      });
    }
  }

  return {
    // Inicializar listeners
    init: function () {
      setupEventListeners();
      if (CONFIG.DEBUG) {
        console.log('🔌 HandPose Integration inicializado');
      }
    },

    // Habilitar/deshabilitar
    enable: function () {
      isEnabled = true;
      if (CONFIG.DEBUG) {
        console.log('✅ HandPose habilitado');
      }
    },

    disable: function () {
      isEnabled = false;
      if (CONFIG.DEBUG) {
        console.log('❌ HandPose deshabilitado');
      }
    },

    // Cambiar modo
    setModo: function (modo) {
      HandPose.setMode(modo);
    },

    // Registrar listener
    on: function (accion, callback) {
      if (listeners[accion]) {
        listeners[accion].push(callback);
        if (CONFIG.DEBUG) {
          console.log('📌 Listener registrado: ' + accion);
        }
        return true;
      } else {
        console.warn('⚠️ Acción desconocida: ' + accion);
        return false;
      }
    },

    // Remover listener
    off: function (accion, callback) {
      if (listeners[accion]) {
        const index = listeners[accion].indexOf(callback);
        if (index > -1) {
          listeners[accion].splice(index, 1);
          if (CONFIG.DEBUG) {
            console.log('📌 Listener removido: ' + accion);
          }
        }
      }
    },

    // Obtener estado
    get estado() {
      return HandPose.estado;
    },

    // Obtener referencia a CONFIG
    get config() {
      return CONFIG;
    },

    // Obtener posición actual del cursor
    get cursor() {
      return { x: lastCursorX, y: lastCursorY };
    },
  };
})();

// Inicializar integración
HandPoseIntegration.init();

// El init real del módulo (arranca p5 y la cámara). Se guarda porque más abajo
// Object.assign copia la API de integración sobre HandPose y pisaría este método.
const iniciarHandPose = HandPose.init;

// Inicializar automáticamente cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    iniciarHandPose();
  });
} else {
  iniciarHandPose();
}

// Exponer en ventana global
window.HandPose = HandPose;
window.HandPoseIntegration = HandPoseIntegration;

// Para compatibilidad y acceso más simple desde el equipo de Tetris:
// Pueden usar window.HandPose.on() directamente si lo prefieren
Object.assign(HandPose, HandPoseIntegration);

// Restaurar el init del módulo: sin esto, HandPose.init() solo registraba
// listeners y la cámara nunca arrancaba. La integración ya se inicializó arriba.
HandPose.init = iniciarHandPose;
