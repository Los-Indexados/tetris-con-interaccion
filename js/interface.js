/* ============================================================================
 * TETRIS CON INTERACCIÓN — Interfaz de la partida
 * ----------------------------------------------------------------------------
 * Módulo aislado dentro de un IIFE. Expone UN solo global: window.TetrisUI.
 * Prefijo exclusivo en todo lo que toca el DOM:
 *   - clases CSS:      tui-
 *   - atributos:       data-tui-*
 *   - eventos:         tui:*
 *
 * No hay menús, botones ni cursores: la partida se controla únicamente con las
 * manos. Este módulo solo construye el escenario y cambia de pantalla.
 *
 * Pantallas (data-tui-screen en la raíz):
 *   'ready'  Partida preparada, esperando las dos manos. El tablero ya se ve.
 *   'game'   Partida activa.
 *   'paused' Sin manos: solo muestra «PAUSA».
 *   'over'   Fin de partida: «GAME OVER» + indicación de dos manos.
 *
 * API pública (controlador / handpose):
 *   TetrisUI.init()                      Monta la interfaz (idempotente)
 *   TetrisUI.show(screen)                'ready' | 'game' | 'paused' | 'over'
 *   TetrisUI.getScreen()                 Pantalla activa
 *   TetrisUI.setScenario(id)             'catedral' | 'puente-roto' | 'santa-ana' | 'tranvia'
 *   TetrisUI.getScenario()               Escenario activo
 *   TetrisUI.getNextScenario()           Siguiente escenario del ciclo
 *   TetrisUI.setStats({ score: 1200 })   Puntuación
 *   TetrisUI.setGesture(id, active)      Ilumina/apaga una fila de gestos
 *   TetrisUI.pulseGesture(id)            Destello breve de una fila
 *   TetrisUI.on(evento, fn)              Suscripción; devuelve unsubscribe
 *   TetrisUI.getBoardMount()             Nodo reservado para el tablero (p5)
 *   TetrisUI.getCameraMount()            Nodo reservado para la cámara (handpose)
 *   TetrisUI.getNextPieceMount()         Nodo reservado para la pieza siguiente
 *
 * Eventos emitidos (CustomEvent sobre el nodo raíz, con burbujeo):
 *   tui:ready, tui:screen:change, tui:scenario:change
 *
 * Este módulo NO dibuja con p5.js, NO reconoce gestos y NO ejecuta lógica de
 * juego: solo estructura, estado visual y eventos.
 * ==========================================================================*/

(function () {
  'use strict';

  /* Un solo global: si ya existe, no se vuelve a montar ni se pisan funciones. */
  if (window.TetrisUI) return;

  var ROOT_ID = 'tui-app';
  var SCREENS = ['ready', 'game', 'paused', 'over'];

  var SCENARIOS = [
    { id: 'catedral', label: 'Catedral', index: '01' },
    { id: 'puente-roto', label: 'Puente Roto', index: '02' },
    { id: 'santa-ana', label: 'Santa Ana', index: '03' },
    { id: 'tranvia', label: 'Tranvía', index: '04' }
  ];

  /* Guía de gestos del lateral izquierdo. El id es el que usa el controlador
     (sketch.js) para iluminar la fila correspondiente. */
  var GESTOS_PANEL = [
    { id: 'mano-abierta', icono: '🖐️', nombre: 'Mano abierta', accion: 'Mover' },
    { id: 'victoria', icono: '✌️', nombre: 'Victoria', accion: 'Caída rápida' },
    { id: 'pulgar', icono: '👍', nombre: 'Pulgar arriba', accion: 'Rotar' },
    { id: 'rock', icono: '🤘', nombre: 'Rock', accion: 'Escenario' },
    { id: 'dos-manos', icono: '👐', nombre: 'Dos manos', accion: 'Iniciar / Reiniciar' },
    { id: 'sin-manos', icono: '✋', nombre: 'Sin manos', accion: 'Pausa' }
  ];

  var state = {
    screen: 'ready',
    scenario: SCENARIOS[0].id
  };

  var root = null;
  var gestureNodes = Object.create(null);
  var gestureTimers = Object.create(null);

  /* ---------------------------------------------------------------- helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function findScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
  }

  function indexOfScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return i;
    }
    return 0;
  }

  /* Siguiente escenario del ciclo; el indicador lo muestra. */
  function nextScenario() {
    var siguiente = (indexOfScenario(state.scenario) + 1) % SCENARIOS.length;
    return SCENARIOS[siguiente];
  }

  /* ----------------------------------------------------------------- events */

  function emit(name, detail) {
    if (!root) return;
    var payload = { screen: state.screen, scenario: state.scenario };
    if (detail) {
      for (var key in detail) {
        if (Object.prototype.hasOwnProperty.call(detail, key)) payload[key] = detail[key];
      }
    }
    root.dispatchEvent(new CustomEvent('tui:' + name, { detail: payload, bubbles: true }));
  }

  function normalizeEventName(name) {
    return 'tui:' + String(name).replace(/^tui:/, '');
  }

  function on(name, handler) {
    if (!ensure() || typeof handler !== 'function') return function () {};
    var eventName = normalizeEventName(name);
    root.addEventListener(eventName, handler);
    return function offOne() {
      root.removeEventListener(eventName, handler);
    };
  }

  function off(name, handler) {
    if (!root || typeof handler !== 'function') return;
    root.removeEventListener(normalizeEventName(name), handler);
  }

  /* ---------------------------------------------------------------- screens */

  /* Escenario completo: carcasa, tablero, puntuación, pieza siguiente y cámara.
     El tablero se dibuja con p5 (sketch.js). */
  function buildGame() {
    var section = el('section', 'tui-screen tui-screen--game');
    section.setAttribute('aria-label', 'Pantalla de partida');

    var consoleBox = el('div', 'tui-console');

    /* Barra superior de la carcasa. */
    var bar = el('header', 'tui-console__bar');
    var brand = el('div', 'tui-console__brand');
    brand.appendChild(el('span', 'tui-console__logo', 'Tetris'));
    var scenarioName = el('span', 'tui-console__scenario', '');
    scenarioName.setAttribute('data-tui-scenario-name', '');
    brand.appendChild(scenarioName);
    bar.appendChild(brand);
    consoleBox.appendChild(bar);

    /* Pantalla: bisel + tablero (lo dibuja el juego, aquí solo se reserva). */
    var screenArea = el('div', 'tui-console__screen');
    var bezel = el('div', 'tui-console__bezel');
    var board = el('div', 'tui-board');
    board.setAttribute('data-tui-board', '');
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label', 'Tablero de Tetris');
    bezel.appendChild(board);
    screenArea.appendChild(bezel);
    screenArea.appendChild(el('span', 'tui-console__tag', 'Color \u00B7 16 \u00D7 16'));
    consoleBox.appendChild(screenArea);

    /* Panel derecho: puntuación, pieza siguiente y cámara. */
    var panel = el('aside', 'tui-console__panel');
    panel.setAttribute('aria-label', 'Puntuación, pieza siguiente y cámara');

    var scoreBox = el('div', 'tui-console__score');
    scoreBox.appendChild(el('span', 'tui-console__score-label', 'Puntuación'));
    var scoreValue = el('span', 'tui-console__score-value', '000000');
    scoreValue.setAttribute('data-tui-stat', 'score');
    scoreBox.appendChild(scoreValue);
    panel.appendChild(scoreBox);

    var next = el('div', 'tui-panel');
    next.appendChild(el('p', 'tui-panel__title', 'Siguiente'));
    var nextMount = el('div', 'tui-next');
    nextMount.setAttribute('data-tui-next', '');
    next.appendChild(nextMount);
    panel.appendChild(next);

    var camera = el('div', 'tui-camera');
    var cameraSlot = el('div', 'tui-camera__slot');
    cameraSlot.id = 'camera-container';
    cameraSlot.setAttribute('data-tui-camera', '');
    var cameraPlaceholder = el('div', 'tui-camera__placeholder');
    cameraPlaceholder.setAttribute('aria-hidden', 'true');
    cameraPlaceholder.appendChild(el('span', 'tui-camera__dot'));
    cameraPlaceholder.appendChild(el('span', 'tui-camera__label', 'Cámara'));
    cameraPlaceholder.appendChild(el('span', 'tui-camera__hint', 'Handpose · sin señal'));
    camera.appendChild(cameraSlot);
    camera.appendChild(cameraPlaceholder);
    panel.appendChild(camera);

    consoleBox.appendChild(panel);
    consoleBox.appendChild(buildGestures());

    /* Indicador discreto: vista previa del siguiente escenario. */
    consoleBox.appendChild(buildNextScenario());

    section.appendChild(consoleBox);
    section.appendChild(buildReadyHint());

    return section;
  }

  /* Indicación de inicio. Sin caja: solo oscurece el escenario y centra el
     título, las dos manos y la instrucción. */
  function buildReadyHint() {
    var overlay = el('div', 'tui-game-start-overlay');
    overlay.setAttribute('data-tui-start-overlay', '');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var content = el('div', 'tui-start');

    var title = el('p', 'tui-start__title');
    ['T', 'E', 'T', 'R', 'I', 'S'].forEach(function (letra) {
      title.appendChild(el('span', 'tui-start__letter', letra));
    });
    content.appendChild(title);

    var hands = el('div', 'tui-start__hands');
    hands.setAttribute('aria-hidden', 'true');
    hands.appendChild(el('span', 'tui-start__hand', '🖐️'));
    hands.appendChild(el('span', 'tui-start__hand tui-start__hand--right', '🖐️'));
    content.appendChild(hands);

    content.appendChild(el('p', 'tui-game-start-text', 'Coloca las dos manos para comenzar'));

    overlay.appendChild(content);

    return overlay;
  }

  function buildNextScenario() {
    var box = el('div', 'tui-scenario-next');
    box.setAttribute('data-tui-next-scenario', '');
    box.setAttribute('aria-hidden', 'true');

    box.appendChild(el('span', 'tui-scenario-next__label', 'Siguiente'));
    box.appendChild(el('span', 'tui-scenario-next__preview'));
    box.appendChild(el('span', 'tui-scenario-next__name'));

    return box;
  }

  /* Lateral izquierdo: icono de cada gesto, qué hace y estado iluminado. */
  function buildGestures() {
    var panel = el('aside', 'tui-gestures');
    panel.setAttribute('aria-label', 'Guía de gestos');

    panel.appendChild(el('p', 'tui-gestures__title', 'Gestos'));

    var list = el('ul', 'tui-gestures__list');

    GESTOS_PANEL.forEach(function (gesto) {
      var item = el('li', 'tui-gesture');
      item.setAttribute('data-tui-gesture', gesto.id);

      var icono = el('span', 'tui-gesture__icon', gesto.icono);
      icono.setAttribute('aria-hidden', 'true');
      item.appendChild(icono);

      var text = el('span', 'tui-gesture__text');
      text.appendChild(el('span', 'tui-gesture__name', gesto.nombre));
      text.appendChild(el('span', 'tui-gesture__action', gesto.accion));
      item.appendChild(text);

      gestureNodes[gesto.id] = item;
      list.appendChild(item);
    });

    panel.appendChild(list);
    return panel;
  }

  function buildPause() {
    var overlay = el('div', 'tui-pause');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var panel = el('div', 'tui-pause__panel');
    var title = el('h2', 'tui-title', 'PAUSA');
    title.id = 'tui-pause-title';
    panel.appendChild(title);

    overlay.appendChild(panel);
    return overlay;
  }

  function buildOver() {
    var overlay = el('div', 'tui-over');
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var panel = el('div', 'tui-pause__panel');
    var title = el('h2', 'tui-title', 'GAME OVER');
    title.id = 'tui-over-title';
    title.setAttribute('data-text', 'GAME OVER');
    panel.appendChild(title);
    panel.appendChild(el('p', 'tui-over__hint', 'Coloca las dos manos para volver a comenzar'));

    var scoreBox = el('div', 'tui-over__score');
    scoreBox.appendChild(el('span', 'tui-over__score-label', 'Puntuación final'));
    var scoreValue = el('span', 'tui-over__score-value', '000000');
    scoreValue.setAttribute('data-tui-final-score', '');
    scoreBox.appendChild(scoreValue);
    panel.appendChild(scoreBox);

    overlay.appendChild(panel);
    return overlay;
  }

  /* ------------------------------------------------------------------ state */

  function syncScenarioUI() {
    var current = findScenario(state.scenario) || SCENARIOS[0];
    root.setAttribute('data-tui-scenario', current.id);

    var names = root.querySelectorAll('[data-tui-scenario-name]');
    for (var i = 0; i < names.length; i++) {
      names[i].textContent = current.label;
    }

    var siguiente = nextScenario();
    var box = root.querySelector('[data-tui-next-scenario]');
    if (box) {
      box.setAttribute('data-tui-scenario-id', siguiente.id);
      var nombre = box.querySelector('.tui-scenario-next__name');
      if (nombre) nombre.textContent = siguiente.label;
    }
  }

  function selectScenario(id) {
    var scenario = findScenario(id);
    if (!scenario || !ensure() || scenario.id === state.scenario) return false;
    state.scenario = scenario.id;
    syncScenarioUI();
    emit('scenario:change', {});
    return true;
  }

  function show(screen) {
    if (!ensure() || SCREENS.indexOf(screen) === -1) return false;
    if (state.screen === screen) return true;

    state.screen = screen;
    root.setAttribute('data-tui-screen', screen);
    emit('screen:change', { screen: screen });
    return true;
  }

  function setStats(stats) {
    if (!stats || !ensure()) return;
    if (stats.score === undefined || stats.score === null) return;

    var value = Number(stats.score);
    var texto = Number.isFinite(value) && value >= 0
      ? String(Math.trunc(value)).padStart(6, '0')
      : '—';

    var nodes = root.querySelectorAll('[data-tui-stat="score"], [data-tui-final-score]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = texto;
    }
  }

  /* ------------------------------------------------------------ gestos ----- */

  /* Enciende o apaga el estado iluminado de una fila (gesto sostenido o
     estado, por ejemplo "sin manos" durante la pausa). */
  function setGesture(id, active) {
    var nodo = gestureNodes[id];
    if (!nodo) return false;

    var encendido = nodo.getAttribute('data-tui-active') === 'true';
    if (active && !encendido) nodo.setAttribute('data-tui-active', 'true');
    else if (!active && encendido) nodo.removeAttribute('data-tui-active');

    return true;
  }

  /* Destello breve para gestos puntuales (pulgar, rock, dos manos). Si la
     señal se repite, el destello se renueva en lugar de acumularse. */
  function pulseGesture(id, ms) {
    if (!setGesture(id, true)) return false;

    if (gestureTimers[id]) window.clearTimeout(gestureTimers[id]);
    gestureTimers[id] = window.setTimeout(function () {
      delete gestureTimers[id];
      setGesture(id, false);
    }, ms || 260);

    return true;
  }

  /* ------------------------------------------------------------------- init */

  function build() {
    root = el('div', 'tui-app');
    root.id = ROOT_ID;
    root.setAttribute('data-tui-screen', state.screen);
    root.setAttribute('data-tui-scenario', state.scenario);

    var scanlines = el('div', 'tui-crt');
    scanlines.setAttribute('aria-hidden', 'true');
    root.appendChild(scanlines);

    var vignette = el('div', 'tui-vignette');
    vignette.setAttribute('aria-hidden', 'true');
    root.appendChild(vignette);

    root.appendChild(buildGame());
    root.appendChild(buildPause());
    root.appendChild(buildOver());

    var contenedor = document.getElementById('tetris-app') || document.body;
    contenedor.appendChild(root);

    syncScenarioUI();
  }

  function init() {
    if (root) return api;
    if (document.getElementById(ROOT_ID)) return api;
    if (!document.body) return api;
    build();
    emit('ready', {});
    return api;
  }

  /* Monta la interfaz si algún módulo llama a la API antes de estar listo. */
  function ensure() {
    if (!root) init();
    return root;
  }

  var api = {
    version: '3.0.0',
    scenarios: SCENARIOS.map(function (scenario) {
      return { id: scenario.id, label: scenario.label };
    }),
    init: init,
    show: show,
    getScreen: function () {
      return state.screen;
    },
    setScenario: selectScenario,
    getScenario: function () {
      return state.scenario;
    },
    getNextScenario: function () {
      var siguiente = nextScenario();
      return { id: siguiente.id, label: siguiente.label };
    },
    setStats: setStats,
    setGesture: setGesture,
    pulseGesture: pulseGesture,
    on: on,
    off: off,
    getRoot: function () {
      return ensure();
    },
    getBoardMount: function () {
      return ensure() ? root.querySelector('[data-tui-board]') : null;
    },
    getCameraMount: function () {
      return ensure() ? root.querySelector('[data-tui-camera]') : null;
    },
    getNextPieceMount: function () {
      return ensure() ? root.querySelector('[data-tui-next]') : null;
    }
  };

  window.TetrisUI = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
