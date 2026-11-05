/* ============================================================================
 * TETRIS CON INTERACCIÓN — Módulo de interfaz (Fase 2.2.1)
 * ----------------------------------------------------------------------------
 * Módulo aislado dentro de un IIFE. Expone UN solo global: window.TetrisUI.
 * Prefijo exclusivo en todo lo que toca el DOM:
 *   - clases CSS:      tui-
 *   - atributos:       data-tui-*
 *   - eventos:         tui:*
 *
 * API pública (controlador / handpose):
 *   TetrisUI.init()                      Monta la interfaz (idempotente)
 *   TetrisUI.show(screen)                'start' | 'scenarios' | 'game' | 'paused'
 *   TetrisUI.getScreen()                 Pantalla activa
 *   TetrisUI.setScenario(id)             'teclado' | 'edificio'
 *   TetrisUI.getScenario()               Escenario seleccionado
 *   TetrisUI.setStats({ score: 1200 })  Puntuación (único indicador de partida)
 *   TetrisUI.trigger('pause')            Dispara una acción como si fuera un clic
 *   TetrisUI.trigger('select:edificio')  Ídem, con parámetro de escenario
 *   TetrisUI.on('game:start', fn)        Suscripción a eventos; devuelve unsubscribe
 *   TetrisUI.getBoardMount()             Nodo reservado para el tablero (p5/modelo)
 *   TetrisUI.getCameraMount()            Nodo reservado para la cámara (handpose)
 *   TetrisUI.getNextPieceMount()         Nodo reservado para la pieza siguiente
 *
 * Eventos emitidos (CustomEvent sobre el nodo raíz, con burbujeo):
 *   tui:ready, tui:screen:change, tui:scenario:change, tui:game:start,
 *   tui:game:pause, tui:game:resume, tui:game:restart, tui:game:menu
 *
 * Este módulo NO dibuja con p5.js y NO ejecuta lógica de juego: solo estructura,
 * estado visual y eventos de interacción.
 * ==========================================================================*/

(function () {
  'use strict';

  /* Un solo global: si ya existe, no se vuelve a montar ni se pisan funciones. */
  if (window.TetrisUI) return;

  var ROOT_ID = 'tui-app';
  var SCREENS = ['start', 'scenarios', 'game', 'paused'];

  var SCENARIOS = [
    { id: 'teclado', label: 'Teclado', index: '01' },
    { id: 'edificio', label: 'Edificio', index: '02' }
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

    inner.appendChild(el('p', 'tui-start__hint', 'Control por gestos · próximamente'));

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

    card.appendChild(el('span', 'tui-scenario__preview'));
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
    bar.appendChild(actionButton('Pausa', 'pause', 'ghost tui-btn--sm'));
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
    screenArea.appendChild(el('span', 'tui-console__tag', 'Color · 10 × 20'));
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

    /* Base de la carcasa: espacio reservado bajo la pantalla, sin invadir
       el panel derecho. No contiene controles ni lógica. */
    var base = el('footer', 'tui-console__base');
    base.setAttribute('data-tui-base', '');
    base.appendChild(el('span', 'tui-console__vent'));
    base.appendChild(el('span', 'tui-console__led'));
    base.appendChild(el('span', 'tui-console__base-label', 'P1'));
    consoleBox.appendChild(base);

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
    actions.appendChild(actionButton('Menú principal', 'menu', 'ghost', 'menu'));
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

    if (screen === 'paused') {
      var resume = root.querySelector('[data-tui-action="resume"]');
      if (resume) resume.focus({ preventScroll: true });
    }

    emit('screen:change', { screen: screen });
    return true;
  }

  function setStats(stats) {
    if (!stats || !ensure()) return;
    if (stats.score === undefined || stats.score === null) return;

    var node = root.querySelector('[data-tui-stat="score"]');
    if (!node) return;

    var value = Number(stats.score);
    node.textContent = Number.isFinite(value) && value >= 0
      ? String(Math.trunc(value)).padStart(6, '0')
      : '—';
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
        if (state.screen !== 'paused') return;
        emit('game:restart', {});
        show('game');
        break;

      case 'menu':
        if (state.screen !== 'paused') return;
        emit('game:menu', {});
        show('start');
        break;

      default:
        break;
    }
  }

  function onClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var button = target.closest('[data-tui-action]');
    if (!button || !root.contains(button)) return;

    handleAction(button.getAttribute('data-tui-action'), button.getAttribute('data-tui-scenario-id'));
  }

  /* Activación externa (handpose): simula el clic de una acción. */
  function trigger(action) {
    if (typeof action !== 'string' || !ensure()) return false;

    var parts = action.split(':');
    var name = parts[0];
    var param = parts[1] || null;

    var candidates = root.querySelectorAll('[data-tui-action]');
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (candidate.getAttribute('data-tui-action') !== name) continue;
      if (param && candidate.getAttribute('data-tui-scenario-id') !== param) continue;
      if (candidate.disabled) return false;
      candidate.click();
      return true;
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

    root.addEventListener('click', onClick);
    document.body.appendChild(root);

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
    version: '2.2.1',
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
