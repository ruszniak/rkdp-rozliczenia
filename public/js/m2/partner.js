// Program Partner M2 TAX: umowa o stałą obsługę doradczą biura rachunkowego (usługi świadczą wyłącznie doradcy podatkowi).
// Pakiety (Biuro Baza / Partner / Plus) i ich cechy pochodzą z ofert (offers/offer.js → partnerPackages), więc umowa
// zawsze zgadza się z ofertą. Dokument: PDF z tekstem, Word, wysyłka do podpisu przez link (podpisy.js).
import { h, toast, fail, icon, modal } from '../ui.js';
import { sb } from '../store.js';
import { M2_BRAND, dateLong, signerAcc, signerCap, defaultClientParty, orderDocumentXml, orderHtml, ORDER_CSS, buildOrderDocx } from './order.js';
import { FIRM } from './dict.js';
import { partnerPackages, PARTNER_FEATURES } from '../offers/offer.js';
import { sendForSignature, signPanel, previewDoc } from '../podpisy.js';

const P = '[……]';
const isoToday = () => new Date().toLocaleDateString('sv-SE');
const firstOfNextMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('sv-SE'); };
const zl = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł' : P; };
const pct = v => String(v ?? '').trim() ? String(v).replace(/\s*%?\s*$/, '') + '%' : P;

export function partnerDefaults(client = {}, pkgKey = 'partner', pkgObj = null) {
  const pk = pkgObj?.f ? pkgObj : partnerPackages().find(p => p.key === pkgKey) || partnerPackages()[1];
  return {
    date: isoToday(), start: firstOfNextMonth(), pkg: pk.key,
    price: pk.price, hours: pk.f.hours, channels: pk.f.channels, response: pk.f.response, rollover: !!pk.f.rollover,
    implement: pk.f.implement, two: !!pk.f.two, discount: String(pk.f.discount || '').replace('%', ''),
    over_rate: '400', pay_day: '7', reps: client.contact_person || '', party: defaultClientParty(client) || '', signers: [],
  };
}
const applyPkg = (d, key) => { const pk = partnerPackages().find(p => p.key === key); if (!pk) return; Object.assign(d, { pkg: key, price: pk.price, hours: pk.f.hours, channels: pk.f.channels, response: pk.f.response, rollover: !!pk.f.rollover, implement: pk.f.implement, two: !!pk.f.two, discount: String(pk.f.discount || '').replace('%', '') }); };

export function partnerContractBlocks(d, client = {}, signers = []) {
  const pk = partnerPackages().find(p => p.key === d.pkg) || { name: P };
  const sg = signers.length ? signers : [{ full_name: P, license_no: P }];
  const reps = String(d.reps || '').split('\n').map(x => x.trim()).filter(Boolean);
  const extra = String(d.channels || '').split(',').map(x => x.trim()).filter(x => x && !/aplikacj|rdp\.app|e-mail|pisemnie/i.test(x));
  const B = [];
  let s = 0, n = 0;
  const sec = t => { B.push({ t: 'h', text: `§ ${++s}. ${t}` }); n = 0; };
  const ust = (text, k) => { B.push({ t: 'ust', n: `${++n}.`, text }); (k || []).forEach((x, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: x })); };
  const intro = text => B.push({ t: 'intro', text });

  B.push({ t: 'title', text: 'UMOWA O STAŁĄ OBSŁUGĘ DORADCZĄ BIURA RACHUNKOWEGO' });
  B.push({ t: 'meta', text: `Program Partner M2 TAX – pakiet „${pk.name}”` });
  intro('zawarta we Wrocławiu z dniem złożenia pierwszego podpisu pod Umową (dalej: Umowa) pomiędzy:');
  intro(`${FIRM.name} ${FIRM.seat}, wpisaną do rejestru przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez ${FIRM.court}, pod nr KRS ${FIRM.krs}, NIP ${FIRM.nip}, REGON ${FIRM.regon}, reprezentowaną przez:`);
  sg.forEach(x => B.push({ t: 'bullet', text: signerAcc(x) + ',' }));
  intro('zwaną dalej Kancelarią,');
  B.push({ t: 'center', text: 'a' });
  const party = (d.party || defaultClientParty(client) || P).trim().replace(/[,.\s]+$/, '');
  intro(client.kind === 'osoba' ? `${party},` : `${party}, reprezentowaną przez ${reps.length ? reps.join(' oraz ') : P},`);
  intro('prowadzącą biuro rachunkowe, zwaną dalej Biurem,');
  intro('łącznie zwanymi Stronami, a każda z osobna Stroną.');
  intro('Strony zawierają Umowę na podstawie art. 734 i n. w zw. z art. 750 Kodeksu cywilnego oraz ustawy z dnia 5 lipca 1996 r. o doradztwie podatkowym.');

  sec('Przedmiot Umowy');
  ust('Kancelaria zobowiązuje się świadczyć na rzecz Biura stałą obsługę doradczą w zakresie doradztwa podatkowego, w sprawach związanych z działalnością Biura i obsługą jego klientów (dalej: Usługi), w szczególności:', [
    'udzielanie pracownikom Biura porad i konsultacji podatkowych,',
    'udzielanie pisemnych odpowiedzi i wyjaśnień z podstawą prawną, przeznaczonych do dokumentacji sprawy w Biurze,',
    'sporządzanie opinii podatkowych dotyczących zdarzeń i transakcji klientów Biura,',
    `wsparcie przy wdrożeniach u klientów Biura (np. JPK CIT, KSeF) – w zakresie: ${d.implement && d.implement !== '—' ? d.implement : 'nieobjętym pakietem (na podstawie odrębnej wyceny)'},`,
    'udostępnianie narzędzi i materiałów Kancelarii na zasadach określonych w § 5.',
  ]);
  ust('Usługi świadczą wyłącznie doradcy podatkowi wpisani na listę doradców podatkowych, będący partnerami lub współpracownikami Kancelarii. Kancelaria nie prowadzi ksiąg rachunkowych ani ewidencji podatkowych i nie świadczy usług księgowych.');
  ust(`Biuro zadaje pytania i przekazuje sprawy za pośrednictwem aplikacji rdp.app udostępnionej przez Kancelarię (moduł „Zadania”), z imiennych kont pracowników Biura wskazanych przez Biuro w formie dokumentowej${extra.length ? `, a ponadto: ${extra.join(', ')}` : ''}. Kancelaria udziela odpowiedzi w aplikacji, a o odpowiedzi Biuro jest powiadamiane wiadomością e-mail. Wiadomości e-mail kierowane poza aplikacją nie są traktowane jako zlecenie Usługi.`);
  ust(`Kancelaria udziela odpowiedzi w terminie: ${d.response || P}, licząc od otrzymania kompletnych informacji. Sprawy złożone lub wymagające analizy dokumentów Kancelaria może rozpatrywać w dłuższym terminie uzgodnionym z Biurem.`);
  ust('Usługi są świadczone na rzecz Biura. Udzielając porady, Kancelaria opiera się na stanie faktycznym i dokumentach przedstawionych przez Biuro.');

  sec('Pakiet i wynagrodzenie');
  ust(`Biuro wybiera pakiet „${pk.name}” opisany w Załączniku nr 1. Z tytułu Usług w ramach pakietu Kancelarii przysługuje miesięczne wynagrodzenie ryczałtowe w wysokości ${zl(d.price)} netto, powiększone o podatek VAT według obowiązującej stawki.`);
  ust(`W ramach wynagrodzenia ryczałtowego Biuro może wykorzystać pulę czasu pracy doradców podatkowych w wymiarze: ${d.hours || P} w miesiącu, dla wszystkich pracowników Biura łącznie. ${d.rollover ? 'Niewykorzystane godziny przechodzą na kolejny miesiąc kalendarzowy i wygasają, jeżeli nie zostaną wykorzystane w tym miesiącu.' : 'Niewykorzystane godziny nie przechodzą na kolejne miesiące.'}`);
  ust('Czas pracy liczy się w odcinkach 15-minutowych. Kancelaria prowadzi ewidencję czasu pracy przy zadaniach Biura w aplikacji rdp.app; Biuro widzi w aplikacji wykorzystanie puli w bieżącym miesiącu, a szczegółowe zestawienie otrzymuje na żądanie. Po wyczerpaniu puli Kancelaria informuje o tym Biuro przed podjęciem dalszych czynności.');
  ust(`Czynności wykraczające poza pulę godzin Kancelaria wykonuje za zgodą Biura wyrażoną w formie dokumentowej, za wynagrodzeniem w wysokości ${zl(d.over_rate)} netto za godzinę, powiększonym o VAT.`);
  ust('Biuro może zmienić pakiet ze skutkiem od pierwszego dnia kolejnego miesiąca kalendarzowego, zawiadamiając Kancelarię w formie dokumentowej (e-mail) najpóźniej na 7 dni przed końcem miesiąca. Zmiana pakietu nie wymaga aneksu do Umowy; wynagrodzenie i zakres pakietu określa wówczas aktualny cennik Programu Partner M2 TAX.');
  ust(`Wynagrodzenie ryczałtowe płatne jest z góry za każdy rozpoczęty miesiąc kalendarzowy, na podstawie faktury wystawianej przez Kancelarię pomiędzy 1. a 2. dniem tego miesiąca, w terminie do ${d.pay_day || 7}. dnia tego miesiąca, na rachunek bankowy wskazany na fakturze.`);
  ust('Wynagrodzenie ryczałtowe przysługuje Kancelarii w pełnej wysokości za każdy rozpoczęty miesiąc kalendarzowy obowiązywania Umowy, także wtedy, gdy współpraca rozpoczyna się albo kończy w trakcie miesiąca, oraz niezależnie od liczby pytań zadanych w danym miesiącu.');
  ust(`Wynagrodzenie za czynności ponad pulę godzin płatne jest po zakończeniu miesiąca, na podstawie faktury wystawionej przez Kancelarię, w terminie ${d.pay_day || 7} dni od dnia jej wystawienia.`);
  ust('Biuro wyraża zgodę na otrzymywanie faktur w formie elektronicznej, w tym za pośrednictwem KSeF.');

  sec('Sprawy klientów Biura');
  ust('Reprezentacja klientów Biura przed organami podatkowymi, organami Krajowej Administracji Skarbowej, ZUS oraz sądami administracyjnymi (w tym czynności sprawdzające, kontrole, postępowania podatkowe, wnioski o interpretacje indywidualne i skargi) nie jest objęta pakietem. Wymaga ona odrębnej umowy zawartej bezpośrednio przez Kancelarię z klientem Biura oraz udzielenia pełnomocnictwa.');
  ust(`Wynagrodzenie za sprawy, o których mowa w ust. 1, ustalane jest indywidualnie z klientem Biura, z rabatem w wysokości ${pct(d.discount)} od stawek Kancelarii.`);
  ust('Kancelaria działa jako zaplecze doradcze Biura. Kancelaria nie będzie oferować klientom Biura, z którymi zetknęła się w wykonaniu Umowy, usług księgowych ani kadrowo-płacowych przez czas trwania Umowy i 12 miesięcy po jej rozwiązaniu.');

  sec('Zasady współpracy i odpowiedzialność');
  ust('Kancelaria wykonuje Usługi z należytą starannością, przy uwzględnieniu zawodowego charakteru prowadzonej działalności (art. 355 § 2 Kodeksu cywilnego), zgodnie z przepisami prawa, ustawą o doradztwie podatkowym i Zasadami Etyki Doradców Podatkowych.');
  ust('Biuro przekazuje Kancelarii kompletne i prawdziwe informacje oraz dokumenty niezbędne do wykonania Usług. Kancelaria nie odpowiada za skutki porad udzielonych na podstawie informacji niepełnych, nieprawdziwych lub przekazanych z opóźnieniem.');
  ust('Prowadzenie ksiąg i ewidencji, sporządzanie i składanie deklaracji oraz kontakt z klientami Biura pozostają obowiązkiem i odpowiedzialnością Biura.');
  ust('Doradcy podatkowi świadczący Usługi posiadają obowiązkowe ubezpieczenie odpowiedzialności cywilnej.');
  ust('Odpowiedzialność Kancelarii wobec Biura, z wyjątkiem szkody wyrządzonej umyślnie, ograniczona jest do wysokości wynagrodzenia netto zapłaconego przez Biuro za ostatnie 12 miesięcy obowiązywania Umowy. Kancelaria nie odpowiada za utracone korzyści Biura.');
  ust('Porady udzielane są według stanu prawnego z dnia ich udzielenia. Kancelaria nie ma obowiązku aktualizowania udzielonych porad w razie późniejszej zmiany przepisów lub praktyki organów, chyba że Biuro zada nowe pytanie.');

  sec('Narzędzia i materiały Kancelarii');
  ust('W okresie obowiązywania Umowy Kancelaria udostępnia pracownikom Biura, w ramach wynagrodzenia ryczałtowego:', [
    'aplikację rdp.app – moduł „Zadania” do przekazywania pytań i spraw doradcom oraz odbierania odpowiedzi, wraz z podglądem wykorzystania pakietu,',
    'bazę wiedzy M2 TAX – omówienia przepisów, odpowiedzi na najczęstsze pytania i komunikaty o zmianach,',
    'wzory dokumentów – pisma do urzędów, odpowiedzi na wezwania, pełnomocnictwa, uchwały i komunikaty,',
    'aplikację do weryfikacji plików JPK (JPK CIT, JPK_PKPIR, JPK_EWP),',
    'aplikację do przygotowania sprawozdania finansowego do KRS na podstawie JPK CIT.',
  ]);
  ust('Dostęp udzielany jest przez imienne konta pracowników Biura, zakładane przez Kancelarię na wniosek Biura, i nie może być udostępniany osobom trzecim. Biuro niezwłocznie informuje Kancelarię o konieczności zablokowania konta osoby, która przestała współpracować z Biurem. Biuro może wykorzystywać wzory dokumentów w sprawach swoich klientów.');
  ust('Wyniki działania aplikacji mają charakter pomocniczy i nie zastępują weryfikacji dokonywanej przez Biuro. Odpowiedzialność za treść plików JPK, sprawozdań i deklaracji wysyłanych do organów ponosi podmiot je wysyłający.');
  ust('Prawa autorskie do materiałów i aplikacji przysługują Kancelarii lub jej partnerom. Po rozwiązaniu Umowy dostęp wygasa.');

  sec('Tajemnica i dane osobowe');
  ust('Kancelaria zachowuje w tajemnicy wszelkie informacje uzyskane w związku z wykonywaniem Usług, zgodnie z art. 37 ustawy o doradztwie podatkowym. Biuro zachowuje w poufności warunki Umowy oraz materiały udostępnione przez Kancelarię. Obowiązki te trwają także po rozwiązaniu Umowy.');
  ust('Przekazując pytania dotyczące swoich klientów, Biuro ogranicza dane osobowe do niezbędnego minimum, a gdy to możliwe – przekazuje informacje bez danych pozwalających zidentyfikować klienta.');
  ust('W zakresie danych osobowych otrzymanych w związku z udzieleniem porady Kancelaria, jako podmiot wykonujący zawód doradcy podatkowego, jest odrębnym administratorem danych. Biuro oświadcza, że posiada podstawę prawną do przekazania tych danych Kancelarii.');

  sec('Okres obowiązywania Umowy');
  ust(`Umowa wchodzi w życie z dniem ${dateLong(d.start)} i zostaje zawarta na czas nieokreślony.`);
  ust('Każda ze Stron może wypowiedzieć Umowę z zachowaniem jednomiesięcznego okresu wypowiedzenia, ze skutkiem na koniec miesiąca kalendarzowego. Wypowiedzenie wymaga formy dokumentowej (e-mail).');
  ust('Kancelaria może wypowiedzieć Umowę ze skutkiem natychmiastowym, jeżeli Biuro zalega z zapłatą wynagrodzenia za co najmniej dwa okresy rozliczeniowe albo gdy dalsze świadczenie Usług byłoby sprzeczne z przepisami prawa lub Zasadami Etyki Doradców Podatkowych.');

  sec('Postanowienia końcowe');
  ust('Zmiany Umowy wymagają formy dokumentowej pod rygorem nieważności, z wyjątkiem zmiany pakietu w trybie § 2 ust. 5.');
  ust('Biuro oświadcza, że jest przedsiębiorcą i zawiera Umowę w bezpośrednim związku ze swoją działalnością gospodarczą, a Umowa ma dla niego charakter zawodowy. Do Umowy nie stosuje się przepisów o ochronie konsumentów.');
  ust('W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego oraz ustawy o doradztwie podatkowym. Spory wynikające z Umowy rozstrzyga sąd powszechny właściwy dla siedziby Kancelarii.');
  ust('Umowę sporządzono w formie elektronicznej opatrzonej podpisami elektronicznymi Stron albo w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.');

  B.push({ t: 'sign2',
    left: { label: 'KANCELARIA', firm: null, people: sg.map(signerCap) },
    right: { label: 'BIURO', firm: client.kind === 'osoba' ? null : (client.name || P), people: client.kind === 'osoba' ? [client.name || P] : (reps.length ? reps : [`${P} – ${P}`]) } });

  B.push({ t: 'pb' });
  B.push({ t: 'att', text: `Załącznik nr 1 – Pakiet „${pk.name}”` });
  const val = (k, type) => { const v = { hours: d.hours, channels: d.channels, response: d.response, direct: true, notes: true, rollover: d.rollover, implement: d.implement, two: d.two, discount: pct(d.discount) }[k]; return type === 'bool' ? (v ? 'tak' : 'nie') : (String(v ?? '').trim() || '—'); };
  B.push({ t: 'kv', head: ['Element pakietu', 'Warunki'], rows: [['Wynagrodzenie ryczałtowe', `${zl(d.price)} netto / miesiąc + VAT`], ...PARTNER_FEATURES.map(([k, label, type]) => [label, val(k, type)]),
    ['Godzina ponad pulę pakietu', `${zl(d.over_rate)} netto, rozliczana co do 15 minut`], ['Płatność', `z góry za każdy rozpoczęty miesiąc – faktura 1.–2. dnia miesiąca, płatna do ${d.pay_day || 7}. dnia miesiąca`]] });
  return B;
}

const pkgLabel = p => `${p.name} – ${p.price} ${p.unit}`;

// Okno: umowa z biurem rachunkowym (klient M2 TAX)
export async function partnerContractDialog({ client, pkgKey = 'partner', pkg = null }) {
  const { data: signers, error } = await sb.from('m2_signers').select('*').eq('active', true).order('sort');
  if (error) return fail(error);
  const d = partnerDefaults(client, pkg?.key || pkgKey, pkg);
  d.signers = (signers || []).filter(x => /Otręba|Ruszniak/.test(x.full_name)).map(x => x.id);
  if (!d.signers.length) d.signers = (signers || []).slice(0, 2).map(x => x.id);
  const chosen = () => (signers || []).filter(x => d.signers.includes(x.id));
  const blocks = () => partnerContractBlocks(d, client, chosen());
  const title = () => `Umowa Program Partner – ${client.name}`.slice(0, 150);
  const field = (k, label, type = 'text', wide = false) => {
    const el = type === 'textarea' ? h('textarea', { class: 'input', rows: 2 }, d[k] ?? '') : h('input', { class: 'input', type, value: d[k] ?? '' });
    el.addEventListener('input', () => { d[k] = type === 'checkbox' ? el.checked : el.value; });
    return h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const check = (k, label) => { const cb = h('input', { type: 'checkbox', checked: !!d[k] }); cb.addEventListener('change', () => { d[k] = cb.checked; }); return h('label', { class: 'check' }, cb, label); };
  const box = h('div');
  const draw = () => {
    const pkSel = h('select', { class: 'select' }, ...partnerPackages().map(p => h('option', { value: p.key, selected: p.key === d.pkg }, pkgLabel(p))));
    pkSel.addEventListener('change', () => { applyPkg(d, pkSel.value); draw(); });
    box.replaceChildren(
      h('p', { class: 'small', style: { margin: '0 0 10px' } }, 'Biuro: ', h('b', {}, client.name), ' · umowa M2 TAX, usługi świadczą doradcy podatkowi. Warunki pakietu są podpowiadane z ofert Programu Partner – możesz je zmienić dla tego biura.'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field wide' }, h('span', {}, 'Pakiet'), pkSel),
        field('price', 'Wynagrodzenie (zł netto / mies.)'), field('hours', 'Pula godzin w miesiącu'),
        field('channels', 'Jak biuro zadaje pytania'), field('response', 'Czas odpowiedzi'),
        field('implement', 'Wsparcie wdrożeń', 'text', true),
        field('discount', 'Rabat na sprawy klientów biura (%)'), field('over_rate', 'Stawka ponad pulę (zł netto / h)'),
        field('start', 'Wchodzi w życie', 'date'), field('pay_day', 'Płatność z góry – do którego dnia miesiąca', 'number'),
        field('party', 'Biuro – oznaczenie w umowie (nazwa, siedziba, KRS / NIP)', 'textarea', true),
        field('reps', 'Reprezentanci biura – każda osoba w osobnej linii: „Anna Nowak – właścicielka”', 'textarea', true)),
      h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', margin: '6px 0 10px' } }, check('rollover', 'Niewykorzystane godziny przechodzą na kolejny miesiąc'), check('two', 'Stały kontakt z dwoma doradcami')),
      h('div', { class: 'field wide' }, h('span', {}, 'Za Kancelarię podpisują'),
        h('div', { style: { display: 'flex', gap: '6px 18px', flexWrap: 'wrap' } }, ...(signers || []).map(x => {
          const cb = h('input', { type: 'checkbox', checked: d.signers.includes(x.id) });
          cb.addEventListener('change', () => { d.signers = cb.checked ? [...new Set([...d.signers, x.id])] : d.signers.filter(i => i !== x.id); });
          return h('label', { class: 'check' }, cb, x.full_name);
        }))),
      signPanel({ m2_client_id: client.id }, { title: 'Wysłane do podpisu' }));
  };
  draw();
  const fname = ext => `Umowa_Program_Partner_${(client.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
  const ready = () => { if (!chosen().length) { toast('Zaznacz, kto podpisuje za Kancelarię', true); return false; } return true; };
  modal('Umowa z biurem rachunkowym – Program Partner', box, close => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Zamknij'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
      if (!ready()) return;
      try { const bytes = await buildOrderDocx(blocks(), M2_BRAND); const a = h('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })), download: fname('docx') }); document.body.append(a); a.click(); a.remove(); }
      catch (e) { fail(e); }
    } }, icon('download'), 'Word'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: async e => {
      if (!ready()) return;
      const b = e.currentTarget; b.disabled = true;
      try { const { orderPdf, downloadBytesPdf } = await import('../umowapdf.js'); downloadBytesPdf(await orderPdf(orderDocumentXml(blocks()), M2_BRAND, title()), fname('pdf')); }
      catch (err) { fail(err, 'Nie udało się przygotować PDF'); } finally { b.disabled = false; }
    } }, icon('download'), 'PDF'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
      if (!ready()) return;
      const B = blocks(), xml = orderDocumentXml(B), t = title();
      sendForSignature({ client, target: { m2_client_id: client.id }, firm: 'm2', kind: 'umowa_doradcza', title: t,
        buildPdf: async () => { const { orderPdf } = await import('../umowapdf.js'); return orderPdf(xml, M2_BRAND, t); },
        preview: previewDoc(orderHtml(B, location.origin + M2_BRAND.logo, M2_BRAND), { head: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap"><style>${ORDER_CSS}</style>` }),
        onSent: async () => {
          close(); toast('Umowa wysłana – status zobaczysz na karcie biura w sekcji „Do podpisu”');
          // biuro, któremu wysłano umowę partnerską, oznaczamy jako partnera (z wybranym pakietem)
          if (client.client_type !== 'partner' || client.partner_package !== d.pkg) {
            const { error: e } = await sb.from('m2_clients').update({ client_type: 'partner', partner_package: d.pkg, ...(client.package_hours ? {} : { package_hours: parseFloat(String(d.hours).replace(',', '.')) || null }) }).eq('id', client.id);
            if (!e) Object.assign(client, { client_type: 'partner', partner_package: d.pkg });
          }
        } });
    } }, icon('mail'), 'Wyślij do podpisu'),
  ]);
}
