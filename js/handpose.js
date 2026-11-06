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
  ONE_EURO_MIN_CUTOFF: 0.7, // Frecuencia de corte mínima (Hz) - más bajo = más fluido
  ONE_EURO_BETA: 0.05, // Parámetro de amortiguación de derivada - más alto = más rápido
  
  // Zona muerta (deadzone)
  DEADZONE_THRESHOLD: 0.002, // Umbral de variación mínima (normalizado 0-1) - más bajo = más sensible
  
  // Tolerancia de desaparición de mano
  HAND_DISAPPEARANCE_TOLERANCE_MS: 200, // Milisegundos para tolerancia
  
  // Configuración de gestos
  GESTURE_CONFIDENCE_MIN: 0.7, // Confianza mínima para detectar gesto
  GESTURE_ENABLED: true, // Activar/desactivar detección de gestos
  
  // Prioridad entre manos
  HAND_OWNERSHIP_ENABLED: true, // Activar regla de prioridad
  HAND_OWNERSHIP_TIMEOUT_MS: 200, // Retardo para traspaso de dueña
  
  // Umbrales para detección de dedos extendidos
  FINGER_EXTENDED_THRESHOLD: 0.05, // Distancia mínima entre punta y articulación media
  
  // Umbrales de movimiento
  HAND_MOVEMENT_THRESHOLD: 0.05, // Cambio mínimo en posición X para detectar movimiento
  
  // Umbrales para contacto dedo-palma (click)
  FINGER_PALM_CONTACT_THRESHOLD: 0.08, // Distancia máxima entre punta y palma
  
  // Configuración de sostenimiento (hold)
  HOLD_ENABLED: true, // Activar sostenimiento
  HOLD_DURATION_MS: {
    'PUÑO': 800, // Pausar
    'ÍNDICE_CLICK': 600, // Click (si se usa sostenimiento)
  },
  HOLD_TOLERANCE_MS: 150, // Tolerancia de fallo momentáneo del detector
  HOLD_COOLDOWN_MS: 1500, // Cooldown después de confirmar
  
  // Gestos con sostenimiento (requieren hold + barra de progreso)
  GESTURES_WITH_HOLD: ['PUÑO', 'ÍNDICE_CLICK'],
  
  // Gestos instantáneos (sin hold, solo cooldown corto)
  GESTURES_INSTANT: ['PULGAR_ARRIBA', 'PULGAR_IZQUIERDA'],
  
  // Gestos continuos (sin hold, se activan mientras duren)
  GESTURES_CONTINUOUS: ['MANO_ABIERTA_IZQUIERDA', 'MANO_ABIERTA_DERECHA', 'ÍNDICE_LEVANTADO', 'DOS_MANOS'],
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
      lastHandCount: 0, // Último conteo de manos
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
      cooldownUntil: 0, // Cooldown hasta este timestamp
    },
    ui: {
      mode: 'juego', // 'menu' o 'juego'
      cursorVisible: false, // Si cursor está visible
      cursorX: 0, // Posición X normalizada (0-1)
      cursorY: 0, // Posición Y normalizada (0-1)
      lastConfirmedGesture: null, // Último gesto confirmado
      dosManosCaida: false, // Si está en caída rápida (dos manos)
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
      state.detection.lastHandCount = 0;
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

    state.detection.lastHandCount = detectedHands.length;

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
    updateEventState();

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
  // Detecta gestos a partir de puntos suavizados de las manos.
  // Implementa regla de prioridad: primera mano que aparece es dueña.

  // Estado de propiedad de gestos por mano
  const gestureOwnership = {
    left: {
      owner: null, // null, 'left', o 'right'
      startTime: 0,
      lastGesture: null,
    },
    right: {
      owner: null,
      startTime: 0,
      lastGesture: null,
    },
  };

  // Historial de posiciones de manos para detectar movimiento
  const handPositionHistory = {
    left: { lastPalmX: null, moving: false, direction: null },
    right: { lastPalmX: null, moving: false, direction: null },
  };

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

  // Detectar si dedo toca palma (click)
  function isIndexTouchingPalm(hand) {
    const indexTip = hand.landmarks[8]; // Punta del índice
    const palmCenter = hand.palmCenter;

    if (!indexTip || !palmCenter) return false;

    const distance = Math.sqrt(
      (indexTip[0] - palmCenter[0]) ** 2 + (indexTip[1] - palmCenter[1]) ** 2
    );

    return distance < CONFIG.FINGER_PALM_CONTACT_THRESHOLD;
  }

  // Contar dedos extendidos (0-5)
  function countExtendedFingers(hand) {
    let count = 0;

    // Pulgar (índices 2-4)
    if (isThumbExtended(hand)) count++;

    // Índice (índices 6-8)
    if (isIndexExtended(hand)) count++;

    // Medio (índices 10-12)
    if (isFingerExtended(hand, [12, 10])) count++;

    // Anular (índices 14-16)
    if (isFingerExtended(hand, [16, 14])) count++;

    // Meñique (índices 18-20)
    if (isFingerExtended(hand, [20, 18])) count++;

    return count;
  }

  // Detectar gesto de una mano
  function detectGesture(hand, side) {
    const extendedCount = countExtendedFingers(hand);

    // MANO_ABIERTA (5 dedos)
    if (extendedCount === 5) {
      return 'MANO_ABIERTA';
    }

    // PUÑO (0 dedos)
    if (extendedCount === 0) {
      return 'PUÑO';
    }

    // PULGAR_ARRIBA (solo pulgar)
    if (isThumbExtended(hand) && extendedCount === 1) {
      return 'PULGAR_ARRIBA';
    }

    // ÍNDICE_LEVANTADO (solo índice)
    if (isIndexExtended(hand) && extendedCount === 1) {
      return 'ÍNDICE_LEVANTADO';
    }

    // ÍNDICE_CLICK (índice toca palma)
    if (isIndexTouchingPalm(hand)) {
      return 'ÍNDICE_CLICK';
    }

    return null; // Gesto no reconocido
  }

  // Detectar movimiento de mano abierta
  function detectHandMovement(hand, side) {
    const palmX = hand.palmCenter[0];
    const history = handPositionHistory[side];

    if (history.lastPalmX === null) {
      history.lastPalmX = palmX;
      return null;
    }

    const diff = palmX - history.lastPalmX;

    // Si cambio es pequeño, no hay movimiento
    if (Math.abs(diff) < CONFIG.HAND_MOVEMENT_THRESHOLD) {
      history.moving = false;
      return null;
    }

    // Detectar dirección
    history.direction = diff > 0 ? 'DERECHA' : 'IZQUIERDA';
    history.moving = true;
    history.lastPalmX = palmX;

    return history.direction;
  }

  // Aplicar regla de prioridad: primera mano que aparece es dueña
  function applyHandOwnershipRule(hands, currentTime) {
    if (!CONFIG.HAND_OWNERSHIP_ENABLED) {
      return hands; // Sin regla de prioridad
    }

    // Identificar qué manos están presentes
    const presentSides = hands.map((h) => h.side.toLowerCase());

    // Si es la primera vez que vemos estas manos, marcar aparición
    presentSides.forEach((side) => {
      if (!gestureOwnership[side].owner) {
        gestureOwnership[side].owner = side; // La mano es dueña de sí misma al aparecer
        gestureOwnership[side].startTime = currentTime;
      }
    });

    // Manos que desaparecieron: limpiar ownership
    Object.keys(gestureOwnership).forEach((side) => {
      if (!presentSides.includes(side)) {
        gestureOwnership[side].owner = null;
        gestureOwnership[side].startTime = 0;
      }
    });

    return hands;
  }

  // Detectar gestos en todas las manos
  function detectAllGestures(hands, currentTime) {
    if (!CONFIG.GESTURE_ENABLED || !hands || hands.length === 0) {
      state.gestures.current = null;
      return;
    }

    // Aplicar regla de prioridad
    applyHandOwnershipRule(hands, currentTime);

    let detectedGesture = null;
    let gestureOwner = null;
    let ignoredHand = null;

    hands.forEach((hand) => {
      const side = hand.side.toLowerCase();
      const gesture = detectGesture(hand, side);
      const movement = detectHandMovement(hand, side);

      // Gesto detectado
      if (gesture) {
        // Verificar regla de prioridad
        if (gestureOwnership[side].owner !== side) {
          // Esta mano no es dueña, ignorar
          ignoredHand = side;
          return;
        }

        detectedGesture = gesture;
        gestureOwner = side;

        // Si hay movimiento con mano abierta, agregar dirección
        if (gesture === 'MANO_ABIERTA' && movement) {
          detectedGesture = 'MANO_ABIERTA_' + movement;
        }
      }

      // Movimiento sin gesto específico
      if (movement && gesture === 'MANO_ABIERTA') {
        if (!detectedGesture) {
          detectedGesture = 'MANO_ABIERTA_' + movement;
          gestureOwner = side;
        }
      }
    });

    // Actualizar estado de gestos
    state.gestures.current = detectedGesture;
    state.gestures.owner = gestureOwner;
    state.gestures.ignored = ignoredHand;
    state.gestures.lastUpdate = currentTime;

    // Log en DEBUG
    if (CONFIG.DEBUG && detectedGesture) {
      console.log(
        '🎯 Gesto: ' + detectedGesture + ' (Dueña: ' + gestureOwner + ')'
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
    // Gestos instantáneos: confirmar de inmediato con cooldown corto
    else if (CONFIG.GESTURES_INSTANT.includes(gesture)) {
      // Verificar cooldown
      if (currentTime >= state.hold.cooldownUntil) {
        if (callbacks.onGestureConfirmed) {
          callbacks.onGestureConfirmed({
            gesture: gesture,
            owner: owner,
          });
        }
        state.hold.cooldownUntil = currentTime + 300; // Cooldown corto para instant
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

    // Registrar callbacks
    on: function (event, callback) {
      if (event === 'cameraError') {
        callbacks.onCameraError = callback;
      } else if (event === 'cameraActive') {
        callbacks.onCameraActive = callback;
      } else if (event === 'handsUpdate') {
        callbacks.onHandsUpdate = callback;
      } else if (event === 'gestureDetected') {
        callbacks.onGestureDetected = callback;
      } else if (event === 'gestureConfirmed') {
        callbacks.onGestureConfirmed = callback;
      }
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
      
      state.ui.mode = isGameMode ? 'juego' : 'menu';
      
      this.emitEvent('modo:cambiado', {
        modo: state.ui.mode,
        timestamp: Date.now(),
      });
      
      console.log('🎮 Modo: ' + state.ui.mode);
    },

    // Obtener objeto de estado consultable para UI
    estado: {
      get manosDetectadas() {
        return state.detection.hands.length > 0;
      },
      get cantidadManos() {
        return state.detection.hands.length;
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
      get caidaRapida() {
        return state.ui.dosManosCaida;
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
// - "mano:detectada"          { cantidad, timestamp }
// - "mano:perdida"            { timestamp }
// - "cursor:mostrar"          { x, y, mano, timestamp }
// - "cursor:ocultar"          { timestamp }
// - "cursor:mover"            { x, y, timestamp }
// - "cursor:click"            { x, y, mano, timestamp }
// - "caida:inicio"            { timestamp }
// - "caida:fin"               { timestamp }
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
  lastHandCount: 0,
  lastCursorVisible: false,
  lastDosManos: false,
};

function updateEventState() {
  const now = Date.now();

  // GESTO DETECTADO
  if (state.gestures.current !== eventState.lastGesture) {
    if (state.gestures.current) {
      HandPose.emitEvent('gesto:detectado', {
        gesto: state.gestures.current,
        mano: state.gestures.owner,
        timestamp: now,
      });
    } else if (eventState.lastGesture) {
      HandPose.emitEvent('gesto:perdido', {
        gesto: eventState.lastGesture,
        timestamp: now,
      });
    }
    eventState.lastGesture = state.gestures.current;
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
  if (state.detection.hands.length !== eventState.lastHandCount) {
    if (state.detection.hands.length > eventState.lastHandCount) {
      HandPose.emitEvent('mano:detectada', {
        cantidad: state.detection.hands.length,
        timestamp: now,
      });
    } else if (state.detection.hands.length < eventState.lastHandCount) {
      HandPose.emitEvent('mano:perdida', {
        timestamp: now,
      });
    }
    eventState.lastHandCount = state.detection.hands.length;
  }

  // CURSOR: MOSTRAR / OCULTAR
  const cursorDebeSerVisible = state.gestures.current === 'ÍNDICE_LEVANTADO';
  if (cursorDebeSerVisible && !eventState.lastCursorVisible) {
    state.ui.cursorVisible = true;
    HandPose.emitEvent('cursor:mostrar', {
      x: state.ui.cursorX,
      y: state.ui.cursorY,
      mano: state.gestures.owner,
      timestamp: now,
    });
    eventState.lastCursorVisible = true;
  } else if (!cursorDebeSerVisible && eventState.lastCursorVisible) {
    state.ui.cursorVisible = false;
    HandPose.emitEvent('cursor:ocultar', {
      timestamp: now,
    });
    eventState.lastCursorVisible = false;
  }

  // CURSOR: MOVER (si está visible)
  if (state.ui.cursorVisible && state.detection.hands.length > 0) {
    // Encontrar la mano dueña del cursor (índice levantado)
    const cursorOwner = state.detection.hands.find(
      (h) => h.side.toLowerCase() === state.gestures.owner
    );
    if (cursorOwner) {
      state.ui.cursorX = cursorOwner.palmCenter[0];
      state.ui.cursorY = cursorOwner.palmCenter[1];
      HandPose.emitEvent('cursor:mover', {
        x: state.ui.cursorX,
        y: state.ui.cursorY,
        timestamp: now,
      });
    }
  }

  // CURSOR: CLICK (índice toca palma)
  if (state.gestures.current === 'ÍNDICE_CLICK' && state.ui.cursorVisible) {
    HandPose.emitEvent('cursor:click', {
      x: state.ui.cursorX,
      y: state.ui.cursorY,
      mano: state.gestures.owner,
      timestamp: now,
    });
  }

  // CAÍDA RÁPIDA: DOS MANOS (inicio / fin)
  const dosManosCaida = state.detection.hands.length === 2;
  if (dosManosCaida && !eventState.lastDosManos) {
    state.ui.dosManosCaida = true;
    HandPose.emitEvent('caida:inicio', {
      timestamp: now,
    });
    eventState.lastDosManos = true;
  } else if (!dosManosCaida && eventState.lastDosManos) {
    state.ui.dosManosCaida = false;
    HandPose.emitEvent('caida:fin', {
      timestamp: now,
    });
    eventState.lastDosManos = false;
  }
}

// Agregar método para actualizar eventos de UI
HandPose._updateEventState = updateEventState;

// Inicializar automáticamente cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    HandPose.init();
  });
} else {
  HandPose.init();
}

// Exponer en ventana global para debugging
window.HandPose = HandPose;
