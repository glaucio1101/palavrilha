/*
 * Palavrilha 2.0 - Gerador de quebra-cabeças (Node.js, uso local apenas)
 * ------------------------------------------------------------------
 * Este script NÃO vai para o navegador. Ele produz puzzles.json / puzzles.js
 * com 60 quebra-cabeças numerados de 1 a 60.
 *
 * O que muda da versão clássica (pasta classic/):
 *   - Sem palavras de 2 ou 3 letras: só 4, 5, 6 ou 7 letras.
 *   - Cada quebra-cabeça tem 4, 5 OU 6 palavras (não sempre 5).
 *   - O tabuleiro NÃO é sempre 5x5: as dimensões (linhas x colunas) se
 *     ajustam ao total de letras do dia, entre 5x5 e 8x8.
 *   - A "receita" do dia (quantas palavras, de que tamanhos, tabuleiro de
 *     que formato) é sorteada com a MESMA semente determinística do
 *     quebra-cabeça nº N -- ou seja, muda de um dia para o outro, mas é a
 *     mesma para todo mundo no mesmo dia (nº N sempre sorteia a mesma
 *     receita).
 *
 * Fonte da lista de palavras: a mesma de classic/generate-puzzles.js
 * (https://github.com/pythonprobr/palavras - dicionário VERO pt_BR, licença
 * livre). Ver wordlist-ptbr.txt na raiz do projeto.
 *
 * Execução:  node generate-puzzles.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------------------
// Parâmetros gerais
// ----------------------------------------------------------------------------
const PUZZLE_COUNT = 60;
const MAX_ATTEMPTS_PER_PUZZLE = 4000;
const MIN_LEN = 4, MAX_LEN = 7;          // tamanhos de palavra permitidos
const COUNT_CHOICES = [4, 5, 6];         // nº de palavras possível por dia
const SUM_BAND = { 4: [18, 24], 5: [22, 30], 6: [28, 36] }; // faixa de células livres por nº de palavras
const WALL_RATIO = 0.20;                 // ~20% de paredes
const MIN_SIDE = 5, MAX_SIDE = 8;        // tabuleiro entre 5x5 e 8x8

// ----------------------------------------------------------------------------
// Pool curado de palavras comuns do português brasileiro, por tamanho.
// (Reaproveita os pools de 4/5/6 já validados na versão clássica e acrescenta
// um pool de 7 letras. Grafia conferida contra wordlist-ptbr.txt em runtime.)
// ----------------------------------------------------------------------------
const RAW_POOL = {
  4: ['casa', 'mesa', 'gato', 'rato', 'bola', 'vela', 'sapo', 'lobo', 'urso',
      'pato', 'dado', 'fada', 'rosa', 'sino', 'faca', 'sopa', 'mala', 'sala',
      'tela', 'taco', 'saco', 'selo', 'gelo', 'dedo', 'rede', 'vida', 'fogo',
      'jogo', 'lago', 'nave', 'café', 'luva', 'peru', 'remo', 'ramo', 'cama',
      'capa', 'copa', 'mapa', 'pipa', 'tapa', 'vaca', 'foca', 'toca', 'anel',
      'azul', 'aula', 'amor', 'bico', 'boca', 'foco', 'laço', 'moça', 'frio',
      'chão', 'unha', 'ilha', 'isca', 'flor', 'leão', 'pele', 'doce', 'trem',
      'lupa', 'gota', 'mato', 'moto', 'nota', 'rolo'],
  5: ['carro', 'livro', 'praia', 'campo', 'verde', 'preto', 'tigre', 'zebra',
      'cobra', 'pombo', 'ganso', 'leite', 'farol', 'navio', 'barco', 'pente',
      'dente', 'fonte', 'ponte', 'monte', 'festa', 'gosto', 'calor', 'valor',
      'suave', 'terra', 'pedra', 'praça', 'graça', 'plano', 'chuva', 'vento',
      'tempo', 'manhã', 'tarde', 'noite', 'claro', 'largo', 'longo', 'fruta',
      'limão', 'mamão', 'melão', 'globo', 'pluma', 'porta', 'livre', 'papel',
      'nuvem', 'rádio', 'sonho', 'lenço', 'jarra', 'balde', 'vidro', 'metal',
      'peixe'],
  6: ['cavalo', 'coelho', 'macaco', 'girafa', 'jacaré', 'tucano', 'cidade',
      'aldeia', 'escola', 'quadro', 'caneta', 'janela', 'parede', 'banana',
      'tomate', 'alface', 'queijo', 'camisa', 'sapato', 'cabelo', 'outono',
      'semana', 'minuto', 'tapete', 'toalha', 'panela', 'colher', 'guarda',
      'animal', 'pessoa', 'amanhã', 'granja', 'cebola', 'girino', 'tijolo',
      'parque', 'bairro', 'garoto', 'garota', 'fogão', 'lagoa', 'flauta',
      'violão', 'martelo'],
  7: ['caderno', 'janeiro', 'domingo', 'sozinho', 'caminho', 'coberta',
      'amarelo', 'morango', 'estrela', 'pássaro', 'estrada', 'semente',
      'varanda', 'piscina', 'caverna', 'deserto', 'criança', 'palhaço',
      'foguete', 'planeta', 'cozinha', 'relógio', 'teclado', 'vestido',
      'desenho', 'pintura', 'bateria', 'segunda', 'vizinho', 'lavanda',
      'abacaxi', 'quintal', 'formiga', 'gaivota', 'outubro', 'arrumar',
      'guardar', 'sorriso', 'almoçar', 'vermelho', 'cortina', 'presente',
      'sandália', 'aventura', 'floresta'],
};

// ----------------------------------------------------------------------------
// RNG determinístico (mulberry32) por número de quebra-cabeça
// ----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

// ----------------------------------------------------------------------------
// Carregar dicionário
// ----------------------------------------------------------------------------
const LETTER_RE = /^[a-záâãàéêíóôõúç]+$/;

function loadDictionary() {
  const file = path.join(__dirname, 'wordlist-ptbr.txt');
  if (!fs.existsSync(file)) {
    console.error('ERRO: wordlist-ptbr.txt não encontrado na raiz do projeto.');
    console.error('Baixe de: https://raw.githubusercontent.com/pythonprobr/palavras/master/palavras.txt');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const words = new Set();
  const prefixes = new Set();
  for (let line of text.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
    if (!LETTER_RE.test(w)) continue;
    words.add(w);
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return { words, prefixes };
}

// ----------------------------------------------------------------------------
// Utilidades de grade (parametrizadas por ROWS x COLS)
// ----------------------------------------------------------------------------
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // cima, baixo, esq, dir (sem diagonais)

function makeGridOps(rows, cols) {
  const idx = (r, c) => r * cols + c;
  const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  const neighbors = (cell) => {
    const r = Math.floor(cell / cols), c = cell % cols;
    const out = [];
    for (const [dr, dc] of DIRS) if (inBounds(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
    return out;
  };
  const connectedComponents = (freeSet) => {
    const seen = new Set(); const comps = [];
    for (const start of freeSet) {
      if (seen.has(start)) continue;
      const stack = [start]; const comp = []; seen.add(start);
      while (stack.length) {
        const cur = stack.pop(); comp.push(cur);
        for (const nb of neighbors(cur)) if (freeSet.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
      comps.push(comp);
    }
    return comps;
  };
  return { idx, inBounds, neighbors, connectedComponents, rows, cols, total: rows * cols };
}

function subsetSum(lengths, target) {
  if (target === 0) return true;
  if (target < 0 || lengths.length === 0) return false;
  const [first, ...rest] = lengths;
  return subsetSum(rest, target - first) || subsetSum(rest, target);
}
function componentsFillable(G, freeSet, availLengths) {
  for (const comp of G.connectedComponents(freeSet)) {
    if (!subsetSum(availLengths, comp.length)) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Enumeração de caminhos que cobrem a PRIMEIRA célula livre (ordem de leitura)
// (mesma lógica da versão clássica; ver classic/generate-puzzles.js para os
// comentários completos sobre por que isso é suficiente e correto.)
// ----------------------------------------------------------------------------
function pathsCoveringFirst(G, freeSet, C, L, letterAt, dict, cb) {
  (function dfs(pathCells, str) {
    if (!dict.prefixes.has(str)) return;
    if (pathCells.length === L) { if (dict.words.has(str)) cb(pathCells.slice()); return; }
    const last = pathCells[pathCells.length - 1];
    for (const nb of G.neighbors(last)) {
      if (!freeSet.has(nb) || pathCells.includes(nb)) continue;
      pathCells.push(nb); dfs(pathCells, str + letterAt(nb)); pathCells.pop();
    }
  })([C], letterAt(C));

  const r = Math.floor(C / G.cols), c = C % G.cols;
  const R = G.inBounds(r, c + 1) ? G.idx(r, c + 1) : -1;
  const D = G.inBounds(r + 1, c) ? G.idx(r + 1, c) : -1;
  if (R < 0 || D < 0 || !freeSet.has(R) || !freeSet.has(D)) return;

  const arm = (startCell, len, blocked) => {
    const results = [];
    (function dfs(cells) {
      if (cells.length === len) { results.push(cells.slice()); return; }
      const last = cells[cells.length - 1];
      for (const nb of G.neighbors(last)) {
        if (nb === C || !freeSet.has(nb) || cells.includes(nb) || blocked.has(nb)) continue;
        cells.push(nb); dfs(cells); cells.pop();
      }
    })([startCell]);
    return results;
  };
  for (let a = 1; a <= L - 2; a++) {
    const b = L - 1 - a;
    for (const a1 of arm(R, a, new Set())) {
      const blocked = new Set(a1);
      for (const a2 of arm(D, b, blocked)) {
        const full = a1.slice().reverse().concat([C], a2);
        let str = ''; for (const cell of full) str += letterAt(cell);
        if (dict.words.has(str)) cb(full);
      }
    }
  }
}

function countSolutions(G, letterGrid, wallSet, dict, wordLengths, stopAt) {
  const free = new Set();
  for (let i = 0; i < G.total; i++) if (!wallSet.has(i)) free.add(i);
  const letterAt = (cell) => letterGrid[cell];
  let count = 0;

  (function solve(freeSet, availLengths) {
    if (count >= stopAt) return;
    if (freeSet.size === 0) { count++; return; }
    if (!componentsFillable(G, freeSet, availLengths)) return;

    let first = -1;
    for (let i = 0; i < G.total; i++) if (freeSet.has(i)) { first = i; break; }

    const tried = new Set();
    for (const L of availLengths) {
      if (tried.has(L)) continue;
      tried.add(L);
      pathsCoveringFirst(G, freeSet, first, L, letterAt, dict, (pathCells) => {
        if (count >= stopAt) return;
        const nextFree = new Set(freeSet);
        for (const cell of pathCells) nextFree.delete(cell);
        const nextAvail = availLengths.slice();
        nextAvail.splice(nextAvail.indexOf(L), 1);
        solve(nextFree, nextAvail);
      });
      if (count >= stopAt) return;
    }
  })(free, wordLengths);

  return count;
}

// ----------------------------------------------------------------------------
// Receita do dia: nº de palavras, tamanhos, e dimensões do tabuleiro
// ----------------------------------------------------------------------------
function pickRecipe(rnd) {
  const roll = rnd();
  const count = roll < 0.34 ? 4 : (roll < 0.72 ? 5 : 6);
  const [lo, hi] = SUM_BAND[count];

  for (let attempt = 0; attempt < 300; attempt++) {
    const lengths = [];
    for (let i = 0; i < count; i++) lengths.push(MIN_LEN + Math.floor(rnd() * (MAX_LEN - MIN_LEN + 1)));
    const sum = lengths.reduce((a, b) => a + b, 0);
    if (sum >= lo && sum <= hi) return lengths.sort((a, b) => a - b);
  }
  // fallback muito improvável: distribui uniformemente dentro da faixa
  const base = Math.floor(((lo + hi) / 2) / count);
  const lengths = new Array(count).fill(Math.max(MIN_LEN, Math.min(MAX_LEN, base)));
  return lengths.sort((a, b) => a - b);
}

function pickBoardDims(openCells) {
  const total = Math.ceil(openCells / (1 - WALL_RATIO));
  let best = null;
  for (let rows = MIN_SIDE; rows <= MAX_SIDE; rows++) {
    for (let cols = MIN_SIDE; cols <= MAX_SIDE; cols++) {
      if (rows * cols < total) continue;
      const waste = rows * cols - total;
      const squareness = Math.abs(rows - cols);
      const score = waste * 2 + squareness;
      if (!best || score < best.score) best = { rows, cols, score };
    }
  }
  if (!best) best = { rows: MAX_SIDE, cols: MAX_SIDE }; // não deveria acontecer nas faixas configuradas
  return { rows: best.rows, cols: best.cols };
}

// ----------------------------------------------------------------------------
// Gera uma "solução pretendida": paredes + partição das células livres em N
// caminhos com os comprimentos da receita do dia.
// ----------------------------------------------------------------------------
function buildIntendedLayout(G, wallCount, lengths, rnd) {
  let wallSet = null;
  for (let tries = 0; tries < 500; tries++) {
    const cells = shuffle([...Array(G.total).keys()], rnd);
    const cand = new Set(cells.slice(0, wallCount));
    const free = new Set();
    for (let i = 0; i < G.total; i++) if (!cand.has(i)) free.add(i);
    if (G.connectedComponents(free).length !== 1) continue;
    wallSet = cand;
    break;
  }
  if (!wallSet) return null;

  const free = new Set();
  for (let i = 0; i < G.total; i++) if (!wallSet.has(i)) free.add(i);

  const lens = lengths.slice().sort((a, b) => b - a); // maiores primeiro: poda melhor
  const paths = [];

  const ok = (function place(freeSet, li) {
    if (li === lens.length) return freeSet.size === 0;
    if (!componentsFillable(G, freeSet, lens.slice(li))) return false;

    let first = -1;
    for (let i = 0; i < G.total; i++) if (freeSet.has(i)) { first = i; break; }
    const L = lens[li];

    const candidates = [];
    (function dfs(cells) {
      if (cells.length === L) { candidates.push(cells.slice()); return; }
      const last = cells[cells.length - 1];
      for (const nb of shuffle(G.neighbors(last), rnd)) {
        if (!freeSet.has(nb) || cells.includes(nb)) continue;
        cells.push(nb); dfs(cells); cells.pop();
      }
    })([first]);

    const r = Math.floor(first / G.cols), c = first % G.cols;
    const R = G.inBounds(r, c + 1) ? G.idx(r, c + 1) : -1;
    const D = G.inBounds(r + 1, c) ? G.idx(r + 1, c) : -1;
    if (R >= 0 && D >= 0 && freeSet.has(R) && freeSet.has(D)) {
      const arm = (startCell, len, blocked) => {
        const res = [];
        (function dfs(cells) {
          if (cells.length === len) { res.push(cells.slice()); return; }
          const last = cells[cells.length - 1];
          for (const nb of G.neighbors(last)) {
            if (nb === first || !freeSet.has(nb) || cells.includes(nb) || blocked.has(nb)) continue;
            cells.push(nb); dfs(cells); cells.pop();
          }
        })([startCell]);
        return res;
      };
      for (let a = 1; a <= L - 2; a++) {
        const b = L - 1 - a;
        for (const a1 of arm(R, a, new Set())) {
          for (const a2 of arm(D, b, new Set(a1))) candidates.push(a1.slice().reverse().concat([first], a2));
        }
      }
    }

    for (const pathCells of shuffle(candidates, rnd)) {
      const nextFree = new Set(freeSet);
      for (const cell of pathCells) nextFree.delete(cell);
      paths.push(pathCells);
      if (place(nextFree, li + 1)) return true;
      paths.pop();
    }
    return false;
  })(free, 0);

  if (!ok) return null;

  const byLen = new Map();
  for (const p of paths) {
    const key = p.length;
    if (!byLen.has(key)) byLen.set(key, []);
    byLen.get(key).push(p);
  }
  const orderedPaths = lengths.map((L) => byLen.get(L).pop());
  return { wallSet, paths: orderedPaths };
}

// ----------------------------------------------------------------------------
// Monta um quebra-cabeça completo e verifica unicidade
// ----------------------------------------------------------------------------
function makePuzzle(number, dict, pool, usage) {
  const rnd = mulberry32(0x9e3779b9 ^ (number * 2654435761));
  const lengths = pickRecipe(rnd);
  const openCells = lengths.reduce((a, b) => a + b, 0);
  const { rows, cols } = pickBoardDims(openCells);
  const G = makeGridOps(rows, cols);
  const wallCount = G.total - openCells;

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PUZZLE; attempt++) {
    const layout = buildIntendedLayout(G, wallCount, lengths, rnd);
    if (!layout) continue;
    const { wallSet, paths } = layout;

    const chosen = [];
    let feasible = true;
    for (let k = 0; k < lengths.length; k++) {
      const L = lengths[k];
      const options = (pool[L] || []).filter((w) => !chosen.includes(w));
      if (options.length === 0) { feasible = false; break; }
      const ranked = shuffle(options, rnd).sort((a, b) => (usage.get(a) || 0) - (usage.get(b) || 0));
      const bucket = ranked.slice(0, Math.min(6, ranked.length));
      chosen.push(pick(bucket, rnd));
    }
    if (!feasible) continue;

    const letterGrid = new Array(G.total).fill(null);
    for (let k = 0; k < lengths.length; k++) {
      const word = chosen[k], p = paths[k];
      for (let i = 0; i < p.length; i++) letterGrid[p[i]] = word[i];
    }
    let filledOk = true;
    for (let i = 0; i < G.total; i++) if (!wallSet.has(i) && letterGrid[i] == null) { filledOk = false; break; }
    if (!filledOk) continue;

    const solutions = countSolutions(G, letterGrid, wallSet, dict, lengths, 2);
    if (solutions !== 1) continue;

    for (const w of chosen) usage.set(w, (usage.get(w) || 0) + 1);

    const walls = [...wallSet].map((i) => [Math.floor(i / cols), i % cols])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(wallSet.has(G.idx(r, c)) ? null : letterGrid[G.idx(r, c)].toUpperCase());
      grid.push(row);
    }
    const words = lengths.map((L, k) => ({
      word: chosen[k], length: L,
      path: paths[k].map((cell) => [Math.floor(cell / cols), cell % cols]),
    }));

    return { id: number, rows, cols, grid, walls, words, attempts: attempt + 1 };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
function main() {
  console.log('Palavrilha 2.0 - gerando quebra-cabeças...');
  console.log('Carregando dicionário (wordlist-ptbr.txt)...');
  const dict = loadDictionary();
  console.log(`  ${dict.words.size} formas de ${MIN_LEN} a ${MAX_LEN} letras carregadas.`);

  const pool = {};
  for (let L = MIN_LEN; L <= MAX_LEN; L++) {
    const kept = [], dropped = [];
    for (const w of (RAW_POOL[L] || [])) {
      if (w.length !== L) { dropped.push(w + ' (tamanho)'); continue; }
      if (dict.words.has(w)) kept.push(w); else dropped.push(w);
    }
    pool[L] = [...new Set(kept)];
    console.log(`  tamanho ${L}: ${pool[L].length} palavras no pool` +
      (dropped.length ? `  (descartadas: ${dropped.join(', ')})` : ''));
    if (pool[L].length < 6) {
      console.error(`ERRO: pool de tamanho ${L} pequeno demais (${pool[L].length}).`);
      process.exit(1);
    }
  }

  const usage = new Map();
  const puzzles = [];
  const t0 = Date.now();

  for (let n = 1; n <= PUZZLE_COUNT; n++) {
    const p = makePuzzle(n, dict, pool, usage);
    if (!p) { console.error(`ERRO: não foi possível gerar o quebra-cabeça ${n}.`); process.exit(1); }
    puzzles.push(p);
    process.stdout.write(
      `  #${String(n).padStart(2, '0')}  ${p.rows}x${p.cols}  ` +
      p.words.map((w) => w.word).join(' · ') +
      `   (tentativas: ${p.attempts})\n`
    );
  }

  const out = {
    generator: 'generate-puzzles.js (2.0)',
    source: 'https://github.com/pythonprobr/palavras (palavras.txt, dic. VERO pt_BR, licença livre)',
    generatedAt: new Date().toISOString(),
    wordLengthRange: [MIN_LEN, MAX_LEN],
    wordCountChoices: COUNT_CHOICES,
    count: puzzles.length,
    puzzles: puzzles.map(({ attempts, ...rest }) => rest),
  };

  fs.writeFileSync(path.join(__dirname, 'puzzles.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  fs.writeFileSync(
    path.join(__dirname, 'puzzles.js'),
    '/* Gerado por generate-puzzles.js - não editar à mão. */\n' +
    'window.PALAVRILHA_PUZZLES = ' + JSON.stringify(out) + ';\n',
    'utf8'
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nOK: ${puzzles.length} quebra-cabeças em ${dt}s`);
}

main();
