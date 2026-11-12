/* ============================================================================
 * TETRIS — MOTOR + AUDIO
 * ----------------------------------------------------------------------------
 * Lógica pura del juego y sonido. NO dibuja, NO toca el DOM y NO escucha el
 * teclado: eso vive en js/sketch.js (integración p5) y js/interface.js
 * (pantallas, botones y API para handpose).
 *
 * Instancia viva: window.juego (la crea sketch.js en setup()).
 *
 *   juego.moverIzquierda()   juego.moverDerecha()   juego.bajarRapido()
 *   juego.rotar()            juego.rotarIzquierda() juego.alternarPausa()
 *   juego.reiniciar()        juego.actualizar(deltaMs)
 *   juego.calcularCaida()    juego.estaActivo()
 *
 * Estado público: tablero.matriz, piezaActual, siguientePieza, puntaje,
 * lineas, nivel, pausado, gameOver.
 *
 * Las secciones de layout, panel, overlays y callbacks de p5 de la Fase 1 se
 * retiraron a propósito: la interfaz HTML las reemplaza y sketch.js es el
 * único punto de contacto con p5. El motor y el audio quedaron intactos.
 * ==========================================================================*/
/* ============================================================================
   SECCIÓN 1 · MOTOR
   ============================================================================ */

// ─── Dimensiones del tablero ─────────────────────────────────────────────────
// Matriz ampliada a 16x16 para que el tablero llene la pantalla: los bloques
// quedan grandes y el área de juego cubre cerca de la mitad de la superficie.
// El motor es genérico: si querés volver al 10x20 clásico, cambiá estos dos
// valores y el layout se adapta solo.
const COLUMNAS = 16;
const FILAS = 16;

/**
 * Ajustes generales del juego.
 * INTERVALO_CAIDA_MS es el tiempo, en milisegundos, entre cada descenso
 * automático de la pieza en el nivel 1. Subilo para dar más tiempo al jugador.
 */
const CONFIG_JUEGO = {
  INTERVALO_CAIDA_MS: 1100,
};

// ─── Las 7 piezas clásicas ───────────────────────────────────────────────────
const TIPOS_PIEZA = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const COLORES_PIEZA = {
  I: '#00e5ff', // cian
  J: '#3b6bf5', // azul
  L: '#ff9f1a', // naranja
  O: '#ffe23d', // amarillo
  S: '#3ddc84', // verde
  T: '#b45cff', // violeta
  Z: '#ff4d6d'  // rojo
};

// Formas base (estado de aparición). Son matrices cuadradas: I en 4x4,
// O en 2x2 y el resto en 3x3. Eso permite rotarlas siempre dentro de su caja.
const FORMAS_PIEZA = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ]
};

/**
 * Copia una matriz bidimensional para que las formas base nunca se muten.
 * @param {number[][]} matriz
 * @returns {number[][]}
 */
function clonarMatriz(matriz) {
  return matriz.map((fila) => fila.slice());
}

/* ─── CLASE Pieza: un tetromino con posición y rotación ──────────────────── */
class Pieza {
  /**
   * @param {'I'|'J'|'L'|'O'|'S'|'T'|'Z'} tipo
   */
  constructor(tipo) {
    if (!FORMAS_PIEZA[tipo]) {
      throw new Error(`Tipo de pieza desconocido: ${tipo}`);
    }
    this.tipo = tipo;
    this.color = COLORES_PIEZA[tipo];
    this.forma = clonarMatriz(FORMAS_PIEZA[tipo]);

    // Aparición centrada en la parte superior del tablero.
    this.x = Math.floor((COLUMNAS - this.forma[0].length) / 2);
    this.y = 0;
  }

  /**
   * Devuelve las celdas ocupadas por la pieza en coordenadas del tablero.
   * @param {number} [x] posición horizontal a usar (por defecto la actual)
   * @param {number} [y] posición vertical a usar (por defecto la actual)
   * @param {number[][]} [forma] forma a usar (por defecto la actual)
   * @returns {{x: number, y: number}[]}
   */
  celdas(x = this.x, y = this.y, forma = this.forma) {
    const resultado = [];
    for (let fila = 0; fila < forma.length; fila++) {
      for (let columna = 0; columna < forma[fila].length; columna++) {
        if (forma[fila][columna]) {
          resultado.push({ x: x + columna, y: y + fila });
        }
      }
    }
    return resultado;
  }

  /**
   * Rota la forma 90° en sentido horario sin modificar la pieza.
   * Solo funciona con matrices cuadradas, y todas las formas lo son.
   * @returns {number[][]} nueva matriz rotada
   */
  formaRotada() {
    const n = this.forma.length;
    const rotada = [];
    for (let fila = 0; fila < n; fila++) {
      rotada[fila] = [];
      for (let columna = 0; columna < n; columna++) {
        rotada[fila][columna] = this.forma[n - 1 - columna][fila];
      }
    }
    return rotada;
  }

  /**
   * Rota la forma 90° en sentido antihorario sin modificar la pieza.
   * Es la inversa exacta de formaRotada().
   * @returns {number[][]} nueva matriz rotada
   */
  formaRotadaIzquierda() {
    const n = this.forma.length;
    const rotada = [];
    for (let fila = 0; fila < n; fila++) {
      rotada[fila] = [];
      for (let columna = 0; columna < n; columna++) {
        rotada[fila][columna] = this.forma[columna][n - 1 - fila];
      }
    }
    return rotada;
  }
}

/* ─── CLASE Tablero: la grilla y sus reglas espaciales ─────────────────────── */
class Tablero {
  constructor() {
    this.reiniciar();
  }

  /** Deja el tablero vacío. Cada celda guarda el tipo de pieza o null. */
  reiniciar() {
    this.matriz = Array.from({ length: FILAS }, () => Array(COLUMNAS).fill(null));
  }

  /**
   * ¿La pieza choca si se la desplaza (dx, dy) y/o se le aplica otra forma?
   * Detecta bordes laterales, piso y celdas ya fijadas.
   * @param {Pieza} pieza
   * @param {number} [dx]
   * @param {number} [dy]
   * @param {number[][]} [forma]
   * @returns {boolean}
   */
  hayColision(pieza, dx = 0, dy = 0, forma = pieza.forma) {
    for (const celda of pieza.celdas(pieza.x + dx, pieza.y + dy, forma)) {
      if (celda.x < 0 || celda.x >= COLUMNAS || celda.y >= FILAS) return true;
      // Las celdas por encima del tablero (y < 0) se consideran libres.
      if (celda.y >= 0 && this.matriz[celda.y][celda.x] !== null) return true;
    }
    return false;
  }

  /**
   * Fija la pieza en la grilla. Las celdas fuera de rango se ignoran.
   * @param {Pieza} pieza
   */
  fijar(pieza) {
    for (const celda of pieza.celdas()) {
      if (celda.x >= 0 && celda.x < COLUMNAS && celda.y >= 0 && celda.y < FILAS) {
        this.matriz[celda.y][celda.x] = pieza.tipo;
      }
    }
  }

  /**
   * Elimina todas las filas completas y devuelve cuántas borró.
   * Las filas de arriba caen y se rellenan filas vacías por arriba.
   * @returns {number}
   */
  eliminarLineas() {
    const restantes = this.matriz.filter((fila) => fila.some((celda) => celda === null));
    const eliminadas = FILAS - restantes.length;

    while (restantes.length < FILAS) {
      restantes.unshift(Array(COLUMNAS).fill(null));
    }

    this.matriz = restantes;
    return eliminadas;
  }
}

/* ─── CLASE JuegoTetris: el motor y su API de control ────────────────────── */
class JuegoTetris {
  /**
   * @param {object} [opciones]
   * @param {number} [opciones.intervaloBase] ms entre caídas en el nivel 1
   * @param {number} [opciones.intervaloMinimo] ms de la caída más rápida
   * @param {number} [opciones.aceleracionNivel] ms que se restan por nivel
   * @param {number} [opciones.filasPorNivel] líneas necesarias para subir de nivel
   */
  constructor(opciones = {}) {
    this.intervaloBase = opciones.intervaloBase ?? CONFIG_JUEGO.INTERVALO_CAIDA_MS;
    this.intervaloMinimo = opciones.intervaloMinimo ?? 90;
    this.aceleracionNivel = opciones.aceleracionNivel ?? 70;
    this.filasPorNivel = opciones.filasPorNivel ?? 10;

    // Callbacks opcionales: la capa de audio se engancha acá sin que el motor
    // dependa de p5.sound.
    this.alCompletarLinea = null;
    this.alGameOver = null;

    this.tablero = new Tablero();
    this.reiniciar();
  }

  /** Reinicia la partida completa. */
  reiniciar() {
    this.tablero.reiniciar();

    this.bolsa = [];
    this.puntaje = 0;
    this.lineas = 0;
    this.nivel = 1;
    this.pausado = false;
    this.gameOver = false;
    this.acumuladorGravedad = 0;
    this.piezaActual = null;
    this.siguientePieza = null;

    this.siguientePieza = this.crearPiezaAleatoria();
    this.colocarSiguientePieza();
  }

  /* ───────────────────────── API DE CONTROL ───────────────────────── */
  /* Estas funciones son las que llama el teclado y las que va a llamar     */
  /* handpose.js. No dependen de ningún evento.                            */

  /** Mueve la pieza una columna a la izquierda. */
  moverIzquierda() {
    return this.desplazar(-1, 0);
  }

  /** Mueve la pieza una columna a la derecha. */
  moverDerecha() {
    return this.desplazar(1, 0);
  }

  /**
   * Soft drop: baja la pieza una fila y suma 1 punto.
   * Mantener la tecla (o repetir el gesto) la hace descender rápido.
   */
  bajarRapido() {
    if (!this.estaActivo()) return false;

    if (!this.tablero.hayColision(this.piezaActual, 0, 1)) {
      this.piezaActual.y++;
      this.puntaje += 1;
      this.acumuladorGravedad = 0;
      return true;
    }

    this.fijarPiezaActual();
    return false;
  }

  /**
   * Rota la pieza 90° en sentido horario.
   * Si la rotación choca contra una pared, intenta desplazarla (wall-kick).
   */
  rotar() {
    if (!this.estaActivo()) return false;
    return this.aplicarRotacion(this.piezaActual.formaRotada());
  }

  /**
   * Rota la pieza 90° en sentido antihorario, con el mismo wall-kick.
   */
  rotarIzquierda() {
    if (!this.estaActivo()) return false;
    return this.aplicarRotacion(this.piezaActual.formaRotadaIzquierda());
  }

  /**
   * Intenta aplicar una forma rotada, con desplazamientos de emergencia.
   * @param {number[][]} nuevaForma
   * @returns {boolean}
   */
  aplicarRotacion(nuevaForma) {
    // Desplazamientos de emergencia, de menor a mayor, como en el Tetris clásico.
    const intentos = [0, -1, 1, -2, 2];

    for (const dx of intentos) {
      if (!this.tablero.hayColision(this.piezaActual, dx, 0, nuevaForma)) {
        this.piezaActual.forma = nuevaForma;
        this.piezaActual.x += dx;
        return true;
      }
    }
    return false;
  }

  /** Pausa o reanuda la partida. No hace nada si ya terminó. */
  alternarPausa() {
    if (this.gameOver) return false;
    this.pausado = !this.pausado;
    return this.pausado;
  }

  /* ───────────────────────── LOOP DEL JUEGO ───────────────────────── */

  /**
   * Avanza el juego. La capa de dibujo llama a esto una vez por frame.
   * @param {number} deltaMs milisegundos transcurridos desde el frame anterior
   */
  actualizar(deltaMs) {
    if (!this.estaActivo()) return;

    this.acumuladorGravedad += deltaMs;
    if (this.acumuladorGravedad >= this.intervaloGravedad()) {
      this.acumuladorGravedad = 0;
      this.aplicarGravedad();
    }
  }

  /** Milisegundos entre cada caída automática según el nivel actual. */
  intervaloGravedad() {
    const reduccion = (this.nivel - 1) * this.aceleracionNivel;
    return Math.max(this.intervaloMinimo, this.intervaloBase - reduccion);
  }

  /**
   * Filas que la pieza actual puede seguir bajando. La usa la interfaz para
   * dibujar la pieza fantasma.
   * @returns {number}
   */
  calcularCaida() {
    if (!this.piezaActual) return 0;

    let filas = 0;
    while (!this.tablero.hayColision(this.piezaActual, 0, filas + 1)) {
      filas++;
    }
    return filas;
  }

  /** ¿Se puede interactuar con la partida en este momento? */
  estaActivo() {
    return !this.gameOver && !this.pausado && this.piezaActual !== null;
  }

  /* ───────────────────────── INTERNOS ───────────────────────── */

  /**
   * Intenta desplazar la pieza en horizontal.
   * @param {number} dx
   * @param {number} dy
   * @returns {boolean}
   */
  desplazar(dx, dy) {
    if (!this.estaActivo()) return false;
    if (this.tablero.hayColision(this.piezaActual, dx, dy)) return false;

    this.piezaActual.x += dx;
    this.piezaActual.y += dy;
    return true;
  }

  /** Un paso de gravedad: baja o fija la pieza si ya no puede bajar. */
  aplicarGravedad() {
    if (!this.tablero.hayColision(this.piezaActual, 0, 1)) {
      this.piezaActual.y++;
    } else {
      this.fijarPiezaActual();
    }
  }

  /** Fija la pieza, limpia líneas, actualiza puntaje y trae la siguiente. */
  fijarPiezaActual() {
    this.tablero.fijar(this.piezaActual);

    const eliminadas = this.tablero.eliminarLineas();
    if (eliminadas > 0) {
      // Puntaje clásico: 100 / 300 / 500 / 800, multiplicado por el nivel.
      const tablaPuntos = [0, 100, 300, 500, 800];
      this.puntaje += tablaPuntos[eliminadas] * this.nivel;
      this.lineas += eliminadas;
      this.nivel = 1 + Math.floor(this.lineas / this.filasPorNivel);

      // Momento exacto en que se detectó y eliminó al menos una línea.
      if (typeof this.alCompletarLinea === 'function') {
        this.alCompletarLinea(eliminadas);
      }
    }

    this.colocarSiguientePieza();
  }

  /** Convierte la pieza siguiente en actual y genera una nueva siguiente. */
  colocarSiguientePieza() {
    this.piezaActual = this.siguientePieza;
    this.siguientePieza = this.crearPiezaAleatoria();
    this.acumuladorGravedad = 0;

    // Si la pieza recién nacida ya choca, la pila llegó al techo.
    if (this.tablero.hayColision(this.piezaActual)) {
      const yaEstaba = this.gameOver;
      this.gameOver = true;

      // Momento exacto en que se activa el fin de juego (una sola vez).
      if (!yaEstaba && typeof this.alGameOver === 'function') {
        this.alGameOver();
      }
    }
  }

  /**
   * Genera una pieza al azar con el sistema de "bolsa de 7": se mezclan las
   * siete piezas y recién cuando se agotan se vuelve a mezclar. Evita rachas
   * injustas de la misma pieza sin dejar de ser aleatorio.
   * @returns {Pieza}
   */
  crearPiezaAleatoria() {
    if (this.bolsa.length === 0) {
      this.bolsa = TIPOS_PIEZA.slice();
      for (let i = this.bolsa.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bolsa[i], this.bolsa[j]] = [this.bolsa[j], this.bolsa[i]];
      }
    }
    return new Pieza(this.bolsa.pop());
  }
}
/* ============================================================================
   AUDIO  (p5.sound)
   ----------------------------------------------------------------------------
   Archivos en la raíz del proyecto: tetris.mp3 (loop), linea.mp3, gameover.mp3.
   Todo el audio es opcional: si p5.sound no cargó o falta un archivo, el juego
   sigue funcionando en silencio.
   ==========================================================================*/

const ARCHIVOS_AUDIO = {
  musica: 'tetris.mp3',
  linea: 'linea.mp3',
  gameOver: 'gameover.mp3'
};

const VOLUMEN_MUSICA = 0.35;
const VOLUMEN_EFECTOS = 0.7;

let sonidoMusica = null;
let sonidoLinea = null;
let sonidoGameOver = null;
let audioIniciado = false;

/** Carga los tres audios sin bloquear el arranque del juego. */
function cargarAudios() {
  if (typeof loadSound !== 'function') return;

  sonidoMusica = loadSound(
    ARCHIVOS_AUDIO.musica,
    () => { if (audioIniciado) intentarMusica(); },
    () => { sonidoMusica = null; }
  );

  sonidoLinea = loadSound(
    ARCHIVOS_AUDIO.linea,
    () => {},
    () => { sonidoLinea = null; }
  );

  sonidoGameOver = loadSound(
    ARCHIVOS_AUDIO.gameOver,
    () => {},
    () => { sonidoGameOver = null; }
  );
}

/** Desbloquea el AudioContext con el gesto del usuario. */
function desbloquearAudio() {
  if (typeof userStartAudio !== 'function') return null;

  const resultado = userStartAudio();
  if (resultado && typeof resultado.catch === 'function') {
    resultado.catch(() => {});
    return resultado;
  }
  return null;
}

/**
 * Se llama en cada clic o tecla. La primera vez desbloquea el audio; después
 * reintenta el loop por si el archivo terminó de cargar más tarde.
 */
function iniciarAudio() {
  if (!audioIniciado) {
    audioIniciado = true;
    const desbloqueo = desbloquearAudio();
    if (desbloqueo && typeof desbloqueo.then === 'function') {
      // El contexto se reanuda de forma asíncrona: recién ahí se puede sonar.
      desbloqueo.then(() => intentarMusica()).catch(() => {});
      return;
    }
  } else if (typeof getAudioContext === 'function') {
    const contexto = getAudioContext();
    if (contexto && contexto.state === 'suspended') desbloquearAudio();
  }

  intentarMusica();
}

/** La música suena solo en partida: ni en menús, ni en pausa, ni en game over. */
function musicaPermitida() {
  if (window.juego && window.juego.gameOver) return false;
  if (window.TetrisUI && typeof window.TetrisUI.getScreen === 'function') {
    return window.TetrisUI.getScreen() === 'game';
  }
  return true;
}

/** Arranca el loop de la música si el archivo está listo. */
function intentarMusica() {
  if (!musicaPermitida()) return;
  if (!sonidoMusica || !sonidoMusica.isLoaded()) return;
  if (sonidoMusica.isPlaying()) return;

  sonidoMusica.setVolume(VOLUMEN_MUSICA);
  sonidoMusica.loop();
}

/** Corta la música (por ejemplo, al perder la partida). */
function detenerMusica() {
  if (!sonidoMusica || !sonidoMusica.isLoaded()) return;
  if (sonidoMusica.isPlaying()) sonidoMusica.stop();
}

/** Vuelve a arrancar la música y corta el efecto de game over (al reiniciar). */
function reanudarAudio() {
  if (sonidoGameOver && sonidoGameOver.isLoaded() && sonidoGameOver.isPlaying()) {
    sonidoGameOver.stop();
  }
  intentarMusica();
}

/** ¿La música está sonando de verdad? */
function musicaActiva() {
  if (!sonidoMusica || !sonidoMusica.isLoaded()) return false;
  if (!sonidoMusica.isPlaying()) return false;

  if (typeof getAudioContext === 'function') {
    const contexto = getAudioContext();
    if (contexto && contexto.state !== 'running') return false;
  }

  return true;
}

/** Reproduce un efecto una vez. Si ya estaba sonando, lo reinicia. */
function reproducirEfecto(sonido) {
  if (!sonido || !sonido.isLoaded()) return;

  if (sonido.isPlaying()) sonido.stop();
  sonido.setVolume(VOLUMEN_EFECTOS);
  sonido.play();
}

/* ============================================================================
   EXPOSICIÓN
   ----------------------------------------------------------------------------
   - En el navegador, las clases quedan accesibles desde la consola (F12) vía
     `window.Tetris`, además del ámbito global normal.
   - En Node, se exportan para poder testear el motor sin p5.
   ============================================================================ */
if (typeof window !== 'undefined') {
  window.Tetris = {
    Pieza,
    Tablero,
    JuegoTetris,
    CONFIG_JUEGO,
    COLUMNAS,
    FILAS,
    TIPOS_PIEZA,
    COLORES_PIEZA,
    FORMAS_PIEZA
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Pieza,
    Tablero,
    JuegoTetris,
    CONFIG_JUEGO,
    COLUMNAS,
    FILAS,
    TIPOS_PIEZA,
    COLORES_PIEZA,
    FORMAS_PIEZA
  };
}
