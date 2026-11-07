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
 * handpose.js (módulo externo, no se modifica) se consume así:
 *   mover:columna (delta) -> una celda por columna que cruza la mano
 *   rotarHorario/Antihorario -> motor; pausar (puño) -> menú de pausa
 *   caidaRapidaInicio/Fin (dos manos) -> caída rápida sostenida
 *   cursorMover/Click    -> TetrisUI.moveCursor / clickAt
 *   El modo menu/juego se cambia solo al navegar; debug con ?debug en la URL.
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

  var caidaRapidaTimer = null;
  var ultimaColumnaMano = null;

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

  function iniciarCaidaRapida() {
    if (caidaRapidaTimer) return;
    caidaRapidaTimer = window.setInterval(function () {
      if (!motor || !motor.estaActivo()) {
        detenerCaidaRapida();
        return;
      }
      motor.bajarRapido();
    }, 70);
  }

  function detenerCaidaRapida() {
    if (!caidaRapidaTimer) return;
    window.clearInterval(caidaRapidaTimer);
    caidaRapidaTimer = null;
  }

  /* Traduce la API de js/handpose.js a las acciones del juego y de la interfaz.
     No se modifica el módulo: solo se consumen sus callbacks y eventos. */
  var handPoseConectado = false;

  function conectarHandPose() {
    if (handPoseConectado) return;
    var hp = window.HandPose;
    if (!hp || typeof hp.on !== 'function') return;
    handPoseConectado = true;

    /* Movimiento: se escucha el evento crudo de columna y se mueve una celda
       por cada columna que cruza la mano. El callback de la integración mapea
       la posición absoluta (izquierda/derecha del centro), lo que empujaría la
       pieza sin parar hacia un lado mientras la mano siga en esa mitad. */
    document.addEventListener('mover:columna', function (evento) {
      if (!motor || ui.getScreen() !== 'game' || !motor.estaActivo()) return;

      var columna = evento.detail ? evento.detail.columna : null;
      if (typeof columna !== 'number') return;
      columna = columnaVisible(columna);

      if (ultimaColumnaMano === null) {
        ultimaColumnaMano = columna;
        return;
      }

      var delta = columna - ultimaColumnaMano;
      ultimaColumnaMano = columna;
      if (delta === 0) return;

      var pasos = Math.min(4, Math.abs(delta));
      for (var i = 0; i < pasos; i++) {
        if (delta < 0) motor.moverIzquierda();
        else motor.moverDerecha();
      }
      destello(delta < 0 ? 'control-left' : 'control-right', 140);
    });

    hp.on('rotarHorario', function () {
      destello('control-a');
      accion(function () { motor.rotar(); });
    });
    hp.on('rotarAntihorario', function () {
      destello('control-b');
      accion(function () { motor.rotarIzquierda(); });
    });

    /* Puño: se ilumina PAUSA y recién después se abre el menú, para que el
       gesto se vea en pantalla. */
    hp.on('pausar', function () {
      if (ui.getScreen() !== 'game') return;
      destello('pause', 260);
      window.setTimeout(function () {
        if (ui.getScreen() === 'game') ui.show('paused');
      }, 180);
    });

    /* Dos manos: caída rápida mientras se sostiene (▼ queda iluminado). */
    hp.on('caidaRapidaInicio', function () {
      ui.press('control-down');
      iniciarCaidaRapida();
    });
    hp.on('caidaRapidaFin', function () {
      ui.release('control-down');
      detenerCaidaRapida();
    });

    /* Cursor: mueve el puntero y activa el botón que quede debajo. */
    hp.on('cursorMover', function (datos) {
      ui.moveCursor(espejoX(datos.x), datos.y);
    });
    hp.on('cursorClick', function (datos) {
      ui.clickAt(espejoX(datos.x), datos.y);
    });

    document.addEventListener('cursor:mostrar', function (evento) {
      if (evento.detail) ui.moveCursor(espejoX(evento.detail.x), evento.detail.y);
    });
    document.addEventListener('cursor:ocultar', function () {
      ui.hideCursor();
    });

    /* El módulo distingue navegación de menú y de juego. */
    ui.on('screen:change', function (evento) {
      var destino = evento && evento.detail ? evento.detail.screen : null;
      if (destino !== 'game') detenerCaidaRapida();
      ultimaColumnaMano = null;
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
