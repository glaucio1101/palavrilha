/* Palavrilha — placar global e de amigos (opcional, via Firebase).
 *
 * Sem dependência de build. Se firebase-config.js estiver vazio, este arquivo
 * não faz nada e NÃO baixa nada da rede — o jogo segue igual. Só quando há
 * configuração é que o SDK "compat" do Firebase é carregado sob demanda. */

(function () {
  'use strict';

  var CFG = window.PALAVRILHA_FIREBASE;
  var lb = document.getElementById('lb');
  if (!lb) return;

  var configured = CFG && CFG.apiKey && CFG.projectId && CFG.appId && CFG.authDomain;
  if (!configured) { lb.hidden = true; return; }   // placar desligado

  var SDK = '10.14.1';
  var BASE = 'https://www.gstatic.com/firebasejs/' + SDK + '/';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('falha ao carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  loadScript(BASE + 'firebase-app-compat.js')
    .then(function () { return loadScript(BASE + 'firebase-auth-compat.js'); })
    .then(function () { return loadScript(BASE + 'firebase-firestore-compat.js'); })
    .then(start)
    .catch(function () { lb.hidden = true; });   // offline / CDN bloqueado

  // ==========================================================================
  function start() {
    if (typeof firebase === 'undefined' || !firebase.initializeApp) { lb.hidden = true; return; }

    // ---------- elementos ----------
    var bodyEl = document.getElementById('lb-body');
    var tabsEl = document.getElementById('lb-tabs');
    var msgEl = document.getElementById('lb-msg');
    var tabButtons = [].slice.call(document.querySelectorAll('.lb-tab'));

    // ---------- estado ----------
    var db, auth;
    var me = null;            // { uid, name, code }
    var currentDay = null;    // { dayIndex, puzzleId }
    var pendingScore = null;
    var activeTab = 'global';
    var busy = false;

    var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var NAME_RE = /^[0-9A-Za-zÀ-ÿ][0-9A-Za-zÀ-ÿ ._'-]{1,15}$/;

    try {
      firebase.initializeApp({
        apiKey: CFG.apiKey, authDomain: CFG.authDomain,
        projectId: CFG.projectId, appId: CFG.appId
      });
      db = firebase.firestore();
      auth = firebase.auth();
    } catch (e) { lb.hidden = true; return; }

    lb.hidden = false;
    tabsEl.hidden = true;
    setMsg('');

    tabButtons.forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });

    document.addEventListener('palavrilha:ready', function (e) {
      currentDay = e.detail;
      if (me) refresh();
    });
    document.addEventListener('palavrilha:solved', function (e) {
      pendingScore = e.detail;
      if (!currentDay) currentDay = { dayIndex: e.detail.dayIndex, puzzleId: e.detail.puzzleId };
      trySubmit();
    });

    // estado que o jogo já tenha emitido antes deste script terminar
    var boot = window.__PALAVRILHA__ || {};
    if (boot.day) currentDay = boot.day;
    if (boot.solved) pendingScore = boot.solved;

    auth.onAuthStateChanged(function (user) {
      if (!user) { me = null; renderJoin(); return; }
      loadProfile(user.uid).then(function (prof) {
        if (!prof || !prof.name) { renderJoin(user); return; }
        me = prof;
        tabsEl.hidden = false;
        trySubmit();
        refresh();
      }).catch(function (err) { renderJoin(user); setMsg(errText(err)); });
    });

    // ---------- perfil ----------
    function loadProfile(uid) {
      return db.collection('users').doc(uid).get().then(function (s) {
        return s.exists ? assign({ uid: uid }, s.data()) : null;
      });
    }

    function genCode() {
      var c = '';
      for (var i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      return c;
    }

    function uniqueCode(tries) {
      var code = genCode();
      return db.collection('users').where('code', '==', code).limit(1).get().then(function (snap) {
        if (snap.empty) return code;
        if (tries <= 0) return code + genCode()[0];
        return uniqueCode(tries - 1);
      });
    }

    function createProfile(uid, name, provider) {
      return uniqueCode(8).then(function (code) {
        var data = {
          name: name, code: code, provider: provider || 'anonymous', streak: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        return db.collection('users').doc(uid).set(data, { merge: true }).then(function () {
          return assign({ uid: uid }, data);
        });
      });
    }

    // ---------- envio de pontuação ----------
    function trySubmit() {
      if (!me || !me.name || !currentDay || !pendingScore || busy) return;
      var s = pendingScore;
      if (s.dayIndex !== currentDay.dayIndex) return;
      busy = true;
      var ref = db.collection('scores').doc(String(currentDay.dayIndex))
        .collection('entries').doc(me.uid);
      ref.set({
        uid: me.uid, name: me.name,
        timeMs: Math.max(1000, Math.round(s.timeMs || 0)),
        hints: Math.max(0, Math.min(5, s.hints | 0)),
        streak: s.streak | 0,
        puzzleId: s.puzzleId | 0,
        solvedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(function () {
        pendingScore = null;
        db.collection('users').doc(me.uid).set(
          { streak: s.streak | 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        ).catch(function () {});
        busy = false;
        refresh();
      }).catch(function (err) { busy = false; setMsg(errText(err)); });
    }

    // ---------- abas ----------
    function setTab(tab) {
      activeTab = tab;
      tabButtons.forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
      });
      refresh();
    }

    function refresh() {
      if (!me) { renderJoin(auth.currentUser); return; }
      renderShell();
      if (activeTab === 'global') loadGlobal();
      else loadFriends();
    }

    // ---------- leituras ----------
    function loadGlobal() {
      if (!currentDay) { listInto('<p class="lb-empty">Ainda não há desafio de hoje carregado.</p>'); return; }
      var col = db.collection('scores').doc(String(currentDay.dayIndex)).collection('entries');
      col.orderBy('timeMs', 'asc').limit(100).get().then(function (snap) {
        var rows = [];
        snap.forEach(function (d) { rows.push(d.data()); });
        renderList(rows, { showRankOutside: true });
      }).catch(function (err) { listInto('<p class="lb-empty">' + errText(err) + '</p>'); });
    }

    function loadFriends() {
      db.collection('users').doc(me.uid).collection('friends').get().then(function (fs) {
        var uids = [me.uid];
        fs.forEach(function (d) { if (d.id !== me.uid) uids.push(d.id); });
        var dayRef = db.collection('scores').doc(String(currentDay ? currentDay.dayIndex : 0)).collection('entries');
        var gets = uids.map(function (uid) {
          return Promise.all([
            dayRef.doc(uid).get(),
            db.collection('users').doc(uid).get()
          ]).then(function (r) {
            var score = r[0].exists ? r[0].data() : null;
            var prof = r[1].exists ? r[1].data() : {};
            return {
              uid: uid,
              name: (score && score.name) || prof.name || '—',
              timeMs: score ? score.timeMs : null,
              hints: score ? score.hints : null,
              streak: (score && score.streak != null) ? score.streak : (prof.streak || 0),
              played: !!score
            };
          });
        });
        return Promise.all(gets);
      }).then(function (rows) {
        rows.sort(function (a, b) {
          if (a.played && b.played) return a.timeMs - b.timeMs;
          return a.played ? -1 : (b.played ? 1 : a.name.localeCompare(b.name));
        });
        renderList(rows, { friends: true });
      }).catch(function (err) { listInto('<p class="lb-empty">' + errText(err) + '</p>'); });
    }

    // ---------- render ----------
    function renderJoin(user) {
      tabsEl.hidden = true;
      var suggested = (user && user.displayName) ? esc(user.displayName) : '';
      var googleBtn = CFG.google
        ? '<button type="button" id="lb-google" class="btn btn-ghost lb-wide">Entrar com Google</button>'
        : '';
      bodyEl.innerHTML =
        '<p class="lb-intro">Escolha um apelido para aparecer no placar global e no de amigos. ' +
        'É opcional — dá para jogar sem entrar.</p>' +
        '<div class="lb-join">' +
          '<input id="lb-name" class="lb-input" type="text" inputmode="text" autocomplete="nickname" ' +
          'maxlength="16" placeholder="Seu apelido" value="' + suggested + '">' +
          '<button type="button" id="lb-enter" class="btn btn-primary lb-wide">Entrar</button>' +
          googleBtn +
        '</div>';
      var nameInput = document.getElementById('lb-name');
      document.getElementById('lb-enter').addEventListener('click', function () { doJoin(nameInput.value); });
      nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(nameInput.value); });
      if (CFG.google) {
        document.getElementById('lb-google').addEventListener('click', function () {
          var prov = new firebase.auth.GoogleAuthProvider();
          auth.signInWithPopup(prov).catch(function (err) { setMsg(errText(err)); });
        });
      }
    }

    function doJoin(rawName) {
      var name = normalizeName(rawName);
      if (!name) { setMsg('Apelido inválido: use de 2 a 16 letras ou números.'); return; }
      setMsg('Entrando…');
      var p = auth.currentUser
        ? Promise.resolve(auth.currentUser)
        : auth.signInAnonymously().then(function (c) { return c.user; });
      p.then(function (user) {
        return loadProfile(user.uid).then(function (prof) {
          if (prof) {
            return db.collection('users').doc(user.uid).set(
              { name: name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }
            ).then(function () { return assign(prof, { name: name }); });
          }
          return createProfile(user.uid, name, user.isAnonymous ? 'anonymous' : 'google');
        });
      }).then(function (prof) {
        me = prof;
        setMsg('');
        tabsEl.hidden = false;
        trySubmit();
        refresh();
      }).catch(function (err) { setMsg(errText(err)); });
    }

    function renderShell() {
      bodyEl.innerHTML =
        '<div class="lb-you">' +
          '<span>Você: <strong>' + esc(me.name) + '</strong></span>' +
          '<span class="lb-code" title="Compartilhe para amigos te adicionarem">código ' +
            '<strong>' + esc(me.code) + '</strong></span>' +
        '</div>' +
        (activeTab === 'friends'
          ? '<div class="lb-addfriend">' +
              '<input id="lb-friend" class="lb-input" type="text" maxlength="7" autocapitalize="characters" ' +
              'placeholder="Código do amigo">' +
              '<button type="button" id="lb-add" class="btn btn-ghost">Adicionar</button>' +
            '</div>'
          : '') +
        '<div id="lb-list" class="lb-list"><p class="lb-empty">Carregando…</p></div>';

      if (activeTab === 'friends') {
        var fi = document.getElementById('lb-friend');
        document.getElementById('lb-add').addEventListener('click', function () { addFriend(fi.value); });
        fi.addEventListener('keydown', function (e) { if (e.key === 'Enter') addFriend(fi.value); });
      }
    }

    function listInto(html) {
      var el = document.getElementById('lb-list');
      if (el) el.innerHTML = html;
    }

    function renderList(rows, opts) {
      opts = opts || {};
      if (!rows.length) {
        listInto('<p class="lb-empty">' +
          (opts.friends ? 'Adicione amigos pelo código para ver os tempos de hoje.'
                        : 'Ninguém terminou o desafio de hoje ainda. Seja o primeiro!') +
          '</p>');
        return;
      }
      var myUid = me ? me.uid : null;
      var html = '<ol class="lb-ol">';
      var rank = 0, myShown = false;
      rows.forEach(function (r) {
        var played = opts.friends ? r.played : true;
        if (played) rank++;
        var isMe = r.uid === myUid;
        if (isMe) myShown = true;
        html += '<li class="lb-row' + (isMe ? ' is-me' : '') + '">' +
          '<span class="lb-rank">' + (played ? rank : '·') + '</span>' +
          '<span class="lb-name">' + esc(r.name) + (isMe ? ' <span class="lb-tagme">você</span>' : '') + '</span>' +
          '<span class="lb-meta">' +
            (played ? fmt(r.timeMs) + (r.hints ? ' <span class="lb-h">💡' + r.hints + '</span>' : '')
                    : '<span class="lb-pending">ainda não jogou</span>') +
            (r.streak ? ' <span class="lb-streak">🔥' + r.streak + '</span>' : '') +
          '</span>' +
        '</li>';
      });
      html += '</ol>';
      listInto(html);

      if (opts.showRankOutside && me && !myShown && currentDay) {
        var mineRef = db.collection('scores').doc(String(currentDay.dayIndex)).collection('entries').doc(me.uid);
        mineRef.get().then(function (s) {
          if (!s.exists) return;
          var t = s.data().timeMs;
          return db.collection('scores').doc(String(currentDay.dayIndex)).collection('entries')
            .where('timeMs', '<', t).get().then(function (q) {
              var el = document.getElementById('lb-list');
              if (!el) return;
              el.insertAdjacentHTML('beforeend',
                '<p class="lb-outside">Sua posição: <strong>' + (q.size + 1) + 'º</strong> · ' + fmt(t) + '</p>');
            });
        }).catch(function () {});
      }
    }

    function addFriend(rawCode) {
      var code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 5) { setMsg('Digite o código do amigo (5 caracteres).'); return; }
      setMsg('Procurando…');
      db.collection('users').where('code', '==', code).limit(1).get().then(function (snap) {
        if (snap.empty) { setMsg('Código não encontrado.'); return; }
        var doc = snap.docs[0];
        if (doc.id === me.uid) { setMsg('Esse é o seu próprio código.'); return; }
        return db.collection('users').doc(me.uid).collection('friends').doc(doc.id).set({
          name: doc.data().name || '—',
          since: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          setMsg('Amigo adicionado.');
          if (activeTab !== 'friends') setTab('friends'); else refresh();
        });
      }).catch(function (err) { setMsg(errText(err)); });
    }

    // ---------- utilidades ----------
    function normalizeName(s) {
      s = String(s || '').replace(/\s+/g, ' ').trim();
      if (s.length < 2 || s.length > 16 || !NAME_RE.test(s)) return null;
      return s;
    }
    function fmt(ms) {
      var t = Math.floor((ms || 0) / 1000);
      var m = Math.floor(t / 60), sec = t % 60;
      return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function assign(a, b) {
      for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k];
      return a;
    }
    function setMsg(t) { if (msgEl) msgEl.textContent = t || ''; }
    function errText(err) {
      var c = err && err.code ? err.code : '';
      if (c === 'permission-denied') return 'Sem permissão (confira as regras do Firestore).';
      if (c === 'unavailable') return 'Sem conexão com o placar agora.';
      if (c === 'auth/popup-blocked' || c === 'auth/cancelled-popup-request') return 'A janela de login foi bloqueada.';
      if (c === 'auth/network-request-failed') return 'Falha de rede ao entrar.';
      return (err && err.message) ? err.message : 'Erro ao falar com o placar.';
    }
  }
})();
