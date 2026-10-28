// Motyw (jasny / ciemny) ustawiany przed narysowaniem strony – bez mignięcia jasnego tła.
(function () {
  var t = null;
  try { t = localStorage.getItem('rkdp_theme'); } catch (e) { /* tryb prywatny */ }
  if (t !== 'dark' && t !== 'light') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
