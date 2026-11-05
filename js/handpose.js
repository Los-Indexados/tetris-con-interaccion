// ============================================================================
// TETRIS BODY - MÓDULO DE DETECCIÓN DE MANOS Y GESTOS
// ============================================================================

// ============================================================================
// CONFIGURACIÓN GLOBAL
// ============================================================================
const CONFIG = {
  DEBUG: false, // Cambiar a true para ver esqueleto y puntos de las manos
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

  function initHandDetection() {
    // Esperar a que ml5.js esté disponible y completamente cargado
    if (typeof ml5 === 'undefined' || !ml5.handPose) {
      setTimeout(initHandDetection, 500);
      return;
    }

    try {
      // ml5.js v1.4.0 devuelve una Promesa
      ml5.handPose(state.camera.video.elt || state.camera.video).then((detector) => {
        onHandModelReady(detector);
      }).catch((error) => {
        console.error('❌ Error al cargar modelo handPose:', error);
      });
    } catch (error) {
      console.error('❌ Error al cargar modelo handPose: ' + error.message);
    }
  }

  function onHandModelReady(detector) {
    if (!detector) {
      console.error('❌ Detector no disponible');
      return;
    }

    state.detection.model = detector;
    state.detection.isModelReady = true;

    console.log('✅ Modelo handPose cargado y listo');

    // Iniciar detección continua con detectStart
    detector.detectStart(state.camera.video.elt || state.camera.video, onHandsEstimated);
  }

  function onHandsEstimated(results) {
    // results es un objeto con propiedades o un array según la versión
    let hands = Array.isArray(results) ? results : (results && results.hands) || [];

    if (!hands || hands.length === 0) {
      state.detection.hands = [];
      state.hands = [];
      return;
    }

    // Limitar a máximo 2 manos
    const detectedHands = hands.slice(0, state.detection.maxHands);

    // Procesar cada mano detectada
    const processedHands = detectedHands.map((hand) => {
      // Extraer landmarks en píxeles - pueden estar en diferentes formatos
      const landmarksPixels = (hand.landmarks || hand.keypoints || []).map((point) => {
        const x = Array.isArray(point) ? point[0] : point.x;
        const y = Array.isArray(point) ? point[1] : point.y;
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
        confidence: hand.confidence || 0,
      };
    });

    // Guardar manos detectadas
    state.detection.hands = processedHands;
    state.hands = processedHands;

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

      // Dibujar esqueleto (líneas verdes)
      p.stroke(0, 255, 0);
      p.strokeWeight(2);
      connections.forEach((connection) => {
        const start = landmarksPixels[connection[0]];
        const end = landmarksPixels[connection[1]];

        if (start && end) {
          p.line(start[0], start[1], end[0], end[1]);
        }
      });

      // Dibujar puntos clave (círculos rojos)
      p.fill(255, 0, 0);
      p.noStroke();
      landmarksPixels.forEach((point) => {
        p.ellipse(point[0], point[1], 5);
      });

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
        state.detection.model.detectStart(
          state.camera.video.elt || state.camera.video,
          onHandsEstimated
        );
        console.log('▶️ Detección de manos iniciada');
      } else {
        console.warn('⚠️ Modelo no listo para iniciar detección');
      }
    },

    // Detener detección de manos
    stop: function () {
      if (state.detection.model && state.detection.isModelReady) {
        state.detection.model.detectStop();
        state.detection.hands = [];
        state.hands = [];
        console.log('⏹️ Detección de manos detenida');
      }
    },

    // Obtener manos detectadas con coordenadas normalizadas
    getHands: function () {
      return state.hands.map((hand) => ({
        side: hand.side,
        landmarks: hand.landmarks,
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
