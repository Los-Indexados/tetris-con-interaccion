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
    onHandsDetected: null,
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
  // Limita a 2 manos máximo y distingue izquierda/derecha.

  function initHandDetection() {
    // Esperar a que ml5.js esté disponible y completamente cargado
    if (typeof ml5 === 'undefined' || !ml5.handPose) {
      console.warn('⏳ Esperando a ml5.js...');
      setTimeout(initHandDetection, 500);
      return;
    }

    try {
      console.log('🚀 Iniciando ml5.handPose...');
      
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

  function detectHands() {
    // detectStart ya maneja el loop automáticamente
    // Esta función queda vacía pero la mantemos para compatibilidad
  }

  function onHandsEstimated(results) {
    console.log('🎯 Callback onHandsEstimated ejecutado:', results);
    
    // results es un objeto con propiedades o un array según la versión
    let hands = Array.isArray(results) ? results : (results && results.hands) || [];

    console.log('👐 Manos detectadas:', hands.length);

    if (!hands || hands.length === 0) {
      state.detection.hands = [];
      state.hands = [];
      return;
    }

    // Limitar a máximo 2 manos
    const detectedHands = hands.slice(0, state.detection.maxHands);

    // Procesar cada mano detectada
    const processedHands = detectedHands.map((hand) => {
      // Extraer landmarks - pueden estar en diferentes formatos
      const landmarks = (hand.landmarks || hand.keypoints || []).map((point) => {
        const x = Array.isArray(point) ? point[0] : point.x;
        const y = Array.isArray(point) ? point[1] : point.y;
        const z = Array.isArray(point) ? point[2] : (point.z || 0);

        return [
          x, // Sin invertir - el CSS maneja el espejo visualmente
          y, // Y sin cambios
          z, // Confianza/profundidad
        ];
      });

      return {
        landmarks: landmarks,
        handedness: hand.handedness || 'unknown',
        confidence: hand.confidence || 0,
      };
    });

    // Guardar manos detectadas
    state.detection.hands = processedHands;
    state.hands = processedHands;

    // Actualizar FPS de detección
    updateDetectionFps();

    // Emitir evento de manos detectadas
    if (callbacks.onHandsDetected) {
      callbacks.onHandsDetected({
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

  function drawDebugHands(p) {
    if (!CONFIG.DEBUG) {
      return;
    }

    const hands = state.detection.hands;
    
    if (hands.length > 0) {
      console.log('🎨 Dibujando', hands.length, 'manos', 'p5 disponible:', p !== undefined);
    }

    if (!p) {
      console.error('❌ p5 no disponible en drawDebugHands');
      return;
    }

    hands.forEach((hand) => {
      // Definir conexiones del esqueleto de la mano (21 puntos)
      const connections = [
        // Pulgar
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        // Índice
        [0, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        // Medio
        [0, 9],
        [9, 10],
        [10, 11],
        [11, 12],
        // Anular
        [0, 13],
        [13, 14],
        [14, 15],
        [15, 16],
        // Meñique
        [0, 17],
        [17, 18],
        [18, 19],
        [19, 20],
        // Palma
        [5, 9],
        [9, 13],
        [13, 17],
      ];

      // Dibujar esqueleto (líneas)
      p.stroke(0, 255, 0);
      p.strokeWeight(2);
      connections.forEach((connection) => {
        const start = hand.landmarks[connection[0]];
        const end = hand.landmarks[connection[1]];

        if (start && end) {
          p.line(start[0], start[1], end[0], end[1]);
        }
      });

      // Dibujar puntos clave
      p.fill(255, 0, 0);
      p.noStroke();
      hand.landmarks.forEach((point) => {
        if (point) {
          p.ellipse(point[0], point[1], 5);
        }
      });

      // Dibujar etiqueta de mano (izquierda/derecha)
      const firstPoint = hand.landmarks[0];
      if (firstPoint) {
        p.fill(255, 255, 0);
        p.textSize(12);
        p.text(hand.handedness, firstPoint[0] + 10, firstPoint[1] - 10);
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
      } else if (event === 'handsDetected') {
        callbacks.onHandsDetected = callback;
      } else if (event === 'gestureDetected') {
        callbacks.onGestureDetected = callback;
      }
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
