// Motyw (jasny / ciemny) ustawiany przed narysowaniem strony – bez mignięcia jasnego tła.
(function () {
  var t = null;
  try { t = localStorage.getItem('rkdp_theme'); } catch (e) { /* tryb prywatny */ }
  if (t !== 'dark' && t !== 'light') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { if (localStorage.getItem('rkdp_density') === 'compact') document.documentElement.setAttribute('data-density', 'compact'); } catch (e) { /* */ }
})();
