/*
 * Palavrilha - Gerador de quebra-cabeças (Node.js, uso local apenas)
 * ------------------------------------------------------------------
 * Este script NÃO vai para o navegador. Ele produz o arquivo
 * puzzles.json (e uma cópia puzzles.js para uso via file://) com 60
 * quebra-cabeças numerados de 1 a 60.
 *
 * Fonte da lista de palavras
 * --------------------------
 * wordlist-ptbr.txt  ->  https://github.com/pythonprobr/palavras
 *   arquivo "palavras.txt" (~320 mil formas). É uma lista aberta
 *   derivada do dicionário Hunspell pt_BR do projeto VERO
 *   (BrOffice / LibreOffice), redistribuída sob licença livre
 *   (LGPL / BSD, mesma do dicionário VERO original).
 *
 * Como usar a lista aqui
 * ----------------------
 * 1. As palavras de cada quebra-cabeça saem de um POOL curado de
 *    termos do dia a dia (abaixo), escolhidos à mão por serem comuns
 *    para o público geral.
 * 2. Cada palavra do pool é VERIFICADA contra wordlist-ptbr.txt para
 *    garantir grafia e acentuação corretas (á, â, ã, à, é, ê, í, ó,
 *    ô, õ, ú, ç). Palavras ausentes na lista são descartadas com aviso.
 * 3. A verificação de solução única usa o dicionário COMPLETO
 *    (todas as formas de 2 a 6 letras da lista), para garantir que
 *    nenhum outro conjunto de 5 palavras reais resolve o tabuleiro.
 *
 * Execução:  node generate-puzzles.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------------------
// Parâmetros do tabuleiro
// ----------------------------------------------------------------------------
const SIZE = 5;                       // grade 5x5
const WORD_LENGTHS = [2, 3, 4, 5, 6]; // soma = 20 = células livres; 5 paredes
const TOTAL_CELLS = SIZE * SIZE;      // 25
const OPEN_CELLS = WORD_LENGTHS.reduce((a, b) => a + b, 0); // 20
const WALL_CELLS = TOTAL_CELLS - OPEN_CELLS;                // 5
const PUZZLE_COUNT = 60;
const MAX_ATTEMPTS_PER_PUZZLE = 6000;

// ----------------------------------------------------------------------------
// Pool curado de palavras comuns do português brasileiro, por tamanho.
// (Grafia conferida contra wordlist-ptbr.txt em tempo de execução.)
// ----------------------------------------------------------------------------
const RAW_POOL = {
  2: ['ar', 'pé', 'fé', 'vó', 'vô', 'ré', 'ás', 'lã', 'dó', 'nó', 'pá', 'fã',
      'rã', 'mó', 'só', 'má', 'chá', 'lá', 'cá', 'já', 'vi', 'li', 'ri', 'dá',
      'vá', 'ir', 'há', 'boa', 'céu'],
  3: ['céu', 'mar', 'sol', 'lua', 'pão', 'mãe', 'pai', 'rio', 'luz', 'cão',
      'boi', 'rei', 'ovo', 'mão', 'dia', 'mel', 'sal', 'cor', 'dor', 'paz',
      'voz', 'sul', 'gás', 'uva', 'rua', 'pau', 'fim', 'som', 'tom', 'mês',
      'giz', 'noz', 'chá', 'teu', 'meu', 'seu', 'réu', 'rir', 'ver', 'ler',
      'pôr', 'nós', 'flô'],
  4: ['casa', 'mesa', 'gato', 'rato', 'bola', 'vela', 'sapo', 'lobo', 'urso',
      'pato', 'dado', 'fada', 'rosa', 'sino', 'faca', 'sopa', 'mala', 'sala',
      'tela', 'taco', 'saco', 'selo', 'gelo', 'dedo', 'rede', 'vida', 'fogo',
      'jogo', 'lago', 'nave', 'café', 'luva', 'peru', 'remo', 'ramo', 'cama',
      'capa', 'copa', 'mapa', 'pipa', 'tapa', 'vaca', 'foca', 'toca', 'anel',
      'azul', 'aula', 'amor', 'bico', 'boca', 'foco', 'laço', 'moça', 'frio',
      'chão', 'unha', 'ilha', 'isca', 'flor', 'leão', 'pele', 'nuvem', 'peixe',
      'doce', 'noiva', 'trem', 'lupa', 'gota', 'mato', 'moto', 'nota', 'rolo'],
  5: ['carro', 'livro', 'praia', 'campo', 'verde', 'preto', 'tigre', 'zebra',
      'cobra', 'pombo', 'ganso', 'leite', 'farol', 'navio', 'barco', 'pente',
      'dente', 'fonte', 'ponte', 'monte', 'festa', 'gosto', 'calor', 'valor',
      'suave', 'terra', 'pedra', 'praça', 'graça', 'plano', 'chuva', 'vento',
      'tempo', 'manhã', 'tarde', 'noite', 'claro', 'largo', 'longo', 'fruta',
      'limão', 'mamão', 'melão', 'globo', 'pluma', 'porta', 'livre', 'papel',
      'nuvem', 'árvore', 'rádio', 'sonho', 'lenço', 'jarra', 'balde', 'vidro',
      'metal', 'fumaça', 'praia'],
  6: ['cavalo', 'coelho', 'macaco', 'girafa', 'jacaré', 'tucano', 'cidade',
      'aldeia', 'escola', 'quadro', 'caneta', 'janela', 'parede', 'banana',
      'tomate', 'alface', 'queijo', 'camisa', 'sapato', 'cabelo', 'outono',
      'semana', 'minuto', 'tapete', 'toalha', 'panela', 'colher', 'guarda',
      'animal', 'pessoa', 'amanhã', 'granja', 'cebola', 'girino', 'tijolo',
      'parque', 'bairro', 'garoto', 'garota', 'padeiro', 'fogão', 'lagoa',
      'flauta', 'violão', 'sorriso', 'martelo'],
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
function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

// ----------------------------------------------------------------------------
// Carregar dicionário
// ----------------------------------------------------------------------------
const LETTER_RE = /^[a-záâãàéêíóôõúç]+$/;

function loadDictionary() {
  const file = path.join(__dirname, 'wordlist-ptbr.txt');
  if (!fs.existsSync(file)) {
    console.error('ERRO: wordlist-ptbr.txt não encontrado.');
    console.error('Baixe de: https://raw.githubusercontent.com/pythonprobr/palavras/master/palavras.txt');
    console.error('e salve como wordlist-ptbr.txt nesta pasta.');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8');
  const words = new Set();     // formas de 2..6 letras
  const prefixes = new Set();  // todos os prefixos dessas formas
  for (let line of text.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w.length < 2 || w.length > WORD_LENGTHS[WORD_LENGTHS.length - 1]) continue;
    if (!LETTER_RE.test(w)) continue;
    words.add(w);
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return { words, prefixes };
}

// ----------------------------------------------------------------------------
// Utilidades de grade
// ----------------------------------------------------------------------------
const idx = (r, c) => r * SIZE + c;
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // cima, baixo, esq, dir (sem diagonais)

function neighbors(cell) {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const out = [];
  for (const [dr, dc] of DIRS) {
    if (inBounds(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
  }
  return out;
}

// componentes conexas de um conjunto de células
function connectedComponents(freeSet) {
  const seen = new Set();
  const comps = [];
  for (const start of freeSet) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp = [];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const nb of neighbors(cur)) {
        if (freeSet.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// existe subconjunto de `lengths` que soma exatamente `target`?
function subsetSum(lengths, target) {
  if (target === 0) return true;
  if (target < 0 || lengths.length === 0) return false;
  const [first, ...rest] = lengths;
  return subsetSum(rest, target - first) || subsetSum(rest, target);
}
// toda componente é preenchível por algum subconjunto das lengths disponíveis?
function componentsFillable(freeSet, availLengths) {
  for (const comp of connectedComponents(freeSet)) {
    if (!subsetSum(availLengths, comp.length)) return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// Enumeração de caminhos que cobrem a PRIMEIRA célula livre (ordem de leitura)
//
// A primeira célula livre C pertence a exatamente um caminho. Ou:
//   (A) C é uma ponta do caminho, ou
//   (B) C é interior; nesse caso seus dois vizinhos no caminho só podem ser
//       as células à direita e abaixo (as únicas maiores que C na ordem de
//       leitura), formando um "L". Enumeramos os dois braços.
// ----------------------------------------------------------------------------
function pathsCoveringFirst(freeSet, C, L, letterAt, dict, cb) {
  // (A) C como ponta
  (function dfs(pathCells, str) {
    if (!dict.prefixes.has(str)) return;
    if (pathCells.length === L) {
      if (dict.words.has(str)) cb(pathCells.slice());
      return;
    }
    const last = pathCells[pathCells.length - 1];
    for (const nb of neighbors(last)) {
      if (!freeSet.has(nb) || pathCells.includes(nb)) continue;
      pathCells.push(nb);
      dfs(pathCells, str + letterAt(nb));
      pathCells.pop();
    }
  })([C], letterAt(C));

  // (B) C interior num "L" com direita e abaixo
  const r = Math.floor(C / SIZE);
  const c = C % SIZE;
  const R = inBounds(r, c + 1) ? idx(r, c + 1) : -1;
  const D = inBounds(r + 1, c) ? idx(r + 1, c) : -1;
  if (R < 0 || D < 0 || !freeSet.has(R) || !freeSet.has(D)) return;

  // braço 1 a partir de R (comprimento a >= 1), braço 2 a partir de D (b >= 1),
  // a + b = L - 1. Caminho final = reverso(braço1) + [C] + braço2.
  const arm = (startCell, len, blocked) => {
    const results = [];
    (function dfs(cells) {
      if (cells.length === len) { results.push(cells.slice()); return; }
      const last = cells[cells.length - 1];
      for (const nb of neighbors(last)) {
        if (nb === C || !freeSet.has(nb) || cells.includes(nb) || blocked.has(nb)) continue;
        cells.push(nb);
        dfs(cells);
        cells.pop();
      }
    })([startCell]);
    return results;
  };

  for (let a = 1; a <= L - 2; a++) {
    const b = L - 1 - a;
    const arms1 = arm(R, a, new Set());
    for (const a1 of arms1) {
      const blocked = new Set(a1);
      const arms2 = arm(D, b, blocked);
      for (const a2 of arms2) {
        const full = a1.slice().reverse().concat([C], a2);
        let str = '';
        for (const cell of full) str += letterAt(cell);
        if (dict.words.has(str)) cb(full);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Conta decomposições do tabuleiro em 5 caminhos ortogonais auto-evitantes
// cujos comprimentos são uma permutação de WORD_LENGTHS e cujas strings são
// palavras do dicionário. Para no momento em que encontra `stopAt`.
// ----------------------------------------------------------------------------
function countSolutions(letterGrid, wallSet, dict, stopAt) {
  const free = new Set();
  for (let i = 0; i < TOTAL_CELLS; i++) if (!wallSet.has(i)) free.add(i);
  const letterAt = (cell) => letterGrid[cell];

  let count = 0;
  const avail = WORD_LENGTHS.slice();

  (function solve(freeSet, availLengths) {
    if (count >= stopAt) return;
    if (freeSet.size === 0) { count++; return; }
    if (!componentsFillable(freeSet, availLengths)) return;

    // primeira célula livre em ordem de leitura
    let first = -1;
    for (let i = 0; i < TOTAL_CELLS; i++) if (freeSet.has(i)) { first = i; break; }

    const triedLengths = new Set();
    for (const L of availLengths) {
      if (triedLengths.has(L)) continue;
      triedLengths.add(L);
      pathsCoveringFirst(freeSet, first, L, letterAt, dict, (pathCells) => {
        if (count >= stopAt) return;
        const nextFree = new Set(freeSet);
        for (const cell of pathCells) nextFree.delete(cell);
        const nextAvail = availLengths.slice();
        nextAvail.splice(nextAvail.indexOf(L), 1);
        solve(nextFree, nextAvail);
      });
      if (count >= stopAt) return;
    }
  })(free, avail);

  return count;
}

// ----------------------------------------------------------------------------
// Gera uma "solução pretendida": paredes + partição das 20 células livres em
// 5 caminhos com os comprimentos WORD_LENGTHS. Retorna { walls, paths } ou null.
// ----------------------------------------------------------------------------
function buildIntendedLayout(rnd) {
  // 1. escolher 5 paredes com região livre conexa
  let wallSet = null;
  for (let tries = 0; tries < 400; tries++) {
    const cells = shuffle([...Array(TOTAL_CELLS).keys()], rnd);
    const cand = new Set(cells.slice(0, WALL_CELLS));
    const free = new Set();
    for (let i = 0; i < TOTAL_CELLS; i++) if (!cand.has(i)) free.add(i);
    const comps = connectedComponents(free);
    if (comps.length !== 1) continue;           // região livre inteira conexa
    // evitar cantos livres "presos" demais deixa o tabuleiro mais limpo
    wallSet = cand;
    break;
  }
  if (!wallSet) return null;

  const free = new Set();
  for (let i = 0; i < TOTAL_CELLS; i++) if (!wallSet.has(i)) free.add(i);

  // 2. particionar em caminhos, comprimentos em ordem decrescente, com aleatoriedade
  const lengths = WORD_LENGTHS.slice().sort((a, b) => b - a);
  const paths = [];

  const ok = (function place(freeSet, li) {
    if (li === lengths.length) return freeSet.size === 0;
    if (!componentsFillable(freeSet, lengths.slice(li))) return false;

    // âncora: primeira célula livre em ordem de leitura
    let first = -1;
    for (let i = 0; i < TOTAL_CELLS; i++) if (freeSet.has(i)) { first = i; break; }
    const L = lengths[li];

    // enumerar caminhos simples de comprimento L cobrindo `first`, em ordem aleatória
    const candidates = [];
    const collect = (pathCells) => candidates.push(pathCells.slice());

    // (A) first como ponta
    (function dfs(cells) {
      if (cells.length === L) { collect(cells); return; }
      const last = cells[cells.length - 1];
      const nbs = shuffle(neighbors(last), rnd);
      for (const nb of nbs) {
        if (!freeSet.has(nb) || cells.includes(nb)) continue;
        cells.push(nb);
        dfs(cells);
        cells.pop();
      }
    })([first]);

    // (B) first interior num "L" (direita + abaixo)
    const r = Math.floor(first / SIZE), c = first % SIZE;
    const R = inBounds(r, c + 1) ? idx(r, c + 1) : -1;
    const D = inBounds(r + 1, c) ? idx(r + 1, c) : -1;
    if (R >= 0 && D >= 0 && freeSet.has(R) && freeSet.has(D)) {
      const arm = (startCell, len, blocked) => {
        const res = [];
        (function dfs(cells) {
          if (cells.length === len) { res.push(cells.slice()); return; }
          const last = cells[cells.length - 1];
          for (const nb of neighbors(last)) {
            if (nb === first || !freeSet.has(nb) || cells.includes(nb) || blocked.has(nb)) continue;
            cells.push(nb); dfs(cells); cells.pop();
          }
        })([startCell]);
        return res;
      };
      for (let a = 1; a <= L - 2; a++) {
        const b = L - 1 - a;
        for (const a1 of arm(R, a, new Set())) {
          for (const a2 of arm(D, b, new Set(a1))) {
            candidates.push(a1.slice().reverse().concat([first], a2));
          }
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

  // paths estão na ordem de `lengths` (decrescente). Reordena para WORD_LENGTHS.
  const byLen = new Map();
  for (const p of paths) byLen.set(p.length, p);
  const orderedPaths = WORD_LENGTHS.map((L) => byLen.get(L));
  return { wallSet, paths: orderedPaths };
}

// ----------------------------------------------------------------------------
// Monta um quebra-cabeça completo e verifica unicidade
// ----------------------------------------------------------------------------
function makePuzzle(number, dict, pool, usage) {
  const rnd = mulberry32(0x9e3779b9 ^ (number * 2654435761));

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PUZZLE; attempt++) {
    const layout = buildIntendedLayout(rnd);
    if (!layout) continue;
    const { wallSet, paths } = layout;

    // escolher palavras: uma por comprimento, distintas, preferindo as menos usadas
    const chosen = [];
    let feasible = true;
    for (let k = 0; k < WORD_LENGTHS.length; k++) {
      const L = WORD_LENGTHS[k];
      const options = pool[L].filter((w) => !chosen.includes(w));
      if (options.length === 0) { feasible = false; break; }
      // ordena por (uso crescente, aleatório) e pega entre os 6 menos usados
      const ranked = shuffle(options, rnd).sort(
        (a, b) => (usage.get(a) || 0) - (usage.get(b) || 0)
      );
      const bucket = ranked.slice(0, Math.min(6, ranked.length));
      chosen.push(pick(bucket, rnd));
    }
    if (!feasible) continue;

    // preencher a grade de letras (minúsculas com acento) a partir dos caminhos
    const letterGrid = new Array(TOTAL_CELLS).fill(null);
    for (let k = 0; k < WORD_LENGTHS.length; k++) {
      const word = chosen[k];
      const p = paths[k];
      for (let i = 0; i < p.length; i++) letterGrid[p[i]] = word[i];
    }
    // sanidade: todas as células livres preenchidas
    let filledOk = true;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!wallSet.has(i) && letterGrid[i] == null) { filledOk = false; break; }
    }
    if (!filledOk) continue;

    // verificação de unicidade contra o dicionário COMPLETO
    const solutions = countSolutions(letterGrid, wallSet, dict, 2);
    if (solutions !== 1) continue;

    // sucesso: registrar uso e devolver
    for (const w of chosen) usage.set(w, (usage.get(w) || 0) + 1);

    const walls = [...wallSet].map((i) => [Math.floor(i / SIZE), i % SIZE])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        row.push(wallSet.has(idx(r, c)) ? null : letterGrid[idx(r, c)].toUpperCase());
      }
      grid.push(row);
    }
    const words = WORD_LENGTHS.map((L, k) => ({
      word: chosen[k],
      length: L,
      path: paths[k].map((cell) => [Math.floor(cell / SIZE), cell % SIZE]),
    }));

    return {
      id: number,
      size: SIZE,
      grid,
      walls,
      words,
      attempts: attempt + 1,
    };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
function main() {
  console.log('Carregando dicionário (wordlist-ptbr.txt)...');
  const dict = loadDictionary();
  console.log(`  ${dict.words.size} formas de 2 a 6 letras carregadas.`);

  // validar o pool curado contra o dicionário
  const pool = {};
  for (const L of WORD_LENGTHS) {
    const kept = [];
    const dropped = [];
    for (const w of RAW_POOL[L]) {
      if (w.length !== L) { dropped.push(w + ' (tamanho)'); continue; }
      if (dict.words.has(w)) kept.push(w);
      else dropped.push(w);
    }
    // remover duplicatas mantendo ordem
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
    if (!p) {
      console.error(`ERRO: não foi possível gerar o quebra-cabeça ${n}.`);
      process.exit(1);
    }
    puzzles.push(p);
    process.stdout.write(
      `  #${String(n).padStart(2, '0')}  ` +
      p.words.map((w) => w.word).join(' · ') +
      `   (tentativas: ${p.attempts})\n`
    );
  }

  const out = {
    generator: 'generate-puzzles.js',
    source: 'https://github.com/pythonprobr/palavras (palavras.txt, dic. VERO pt_BR, licença livre)',
    generatedAt: new Date().toISOString(),
    size: SIZE,
    wordLengths: WORD_LENGTHS,
    count: puzzles.length,
    puzzles: puzzles.map(({ attempts, ...rest }) => rest),
  };

  const jsonPath = path.join(__dirname, 'puzzles.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // cópia como JS para funcionar ao abrir index.html via file:// (sem servidor)
  const jsPath = path.join(__dirname, 'puzzles.js');
  fs.writeFileSync(
    jsPath,
    '/* Gerado por generate-puzzles.js - não editar à mão. */\n' +
    'window.PALAVRILHA_PUZZLES = ' + JSON.stringify(out) + ';\n',
    'utf8'
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nOK: ${puzzles.length} quebra-cabeças em ${dt}s`);
  console.log(`  -> ${jsonPath}`);
  console.log(`  -> ${jsPath}`);
}

main();
