// Oferty na usługi – RKDP i M2 TAX: domyślna treść, cenniki (z wzorów umów) i dokument PDF z szatą graficzną firmy.
import { FIRM } from '../m2/dict.js';
import { dateLong } from '../m2/order.js';

const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/\s| /g, '').replace(',', '.')); return isNaN(n) ? null : n; };
export const money = v => num(v) === null ? '' : num(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' zł';
const lines = t => String(t || '').split('\n').map(x => x.trim().replace(/^[-–•]\s*/, '')).filter(Boolean);

// ---------------- marki ----------------
export const OFFER_BRANDS = {
  rkdp: {
    key: 'rkdp', logo: '/logo-rkdp.png', name: 'RKDP spółka doradztwa podatkowego sp. z o.o.', short: 'RKDP',
    tagline: 'Doradztwo podatkowe i księgowość',
    address: 'ul. Beaty Artemskiej 11/44, 52-234 Wrocław', email: 'kancelaria@rkdp.pl', phone: FIRM.phones, web: 'www.rkdp.pl',
    foot: 'RKDP spółka doradztwa podatkowego sp. z o.o. · KRS 0000812185 · NIP 8992871126 · wpis do rejestru osób prawnych uprawnionych do doradztwa podatkowego nr 855',
    about: 'RKDP to spółka doradztwa podatkowego z biurem rachunkowym we Wrocławiu. Łączymy prowadzenie księgowości i kadr z wiedzą doradcy podatkowego – Państwa rozliczenia przygotowujemy z myślą o bezpieczeństwie podatkowym, a w razie kontroli czy pytań z urzędu reprezentujemy Państwa przed organami.',
    facts: [['Doradca podatkowy', 'usługi prowadzone pod nadzorem doradcy podatkowego (nr wpisu 15009)'], ['Nr 855', 'wpis do rejestru osób prawnych uprawnionych do doradztwa podatkowego'], ['Wszystko w jednym miejscu', 'księgowość, kadry i doradztwo podatkowe – bez pośredników']],
    why: ['Księgowość prowadzona pod nadzorem doradcy podatkowego – nie tylko księgujemy, ale też doradzamy.', 'Obsługa elektroniczna: SaldeoSMART, KSeF, e-Deklaracje, ZUS PUE – bez wożenia segregatorów.', 'Stały opiekun Państwa firmy i szybki kontakt z doradcą podatkowym.', 'Reprezentacja w czynnościach sprawdzających i kontrolach – w ramach jednego biura.', 'Obowiązkowe ubezpieczenie odpowiedzialności cywilnej doradcy podatkowego.'],
    people: ['ruszniak'],
  },
  m2: {
    key: 'm2', logo: '/m2tax-logo.png', name: FIRM.name, short: 'M2 TAX',
    tagline: 'Doradcy Podatkowi',
    address: FIRM.address, email: FIRM.email, phone: FIRM.phones, web: FIRM.web,
    foot: `${FIRM.name} · KRS ${FIRM.krs} · NIP ${FIRM.nip} · REGON ${FIRM.regon}`,
    about: 'M2 TAX to kancelaria doradztwa podatkowego założona przez doradców podatkowych Marcina Otrębę i Michała Ruszniaka. Każdą sprawą zajmuje się dwóch doradców podatkowych, dzięki czemu Państwa sprawy prowadzone są z podwójną kontrolą jakości – od bieżących konsultacji, przez interpretacje i opinie, po postępowania, kontrole oraz spory przed sądami administracyjnymi.',
    facts: [['2 doradców', 'przy każdej sprawie – podwójna kontrola jakości'], ['Nr 14609 i 15009', 'doradcy podatkowi wpisani na listę Krajowej Izby Doradców Podatkowych'], ['Od porady do NSA', 'konsultacje, interpretacje, kontrole, postępowania, WSA i NSA']],
    why: ['Każdą sprawą zajmuje się dwóch doradców podatkowych.', 'Doświadczenie w postępowaniach podatkowych, kontrolach i sporach przed WSA i NSA.', 'Jasne zasady wynagrodzenia – abonament, ryczałt albo stawka godzinowa, bez niespodzianek.', 'Współpraca z Państwa księgową lub działem księgowości – nie musicie zmieniać biura.', 'Obowiązkowe ubezpieczenie odpowiedzialności cywilnej doradców podatkowych.'],
    people: ['otreba', 'ruszniak'],
  },
};
export const PEOPLE = {
  ruszniak: { name: 'Michał Ruszniak', initials: 'MR', role: { rkdp: 'Prezes Zarządu · doradca podatkowy nr 15009', m2: 'Partner zarządzający · doradca podatkowy nr 15009' },
    bio: 'Członek zarządu Dolnośląskiego Oddziału Krajowej Izby Doradców Podatkowych, wykładowca Uniwersytetu DSW we Wrocławiu, prelegent ogólnopolskich konferencji naukowych poświęconych postępowaniom podatkowym. Specjalizuje się w obsłudze małych i średnich firm oraz firm rodzinnych; jako pełnomocnik reprezentuje klientów przed organami podatkowymi i sądami administracyjnymi.' },
  otreba: { name: 'Marcin Otręba', initials: 'MO', role: { m2: 'Partner zarządzający · doradca podatkowy nr 14609', rkdp: 'doradca podatkowy nr 14609' },
    bio: 'Doradca podatkowy, zastępca rzecznika dyscyplinarnego Krajowej Izby Doradców Podatkowych. Prowadzi sprawy z zakresu postępowań podatkowych, kontroli i doradztwa dla przedsiębiorców.' },
};

// ---------------- usługi: zakres i cennik (wg wzorów umów) ----------------
export const BOOK_FORMS = { kpir: 'Podatkowa księga przychodów i rozchodów (KPiR)', ryczalt: 'Ewidencja przychodów (ryczałt)', ksiegi: 'Księgi rachunkowe (pełna księgowość)' };
const SCOPE_BOOK = {
  kpir: ['prowadzenie podatkowej księgi przychodów i rozchodów', 'ewidencja środków trwałych i wartości niematerialnych i prawnych wraz z amortyzacją', 'ustalanie miesięcznych lub kwartalnych zaliczek na podatek dochodowy', 'roczne zeznanie PIT z załącznikami oraz spis z natury (remanent)', 'rozliczenia VAT: deklaracje VAT, VAT-UE i JPK_V7', 'przesyłanie JPK_PIT', 'korekty deklaracji PIT i VAT sporządzonych przez nas'],
  ryczalt: ['prowadzenie ewidencji przychodów', 'ewidencja środków trwałych i wartości niematerialnych i prawnych', 'obliczanie ryczałtu od przychodów ewidencjonowanych – wpłaty miesięczne lub kwartalne', 'roczne zeznanie PIT-28 z załącznikami oraz spis z natury (remanent)', 'rozliczenia VAT: deklaracje VAT, VAT-UE i JPK_V7', 'przesyłanie JPK_PIT', 'korekty deklaracji PIT i VAT sporządzonych przez nas'],
  ksiegi: ['prowadzenie ksiąg rachunkowych zgodnie z ustawą o rachunkowości', 'ewidencja środków trwałych i wartości niematerialnych i prawnych wraz z amortyzacją', 'ustalanie zaliczek i roczne zeznanie CIT', 'roczne sprawozdanie finansowe (bilans, rachunek zysków i strat, informacja dodatkowa)', 'rozliczenia VAT: deklaracje VAT, VAT-UE i JPK_V7', 'przesyłanie JPK_CIT', 'korekty deklaracji CIT i VAT sporządzonych przez nas'],
};
const SCOPE_HR = ['zgłoszenia, zmiany i wyrejestrowania w ZUS (płatnik, pracownicy, zleceniobiorcy)', 'miesięczne listy płac pracowników i zleceniobiorców', 'rozliczenia RMUA dla pracowników', 'deklaracje PIT-4R, PIT-11 i PIT-8AR', 'deklaracje rozliczeniowe ZUS wysyłane elektronicznie', 'rozliczanie umów o dzieło'];
const SCOPE_TAX = {
  m2: ['bieżące konsultacje podatkowe – telefonicznie, e-mailowo i na spotkaniach', 'opinie i analizy podatkowe planowanych transakcji i decyzji biznesowych', 'wnioski o interpretacje indywidualne oraz wiążące informacje stawkowe (WIS)', 'reprezentacja w czynnościach sprawdzających, kontrolach podatkowych i celno-skarbowych', 'postępowania podatkowe, odwołania oraz skargi do WSA i skargi kasacyjne do NSA', 'planowanie podatkowe i wybór optymalnej formy opodatkowania', 'współpraca z Państwa księgową lub działem księgowości'],
  rkdp: ['bieżące konsultacje z doradcą podatkowym', 'opinie podatkowe dotyczące planowanych transakcji', 'wybór formy opodatkowania i planowanie podatkowe', 'wnioski o interpretacje indywidualne', 'reprezentacja przed urzędem skarbowym i ZUS – czynności sprawdzające i kontrole', 'pisma, wyjaśnienia i odwołania w sprawach podatkowych'],
};

export function serviceDefaults(kind, brand, o = {}) {
  if (kind === 'ksiegowosc') {
    const f = o.form || 'kpir';
    return { on: true, form: f, scope: SCOPE_BOOK[f].join('\n'), rows: [
      { label: `Abonament – ${BOOK_FORMS[f].replace(/ \(.*\)$/, '').toLowerCase()}`, desc: 'do 30 dokumentów księgowych w miesiącu', price: '', unit: 'zł netto / mies.', qty: 1, sum: true },
      { label: 'Dokument ponad limit abonamentu', desc: '', price: '', unit: 'zł netto / szt.', qty: 1, sum: false },
      { label: f === 'ksiegi' ? 'Roczne sprawozdanie finansowe' : 'Roczne zeznanie podatkowe (PIT)', desc: 'raz w roku, na zakończenie roku', price: '', unit: 'zł netto / rok', qty: 1, sum: false },
    ] };
  }
  if (kind === 'kadry') return { on: true, scope: SCOPE_HR.join('\n'), rows: [
    { label: 'Obsługa kadrowo-płacowa', desc: 'za 1 tytuł zatrudnienia (pracownik lub zleceniobiorca)', price: '', unit: 'zł netto / os. / mies.', qty: 1, sum: true },
  ] };
  if (kind === 'doradztwo') return { on: true, scope: SCOPE_TAX[brand].join('\n'), rows: brand === 'm2' ? [
    { label: 'Pakiet „Doradztwo podatkowe”', desc: 'do 2 godzin pracy doradców w miesiącu', price: '', unit: 'zł netto / mies.', qty: 1, sum: true },
    { label: 'Pakiet „Doradztwo podatkowe + Wsparcie Twojej księgowości”', desc: 'pakiet doradczy wraz ze współpracą z Państwa księgową', price: '', unit: 'zł netto / mies.', qty: 1, sum: false },
    { label: 'Konsultacje i opinie poza pakietem', desc: 'rozliczane co do 15 minut, na podstawie zestawienia czynności', price: '500', unit: 'zł netto / h', qty: 1, sum: false },
    { label: 'Postępowania, kontrole, WSA i NSA', desc: 'ryczałt lub stawka godzinowa – po zapoznaniu się ze sprawą', price: '', unit: 'wycena indywidualna', qty: 1, sum: false },
  ] : [
    { label: 'Doradztwo podatkowe', desc: 'konsultacje, opinie i pisma – rozliczane co do 15 minut', price: '300', unit: 'zł netto / h', qty: 1, sum: false },
    { label: 'Abonament doradczy', desc: 'stały dostęp do doradcy podatkowego, do 2 godzin w miesiącu', price: '', unit: 'zł netto / mies.', qty: 1, sum: false },
    { label: 'Reprezentacja przed organami', desc: 'czynności sprawdzające, kontrole i postępowania podatkowe', price: '', unit: 'wycena indywidualna', qty: 1, sum: false },
  ] };
  return null;
}

export function offerDefaults(brand, client = {}) {
  const d = new Date(), valid = new Date(); valid.setDate(d.getDate() + 30);
  const iso = x => x.toISOString().slice(0, 10);
  const services = brand === 'm2' ? { doradztwo: serviceDefaults('doradztwo', brand) } : { ksiegowosc: serviceDefaults('ksiegowosc', brand), kadry: { ...serviceDefaults('kadry', brand), on: false }, doradztwo: { ...serviceDefaults('doradztwo', brand), on: false } };
  return {
    client: { name: client.name || '', nip: client.nip || '', address: client.address || '', person: client.contact_person || '', email: client.email || '' },
    offer_date: iso(d), valid_until: iso(valid),
    title: '', intro: '', greeting: 'Szanowni Państwo,',
    services, extras: [],
    terms: defaultTerms(brand),
    signers: OFFER_BRANDS[brand].people.slice(),
    contact_person: '', show_team: true, show_why: true, show_steps: true,
  };
}
export function defaultTerms(brand) {
  return [
    'Ceny podane są w kwotach netto – doliczamy do nich podatek VAT 23%.',
    'Wynagrodzenie płatne jest miesięcznie, w terminie 7 dni od wystawienia faktury.',
    brand === 'm2' ? 'Szczegółowe zasady współpracy określa umowa o świadczenie usług doradztwa podatkowego wraz z pełnomocnictwem.' : 'Współpraca na podstawie umowy zawartej na czas nieokreślony, z miesięcznym okresem wypowiedzenia.',
    'Dokumenty przekazują Państwo elektronicznie – przez SaldeoSMART, KSeF lub e-mail.',
    'Wynagrodzenie podlega corocznej waloryzacji o średnioroczny wskaźnik cen towarów i usług konsumpcyjnych (GUS).',
  ].join('\n');
}

const SERVICE_TITLE = { ksiegowosc: 'Księgowość', kadry: 'Kadry i płace', doradztwo: 'Doradztwo podatkowe' };
const SERVICE_ORDER = ['doradztwo', 'ksiegowosc', 'kadry'];
export const activeServices = o => SERVICE_ORDER.filter(k => o.services?.[k]?.on);
export function autoTitle(o) {
  const a = activeServices(o).map(k => SERVICE_TITLE[k].toLowerCase());
  if (!a.length) return 'Oferta współpracy';
  const t = a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' oraz ' + a[a.length - 1];
  return t[0].toUpperCase() + t.slice(1);
}
export function autoIntro(o, brand) {
  const a = activeServices(o).map(k => SERVICE_TITLE[k].toLowerCase());
  const what = a.length ? (a.length === 1 ? a[0] : a.slice(0, -1).join(', ') + ' oraz ' + a[a.length - 1]) : 'obsługi Państwa firmy';
  return `Dziękujemy za zainteresowanie współpracą z ${brand === 'm2' ? 'M2 TAX Doradcy Podatkowi' : 'RKDP'}. Z przyjemnością przedstawiamy propozycję w zakresie: ${what}.\n\nW kolejnych częściach znajdą Państwo zakres usług, wynagrodzenie oraz zasady współpracy. Ofertę chętnie dopasujemy do specyfiki Państwa działalności – wystarczy krótka rozmowa.`;
}
export function monthlyEstimate(o) {
  let sum = 0, any = false;
  for (const k of activeServices(o)) for (const r of o.services[k].rows || []) if (r.sum && num(r.price) !== null) { sum += num(r.price) * (num(r.qty) || 1); any = true; }
  for (const r of o.extras || []) if (r.sum && num(r.price) !== null) { sum += num(r.price) * (num(r.qty) || 1); any = true; }
  return any ? Math.round(sum * 100) / 100 : null;
}

// ---------------- dokument ----------------
const ICON_CHECK = '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function offerHtml(o, brandKey, { number = '', origin = location.origin } = {}) {
  const B = OFFER_BRANDS[brandKey];
  const title = (o.title || '').trim() || autoTitle(o);
  const services = activeServices(o);
  const est = monthlyEstimate(o);
  const people = (o.signers || []).map(k => PEOPLE[k]).filter(Boolean);
  const priceCell = r => num(r.price) === null ? '<span class="tbd">do uzgodnienia</span>' : `<b>${esc(money(r.price))}</b>`;
  const unitCell = r => esc(String(r.unit || '').replace(/^zł netto\s*/, 'netto '));
  const rowHtml = r => `<tr><td><div class="pl">${esc(r.label)}${num(r.qty) > 1 ? ` <span class="qty">× ${esc(r.qty)}</span>` : ''}</div>${r.desc ? `<div class="pd">${esc(r.desc)}</div>` : ''}</td><td class="pr">${priceCell(r)}</td><td class="pu">${unitCell(r)}</td></tr>`;
  const groups = [...services.map(k => [SERVICE_TITLE[k], o.services[k].rows || []]), ...(o.extras?.length ? [['Dodatkowo', o.extras]] : [])].filter(([, rows]) => rows.some(r => r.label));
  const n2 = i => String(i + 1).padStart(2, '0');

  const cover = `
<section class="cover">
  <svg class="orn" viewBox="0 0 600 600" aria-hidden="true"><g fill="none" stroke="#C9A877" stroke-width="1.2" opacity=".55">
    <circle cx="470" cy="130" r="210"/><circle cx="470" cy="130" r="160"/><circle cx="470" cy="130" r="110" opacity=".6"/>
    <path d="M60 520 L560 20" opacity=".35"/></g></svg>
  <div class="cv-top"><img class="cv-logo" src="${origin}${B.logo}" alt="${esc(B.short)}"><div class="cv-meta">OFERTA${number ? ` <b>${esc(number)}</b>` : ''}<br>${esc(dateLong(o.offer_date))}</div></div>
  <div class="cv-mid">
    <div class="eyebrow">Oferta współpracy</div>
    <h1>${esc(title)}</h1>
    <div class="cv-rule"></div>
    <div class="cv-for">przygotowana dla</div>
    <div class="cv-client">${esc(o.client?.name || '……………………')}</div>
    <div class="cv-cl2">${esc([o.client?.nip ? `NIP ${o.client.nip}` : '', o.client?.address].filter(Boolean).join(' · '))}</div>
    ${services.length ? `<div class="cv-chips">${services.map(k => `<span>${esc(SERVICE_TITLE[k])}</span>`).join('')}</div>` : ''}
    ${est !== null ? `<div class="cv-est"><span>Szacunkowy koszt miesięczny</span><b>${esc(money(est))} netto</b></div>` : ''}
  </div>
  <div class="cv-band">
    <div class="cv-col"><span>Przygotował${people.length > 1 ? 'i' : ''}</span>${people.map(p => `<b>${esc(p.name)}</b><em>${esc(p.role[brandKey])}</em>`).join('')}</div>
    <div class="cv-col"><span>Kontakt</span><b>${esc(B.phone)}</b><em>${esc(B.email)} · ${esc(B.web)}</em><em>${esc(B.address)}</em></div>
    <div class="cv-col"><span>Oferta ważna do</span><b>${esc(dateLong(o.valid_until))}</b><em>${esc(B.name)}</em></div>
  </div>
</section>`;

  const letter = `
<section class="blk letter">
  <div class="eyebrow">${esc(B.short)} · ${esc(B.tagline)}</div>
  <h2>${esc(o.greeting || 'Szanowni Państwo,')}</h2>
  ${lines((o.intro || '').trim() || autoIntro(o, brandKey)).map(p => `<p>${esc(p)}</p>`).join('')}
  ${est !== null ? `<div class="est"><div><span>Szacunkowy koszt miesięczny</span><b>${esc(money(est))} netto</b><em>${esc(money(est * 1.23))} brutto · według pozycji oznaczonych w cenniku</em></div></div>` : ''}
</section>`;

  const about = `
<section class="blk">
  <div class="sec-h"><span class="sec-n">${n2(0)}</span><h2>O nas</h2></div>
  <p class="lead">${esc(B.about)}</p>
  <div class="facts">${B.facts.map(([a, b]) => `<div class="fact"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div>
  ${o.show_team !== false ? `<div class="team">${people.map(p => `<div class="person"><div class="av">${esc(p.initials)}</div><div><b>${esc(p.name)}</b><em>${esc(p.role[brandKey])}</em><p>${esc(p.bio)}</p></div></div>`).join('')}</div>` : ''}
</section>`;

  let sec = 1;
  const scope = services.length ? `
<section class="blk">
  <div class="sec-h"><span class="sec-n">${n2(sec++)}</span><h2>Zakres usług</h2></div>
  ${services.map(k => {
    const s = o.services[k];
    const sub = k === 'ksiegowosc' ? BOOK_FORMS[s.form] : '';
    return `<div class="svc"><h3>${esc(SERVICE_TITLE[k])}${sub ? `<span>${esc(sub)}</span>` : ''}</h3><ul class="checks">${lines(s.scope).map(x => `<li><i>${ICON_CHECK}</i>${esc(x)}</li>`).join('')}</ul></div>`;
  }).join('')}
</section>` : '';

  const prices = groups.length ? `
<section class="blk">
  <div class="sec-h"><span class="sec-n">${n2(sec++)}</span><h2>Wynagrodzenie</h2></div>
  <table class="prices"><thead><tr><th>Usługa</th><th class="pr">Cena</th><th class="pu">Jednostka</th></tr></thead>
  <tbody>${groups.map(([g, rows]) => `<tr class="grp"><td colspan="3">${esc(g)}</td></tr>${rows.filter(r => r.label).map(rowHtml).join('')}`).join('')}</tbody></table>
  ${est !== null ? `<div class="est est-inline"><div><span>Szacunkowy koszt miesięczny</span><b>${esc(money(est))} netto</b><em>${esc(money(est * 1.23))} brutto · suma pozycji miesięcznych</em></div></div>` : ''}
</section>` : '';

  const terms = `
<section class="blk keep">
  <div class="sec-h"><span class="sec-n">${n2(sec++)}</span><h2>Warunki współpracy</h2></div>
  <ul class="dots">${lines(o.terms).map(x => `<li>${esc(x)}</li>`).join('')}<li>Oferta jest ważna do ${esc(dateLong(o.valid_until))}.</li></ul>
</section>`;

  const why = o.show_why !== false ? `
<section class="blk keep">
  <div class="sec-h"><span class="sec-n">${n2(sec++)}</span><h2>Dlaczego ${esc(B.short)}</h2></div>
  <div class="why">${B.why.map((x, i) => `<div class="why-i"><span>${i + 1}</span><p>${esc(x)}</p></div>`).join('')}</div>
</section>` : '';

  const steps = o.show_steps !== false ? `
<section class="blk keep">
  <div class="sec-h"><span class="sec-n">${n2(sec++)}</span><h2>Jak zaczynamy</h2></div>
  <div class="steps">
    <div class="step"><span>1</span><b>Akceptacja oferty</b><p>Wystarczy odpowiedź e-mailem lub telefon – ustalimy datę rozpoczęcia współpracy.</p></div>
    <div class="step"><span>2</span><b>Umowa i pełnomocnictwa</b><p>Przygotujemy umowę oraz pełnomocnictwa (UPL-1, ZUS PEL${brandKey === 'm2' ? ', PPS-1' : ''}) do podpisu.</p></div>
    <div class="step"><span>3</span><b>Start obsługi</b><p>${services.includes('ksiegowosc') ? 'Przekazują nam Państwo dokumenty, a my przejmujemy księgowość od pierwszego uzgodnionego miesiąca.' : 'Omawiamy sprawę i od razu przystępujemy do działania.'}</p></div>
  </div>
</section>` : '';

  const close = `
<section class="blk keep closing">
  <p class="lead">Zapraszamy do współpracy. Chętnie odpowiemy na pytania i spotkamy się, aby omówić szczegóły.</p>
  <div class="signs">${people.map(p => `<div class="sign"><div class="sig-line"></div><b>${esc(p.name)}</b><em>${esc(p.role[brandKey])}</em></div>`).join('')}</div>
  <div class="contact"><div><span>Telefon</span><b>${esc(B.phone)}</b></div><div><span>E-mail</span><b>${esc(B.email)}</b></div><div><span>Biuro</span><b>${esc(B.address)}</b></div><div><span>Strona</span><b>${esc(B.web)}</b></div></div>
</section>`;

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(`Oferta ${number || ''} ${o.client?.name || ''}`.trim())}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<style>${OFFER_CSS.replace('__FOOT__', esc(B.foot).replace(/"/g, "'"))}</style></head>
<body><div class="doc ${brandKey}">${cover}
<table class="flow"><thead><tr><td><div class="run"><img src="${origin}${B.logo}" alt=""><span>Oferta${number ? ` ${esc(number)}` : ''} · ${esc(o.client?.name || '')}</span></div></td></tr></thead>
<tbody><tr><td>${letter}${about}${scope}${prices}${terms}${why}${steps}${close}</td></tr></tbody></table></div></body></html>`;
}

const OFFER_CSS = `
@page{size:A4;margin:16mm 17mm 18mm;
  @bottom-left{content:"__FOOT__";font:6.5pt Montserrat,Arial,sans-serif;color:#9A9085;vertical-align:top;padding-top:4mm;border-top:.4pt solid #E3D9CA;width:150mm}
  @bottom-right{content:counter(page) " / " counter(pages);font:7pt Montserrat,Arial,sans-serif;color:#9A9085;vertical-align:top;padding-top:4mm;border-top:.4pt solid #E3D9CA}}
@page cover{margin:0;@bottom-left{content:none;border:0}@bottom-right{content:none;border:0}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:Montserrat,Arial,sans-serif;color:#2B2722;font-size:9.6pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-family:'Plus Jakarta Sans',Montserrat,Arial,sans-serif;color:#1D1A16;letter-spacing:-.02em;margin:0}
p{margin:0 0 7pt}
.eyebrow{font-size:7.5pt;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#7A5A37}
/* okładka */
.cover{page:cover;position:relative;width:210mm;height:297mm;overflow:hidden;background:#F8F5F0;break-after:page;display:flex;flex-direction:column}
.cover .orn{position:absolute;right:-40mm;top:-30mm;width:190mm;height:190mm}
.cv-top{position:relative;display:flex;justify-content:space-between;align-items:flex-start;padding:20mm 20mm 0}
.cv-logo{height:21mm;width:auto}
.m2 .cv-logo{height:19mm}
.cv-meta{text-align:right;font-size:8pt;letter-spacing:.14em;color:#7A5A37;line-height:1.8}
.cv-meta b{color:#1D1A16;letter-spacing:.06em}
.cv-mid{position:relative;flex:1;padding:42mm 20mm 0}
.cv-mid h1{font-size:33pt;line-height:1.05;font-weight:800;margin:6mm 0 0;max-width:150mm}
.cv-rule{width:26mm;height:1.6mm;background:linear-gradient(90deg,#B08D57,#E2C49A);margin:10mm 0 9mm;border-radius:1mm}
.cv-for{font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:#8A7F72}
.cv-client{font-family:'Plus Jakarta Sans',Montserrat,sans-serif;font-size:19pt;font-weight:700;color:#1D1A16;margin-top:2.5mm;max-width:160mm;line-height:1.2}
.cv-cl2{font-size:9pt;color:#6A6157;margin-top:2mm}
.cv-chips{display:flex;flex-wrap:wrap;gap:2.5mm;margin-top:12mm}
.cv-chips span{border:.7pt solid #C9A877;color:#5C4228;border-radius:20mm;padding:1.6mm 4.5mm;font-size:8.5pt;font-weight:600;background:#fff}
.cv-est{margin-top:9mm}
.cv-est span{display:block;font-size:7.5pt;letter-spacing:.2em;text-transform:uppercase;color:#8A7F72}
.cv-est b{font-family:'Plus Jakarta Sans',sans-serif;font-size:17pt;color:#1D1A16}
.cv-band{position:relative;background:#1D1A16;color:#CFC6B9;display:grid;grid-template-columns:1.25fr 1.25fr 1fr;gap:9mm;padding:13mm 20mm 16mm;border-top:1.4mm solid #C9A877}
.cv-col span{display:block;font-size:7pt;letter-spacing:.2em;text-transform:uppercase;color:#C9A877;margin-bottom:2.5mm}
.cv-col b{display:block;color:#F8F5F0;font-size:10pt;font-weight:600;margin-top:1mm}
.cv-col em{display:block;font-style:normal;font-size:7.8pt;color:#CFC6B9;line-height:1.5}
/* treść */
table.flow{width:100%;border-collapse:collapse}table.flow td{padding:0}
.run{display:flex;justify-content:space-between;align-items:center;padding-bottom:3mm;margin-bottom:7mm;border-bottom:.5pt solid #E3D9CA}
.run img{height:7.5mm;width:auto}
.run span{font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:#9A9085}
.blk{margin:0 0 9mm}
.keep{break-inside:avoid}
.letter h2{font-size:15pt;margin:3mm 0 4mm}
.letter p{font-size:10pt;line-height:1.65;color:#3B362F}
.sec-h{display:flex;align-items:baseline;gap:4mm;margin:0 0 4mm;padding-top:1mm;break-after:avoid}
.sec-n{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:11pt;color:#C9A877}
.sec-h h2{font-size:16pt}
.lead{font-size:10pt;color:#3B362F;line-height:1.65}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:5mm 0}
.fact{background:#F8F5F0;border-top:1mm solid #C9A877;padding:4mm 4.5mm;border-radius:0 0 2mm 2mm}
.fact b{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:12pt;color:#1D1A16;line-height:1.2;margin-bottom:1.5mm}
.fact span{font-size:8pt;color:#6A6157;line-height:1.45}
.team{display:grid;gap:4mm;margin-top:5mm}
.person{display:grid;grid-template-columns:14mm 1fr;gap:5mm;align-items:start;padding:4mm 0;border-top:.5pt solid #E3D9CA;break-inside:avoid}
.person .av{width:14mm;height:14mm;border-radius:50%;background:#1D1A16;color:#E2C49A;display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:10.5pt}
.person b{font-size:10.5pt;color:#1D1A16}
.person em{display:block;font-style:normal;font-size:8pt;color:#7A5A37;font-weight:600;margin:.5mm 0 1.5mm}
.person p{font-size:8.6pt;color:#4A433B;margin:0}
.svc{margin:0 0 6mm;break-inside:avoid}
.svc h3{font-size:11.5pt;margin:0 0 2.5mm;display:flex;align-items:baseline;gap:3mm;flex-wrap:wrap}
.svc h3 span{font-family:Montserrat,sans-serif;font-size:8pt;font-weight:500;color:#7A5A37;letter-spacing:.02em}
ul.checks{list-style:none;margin:0;padding:0;columns:2;column-gap:8mm}
ul.checks li{break-inside:avoid;display:flex;gap:2.5mm;align-items:flex-start;margin:0 0 2mm;font-size:9pt;line-height:1.45}
ul.checks i{flex:none;width:4.4mm;height:4.4mm;border-radius:50%;background:#F3E6D2;color:#7A5A37;display:flex;align-items:center;justify-content:center;margin-top:.4mm}
table.prices{width:100%;border-collapse:collapse;font-size:9.2pt}
table.prices th{font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:#7A5A37;text-align:left;padding:0 3mm 2.5mm;border-bottom:.8pt solid #1D1A16}
table.prices td{padding:3mm;border-bottom:.5pt solid #E3D9CA;vertical-align:top}
table.prices tr{break-inside:avoid}
table.prices tr.grp td{background:#F8F5F0;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:9.5pt;color:#1D1A16;padding:2.2mm 3mm;border-bottom:0}
table.prices .pl{font-weight:600;color:#1D1A16}
table.prices .pd{font-size:8pt;color:#6A6157;margin-top:.6mm}
table.prices .qty{font-weight:500;color:#7A5A37}
table.prices .pr{text-align:right;white-space:nowrap;width:30mm}
table.prices .pu{white-space:nowrap;width:34mm;color:#6A6157;font-size:8.2pt}
table.prices .pr b{font-size:10.5pt;color:#1D1A16}
.tbd{font-style:italic;color:#8A7F72;font-size:8.5pt}
.est{margin:5mm 0 0;display:flex}
.est>div{background:#1D1A16;color:#CFC6B9;border-radius:2.5mm;padding:4.5mm 6mm;border-left:1.4mm solid #C9A877}
.est span{display:block;font-size:7pt;letter-spacing:.2em;text-transform:uppercase;color:#C9A877}
.est b{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:16pt;color:#F8F5F0;margin:1mm 0}
.est em{font-style:normal;font-size:8pt}
.est-inline{justify-content:flex-end}
ul.dots{margin:0;padding:0;list-style:none}
ul.dots li{position:relative;padding-left:6mm;margin:0 0 2mm;font-size:9.2pt}
ul.dots li::before{content:"";position:absolute;left:1mm;top:2.1mm;width:1.8mm;height:1.8mm;border-radius:50%;background:#C9A877}
.why{display:grid;grid-template-columns:1fr 1fr;gap:3mm 7mm}
.why-i{display:flex;gap:3mm;align-items:flex-start}
.why-i span{flex:none;width:6.5mm;height:6.5mm;border-radius:50%;border:.8pt solid #C9A877;color:#7A5A37;font-weight:700;font-size:8pt;display:flex;align-items:center;justify-content:center}
.why-i p{font-size:9pt;margin:.6mm 0 0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}
.step{background:#F8F5F0;border-radius:2.5mm;padding:5mm}
.step span{display:inline-flex;width:8mm;height:8mm;border-radius:50%;background:#1D1A16;color:#E2C49A;align-items:center;justify-content:center;font-weight:700;font-size:9pt;margin-bottom:3mm}
.step b{display:block;font-size:9.8pt;color:#1D1A16;margin-bottom:1.5mm}
.step p{font-size:8.4pt;color:#4A433B;margin:0}
.closing{margin-top:6mm;padding-top:6mm;border-top:.5pt solid #E3D9CA}
.signs{display:flex;gap:16mm;margin:14mm 0 8mm}
.sign{min-width:60mm}
.sig-line{border-top:.6pt solid #2B2722;margin-bottom:2mm}
.sign b{display:block;font-size:9.6pt}
.sign em{font-style:normal;font-size:8pt;color:#6A6157}
.contact{display:grid;grid-template-columns:repeat(4,auto);gap:6mm;background:#F8F5F0;border-radius:2.5mm;padding:4.5mm 5.5mm}
.contact span{display:block;font-size:6.8pt;letter-spacing:.18em;text-transform:uppercase;color:#7A5A37;margin-bottom:.8mm}
.contact b{font-size:8.6pt;font-weight:600;color:#1D1A16}
@media screen{body{background:#E9E3D8}.doc{max-width:210mm;margin:0 auto;background:#fff}.flow{padding:0 17mm}}
`;
