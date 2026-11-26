// Strona klienta – jeden stały link (#token): dokumenty do podpisu i do pobrania, wgrywanie dokumentów, spotkania.
(function () {
  'use strict';
  var box = document.getElementById('box');
  var token = (location.hash || '').replace(/^#/, '').trim();
  try { if (token) sessionStorage.setItem('rkdp_portal', token); else token = sessionStorage.getItem('rkdp_portal') || ''; } catch (e) { /* */ }
  var api = (window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl || '') + '/functions/v1/portal?forceFunctionRegion=eu-west-1';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var day = function (d) { return new Date(d).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', year: 'numeric' }); };
  var dt = function (d) { return new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
  var call = function (action) { return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, token: token }) }).then(function (r) { return r.json(); }); };
  function error(msg) { box.innerHTML = '<h1>Nie można otworzyć strony</h1><p class="err">' + esc(msg) + '</p><p>W razie pytań: <a href="tel:+48883643565">883 643 565</a>.</p>'; }

  if (!/^[0-9a-f]{48}$/.test(token)) { error('Link jest nieprawidłowy albo niepełny. Skopiuj cały adres z wiadomości od kancelarii.'); return; }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ }

  call('info').then(function (d) { if (d.error) error(d.error); else draw(d); }).catch(function () { error('Brak połączenia. Sprawdź internet i odśwież stronę.'); });

  function list(items, row, empty) {
    return items.length ? '<ul class="kp-list">' + items.map(row).join('') + '</ul>' : '<p class="kp-empty">' + empty + '</p>';
  }
  function draw(d) {
    var c = d.contact || {};
    document.title = (d.client || 'Strona klienta') + ' – ' + (d.firm === 'm2' ? 'M2 TAX' : 'RKDP');
    document.getElementById('foot').innerHTML = esc(c.name) + '<br>tel. ' + esc(c.phone) + ' · ' + esc(c.email) + ' · ' + esc(c.www);
    var logo = d.firm === 'm2' ? '/m2tax-logo.png' : '/logo-rkdp.png';
    box.innerHTML =
      '<img class="kp-logo" src="' + logo + '" alt="' + (d.firm === 'm2' ? 'M2 TAX Doradcy Podatkowi' : 'RKDP') + '">' +
      '<h1>' + esc(d.client || 'Strona klienta') + '</h1>' +
      '<p class="meta">Wszystko, co przygotowaliśmy dla Państwa, w jednym miejscu. Zachowaj ten link – zawsze pokazuje aktualny stan.</p>' +

      '<h2>Do podpisu</h2>' +
      list(d.to_sign || [], function (x) { return '<li><div><b>' + esc(x.title) + '</b><span class="small">przesłano ' + day(x.sent) + '</span></div><a class="btn-p" href="' + esc(x.url) + '">Przeczytaj i podpisz</a></li>'; },
        'Nie ma dokumentów czekających na Państwa podpis.') +

      '<h2>Dokumenty do pobrania</h2>' +
      list(d.downloads || [], function (x) { return '<li><div><b>' + esc(x.title) + '</b><span class="small">do pobrania do ' + day(x.until) + '</span></div><a class="btn-s" href="' + esc(x.url) + '">Pobierz</a></li>'; },
        'Brak dokumentów do pobrania. Pliki są dostępne przez 30 dni od wysłania.') +
      ((d.signed || []).length ? '<p class="small" style="margin-top:14px">Podpisane wcześniej:</p>' + list(d.signed, function (x) { return '<li><div><b>' + esc(x.title) + '</b><span class="small">podpisano ' + (x.signed ? day(x.signed) : '') + (x.final ? ' · egzemplarz do pobrania' : '') + '</span></div><a class="btn-s" href="' + esc(x.url) + '">Otwórz</a></li>'; }, '') : '') +

      '<h2>Prześlij dokumenty</h2>' +
      (d.can_upload ? '<p>Faktury, wyciągi, umowy, pisma z urzędów – PDF, zdjęcia, pliki XML lub Excel.</p><div class="kp-up"><button type="button" class="btn-p" id="up">Wgraj dokumenty</button></div><p class="err" id="uperr" hidden></p>'
        : '<p>Dokumenty prosimy przesyłać na adres <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>.</p>') +

      '<h2>Spotkania</h2>' +
      list(d.meetings || [], function (x) {
        var where = x.mode === 'meet' ? (x.meet_url ? '<a href="' + esc(x.meet_url) + '">Google Meet</a>' : 'Google Meet') : x.mode === 'phone' ? 'rozmowa telefoniczna' : esc(x.place || '');
        return '<li><div><b>' + esc(x.title) + '</b><span class="small">' + dt(x.start) + (where ? ' · ' + where : '') + '</span></div><a class="btn-s" href="' + esc(x.url) + '">Zmień lub odwołaj</a></li>';
      }, 'Brak umówionych spotkań.') +
      '<div class="kp-up"><a class="btn-s" href="' + esc(d.book_url) + '">Umów spotkanie</a></div>' +

      '<h2>Kontakt</h2><p>' + esc(c.name) + '<br>tel. <a href="tel:+48' + esc(String(c.phone).replace(/\s/g, '')) + '">' + esc(c.phone) + '</a> · <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></p>';
    var up = document.getElementById('up');
    if (up) up.addEventListener('click', function () {
      var err = document.getElementById('uperr'); up.disabled = true; up.textContent = 'Otwieram…'; err.hidden = true;
      call('upload').then(function (x) {
        if (x.error || !x.url) { up.disabled = false; up.textContent = 'Wgraj dokumenty'; err.textContent = x.error || 'Spróbuj ponownie.'; err.hidden = false; return; }
        location.href = x.url;
      }).catch(function () { up.disabled = false; up.textContent = 'Wgraj dokumenty'; err.textContent = 'Brak połączenia.'; err.hidden = false; });
    });
  }
})();
