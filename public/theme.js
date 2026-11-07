// Motyw (jasny / ciemny) ustawiany przed narysowaniem strony – bez mignięcia jasnego tła.
(function () {
  var t = null;
  try { t = localStorage.getItem('rkdp_theme'); } catch (e) { /* tryb prywatny */ }
  if (t !== 'dark' && t !== 'light') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#131314' : '#EAF0F1');
  try { if (localStorage.getItem('rkdp_density') === 'compact') document.documentElement.setAttribute('data-density', 'compact'); } catch (e) { /* */ }
})();
