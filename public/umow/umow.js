// Publiczne umawianie spotkań z doradcą podatkowym (bez logowania). Dane i wolne terminy z funkcji „spotkania”.
// ?embed=1 – w okienku na stronie (rkdp.pl / m2tax.pl); ?t=<token> – zmiana terminu / odwołanie z linku w e-mailu;
// ?typ=<id|online|bezplatne|jagodno|zwycieska> i ?doradca=<id|michal|marcin> – wybór od razu.
(function () {
  'use strict';
  var API = ((window.RKDP_CONFIG && window.RKDP_CONFIG.supabaseUrl) || 'https://iuszfoyttqnkzjzjpzma.supabase.co') + '/functions/v1/spotkania';
  var q = new URLSearchParams(location.search);
  var EMBED = q.get('embed') === '1';
  var TOKEN = q.get('t');
  if (EMBED) document.body.classList.add('embed');
  if (q.get('bare') === '1') document.body.classList.add('bare');   // w okienku strony, która ma własny nagłówek
  var root = document.getElementById('um');
  var openedAt = Date.now();
  // skąd klient się umawia: strona rkdp.pl, strona m2tax.pl albo bezpośredni link
  var CHANNEL = (function () {
    var z = (q.get('zrodlo') || '').toLowerCase();
    if (z === 'rkdp' || z === 'm2tax') return z;
    var r = ''; try { r = new URL(document.referrer).hostname; } catch (e) { r = ''; }
    if (/(^|\.)rkdp\.pl$/.test(r)) return 'rkdp';
    if (/(^|\.)m2tax\.pl$/.test(r)) return 'm2tax';
    return 'link';
  })();
  // kolory: w okienku na stronie rkdp.pl / m2tax.pl – kolory tej strony, pod linkiem – kolory aplikacji
  var THEME = (q.get('motyw') || (EMBED && CHANNEL !== 'link' ? CHANNEL : '')).toLowerCase();
  if (THEME === 'rkdp' || THEME === 'm2tax') document.body.classList.add('th-' + THEME);

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.setAttribute('style', v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function api(action, body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || 'Błąd połączenia – spróbuj ponownie.'); return j; }); });
  }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var isoDay = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  var longDay = function (iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }); };
  var fullWhen = function (s, e) { var a = new Date(s), b = new Date(e); return a.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + a.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + '–' + b.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l'); };
  var ICON = {
    meet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4z"/><path d="M17 10l4-2.5v9L17 14"/></svg>',
    office: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    ok: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    team: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.5"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14.5 15c2.3-.4 4.7.8 5.5 4"/></svg>',
  };
  var AVC = ['#1F2937', '#374151', '#2563EB', '#0F766E'];
  function close() { if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'rkdp-umow-close' }, '*'); }
  function top(step) {
    return h('div', { class: 'um-top' },
      h('img', { class: 'um-logo', src: '/logo-app.svg', alt: '', width: '44', height: '44' }),
      h('div', null, h('h1', null, TOKEN ? 'Twoje spotkanie' : 'Umów spotkanie z doradcą podatkowym'), h('p', null, 'Doradcy podatkowi · Wrocław i online · tel. 883 643 565')),
      !TOKEN ? h('div', { class: 'um-steps' }, h('span', { class: step === 1 ? 'on' : '' }, '1. Termin'), '—', h('span', { class: step === 2 ? 'on' : '' }, '2. Dane'), '—', h('span', { class: step === 3 ? 'on' : '' }, '3. Gotowe')) : null,
      EMBED ? h('button', { class: 'um-x', type: 'button', 'aria-label': 'Zamknij', onclick: close }, '✕') : null);
  }
  function render() { root.innerHTML = ''; for (var i = 0; i < arguments.length; i++) add(root, arguments[i]); }
  function fail(msg) { render(h('div', { class: 'um-card' }, top(0), h('div', { class: 'done' }, h('p', { class: 'err' }, msg), h('p', null, 'Możesz też zadzwonić: ', h('a', { href: 'tel:+48883643565' }, '883 643 565'))))); }

  var cfg = null, st = { type: null, adv: 'any', month: null, day: null, slot: null, days: {}, loading: false };

  // ---------- krok 1: rodzaj, doradca, dzień, godzina ----------
  function step1() {
    var types = cfg.types;
    var advName = function (id) { var a = cfg.advisors.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var side = h('div', { class: 'um-side' },
      h('p', { class: 'lbl' }, 'Rodzaj spotkania'),
      types.map(function (t) {
        return h('button', { type: 'button', class: 'typ' + (st.type && st.type.id === t.id ? ' on' : ''), onclick: function () { st.type = t; st.day = null; st.slot = null; loadSlots(); } },
          h('span', { class: 'ic', html: ICON[t.mode] || ICON.meet }),
          h('span', null, h('b', null, t.name), h('small', null, (t.duration_min >= 60 ? (t.duration_min / 60 + ' godz.').replace('.5', ',5') : t.duration_min + ' min') + ' · ' + (t.mode === 'office' ? (t.place || 'stacjonarnie').replace(/^RKDP Doradztwo Podatkowe, /, '') : t.mode === 'phone' ? 'telefonicznie' : 'online (Google Meet)'))),
          /bezpłatn/i.test(t.name) ? h('span', { class: 'free' }, '0 zł') : null);
      }),
      cfg.advisors.length > 1 ? [h('p', { class: 'lbl', style: 'margin-top:14px' }, 'Doradca'),
        h('div', { class: 'dors' },
          h('button', { type: 'button', class: 'dor' + (st.adv === 'any' ? ' on' : ''), onclick: function () { st.adv = 'any'; st.slot = null; loadSlots(); } }, h('span', { class: 'av', style: 'background:#8A8F97', html: ICON.team }), 'Pierwszy wolny'),
          cfg.advisors.filter(function (a) { return !st.type || (st.type.advisors || []).indexOf(a.id) >= 0; }).map(function (a, i) {
            return h('button', { type: 'button', class: 'dor' + (st.adv === a.id ? ' on' : ''), onclick: function () { st.adv = a.id; st.slot = null; loadSlots(); } }, a.photo ? h('img', { class: 'av', src: a.photo, alt: '' }) : h('span', { class: 'av', style: 'background:' + AVC[i % AVC.length] }, a.initials), a.name);
          }))] : null,
      st.type && st.type.description ? h('div', { class: 'note' }, st.type.description) : h('div', { class: 'note' }, 'Spotkania prowadzą doradcy podatkowi. Potwierdzenie i szczegóły przyjdą na e-mail.'));

    var main = h('div', { class: 'um-mainp' });
    if (!st.type) add(main, h('div', { class: 'hint', style: 'padding:30px 0' }, 'Wybierz rodzaj spotkania, a pokażemy wolne terminy.'));
    else if (st.loading) add(main, h('div', { class: 'hint', style: 'padding:30px 0' }, 'Sprawdzamy wolne terminy…'));
    else {
      var keys = Object.keys(st.days).sort();
      if (!keys.length) add(main, h('div', { class: 'hint', style: 'padding:30px 0' }, 'Brak wolnych terminów w najbliższych tygodniach' + (st.adv !== 'any' ? ' u tego doradcy – wybierz „Pierwszy wolny”' : '') + '. Zadzwoń: 883 643 565.'));
      else {
        if (!st.month) st.month = keys[0].slice(0, 7);
        if (!st.day) st.day = keys[0];
        var y = +st.month.slice(0, 4), m = +st.month.slice(5, 7) - 1;
        var first = new Date(y, m, 1), shift = (first.getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
        var minM = keys[0].slice(0, 7), maxM = keys[keys.length - 1].slice(0, 7);
        var cells = [];
        for (var i = 0; i < shift; i++) cells.push(h('button', { type: 'button', disabled: true, 'aria-hidden': 'true' }));
        for (var d = 1; d <= nDays; d++) (function (d) {
          var iso = st.month + '-' + pad(d), ok = !!st.days[iso];
          cells.push(h('button', { type: 'button', class: (ok ? 'ok' : '') + (iso === st.day ? ' sel' : '') + (iso === isoDay(new Date()) ? ' td' : ''), disabled: !ok, 'aria-label': longDay(iso) + (ok ? ', wolne terminy' : ', brak terminów'), onclick: function () { st.day = iso; st.slot = null; render(card(1, step1())); } }, String(d)));
        })(d);
        var mv = function (n) { var dt = new Date(y, m + n, 1); st.month = dt.getFullYear() + '-' + pad(dt.getMonth() + 1); render(card(1, step1())); };
        add(main, h('div', null,
          h('div', { class: 'cal-h' }, h('p', { class: 'lbl', style: 'margin:0' }, 'Dzień'),
            h('div', { class: 'nav' }, h('button', { class: 'nb', type: 'button', 'aria-label': 'Poprzedni miesiąc', disabled: st.month <= minM, onclick: function () { mv(-1); } }, '‹'), MONTHS[m] + ' ' + y,
              h('button', { class: 'nb', type: 'button', 'aria-label': 'Następny miesiąc', disabled: st.month >= maxM, onclick: function () { mv(1); } }, '›'))),
          h('div', { class: 'cal' }, ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SB', 'ND'].map(function (x) { return h('span', null, x); }), cells)));
        var sl = st.days[st.day] || [];
        add(main, h('div', null,
          h('p', { class: 'lbl' }, longDay(st.day)),
          h('div', { class: 'slots' }, sl.map(function (s) { return h('button', { type: 'button', class: 'slot' + (st.slot && st.slot.start === s.start ? ' sel' : ''), onclick: function () { st.slot = s; render(card(1, step1())); } }, s.t); })),
          h('div', { class: 'sticky' }, h('button', { class: 'btn', type: 'button', style: 'width:100%;margin-top:14px', disabled: !st.slot, onclick: function () { render(card(2, step2())); window.scrollTo(0, 0); } }, st.slot ? 'Dalej – ' + st.slot.t : 'Wybierz godzinę')),
          h('div', { class: 'hint', style: 'margin-top:8px' }, 'Czas polski (Warszawa)')));
      }
    }
    return h('div', { class: 'um-grid' }, side, main);
  }
  function loadSlots() {
    st.loading = true; st.days = {}; st.month = null; st.day = null;
    render(card(1, step1()));
    var t0 = isoDay(new Date());
    var to = new Date(); to.setDate(to.getDate() + (cfg.max_days || 28));
    api('slots', { type_id: st.type.id, advisor: st.adv, from: t0, to: isoDay(to) }).then(function (r) {
      st.days = r.days || {}; st.loading = false; render(card(1, step1()));
    }).catch(function (e) { st.loading = false; fail(e.message); });
  }
  function card(step, body) { return h('div', { class: 'um-card' }, top(step), body); }

  // ---------- krok 2: dane ----------
  var form = { name: '', email: '', phone: '', topic: '', consent: false };
  function summary() {
    var d = new Date(st.slot.start), end = new Date(d.getTime() + st.type.duration_min * 60000);
    var advId = st.adv !== 'any' ? st.adv : (st.slot.advisors.length === 1 ? st.slot.advisors[0] : null);
    var a = advId ? cfg.advisors.filter(function (x) { return x.id === advId; })[0] : null;
    return h('div', { class: 'sum' },
      h('div', { class: 'd' }, h('div', { class: 'dd' }, h('small', null, d.toLocaleDateString('pl-PL', { weekday: 'short' })), h('b', null, String(d.getDate()))),
        h('div', null, h('b', null, st.type.name), h('div', { style: 'font-size:13px;color:#C9CCD1' }, d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + '–' + end.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + ', ' + longDay(isoDay(d))))),
      h('p', null, (st.type.mode === 'office' ? 'Miejsce: ' + (st.type.place || '') : st.type.mode === 'phone' ? 'Zadzwonimy na podany numer.' : 'Spotkanie online – link do Google Meet przyjdzie w e-mailu.'),
        h('br'), 'Doradca: ' + (a ? a.name : 'pierwszy wolny doradca podatkowy')),
      h('p', null, h('a', { href: '#', onclick: function (e) { e.preventDefault(); render(card(1, step1())); } }, 'Zmień termin')));
  }
  function step2(err) {
    var inp = function (k, label, type, auto, ph) {
      var el = h(k === 'topic' ? 'textarea' : 'input', { id: 'f-' + k, type: type || null, autocomplete: auto || null, placeholder: ph || null, oninput: function (e) { form[k] = e.target.value; } });
      el.value = form[k];
      return h('div', { class: 'fl' }, h('label', { for: 'f-' + k }, label), el);
    };
    var hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var btn = h('button', { class: 'btn', type: 'submit', style: 'width:100%' }, 'Potwierdź rezerwację');
    var f = h('form', { onsubmit: function (e) {
      e.preventDefault();
      if (!form.consent) return render(card(2, step2('Zaznacz zgodę na przetwarzanie danych.')));
      btn.disabled = true; btn.textContent = 'Rezerwuję…';
      api('book', { type_id: st.type.id, advisor: st.adv, start: st.slot.start, name: form.name, email: form.email, phone: form.phone, topic: form.topic, consent: true, hp: hp.value, ms: Date.now() - openedAt, channel: CHANNEL })
        .then(function (r) { render(card(3, done(r.meeting, r.mailed))); window.scrollTo(0, 0); })
        .catch(function (e) {
          if (/zajęt/i.test(e.message)) { st.slot = null; loadSlots(); setTimeout(function () { alertBox(e.message); }, 50); return; }
          render(card(2, step2(e.message)));
        });
    } },
      err ? h('p', { class: 'err', role: 'alert' }, err) : null,
      inp('name', 'Imię i nazwisko', 'text', 'name'),
      inp('email', 'E-mail', 'email', 'email'),
      inp('phone', 'Telefon', 'tel', 'tel'),
      inp('topic', 'W jakiej sprawie? (krótko – pomoże nam się przygotować)', null, null, 'np. sprzedaż mieszkania, kontrola z urzędu skarbowego, wybór formy opodatkowania'),
      hp,
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: form.consent, onchange: function (e) { form.consent = e.target.checked; } }),
        'Zgadzam się na przetwarzanie moich danych w celu umówienia i przeprowadzenia spotkania. Administratorem danych jest kancelaria doradcy podatkowego, z którym odbędzie się spotkanie (RKDP spółka doradztwa podatkowego sp. z o.o. albo M2 TAX Doradcy Podatkowi). Dane nie są wykorzystywane do marketingu. ', h('a', { href: 'https://rkdp.pl/polityka-prywatnosci.html', target: '_blank', rel: 'noopener' }, 'Polityka prywatności')),
      h('div', { class: 'sticky' }, btn));
    return h('div', { class: 'form' }, f, summary());
  }
  function alertBox(msg) { var p = h('p', { class: 'err', role: 'alert', style: 'margin:12px 22px 0' }, msg); var c = root.querySelector('.um-top'); if (c) c.after(p); }

  // ---------- krok 3: gotowe ----------
  function gcalLink(m) {
    var f = function (iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var p = new URLSearchParams({ action: 'TEMPLATE', text: 'Spotkanie z doradcą podatkowym – ' + m.type, dates: f(m.start) + '/' + f(m.end),
      details: (m.meet_url ? 'Google Meet: ' + m.meet_url + '\n' : '') + 'Doradca: ' + (m.advisors || []).map(function (a) { return a.name; }).join(', '), location: m.mode === 'office' ? (m.place || '') : (m.meet_url || '') });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function done(m, mailed) {
    return h('div', { class: 'done' },
      h('div', { class: 'ok', html: ICON.ok }),
      h('h2', null, 'Spotkanie umówione'),
      h('p', { class: 'hint' }, mailed ? 'Wysłaliśmy potwierdzenie na Twój e-mail (sprawdź też folder Oferty / Spam). Dzień wcześniej przypomnimy o spotkaniu.' : 'Spotkanie jest zapisane. Jeśli nie dostaniesz e-maila w ciągu kilku minut – zadzwoń: 883 643 565.'),
      details(m),
      h('div', { class: 'acts' }, h('a', { class: 'btn', href: gcalLink(m), target: '_blank', rel: 'noopener' }, 'Dodaj do Kalendarza Google'),
        EMBED ? h('button', { class: 'btn out', type: 'button', onclick: close }, 'Zamknij') : null));
  }
  function details(m) {
    return h('div', { class: 'kv' },
      h('span', null, 'Termin'), h('b', null, fullWhen(m.start, m.end)),
      h('span', null, 'Rodzaj'), h('b', null, m.type || 'Spotkanie'),
      h('span', null, 'Doradca'), h('b', null, (m.advisors || []).map(function (a) { return a.name; }).join(', ') || '—'),
      h('span', null, m.mode === 'office' ? 'Miejsce' : 'Gdzie'),
      h('b', null, m.mode === 'office' ? [m.place || '', m.map_url ? [' · ', h('a', { href: m.map_url, target: '_blank', rel: 'noopener' }, 'mapa')] : null] : m.mode === 'phone' ? 'rozmowa telefoniczna' : (m.meet_url ? h('a', { href: m.meet_url, target: '_blank', rel: 'noopener' }, 'Google Meet – link do spotkania') : 'Google Meet (link w e-mailu)')));
  }

  // ---------- zarządzanie spotkaniem z linku (zmiana / odwołanie) ----------
  function manage() {
    api('reschedule', { token: TOKEN }).then(function (r) { showManage(r.meeting, r.days); })
      .catch(function () {
        api('manage', { token: TOKEN }).then(function (r) { showManage(r.meeting, null); }).catch(function (e) { fail(e.message); });
      });
  }
  function showManage(m, days) {
    var cancelled = m.status === 'cancelled';
    var body = h('div', { class: 'done' },
      cancelled ? h('h2', null, 'Spotkanie odwołane') : h('h2', null, 'Twoje spotkanie'),
      details(m),
      cancelled ? h('div', { class: 'acts' }, h('a', { class: 'btn', href: location.pathname + (EMBED ? '?embed=1' : '') }, 'Umów nowy termin'))
        : m.can_change ? h('div', { class: 'acts' },
          days ? h('button', { class: 'btn', type: 'button', onclick: function () { pickNew(m, days); } }, 'Zmień termin') : null,
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { askCancel(m); } }, 'Odwołaj spotkanie'))
          : h('p', { class: 'hint' }, 'Zmiana terminu jest możliwa najpóźniej 2 godziny przed spotkaniem. Zadzwoń: 883 643 565.'));
    render(card(0, body));
  }
  function askCancel(m) {
    var reason = h('textarea', { placeholder: 'Powód (opcjonalnie)', style: 'width:100%;min-height:80px;border-radius:12px;border:1.5px solid #E7E2D8;padding:12px;font:inherit' });
    var btn = h('button', { class: 'btn', type: 'button', style: 'background:#9B1C1C', onclick: function () {
      btn.disabled = true;
      api('cancel', { token: TOKEN, reason: reason.value }).then(function (r) { showManage(r.meeting, null); }).catch(function (e) { btn.disabled = false; alertBox(e.message); });
    } }, 'Tak, odwołaj spotkanie');
    render(card(0, h('div', { class: 'done' }, h('h2', null, 'Odwołać spotkanie?'), details(m), reason,
      h('div', { class: 'acts', style: 'margin-top:14px' }, h('button', { class: 'btn out', type: 'button', onclick: function () { showManage(m, null); manage(); } }, 'Wróć'), btn))));
  }
  function pickNew(m, days) {
    var keys = Object.keys(days).sort(), sel = null, day = keys[0];
    function draw() {
      var b = h('div', { class: 'done', style: 'max-width:760px' }, h('h2', null, 'Wybierz nowy termin'), h('p', { class: 'hint' }, 'Obecnie: ' + fullWhen(m.start, m.end)),
        !keys.length ? h('p', { class: 'hint' }, 'Brak wolnych terminów – zadzwoń: 883 643 565.') : [
          h('div', { class: 'slots', style: 'flex-direction:row;flex-wrap:wrap;max-height:none;justify-content:center;margin:12px 0' }, keys.slice(0, 21).map(function (k) {
            return h('button', { type: 'button', class: 'slot' + (k === day ? ' sel' : ''), style: 'padding:0 12px', onclick: function () { day = k; sel = null; draw(); } }, new Date(k + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' }));
          })),
          h('p', { class: 'lbl' }, longDay(day)),
          h('div', { class: 'slots', style: 'flex-direction:row;flex-wrap:wrap;max-height:none;justify-content:center' }, (days[day] || []).map(function (s) {
            return h('button', { type: 'button', class: 'slot' + (sel === s.start ? ' sel' : ''), style: 'min-width:84px', onclick: function () { sel = s.start; draw(); } }, s.t);
          })),
          h('div', { class: 'acts', style: 'margin-top:18px' }, h('button', { class: 'btn out', type: 'button', onclick: function () { showManage(m, days); } }, 'Wróć'),
            h('button', { class: 'btn', type: 'button', disabled: !sel, onclick: function (e) {
              e.target.disabled = true;
              api('reschedule', { token: TOKEN, start: sel }).then(function (r) { showManage(r.meeting, null); alertBox('Termin zmieniony – wysłaliśmy potwierdzenie na e-mail.'); })
                .catch(function (er) { e.target.disabled = false; alertBox(er.message); });
            } }, 'Zapisz nowy termin'))]);
      render(card(0, b));
    }
    draw();
  }

  // ---------- start ----------
  if (TOKEN) { manage(); return; }
  api('config').then(function (r) {
    cfg = r;
    if (!cfg.types || !cfg.types.length) return fail('Rezerwacja online jest chwilowo niedostępna.');
    var wantT = norm(q.get('typ')), wantA = norm(q.get('doradca'));
    if (wantT) st.type = cfg.types.filter(function (t) { return t.id === q.get('typ') || norm(t.name).indexOf(wantT) >= 0; })[0] || null;
    if (wantA) { var a = cfg.advisors.filter(function (x) { return x.id === q.get('doradca') || norm(x.name).indexOf(wantA) >= 0; })[0]; if (a) st.adv = a.id; }
    if (st.type) loadSlots(); else render(card(1, step1()));
  }).catch(function (e) { fail(e.message); });
})();
