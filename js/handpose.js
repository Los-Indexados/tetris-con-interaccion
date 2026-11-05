// ============================================================================
// TETRIS BODY - MÓDULO DE DETECCIÓN DE MANOS Y GESTOS
// ============================================================================

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
        hands: state.hands,
        gestures: state.gestures,
      };
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
