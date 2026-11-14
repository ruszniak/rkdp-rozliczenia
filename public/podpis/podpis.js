// Strona dla klienta: podgląd dokumentu, uwagi do treści, pobranie PDF, instrukcja podpisu (profil zaufany / kwalifikowany / odręcznie)
// i wgranie podpisanego pliku.
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
    document.title = 'Podpisz: ' + d.title + ' – rdp.app';
    document.getElementById('ttl').textContent = 'Podpisz: ' + d.title;
    document.getElementById('who').textContent = (d.client ? d.client + ' · ' : '') + 'link ważny do ' + new Date(d.expires_at).toLocaleDateString('pl-PL');
    var dl = document.getElementById('dl');
    if (d.file && d.file.url) dl.href = d.file.url;
    else { dl.hidden = true; document.getElementById('dlname').textContent = 'Plik PDF jest chwilowo niedostępny – odśwież stronę albo skontaktuj się z biurem.'; }
    // podgląd treści (izolowana ramka bez skryptów)
    if (d.html) {
      var view = document.getElementById('view'), frame = document.getElementById('frame'), full = document.getElementById('fullBtn');
      frame.srcdoc = /^<!doctype/i.test(d.html) ? d.html : '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
        + 'html{font-size:11pt}body{margin:0;background:#E9EAEE;color:#1c1d21;font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;line-height:1.4}'
        + '.paper{max-width:760px;margin:18px auto;background:#fff;padding:44px 60px 56px;box-shadow:0 2px 10px rgba(0,0,0,.08);border-radius:4px}'
        + '.lh{text-align:center;margin-bottom:18px}.lh img{width:190px;height:auto}p{margin:0}.tab{display:inline-block;width:36pt}'
        + '@media(max-width:640px){html{font-size:10pt}.paper{margin:0;padding:22px 16px 30px;border-radius:0;box-shadow:none}.lh img{width:150px}p[style*=justify]{text-align:left!important}}'
        + '</style></head><body><div class="paper"><div class="lh"><img src="' + location.origin + '/logo-rkdp.png" alt="RKDP"></div>' + d.html + '</div></body></html>';
      view.hidden = false; full.hidden = false;
      var closeBtn = null;
      var setFull = function (on) {
        view.classList.toggle('full', on); document.body.style.overflow = on ? 'hidden' : '';
        if (on && !closeBtn) { closeBtn = document.createElement('button'); closeBtn.className = 'btn-p doc-close'; closeBtn.type = 'button'; closeBtn.textContent = 'Zamknij podgląd ✕'; closeBtn.onclick = function () { setFull(false); }; document.body.appendChild(closeBtn); }
        if (!on && closeBtn) { closeBtn.remove(); closeBtn = null; }
      };
      full.addEventListener('click', function () { setFull(true); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFull(false); });
    }
    // uwagi
    var notesBox = document.getElementById('notes'), form = document.getElementById('noteForm'), nErr = document.getElementById('noteErr');
    var drawNotes = function (list) {
      notesBox.hidden = !list.length;
      notesBox.innerHTML = list.length ? '<b>Zgłoszone uwagi</b>' + list.map(function (n) {
        return '<div class="n"><small>' + esc(n.author || 'Ty') + ' · ' + new Date(n.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) + '</small>' + esc(n.body) + '</div>';
      }).join('') : '';
    };
    var notes = d.notes || []; drawNotes(notes);
    document.getElementById('noteBtn').addEventListener('click', function () { form.hidden = false; document.getElementById('noteTxt').focus(); });
    document.getElementById('noteCancel').addEventListener('click', function () { form.hidden = true; nErr.hidden = true; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var txt = document.getElementById('noteTxt').value.trim(), who = document.getElementById('noteWho').value.trim(), btn = document.getElementById('noteSend');
      if (txt.length < 2) { nErr.textContent = 'Wpisz treść uwag.'; nErr.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Wysyłam…'; nErr.hidden = true;
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'note', token: token, text: txt, author: who }) })
        .then(function (r) { return r.json(); }).then(function (r) {
          btn.disabled = false; btn.textContent = 'Wyślij uwagi';
          if (r.error) { nErr.textContent = r.error; nErr.hidden = false; return; }
          notes = notes.concat([{ body: txt, author: who, created_at: new Date().toISOString() }]); drawNotes(notes);
          document.getElementById('noteTxt').value = ''; form.hidden = true;
          notesBox.insertAdjacentHTML('beforeend', '<p class="small" style="color:#15803D;font-weight:600">✓ Uwagi wysłane – odezwiemy się wkrótce.</p>');
        }).catch(function () { btn.disabled = false; btn.textContent = 'Wyślij uwagi'; nErr.textContent = 'Brak połączenia – spróbuj ponownie.'; nErr.hidden = false; });
    });
    if (d.firm === 'm2') {   // M2 TAX: dane kontaktowe kancelarii
      document.getElementById('contact').innerHTML = 'Zadzwoń: <a href="tel:+48883643565">883 643 565</a> · napisz: <a href="mailto:kancelaria@m2tax.pl">kancelaria@m2tax.pl</a>.';
      document.getElementById('foot').textContent = 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska · ul. Zwycięska 3, 53-033 Wrocław';
    }
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
