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
    },
    hands: [],
    gestures: {},
  };

  // Callbacks para comunicación con el resto del equipo
  const callbacks = {
    onCameraError: null,
    onCameraActive: null,
    onHandsUpdate: null,
    onGestureDetected: null,
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

  async function initHandDetection() {
    // Esperar a que TensorFlow.js esté disponible
    if (typeof tf === 'undefined' || typeof handPoseDetection === 'undefined') {
      console.log('⏳ Esperando TensorFlow.js...');
      setTimeout(initHandDetection, 500);
      return;
    }

    // Verificar que el video esté listo
    if (!state.camera.video || !state.camera.isActive) {
      console.log('⏳ Esperando video...');
      setTimeout(initHandDetection, 500);
      return;
    }

    try {
      console.log('🚀 Cargando modelo handPose con TensorFlow.js...');
      
      // Usar el detector de hand-pose-detection
      const detector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'tfjs',
          modelType: 'full',
        }
      );

      onHandModelReady(null, detector);
    } catch (error) {
      console.error('❌ Error al cargar modelo handPose:', error.message);
      
      if (modelLoadRetries < MAX_MODEL_LOAD_RETRIES) {
        modelLoadRetries++;
        setTimeout(initHandDetection, 2000);
      } else {
        console.error('❌ Falló cargar modelo después de ' + MAX_MODEL_LOAD_RETRIES + ' intentos');
      }
    }
  }

  function onHandModelReady(error, detector) {
    if (error) {
      console.error('❌ Error al cargar modelo:', error);
      return;
    }

    if (!detector) {
      console.error('❌ Detector no disponible');
      return;
    }

    modelLoadRetries = 0; // Reset on success
    state.detection.model = detector;
    state.detection.isModelReady = true;

    console.log('✅ Modelo handPose cargado y listo');

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
      // hand-pose-detection: detectHands devuelve Promesa
      const videoSource = state.camera.video.elt || state.camera.video;
      const hands = await state.detection.model.estimateHands(videoSource, {
        flipHorizontal: false,
      });

      onHandsEstimated(hands);
    } catch (error) {
      console.error('Error en detección:', error.message);
    }

    // Continuar en el siguiente frame
    requestAnimationFrame(detectHands);
  }

  function onHandsEstimated(hands) {
    // hand-pose-detection devuelve array de manos
    let handsList = Array.isArray(hands) ? hands : [];

    if (!handsList || handsList.length === 0) {
      state.detection.hands = [];
      state.hands = [];
      return;
    }

    // Limitar a máximo 2 manos
    const detectedHands = handsList.slice(0, state.detection.maxHands);

    // Procesar cada mano detectada
    const processedHands = detectedHands.map((hand) => {
      // hand-pose-detection devuelve keypoints como array de objetos {x, y, z, name}
      const landmarksPixels = (hand.keypoints || []).map((point) => {
        const x = point.x || 0;
        const y = point.y || 0;
        return [x, y];
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

      return {
        side: hand.handedness || 'unknown',
        landmarks: landmarksNormalized,
        palmCenter: palmCenter,
        confidence: hand.score || 0,
      };
    });

    // Aplicar suavizado
    const currentTime = Date.now();
    const smoothedHands = applySmoothingFilter(processedHands, currentTime);

    // Manejar desaparición de manos
    handleHandDisappearance(currentTime);

    // Guardar manos detectadas (ya suavizadas)
    state.detection.hands = smoothedHands;
    state.hands = smoothedHands;

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
      // Convertir coordenadas normalizadas (0-1) a píxeles
      const landmarksPixels = hand.landmarks.map((point) => [
        point[0] * state.camera.width,
        point[1] * state.camera.height,
      ]);

      // Dibujar esqueleto suavizado (líneas verdes)
      p.stroke(0, 255, 0);
      p.strokeWeight(2);
      connections.forEach((connection) => {
        const start = landmarksPixels[connection[0]];
        const end = landmarksPixels[connection[1]];

        if (start && end) {
          p.line(start[0], start[1], end[0], end[1]);
        }
      });

      // Dibujar puntos suavizados (círculos verdes)
      p.fill(0, 255, 0);
      p.noStroke();
      landmarksPixels.forEach((point) => {
        p.ellipse(point[0], point[1], 6);
      });

      // Dibujar puntos crudos si disponibles (círculos rojos pequeños)
      if (hand.landmarksRaw && CONFIG.SMOOTHING_ENABLED) {
        const landmarksRawPixels = hand.landmarksRaw.map((point) => [
          point[0] * state.camera.width,
          point[1] * state.camera.height,
        ]);

        p.fill(255, 0, 0);
        p.noStroke();
        landmarksRawPixels.forEach((point) => {
          p.ellipse(point[0], point[1], 3);
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
      const firstPointPixels = landmarksPixels[0];
      if (firstPointPixels) {
        p.fill(255, 255, 0);
        p.textSize(12);
        p.text(hand.side, firstPointPixels[0] + 10, firstPointPixels[1] - 10);
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
        gestures: state.gestures,
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
  };
})();

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
