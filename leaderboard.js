/* Palavrilha 2.0 — placar global e de amigos (opcional, via Firebase).
 *
 * Diferença do leaderboard.js da versão clássica (classic/leaderboard.js):
 * identidade é o seu E-MAIL (sem senha, sem verificação) em vez de um
 * apelido + código sorteado. Convidar um amigo = digitar o e-mail dele.
 *
 * Coleções próprias (v2_*), independentes das da versão clássica, mesmo que
 * as duas usem o mesmo projeto Firebase:
 *   v2_users/{uid}        privado (só o dono lê) — email, displayName, streak
 *   v2_public/{uid}        público (qualquer logado lê) — displayName, streak
 *   v2_emailIndex/{email}  só permite busca por chave exata (uid do dono)
 *   v2_scores/{dia}/entries/{uid}  público — nunca contém e-mail
 *
 * O nome mostrado nos placares é a parte antes do "@" do e-mail (não o
 * e-mail inteiro), para não expor endereços completos publicamente.
 *
 * Sem firebase-config.js preenchido, nada disso roda: o jogo segue offline. */

(function () {
  'use strict';

  var CFG = window.PALAVRILHA_FIREBASE;
  var lb = document.getElementById('lb');
  if (!lb) return;

  var configured = CFG && CFG.apiKey && CFG.projectId && CFG.appId && CFG.authDomain;
  if (!configured) { lb.hidden = true; return; }

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
    .catch(function () { lb.hidden = true; });

  // ==========================================================================
  function start() {
    if (typeof firebase === 'undefined' || !firebase.initializeApp) { lb.hidden = true; return; }

    var bodyEl = document.getElementById('lb-body');
    var tabsEl = document.getElementById('lb-tabs');
    var msgEl = document.getElementById('lb-msg');
    var tabButtons = [].slice.call(document.querySelectorAll('.lb-tab'));

    var db, auth;
    var me = null;            // { uid, email, displayName }
    var currentDay = null;    // { dayIndex, puzzleId }
    var pendingScore = null;
    var activeTab = 'global';
    var busy = false;

    var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
    var inviteEmail = readInviteParam();  // ?convite=fulano@exemplo.com na URL
    var inviteProcessed = false;

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

    var boot = window.__PALAVRILHA__ || {};
    if (boot.day) currentDay = boot.day;
    if (boot.solved) pendingScore = boot.solved;

    auth.onAuthStateChanged(function (user) {
      if (!user) { me = null; renderJoin(); return; }
      loadPrivateProfile(user.uid).then(function (prof) {
        if (!prof || !prof.email) { renderJoin(user); return; }
        me = prof;
        tabsEl.hidden = false;
        trySubmit();
        refresh();
        processInviteIfAny();
      }).catch(function (err) { renderJoin(user); setMsg(errText(err)); });
    });

    // ---------- perfil ----------
    function loadPrivateProfile(uid) {
      return db.collection('v2_users').doc(uid).get().then(function (s) {
        return s.exists ? assign({ uid: uid }, s.data()) : null;
      });
    }

    function emailIndexRef(email) { return db.collection('v2_emailIndex').doc(email); }

    function claimEmail(uid, email, force) {
      return emailIndexRef(email).get().then(function (idxSnap) {
        if (idxSnap.exists && idxSnap.data().uid !== uid && !force) {
          return { conflict: true };
        }
        var displayName = email.split('@')[0].slice(0, 40);
        return db.collection('v2_users').doc(uid).get().then(function (profSnap) {
          var now = firebase.firestore.FieldValue.serverTimestamp();
          var priv = profSnap.exists
            ? assign({}, profSnap.data(), { email: email, displayName: displayName, updatedAt: now })
            : { email: email, displayName: displayName, streak: 0, provider: 'anonymous', createdAt: now, updatedAt: now };
          var pub = { displayName: displayName, streak: priv.streak || 0, updatedAt: now };
          var batch = db.batch();
          batch.set(db.collection('v2_users').doc(uid), priv, { merge: true });
          batch.set(db.collection('v2_public').doc(uid), pub, { merge: true });
          batch.set(emailIndexRef(email), { uid: uid }, { merge: true });
          return batch.commit().then(function () { return { conflict: false, profile: assign({ uid: uid }, priv) }; });
        });
      });
    }

    // ---------- envio de pontuação ----------
    function trySubmit() {
      if (!me || !me.email || !currentDay || !pendingScore || busy) return;
      var s = pendingScore;
      if (s.dayIndex !== currentDay.dayIndex) return;
      busy = true;
      var now = firebase.firestore.FieldValue.serverTimestamp();
      var scoreRef = db.collection('v2_scores').doc(String(currentDay.dayIndex)).collection('entries').doc(me.uid);
      var streak = s.streak | 0;
      var batch = db.batch();
      batch.set(scoreRef, {
        uid: me.uid, displayName: me.displayName,
        timeMs: Math.max(1000, Math.round(s.timeMs || 0)),
        hints: Math.max(0, Math.min(5, s.hints | 0)),
        streak: streak,
        puzzleId: s.puzzleId | 0,
        wordCount: s.wordCount | 0,
        solvedAt: now
      }, { merge: true });
      batch.set(db.collection('v2_users').doc(me.uid), { streak: streak, updatedAt: now }, { merge: true });
      batch.set(db.collection('v2_public').doc(me.uid), { displayName: me.displayName, streak: streak, updatedAt: now }, { merge: true });
      batch.commit().then(function () {
        pendingScore = null;
        me.streak = streak;
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
      var col = db.collection('v2_scores').doc(String(currentDay.dayIndex)).collection('entries');
      col.orderBy('timeMs', 'asc').limit(100).get().then(function (snap) {
        var rows = [];
        snap.forEach(function (d) { rows.push(d.data()); });
        renderList(rows, { showRankOutside: true });
      }).catch(function (err) { listInto('<p class="lb-empty">' + errText(err) + '</p>'); });
    }

    function loadFriends() {
      db.collection('v2_users').doc(me.uid).collection('friends').get().then(function (fs) {
        var uids = [me.uid];
        fs.forEach(function (d) { if (d.id !== me.uid) uids.push(d.id); });
        var dayRef = db.collection('v2_scores').doc(String(currentDay ? currentDay.dayIndex : 0)).collection('entries');
        var gets = uids.map(function (uid) {
          return Promise.all([
            dayRef.doc(uid).get(),
            db.collection('v2_public').doc(uid).get()
          ]).then(function (r) {
            var score = r[0].exists ? r[0].data() : null;
            var pub = r[1].exists ? r[1].data() : {};
            return {
              uid: uid,
              displayName: (score && score.displayName) || pub.displayName || '—',
              timeMs: score ? score.timeMs : null,
              hints: score ? score.hints : null,
              streak: (score && score.streak != null) ? score.streak : (pub.streak || 0),
              played: !!score
            };
          });
        });
        return Promise.all(gets);
      }).then(function (rows) {
        rows.sort(function (a, b) {
          if (a.played && b.played) return a.timeMs - b.timeMs;
          return a.played ? -1 : (b.played ? 1 : a.displayName.localeCompare(b.displayName));
        });
        renderList(rows, { friends: true });
      }).catch(function (err) { listInto('<p class="lb-empty">' + errText(err) + '</p>'); });
    }

    // ---------- render ----------
    function renderJoin() {
      tabsEl.hidden = true;
      var intro = (inviteEmail && !inviteProcessed)
        ? '<p class="lb-intro">Você foi convidado por <strong>' + esc(inviteEmail.split('@')[0]) +
          '</strong> para jogar Palavrilha! Registre seu e-mail e vocês já ficam conectados no ' +
          'placar de amigos.</p>'
        : '<p class="lb-intro">Registre seu e-mail para aparecer no placar global e convidar amigos. ' +
          'É opcional — dá para jogar sem entrar. Não pedimos senha; é só um identificador.</p>';
      bodyEl.innerHTML =
        intro +
        '<div class="lb-join">' +
          '<input id="lb-email" class="lb-input" type="email" inputmode="email" autocomplete="email" ' +
          'maxlength="254" placeholder="seu@email.com">' +
          '<button type="button" id="lb-enter" class="btn btn-primary lb-wide">Entrar</button>' +
        '</div>';
      var emailInput = document.getElementById('lb-email');
      document.getElementById('lb-enter').addEventListener('click', function () { doJoin(emailInput.value, false); });
      emailInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(emailInput.value, false); });
    }

    function renderEmailConflict(email) {
      tabsEl.hidden = true;
      bodyEl.innerHTML =
        '<p class="lb-intro">O e-mail <strong>' + esc(email) + '</strong> já foi usado no Palavrilha em outro ' +
        'navegador ou aparelho. Como o login aqui é simples (sem senha), não dá para recuperar aquela conta a ' +
        'partir daqui.</p>' +
        '<div class="lb-join">' +
          '<button type="button" id="lb-force" class="btn btn-ghost lb-wide">Usar este e-mail mesmo assim</button>' +
          '<button type="button" id="lb-back" class="btn btn-primary lb-wide">Usar outro e-mail</button>' +
        '</div>';
      document.getElementById('lb-force').addEventListener('click', function () { doJoin(email, true); });
      document.getElementById('lb-back').addEventListener('click', function () { renderJoin(); });
    }

    function doJoin(rawEmail, force) {
      var email = normalizeEmail(rawEmail);
      if (!email) { setMsg('Digite um e-mail válido.'); return; }
      setMsg('Entrando…');
      var signIn = auth.currentUser ? Promise.resolve(auth.currentUser)
        : auth.signInAnonymously().then(function (c) { return c.user; });
      signIn.then(function (user) {
        return claimEmail(user.uid, email, force);
      }).then(function (result) {
        if (result.conflict) { setMsg(''); renderEmailConflict(email); return; }
        me = result.profile;
        setMsg('');
        tabsEl.hidden = false;
        trySubmit();
        refresh();
        processInviteIfAny();
      }).catch(function (err) { setMsg(errText(err)); });
    }

    function renderShell() {
      bodyEl.innerHTML =
        '<div class="lb-you">' +
          '<span>Você: <strong>' + esc(me.displayName) + '</strong></span>' +
          '<span class="lb-code" title="Amigos digitam este e-mail para te adicionar">convite: ' +
            '<strong>' + esc(me.email) + '</strong></span>' +
        '</div>' +
        (activeTab === 'friends'
          ? '<div class="lb-addfriend">' +
              '<input id="lb-friend" class="lb-input" type="email" inputmode="email" ' +
              'placeholder="E-mail do amigo">' +
              '<button type="button" id="lb-add" class="btn btn-ghost">Adicionar</button>' +
            '</div>' +
            '<button type="button" id="lb-invite-link" class="btn btn-ghost lb-wide">' +
              'Convidar por link (SMS, WhatsApp…)</button>'
          : '') +
        '<div id="lb-list" class="lb-list"><p class="lb-empty">Carregando…</p></div>';

      if (activeTab === 'friends') {
        var fi = document.getElementById('lb-friend');
        document.getElementById('lb-add').addEventListener('click', function () { addFriend(fi.value); });
        fi.addEventListener('keydown', function (e) { if (e.key === 'Enter') addFriend(fi.value); });
        document.getElementById('lb-invite-link').addEventListener('click', shareInviteLink);
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
          (opts.friends ? 'Convide amigos pelo e-mail para ver os tempos de hoje.'
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
          '<span class="lb-name">' + esc(r.displayName) + (isMe ? ' <span class="lb-tagme">você</span>' : '') + '</span>' +
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
        var mineRef = db.collection('v2_scores').doc(String(currentDay.dayIndex)).collection('entries').doc(me.uid);
        mineRef.get().then(function (s) {
          if (!s.exists) return;
          var t = s.data().timeMs;
          return db.collection('v2_scores').doc(String(currentDay.dayIndex)).collection('entries')
            .where('timeMs', '<', t).get().then(function (q) {
              var el = document.getElementById('lb-list');
              if (!el) return;
              el.insertAdjacentHTML('beforeend',
                '<p class="lb-outside">Sua posição: <strong>' + (q.size + 1) + 'º</strong> · ' + fmt(t) + '</p>');
            });
        }).catch(function () {});
      }
    }

    function addFriend(rawEmail) {
      var email = normalizeEmail(rawEmail);
      if (!email) { setMsg('Digite um e-mail válido.'); return; }
      if (email === me.email) { setMsg('Esse é o seu próprio e-mail.'); return; }
      setMsg('Procurando…');
      emailIndexRef(email).get().then(function (snap) {
        if (!snap.exists) { setMsg('Ninguém com esse e-mail jogou o Palavrilha ainda. Convide essa pessoa a entrar!'); return; }
        var uid = snap.data().uid;
        return db.collection('v2_users').doc(me.uid).collection('friends').doc(uid).set({
          email: email, since: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          setMsg('Amigo adicionado.');
          if (activeTab !== 'friends') setTab('friends'); else refresh();
        });
      }).catch(function (err) { setMsg(errText(err)); });
    }

    // ---------- convite por link (SMS, WhatsApp, iMessage…) ----------
    function readInviteParam() {
      try {
        var params = new URLSearchParams(location.search);
        var raw = params.get('convite');
        return raw ? normalizeEmail(raw) : null;
      } catch (e) { return null; }
    }

    function stripInviteParam() {
      try {
        var url = new URL(location.href);
        url.searchParams.delete('convite');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) {}
    }

    function processInviteIfAny() {
      if (!inviteEmail || inviteProcessed || !me) return;
      inviteProcessed = true;
      if (inviteEmail !== me.email) addFriend(inviteEmail);
      stripInviteParam();
    }

    function buildInviteLink() {
      var url = new URL(location.href);
      url.search = ''; url.hash = '';
      url.searchParams.set('convite', me.email);
      return url.toString();
    }

    function shareInviteLink() {
      var link = buildInviteLink();
      var text = 'Jogue Palavrilha comigo! 🧩 Abra este link para a gente aparecer no placar de amigos um do outro:';
      setMsg('');
      if (navigator.share) {
        navigator.share({ title: 'Palavrilha', text: text, url: link }).then(function () {
          setMsg('Convite compartilhado!');
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          copyInvite(text + '\n' + link);
        });
        return;
      }
      copyInvite(text + '\n' + link);
    }

    function copyInvite(full) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(function () {
          setMsg('Link copiado! Cole numa mensagem (SMS, WhatsApp, iMessage…).');
        }).catch(function () { fallbackCopyInvite(full); });
      } else {
        fallbackCopyInvite(full);
      }
    }

    function fallbackCopyInvite(full) {
      var ta = document.createElement('textarea');
      ta.value = full;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      setMsg(ok ? 'Link copiado! Cole numa mensagem (SMS, WhatsApp, iMessage…).' : full);
    }

    // ---------- utilidades ----------
    function normalizeEmail(s) {
      s = String(s || '').trim().toLowerCase();
      if (!EMAIL_RE.test(s)) return null;
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
      if (c === 'auth/network-request-failed') return 'Falha de rede ao entrar.';
      return (err && err.message) ? err.message : 'Erro ao falar com o placar.';
    }
  }
})();
