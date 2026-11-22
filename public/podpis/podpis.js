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
  function error(msg) { box.innerHTML = '<h1>Nie można otworzyć linku</h1><p class="err">' + esc(msg) + '</p><p>Skontaktuj się z kancelarią RKDP: <a href="tel:+48883643565">883 643 565</a> · <a href="mailto:kancelaria@rkdp.pl">kancelaria@rkdp.pl</a>.</p>'; }
  if (!/^[0-9a-f]{48}$/.test(token)) { error('Link jest nieprawidłowy albo niepełny. Skopiuj cały adres z wiadomości e-mail.'); return; }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ }

  fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'info', token: token }) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.error) return error(d.error); render(d); })
    .catch(function () { error('Brak połączenia – sprawdź internet i odśwież stronę.'); });

  function render(d) {
    box.replaceChildren(document.getElementById('tpl').content.cloneNode(true));
    document.title = d.title + ' – dokument do podpisu';
    document.getElementById('ttl').textContent = d.title;
    document.getElementById('who').textContent = (d.client ? d.client + ' · ' : '') + 'link ważny do ' + new Date(d.expires_at).toLocaleDateString('pl-PL');
    var dl = document.getElementById('dl');
    if (d.file && d.file.url) dl.href = d.file.url;
    else { dl.hidden = true; document.getElementById('dlname').textContent = 'Plik PDF jest chwilowo niedostępny – odśwież stronę albo skontaktuj się z kancelarią.'; }
    // podgląd treści (izolowana ramka bez skryptów)
    var wrap = function (html) {
      return /^<!doctype/i.test(html) ? html : '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
        + 'html{font-size:11pt}body{margin:0;background:#E9EAEE;color:#1c1d21;font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;line-height:1.4}'
        + '.paper{max-width:760px;margin:18px auto;background:#fff;padding:44px 60px 56px;box-shadow:0 2px 10px rgba(0,0,0,.08);border-radius:4px}'
        + '.lh{text-align:center;margin-bottom:18px}.lh img{width:190px;height:auto}p{margin:0}.tab{display:inline-block;width:36pt}'
        + '@media(max-width:640px){html{font-size:10pt}.paper{margin:0;padding:22px 16px 30px;border-radius:0;box-shadow:none}.lh img{width:150px}p[style*=justify]{text-align:left!important}}'
        + '</style></head><body><div class="paper"><div class="lh"><img src="' + location.origin + '/logo-rkdp.png" alt="RKDP"></div>' + html + '</div></body></html>';
    };
    var ver = d.version || 1;
    if (ver > 1) {   // nowa wersja po uwagach: informacja, zmiany zaznaczone w treści
      var vb = document.getElementById('ver'), marked = null;
      if (d.html && d.prev_html && window.DocDiff) { try { marked = window.DocDiff.mark(wrap(d.html), wrap(d.prev_html)); } catch (e) { marked = null; } }
      var what = d.changes || (marked && marked.labels.length ? 'Zmienione: ' + marked.labels.join(', ') + '.' : '');
      vb.innerHTML = '<b>Wersja ' + ver + ' – uwzględnia Państwa uwagi</b>' + (what ? '<p>' + esc(what) + '</p>' : '')
        + (marked && marked.count ? '<span class="leg">W treści poniżej: <ins>dodane</ins> <del>usunięte</del></span><button type="button" class="lnk" id="verTgl">Pokaż tekst bez zaznaczeń</button>' : '')
        + '<span class="leg">Podpisać można tylko tę, najnowszą wersję.</span>';
      vb.hidden = false;
      document.getElementById('ttl').textContent = d.title + ' – wersja ' + ver;
      var acc = document.getElementById('acceptBtn'); acc.textContent = 'Akceptuję wersję ' + ver + ' – przejdź do podpisu'; acc.hidden = d.status !== 'wyslano';
      acc.addEventListener('click', function () { var w = box.querySelector('.ways'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }
    if (d.html) {
      var view = document.getElementById('view'), frame = document.getElementById('frame'), full = document.getElementById('fullBtn');
      var showMarked = !!(marked && marked.count);
      var paint = function () { frame.srcdoc = showMarked ? marked.html : wrap(d.html); };
      paint();
      var tgl = document.getElementById('verTgl');
      if (tgl) tgl.addEventListener('click', function () { showMarked = !showMarked; tgl.textContent = showMarked ? 'Pokaż tekst bez zaznaczeń' : 'Pokaż zmiany względem wersji ' + (ver - 1); paint(); });
      view.hidden = false; full.hidden = false;
      var closeBtn = null;
      var setFull = function (on) {
        view.classList.toggle('full', on); document.body.style.overflow = on ? 'hidden' : '';
        if (on && !closeBtn) { closeBtn = document.createElement('button'); closeBtn.className = 'btn-p doc-close'; closeBtn.type = 'button'; closeBtn.textContent = 'Zamknij podgląd'; closeBtn.onclick = function () { setFull(false); }; document.body.appendChild(closeBtn); }
        if (!on && closeBtn) { closeBtn.remove(); closeBtn = null; }
      };
      full.addEventListener('click', function () { setFull(true); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFull(false); });
    }
    // uwagi
    var notesBox = document.getElementById('notes'), form = document.getElementById('noteForm'), nErr = document.getElementById('noteErr');
    var VD = { przyjete: 'przyjęte', czesciowo: 'częściowo przyjęte', odrzucone: 'nieprzyjęte' };
    var resp = {}, roundPts = [];
    // otwarta runda: ostatnia wiadomość to odpowiedź kancelarii (bez nowej wersji) – klient odpowiada przy każdym punkcie
    var openRound = function (list) {
      var L = -1, P = -1; list.forEach(function (n, i) { if (n.from_client === false) { P = L; L = i; } });
      if (d.status !== 'wyslano' || L < 0 || list[L].kind !== 'odpowiedz' || L < list.length - 1) return [];
      var out = [];
      list.slice(P + 1, L).forEach(function (n) {
        if (n.from_client === false || n.kind === 'akceptacja' || !n.id || !Array.isArray(n.points)) return;
        n.points.forEach(function (p, i) { if (p.v && p.a !== 'ok') out.push({ note: n.id, i: i, p: p, key: n.id + ':' + i }); });
      });
      return out;
    };
    var ptHtml = function (n, p, i) {
      var key = n.id + ':' + i, open = roundPts.some(function (r) { return r.key === key; });
      return '<div class="pt' + (p.v ? ' v-' + p.v : '') + '"><div class="pt-h"><b>' + esc(p.n || 'Uwaga') + '</b>' + (p.v && VD[p.v] ? '<span class="vd vd-' + p.v + '">' + VD[p.v] + '</span>' : '') + '</div>'
        + (p.a ? '<div class="pt-q">' + esc(p.t.length > 220 ? p.t.slice(0, 220) + '…' : p.t) + '</div><div class="pt-t">' + (p.a === 'ok' ? 'Akceptuję stanowisko kancelarii.' : esc(p.x || '')) + '</div>'
          : '<div class="pt-t">' + esc(p.t) + '</div>')
        + (p.c ? '<div class="pt-c"><b>Kancelaria:</b> ' + esc(p.c) + '</div>' : '')
        + (open ? '<div class="pr" data-k="' + key + '"><p class="pr-ok" hidden>Kancelaria przyjęła tę propozycję – nie wymaga odpowiedzi. <button type="button" class="lnk">Mam jednak uwagę</button></p><div class="pr-b"><button type="button" class="btn-s" data-a="ok">Akceptuję</button><button type="button" class="btn-s" data-a="uwaga">Mam uwagę</button></div>'
          + '<textarea rows="3" maxlength="3000" placeholder="Twoja odpowiedź do tego punktu" hidden></textarea></div>' : '')
        + '</div>';
    };
    var drawNotes = function (list) {
      var talk = list.some(function (n) { return n.from_client === false; });
      roundPts = openRound(list);
      notesBox.hidden = !list.length;
      notesBox.innerHTML = list.length ? '<h3>' + (talk ? 'Rozmowa z kancelarią' : 'Zgłoszone uwagi') + '</h3>' + list.map(function (n) {
        var office = n.from_client === false;
        var pts = !office && Array.isArray(n.points) && n.points.length && (n.verdict || n.points.some(function (p) { return p.a; }));
        return '<div class="n' + (office ? ' office' : '') + '"><small>' + esc(n.author || (office ? 'Kancelaria' : 'Ty')) + ' · ' + new Date(n.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
          + (n.version && ver > 1 ? ' · ' + (office ? 'wersja ' : 'do wersji ') + n.version : '')
          + (n.verdict && VD[n.verdict] && !pts ? '<span class="vd">' + VD[n.verdict] + '</span>' : '') + '</small>'
          + (pts ? n.points.map(function (p, i) { return ptHtml(n, p, i); }).join('')
            : esc(n.kind === 'akceptacja' ? 'Akceptuję stanowisko kancelarii. Proszę o przygotowanie umowy do podpisu.' : n.body)) + '</div>';
      }).join('') : '';
      notesBox.querySelectorAll('.pr').forEach(function (el) {
        var k = el.dataset.k, ta = el.querySelector('textarea'), bs = el.querySelectorAll('.pr-b button');
        var r0 = roundPts.filter(function (r) { return r.key === k; })[0];
        if (!resp[k]) resp[k] = { a: r0 && r0.p.v === 'przyjete' ? 'ok' : '', x: '' };
        var okBox = el.querySelector('.pr-ok'), pb = el.querySelector('.pr-b');
        var compact = r0 && r0.p.v === 'przyjete' && resp[k].a === 'ok' && !resp[k].open;
        okBox.querySelector('button').addEventListener('click', function () { resp[k].open = true; paint(); });
        var paint = function () {
          compact = r0 && r0.p.v === 'przyjete' && resp[k].a === 'ok' && !resp[k].open;
          okBox.hidden = !compact; pb.hidden = !!compact;
          bs.forEach(function (b) { b.classList.toggle('on', b.dataset.a === resp[k].a); }); ta.hidden = resp[k].a !== 'uwaga'; el.parentNode.classList.toggle('need', !resp[k].a);
        };
        bs.forEach(function (b) { b.addEventListener('click', function () { resp[k].a = b.dataset.a; paint(); if (b.dataset.a === 'uwaga') ta.focus(); }); });
        ta.value = resp[k].x; ta.addEventListener('input', function () { resp[k].x = ta.value; });
        paint();
      });
      if (talk) { document.getElementById('noteBtn').textContent = 'Odpowiedz kancelarii'; document.getElementById('noteLbl').textContent = 'Odpowiedz albo zgłoś kolejne uwagi'; }
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
          notes = notes.concat([{ body: txt, author: who, created_at: new Date().toISOString(), version: ver, from_client: true }]); drawNotes(notes);
          document.getElementById('noteTxt').value = ''; form.hidden = true;
          notesBox.insertAdjacentHTML('beforeend', '<p class="sent">Wysłane do kancelarii. Odpowiedź zobaczysz tutaj i dostaniesz e-mailem.</p>');
          decideState();
        }).catch(function () { btn.disabled = false; btn.textContent = 'Wyślij uwagi'; nErr.textContent = 'Brak połączenia – spróbuj ponownie.'; nErr.hidden = false; });
    });
    // po odpowiedzi kancelarii (bez nowej wersji): akceptacja stanowiska albo kolejne uwagi
    var decideBox = document.getElementById('decide'), decided = document.getElementById('decided');
    var decideState = function () {
      var lastOffice = -1; notes.forEach(function (n, i) { if (n.from_client === false) lastOffice = i; });
      var after = lastOffice >= 0 ? notes.slice(lastOffice + 1) : [];
      var office = lastOffice >= 0 ? notes[lastOffice] : null;
      var accepted = after.some(function (n) { return n.kind === 'akceptacja'; });
      decideBox.hidden = !(d.status === 'wyslano' && office && office.kind !== 'wersja' && office.kind !== 'do_podpisu' && !after.length);
      decided.hidden = !(d.status === 'wyslano' && accepted);
      var pm = !decideBox.hidden && roundPts.length > 0;
      document.getElementById('respBtn').hidden = !pm;
      document.getElementById('decTxt').innerHTML = pm
        ? '<b>Kancelaria odniosła się do każdego punktu Państwa uwag.</b> Przy każdym punkcie powyżej kliknij „Akceptuję” albo „Mam uwagę” (i wpisz odpowiedź), a potem „Wyślij odpowiedź”. Jeśli wszystko jest zaakceptowane, przygotujemy umowę do podpisu.'
        : '<b>Kancelaria odniosła się do Państwa uwag.</b> Jeśli zgadzają się Państwo ze stanowiskiem kancelarii, kliknij „Akceptuję” – przygotujemy umowę do podpisu i wyślemy e-mail, gdy będzie gotowa. Możesz też zgłosić kolejne uwagi.';
      document.getElementById('accBtn').textContent = pm ? 'Akceptuję całe stanowisko' : 'Akceptuję stanowisko kancelarii';
    };
    document.getElementById('respBtn').addEventListener('click', function () {
      var b = this, aErr = document.getElementById('accErr'); aErr.hidden = true;
      var miss = roundPts.filter(function (r) { var x = resp[r.key] || {}; return !x.a || (x.a === 'uwaga' && (x.x || '').trim().length < 2); });
      if (miss.length) {
        aErr.textContent = 'Uzupełnij odpowiedź przy: ' + miss.map(function (r) { return r.p.n || 'uwadze'; }).join(', ') + '.'; aErr.hidden = false;
        var el = notesBox.querySelector('.pr[data-k="' + miss[0].key + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      b.disabled = true; b.textContent = 'Wysyłam…';
      var who = document.getElementById('noteWho').value.trim();
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'respond', token: token, author: who,
        points: roundPts.map(function (r) { return { note: r.note, i: r.i, a: resp[r.key].a, x: resp[r.key].x }; }) }) })
        .then(function (r) { return r.json(); }).then(function (r) {
          b.disabled = false; b.textContent = 'Wyślij odpowiedź';
          if (r.error) { aErr.textContent = r.error; aErr.hidden = false; return; }
          notes = notes.concat([r.note]); drawNotes(notes); decideState();
          if (!r.accepted) notesBox.insertAdjacentHTML('beforeend', '<p class="sent">Wysłane do kancelarii. Odpowiedź zobaczysz tutaj i dostaniesz e-mailem.</p>');
        }).catch(function () { b.disabled = false; b.textContent = 'Wyślij odpowiedź'; aErr.textContent = 'Brak połączenia – spróbuj ponownie.'; aErr.hidden = false; });
    });
    decideState();
    document.getElementById('moreBtn').addEventListener('click', function () { form.hidden = false; document.getElementById('noteTxt').focus(); });
    document.getElementById('accBtn').addEventListener('click', function () {
      var b = this, aErr = document.getElementById('accErr'); b.disabled = true; b.textContent = 'Wysyłam…'; aErr.hidden = true;
      var who = document.getElementById('noteWho').value.trim();
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', token: token, author: who }) })
        .then(function (r) { return r.json(); }).then(function (r) {
          b.disabled = false; decideState();
          if (r.error) { aErr.textContent = r.error; aErr.hidden = false; return; }
          notes = notes.concat([{ body: 'Akceptuję stanowisko kancelarii. Proszę o przygotowanie umowy do podpisu.', author: who, created_at: new Date().toISOString(), version: ver, from_client: true, kind: 'akceptacja' }]);
          drawNotes(notes); decideState();
        }).catch(function () { b.disabled = false; decideState(); aErr.textContent = 'Brak połączenia – spróbuj ponownie.'; aErr.hidden = false; });
    });
    if (d.firm === 'm2') {   // M2 TAX: dane kontaktowe kancelarii
      document.getElementById('contact').innerHTML = 'Zadzwoń: <a href="tel:+48883643565">883 643 565</a> · napisz: <a href="mailto:kancelaria@m2tax.pl">kancelaria@m2tax.pl</a>.';
      document.getElementById('foot').innerHTML = 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska · ul. Zwycięska 3, 53-033 Wrocław<br>NIP 8993058189 · KRS 0001238577 · tel. 883 643 565 · kancelaria@m2tax.pl';
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
      document.querySelector('#done p').textContent = 'Podpisany dokument dotarł do nas ' + new Date(d.signed_at).toLocaleDateString('pl-PL') + '.' + (d.final && d.final.url ? '' : ' Gdy podpiszemy go po naszej stronie, Twój egzemplarz pojawi się tutaj – wyślemy też e-mail.');
      if (d.final && d.final.url) { document.getElementById('final').hidden = false; var fd = document.getElementById('finalDl'); fd.href = d.final.url; if (d.final.name) fd.setAttribute('download', d.final.name);
        document.querySelector('#done h2').textContent = 'Umowa podpisana przez obie strony'; document.getElementById('done').scrollIntoView({ block: 'center' }); }
      return; }
    // wgrywanie
    var input = document.getElementById('file'), drop = document.getElementById('drop'), send = document.getElementById('send'), err = document.getElementById('err');
    var file = null;
    var setFile = function (f) {
      file = f || null; err.hidden = true;
      drop.classList.toggle('has', !!file);
      drop.querySelector('b').textContent = file ? 'Wybrany plik: ' + file.name : 'Wybierz podpisany plik';
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
