/* ============================================================================
 * TETRIS CON INTERACCIÓN — Integración p5 (sketch.js)
 * ----------------------------------------------------------------------------
 * Único punto de unión entre:
 *   - el motor de js/gamelogic.js  (Pieza / Tablero / JuegoTetris)
 *   - la interfaz de js/interface.js (pantallas, botones, API de handpose)
 *   - p5.js (dibujo del tablero dentro del panel de la consola)
 *
 * Acá NO hay reglas de juego: solo se traducen eventos de la interfaz a
 * llamadas del motor y se dibuja el estado que el motor expone.
 *
 * Mapa de gestos (handpose.js):
 *   mano abierta -> mover:columna (x absoluta, 0-1) -> columna objetivo
 *   victoria (✌️) -> victoria:inicio/fin -> caída acelerada continua
 *   dos manos -> dos:manos -> iniciar/reiniciar partida
 *   rock (🤘) -> gesto:confirmado {gesto: 'ROCK'} -> ciclar fondos
 *   sin manos -> mano:perdida -> pausa automática
 *   mano reaparece -> mano:detectada -> reanudar desde pausa
 *
 * Los bloques se dibujan en el canvas que vive dentro de [data-tui-board].
 * La grilla del tablero es 16 x 16 y el contenedor es cuadrado (CSS).
 * ==========================================================================*/

(function () {
  'use strict';

  // Fix para evitar múltiples registraciones de AudioWorklet
  // Esto previene el error "a class with the same name is already registered"
  if (window.p5 && window.p5.prototype && !window.p5.prototype._soundInitialized) {
    window.p5.prototype._soundInitialized = true;
    // El AudioContext se inicializará bajo demanda en la primera interacción
  }

  var ui = null;
  var motor = null;
  var montura = null;

  var COLUMNAS = 16;
  var FILAS = 16;
  var COLORES = {};

  var puntajeMostrado = -1;
  var siguienteMostrada = null;
  var finMostrado = false;

  /* ---------------------------------------------------------------- medición */

  function medir() {
    if (!montura) return null;
    var ancho = Math.floor(montura.clientWidth);
    var alto = Math.floor(montura.clientHeight);
    if (ancho < 8 || alto < 8) return null;
    return { ancho: ancho, alto: alto };
  }

  /* El tablero está dentro de una pantalla que puede estar oculta: si no se
     puede medir todavía, queda el tamaño anterior y se corrige al entrar. */
  function ajustarLienzo() {
    var medida = medir();
    if (!medida) return;
    if (Math.round(width) !== medida.ancho || Math.round(height) !== medida.alto) {
      resizeCanvas(medida.ancho, medida.alto);
    }
  }

  /* ----------------------------------------------------------------- dibujo */

  function anchoCelda() {
    return width / COLUMNAS;
  }

  function altoCelda() {
    return height / FILAS;
  }

  function pintar(columna, fila, hex, alpha) {
    if (!hex) return;
    if (columna < 0 || columna >= COLUMNAS || fila < 0 || fila >= FILAS) return;

    var cw = anchoCelda();
    var ch = altoCelda();
    var x = columna * cw;
    var y = fila * ch;
    var relleno = color(hex);
    relleno.setAlpha(alpha == null ? 255 : alpha);

    noStroke();
    fill(relleno);
    rect(x + 1, y + 1, cw - 2, ch - 2, Math.max(2, cw * 0.12));

    if (alpha == null) {
      fill(255, 255, 255, 38);
      rect(x + cw * 0.16, y + ch * 0.12, cw * 0.68, Math.max(1, ch * 0.09), 2);
    }
  }

  function dibujarFijas() {
    var matriz = motor.tablero.matriz;
    for (var f = 0; f < FILAS; f++) {
      for (var c = 0; c < COLUMNAS; c++) {
        var tipo = matriz[f][c];
        if (tipo) pintar(c, f, COLORES[tipo], 255);
      }
    }
  }

  function dibujarPieza() {
    var pieza = motor.piezaActual;
    if (!pieza || motor.gameOver) return;

    var caida = motor.calcularCaida();
    if (caida > 0) {
      var fantasma = pieza.celdas(pieza.x, pieza.y + caida);
      for (var i = 0; i < fantasma.length; i++) {
        pintar(fantasma[i].x, fantasma[i].y, pieza.color, 70);
      }
    }

    var actuales = pieza.celdas();
    for (var j = 0; j < actuales.length; j++) {
      pintar(actuales[j].x, actuales[j].y, pieza.color, 255);
    }
  }

  /* -------------------------------------------------------------------- HUD */

  function sincronizarPuntaje() {
    if (!motor || motor.puntaje === puntajeMostrado) return;
    puntajeMostrado = motor.puntaje;
    ui.setStats({ score: motor.puntaje });
  }

  function pintarMini(pieza, grid) {
    var minX = 99;
    var maxX = -1;
    var minY = 99;
    var maxY = -1;
    var ocupadas = [];

    for (var f = 0; f < pieza.forma.length; f++) {
      for (var c = 0; c < pieza.forma[f].length; c++) {
        if (!pieza.forma[f][c]) continue;
        ocupadas.push({ c: c, f: f });
        if (c < minX) minX = c;
        if (c > maxX) maxX = c;
        if (f < minY) minY = f;
        if (f > maxY) maxY = f;
      }
    }
    if (ocupadas.length === 0) return;

    var ancho = maxX - minX + 1;
    var alto = maxY - minY + 1;
    var offX = Math.floor((4 - ancho) / 2);
    var offY = Math.floor((4 - alto) / 2);

    for (var i = 0; i < ocupadas.length; i++) {
      var indice = (offY + ocupadas[i].f - minY) * 4 + (offX + ocupadas[i].c - minX);
      var nodo = grid.children[indice];
      if (nodo) nodo.classList.add('tui-next__cell--' + pieza.tipo);
    }
  }

  function sincronizarSiguiente() {
    var pieza = motor.siguientePieza;
    if (!pieza || pieza === siguienteMostrada) return;
    siguienteMostrada = pieza;

    var destino = ui.getNextPieceMount();
    if (!destino) return;

    destino.textContent = '';

    var grid = document.createElement('div');
    grid.className = 'tui-next__grid';
    for (var i = 0; i < 16; i++) {
      var celda = document.createElement('span');
      celda.className = 'tui-next__cell';
      grid.appendChild(celda);
    }

    destino.appendChild(grid);
    pintarMini(pieza, grid);
  }

  /* ---------------------------------------------------------------- entrada */

  function accion(fn) {
    if (!motor || ui.getScreen() !== 'game' || !motor.estaActivo()) return;
    iniciarAudio();
    fn();
  }

  function conectarControles() {
    ui.on('control:left', function () {
      accion(function () { motor.moverIzquierda(); });
    });
    ui.on('control:right', function () {
      accion(function () { motor.moverDerecha(); });
    });
    ui.on('control:down', function () {
      accion(function () { motor.bajarRapido(); });
    });
    /* control-up queda sin función por ahora. La interfaz sigue emitiendo
       tui:control:up; acá simplemente no se escucha. */
    ui.on('control:a', function () {
      accion(function () { motor.rotar(); });
    });
    ui.on('control:b', function () {
      accion(function () { motor.rotarIzquierda(); });
    });
  }

  function conectarJuego() {
    ui.on('game:start', function () {
      motor.reiniciar();
      siguienteMostrada = null;
      puntajeMostrado = -1;
      finMostrado = false;
      iniciarAudio();
    });

    ui.on('game:pause', function () {
      if (motor.estaActivo()) motor.alternarPausa();
    });

    ui.on('game:resume', function () {
      if (motor.pausado) motor.alternarPausa();
      // El temporizador de caída arranca de cero al reanudar: no debe producirse
      // una caída inmediata por el tiempo que estuvo pausado.
      motor.acumuladorGravedad = 0;
    });

    ui.on('game:restart', function () {
      motor.reiniciar();
      siguienteMostrada = null;
      puntajeMostrado = -1;
      finMostrado = false;
      reanudarAudio();
    });

    ui.on('screen:change', function (evento) {
      var destino = evento && evento.detail ? evento.detail.screen : null;

      if (destino === 'game') {
        ajustarLienzo();
        iniciarAudio();
        /* Reintento por si el AudioContext se reanuda después del gesto. */
        window.setTimeout(intentarMusica, 400);
      } else {
        detenerMusica();
      }
    });
  }

  function conectarAudio() {
    motor.alCompletarLinea = function () {
      reproducirEfecto(sonidoLinea);
    };
    motor.alGameOver = function () {
      detenerMusica();
      reproducirEfecto(sonidoGameOver);
    };
    cargarAudios();
  }

  /* ------------------------------------------------- handpose (otro módulo) -- */

  var caidaAceleradaTimer = null;
  var objetivoMano = null;
  var direccionMano = 0;

  var CAIDA_ACELERADA_MS = 70;
  var caidaAceleradaActiva = false;
  var controlDownPresionado = false;

  // Control de fondos (4 escenarios)
  var backgroundIndex = 0;
  var BACKGROUNDS = ['catedral', 'puente-roto', 'santa-ana', 'tranvia'];
  var rockGestureCooldown = 0;

  /* La cámara llega en espejo (driver o "Mirror my camera" del sistema).
     style.css invierte la imagen del visor y acá se compensan las coordenadas
     para que el cursor y las columnas coincidan con lo que se ve en pantalla. */
  function espejoX(x) {
    return 1 - x;
  }

  function columnaVisible(columna) {
    return (COLUMNAS - 1) - columna;
  }

  /* Destello visual en un botón: ilumina el control sin ejecutar su acción.
     Sirve para confirmar en pantalla que el gesto se reconoció. */
  var destellos = {};

  function destello(id, ms) {
    if (!ui || typeof ui.press !== 'function') return;
    ui.press(id);
    if (destellos[id]) window.clearTimeout(destellos[id]);
    destellos[id] = window.setTimeout(function () {
      ui.release(id);
      delete destellos[id];
    }, ms || 180);
  }

  /* Caída acelerada activada únicamente por el gesto de victoria. */
  function actualizarCaidaAcelerada() {
    var activa = caidaAceleradaActiva;

    if (activa) {
      if (!controlDownPresionado) {
        ui.press('control-down');
        controlDownPresionado = true;
      }
      if (!caidaAceleradaTimer) {
        caidaAceleradaTimer = window.setInterval(function () {
          if (!motor || ui.getScreen() !== 'game' || !motor.estaActivo()) {
            cancelarCaidaAcelerada();
            return;
          }
          motor.bajarRapido();
        }, CAIDA_ACELERADA_MS);
      }
      return;
    }

    if (caidaAceleradaTimer) {
      window.clearInterval(caidaAceleradaTimer);
      caidaAceleradaTimer = null;
    }
    if (controlDownPresionado) {
      ui.release('control-down');
      controlDownPresionado = false;
    }
  }

  /* Corta la caída acelerada (pausa, game over o restart). */
  function cancelarCaidaAcelerada() {
    caidaAceleradaActiva = false;
    actualizarCaidaAcelerada();
  }

  /* Traduce la API de js/handpose.js a las acciones del juego y de la interfaz.
     No se modifica el módulo: solo se consumen sus callbacks y eventos. */
  var handPoseConectado = false;

  function conectarHandPose() {
    if (handPoseConectado) return;
    var hp = window.HandPose;
    if (!hp || typeof hp.on !== 'function') return;
    handPoseConectado = true;

    /* Movimiento absoluto: handpose.js envía la posición normalizada de la
       mano (0-1) y aplicarMovimientoMano() lleva la pieza una casilla por
       frame hacia la columna correspondiente. Así el desplazamiento de la mano
       es proporcional a toda la cuadrícula y la pieza no se queda a mitad de
       camino cuando la mano llega al borde. */
    document.addEventListener('mover:columna', function (evento) {
      if (!motor || ui.getScreen() !== 'game' || !motor.estaActivo()) return;

      var detalle = evento.detail || {};

      // x normalizada es la referencia principal (coordenadas de cámara).
      if (typeof detalle.x === 'number') {
        objetivoMano = espejoX(detalle.x);
        return;
      }

      // Compatibilidad con eventos que solo traen la columna entera.
      var columna = detalle.columna;
      if (typeof columna !== 'number') return;
      objetivoMano = columnaVisible(columna) / (COLUMNAS - 1);
    });

    /* Victoria: único gesto de caída acelerada (▼ queda iluminado). */

    /* Victoria: único gesto de caída acelerada (▼ queda iluminado). */
    document.addEventListener('victoria:inicio', function (evento) {
      if (ui.getScreen() !== 'game' || !motor.estaActivo()) return;
      caidaAceleradaActiva = true;
      actualizarCaidaAcelerada();
    });
    document.addEventListener('victoria:fin', function (evento) {
      caidaAceleradaActiva = false;
      actualizarCaidaAcelerada();
    });

    /* DOS MANOS: iniciar o reiniciar partida */
    document.addEventListener('dos:manos', function (evento) {
      var screen = ui.getScreen();
      
      // En game screen sin juego activo (inicio) → comenzar
      if (screen === 'game' && !motor.estaActivo() && !motor.gameOver) {
        // Ocultar overlay de inicio
        var startOverlay = document.querySelector('[data-tui-start-overlay]');
        if (startOverlay) startOverlay.style.display = 'none';
        
        // Iniciar juego
        motor.reiniciar();
        return;
      }
      
      // En game over → reiniciar
      if (screen === 'game' && motor.gameOver) {
        motor.reiniciar();
        return;
      }
    });

    /* ROCK: cambiar fondo (ciclo de 4 fondos) */
    document.addEventListener('gesto:confirmado', function (evento) {
      if (!evento.detail || evento.detail.gesto !== 'ROCK') return;
      
      var now = Date.now();
      if (now < rockGestureCooldown) return; // Evitar spam
      rockGestureCooldown = now + 300; // Cooldown de 300ms
      
      backgroundIndex = (backgroundIndex + 1) % BACKGROUNDS.length;
      var bgId = BACKGROUNDS[backgroundIndex];
      
      if (ui.setScenario && typeof ui.setScenario === 'function') {
        ui.setScenario(bgId);
      }
      
      if (typeof console !== 'undefined' && console.log) {
        console.log('🎨 Fondo cambiado a: ' + bgId);
      }
    });

    /* SIN MANOS: pausa automática (solo si se pierden TODAS las manos) */
    document.addEventListener('mano:perdida', function (evento) {
      // mano:perdida se emite cuando la cantidad de manos baja
      // Solo pausar si estamos en juego y el juego está activo
      if (ui.getScreen() !== 'game') return;
      if (motor && motor.estaActivo() && !motor.pausado) {
        // Verificar que sea realmente sin manos (cantidad = 0)
        if (evento.detail && evento.detail.cantidad !== undefined && evento.detail.cantidad > 0) {
          return; // Aún hay manos, no pausar
        }
        ui.trigger('pause');
      }
    });

    /* Reanudar cuando reaparece una mano durante la pausa */
    document.addEventListener('mano:detectada', function (evento) {
      // mano:detectada se emite cuando aparece una mano
      if (ui.getScreen() !== 'paused') return;
      if (motor && motor.pausado) {
        ui.trigger('resume');
      }
    });

    /* El módulo distingue navegación de menú y de juego. */
    ui.on('screen:change', function (evento) {
      var destino = evento && evento.detail ? evento.detail.screen : null;

      // Al cambiar de pantalla se corta toda acción continua y se olvida el
      // objetivo de la mano: nada debe seguir moviendo piezas fuera de partida.
      cancelarCaidaAcelerada();
      objetivoMano = null;
      direccionMano = 0;

      // Durante la partida activa el puntero no debe verse nunca.
      if (destino === 'game') ui.hideCursor();

      try {
        hp.setModo(destino === 'game' ? 'juego' : 'menu');
      } catch (error) {
        /* módulo opcional: si no expone setModo, se ignora */
      }
    });

    try {
      hp.setModo(ui.getScreen() === 'game' ? 'juego' : 'menu');
    } catch (error) {
      /* idem */
    }

    /* Debug del módulo sin tener que tocar código: abrir la página con ?debug */
    if (typeof hp.setDebug === 'function' && /[?&]debug\b/.test(window.location.search)) {
      try {
        hp.setDebug(true);
      } catch (error) {
        /* opcional */
      }
    }
  }

  /* ------------------------------------------------------------------- p5 */

  /* Lleva la pieza activa hacia la columna objetivo de la mano, una casilla
     por frame. Se usa la caja ocupada real de la pieza (min/max de la forma)
     para que su huella recorra todo el tablero y respete los bordes. */
  function aplicarMovimientoMano() {
    if (
      objetivoMano === null ||
      !motor ||
      ui.getScreen() !== 'game' ||
      !motor.estaActivo()
    ) {
      return;
    }

    var hp = window.HandPose;
    if (!hp || !hp.estado) return;

    var gesto = hp.estado.gesto;

    // La mano cerrada (o cualquier otro gesto) no debe mover la pieza.
    if (!gesto || gesto.indexOf('MANO_ABIERTA') !== 0) {
      objetivoMano = null;
      direccionMano = 0;
      return;
    }

    var pieza = motor.piezaActual;
    if (!pieza) return;

    var min = Infinity;
    var max = -Infinity;
    for (var f = 0; f < pieza.forma.length; f++) {
      for (var c = 0; c < pieza.forma[f].length; c++) {
        if (!pieza.forma[f][c]) continue;
        if (c < min) min = c;
        if (c > max) max = c;
      }
    }
    if (!isFinite(min) || !isFinite(max)) return;

    var anchoVisual = max - min + 1;
    var maxIzquierda = Math.max(0, COLUMNAS - anchoVisual);
    var objetivoIzquierda = Math.round(objetivoMano * maxIzquierda);
    objetivoIzquierda = Math.max(0, Math.min(maxIzquierda, objetivoIzquierda));

    var actualIzquierda = pieza.x + min;
    var dx = objetivoIzquierda - actualIzquierda;

    if (dx === 0) {
      direccionMano = 0;
      return;
    }

    var direccion = dx > 0 ? 1 : -1;
    if (direccion !== direccionMano) {
      direccionMano = direccion;
      destello(direccion > 0 ? 'control-right' : 'control-left', 120);
    }

    if (direccion > 0) motor.moverDerecha();
    else motor.moverIzquierda();
  }

  window.setup = function () {
    ui = window.TetrisUI;
    ui.init();

    montura = ui.getBoardMount();
    var medida = medir();

    var lienzo = createCanvas(medida ? medida.ancho : 480, medida ? medida.alto : 480);
    if (montura) lienzo.parent(montura);;
    textFont('monospace');

    COLUMNAS = window.Tetris.COLUMNAS;
    FILAS = window.Tetris.FILAS;
    COLORES = window.Tetris.COLORES_PIEZA;

    motor = new window.Tetris.JuegoTetris();
    window.juego = motor;

    conectarControles();
    conectarJuego();
    conectarAudio();
    conectarHandPose();

    /* handpose.js puede terminar de cargar después de este setup. */
    document.addEventListener('handpose:listo', conectarHandPose);

    ajustarLienzo();
    sincronizarPuntaje();
    sincronizarSiguiente();
  };

  window.windowResized = function () {
    ajustarLienzo();
  };

  window.draw = function () {
    clear();
    if (!motor) return;

    var enPartida = ui.getScreen() === 'game';
    if (enPartida && !motor.pausado && !motor.gameOver) {
      motor.actualizar(deltaTime);
      aplicarMovimientoMano();
    }

    if (motor.gameOver && !finMostrado) {
      finMostrado = true;
      ui.setStats({ score: motor.puntaje });
      ui.show('over');
    }

    dibujarFijas();
    dibujarPieza();
    sincronizarPuntaje();
    sincronizarSiguiente();
  };
})();
