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
 * Mapa de controles (los ids vienen de la interfaz):
 *   control-left  -> moverIzquierda      control-right -> moverDerecha
 *   control-down  -> bajarRapido
 *   control-up    -> sin función por ahora (la interfaz igual emite el evento)
 *   control-a     -> rotar (derecha)      control-b     -> rotarIzquierda
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

  /* ---------------------------------------------------------------- entrada */

  function accion(fn) {
    if (!motor || !motor.estaActivo()) return;
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
      if (destino === 'game') ajustarLienzo();
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

  /* ------------------------------------------------------------------- p5 */

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
