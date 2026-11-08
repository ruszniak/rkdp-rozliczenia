// Instrukcja instalacji: rozpoznaje urządzenie i pokazuje właściwą zakładkę.
(function () {
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var start = ios ? 'iphone' : android ? 'android' : 'komputer';
  var q = new URLSearchParams(location.search).get('na'); if (q) start = q;
  var tabs = document.querySelectorAll('[data-tab]'), panels = document.querySelectorAll('[data-panel]');
  function show(k) {
    tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.tab === k); });
    panels.forEach(function (p) { p.hidden = p.dataset.panel !== k; });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.tab); }); });
  show(start);
  // iPhone w innej przeglądarce niż Safari (Chrome, Gmail, Messenger) – dodać do ekranu da się tylko z Safari
  if (ios && /CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua)) document.getElementById('z-not-safari').hidden = false;
  fetch('/pobierz/apk.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var el = document.getElementById('z-apk-ver');
    if (j && j.version) el.textContent = 'Wersja ' + j.version + ' · ' + new Date(j.built).toLocaleDateString('pl-PL');
    else { el.textContent = 'Plik jest właśnie przygotowywany – spróbuj za kilka minut albo użyj instalacji z Chrome (niżej).'; }
  }).catch(function () {});
})();
