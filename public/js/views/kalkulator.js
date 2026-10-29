// Kalkulator formy opodatkowania – JDG (skala, liniowy, ryczałt) vs sp. z o.o. (CIT, CIT estoński). Wynik poglądowy, PDF na papierze RKDP lub M2 TAX.
import { h, toast, icon, infoTip, printHtml } from '../ui.js';
import { compute, PARAMS } from '../tools/forma.js';
import { printableHtml, M2_BRAND, RKDP_BRAND, dateLong } from '../m2/order.js';

const HELP = `Kalkulator porównuje roczne obciążenia przy tym samym wyniku firmy:
• JDG na skali, liniowym i ryczałcie (wybierz stawkę właściwą dla działalności; składka zdrowotna na ryczałcie wg progów przychodu, połowa odliczana od przychodu).
• Sp. z o.o. na zwykłym CIT (9% mały podatnik / 19%) z podatkiem 19% od dywidendy oraz na CIT estońskim (ryczałt 10% / 20% przy wypłacie zysku, PIT od dywidendy pomniejszony o 90% / 70% ryczałtu).
• Przy jednym wspólniku doliczamy jego ZUS (pełne składki społeczne i składkę zdrowotną wspólnika). Przy kilku wspólnikach – bez składek (o ile nie mają innego tytułu).
• „Zostaje w spółce” to zysk niewypłacony. W CIT estońskim jest on opodatkowany dopiero przy wypłacie.
• Wynik jest poglądowy: pomija m.in. ulgi, wspólne rozliczenie z małżonkiem, wynagrodzenie zarządu, koszty niepodatkowe, ukryte zyski i warunki wejścia w CIT estoński.
• „PDF” tworzy zestawienie na papierze firmowym – możesz je przekazać klientowi.`;

const num = v => { const n = Number(String(v ?? '').replace(/[\s ]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const zl = v => (Math.round(v) || 0).toLocaleString('pl-PL') + ' zł';
const pct = v => v === null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';
const RYCZ = [['0.02', '2% – sprzedaż produktów rolnych'], ['0.03', '3% – handel, gastronomia'], ['0.055', '5,5% – produkcja, budowlanka'], ['0.085', '8,5% – usługi, najem'], ['0.1', '10% – obrót nieruchomościami'], ['0.12', '12% – usługi IT'], ['0.14', '14% – opieka zdrowotna, architektura, inżynieria'], ['0.15', '15% – usługi wymienione w ustawie'], ['0.17', '17% – wolne zawody']];

export async function renderKalkulator(main, { mod = 'rkdp' } = {}) {
  const brand = mod === 'm2' ? M2_BRAND : RKDP_BRAND;
  const d = { rok: 2026, przychod: 900000, koszty: 600000, zus: 'pelny', chor: true, wspolnicy: 2, wyplata: 1, maly: true, kosztySpolki: 0, ryczalt: 0.085, dla: '' };
  let res = compute(d);

  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('span', { class: 'small muted' }, hint) : null);
  const money = key => {
    const el = h('input', { class: 'input', inputmode: 'numeric', value: d[key].toLocaleString('pl-PL') });
    el.addEventListener('input', () => { d[key] = num(el.value); update(); });
    el.addEventListener('blur', () => { el.value = num(el.value).toLocaleString('pl-PL'); });
    return el;
  };
  const select = (key, opts, cast = v => v) => {
    const el = h('select', { class: 'select' }, ...opts.map(([v, l]) => h('option', { value: v, selected: String(d[key]) === v }, l)));
    el.addEventListener('change', () => { d[key] = cast(el.value); update(); });
    return el;
  };
  const check = (key, label) => {
    const cb = h('input', { type: 'checkbox', checked: !!d[key] });
    cb.addEventListener('change', () => { d[key] = cb.checked; update(); });
    return h('label', { class: 'check' }, cb, label);
  };
  const dla = h('input', { class: 'input', placeholder: 'np. Jan Kowalski – opcjonalnie, pojawi się w PDF' });
  dla.addEventListener('input', () => { d.dla = dla.value; });

  const form = h('section', { class: 'card section fk-form' },
    h('h2', { style: { margin: '0 0 14px' } }, 'Dane'),
    h('div', { class: 'fk-fields' },
      field('Przychód roczny (zł)', money('przychod')),
      field('Koszty roczne (zł)', money('koszty'), 'Bez wynagrodzenia właściciela i bez ZUS przedsiębiorcy.'),
      field('ZUS przedsiębiorcy (JDG)', select('zus', [['pelny', 'pełny ZUS'], ['pref', 'preferencyjny (24 mies.)'], ['start', 'ulga na start (6 mies.) + preferencyjny'], ['brak', 'brak – np. zbieg z etatem']])),
      check('chor', 'Dobrowolne ubezpieczenie chorobowe'),
      field('Stawka ryczałtu (JDG)', select('ryczalt', RYCZ, Number), 'Ryczałt liczy się od przychodu – koszty nie obniżają podatku.'),
      h('hr', { class: 'fk-hr' }),
      field('Wspólnicy spółki', select('wspolnicy', [['2', '2 lub więcej (bez ZUS wspólników)'], ['1', '1 – jedyny wspólnik płaci ZUS']], Number)),
      field('Jaką część zysku spółka wypłaca', select('wyplata', [['1', '100% – cały zysk co roku'], ['0.75', '75%'], ['0.5', '50%'], ['0.25', '25%'], ['0', '0% – reinwestuje']], Number)),
      field('Dodatkowe koszty spółki rocznie (zł)', money('kosztySpolki'), 'Np. różnica w cenie pełnej księgowości, opłaty KRS.'),
      check('maly', 'Spółka jest małym podatnikiem CIT (przychód do 2 mln euro)'),
      h('hr', { class: 'fk-hr' }),
      field('Dla kogo (do PDF)', dla)));

  const cards = h('div', { class: 'fk-cards' });
  const info = h('div', { class: 'fk-info small' });
  const table = h('div', { class: 'fk-scroll' });
  const warn = h('div');

  function update() {
    res = compute(d);
    const maxR = Math.max(...res.rows.map(r => r.naReke + r.wSpolce), 1);
    info.textContent = `Dochód przed opodatkowaniem: ${zl(res.D)} · parametry ${res.P.rok} r. (ZUS, składka zdrowotna, progi). Wartości roczne.`;
    cards.replaceChildren(...res.rows.map(r => h('article', { class: 'card fk-card' + (r.best ? ' best' : '') },
      h('div', { class: 'fk-top' }, h('b', {}, r.label), r.best ? h('span', { class: 'badge fk-badge' }, 'najkorzystniej') : null),
      h('span', { class: 'small muted' }, r.sub),
      h('span', { class: 'fk-lbl' }, 'Podatki i składki'), h('span', { class: 'fk-val' }, zl(r.obc)),
      h('span', { class: 'fk-lbl' }, 'Zostaje na rękę'), h('span', { class: 'fk-val big' }, zl(r.naReke)),
      r.wSpolce ? h('span', { class: 'small muted' }, `+ w spółce: ${zl(r.wSpolce)}`) : null,
      h('div', { class: 'fk-bar' }, h('div', { style: { width: `${Math.max(0, (r.naReke + r.wSpolce) / maxR * 100)}%` } })),
      h('span', { class: 'small muted' }, `Obciążenie: ${pct(r.stopa)} dochodu`))));
    const rows = detailRows();
    table.replaceChildren(h('table', { class: 'fk-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Pozycja'), ...res.rows.map(r => h('th', { class: 'num' }, r.label)))),
      h('tbody', {}, ...rows.map(([l, f, cls]) => h('tr', { class: cls || '' }, h('td', {}, l), ...res.rows.map(r => h('td', { class: 'num' }, f(r))))))));
    const w = [];
    if (res.D <= 0) w.push('Dochód jest zerowy lub ujemny – porównanie nie ma sensu (JDG płaci wtedy minimalne składki).');
    if (d.maly && d.przychod > 8_600_000) w.push('Przychód przekracza ok. 2 mln euro – spółka nie będzie małym podatnikiem CIT (stawka 19% / ryczałt 20%).');
    if (d.wyplata < 1) w.push('Zysk zatrzymany w spółce na CIT estońskim zostanie opodatkowany przy wypłacie – „najkorzystniej” uwzględnia go bez tego podatku.');
    warn.replaceChildren(...w.map(t => h('div', { class: 'fk-warn small' }, t)));
  }
  const dash = v => v ? zl(v) : '—';
  const detailRows = () => [
    ['Dochód przed opodatkowaniem', r => zl(r.dochod)],
    ['Dodatkowe koszty spółki', r => dash(r.koszt)],
    ['ZUS społeczny', r => dash(r.zus)],
    ['Składka zdrowotna', r => dash(r.zdr)],
    ['CIT / ryczałt spółki', r => dash(r.cit)],
    ['PIT (u wspólnika: od dywidendy)', r => dash(r.pit)],
    ['Danina solidarnościowa', r => dash(r.dan)],
    ['Podatki i składki razem', r => zl(r.obc), 'fk-sum'],
    ['Zostaje na rękę', r => zl(r.naReke), 'fk-sum'],
    ['Zostaje w spółce', r => dash(r.wSpolce)],
    ['Obciążenie dochodu', r => pct(r.stopa)],
  ];

  function blocks() {
    const P = res.P;
    const B = [
      { t: 'title', text: 'PORÓWNANIE FORM OPODATKOWANIA' },
      { t: 'meta', text: `JDG a spółka z o.o. (CIT i CIT estoński) – wyliczenie poglądowe na ${P.rok} r.${d.dla ? ` · ${d.dla}` : ''}` },
      { t: 'h', text: 'Założenia' },
      { t: 'kv', head: ['Parametr', 'Wartość'], rows: [
        ['Przychód roczny', zl(d.przychod)], ['Koszty roczne', zl(d.koszty)], ['Dochód', zl(res.D)],
        ['Stawka ryczałtu (JDG)', `${String(Math.round(d.ryczalt * 1000) / 10).replace('.', ',')}%`],
        ['ZUS przedsiębiorcy (JDG)', { pelny: 'pełny', pref: 'preferencyjny', start: 'ulga na start (6 mies.) + preferencyjny', brak: 'brak' }[d.zus] + (d.chor && d.zus !== 'brak' ? ', z chorobowym' : '')],
        ['Wspólnicy spółki', res.sole ? '1 (jedyny wspólnik płaci ZUS)' : '2 lub więcej'],
        ['Wypłata zysku ze spółki', `${Math.round(d.wyplata * 100)}%`],
        ['Mały podatnik CIT', d.maly ? 'tak' : 'nie'],
        ...(d.kosztySpolki ? [['Dodatkowe koszty spółki', zl(d.kosztySpolki)]] : []),
      ] },
      { t: 'h', text: 'Wynik' },
      { t: 'table', head: ['Pozycja', ...res.rows.map(r => r.label)], cls: ['', ...res.rows.map(() => 'num')],
        rows: detailRows().filter(([l]) => l !== 'Dodatkowe koszty spółki' || d.kosztySpolki).map(([l, f, c]) => ({ cls: c ? 'sum' : '', cells: [l, ...res.rows.map(f)] })) },
      { t: 'p', text: `Najkorzystniej w tym wariancie: ${res.rows.find(r => r.best).label}.` },
      { t: 'h', text: 'Warto wziąć pod uwagę' },
      { t: 'bullet', text: 'Koszt pełnej księgowości spółki oraz obowiązki sprawozdawcze (sprawozdanie finansowe, KRS, CRBR).' },
      { t: 'bullet', text: 'CIT estoński wymaga spełnienia warunków (m.in. wspólnicy – wyłącznie osoby fizyczne, zatrudnienie, ograniczenie przychodów pasywnych) i oznacza podatek od ukrytych zysków i wydatków niezwiązanych z działalnością.' },
      { t: 'bullet', text: 'Pieniądze w spółce należą do spółki – wypłata wymaga dywidendy, wynagrodzenia lub innego tytułu prawnego.' },
      { t: 'bullet', text: 'Przekształcenie JDG w spółkę i zmiana formy opodatkowania mają swoje terminy i skutki podatkowe – omówimy je przed decyzją.' },
      { t: 'small', text: `Wyliczenie poglądowe, nie stanowi porady podatkowej. Parametry ${P.rok} r.: pełny ZUS od podstawy 5 652 zł, minimalna składka zdrowotna ${P.zdrMin.toLocaleString('pl-PL')} zł/mies., limit odliczenia zdrowotnej przy liniowym ${P.zdrLinLimit.toLocaleString('pl-PL')} zł, składka zdrowotna jedynego wspólnika ${P.zdrWspolnik.toLocaleString('pl-PL')} zł/mies. Przygotowano ${dateLong(new Date().toISOString())}.` },
    ];
    return B;
  }
  const pdf = () => printHtml(printableHtml(blocks(), `Porownanie_form_opodatkowania${d.dla ? '_' + d.dla.replace(/[^\p{L}\p{N}]+/gu, '_') : ''}`, location.origin + brand.logo, brand));
  const share = () => import('../udostepnij.js').then(m => m.shareDialog({ kind: 'kalkulator', brand: brand.key, label: d.dla || '',
    title: `Porownanie_form_opodatkowania${d.dla ? '_' + d.dla.replace(/[^\p{L}\p{N}]+/gu, '_') : ''}`, blocks: blocks() }));
  const copy = async () => {
    const txt = res.rows.map(r => `${r.label}: podatki i składki ${zl(r.obc)}, na rękę ${zl(r.naReke)}${r.wSpolce ? `, w spółce ${zl(r.wSpolce)}` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(`Dochód ${zl(res.D)} (${res.P.rok} r., wyliczenie poglądowe)\n${txt}`); toast('Skopiowano wynik'); } catch { toast('Nie udało się skopiować', true); }
  };

  update();
  main.replaceChildren(
    h('a', { href: mod === 'm2' ? '#/doradztwo/dokumenty' : '#/dokumenty', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Dokumenty'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, `Narzędzia · ${mod === 'm2' ? 'M2 TAX' : 'RKDP'}`),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'JDG czy spółka z o.o.?', infoTip(HELP, 'Kalkulator – jak liczy')),
        h('p', { class: 'sub' }, 'Porównanie obciążeń przy tym samym dochodzie: działalność na skali, liniowym i ryczałcie, spółka na CIT i na CIT estońskim.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-outline btn-sm', onclick: copy }, 'Kopiuj wynik'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: share, 'data-tip': 'Link do podglądu wyniku dla osoby bez dostępu do aplikacji – bez logowania, tylko do odczytu' }, 'Link dla klienta'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: pdf }, icon('download'), 'PDF dla klienta'))),
    h('div', { class: 'fk-layout' }, form,
      h('div', { class: 'fk-res' }, info, warn, cards,
        h('section', { class: 'card section' }, h('h2', { style: { margin: '0 0 12px' } }, 'Szczegóły wyliczenia'), table),
        h('p', { class: 'small muted' }, `Kalkulator ma charakter poglądowy i nie stanowi porady podatkowej. Parametry na ${Object.keys(PARAMS).join(', ')} r.`))));
}
