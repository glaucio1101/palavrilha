/* Palavrilha — lógica do jogo (HTML/CSS/JS puro, sem dependências).
   Feito para rodar abrindo index.html no navegador e para ser embutido
   num WKWebView de app iOS. */

(function () {
  'use strict';

  var SIZE = 5;
  var WORD_COUNT = 5;
  var NS = 'palavrilha:v1:';
  var K_STREAK = NS + 'streak';
  var K_LASTDATE = NS + 'lastDate';

  // ---------- armazenamento tolerante a falhas ----------
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  // ---------- datas ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function ymd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((ymd(b) - ymd(a)) / 86400000); }

  // ---------- estado ----------
  var DATA = null;
  var puzzle = null;      // objeto do quebra-cabeça de hoje
  var puzzleId = 0;       // 1..60
  var dayIndex = 0;       // dias desde a época (chave estável do desafio diário)

  // Eventos para módulos opcionais (ex.: placar). Nunca quebram o jogo.
  // Também guarda o último estado em window para quem assinar depois.
  function emitGame(name, detail) {
    try {
      window.__PALAVRILHA__ = window.__PALAVRILHA__ || {};
      if (name === 'palavrilha:ready') window.__PALAVRILHA__.day = detail;
      if (name === 'palavrilha:solved') window.__PALAVRILHA__.solved = detail;
      document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (e) {}
  }
  var state = null;       // { solved:[], hinted:[], startTs:null, completed:false, completedMs:0 }
  var pending = [];       // ids de célula do traçado em andamento
  var dragging = false;
  var tickTimer = null;

  var boardEl, wordbankEl, msgEl, timerEl, progressEl, streakEl, labelEl;
  var btnHint, btnUndo, btnReset, btnShare, winPanel, winSummary, shareFeedback, shareTextEl;

  // ---------- utilidades de grade ----------
  function rc(id) { return [Math.floor(id / SIZE), id % SIZE]; }
  function id(r, c) { return r * SIZE + c; }
  function adjacent(a, b) {
    var ra = rc(a), rb = rc(b);
    return Math.abs(ra[0] - rb[0]) + Math.abs(ra[1] - rb[1]) === 1;
  }
  function isWall(cellId) {
    var p = rc(cellId);
    for (var i = 0; i < puzzle.walls.length; i++) {
      if (puzzle.walls[i][0] === p[0] && puzzle.walls[i][1] === p[1]) return true;
    }
    return false;
  }
  function wordPathIds(w) { return w.path.map(function (p) { return id(p[0], p[1]); }); }
  function sameSequence(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function matchesWord(seq, w) {
    var ids = wordPathIds(w);
    return sameSequence(seq, ids) || sameSequence(seq, ids.slice().reverse());
  }
  function solvedCellMap() {
    // cellId -> índice da palavra (0..4)
    var map = {};
    for (var i = 0; i < state.solved.length; i++) {
      var wi = state.solved[i];
      wordPathIds(puzzle.words[wi]).forEach(function (cid) { map[cid] = wi; });
    }
    return map;
  }
  function cellIsSolved(cellId) { return solvedCellMap().hasOwnProperty(cellId); }

  // ---------- persistência de progresso ----------
  function progKey() { return NS + 'progress:' + puzzleId; }
  function saveProgress() {
    lsSet(progKey(), JSON.stringify({
      solved: state.solved,
      hinted: state.hinted,
      startTs: state.startTs,
      completed: state.completed,
      completedMs: state.completedMs
    }));
  }
  function loadProgress() {
    var raw = lsGet(progKey());
    var base = { solved: [], hinted: [], startTs: null, completed: false, completedMs: 0 };
    if (!raw) return base;
    try {
      var o = JSON.parse(raw);
      return {
        solved: Array.isArray(o.solved) ? o.solved.slice(0, WORD_COUNT) : [],
        hinted: Array.isArray(o.hinted) ? o.hinted : [],
        startTs: typeof o.startTs === 'number' ? o.startTs : null,
        completed: !!o.completed,
        completedMs: typeof o.completedMs === 'number' ? o.completedMs : 0
      };
    } catch (e) { return base; }
  }

  // ---------- sequência (streak) ----------
  function loadStreak() {
    return { count: parseInt(lsGet(K_STREAK) || '0', 10) || 0, last: lsGet(K_LASTDATE) };
  }
  function effectiveStreak() {
    var s = loadStreak();
    if (!s.last) return 0;
    var gap = daysBetween(s.last, todayStr());
    return (gap === 0 || gap === 1) ? s.count : 0;
  }
  function registerCompletionStreak() {
    var s = loadStreak();
    var t = todayStr();
    if (s.last === t) return s.count;            // já contou hoje
    var n = (s.last && daysBetween(s.last, t) === 1) ? s.count + 1 : 1;
    lsSet(K_STREAK, String(n));
    lsSet(K_LASTDATE, t);
    return n;
  }

  // ---------- tempo ----------
  function elapsedMs() {
    if (state.completed) return state.completedMs;
    if (!state.startTs) return 0;
    return Math.max(0, Date.now() - state.startTs);
  }
  function fmtTime(ms) {
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return pad2(m) + ':' + pad2(s);
  }
  function startTimerIfNeeded() {
    if (!state.startTs && !state.completed) {
      state.startTs = Date.now();
      saveProgress();
    }
    ensureTick();
  }
  function ensureTick() {
    if (tickTimer || state.completed) return;
    tickTimer = window.setInterval(function () {
      timerEl.textContent = fmtTime(elapsedMs());
      if (state.completed) { window.clearInterval(tickTimer); tickTimer = null; }
    }, 500);
  }

  // ---------- mensagens ----------
  function say(text, kind) {
    msgEl.textContent = text;
    msgEl.className = 'message' + (kind ? ' ' + kind : '');
  }

  // ---------- render ----------
  function render() {
    var map = solvedCellMap();
    var hintStarts = {};
    state.hinted.forEach(function (wi) {
      if (state.solved.indexOf(wi) === -1) {
        var s = wordPathIds(puzzle.words[wi])[0];
        hintStarts[s] = true;
      }
    });

    for (var cid = 0; cid < SIZE * SIZE; cid++) {
      var el = boardEl.children[cid];
      var cls = 'cell';
      if (isWall(cid)) {
        cls += ' wall';
      } else {
        if (map.hasOwnProperty(cid)) cls += ' solved w' + map[cid];
        if (pending.indexOf(cid) !== -1) {
          cls += ' trace';
          if (pending[0] === cid) cls += ' trace-head';
        }
        if (hintStarts[cid]) cls += ' hint';
      }
      el.className = cls;
    }

    renderWordBank();

    progressEl.textContent = state.solved.length + '/' + WORD_COUNT;
    timerEl.textContent = fmtTime(elapsedMs());
    streakEl.textContent = String(state.completed ? loadStreak().count : effectiveStreak());
    labelEl.textContent = 'Quebra-cabeça de hoje · Nº ' + puzzleId;

    btnUndo.disabled = state.completed || (pending.length === 0 && state.solved.length === 0);
    btnHint.disabled = state.completed || state.solved.length === WORD_COUNT;
    btnReset.disabled = (pending.length === 0 && state.solved.length === 0 && !state.completed && !state.startTs);
  }

  function renderWordBank() {
    var rows = wordbankEl.children;
    for (var wi = 0; wi < rows.length; wi++) {
      var row = rows[wi];
      var w = puzzle.words[wi];
      var solved = state.solved.indexOf(wi) !== -1;
      var cls = solved ? ('wb-row filled w' + wi) : 'wb-row';
      if (row.className !== cls) row.className = cls;
      var up = solved ? w.word.toUpperCase() : '';
      for (var i = 0; i < row.children.length; i++) {
        var want = solved ? up.charAt(i) : '';
        if (row.children[i].textContent !== want) row.children[i].textContent = want;
      }
    }
  }

  // ---------- interação de traçado ----------
  function cellFromEvent(e) {
    var t = document.elementFromPoint(e.clientX, e.clientY);
    while (t && t !== document.body) {
      if (t.classList && t.classList.contains('cell')) {
        var i = Array.prototype.indexOf.call(boardEl.children, t);
        return i >= 0 ? i : null;
      }
      t = t.parentNode;
    }
    return null;
  }

  function tryResolve() {
    for (var wi = 0; wi < puzzle.words.length; wi++) {
      if (state.solved.indexOf(wi) !== -1) continue;
      if (matchesWord(pending, puzzle.words[wi])) { commitWord(wi); return true; }
    }
    return false;
  }

  function afterExtend() {
    if (tryResolve()) return;
    if (pending.length >= 6) {
      say('Esse traçado não forma uma palavra. Volte uma célula ou toque para recomeçar.', 'error');
    } else {
      say('Continue traçando…');
    }
    render();
  }

  function pointerOnCell(cellId, viaDrag) {
    if (state.completed) return;
    if (isWall(cellId)) return;

    // sem traçado em andamento
    if (pending.length === 0) {
      if (cellIsSolved(cellId)) { if (!viaDrag) say('Essa letra já pertence a uma palavra.', 'error'); return; }
      pending = [cellId];
      startTimerIfNeeded();
      say('Continue traçando…');
      render();
      return;
    }

    var last = pending[pending.length - 1];
    var prev = pending.length >= 2 ? pending[pending.length - 2] : -1;

    if (cellId === last) {
      if (!viaDrag && pending.length === 1) { pending = []; say('Toque numa letra para começar.'); render(); }
      return;
    }
    if (cellId === prev) { pending.pop(); say('Continue traçando…'); render(); return; }

    var at = pending.indexOf(cellId);
    if (at !== -1) { pending = pending.slice(0, at + 1); render(); return; }

    if (adjacent(cellId, last) && !cellIsSolved(cellId)) {
      pending.push(cellId);
      afterExtend();
      return;
    }

    // célula distante: recomeçar o traçado ali
    if (!viaDrag && !cellIsSolved(cellId)) {
      pending = [cellId];
      say('Continue traçando…');
      render();
    }
  }

  function commitWord(wi) {
    state.solved.push(wi);
    pending = [];
    saveProgress();
    var word = puzzle.words[wi].word.toUpperCase();
    say('Boa! “' + word + '” encontrada.', 'good');
    render();
    if (state.solved.length === WORD_COUNT) win();
  }

  function win() {
    state.completed = true;
    state.completedMs = state.startTs ? Math.max(0, Date.now() - state.startTs) : 0;
    saveProgress();
    if (tickTimer) { window.clearInterval(tickTimer); tickTimer = null; }

    var streakNow = registerCompletionStreak();
    boardEl.classList.add('done');
    render();

    var hints = countHintsUsed();
    winSummary.textContent =
      'Nº ' + puzzleId + ' · tempo ' + fmtTime(state.completedMs) +
      ' · ' + hints + (hints === 1 ? ' dica' : ' dicas') +
      ' · sequência ' + streakNow;
    winPanel.hidden = false;
    shareFeedback.textContent = '';
    shareTextEl.hidden = true;
    say('Quebra-cabeça completo! 🎉', 'good');

    emitGame('palavrilha:solved', solvedDetail());
  }

  function countHintsUsed() {
    // conta apenas dicas de palavras que existiam como não resolvidas
    var uniq = {};
    state.hinted.forEach(function (wi) { uniq[wi] = true; });
    return Object.keys(uniq).length;
  }

  // ---------- botões ----------
  function onHint() {
    if (state.completed) return;
    var unsolved = [];
    for (var i = 0; i < WORD_COUNT; i++) if (state.solved.indexOf(i) === -1) unsolved.push(i);
    if (!unsolved.length) return;

    var target = -1;
    for (var j = 0; j < unsolved.length; j++) {
      if (state.hinted.indexOf(unsolved[j]) === -1) { target = unsolved[j]; break; }
    }
    if (target === -1) target = unsolved[0];

    if (state.hinted.indexOf(target) === -1) state.hinted.push(target);
    saveProgress();

    var w = puzzle.words[target];
    var start = w.path[0];
    say('Dica: uma palavra de ' + w.length + ' letras começa na célula destacada (letra ' +
        puzzle.grid[start[0]][start[1]] + ').');
    render();
  }

  function onUndo() {
    if (state.completed) return;
    if (pending.length) {
      pending = [];
      say('Traçado cancelado.');
      render();
      return;
    }
    if (state.solved.length) {
      var removed = state.solved.pop();
      state.hinted = state.hinted.filter(function (wi) { return wi !== removed; });
      saveProgress();
      say('Palavra removida.');
      render();
    }
  }

  function onReset() {
    if (!window.confirm('Reiniciar o quebra-cabeça de hoje? Você perde o progresso atual.')) return;
    lsDel(progKey());
    state = { solved: [], hinted: [], startTs: null, completed: false, completedMs: 0 };
    pending = [];
    if (tickTimer) { window.clearInterval(tickTimer); tickTimer = null; }
    boardEl.classList.remove('done');
    winPanel.hidden = true;
    say('Tabuleiro reiniciado. Toque numa letra para começar.');
    render();
  }

  // ---------- compartilhar ----------
  function buildShareText() {
    var hints = countHintsUsed();
    var streak = loadStreak().count;
    var l1 = 'Palavrilha Nº ' + puzzleId;
    var l2 = '⏱ ' + fmtTime(state.completedMs) + ' · 💡 ' + hints + ' · 🔥 ' + streak;
    return l1 + '\n' + l2;
  }

  function onShare() {
    var text = buildShareText();
    shareFeedback.textContent = '';

    if (navigator.share) {
      navigator.share({ title: 'Palavrilha', text: text }).then(function () {
        shareFeedback.textContent = 'Compartilhado!';
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copyShare(text);
      });
      return;
    }
    copyShare(text);
  }

  function copyShare(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        shareFeedback.textContent = 'Copiado para a área de transferência!';
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    shareTextEl.hidden = false;
    shareTextEl.value = text;
    shareTextEl.focus();
    shareTextEl.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    shareFeedback.textContent = ok ? 'Copiado!' : 'Selecione o texto acima e copie.';
  }

  // ---------- montagem ----------
  function buildBoard() {
    boardEl.innerHTML = '';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var el = document.createElement('div');
        el.className = 'cell';
        el.setAttribute('role', 'gridcell');
        var wall = isWall(id(r, c));
        if (wall) {
          el.setAttribute('aria-label', 'parede');
        } else {
          el.textContent = puzzle.grid[r][c];
          el.setAttribute('aria-label', puzzle.grid[r][c]);
        }
        boardEl.appendChild(el);
      }
    }
  }

  function buildWordBank() {
    wordbankEl.innerHTML = '';
    puzzle.words.forEach(function (w) {
      var row = document.createElement('div');
      row.className = 'wb-row';
      row.setAttribute('aria-label', 'palavra de ' + w.length + ' letras');
      for (var i = 0; i < w.length; i++) {
        var t = document.createElement('span');
        t.className = 'wb-tile';
        row.appendChild(t);
      }
      wordbankEl.appendChild(row);
    });
  }

  function attachBoardEvents() {
    boardEl.addEventListener('pointerdown', function (e) {
      if (state.completed) return;
      var cid = cellFromEvent(e);
      if (cid == null) return;
      e.preventDefault();
      dragging = true;
      try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
      pointerOnCell(cid, false);
    });

    boardEl.addEventListener('pointermove', function (e) {
      if (!dragging || state.completed) return;
      var cid = cellFromEvent(e);
      if (cid == null) return;
      pointerOnCell(cid, true);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { boardEl.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    boardEl.addEventListener('pointerup', endDrag);
    boardEl.addEventListener('pointercancel', endDrag);

    // impede rolagem/zoom ao traçar
    boardEl.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  }

  function pickTodayIndex() {
    var d = new Date();
    dayIndex = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
    var n = DATA.count;
    return ((dayIndex % n) + n) % n;
  }

  function solvedDetail() {
    return {
      puzzleId: puzzleId,
      dayIndex: dayIndex,
      timeMs: state.completedMs || 0,
      hints: countHintsUsed(),
      streak: loadStreak().count
    };
  }

  function loadData() {
    return fetch('puzzles.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () {
        if (window.PALAVRILHA_PUZZLES) return window.PALAVRILHA_PUZZLES;
        throw new Error('Não foi possível carregar puzzles.json nem puzzles.js.');
      });
  }

  function init() {
    boardEl = document.getElementById('board');
    wordbankEl = document.getElementById('wordbank');
    msgEl = document.getElementById('message');
    timerEl = document.getElementById('timer');
    progressEl = document.getElementById('progress');
    streakEl = document.getElementById('streak');
    labelEl = document.getElementById('puzzle-label');
    btnHint = document.getElementById('btn-hint');
    btnUndo = document.getElementById('btn-undo');
    btnReset = document.getElementById('btn-reset');
    btnShare = document.getElementById('btn-share');
    winPanel = document.getElementById('win-panel');
    winSummary = document.getElementById('win-summary');
    shareFeedback = document.getElementById('share-feedback');
    shareTextEl = document.getElementById('share-text');

    btnHint.addEventListener('click', onHint);
    btnUndo.addEventListener('click', onUndo);
    btnReset.addEventListener('click', onReset);
    btnShare.addEventListener('click', onShare);

    loadData().then(function (data) {
      DATA = data;
      var idx = pickTodayIndex();
      puzzle = DATA.puzzles[idx];
      puzzleId = puzzle.id;

      state = loadProgress();
      // sanidade: descarta índices de palavras inválidos
      state.solved = state.solved.filter(function (n) { return n >= 0 && n < WORD_COUNT; });

      buildBoard();
      buildWordBank();
      attachBoardEvents();
      emitGame('palavrilha:ready', { puzzleId: puzzleId, dayIndex: dayIndex });

      if (state.completed) {
        boardEl.classList.add('done');
        var hints = countHintsUsed();
        winSummary.textContent =
          'Nº ' + puzzleId + ' · tempo ' + fmtTime(state.completedMs) +
          ' · ' + hints + (hints === 1 ? ' dica' : ' dicas') +
          ' · sequência ' + loadStreak().count;
        winPanel.hidden = false;
        say('Você já resolveu o quebra-cabeça de hoje. Volte amanhã! 🎉', 'good');
        emitGame('palavrilha:solved', solvedDetail());
      } else {
        if (state.startTs) ensureTick();
        say('Toque numa letra e siga pelas células vizinhas para traçar uma palavra.');
      }
      render();
    }).catch(function (err) {
      say(err.message || 'Erro ao carregar o jogo.', 'error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
