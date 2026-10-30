// Strona dla klienta: wgrywanie dokumentów z prośby (link z e-maila). Bez logowania – dostęp tylko z tokenem w adresie (#…).
(function () {
  'use strict';
  var box = document.getElementById('box');
  var token = (location.hash || '').replace(/^#/, '').trim();
  try { if (token) sessionStorage.setItem('rkdp_upload', token); else token = sessionStorage.getItem('rkdp_upload') || ''; } catch (e) { /* */ }
  var api = (window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl || '') + '/functions/v1/docs?forceFunctionRegion=eu-west-1'; // funkcja uruchamiana w UE (Irlandia), w regionie bazy
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmtSize = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB'; };
  var sent = 0;

  function error(msg) { box.innerHTML = '<p class="eyebrow">Wgrywanie dokumentów</p><h1>Nie można otworzyć linku</h1><p class="err">' + esc(msg) + '</p><p class="muted">Skontaktuj się z biurem RKDP – przygotujemy nowy link.</p>'; }

  if (!/^[0-9a-f]{48}$/.test(token)) { error('Link jest nieprawidłowy albo niepełny. Skopiuj cały adres z wiadomości e-mail.'); return; }
  // token nie zostaje w historii przeglądarki (odświeżenie strony działa dzięki pamięci karty)
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ }

  fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'info', token: token }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.error) error(d.error); else draw(d); })
    .catch(function () { error('Brak połączenia. Sprawdź internet i odśwież stronę.'); });

  function draw(d) {
    box.innerHTML = '<p class="eyebrow">Dokumenty do rozliczenia · ' + esc(d.periodLabel) + '</p>' +
      '<h1>' + esc(d.client) + '</h1>' +
      (d.items && d.items.length ? '<p>Prosimy o przesłanie:</p><ul>' + d.items.map(function (i) { return '<li>' + esc(i.label) + '</li>'; }).join('') + '</ul>' : '<p>Prosimy o przesłanie brakujących dokumentów.</p>') +
      (d.message ? '<div class="msg">' + esc(d.message) + '</div>' : '') +
      '<div class="drop" id="drop" tabindex="0" role="button" aria-label="Wybierz pliki"><b>Przeciągnij pliki tutaj</b><span class="muted">PDF, zdjęcia, XML, Excel · do 20 MB na plik</span>' +
      '<div class="btns"><button type="button" id="pick">Wybierz pliki</button><button type="button" class="btn alt" id="cam">Zrób zdjęcie</button></div></div>' +
      '<input type="file" id="f1" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.xml,.csv,.txt,.zip,.xls,.xlsx,.doc,.docx,image/*,application/pdf" class="hidden">' +
      '<input type="file" id="f2" accept="image/*" capture="environment" class="hidden">' +
      '<ul class="files" id="list"></ul><p class="muted" id="info">' + (d.files_count ? 'Wcześniej przesłano plików: ' + d.files_count + '. ' : '') + 'Możesz wgrywać pliki kilka razy – link jest ważny do ' + esc(new Date(d.expires_at).toLocaleDateString('pl-PL')) + '.</p>';
    var drop = document.getElementById('drop'), f1 = document.getElementById('f1'), f2 = document.getElementById('f2');
    document.getElementById('pick').onclick = function (e) { e.stopPropagation(); f1.click(); };
    document.getElementById('cam').onclick = function (e) { e.stopPropagation(); f2.click(); };
    drop.onclick = function () { f1.click(); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f1.click(); } };
    f1.onchange = function () { upload([].slice.call(f1.files)); f1.value = ''; };
    f2.onchange = function () { upload([].slice.call(f2.files)); f2.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { upload([].slice.call(e.dataTransfer.files || [])); });
  }

  // pliki wysyłane po kolei – postęp przy każdym
  function upload(files) {
    var list = document.getElementById('list');
    var queue = files.map(function (f) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + esc(f.name) + '</span><i>' + fmtSize(f.size) + ' · czeka…</i>';
      list.appendChild(li);
      return { f: f, li: li };
    });
    var next = function () {
      var it = queue.shift();
      if (!it) { finished(); return; }
      if (it.f.size > 20 * 1048576) { mark(it.li, 'bad', 'za duży (ponad 20 MB)'); next(); return; }
      mark(it.li, '', 'wysyłanie…');
      var fd = new FormData(); fd.append('token', token); fd.append('file', it.f, it.f.name);
      fetch(api, { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) mark(it.li, 'bad', d.error);
        else if (d.saved && d.saved.length) { sent++; mark(it.li, 'ok', '✓ przesłano'); }
        else mark(it.li, 'bad', (d.rejected && d.rejected[0]) || 'nie przyjęto');
      }).catch(function () { mark(it.li, 'bad', 'błąd połączenia – spróbuj ponownie'); }).then(next);
    };
    next();
  }
  function mark(li, cls, txt) { li.className = cls; li.querySelector('i').textContent = txt; }
  function finished() {
    var info = document.getElementById('info');
    if (sent && info) info.innerHTML = '<span style="color:#3E6B47;font-weight:600">Dziękujemy! Przesłano plików: ' + sent + '.</span> Biuro dostało powiadomienie. Możesz dodać kolejne pliki.';
  }
})();
