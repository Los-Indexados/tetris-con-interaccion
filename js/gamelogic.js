/* ============================================================================
   TETRIS — FASE 1
   ----------------------------------------------------------------------------
   Todo el juego vive en este archivo, sin carpetas ni archivos externos.

     SECCIÓN 1 · MOTOR     Pieza, Tablero y JuegoTetris. Lógica pura: no
                           depende de p5, ni del DOM, ni del teclado.
     SECCIÓN 2 · LAYOUT    Cálculo dinámico de celda, offsets y espacio lateral.
     SECCIÓN 3 · INTERFAZ  Paleta, panel de puntaje y overlays (Persona 2).
     SECCIÓN 4 · AUDIO     Música y efectos con p5.sound.
     SECCIÓN 5 · p5        Canvas, dibujo del tablero y entrada de teclado.

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ PERSONA 3 (HANDPOSE) — API PÚBLICA                                       │
   │                                                                          │
   │ `window.juego` es el motor vivo. Llamá estas funciones desde handpose:   │
   │                                                                          │
   │   juego.moverIzquierda()   -> true/false                                 │
   │   juego.moverDerecha()     -> true/false                                 │
   │   juego.bajarRapido()      -> true/false (baja UNA fila)                 │
   │   juego.rotar()            -> true/false (con wall-kick)                 │
   │   juego.reiniciar()                                                      │
   │   juego.alternarPausa()    -> estado de pausa                            │
   │                                                                          │
   │ No dependen del teclado. Devuelven false si no se pudieron aplicar       │
   │ (pausa, game over, borde del tablero o colisión).                        │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │ PERSONA 2 (INTERFAZ) — ESTADO PÚBLICO                                    │
   │                                                                          │
   │   juego.tablero.matriz   matriz [FILAS][COLUMNAS] con tipo de pieza|null │
   │   juego.piezaActual      Pieza en juego (o null)                         │
   │   juego.siguientePieza   Pieza próxima                                   │
   │   juego.puntaje / lineas / nivel / pausado / gameOver                    │
   │   juego.calcularCaida()  filas que puede bajar la pieza actual           │
   │   window.layoutTetris    tamaño y posición actual del tablero y panel   │
   │                                                                          │
   │ El panel y los overlays están en la SECCIÓN 3. Si querés separarlos en   │
   │ js/interface.js, cortá esa sección entera. Cargá interface.js después    │
   │ de gamelogic.js y no dupliques PALETA (es const y rompería el arranque). │
   └──────────────────────────────────────────────────────────────────────────┘
   ============================================================================ */

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
    this.intervaloBase = opciones.intervaloBase ?? 800;
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

    const nuevaForma = this.piezaActual.formaRotada();
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
   SECCIÓN 2 · LAYOUT Y ESTADO
   ----------------------------------------------------------------------------
   Canvas 100% de la ventana con margen perimetral de 1 cm (≈38 px). La matriz
   es 16x16 para que el tablero llene la pantalla con bloques grandes.

     [ 1 cm ] [ tablero 16x16 ] [ separación ] [ panel ] [ 1 cm ]

   El tablero se lleva el máximo tamaño posible: la celda sale del alto y del
   ancho disponible después de reservar el panel. El panel mide 190/600 del
   alto del tablero, así que escala junto con él. El grupo tablero+panel se
   centra dentro del área útil, con márgenes simétricos.

   Valores públicos (window.layoutTetris, se renueva en cada resize):
     margen                 margen perimetral en px
     tamCelda               lado de cada bloque
     offsetX/offsetY        esquina superior izquierda del tablero
     anchoTablero/altoTablero
     espacioLateral         margen extra por fuera del grupo tablero+panel
     panelX/panelY/panelAncho/panelAlto
     panelEscala            0 = panel oculto (pantalla demasiado chica)
     handpose {x,y,ancho,alto}  área reservada al visor de Persona 3
   ============================================================================ */

const CELDA_DISENO = 30;   // referencia del diseño original (escala 1)
const MARGEN_1CM = 38;     // 96 px/pulgada / 2.54 ≈ 37.8

let tamCelda = CELDA_DISENO;
let offsetX = MARGEN_1CM;
let offsetY = MARGEN_1CM;
let anchoTablero = COLUMNAS * CELDA_DISENO;
let altoTablero = FILAS * CELDA_DISENO;
let espacioLateral = 0;
let panelX = 0;
let panelY = 0;
let panelAncho = 190;
let panelAlto = 600;
let panelEscala = 1;
let panelVisible = true;

// ─── Estado de la sesión ─────────────────────────────────────────────────────
let juego;

// Evitan que mantener P o R produzca un toggle por cada repetición del SO.
let pausaPulsada = false;
let reinicioPulsado = false;

/**
 * Recalcula el layout completo. Se llama en setup() y en windowResized().
 *
 * 1. Área útil = ventana menos 1 cm en cada borde.
 * 2. Celda = la mayor que entra por alto (FILAS) y por ancho
 *    (COLUMNAS + panel + separación), sin deformar el tablero.
 * 3. El grupo tablero + panel se centra dentro del área útil.
 */
function calcularLayout() {
  const utilAncho = windowWidth - MARGEN_1CM * 2;
  const utilAlto = windowHeight - MARGEN_1CM * 2;

  // Separación tablero-panel: proporcional, acotada entre 12 y 32 px.
  const separacion = Math.min(32, Math.max(12, Math.round(utilAncho * 0.015)));

  // El panel mide 190/600 del alto del tablero. En unidades de celda eso es
  // (190/600) * FILAS: para 16 filas, 5.07 celdas de ancho.
  const panelEnCeldas = (190 / 600) * FILAS;

  // Celda máxima: la que entra por alto y por ancho (tablero + panel + gap).
  const celdaPorAlto = utilAlto / FILAS;
  const celdaPorAncho = (utilAncho - separacion) / (COLUMNAS + panelEnCeldas);
  let celda = Math.min(celdaPorAlto, celdaPorAncho);

  // Si el panel quedaría por debajo de la escala mínima legible, se oculta y
  // el tablero aprovecha todo el ancho disponible.
  panelVisible = (FILAS * celda) / 600 >= 0.5;
  if (!panelVisible) {
    celda = Math.min(celdaPorAlto, utilAncho / COLUMNAS);
  }

  tamCelda = Math.max(8, Math.floor(celda));

  anchoTablero = tamCelda * COLUMNAS;
  altoTablero = tamCelda * FILAS;

  if (panelVisible) {
    panelEscala = altoTablero / 600;
    panelAncho = (190 / 600) * altoTablero;
  } else {
    panelEscala = 0;
    panelAncho = 0;
  }
  panelAlto = altoTablero;

  // Grupo tablero + separación + panel, centrado dentro del margen de 1 cm.
  const anchoGrupo = anchoTablero + (panelVisible ? separacion + panelAncho : 0);
  offsetX = Math.round(MARGEN_1CM + (utilAncho - anchoGrupo) / 2);
  offsetY = Math.round(MARGEN_1CM + (utilAlto - altoTablero) / 2);

  panelX = offsetX + anchoTablero + separacion;
  panelY = offsetY;

  // Margen extra por fuera del grupo (además del margen de 1 cm).
  espacioLateral = Math.max(0, (utilAncho - anchoGrupo) / 2);

  // Snapshot público para Persona 2 / Persona 3 (se renueva en cada resize).
  window.layoutTetris = {
    margen: MARGEN_1CM,
    columnas: COLUMNAS,
    filas: FILAS,
    tamCelda,
    offsetX,
    offsetY,
    anchoTablero,
    altoTablero,
    separacion,
    espacioLateral,
    panelVisible,
    panelX,
    panelY,
    panelAncho,
    panelAlto,
    panelEscala,
    handpose: {
      x: panelX,
      y: panelY + 456 * panelEscala,
      ancho: panelAncho,
      alto: 128 * panelEscala
    }
  };
}

/* ============================================================================
   SECCIÓN 3 · INTERFAZ  (PERSONA 2)
   ----------------------------------------------------------------------------
   Paleta, panel de puntaje, próxima pieza, ayuda de controles y overlays.
   Si esta sección se migra a js/interface.js, debe cargarse después de este
   archivo en index.html.
   ============================================================================ */

// Paleta única de la fase visual. Cambiar un valor acá cambia todo el juego.
const PALETA = {
  fondo: '#0b0f17',
  panel: '#121a27',
  borde: '#1e2a3d',
  grilla: '#1b2534',
  texto: '#e6edf7',
  textoTenue: '#7d8ea6',
  acento: '#00e5ff',
  peligro: '#ff4d6d'
};

/** Caja redondeada estándar de la interfaz. */
function dibujarCaja(x, y, ancho, alto, radio = 8) {
  push();
  fill(PALETA.panel);
  stroke(PALETA.borde);
  strokeWeight(1);
  rect(x, y, ancho, alto, radio);
  pop();
}

/** Tarjeta con etiqueta chica y valor grande (PUNTAJE, LÍNEAS, NIVEL). */
function drawTarjeta(x, y, ancho, alto, etiqueta, valor, escala = 1) {
  dibujarCaja(x, y, ancho, alto, 8 * escala);

  push();
  noStroke();
  textAlign(LEFT, TOP);

  fill(PALETA.textoTenue);
  textSize(10 * escala);
  textStyle(BOLD);
  text(etiqueta, x + 12 * escala, y + 11 * escala);

  fill(PALETA.texto);
  textSize(22 * escala);
  text(valor, x + 12 * escala, y + 29 * escala);

  pop();
}

/**
 * Dibuja la próxima pieza centrada dentro de una caja.
 * @param {Pieza} pieza
 * @param {number} x esquina superior izquierda de la caja
 * @param {number} y
 * @param {number} ancho
 * @param {number} alto
 * @param {number} tamCelda
 */
function dibujarPiezaMini(pieza, x, y, ancho, alto, tamCelda) {
  if (!pieza) return;

  // Celdas ocupadas en coordenadas de la propia forma (sin posición).
  const celdas = [];
  for (let fila = 0; fila < pieza.forma.length; fila++) {
    for (let columna = 0; columna < pieza.forma[fila].length; columna++) {
      if (pieza.forma[fila][columna]) celdas.push({ x: columna, y: fila });
    }
  }
  if (celdas.length === 0) return;

  // Recuadro real de la pieza, para centrarla sin importar el hueco de la caja.
  const minX = Math.min(...celdas.map((c) => c.x));
  const maxX = Math.max(...celdas.map((c) => c.x));
  const minY = Math.min(...celdas.map((c) => c.y));
  const maxY = Math.max(...celdas.map((c) => c.y));

  const anchoPieza = (maxX - minX + 1) * tamCelda;
  const altoPieza = (maxY - minY + 1) * tamCelda;
  const origenX = x + (ancho - anchoPieza) / 2;
  const origenY = y + (alto - altoPieza) / 2;

  push();
  noStroke();
  fill(pieza.color);
  for (const celda of celdas) {
    rect(
      origenX + (celda.x - minX) * tamCelda + 1,
      origenY + (celda.y - minY) * tamCelda + 1,
      tamCelda - 2,
      tamCelda - 2,
      4
    );
  }
  pop();
}

/** Panel lateral. Se dibuja una vez por frame. */
function drawPanel(juego) {
  // El panel escala con el tablero: si queda muy chico, no se dibuja.
  if (panelEscala >= 0.85) {
    drawPanelCompleto(juego);
  } else if (panelEscala >= 0.5) {
    drawPanelCompacto(juego);
  }
}

/**
 * Panel completo (Persona 2 / Persona 3), escalado con el tablero.
 * Diseño base: caja de 190 x 600 unidades (una celda de 30 = escala 1).
 */
function drawPanelCompleto(juego) {
  const s = panelEscala;
  const x = panelX;
  const w = panelAncho;
  const y = panelY;

  push();
  noStroke();
  textAlign(LEFT, TOP);

  // Título
  fill(PALETA.acento);
  textSize(26 * s);
  textStyle(BOLD);
  text('TETRIS', x, y + 6 * s);

  // Puntaje
  drawTarjeta(x, y + 40 * s, w, 58 * s, 'PUNTAJE', String(juego.puntaje).padStart(6, '0'), s);

  // Líneas y nivel
  const anchoMitad = (w - 10 * s) / 2;
  drawTarjeta(x, y + 108 * s, anchoMitad, 58 * s, 'LÍNEAS', String(juego.lineas), s);
  drawTarjeta(x + anchoMitad + 10 * s, y + 108 * s, anchoMitad, 58 * s, 'NIVEL', String(juego.nivel), s);

  // Próxima pieza
  fill(PALETA.textoTenue);
  textSize(11 * s);
  textStyle(BOLD);
  text('SIGUIENTE', x, y + 182 * s);
  textStyle(NORMAL);

  dibujarCaja(x, y + 200 * s, w, 92 * s, 8 * s);
  dibujarPiezaMini(juego.siguientePieza, x, y + 200 * s, w, 92 * s, 22 * s);

  // Ayuda de controles
  fill(PALETA.textoTenue);
  textSize(11 * s);
  textStyle(BOLD);
  text('CONTROLES', x, y + 310 * s);
  textStyle(NORMAL);

  const controles = [
    ['← / A', 'mover'],
    ['→ / D', 'mover'],
    ['↓ / S', 'bajar'],
    ['↑ / W', 'rotar'],
    ['ESPACIO', 'rotar'],
    ['P', 'pausa']
  ];

  textSize(11 * s);
  controles.forEach(([tecla, accion], i) => {
    const fy = y + (332 + i * 17) * s;

    fill(PALETA.texto);
    textAlign(LEFT, TOP);
    text(tecla, x, fy);

    fill(PALETA.textoTenue);
    textAlign(RIGHT, TOP);
    text(accion, x + w, fy);
  });

  // Visor / estado de Handpose: área reservada a Persona 3.
  fill(PALETA.textoTenue);
  textSize(11 * s);
  textStyle(BOLD);
  textAlign(LEFT, TOP);
  text('HAND POSE', x, y + 438 * s);
  textStyle(NORMAL);

  const hpY = y + 456 * s;
  const hpAlto = 128 * s;
  dibujarCaja(x, hpY, w, hpAlto, 8 * s);

  push();
  noFill();
  stroke(PALETA.borde);
  strokeWeight(Math.max(1, s));
  rect(x + 8 * s, hpY + 8 * s, w - 16 * s, hpAlto - 16 * s, 6 * s);
  pop();

  fill(PALETA.textoTenue);
  textAlign(CENTER, CENTER);
  textSize(10 * s);
  text('VISOR / ESTADO', x + w / 2, hpY + hpAlto / 2 - 8 * s);
  textSize(9 * s);
  text('Persona 3', x + w / 2, hpY + hpAlto / 2 + 10 * s);

  pop();
}

/**
 * Versión angosta: solo lo imprescindible, con tipografía calculada en píxeles
 * para que siga siendo legible cuando el panel mide poco.
 */
function drawPanelCompacto(juego) {
  const x = panelX;
  const ancho = panelAncho;

  // Escala acotada por ancho y por alto: un panel ancho pero bajo no debe
  // usar tipografía enorme.
  const s = Math.max(0.55, Math.min(ancho / 140, altoTablero / 420));
  const titulo = Math.max(13, 16 * s);
  const etiqueta = Math.max(8, 9 * s);
  const valor = Math.max(11, 14 * s);

  push();
  noStroke();
  textAlign(LEFT, TOP);

  let y = panelY;

  fill(PALETA.acento);
  textSize(titulo);
  textStyle(BOLD);
  text('TETRIS', x, y);
  y += titulo * 1.6;

  const fila = (nombre, texto, grande = false) => {
    fill(PALETA.textoTenue);
    textSize(etiqueta);
    textStyle(NORMAL);
    text(nombre, x, y);
    y += etiqueta * 1.25;

    fill(PALETA.texto);
    textSize(grande ? valor : valor * 0.8);
    textStyle(BOLD);
    text(texto, x, y);
    textStyle(NORMAL);
    y += (grande ? valor : valor * 0.8) * 1.35;
  };

  fila('PUNTAJE', String(juego.puntaje).padStart(6, '0'), true);
  fila('LÍNEAS', String(juego.lineas));
  fila('NIVEL', String(juego.nivel));

  y += valor * 0.6;
  fill(PALETA.textoTenue);
  textSize(etiqueta);
  text('SIGUIENTE', x, y);
  y += etiqueta * 1.5;

  const tamMini = Math.max(8, Math.min(16, ancho / 6));
  dibujarPiezaMini(juego.siguientePieza, x, y, ancho, tamMini * 4, tamMini);

  pop();
}

/** Overlay de pausa y game over sobre el tablero. */
function drawOverlay(juego) {
  if (!juego.pausado && !juego.gameOver) return;

  // La tipografía del overlay sigue el tamaño real de la celda.
  const s = Math.max(0.6, tamCelda / CELDA_DISENO);
  const centroX = offsetX + anchoTablero / 2;
  const centroY = offsetY + altoTablero / 2;

  push();
  noStroke();
  fill(5, 8, 13, 195);
  rect(offsetX, offsetY, anchoTablero, altoTablero, 8);
  textAlign(CENTER, CENTER);

  if (juego.gameOver) {
    fill(PALETA.peligro);
    textSize(30 * s);
    textStyle(BOLD);
    text('GAME OVER', centroX, centroY - 36 * s);

    textStyle(NORMAL);
    fill(PALETA.texto);
    textSize(14 * s);
    text('Puntaje: ' + juego.puntaje, centroX, centroY + 4 * s);

    fill(PALETA.textoTenue);
    textSize(12 * s);
    text('R para reiniciar', centroX, centroY + 34 * s);
  } else {
    fill(PALETA.acento);
    textSize(28 * s);
    textStyle(BOLD);
    text('PAUSA', centroX, centroY - 12 * s);

    textStyle(NORMAL);
    fill(PALETA.texto);
    textSize(13 * s);
    text('P para continuar', centroX, centroY + 28 * s);
  }

  pop();
}

/* ============================================================================
   SECCIÓN 4 · AUDIO  (p5.sound)
   ----------------------------------------------------------------------------
   Archivos locales en la raíz del proyecto:

     tetris.mp3     música de fondo, en loop
     linea.mp3      efecto al completar una o más líneas
     gameover.mp3   efecto al terminar la partida

   Los navegadores bloquean el audio hasta que el usuario interactúa, así que
   la música arranca en el primer clic o tecla (iniciarAudio). Mientras tanto,
   drawAvisoAudio() muestra un aviso sutil en el panel.

   Si falta algún archivo, el juego sigue funcionando sin sonido.
   ============================================================================ */

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
    () => { if (audioIniciado && (!juego || !juego.gameOver)) intentarMusica(); },
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
  if (typeof userStartAudio !== 'function') return;

  const resultado = userStartAudio();
  if (resultado && typeof resultado.catch === 'function') resultado.catch(() => {});
}

/**
 * Se llama en cada clic o tecla. La primera vez desbloquea el audio; después
 * reintenta el loop por si el archivo terminó de cargar más tarde.
 */
function iniciarAudio() {
  if (!audioIniciado) {
    audioIniciado = true;
    desbloquearAudio();
  } else if (typeof getAudioContext === 'function') {
    const contexto = getAudioContext();
    if (contexto && contexto.state === 'suspended') desbloquearAudio();
  }

  intentarMusica();
}

/** Arranca el loop de la música si el archivo está listo. */
function intentarMusica() {
  if (juego && juego.gameOver) return;
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

/** Aviso sutil cuando la música todavía no está sonando. */
function drawAvisoAudio() {
  // En game over la música se corta a propósito: no hay nada que reclamar.
  if (!juego || juego.gameOver) return;

  if (musicaActiva()) return;

  const disponible = !!(sonidoMusica && sonidoMusica.isLoaded());
  const mensaje = disponible ? 'CLIC PARA ACTIVAR MÚSICA' : 'FALTA tetris.mp3';

  // Pulso suave para llamar la atención sin tapar el juego.
  const pulso = 0.5 + 0.5 * Math.sin(millis() / 450);
  const alpha = 90 + 70 * pulso;

  push();
  noStroke();
  textAlign(CENTER, CENTER);

  if (panelVisible && panelEscala >= 0.85) {
    // Panel completo: debajo del visor de handpose.
    const s = panelEscala;
    fill(230, 237, 247, alpha);
    textSize(9 * s);
    text(mensaje, panelX + panelAncho / 2, panelY + 590 * s);
  } else if (panelVisible) {
    // Panel compacto: al pie del panel.
    fill(230, 237, 247, alpha);
    textSize(Math.max(8, panelAncho * 0.07));
    text(mensaje, panelX + panelAncho / 2, panelY + panelAlto - 14);
  } else {
    // Sin panel: debajo del tablero.
    fill(230, 237, 247, alpha);
    textSize(12);
    text(mensaje, offsetX + anchoTablero / 2, offsetY + altoTablero + 18);
  }

  pop();
}

/* ============================================================================
   SECCIÓN 5 · p5
   ----------------------------------------------------------------------------
   Ciclo de vida, dibujo del tablero y entrada de teclado. Este es el ÚNICO
   lugar donde el teclado toca el juego: cada tecla llama a la misma función
   pública que va a llamar handpose.js.
   ============================================================================ */

function setup() {
  // Canvas a pantalla completa. Todo el layout se calcula a partir de esto.
  const lienzo = createCanvas(windowWidth, windowHeight);

  // Si index.html tiene el contenedor, el canvas vive adentro; si no, p5 lo
  // agrega al body igual y el juego funciona.
  const contenedor = document.getElementById('juego');
  if (contenedor) lienzo.parent(contenedor);

  textFont('monospace');
  calcularLayout();

  juego = new JuegoTetris();

  // Enganche de audio: el motor avisa cuándo se limpian líneas y cuándo termina.
  juego.alCompletarLinea = () => reproducirEfecto(sonidoLinea);
  juego.alGameOver = () => {
    detenerMusica();
    reproducirEfecto(sonidoGameOver);
  };

  cargarAudios();

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ PERSONA 3 — ESTE ES TU PUNTO DE ENTRADA                                 │
  // │                                                                        │
  // │ `window.juego` es el motor vivo. Desde handpose.js (o la consola)      │
  // │ podés llamar en cualquier momento:                                     │
  // │                                                                        │
  // │   juego.moverIzquierda()   juego.moverDerecha()                        │
  // │   juego.bajarRapido()      juego.rotar()                               │
  // │                                                                        │
  // │ No hace falta tocar este archivo.                                      │
  // └────────────────────────────────────────────────────────────────────────┘
  window.juego = juego;
}

/**
 * p5 llama a esta función automáticamente cuando cambia el tamaño de la
 * ventana: redimensiona el canvas y recalcula celda, offsets y panel.
 */
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calcularLayout();
}

function draw() {
  // La gravedad se calcula con tiempo real, no con frames: si la pestaña se
  // frena o la máquina va lenta, la caída sigue siendo justa.
  juego.actualizar(deltaTime);

  background(PALETA.fondo);

  drawTablero();
  drawPieza();
  drawPanel(juego);
  drawOverlay(juego);
  drawAvisoAudio();
}

/** Dibuja el fondo del tablero, la grilla y las piezas ya fijadas. */
function drawTablero() {
  push();
  noStroke();
  fill(PALETA.panel);
  rect(offsetX, offsetY, anchoTablero, altoTablero, 8);

  stroke(PALETA.grilla);
  strokeWeight(1);
  for (let columna = 1; columna < COLUMNAS; columna++) {
    const x = offsetX + columna * tamCelda;
    line(x, offsetY, x, offsetY + altoTablero);
  }
  for (let fila = 1; fila < FILAS; fila++) {
    const y = offsetY + fila * tamCelda;
    line(offsetX, y, offsetX + anchoTablero, y);
  }
  pop();

  for (let fila = 0; fila < FILAS; fila++) {
    for (let columna = 0; columna < COLUMNAS; columna++) {
      const tipo = juego.tablero.matriz[fila][columna];
      if (tipo) drawCelda(columna, fila, COLORES_PIEZA[tipo]);
    }
  }
}

/** Dibuja la pieza actual y su proyección (fantasma) en el fondo. */
function drawPieza() {
  const pieza = juego.piezaActual;
  if (!pieza || juego.gameOver) return;

  // Fantasma: dónde va a aterrizar la pieza si no se toca nada.
  const caida = juego.calcularCaida();
  if (caida > 0) {
    for (const celda of pieza.celdas(pieza.x, pieza.y + caida)) {
      drawCelda(celda.x, celda.y, pieza.color, 45);
    }
  }

  for (const celda of pieza.celdas()) {
    drawCelda(celda.x, celda.y, pieza.color);
  }
}

/**
 * Dibuja una celda del tablero en coordenadas de grilla.
 * @param {number} columna
 * @param {number} fila
 * @param {string} colorHex
 * @param {number} [opacidad] 0..255
 */
function drawCelda(columna, fila, colorHex, opacidad = 255) {
  if (columna < 0 || columna >= COLUMNAS || fila < 0 || fila >= FILAS) return;

  const x = offsetX + columna * tamCelda;
  const y = offsetY + fila * tamCelda;
  const relleno = color(colorHex);
  relleno.setAlpha(opacidad);

  push();
  strokeWeight(1);
  stroke(255, 255, 255, opacidad * 0.18);
  fill(relleno);
  rect(x + 1, y + 1, tamCelda - 2, tamCelda - 2, Math.max(2, tamCelda * 0.13));

  // Brillo superior: da volumen sin necesitar imágenes.
  noStroke();
  fill(255, 255, 255, opacidad * 0.16);
  rect(
    x + tamCelda * 0.16,
    y + tamCelda * 0.13,
    tamCelda * 0.68,
    Math.max(1, tamCelda * 0.1),
    2
  );
  pop();
}

/**
 * Traduce el teclado a la API del motor. Este es el único punto de entrada
 * del teclado: por eso handpose puede usar exactamente las mismas funciones.
 */
function keyPressed() {
  // Cualquier tecla cuenta como interacción para desbloquear el audio.
  iniciarAudio();

  // Pausa: no depende del estado de la partida.
  if (key === 'p' || key === 'P') {
    if (!pausaPulsada) {
      juego.alternarPausa();
      pausaPulsada = true;
    }
    return false; // evita el comportamiento por defecto del navegador
  }

  // En game over sólo tiene sentido reiniciar.
  if (juego.gameOver) {
    if ((key === 'r' || key === 'R' || keyCode === ENTER) && !reinicioPulsado) {
      juego.reiniciar();
      reinicioPulsado = true;
      reanudarAudio();
    }
    return false;
  }

  // Mientras está pausado, el motor ya ignora las acciones.
  switch (keyCode) {
    case LEFT_ARROW:
      juego.moverIzquierda();
      break;
    case RIGHT_ARROW:
      juego.moverDerecha();
      break;
    case DOWN_ARROW:
      juego.bajarRapido();
      break;
    case UP_ARROW:
      juego.rotar();
      break;
    default:
      // Alternativas WASD y ESPACIO (todas rotan, como pide la Fase 1).
      if (key === 'a' || key === 'A') juego.moverIzquierda();
      else if (key === 'd' || key === 'D') juego.moverDerecha();
      else if (key === 's' || key === 'S') juego.bajarRapido();
      else if (key === 'w' || key === 'W' || key === ' ') juego.rotar();
      break;
  }

  return false;
}

function keyReleased() {
  if (key === 'p' || key === 'P') pausaPulsada = false;
  if (key === 'r' || key === 'R' || keyCode === ENTER) reinicioPulsado = false;
}

/**
 * p5 llama a mousePressed con cualquier clic sobre el canvas.
 * Se usa para desbloquear el audio y arrancar la música.
 */
function mousePressed() {
  iniciarAudio();
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
    COLUMNAS,
    FILAS,
    TIPOS_PIEZA,
    COLORES_PIEZA,
    FORMAS_PIEZA
  };
}
