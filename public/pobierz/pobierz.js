// Plik wysłany przez kancelarię linkiem zamiast załącznika – do pobrania przez 30 dni od wysłania.
(function () {
  'use strict';
  var box = document.getElementById('box');
  var token = (new URLSearchParams(location.search).get('t') || '').trim();
  var api = (window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl || '') + '/functions/v1/podpis?forceFunctionRegion=eu-west-1';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var day = function (d) { return new Date(d).toLocaleDateString('pl-PL'); };
  var contact = '<p>W razie pytań: <a href="tel:+48883643565">883 643 565</a> · <a href="mailto:kancelaria@rkdp.pl">kancelaria@rkdp.pl</a>.</p>';
  var call = function (count) {
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'file_link', token: token, count: !!count }) }).then(function (r) { return r.json(); });
  };
  if (!/^[0-9a-f]{48}$/.test(token)) { box.innerHTML = '<h1>Nie można otworzyć linku</h1><p class="err">Link jest nieprawidłowy albo niepełny. Skopiuj cały adres z wiadomości e-mail.</p>' + contact; return; }
  try { history.replaceState(null, '', location.pathname + '?t=' + token); } catch (e) { /* */ }
  call(false).then(function (d) {
    if (d.error === 'expired') {
      box.innerHTML = '<h1>Link wygasł</h1><p class="meta">' + esc(d.title || 'Dokument') + '</p><div class="box"><p>Plik <b>' + esc(d.name) + '</b> można było pobrać do ' + day(d.expires_at) + '. Dla bezpieczeństwa Państwa danych linki do dokumentów działają tylko przez 30 dni.</p></div><p>Jeśli potrzebują Państwo dokumentu ponownie, prosimy o kontakt – prześlemy nowy link.</p>' + contact;
      return;
    }
    if (d.error) { box.innerHTML = '<h1>Nie można otworzyć linku</h1><p class="err">' + esc(d.error) + '</p>' + contact; return; }
    document.title = (d.title || 'Dokument') + ' – pobierz';
    box.innerHTML = '<h1>' + esc(d.title || 'Dokument do pobrania') + '</h1><p class="meta">Link ważny do ' + day(d.expires_at) + '</p>'
      + '<div class="box"><p style="margin:0 0 14px"><b>' + esc(d.name) + '</b></p><button type="button" class="btn-p" id="dl">Pobierz PDF</button><p class="err" id="err" hidden></p></div>'
      + '<p class="small">Dla bezpieczeństwa Państwa danych plik nie był dołączony do e-maila i można go pobrać tylko przez 30 dni od wysłania. Prosimy zapisać go na swoim komputerze.</p>'
      + '<p>Jak złożyć dokument – instrukcja krok po kroku jest pod drugim przyciskiem w naszym e-mailu.</p>' + contact;
    document.getElementById('dl').addEventListener('click', function () {
      var b = this, err = document.getElementById('err'); b.disabled = true; b.textContent = 'Przygotowuję plik…'; err.hidden = true;
      call(true).then(function (x) {
        b.disabled = false; b.textContent = 'Pobierz PDF';
        if (x.error) { err.textContent = x.error === 'expired' ? 'Link wygasł.' : x.error; err.hidden = false; return; }
        location.href = x.url;
      }).catch(function () { b.disabled = false; b.textContent = 'Pobierz PDF'; err.textContent = 'Brak połączenia – spróbuj ponownie.'; err.hidden = false; });
    });
  }).catch(function () { box.innerHTML = '<h1>Brak połączenia</h1><p>Sprawdź internet i odśwież stronę.</p>'; });
})();
