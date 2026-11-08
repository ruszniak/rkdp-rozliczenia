// Okienko rezerwacji na stronie (rkdp.pl, m2tax.pl …): <a href="https://…/umow/" class="rkdp-umow">Umów konsultację</a> + ten skrypt.
// Kliknięcie otwiera rezerwację w okienku na tej samej stronie (bez przechodzenia na inną); na telefonie – na cały ekran.
(function () {
  if (window.__rkdpUmow) return; window.__rkdpUmow = true;
  var me = document.currentScript && document.currentScript.src ? new URL(document.currentScript.src) : null;
  var base = me ? me.origin + '/umow/' : '/umow/';
  var css = '.rkdp-umow-back{position:fixed;inset:0;z-index:2147483000;background:rgba(17,18,20,.55);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s}' +
    '.rkdp-umow-back.on{opacity:1}.rkdp-umow-box{width:min(1000px,100%);height:min(760px,100%);background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)}' +
    '.rkdp-umow-box iframe{width:100%;height:100%;border:0;display:block}' +
    '@media (max-width:760px){.rkdp-umow-back{padding:0}.rkdp-umow-box{width:100%;height:100%;border-radius:0}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var back = null, prevOverflow = '';
  function open(href) {
    var u = new URL(href || base, location.href);
    if (u.pathname.indexOf('/umow') < 0) u = new URL(base);
    u.searchParams.set('embed', '1');
    if (!u.searchParams.get('zrodlo')) { var hn = location.hostname; u.searchParams.set('zrodlo', /m2tax\.pl$/.test(hn) ? 'm2tax' : /rkdp\.pl$/.test(hn) ? 'rkdp' : hn); }
    back = document.createElement('div'); back.className = 'rkdp-umow-back';
    back.innerHTML = '<div class="rkdp-umow-box" role="dialog" aria-label="Umów spotkanie"><iframe title="Umów spotkanie" allow="clipboard-write"></iframe></div>';
    back.querySelector('iframe').src = u.toString();
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { back.classList.add('on'); });
  }
  function close() { if (!back) return; back.remove(); back = null; document.documentElement.style.overflow = prevOverflow; }
  window.addEventListener('message', function (e) { if (e.data && e.data.type === 'rkdp-umow-close') close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.rkdp-umow, a[href*="/umow/"], [data-umow]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open(a.getAttribute('href') || a.getAttribute('data-umow'));
  });
  window.RKDPUmow = { open: open, close: close };
})();
