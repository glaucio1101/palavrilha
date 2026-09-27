/* Palavrilha 2.0 — placar global e de amigos (opcional, via Firebase).
 *
 * Identidade = e-mail, via login por LINK (passwordless, "magic link") do
 * Firebase Authentication. Sem senha, mas ao contrário da primeira versão
 * disto, o mesmo e-mail sempre volta ao MESMO uid, em qualquer aparelho ou
 * navegador — o Firebase garante isso. Isso elimina o problema de "a mesma
 * pessoa aparece duas vezes no placar" que dava com login anônimo + rótulo.
 *
 * Pré-requisito no Firebase Console (ver LEADERBOARD.md):
 *   Authentication -> Sign-in method -> Email/Password -> ativar e marcar
 *   "Email link (passwordless sign-in)". Authentication -> Settings ->
 *   Authorized domains -> adicionar o domínio do GitHub Pages.
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

  // #lb (a seção visível do placar) só existe em placar.html. Em index.html
  // não existe tela nenhuma daqui — o jogo só precisa que este arquivo
  // escute o resultado do dia e envie a pontuação, "sem tela". Por isso o
  // gate de "está configurado?" não depende de #lb existir; cada função de
  // desenho abaixo se protege sozinha (não faz nada se os elementos dela
  // não existirem na página atual).
  var CFG = window.PALAVRILHA_FIREBASE;
  var lb = document.getElementById('lb');
  var configured = CFG && CFG.apiKey && CFG.projectId && CFG.appId && CFG.authDomain;
  if (!configured) { if (lb) lb.hidden = true; return; }

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
    .catch(function () { if (lb) lb.hidden = true; });

  // ==========================================================================
  function start() {
    if (typeof firebase === 'undefined' || !firebase.initializeApp) { if (lb) lb.hidden = true; return; }

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
    } catch (e) { if (lb) lb.hidden = true; return; }

    if (lb) lb.hidden = false;
    if (tabsEl) tabsEl.hidden = true;
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

    // Um link de entrada na URL tem PRIORIDADE sobre qualquer sessão já
    // aberta neste navegador (ex.: uma sessão anônima antiga de antes desta
    // troca para login por link) -- senão o app nunca chega a processar o
    // link, e só mostra de novo a tela de "digite seu e-mail" (era exatamente
    // o bug relatado). `emailLinkHandled` evita processar o mesmo link duas
    // vezes quando o login concluir e este listener disparar de novo.
    var emailLinkHandled = false;

    auth.onAuthStateChanged(function (user) {
      if (!emailLinkHandled && auth.isSignInWithEmailLink(location.href)) {
        emailLinkHandled = true;
        handleIncomingEmailLink();
        return;
      }
      if (user) {
        loadPrivateProfile(user.uid).then(function (prof) {
          if (prof && prof.email) {
            me = prof;
            if (tabsEl) tabsEl.hidden = false;
            trySubmit();
            refresh();
            processInviteIfAny();
            return;
          }
          // Usuário autenticado (login por link recém-concluído) mas ainda
          // sem perfil: o e-mail já vem verificado pelo próprio Firebase.
          if (user.email) finishProfile(user.uid, user.email);
          else renderJoin();
        }).catch(function (err) { setMsg(errText(err)); renderJoin(); });
        return;
      }
      me = null;
      renderJoin();
    });

    // ---------- perfil ----------
    function loadPrivateProfile(uid) {
      return db.collection('v2_users').doc(uid).get().then(function (s) {
        return s.exists ? assign({ uid: uid }, s.data()) : null;
      });
    }

    function emailIndexRef(email) { return db.collection('v2_emailIndex').doc(email); }

    // Cria/atualiza o perfil depois que o Firebase já confirmou o e-mail
    // (login por link concluído). Nunca há conflito de identidade aqui: o
    // Firebase sempre devolve o MESMO uid para o mesmo e-mail.
    function finishProfile(uid, email) {
      var displayName = email.split('@')[0].slice(0, 40);
      db.collection('v2_users').doc(uid).get().then(function (profSnap) {
        var now = firebase.firestore.FieldValue.serverTimestamp();
        var priv = profSnap.exists
          ? assign({}, profSnap.data(), { email: email, displayName: displayName, updatedAt: now })
          : { email: email, displayName: displayName, streak: 0, provider: 'emailLink', createdAt: now, updatedAt: now };
        var pub = { displayName: displayName, streak: priv.streak || 0, updatedAt: now };
        var batch = db.batch();
        batch.set(db.collection('v2_users').doc(uid), priv, { merge: true });
        batch.set(db.collection('v2_public').doc(uid), pub, { merge: true });
        batch.set(emailIndexRef(email), { uid: uid }, { merge: true });
        return batch.commit();
      }).then(function () {
        me = assign({ uid: uid }, { email: email, displayName: displayName });
        setMsg('');
        if (tabsEl) tabsEl.hidden = false;
        trySubmit();
        refresh();
        processInviteIfAny();
      }).catch(function (err) { setMsg(errText(err)); });
    }

    // ---------- login por link (passwordless) ----------
    var LB_NS = 'palavrilha:v2:lb:';
    function lsGet(k) { try { return window.localStorage.getItem(LB_NS + k); } catch (e) { return null; } }
    function lsSet(k, v) { try { window.localStorage.setItem(LB_NS + k, v); } catch (e) {} }
    function lsDel(k) { try { window.localStorage.removeItem(LB_NS + k); } catch (e) {} }

    function sendLoginLink(rawEmail) {
      var email = normalizeEmail(rawEmail);
      if (!email) { setMsg('Digite um e-mail válido.'); return; }
      setMsg('Enviando link…');
      var continueUrl = new URL(location.origin + location.pathname);
      if (inviteEmail) continueUrl.searchParams.set('convite', inviteEmail);
      auth.sendSignInLinkToEmail(email, { url: continueUrl.toString(), handleCodeInApp: true })
        .then(function () {
          lsSet('pendingEmail', email);
          renderLinkSent(email);
        }).catch(function (err) { setMsg(errText(err)); });
    }

    function handleIncomingEmailLink() {
      var saved = lsGet('pendingEmail');
      if (saved) { completeSignIn(saved); }
      else { renderConfirmEmail(); }
    }

    function completeSignIn(email) {
      setMsg('Entrando…');
      auth.signInWithEmailLink(email, location.href).then(function () {
        lsDel('pendingEmail');
        cleanAuthParamsFromUrl();
        // onAuthStateChanged dispara de novo, agora com o usuário -> finishProfile.
      }).catch(function (err) {
        // eslint-disable-next-line no-console
        if (window.console) console.error('Palavrilha: falha ao concluir login por link', err);
        var c = err && err.code ? err.code : '';
        var deadLink = (c === 'auth/invalid-action-code' || c === 'auth/expired-action-code');
        setMsg('');
        renderConfirmEmail(errText(err), deadLink);
      });
    }

    function cleanAuthParamsFromUrl() {
      try {
        var url = new URL(location.href);
        ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl'].forEach(function (k) { url.searchParams.delete(k); });
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) {}
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
      if (!bodyEl) return;  // sem tela nesta página (ex.: index.html) -- nada para desenhar
      if (!me) { renderJoin(); return; }
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
      if (!bodyEl) return;
      tabsEl.hidden = true;
      var intro = (inviteEmail && !inviteProcessed)
        ? '<p class="lb-intro">Você foi convidado por <strong>' + esc(inviteEmail.split('@')[0]) +
          '</strong> para jogar Palavrilha! Digite seu e-mail: mandamos um link de entrada (sem senha) ' +
          'e vocês já ficam conectados no placar de amigos.</p>'
        : '<p class="lb-intro">Digite seu e-mail para aparecer no placar global e convidar amigos. ' +
          'Sem senha — a gente manda um link de entrada por e-mail. É opcional, dá para jogar sem entrar.</p>';
      bodyEl.innerHTML =
        intro +
        '<div class="lb-join">' +
          '<input id="lb-email" class="lb-input" type="email" inputmode="email" autocomplete="email" ' +
          'maxlength="254" placeholder="seu@email.com">' +
          '<button type="button" id="lb-enter" class="btn btn-primary lb-wide">Enviar link de entrada</button>' +
        '</div>';
      var emailInput = document.getElementById('lb-email');
      document.getElementById('lb-enter').addEventListener('click', function () { sendLoginLink(emailInput.value); });
      emailInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendLoginLink(emailInput.value); });
    }

    function renderLinkSent(email) {
      if (!bodyEl) return;
      tabsEl.hidden = true;
      setMsg('');
      bodyEl.innerHTML =
        '<p class="lb-intro">Enviamos um link de entrada para <strong>' + esc(email) + '</strong>. Abra sua ' +
        'caixa de entrada (confira o spam também) e toque no link — você volta aqui já conectado. Pode fechar ' +
        'esta aba com segurança.</p>' +
        '<div class="lb-join">' +
          '<button type="button" id="lb-resend" class="btn btn-ghost lb-wide">Usar outro e-mail</button>' +
        '</div>';
      document.getElementById('lb-resend').addEventListener('click', renderJoin);
    }

    function renderConfirmEmail(errorMsg, deadLink) {
      if (!bodyEl) return;
      tabsEl.hidden = true;

      var intro = errorMsg
        ? '<p class="lb-intro"><strong>Não deu para entrar com esse link:</strong> ' + esc(errorMsg) + '</p>' +
          (deadLink
            ? '<p class="lb-intro">Isso costuma acontecer quando o link já foi usado, expirou, ou o próprio ' +
              'provedor de e-mail (comum no Outlook/Microsoft e em alguns e-mails corporativos) "abre" o link ' +
              'sozinho para checar se é seguro antes de você clicar — e com isso o link morre antes da hora. ' +
              'Peça um novo abaixo.</p>'
            : '<p class="lb-intro">Confira se digitou o mesmo e-mail que usou para pedir o link, ou peça um ' +
              'novo abaixo.</p>')
        : '<p class="lb-intro">Para concluir a entrada, confirme o e-mail que você usou para pedir este link ' +
          '(precisamos disso porque ele foi aberto num navegador ou app diferente de onde foi pedido).</p>';

      bodyEl.innerHTML =
        intro +
        (deadLink ? '' :
          '<div class="lb-join">' +
            '<input id="lb-confirm-email" class="lb-input" type="email" inputmode="email" ' +
            'placeholder="seu@email.com">' +
            '<button type="button" id="lb-confirm-btn" class="btn btn-primary lb-wide">Confirmar</button>' +
          '</div>') +
        '<div class="lb-join">' +
          '<button type="button" id="lb-new-link" class="btn btn-ghost lb-wide">Pedir um novo link</button>' +
        '</div>';

      if (!deadLink) {
        var input = document.getElementById('lb-confirm-email');
        document.getElementById('lb-confirm-btn').addEventListener('click', function () {
          var email = normalizeEmail(input.value);
          if (!email) { setMsg('Digite um e-mail válido.'); return; }
          completeSignIn(email);
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('lb-confirm-btn').click(); });
      }
      document.getElementById('lb-new-link').addEventListener('click', function () {
        cleanAuthParamsFromUrl();
        renderJoin();
      });
    }

    function renderShell() {
      if (!bodyEl) return;
      bodyEl.innerHTML =
        '<div class="lb-you">' +
          '<span>Você: <strong>' + esc(me.displayName) + '</strong> ' +
            '<button type="button" id="lb-signout" class="lb-linklike">sair</button></span>' +
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
      document.getElementById('lb-signout').addEventListener('click', function () {
        auth.signOut().then(function () {
          me = null;
          lsDel('pendingEmail');
          renderJoin();
        });
      });
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
        var addBtn = (!opts.friends && !isMe)
          ? '<button type="button" class="lb-addbtn" data-uid="' + esc(r.uid) + '" ' +
            'data-name="' + esc(r.displayName) + '" aria-label="Adicionar ' + esc(r.displayName) + ' aos amigos">+</button>'
          : '';
        html += '<li class="lb-row' + (isMe ? ' is-me' : '') + '">' +
          '<span class="lb-rank">' + (played ? rank : '·') + '</span>' +
          '<span class="lb-name">' + esc(r.displayName) + (isMe ? ' <span class="lb-tagme">você</span>' : '') + '</span>' +
          '<span class="lb-meta">' +
            (played ? fmt(r.timeMs) + (r.hints ? ' <span class="lb-h">💡' + r.hints + '</span>' : '')
                    : '<span class="lb-pending">ainda não jogou</span>') +
            (r.streak ? ' <span class="lb-streak">🔥' + r.streak + '</span>' : '') +
          '</span>' +
          addBtn +
        '</li>';
      });
      html += '</ol>';
      listInto(html);

      if (!opts.friends) {
        [].slice.call(document.querySelectorAll('#lb-list .lb-addbtn')).forEach(function (btn) {
          btn.addEventListener('click', function () {
            addFriendByUid(btn.getAttribute('data-uid'), btn.getAttribute('data-name'), btn);
          });
        });
      }

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
        var displayName = email.split('@')[0].slice(0, 40);
        return writeFriend(uid, displayName).then(function () {
          setMsg('Amigo adicionado.');
          if (activeTab !== 'friends') setTab('friends'); else refresh();
        });
      }).catch(function (err) { setMsg(errText(err)); });
    }

    function addFriendByUid(uid, displayName, btnEl) {
      if (!me || !uid || uid === me.uid) return;
      writeFriend(uid, displayName).then(function () {
        setMsg('Adicionado aos seus amigos.');
        if (btnEl) { btnEl.textContent = '✓'; btnEl.disabled = true; }
      }).catch(function (err) { setMsg(errText(err)); });
    }

    function writeFriend(uid, displayName) {
      return db.collection('v2_users').doc(me.uid).collection('friends').doc(uid).set({
        displayName: displayName, since: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
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
      if (c === 'auth/invalid-action-code' || c === 'auth/expired-action-code') {
        return 'Esse link expirou ou já foi usado.';
      }
      if (c === 'auth/invalid-email') return 'E-mail inválido.';
      if (c === 'auth/quota-exceeded') return 'Muitos pedidos de link agora. Tente de novo em alguns minutos.';
      if (c === 'auth/unauthorized-continue-uri') {
        return 'Domínio não autorizado no Firebase (Authentication → Settings → Authorized domains).';
      }
      if (c === 'auth/operation-not-allowed') {
        return 'Login por link ainda não foi ativado no Firebase (Authentication → Sign-in method → Email/Password → Email link).';
      }
      return (err && err.message) ? err.message : 'Erro ao falar com o placar.';
    }
  }
})();
