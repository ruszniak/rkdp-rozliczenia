// Generator protokołu zwyczajnego zgromadzenia wspólników sp. z o.o. (zatwierdzenie sprawozdania finansowego).
// Dane zostają w przeglądarce (localStorage) – nic nie jest wysyłane.
(function () {
  'use strict';
  var KEY = 'rdp-sf-protokol-v1';
  var form = document.getElementById('gen'), doc = document.getElementById('doc'), warn = document.getElementById('warn');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var gap = function (v, ph) { return v ? esc(v) : '<span class="empty">' + (ph || '……………') + '</span>'; };
  var MON = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var dLong = function (s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return ''; var p = s.split('-'); return (+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0] + ' r.'; };
  var num = function (s) { var v = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? Math.round(v * 100) / 100 : 0; };
  var zl = function (v) { var p = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + p[1] + ' zł'; };
  var LOC = { 'wrocław': 'we Wrocławiu', 'warszawa': 'w Warszawie', 'kraków': 'w Krakowie', 'poznań': 'w Poznaniu', 'gdańsk': 'w Gdańsku', 'gdynia': 'w Gdyni', 'łódź': 'w Łodzi', 'katowice': 'w Katowicach', 'szczecin': 'w Szczecinie', 'lublin': 'w Lublinie', 'bydgoszcz': 'w Bydgoszczy', 'toruń': 'w Toruniu', 'opole': 'w Opolu', 'kalisz': 'w Kaliszu', 'rzeszów': 'w Rzeszowie', 'białystok': 'w Białymstoku', 'kielce': 'w Kielcach', 'olsztyn': 'w Olsztynie', 'zielona góra': 'w Zielonej Górze', 'gorzów wielkopolski': 'w Gorzowie Wielkopolskim', 'częstochowa': 'w Częstochowie', 'radom': 'w Radomiu', 'gliwice': 'w Gliwicach', 'legnica': 'w Legnicy', 'wałbrzych': 'w Wałbrzychu', 'jelenia góra': 'w Jeleniej Górze', 'świdnica': 'w Świdnicy', 'głogów': 'w Głogowie', 'lubin': 'w Lubinie', 'bolesławiec': 'w Bolesławcu', 'żagań': 'w Żaganiu', 'siechnice': 'w Siechnicach', 'ozorzyce': 'w Ozorzycach', 'kobierzyce': 'w Kobierzycach', 'bielany wrocławskie': 'w Bielanach Wrocławskich', 'smolec': 'w Smolcu', 'oława': 'w Oławie', 'oleśnica': 'w Oleśnicy', 'trzebnica': 'w Trzebnicy', 'strzelin': 'w Strzelinie', 'brzeg': 'w Brzegu', 'kępno': 'w Kępnie', 'długołęka': 'w Długołęce', 'żórawina': 'w Żórawinie', 'środa śląska': 'w Środzie Śląskiej', 'kąty wrocławskie': 'w Kątach Wrocławskich', 'jelcz-laskowice': 'w Jelczu-Laskowicach', 'oborniki śląskie': 'w Obornikach Śląskich', 'czernica': 'w Czernicy', 'wisznia mała': 'w Wiszni Małej', 'mietków': 'w Mietkowie', 'sobótka': 'w Sobótce', 'miękinia': 'w Miękini', 'św. katarzyna': 'w Świętej Katarzynie', 'święta katarzyna': 'w Świętej Katarzynie', 'radwanice': 'w Radwanicach', 'wysoka': 'w Wysokiej', 'domasław': 'w Domasławiu', 'tyniec mały': 'w Tyńcu Małym', 'żerniki wrocławskie': 'w Żernikach Wrocławskich' };
  var siedz = function (v) { v = (v || '').trim(); if (!v) return '<span class="empty">w ……………</span>'; if (/^(w|we)\s/i.test(v)) return esc(v); var l = LOC[v.toLowerCase()]; return l ? esc(l) : 'w miejscowości ' + esc(v); };
  var title = function (t) { return String(t || '').toLowerCase().replace(/(^|[\s\-(])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  var DAT = { 'Prezes Zarządu': 'Prezesowi Zarządu', 'Wiceprezes Zarządu': 'Wiceprezesowi Zarządu', 'Członek Zarządu': 'Członkowi Zarządu', 'Przewodniczący Rady Nadzorczej': 'Przewodniczącemu Rady Nadzorczej', 'Członek Rady Nadzorczej': 'Członkowi Rady Nadzorczej' };
  var pct = function (a, b) { return b ? (a / b * 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '0%'; };
  var votes = function (n) { var m10 = n % 10, m100 = n % 100; return n === 1 ? 'głos' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'głosy' : 'głosów'; };
  var shares = function (n) { var m10 = n % 10, m100 = n % 100; return n === 1 ? 'udział' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'udziały' : 'udziałów'; };
  var same = function (a, b) { return a && b && a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' '); };

  var ZF = ['Prezes Zarządu', 'Wiceprezes Zarządu', 'Członek Zarządu'], RF = ['Przewodniczący Rady Nadzorczej', 'Członek Rady Nadzorczej'];
  var rowsDef = {
    wsp: { label: 'Wspólnik (imię i nazwisko albo nazwa)', second: 'Liczba udziałów', type: 'num' },
    zarz: { label: 'Członek zarządu (imię i nazwisko)', second: 'Funkcja', type: 'sel', opts: ZF },
    rn: { label: 'Członek rady nadzorczej', second: 'Funkcja', type: 'sel', opts: RF },
  };
  var S = { wsp: [{ n: '', u: '' }], zarz: [{ n: '', u: ZF[0] }], rn: [] };

  function drawRows(k) {
    var box = document.getElementById(k), d = rowsDef[k];
    box.innerHTML = S[k].map(function (r, i) {
      var second = d.type === 'num'
        ? '<input data-k="' + k + '" data-i="' + i + '" data-f="u" inputmode="numeric" value="' + esc(r.u) + '" placeholder="np. 100">'
        : '<select data-k="' + k + '" data-i="' + i + '" data-f="u">' + d.opts.map(function (o) { return '<option' + (o === r.u ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
      return '<div class="row"><label>' + d.label + '<input data-k="' + k + '" data-i="' + i + '" data-f="n" value="' + esc(r.n) + '"' + (r.ph ? ' placeholder="w KRS: ' + esc(r.ph) + '"' : '') + '></label><label>' + d.second + second + '</label>'
        + ((k === 'wsp' || k === 'zarz') && S[k].length === 1 ? '<span></span>' : '<button type="button" class="x" data-del="' + k + '" data-i="' + i + '" aria-label="Usuń">Usuń</button>') + '</div>';
    }).join('');
  }
  function people() {
    var sel = function (name, cur) {
      var el = form.elements[name], list = S.wsp.map(function (w) { return w.n.trim(); }).filter(Boolean)
        .concat(S.zarz.map(function (z) { return z.n.trim(); }).filter(Boolean)).filter(function (v, i, a) { return a.indexOf(v) === i; });
      el.innerHTML = '<option value="">– wybierz –</option>' + list.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    };
    sel('przew', form.elements.przew.value || load().przew);
    sel('prot', form.elements.prot.value || load().prot);
  }

  function data() {
    var d = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (!el.name) return; d[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    d.wsp = S.wsp; d.zarz = S.zarz; d.rn = S.rn;
    return d;
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* tryb prywatny */ } }

  function render() {
    var d = data(); save(d);
    var W = d.wsp.filter(function (w) { return w.n.trim(); }).map(function (w) { return { n: w.n.trim(), u: Math.max(0, parseInt(String(w.u).replace(/\D/g, ''), 10) || 0) }; });
    var Z = d.zarz.filter(function (z) { return z.n.trim(); }), R = d.rn.filter(function (z) { return z.n.trim(); });
    var single = d.wsp.length <= 1;
    document.getElementById('multi-only').hidden = single;
    var total = W.reduce(function (t, w) { return t + w.u; }, 0);
    var wynik = d.wynik, kw = num(d.kwota);
    document.getElementById('zysk-box').hidden = wynik !== 'zysk';
    document.getElementById('strata-box').hidden = wynik !== 'strata';
    document.getElementById('pokr-inne').hidden = d.pokrycie !== 'inne';
    var parts = [['dyw', 'na wypłatę dywidendy dla wspólników, proporcjonalnie do liczby posiadanych udziałów'], ['zap', 'na kapitał zapasowy'], ['pokr', 'na pokrycie strat z lat ubiegłych'], ['niep', 'do pozostawienia w Spółce jako zysk niepodzielony (zysk z lat ubiegłych)']]
      .map(function (p) { return { k: p[0], t: p[1], v: num(d[p[0]]) }; }).filter(function (p) { return p.v > 0; });
    var sum = parts.reduce(function (t, p) { return t + p.v; }, 0);
    var msgs = [];
    var zs = document.getElementById('zysk-sum');
    if (wynik === 'zysk') {
      var diff = Math.round((kw - sum) * 100) / 100;
      zs.innerHTML = kw ? (diff === 0 ? '<span class="ok">Suma pozycji jest równa zyskowi netto.</span>' : 'Do rozdysponowania zostało: <b>' + zl(diff) + '</b>.') : '';
      if (kw && diff !== 0) msgs.push('Suma pozycji podziału zysku (' + zl(sum) + ') różni się od zysku netto (' + zl(kw) + ').');
    }
    if (!single && W.length && !total) msgs.push('Wpisz liczbę udziałów wspólników.');
    warn.hidden = !msgs.length; warn.textContent = msgs.join(' ');

    var rok = 'od ' + gap(dLong(d.rok_od)) + ' do ' + gap(dLong(d.rok_do));
    var firma = gap(d.firma, 'nazwa spółki'), miasto = siedz(d.miasto);
    var no = 0, U = [];
    // treść uchwał (wspólna dla spółki jedno- i wieloosobowej)
    var pre = single ? 'Jedyny Wspólnik Spółki' : 'Zwyczajne Zgromadzenie Wspólników Spółki';
    var sfParts = ['bilans sporządzony na dzień ' + gap(dLong(d.rok_do)) + ', który po stronie aktywów i pasywów wykazuje sumę ' + gap(num(d.suma) ? zl(num(d.suma)) : '') + ',',
      'rachunek zysków i strat za rok obrotowy ' + rok + ', wykazujący ' + (wynik === 'strata' ? 'stratę netto w kwocie ' + gap(kw ? zl(kw) : '') : wynik === 'zero' ? 'wynik netto równy zero' : 'zysk netto w kwocie ' + gap(kw ? zl(kw) : '')) + ','];
    if (d.przeplywy) sfParts.push('zestawienie zmian w kapitale własnym,', 'rachunek przepływów pieniężnych,');
    sfParts.push('informację dodatkową.');
    var add = function (title, body, secret, exclude) { U.push({ title: title, body: body, secret: secret, exclude: exclude }); };
    if (!single) {
      add('w sprawie wyboru Przewodniczącego Zgromadzenia', '<p>' + pre + ' wybiera na Przewodniczącego Zgromadzenia ' + gap(d.przew, 'imię i nazwisko') + '.</p>', true);
      add('w sprawie przyjęcia porządku obrad', '<p>' + pre + ' przyjmuje porządek obrad w brzmieniu przedstawionym przez Przewodniczącego Zgromadzenia.</p>');
    }
    add('w sprawie zatwierdzenia sprawozdania finansowego za rok obrotowy ' + rok,
      '<p>Na podstawie art. 231 § 2 pkt 1 Kodeksu spółek handlowych oraz art. 53 ust. 1 ustawy o rachunkowości ' + pre + ', po rozpatrzeniu sprawozdania finansowego Spółki za rok obrotowy ' + rok + ', zatwierdza to sprawozdanie, obejmujące:</p><ol>' + sfParts.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>');
    if (d.szd) add('w sprawie zatwierdzenia sprawozdania Zarządu z działalności Spółki za rok obrotowy ' + rok,
      '<p>Na podstawie art. 231 § 2 pkt 1 Kodeksu spółek handlowych ' + pre + ', po rozpatrzeniu sprawozdania Zarządu z działalności Spółki za rok obrotowy ' + rok + ', zatwierdza to sprawozdanie.</p>');
    if (wynik === 'zysk') {
      var dyw = num(d.dyw);
      add('w sprawie podziału zysku za rok obrotowy ' + rok,
        '<p>Na podstawie art. 231 § 2 pkt 2 Kodeksu spółek handlowych ' + pre + ' postanawia przeznaczyć zysk netto Spółki za rok obrotowy ' + rok + ' w kwocie ' + gap(kw ? zl(kw) : '') + ' '
        + (parts.length ? (parts.length === 1 ? 'w całości ' + parts[0].t + '.</p>'
          : 'w następujący sposób:</p><ol>' + parts.map(function (p, i) { return '<li>kwotę ' + zl(p.v) + ' – ' + p.t + (i === parts.length - 1 ? '.' : ',') + '</li>'; }).join('') + '</ol>')
          : gap('', 'sposób podziału zysku') + '.</p>')
        + (dyw > 0 ? '<p>Dzień dywidendy ustala się na ' + (d.dzien_dyw ? esc(dLong(d.dzien_dyw)) : 'dzień podjęcia niniejszej uchwały') + ', a termin wypłaty dywidendy na ' + gap(dLong(d.wyplata)) + '.</p>' : ''));
    } else if (wynik === 'strata') {
      var how = d.pokrycie === 'zapasowy' ? 'z kapitału zapasowego Spółki' : d.pokrycie === 'inne' ? gap(d.pokrycie_txt, 'sposób pokrycia straty') : 'z zysków lat przyszłych';
      add('w sprawie pokrycia straty za rok obrotowy ' + rok,
        '<p>Na podstawie art. 231 § 2 pkt 2 Kodeksu spółek handlowych ' + pre + ' postanawia, że strata netto Spółki za rok obrotowy ' + rok + ' w kwocie ' + gap(kw ? zl(kw) : '') + ' zostanie pokryta ' + how + '.</p>');
    }
    (Z.length ? Z : [{ n: '', u: ZF[0] }]).forEach(function (z) {
      add('w sprawie udzielenia absolutorium ' + DAT[z.u] + ' – ' + gap(z.n, 'imię i nazwisko') + ' – z wykonania obowiązków w roku obrotowym ' + rok,
        '<p>Na podstawie art. 231 § 2 pkt 3 Kodeksu spółek handlowych ' + pre + ' udziela absolutorium ' + DAT[z.u] + ' – ' + gap(z.n, 'imię i nazwisko') + ' – z wykonania obowiązków w roku obrotowym ' + rok + '.</p>', true, z.n);
    });
    R.forEach(function (z) {
      add('w sprawie udzielenia absolutorium ' + DAT[z.u] + ' – ' + esc(z.n) + ' – z wykonania obowiązków w roku obrotowym ' + rok,
        '<p>Na podstawie art. 231 § 2 pkt 3 Kodeksu spółek handlowych ' + pre + ' udziela absolutorium ' + DAT[z.u] + ' – ' + esc(z.n) + ' – z wykonania obowiązków w roku obrotowym ' + rok + '.</p>', true, z.n);
    });

    var vote = function (u) {
      if (single) return '';
      var ex = u.exclude ? W.filter(function (w) { return same(w.n, u.exclude); }) : [];
      var exU = ex.reduce(function (t, w) { return t + w.u; }, 0), v = total - exU;
      return (ex.length ? '<p class="vote">' + esc(ex[0].n) + ' nie brał(a) udziału w głosowaniu (art. 244 Kodeksu spółek handlowych).</p>' : '')
        + '<p class="vote">W głosowaniu ' + (u.secret ? 'tajnym' : 'jawnym') + ' oddano ' + v + ' ' + (v === 1 ? 'ważny głos' : 'ważnych głosów') + ' z ' + v + ' ' + shares(v) + ', stanowiących ' + pct(v, total) + ' kapitału zakładowego, w tym ' + v + ' ' + votes(v) + ' „za”, 0 głosów „przeciw” i 0 głosów „wstrzymujących się”. '
        + (v > 0 ? 'Przewodniczący stwierdził, że uchwała została podjęta.' : 'Uchwała wymaga głosów wspólników, którzy mogą głosować.') + '</p>';
    };
    var uchwaly = U.map(function (u) {
      no++;
      return '<h4>Uchwała nr ' + no + '/' + (d.data ? d.data.slice(0, 4) : '….') + '<br>' + (single ? 'Jedynego Wspólnika' : 'Zwyczajnego Zgromadzenia Wspólników') + ' spółki ' + firma + '<br>z dnia ' + gap(dLong(d.data)) + '<br>' + u.title + '</h4>'
        + u.body + '<p>Uchwała wchodzi w życie z chwilą podjęcia.</p>' + vote(u);
    }).join('');

    var head = '<h3>PROTOKÓŁ</h3><p class="sub"><b>Zwyczajnego Zgromadzenia Wspólników<br>spółki ' + firma + ' z siedzibą ' + miasto + '</b><br>odbytego w dniu ' + gap(dLong(d.data)) + '</p>';
    var html;
    if (single) {
      var w0 = W[0] || { n: '', u: 0 };
      html = head + '<p>W dniu ' + gap(dLong(d.data)) + ', o godzinie ' + gap(d.godz) + ', ' + gap(d.miejsce, 'miejsce') + ', ' + gap(w0.n, 'imię i nazwisko jedynego wspólnika') + ' – jedyny wspólnik spółki ' + firma + ' z siedzibą ' + miasto
        + ', wpisanej do rejestru przedsiębiorców Krajowego Rejestru Sądowego pod numerem KRS ' + gap(d.krs) + ' („Spółka”), posiadający ' + (w0.u ? w0.u + ' ' + shares(w0.u) : gap('', 'liczba udziałów')) + ', stanowiących 100% kapitału zakładowego Spółki, wykonując na podstawie art. 156 Kodeksu spółek handlowych wszystkie uprawnienia przysługujące zgromadzeniu wspólników, odbył Zwyczajne Zgromadzenie Wspólników i podjął następujące uchwały:</p>'
        + uchwaly + '<div class="sig"><div>' + (w0.n ? esc(w0.n) : 'podpis') + '<br>Jedyny Wspólnik</div></div>';
    } else {
      var opener = Z[0] ? Z[0].n : d.przew;
      var porz = ['Otwarcie Zgromadzenia.', 'Wybór Przewodniczącego Zgromadzenia.', 'Stwierdzenie prawidłowości zwołania Zgromadzenia i jego zdolności do podejmowania uchwał.', 'Przyjęcie porządku obrad.',
        'Rozpatrzenie i zatwierdzenie sprawozdania finansowego Spółki za rok obrotowy ' + rok];
      if (d.szd) porz.push('Rozpatrzenie i zatwierdzenie sprawozdania Zarządu z działalności Spółki za rok obrotowy ' + rok);
      if (wynik === 'zysk') porz.push('Podjęcie uchwały w sprawie podziału zysku za rok obrotowy ' + rok);
      if (wynik === 'strata') porz.push('Podjęcie uchwały w sprawie pokrycia straty za rok obrotowy ' + rok);
      porz.push('Udzielenie absolutorium członkom Zarządu' + (R.length ? ' i Rady Nadzorczej' : '') + ' z wykonania obowiązków w roku obrotowym ' + rok, 'Zamknięcie Zgromadzenia.');
      html = head + '<p>W dniu ' + gap(dLong(d.data)) + ', o godzinie ' + gap(d.godz) + ', ' + gap(d.miejsce, 'miejsce') + ', odbyło się Zwyczajne Zgromadzenie Wspólników spółki ' + firma + ' z siedzibą ' + miasto + ', wpisanej do rejestru przedsiębiorców Krajowego Rejestru Sądowego pod numerem KRS ' + gap(d.krs) + ' („Spółka”).</p>'
        + '<p>Zgromadzenie otworzył(a) ' + gap(opener, 'imię i nazwisko') + ', który/która zarządził(a) wybór Przewodniczącego Zgromadzenia. Wybrany Przewodniczący ' + gap(d.przew, 'imię i nazwisko') + ' zarządził(a) sporządzenie listy obecności, podpisał(a) ją i stwierdził(a), że na Zgromadzeniu reprezentowany jest cały kapitał zakładowy Spółki – ' + (total ? total + ' ' + shares(total) : gap('', 'liczba udziałów')) + ', dających ' + (total ? total + ' ' + votes(total) : '……') + ' – a obecni wspólnicy nie zgłosili sprzeciwu ani co do odbycia Zgromadzenia, ani co do wniesienia poszczególnych spraw do porządku obrad. Zgromadzenie odbywa się bez formalnego zwołania na podstawie art. 240 Kodeksu spółek handlowych i jest zdolne do podejmowania uchwał.</p>'
        + '<p>Protokolantem Zgromadzenia został(a) ' + gap(d.prot, 'imię i nazwisko') + '.</p>'
        + '<p>Porządek obrad:</p><ol>' + porz.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>'
        + '<p>Zgromadzenie podjęło następujące uchwały:</p>' + uchwaly
        + '<p>Wobec wyczerpania porządku obrad Przewodniczący zamknął Zgromadzenie. Lista obecności stanowi załącznik do protokołu.</p>'
        + '<div class="sig"><div>Przewodniczący Zgromadzenia<br>' + (d.przew ? esc(d.przew) : '') + '</div><div>Protokolant<br>' + (d.prot ? esc(d.prot) : '') + '</div></div>'
        + '<div class="brk"><h4>Załącznik – lista obecności<br>Zwyczajne Zgromadzenie Wspólników spółki ' + firma + ', ' + gap(dLong(d.data)) + '</h4><table><tr><th>Lp.</th><th>Wspólnik</th><th>Liczba udziałów</th><th>Liczba głosów</th><th>Podpis</th></tr>'
        + (W.length ? W : [{ n: '', u: 0 }]).map(function (w, i) { return '<tr><td>' + (i + 1) + '</td><td>' + gap(w.n) + '</td><td>' + (w.u || '') + '</td><td>' + (w.u || '') + '</td><td style="width:30%"></td></tr>'; }).join('')
        + '<tr><td></td><td><b>Razem</b></td><td><b>' + (total || '') + '</b></td><td><b>' + (total || '') + '</b></td><td></td></tr></table>'
        + '<div class="sig"><div>Przewodniczący Zgromadzenia</div></div></div>';
    }
    doc.innerHTML = html.replace(/ r\.\./g, ' r.').replace(/ r\.(<\/span>)\./g, ' r.$1');
  }

  // ---------- zdarzenia ----------
  form.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.k) { S[t.dataset.k][+t.dataset.i][t.dataset.f] = t.value; if (t.dataset.f === 'n') people(); }
    render();
  });
  form.addEventListener('change', function (e) { var t = e.target; if (t.dataset && t.dataset.k) S[t.dataset.k][+t.dataset.i][t.dataset.f] = t.value; render(); });
  form.addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.add) { S[t.dataset.add].push({ n: '', u: t.dataset.add === 'wsp' ? '' : rowsDef[t.dataset.add].opts ? rowsDef[t.dataset.add].opts[t.dataset.add === 'zarz' && S.zarz.length ? 2 : t.dataset.add === 'rn' && S.rn.length ? 1 : 0] : '' }); drawRows(t.dataset.add); people(); render(); }
    if (t.dataset.del) { S[t.dataset.del].splice(+t.dataset.i, 1); drawRows(t.dataset.del); people(); render(); }
  });
  document.getElementById('print').addEventListener('click', function () { render(); window.print(); });
  document.getElementById('word').addEventListener('click', function () {
    render();
    var d = data();
    var css = 'body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.45}h3{text-align:center;font-size:14pt;margin:0}h4{text-align:center;font-size:12pt;margin:18pt 0 6pt}.sub{text-align:center}p{text-align:justify;margin:0 0 6pt}.vote{font-style:italic}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:4pt 6pt}.sig div{margin-top:36pt}.brk{page-break-before:always}.empty{color:#000}';
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Protokół</title><style>' + css + '</style></head><body>' + doc.innerHTML + '</body></html>';
    var blob = new Blob(['﻿' + html], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ('Protokol ZZW ' + (d.firma || 'spolka') + ' ' + (d.rok_do ? d.rok_do.slice(0, 4) : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w .-]+/g, '').trim() + '.doc';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  document.getElementById('clear').addEventListener('click', function () {
    if (!confirm('Wyczyścić wszystkie wpisane dane?')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* */ }
    location.reload();
  });


  // ---------- dane z KRS (publiczny odpis aktualny; imiona i nazwiska osób są w nim ukryte) ----------
  var KRS_API = (window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl || '') + '/functions/v1/nip-lookup';
  var krsMsg = document.getElementById('krs-msg'), krsQ = document.getElementById('krs-q'), krsBtn = document.getElementById('krs-go');
  var firmName = function (n) {
    var legal = /(SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ|SPÓŁKA AKCYJNA|PROSTA SPÓŁKA AKCYJNA|SPÓŁKA KOMANDYTOWA|SPÓŁKA JAWNA|SPÓŁKA PARTNERSKA)/;
    var m = String(n || '').split(legal);
    return (m[0] || '').split(/\s+/).filter(Boolean).map(function (w) { return w.length > 4 && /[AĄEĘIOÓUY]/.test(w) && !/\d/.test(w) ? title(w) : w; }).join(' ') + (m[1] ? ' ' + m[1].toLowerCase() + (m[2] || '').toLowerCase() : '');
  };
  var ROLE = function (r, rn) { r = String(r || '').toUpperCase(); if (rn) return /PRZEWODNICZ/.test(r) ? RF[0] : RF[1]; return /WICEPREZES/.test(r) ? ZF[1] : /PREZES/.test(r) ? ZF[0] : ZF[2]; };
  var masked = function (p) { return p.entity ? '' : [p.first, p.last].filter(Boolean).join(' '); };
  var setVal = function (name, v) { var el = form.elements[name]; if (el && v) el.value = v; };
  function fromKrs(q) {
    var digits = String(q || '').replace(/\D/g, '');
    if (!digits) { krsMsg.hidden = false; krsMsg.className = 'hint err'; krsMsg.textContent = 'Wpisz numer KRS albo NIP spółki.'; return; }
    var body = digits.length === 10 && !/^0{3}/.test(digits) && digits.length === 10 && digits[0] !== '0' ? { public: true, nip: digits } : { public: true, krs: digits };
    krsBtn.disabled = true; krsBtn.textContent = 'Pobieram…'; krsMsg.hidden = false; krsMsg.className = 'hint'; krsMsg.textContent = 'Łączę się z KRS…';
    fetch(KRS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        krsBtn.disabled = false; krsBtn.textContent = 'Pobierz z KRS';
        if (!d || d.error || !d.found) { krsMsg.className = 'hint err'; krsMsg.textContent = (d && d.error) || 'Nie znaleziono spółki w KRS. Sprawdź numer.'; return; }
        setVal('firma', firmName(d.name)); setVal('krs', d.krs);
        var city = title(d.seat && d.seat.miejscowosc || '');
        if (city) setVal('miasto', LOC[city.toLowerCase()] || city);
        var a = d.address || {};
        var street = [a.ulica ? 'ul. ' + title(a.ulica) : '', [a.nrDomu, a.nrLokalu].filter(Boolean).join('/')].filter(Boolean).join(' ');
        if (street || a.miejscowosc) setVal('miejsce', 'w siedzibie Spółki, ' + [street, [a.kodPocztowy, title(a.miejscowosc)].filter(Boolean).join(' ')].filter(Boolean).join(', '));
        // wspólnicy: liczba udziałów z KRS; łączna liczba udziałów z kapitału i wartości nominalnej
        var nominal = 0;
        var sh = (d.shareholders || []).map(function (w) {
          var txt = String(w.shares || ''), n = parseInt((txt.match(/^\s*(\d[\d\s]*)/) || ['', ''])[1].replace(/\s/g, ''), 10) || 0;
          var val = (txt.match(/WYSOKO[ŚS]CI\s+([\d.\s]+,\d{2})/i) || [])[1];
          if (n && val && !nominal) nominal = parseFloat(val.replace(/[.\s]/g, '').replace(',', '.')) / n;
          return { n: w.entity ? firmName(w.entity) : '', u: n ? String(n) : '', ph: masked(w) };
        });
        if (sh.length) S.wsp = sh;
        var board = (d.board || []).map(function (p) { return { n: p.entity ? p.entity : '', u: ROLE(p.role), ph: masked(p) }; });
        if (board.length) S.zarz = board;
        S.rn = (d.supervisory || []).map(function (p) { return { n: '', u: ROLE(p.role, true), ph: masked(p) }; });
        ['wsp', 'zarz', 'rn'].forEach(drawRows); people(); render();
        var cap = parseFloat(String(d.capital || '').replace(/\s/g, '').replace(',', '.')) || 0;
        var all = nominal ? Math.round(cap / nominal) : 0, listed = sh.reduce(function (t, w) { return t + (parseInt(w.u, 10) || 0); }, 0);
        var last = (d.filings || []).slice(-1)[0];
        var info = ['<span class="ok">Pobrano dane z KRS' + (d.stanZDnia ? ' (stan z dnia ' + esc(d.stanZDnia) + ')' : '') + '.</span> Wpisz imiona i nazwiska – KRS pokazuje je publicznie tylko w skrócie (podpowiedź jest w polach).'];
        if (all && listed < all) info.push('KRS wykazuje tylko wspólników mających co najmniej 10% kapitału: na liście jest ' + listed + ' z ' + all + ' udziałów – dopisz pozostałych wspólników.');
        if (last) info.push('Ostatnie sprawozdanie złożone w KRS: za okres ' + esc(String(last.period || '').toLowerCase()) + (last.filed ? ' (złożone ' + esc(last.filed) + ')' : '') + '.');
        krsMsg.className = 'hint'; krsMsg.innerHTML = info.join(' ');
      })
      .catch(function () { krsBtn.disabled = false; krsBtn.textContent = 'Pobierz z KRS'; krsMsg.className = 'hint err'; krsMsg.textContent = 'Brak połączenia z KRS – spróbuj ponownie albo wpisz dane ręcznie.'; });
  }
  krsBtn.addEventListener('click', function () { fromKrs(krsQ.value); });
  krsQ.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fromKrs(krsQ.value); } });

  // ---------- start ----------
  var saved = load();
  var y = new Date().getFullYear() - 1;
  var def = { rok_od: y + '-01-01', rok_do: y + '-12-31', godz: '10:00', wynik: 'zysk', pokrycie: 'przyszle' };
  Object.keys(def).forEach(function (k) { if (saved[k] == null) saved[k] = def[k]; });
  ['wsp', 'zarz', 'rn'].forEach(function (k) { if (Array.isArray(saved[k]) && (saved[k].length || k === 'rn')) S[k] = saved[k]; drawRows(k); });
  Array.prototype.forEach.call(form.elements, function (el) {
    if (!el.name || saved[el.name] == null || el.name === 'przew' || el.name === 'prot') return;
    if (el.type === 'checkbox') el.checked = !!saved[el.name]; else el.value = saved[el.name];
  });
  people();
  render();
  var qp = new URLSearchParams(location.search), qk = (qp.get('krs') || qp.get('nip') || '').replace(/\D/g, '');
  if (qk) { krsQ.value = qk; if (!saved.firma) fromKrs(qk); }
})();
