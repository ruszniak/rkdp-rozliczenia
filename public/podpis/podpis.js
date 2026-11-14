// Strona dla klienta: pobranie dokumentu, instrukcja podpisu (profil zaufany / kwalifikowany / odręcznie) i wgranie podpisanego pliku.
// Bez logowania – dostęp tylko z tokenem z linku w e-mailu (?t=… albo #…).
(function () {
  'use strict';
  var box = document.getElementById('box');
  var q = new URLSearchParams(location.search);
  var token = (q.get('t') || (location.hash || '').replace(/^#/, '') || '').trim();
  try { if (token) sessionStorage.setItem('rkdp_podpis', token); else token = sessionStorage.getItem('rkdp_podpis') || ''; } catch (e) { /* */ }
  var api = (window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl || '') + '/functions/v1/podpis?forceFunctionRegion=eu-west-1';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function error(msg) { box.innerHTML = '<h1>Nie można otworzyć linku</h1><p class="err">' + esc(msg) + '</p><p>Skontaktuj się z biurem RKDP: <a href="tel:+48883643565">883 643 565</a> · <a href="mailto:kancelaria@rkdp.pl">kancelaria@rkdp.pl</a>.</p>'; }
  if (!/^[0-9a-f]{48}$/.test(token)) { error('Link jest nieprawidłowy albo niepełny. Skopiuj cały adres z wiadomości e-mail.'); return; }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ }

  fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'info', token: token }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.error) return error(d.error); render(d); })
    .catch(function () { error('Brak połączenia – sprawdź internet i odśwież stronę.'); });

  function render(d) {
    box.replaceChildren(document.getElementById('tpl').content.cloneNode(true));
    document.title = 'Podpisz: ' + d.title + ' – RKDP';
    document.getElementById('ttl').textContent = 'Podpisz: ' + d.title;
    document.getElementById('who').textContent = (d.client ? d.client + ' · ' : '') + 'link ważny do ' + new Date(d.expires_at).toLocaleDateString('pl-PL');
    var dl = document.getElementById('dl');
    if (d.file && d.file.url) { dl.href = d.file.url; document.getElementById('dlname').textContent = d.file.name || ''; }
    else { dl.hidden = true; document.getElementById('dlname').textContent = 'Dokument jest w załączniku naszego e-maila.'; }
    var steps = box.querySelectorAll('.steps li');
    var step = function (n) { steps.forEach(function (li, i) { li.className = i < n ? 'ok' : i === n ? 'on' : ''; }); };
    dl.addEventListener('click', function () { step(1); });
    // wybór sposobu podpisu
    var ways = box.querySelectorAll('.ways a');
    var pick = function (w) {
      ways.forEach(function (a) { a.classList.toggle('on', a.dataset.way === w); });
      ['pz', 'kw', 'rk'].forEach(function (k) { document.getElementById(k).hidden = k !== w; });
    };
    ways.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); pick(a.dataset.way); step(1); }); });
    pick('pz');
    if (d.status === 'podpisano') { step(3); document.getElementById('up').hidden = true; document.getElementById('done').hidden = false;
      document.querySelector('#done p').textContent = 'Podpisany dokument dotarł do nas ' + new Date(d.signed_at).toLocaleDateString('pl-PL') + '. Jeśli chcesz wysłać poprawioną wersję – skontaktuj się z biurem.'; return; }
    // wgrywanie
    var input = document.getElementById('file'), drop = document.getElementById('drop'), send = document.getElementById('send'), err = document.getElementById('err');
    var file = null;
    var setFile = function (f) {
      file = f || null; err.hidden = true;
      drop.classList.toggle('has', !!file);
      drop.querySelector('b').textContent = file ? '✓ ' + file.name : 'Wybierz podpisany plik';
      send.disabled = !file; if (file) step(2);
    };
    input.addEventListener('change', function () { setFile(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
    send.addEventListener('click', function () {
      if (!file) return;
      if (file.size > 25 * 1048576) { err.textContent = 'Plik jest większy niż 25 MB.'; err.hidden = false; return; }
      send.disabled = true; send.textContent = 'Wysyłam…';
      var fd = new FormData(); fd.append('token', token); fd.append('file', file, file.name);
      fetch(api, { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.error) { err.textContent = r.error; err.hidden = false; send.disabled = false; send.textContent = 'Wyślij podpisany dokument'; return; }
        step(3); document.getElementById('up').hidden = true; document.getElementById('done').hidden = false;
        document.getElementById('done').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function () { err.textContent = 'Brak połączenia – spróbuj ponownie.'; err.hidden = false; send.disabled = false; send.textContent = 'Wyślij podpisany dokument'; });
    });
  }
})();
