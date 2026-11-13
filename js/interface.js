/* ============================================================================
 * TETRIS CON INTERACCIÓN — Módulo de interfaz (Fase 2.2.2)
 * ----------------------------------------------------------------------------
 * Módulo aislado dentro de un IIFE. Expone UN solo global: window.TetrisUI.
 * Prefijo exclusivo en todo lo que toca el DOM:
 *   - clases CSS:      tui-
 *   - atributos:       data-tui-*
 *   - eventos:         tui:*
 *
 * API pública (controlador / handpose):
 *   TetrisUI.init()                      Monta la interfaz (idempotente)
 *   TetrisUI.show(screen)                'start' | 'scenarios' | 'game' | 'paused' | 'over'
 *   TetrisUI.getScreen()                 Pantalla activa
 *   TetrisUI.setScenario(id)             'teclado' | 'edificio'
 *   TetrisUI.getScenario()               Escenario seleccionado
 *   TetrisUI.setStats({ score: 1200 })  Puntuación (único indicador de partida)
 *   TetrisUI.getButtons()                Lista { id, control, action, disabled }
 *   TetrisUI.on(evento, fn)              Suscripción; devuelve unsubscribe
 *   TetrisUI.getBoardMount()             Nodo reservado para el tablero (p5)
 *   TetrisUI.getCameraMount()            Nodo reservado para la cámara (handpose)
 *   TetrisUI.getNextPieceMount()         Nodo reservado para la pieza siguiente
 *   TetrisUI.trigger(x)                  Compatibilidad: id o 'accion:param'
 *
 * --- API para handpose.js (activación externa, sin tocar el DOM) -----------
 *   TetrisUI.press(id)       Solo estado visual de presión (no ejecuta acción)
 *   TetrisUI.release(id)     Vuelve al estado normal y permite reactivar
 *   TetrisUI.activate(id)    Presión visual + acción lógica, una sola vez
 *   TetrisUI.pulse(id)       activate + release automático a los 180 ms
 *   TetrisUI.moveCursor(x,y) Mueve el cursor de mano (coordenadas 0..1)
 *   TetrisUI.hideCursor()    Oculta el cursor de mano
 *   TetrisUI.clickAt(x,y)    Activa el botón que esté bajo ese punto
 *
 * Los ids son estables y únicos (ver getButtons()): 'start-game',
 * 'open-scenarios', 'select-teclado', 'select-edificio', 'confirm-scenario',
 * 'back-menu', 'pause', 'resume', 'restart', 'menu', 'control-up',
 * 'control-down', 'control-left', 'control-right', 'control-a', 'control-b'.
 *
 * Reglas de deduplicación:
 *   - Una misma señal ejecuta la acción una sola vez; repetirla exige release().
 *   - activate() se ignora si el botón está presionado por el puntero: en ese
 *     caso la acción la ejecuta el clic, nunca dos veces.
 *   - press() y activate() sobre un botón deshabilitado devuelven false.
 *   - pointerdown marca la presión; pointerup la libera; click ejecuta la
 *     acción una única vez.
 *   - Al cambiar de pantalla se liberan todas las presiones pendientes.
 *
 * Los controles de juego (cruceta, A, B) NO ejecutan lógica: emiten
 * tui:control:<id> para que el controlador decida qué hacer.
 *
 * Eventos emitidos (CustomEvent sobre el nodo raíz, con burbujeo):
 *   tui:ready, tui:screen:change, tui:scenario:change, tui:game:start,
 *   tui:game:pause, tui:game:resume, tui:game:restart, tui:game:menu,
 *   tui:control:up|down|left|right|a|b
 *
 * Este módulo NO dibuja con p5.js, NO reconoce gestos y NO ejecuta lógica de
 * juego: solo estructura, estado visual y eventos de interacción.
 * ==========================================================================*/

(function () {
  'use strict';

  /* Un solo global: si ya existe, no se vuelve a montar ni se pisan funciones. */
  if (window.TetrisUI) return;

  var ROOT_ID = 'tui-app';
  var SCREENS = ['start', 'scenarios', 'game', 'paused', 'over'];

  var SCENARIOS = [
    { id: 'catedral', label: 'Catedral', index: '01' },
    { id: 'puente-roto', label: 'Puente Roto', index: '02' },
    { id: 'santa-ana', label: 'Santa Ana', index: '03' },
    { id: 'tranvia', label: 'Tranvía', index: '04' }
  ];

  var state = {
    screen: 'start',
    scenario: SCENARIOS[0].id
  };

  var root = null;

  /* ---------------------------------------------------------------- helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function actionButton(label, action, variant, buttonId) {
    var btn = el('button', 'tui-btn' + (variant ? ' tui-btn--' + variant : ''), label);
    btn.type = 'button';
    btn.setAttribute('data-tui-action', action);
    btn.setAttribute('data-tui-button', buttonId || action);
    return btn;
  }

  function controlButton(control, glyph, extraClass, buttonId, label) {
    var btn = el('button', 'tui-btn ' + extraClass, glyph);
    btn.type = 'button';
    btn.setAttribute('data-tui-control', control);
    btn.setAttribute('data-tui-button', buttonId);
    btn.setAttribute('aria-label', label);
    return btn;
  }

  function findScenario(id) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].id === id) return SCENARIOS[i];
    }
    return null;
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

  function buildStart() {
    var section = el('section', 'tui-screen tui-screen--start');
    section.setAttribute('aria-label', 'Pantalla de inicio');

    var deco = el('div', 'tui-deco');
    deco.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 8; i++) deco.appendChild(el('span', 'tui-deco__cell'));
    section.appendChild(deco);

    var inner = el('div', 'tui-start');
    inner.appendChild(el('p', 'tui-kicker', 'Arcade · 1 jugador'));

    var logo = el('h1', 'tui-logo');
    var word = el('span', 'tui-logo__word');
    'TETRIS'.split('').forEach(function (letter) {
      word.appendChild(el('span', 'tui-logo__letter', letter));
    });
    logo.appendChild(word);
    logo.appendChild(el('span', 'tui-logo__sub', 'Con interacción'));
    inner.appendChild(logo);

    var actions = el('div', 'tui-start__actions');
    actions.appendChild(actionButton('Iniciar partida', 'start', 'primary', 'start-game'));
    actions.appendChild(actionButton('Seleccionar escenario', 'scenarios', 'ghost', 'open-scenarios'));
    inner.appendChild(actions);

    var hints = el('div', 'tui-start__hints');
    hints.appendChild(el('p', 'tui-start__hint', '👐 Mano abierta para desplazarse'));
    hints.appendChild(el('p', 'tui-start__hint', '✌️ Victory sign para acelerar'));
    hints.appendChild(el('p', 'tui-start__hint', '🤘 Rock para cambiar fondo'));
    hints.appendChild(el('p', 'tui-start__hint', '👐👐 Dos manos para comenzar'));
    hints.appendChild(el('p', 'tui-start__hint', '🖐️ Sin manos = pausa'));
    inner.appendChild(hints);

    section.appendChild(inner);
    return section;
  }

  function scenarioCard(scenario) {
    var card = el('button', 'tui-scenario');
    card.type = 'button';
    card.setAttribute('data-tui-action', 'select');
    card.setAttribute('data-tui-button', 'select-' + scenario.id);
    card.setAttribute('data-tui-scenario-id', scenario.id);
    card.setAttribute('aria-pressed', 'false');

    var preview = el('span', 'tui-scenario__preview');
    card.appendChild(preview);
    card.appendChild(el('span', 'tui-scenario__index', scenario.index));
    card.appendChild(el('span', 'tui-scenario__name', scenario.label));
    card.appendChild(el('span', 'tui-scenario__badge', 'Seleccionado'));
    return card;
  }

  function buildScenarios() {
    var section = el('section', 'tui-screen tui-screen--scenarios');
    section.setAttribute('aria-label', 'Selección de escenario');

    var inner = el('div', 'tui-select');
    inner.appendChild(el('p', 'tui-kicker', 'Selección'));
    inner.appendChild(el('h2', 'tui-title', 'Elegí tu escenario'));

    var grid = el('div', 'tui-scenarios');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Escenarios disponibles');
    SCENARIOS.forEach(function (scenario) {
      grid.appendChild(scenarioCard(scenario));
    });
    inner.appendChild(grid);

    var actions = el('div', 'tui-select__actions');
    actions.appendChild(actionButton('Regresar', 'back', 'ghost', 'back-menu'));
    actions.appendChild(actionButton('Confirmar', 'confirm', 'primary', 'confirm-scenario'));
    inner.appendChild(actions);

    section.appendChild(inner);
    return section;
  }

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

    /* Panel de controles: columna izquierda, orden vertical
       PAUSA → cruceta → A/B. No ejecuta lógica de juego: cada control emite
       tui:control:<id>. */
    var controls = el('aside', 'tui-console__controls');
    controls.setAttribute('data-tui-controls', '');
    controls.setAttribute('aria-label', 'Controles');

    var stack = el('div', 'tui-controls__stack');
    stack.appendChild(actionButton('Pausa', 'pause', 'start', 'pause'));

    var padShell = el('div', 'tui-pad-shell');
    var pad = el('div', 'tui-pad');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Cruceta');
    pad.appendChild(controlButton('up', '▲', 'tui-pad__btn tui-pad__btn--up', 'control-up', 'Arriba'));
    pad.appendChild(controlButton('left', '◀', 'tui-pad__btn tui-pad__btn--left', 'control-left', 'Izquierda'));
    var hub = el('span', 'tui-pad__hub');
    hub.setAttribute('aria-hidden', 'true');
    pad.appendChild(hub);
    pad.appendChild(controlButton('right', '▶', 'tui-pad__btn tui-pad__btn--right', 'control-right', 'Derecha'));
    pad.appendChild(controlButton('down', '▼', 'tui-pad__btn tui-pad__btn--down', 'control-down', 'Abajo'));
    padShell.appendChild(pad);

    var padBase = el('div', 'tui-pad-base');
    padBase.appendChild(padShell);
    stack.appendChild(padBase);

    var actions = el('div', 'tui-controls__actions');
    actions.appendChild(controlButton('b', 'B', 'tui-btn--round', 'control-b', 'Botón B'));
    actions.appendChild(controlButton('a', 'A', 'tui-btn--round', 'control-a', 'Botón A'));
    stack.appendChild(actions);

    controls.appendChild(stack);

    var meta = el('div', 'tui-controls__meta');
    meta.appendChild(el('span', 'tui-console__vent'));
    meta.appendChild(el('span', 'tui-console__led'));
    meta.appendChild(el('span', 'tui-console__base-label', 'P1'));
    controls.appendChild(meta);

    consoleBox.appendChild(controls);

    section.appendChild(consoleBox);
    return section;
  }

  function buildPause() {
    var overlay = el('div', 'tui-pause');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tui-pause-title');

    var panel = el('div', 'tui-pause__panel');
    panel.appendChild(el('p', 'tui-kicker', 'Sistema'));

    var title = el('h2', 'tui-title', 'Pausa');
    title.id = 'tui-pause-title';
    panel.appendChild(title);

    panel.appendChild(el('p', 'tui-pause__hint', 'Juego en pausa'));

    var actions = el('div', 'tui-pause__actions');
    actions.appendChild(actionButton('Continuar', 'resume', 'primary', 'resume'));
    actions.appendChild(actionButton('Reiniciar', 'restart', 'ghost', 'restart'));
    actions.appendChild(actionButton('Cambiar escenario', 'scenarios', 'ghost', 'pause-scenarios'));
    actions.appendChild(actionButton('Menú principal', 'menu', 'ghost', 'menu'));
    panel.appendChild(actions);

    overlay.appendChild(panel);
    return overlay;
  }

  /* Pantalla de fin de partida: mismo lenguaje que la pausa, sin "Continuar". */
  function buildOver() {
    var overlay = el('div', 'tui-over');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tui-over-title');

    var panel = el('div', 'tui-pause__panel');
    panel.appendChild(el('p', 'tui-kicker', 'Sistema'));

    var title = el('h2', 'tui-title', 'Game over');
    title.id = 'tui-over-title';
    panel.appendChild(title);

    panel.appendChild(el('p', 'tui-pause__hint', 'Partida terminada'));

    var score = el('div', 'tui-over__score');
    score.appendChild(el('span', 'tui-over__score-label', 'Puntuación final'));
    var scoreValue = el('span', 'tui-over__score-value', '000000');
    scoreValue.setAttribute('data-tui-final-score', '');
    score.appendChild(scoreValue);
    panel.appendChild(score);

    var actions = el('div', 'tui-pause__actions');
    actions.appendChild(actionButton('Reiniciar', 'restart', 'primary', 'over-restart'));
    actions.appendChild(actionButton('Cambiar escenario', 'scenarios', 'ghost', 'over-scenarios'));
    actions.appendChild(actionButton('Menú principal', 'menu', 'ghost', 'over-menu'));
    panel.appendChild(actions);

    overlay.appendChild(panel);
    return overlay;
  }

  /* ------------------------------------------------------------------ state */

  function syncScenarioUI() {
    var current = findScenario(state.scenario) || SCENARIOS[0];
    root.setAttribute('data-tui-scenario', current.id);

    var cards = root.querySelectorAll('[data-tui-action="select"]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var selected = card.getAttribute('data-tui-scenario-id') === current.id;
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.classList.toggle('tui-scenario--selected', selected);
    }

    var names = root.querySelectorAll('[data-tui-scenario-name]');
    for (var j = 0; j < names.length; j++) {
      names[j].textContent = current.label;
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
    releaseAll();

    if (screen === 'paused') {
      var resume = root.querySelector('[data-tui-button="resume"]');
      if (resume) resume.focus({ preventScroll: true });
    }

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

  /* ---------------------------------------------------------------- cursor -- */

  /* Cursor de mano: lo mueve el sistema de poses con coordenadas normalizadas
     (0..1) y la interfaz solo lo dibuja y resuelve el clic sobre un botón. */

  function cursorNode() {
    var node = root.querySelector('.tui-cursor');
    if (!node) {
      node = el('div', 'tui-cursor');
      node.setAttribute('aria-hidden', 'true');
      root.appendChild(node);
    }
    return node;
  }

  function normalizar(valor) {
    var n = Number(valor);
    if (!Number.isFinite(n)) return null;
    return Math.min(1, Math.max(0, n));
  }

  var cursorHover = null;

  /* Resalta el botón que está debajo del cursor de mano, para que se vea
     sobre qué se está apuntando antes de confirmar. */
  function actualizarHover(nx, ny) {
    var target = document.elementFromPoint(
      Math.round(nx * window.innerWidth),
      Math.round(ny * window.innerHeight)
    );
    var button = target && typeof target.closest === 'function'
      ? target.closest('[data-tui-button]')
      : null;

    if (button === cursorHover) return;
    if (cursorHover) cursorHover.removeAttribute('data-tui-hover');
    cursorHover = button && root.contains(button) ? button : null;
    if (cursorHover) cursorHover.setAttribute('data-tui-hover', 'true');
  }

  function moveCursor(x, y) {
    if (!ensure()) return false;
    var nx = normalizar(x);
    var ny = normalizar(y);
    if (nx === null || ny === null) return false;

    var node = cursorNode();
    node.setAttribute('data-tui-visible', 'true');
    node.style.left = (nx * 100).toFixed(3) + '%';
    node.style.top = (ny * 100).toFixed(3) + '%';
    actualizarHover(nx, ny);
    return true;
  }

  function hideCursor() {
    if (!root) return false;
    var node = root.querySelector('.tui-cursor');
    if (!node) return false;
    node.removeAttribute('data-tui-visible');
    if (cursorHover) {
      cursorHover.removeAttribute('data-tui-hover');
      cursorHover = null;
    }
    return true;
  }

  /* Resuelve el clic del cursor sobre el botón que esté debajo. */
  function clickAt(x, y) {
    if (!ensure()) return false;
    var nx = normalizar(x);
    var ny = normalizar(y);
    if (nx === null || ny === null) return false;

    var px = Math.round(nx * window.innerWidth);
    var py = Math.round(ny * window.innerHeight);
    var target = document.elementFromPoint(px, py);
    if (!target || typeof target.closest !== 'function') return false;

    var button = target.closest('[data-tui-button]');
    if (!button || !root.contains(button) || button.disabled) return false;

    var id = button.getAttribute('data-tui-button');
    var activated = activate(id);

    // El clic del puntero es momentáneo: se libera la presión para que un
    // nuevo pinch sobre el mismo botón vuelva a ejecutar la acción.
    if (activated) release(id);

    return activated;
  }

  /* --------------------------------------------------------------- behavior */

  function handleAction(action, scenarioId) {
    switch (action) {
      case 'start':
        if (!show('game')) return;
        emit('game:start', {});
        break;

      case 'scenarios':
        show('scenarios');
        break;

      case 'select':
        if (scenarioId) selectScenario(scenarioId);
        break;

      case 'confirm':
        if (!show('game')) return;
        emit('scenario:confirm', {});
        emit('game:start', {});
        break;

      case 'back':
        show('start');
        break;

      case 'pause':
        if (state.screen !== 'game') return;
        show('paused');
        emit('game:pause', {});
        break;

      case 'resume':
        if (state.screen !== 'paused') return;
        show('game');
        emit('game:resume', {});
        break;

      case 'restart':
        if (state.screen !== 'paused' && state.screen !== 'over') return;
        emit('game:restart', {});
        show('game');
        break;

      case 'menu':
        if (state.screen !== 'paused' && state.screen !== 'over') return;
        emit('game:menu', {});
        show('start');
        break;

      default:
        break;
    }
  }

  /* --------------------------------------------------------------- botones -- */

  /* Estado de presión por botón: { source: 'pointer' | 'external', fired }.
     'fired' distingue la activación visual de la acción lógica ya ejecutada,
     y evita repetir la acción mientras la misma señal siga activa. */
  var pressed = Object.create(null);

  function findButton(id) {
    if (!root || typeof id !== 'string') return null;
    var list = root.querySelectorAll('[data-tui-button]');
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute('data-tui-button') === id) return list[i];
    }
    return null;
  }

  function releaseAll() {
    if (!root) return;
    var list = root.querySelectorAll('[data-tui-pressed="true"]');
    for (var i = 0; i < list.length; i++) list[i].removeAttribute('data-tui-pressed');
    pressed = Object.create(null);
    syncPadTilt();
  }

  /* Inclina la cruceta como una pieza única hacia la dirección presionada.
     El atributo va en .tui-pad-base: ahí vive la sombra, para que no gire. */
  function syncPadTilt() {
    if (!root) return;
    var base = root.querySelector('.tui-pad-base');
    if (!base) return;

    var tilt = '';
    var arrows = root.querySelectorAll('.tui-pad__btn');
    for (var i = 0; i < arrows.length; i++) {
      if (pressed[arrows[i].getAttribute('data-tui-button')]) {
        tilt = arrows[i].getAttribute('data-tui-control');
        break;
      }
    }

    if (tilt) base.setAttribute('data-tui-tilt', tilt);
    else base.removeAttribute('data-tui-tilt');
  }

  /* Señal externa sin acción lógica: solo el estado visual. */
  function press(id, source) {
    var button = findButton(id);
    if (!button || button.disabled || pressed[id]) return false;
    button.setAttribute('data-tui-pressed', 'true');
    pressed[id] = { source: source || 'external', fired: false };
    syncPadTilt();
    return true;
  }

  /* Fin de la señal: el botón vuelve a su estado normal. */
  function release(id) {
    var button = findButton(id);
    if (!button || !pressed[id]) return false;
    button.removeAttribute('data-tui-pressed');
    delete pressed[id];
    syncPadTilt();
    return true;
  }

  /* Señal externa completa: presión visual + acción lógica, una sola vez.
     - Si el botón ya está presionado por puntero, se ignora: el clic del
       puntero ejecutará la acción y no debe duplicarse.
     - Si la presión vino de una señal externa (press()), la acción se ejecuta
       una vez; repetirla exige release() previo. */
  function activate(id) {
    var button = findButton(id);
    if (!button || button.disabled) return false;

    var current = pressed[id];
    if (current) {
      if (current.source === 'pointer' || current.fired) return false;
      current.fired = true;
      runButton(button);
      return true;
    }

    if (!press(id, 'external')) return false;
    pressed[id].fired = true;
    runButton(button);
    return true;
  }

  /* Igual que activate, con liberación automática para gestos puntuales. */
  function pulse(id) {
    if (!activate(id)) return false;
    window.setTimeout(function () {
      release(id);
    }, 180);
    return true;
  }

  function runButton(button) {
    var control = button.getAttribute('data-tui-control');
    if (control) {
      emit('control:' + control, { button: button.getAttribute('data-tui-button') });
      return;
    }
    var action = button.getAttribute('data-tui-action');
    if (action) handleAction(action, button.getAttribute('data-tui-scenario-id'));
  }

  function onPointerDown(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var button = target.closest('[data-tui-button]');
    if (!button || !root.contains(button) || button.disabled) return;

    press(button.getAttribute('data-tui-button'), 'pointer');
  }

  function onPointerUp() {
    Object.keys(pressed).forEach(function (id) {
      if (pressed[id].source === 'pointer') release(id);
    });
  }

  function onClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var button = target.closest('[data-tui-button]');
    if (!button || !root.contains(button) || button.disabled) return;

    runButton(button);
  }

  /* Compatibilidad: acepta un id de botón ('pause', 'control-a') o el formato
     anterior de acción ('select:edificio'). */
  function trigger(value) {
    if (typeof value !== 'string' || !ensure()) return false;

    if (findButton(value)) return activate(value);

    var parts = value.split(':');
    var name = parts[0];
    var param = parts[1] || null;

    var candidates = root.querySelectorAll('[data-tui-action]');
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (candidate.getAttribute('data-tui-action') !== name) continue;
      if (param && candidate.getAttribute('data-tui-scenario-id') !== param) continue;
      return activate(candidate.getAttribute('data-tui-button'));
    }
    return false;
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

    root.appendChild(buildStart());
    root.appendChild(buildScenarios());
    root.appendChild(buildGame());
    root.appendChild(buildPause());
    root.appendChild(buildOver());

    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
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
    version: '2.2.2',
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
    setStats: setStats,
    trigger: trigger,
    press: press,
    release: release,
    activate: activate,
    pulse: pulse,
    moveCursor: moveCursor,
    hideCursor: hideCursor,
    clickAt: clickAt,
    getButtons: function () {
      if (!ensure()) return [];
      var out = [];
      var list = root.querySelectorAll('[data-tui-button]');
      for (var i = 0; i < list.length; i++) {
        out.push({
          id: list[i].getAttribute('data-tui-button'),
          control: list[i].getAttribute('data-tui-control') || null,
          action: list[i].getAttribute('data-tui-action') || null,
          disabled: list[i].disabled === true
        });
      }
      return out;
    },
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

  /* ==========================================================================
   * INTEGRACIÓN CON HANDPOSE.JS
   * --------------------------------------------------------------------------
   * Este módulo NO reconoce gestos ni manos. Solo expone una entrada para que
   * el futuro handpose.js indique "este botón está presionado" o "activá este
   * botón", sin tocar el DOM ni conocer clases CSS.
   *
   * Descubrimiento de ids (no hardcodear):
   *   window.TetrisUI.getButtons()
   *   -> [{ id, control, action, disabled }, ...]
   *
   * Ejemplo de consumo desde handpose.js:
   *
   *   var ui = window.TetrisUI;
   *
   *   // 1) Mano detectada sobre el botón: solo se ilumina.
   *   ui.press('control-a');
   *
   *   // 2) Mano retirada sin confirmar: vuelve a la normalidad.
   *   ui.release('control-a');
   *
   *   // 3) Gesto confirmado: ilumina y ejecuta la acción una sola vez.
   *   ui.activate('pause');
   *
   *   // 4) Gesto puntual: pulsación completa y breve (se libera sola).
   *   ui.pulse('control-b');
   *
   *   // 5) Enterarse de lo que hizo un control de juego.
   *   ui.on('control:up', function () {
   *     // El controlador decide qué hacer; la interfaz no mueve piezas.
   *   });
   *
   * Contrato de cada función:
   *   press(id)     true si iluminó. false si ya estaba presionado, si no
   *                 existe o si está deshabilitado.
   *   release(id)   true si volvió a normal. false si no había nada.
   *   activate(id)  true si ejecutó la acción. false si fue bloqueado por
   *                 deduplicación o por estar deshabilitado.
   *   pulse(id)     igual que activate, y libera a los 180 ms.
   *
   * Garantías anti-duplicado:
   *   - activate repetido sin release no vuelve a ejecutar la acción.
   *   - activate se ignora si el botón está presionado por el puntero: en ese
   *     caso la acción la ejecuta el clic, una sola vez.
   *   - Un gesto de puntero ejecuta exactamente una acción.
   *   - Al cambiar de pantalla se liberan todas las presiones pendientes.
   *
   * Importante: press() sin release() deja el botón iluminado. Para gestos
   * puntuales usar pulse().
   *
   * handpose.js no debe llamar a click(), ni leer data-tui-pressed, ni
   * modificar clases: toda la comunicación pasa por estas cuatro funciones y
   * por los eventos tui:*.
   * ==========================================================================*/

  window.TetrisUI = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
