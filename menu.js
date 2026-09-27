/* Palavrilha — menu hambúrguer + modal "Como jogar" (compartilhado por
 * index.html e placar.html). Não depende do jogo nem do placar: só toca em
 * ids que, quando ausentes, fazem os "if" abaixo virarem no-op. */

(function () {
  'use strict';

  var btn = document.getElementById('menu-btn');
  var menu = document.getElementById('app-menu');

  if (btn && menu) {
    var openMenu = function () { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
    var closeMenu = function () { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && e.target !== btn && !menu.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) closeMenu();
    });
    [].slice.call(menu.querySelectorAll('a, button')).forEach(function (item) {
      item.addEventListener('click', closeMenu);
    });
  }

  var howtoBtn = document.getElementById('menu-howto');
  var howtoModal = document.getElementById('howto-modal');
  var howtoClose = document.getElementById('howto-close');

  if (howtoBtn && howtoModal) {
    var openHowto = function () {
      howtoModal.hidden = false;
      document.documentElement.classList.add('modal-open');
      if (howtoClose) howtoClose.focus();
    };
    var closeHowto = function () {
      howtoModal.hidden = true;
      document.documentElement.classList.remove('modal-open');
    };
    howtoBtn.addEventListener('click', openHowto);
    if (howtoClose) howtoClose.addEventListener('click', closeHowto);
    howtoModal.addEventListener('click', function (e) { if (e.target === howtoModal) closeHowto(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !howtoModal.hidden) closeHowto();
    });
  }
})();
