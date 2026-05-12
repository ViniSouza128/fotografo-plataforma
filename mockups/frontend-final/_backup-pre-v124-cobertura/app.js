/* ============================================================
   FRONTEND FINAL — interações leves para os mockups
   Tudo é declarativo: marque elementos com data-attributes.
   ============================================================ */

(function () {
  'use strict';

  /* ─────── 1. Drawer mobile ───────────────────────────
     <div class="m-burger" data-drawer-open="myDrawer">…</div>
     <div class="m-drawer" id="myDrawer">
       <button class="close-x" data-drawer-close="myDrawer">×</button>
       …
     </div>
  */
  document.addEventListener('click', function (e) {
    const opener = e.target.closest('[data-drawer-open]');
    if (opener) {
      const id = opener.getAttribute('data-drawer-open');
      const el = document.getElementById(id);
      if (el) el.classList.add('open');
      e.preventDefault();
      return;
    }
    const closer = e.target.closest('[data-drawer-close]');
    if (closer) {
      const id = closer.getAttribute('data-drawer-close');
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
      e.preventDefault();
      return;
    }
  });

  /* ─────── 2. Modais ──────────────────────────────────
     <button data-modal-open="myModal">…</button>
     <div class="modal-overlay" id="myModal">
       <div class="modal">
         <button class="modal-close" data-modal-close="myModal">×</button>
         …
       </div>
     </div>
     ESC fecha o modal mais próximo no DOM.
  */
  document.addEventListener('click', function (e) {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) {
      const id = opener.getAttribute('data-modal-open');
      const el = document.getElementById(id);
      if (el) el.classList.add('open');
      e.preventDefault();
      return;
    }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) {
      const id = closer.getAttribute('data-modal-close');
      const el = id ? document.getElementById(id) : closer.closest('.modal-overlay');
      if (el) el.classList.remove('open');
      e.preventDefault();
      return;
    }
    /* fechar clicando no overlay (fora do .modal) */
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal-overlay.open, .m-drawer.open');
    open.forEach(function (el) { el.classList.remove('open'); });
  });

  /* ─────── 3. Tabs ─────────────────────────────────────
     <div class="tabs" data-tabs>
       <a data-tab-target="paneA" class="active">A</a>
       <a data-tab-target="paneB">B</a>
     </div>
     <div data-tab-pane="paneA" class="active">…</div>
     <div data-tab-pane="paneB" hidden>…</div>
  */
  document.addEventListener('click', function (e) {
    const tab = e.target.closest('[data-tab-target]');
    if (!tab) return;
    const tabsRoot = tab.closest('[data-tabs]');
    if (!tabsRoot) return;
    const target = tab.getAttribute('data-tab-target');
    /* ativar tab */
    tabsRoot.querySelectorAll('[data-tab-target]').forEach(function (t) {
      t.classList.toggle('active', t === tab);
    });
    /* trocar paneis no escopo do mesmo .frame ou body */
    const scope = tabsRoot.closest('.frame, body') || document.body;
    scope.querySelectorAll('[data-tab-pane]').forEach(function (p) {
      const match = p.getAttribute('data-tab-pane') === target;
      p.hidden = !match;
      p.classList.toggle('active', match);
    });
    e.preventDefault();
  });

  /* ─────── 4. Cart side colapso (gallery) ─────────────
     <div class="gallery-wrap" data-cart-side>
       <button data-cart-toggle>…</button>
     </div>
  */
  document.addEventListener('click', function (e) {
    const toggle = e.target.closest('[data-cart-toggle]');
    if (!toggle) return;
    const wrap = toggle.closest('[data-cart-side]');
    if (wrap) wrap.classList.toggle('collapsed');
  });

  /* ─────── 5. Photo cart bump animation ───────────────
     <button class="cart-btn" data-cart-bump>+</button>
  */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-cart-bump]');
    if (!btn) return;
    btn.classList.remove('bump');
    /* trigger reflow */
    void btn.offsetWidth;
    btn.classList.add('bump');
    /* alterna estado de "in-cart" no tile */
    const tile = btn.closest('.photo-tile');
    if (tile) tile.classList.toggle('in-cart');
  });

  /* ─────── 6. Copiar texto (Pix code etc.) ───────────
     <button data-copy="texto-a-copiar">…</button>
  */
  document.addEventListener('click', function (e) {
    const cp = e.target.closest('[data-copy]');
    if (!cp) return;
    const text = cp.getAttribute('data-copy');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
    /* feedback visual breve */
    const orig = cp.textContent;
    cp.textContent = 'copiado ✓';
    setTimeout(function () { cp.textContent = orig; }, 1400);
  });

  /* ─────── 7. Toggle switch ───────────────────────────
     <button class="switch on" data-toggle></button>
  */
  document.addEventListener('click', function (e) {
    const sw = e.target.closest('[data-toggle]');
    if (!sw || !sw.classList.contains('switch')) return;
    sw.classList.toggle('on');
  });

  /* ─────── 8. Rating stars ────────────────────────────
     <div class="rating-stars">
       <button class="star on">★</button> ... 5 botões
     </div>
     Clique em uma estrela: ela e anteriores ficam "on", posteriores "off".
  */
  document.addEventListener('click', function (e) {
    const star = e.target.closest('.rating-stars .star');
    if (!star) return;
    const stars = Array.from(star.parentNode.querySelectorAll('.star'));
    const idx = stars.indexOf(star);
    stars.forEach(function (s, i) {
      s.classList.toggle('on', i <= idx);
      s.style.color = (i <= idx) ? 'var(--warning-500)' : 'var(--ink-600)';
    });
  });

  /* ─────── 9. Auto-imagem via data-seed ───────────────
     <div class="cover" data-seed="safra-2026" data-w="720" data-h="450"></div>
     Injeta <img src="https://picsum.photos/seed/{seed}/{w}/{h}"> dentro do
     elemento. Se já tiver <img>, ignora.
  */
  function fillSeeds() {
    document.querySelectorAll('[data-seed]').forEach(function (el) {
      if (el.querySelector('img')) return;
      const seed = el.getAttribute('data-seed');
      const w = el.getAttribute('data-w') || 600;
      const h = el.getAttribute('data-h') || 400;
      const img = document.createElement('img');
      img.src = 'https://picsum.photos/seed/' + encodeURIComponent(seed) + '/' + w + '/' + h;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      el.appendChild(img);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillSeeds);
  } else {
    fillSeeds();
  }

})();
