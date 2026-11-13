/* ============================================================================
 * TETRIS CON INTERACCIÓN — Integración p5 (sketch.js)
 * ----------------------------------------------------------------------------
 * Único punto de unión entre:
 *   - el motor de js/gamelogic.js  (Pieza / Tablero / JuegoTetris)
 *   - la interfaz de js/interface.js (pantallas y monturas de dibujo)
 *   - p5.js (dibujo del tablero dentro del panel de la consola)
 *
 * Acá NO hay reglas de juego: solo se traducen eventos de las manos a
 * llamadas del motor y se dibuja el estado que el motor expone.
 *
 * Flujo de pantallas (única fuente de verdad: Tetris.accionSegunManos):
 *   ready  -> dos manos: arranca la partida
 *   game   -> sin manos: pausa
 *   paused -> al menos una mano: reanuda
 *   over   -> dos manos: reinicia
 *
 * Mapa de gestos (handpose.js):
 *   mano abierta -> mover:columna (x absoluta, 0-1) -> columna objetivo
 *   victoria (✌️) -> gesto sostenido -> caída acelerada continua
 *   pulgar arriba (👍) -> gesto:confirmado {gesto: 'PULGAR_ARRIBA'} -> rotar
 *   rock (🤘) -> gesto:confirmado {gesto: 'ROCK'} -> ciclar escenarios
 *
 * Los bloques se dibujan en el canvas que vive dentro de [data-tui-board].
 * La grilla del tablero es 16 x 16 y el contenedor es cuadrado (CSS).
 * ==========================================================================*/

(function () {
  'use strict';

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

  /* ------------------------------------------------------- estado de partida */

  function configurarModoHandPose(modo) {
    var hp = window.HandPose;
    if (!hp || typeof hp.setModo !== 'function') return;
    try {
      hp.setModo(modo);
    } catch (error) {
      /* módulo opcional: si no expone setModo, se ignora */
    }
  }

  function reiniciarMarcadores() {
    siguienteMostrada = null;
    puntajeMostrado = -1;
    finMostrado = false;
  }

  /* Arranca o reinicia la partida. Sale de 'ready' o de 'over'. */
  function iniciarPartida() {
    motor.reiniciar();
    reiniciarMarcadores();
    cancelarCaidaAcelerada();
    objetivoMano = null;
    ui.show('game');
    ui.pulseGesture('dos-manos');
    reanudarAudio();
  }

  /* Sin manos durante la partida: pausa. */
  function pausarPartida() {
    if (ui.getScreen() !== 'game') return;
    if (!motor.pausar()) return;
    cancelarCaidaAcelerada();
    objetivoMano = null;
    ui.show('paused');
  }

  /* Reaparece al menos una mano durante la pausa: reanuda sola. */
  function reanudarPartida() {
    if (ui.getScreen() !== 'paused') return;
    if (!motor.reanudar()) return;
    ui.show('game');
  }

  /* Toda la decisión vive en el motor (Tetris.accionSegunManos). */
  function aplicarAccionManos(cantidad) {
    if (!window.Tetris || typeof window.Tetris.accionSegunManos !== 'function') return;

    var accion = window.Tetris.accionSegunManos(ui.getScreen(), cantidad);
    if (accion === 'iniciar' || accion === 'reiniciar') {
      iniciarPartida();
    } else if (accion === 'pausar') {
      pausarPartida();
    } else if (accion === 'reanudar') {
      reanudarPartida();
    }
  }

  function cantidadDeManos(evento) {
    var detalle = evento && evento.detail ? evento.detail : {};
    if (typeof detalle.cantidad === 'number') return detalle.cantidad;

    var hp = window.HandPose;
    return hp && hp.estado ? hp.estado.cantidadManos : 0;
  }

  /* ---------------------------------------------------------------- pantallas */

  function conectarPantallas() {
    ui.on('screen:change', function (evento) {
      var destino = evento && evento.detail ? evento.detail.screen : null;

      // Al cambiar de pantalla se corta toda acción continua y se olvida el
      // objetivo de la mano: nada debe seguir moviendo piezas fuera de partida.
      cancelarCaidaAcelerada();
      objetivoMano = null;

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

  var CAIDA_ACELERADA_MS = 70;

  /* La cámara llega en espejo (driver o "Mirror my camera" del sistema).
     style.css invierte la imagen del visor y acá se compensan las coordenadas
     para que el cursor y las columnas coincidan con lo que se ve en pantalla. */
  function espejoX(x) {
    return 1 - x;
  }

  function columnaVisible(columna) {
    return (COLUMNAS - 1) - columna;
  }

  /* ¿La mano está mostrando el gesto de victoria en una partida activa? */
  function gestoVictoriaActivo() {
    if (!motor || ui.getScreen() !== 'game' || !motor.estaActivo()) return false;

    var hp = window.HandPose;
    return !!(hp && hp.estado && hp.estado.gesto === 'VICTORIA');
  }

  /* La caída acelerada sigue al gesto detectado, no a un evento de entrada:
     mientras VICTORIA siga presente el intervalo corre; cuando el gesto cambia
     (o la partida se pausa) se corta. */
  function actualizarCaidaAcelerada() {
    if (gestoVictoriaActivo()) {
      if (!caidaAceleradaTimer) {
        caidaAceleradaTimer = window.setInterval(function () {
          if (!gestoVictoriaActivo()) {
            cancelarCaidaAcelerada();
            return;
          }
          motor.bajarRapido();
        }, CAIDA_ACELERADA_MS);
      }
      return;
    }

    cancelarCaidaAcelerada();
  }

  /* Corta el intervalo; si el gesto sigue activo, el próximo frame lo reanuda. */
  function cancelarCaidaAcelerada() {
    if (!caidaAceleradaTimer) return;

    window.clearInterval(caidaAceleradaTimer);
    caidaAceleradaTimer = null;
  }

  /* Traduce la API de js/handpose.js a las acciones del juego y de la interfaz.
     No se modifica el módulo: solo se consumen sus eventos. */
  var handPoseConectado = false;

  function conectarHandPose() {
    if (handPoseConectado) return;
    var hp = window.HandPose;
    if (!hp || typeof hp.on !== 'function') return;
    handPoseConectado = true;

    /* Movimiento absoluto: handpose.js envía la posición normalizada de la
       mano (0-1) y aplicarMovimientoMano() lleva la pieza una casilla por
       frame hacia la columna correspondiente. */
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

    /* La caída acelerada se resuelve en cada frame leyendo el gesto actual
       (ver gestoVictoriaActivo): no depende de eventos de inicio/fin. */

    /* Una o dos manos: el juego sigue. Ninguna: pausa. La decisión depende de
       la pantalla y vive en Tetris.accionSegunManos. */
    document.addEventListener('mano:detectada', function (evento) {
      aplicarAccionManos(cantidadDeManos(evento));
    });
    document.addEventListener('mano:perdida', function (evento) {
      aplicarAccionManos(cantidadDeManos(evento));
    });

    /* ROCK: siguiente escenario del ciclo. PULGAR_ARRIBA: rotar la pieza. */
    document.addEventListener('gesto:confirmado', function (evento) {
      var gesto = evento.detail && evento.detail.gesto;

      if (gesto === 'PULGAR_ARRIBA') {
        if (ui.getScreen() !== 'game' || !motor.estaActivo()) return;
        ui.pulseGesture('pulgar');
        motor.rotar();
        return;
      }

      if (gesto !== 'ROCK') return;

      // El cooldown lo maneja handpose (300 ms por gesto): cada confirmación
      // avanza un escenario mientras ROCK siga detectado.
      ui.pulseGesture('rock');
      var siguiente = ui.getNextScenario();
      if (siguiente) ui.setScenario(siguiente.id);
    });

    /* Sin menús: el módulo de manos siempre trabaja en modo juego. */
    configurarModoHandPose('juego');

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

    if (dx === 0) return;

    if (dx > 0) motor.moverDerecha();
    else motor.moverIzquierda();
  }

  window.setup = function () {
    ui = window.TetrisUI;
    ui.init();

    montura = ui.getBoardMount();
    var medida = medir();

    var lienzo = createCanvas(medida ? medida.ancho : 480, medida ? medida.alto : 480);
    if (montura) lienzo.parent(montura);
    textFont('monospace');

    COLUMNAS = window.Tetris.COLUMNAS;
    FILAS = window.Tetris.FILAS;
    COLORES = window.Tetris.COLORES_PIEZA;

    motor = new window.Tetris.JuegoTetris();
    window.juego = motor;

    conectarPantallas();
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

  /* Refleja en el panel izquierdo el gesto que está activo ahora mismo. */
  function sincronizarPanelGestos() {
    var hp = window.HandPose;
    var gesto = hp && hp.estado ? hp.estado.gesto : null;
    var enPartida = ui.getScreen() === 'game' && motor && motor.estaActivo();

    ui.setGesture('mano-abierta', enPartida && !!gesto && gesto.indexOf('MANO_ABIERTA') === 0);
    ui.setGesture('victoria', enPartida && gesto === 'VICTORIA');
    ui.setGesture('sin-manos', ui.getScreen() === 'paused');
  }

  window.draw = function () {
    clear();
    if (!motor) return;

    actualizarCaidaAcelerada();
    sincronizarPanelGestos();

    if (ui.getScreen() === 'game' && motor.estaActivo()) {
      motor.actualizar(deltaTime);
      aplicarMovimientoMano();
    }

    if (motor.gameOver && !finMostrado) {
      finMostrado = true;
      cancelarCaidaAcelerada();
      ui.setStats({ score: motor.puntaje });
      ui.show('over');
    }

    dibujarFijas();
    dibujarPieza();
    sincronizarPuntaje();
    sincronizarSiguiente();
  };
})();
