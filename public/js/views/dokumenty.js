// Generowanie dokumentów – jedno miejsce na wszystkie pliki, które aplikacja tworzy (umowy, pełnomocnictwa, protokoły, oferty, raporty).
import { h, fail, infoTip } from '../ui.js';
import { sb, hasModule } from '../store.js';
import { dokumentyDialog } from '../rkdp/docs.js';
import { WZORY } from '../tools/wzory.js';

const HELP = `Tu wygenerujesz każdy dokument z aplikacji:
• Kliknij kafelek, wybierz klienta i uzupełnij dane – większość pól wypełnia się sama z karty klienta, KRS lub Twojego profilu.
• Pełnomocnictwa możesz wystawić na doradcę albo na siebie (dane z „Mój profil”).
• PDF otwiera się w oknie drukowania – wybierz „Zapisz jako PDF”. Umowy, pełnomocnictwo procesowe i protokoły można też pobrać jako Word.
• Raporty i zestawienia pobierasz z odpowiedniej zakładki – kafelek przeniesie Cię we właściwe miejsce.`;

const dShort = d => d ? new Date(d).toLocaleDateString('pl-PL') : '—';

export async function renderDokumenty(main) {
  const doc = type => () => dokumentyDialog({ type }).catch(e => fail(e));
  const tile = (title, desc, action, tags = []) => h(typeof action === 'string' ? 'a' : 'button',
    { class: 'card dk-tile', type: typeof action === 'string' ? null : 'button', href: typeof action === 'string' ? action : null, onclick: typeof action === 'string' ? null : action },
    h('b', {}, title), h('span', { class: 'small muted' }, desc),
    tags.length ? h('span', { class: 'dk-tags' }, ...tags.map(t => h('span', { class: 'badge' }, t))) : null);
  const group = (title, ...tiles) => h('section', { class: 'dk-group' }, h('h2', {}, title), h('div', { class: 'dk-grid' }, ...tiles.filter(Boolean)));

  const recent = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
  sb.from('rkdp_protocols').select('id, client_id, period_to, meeting_date, params, updated_at, clients(name)').order('updated_at', { ascending: false }).limit(5)
    .then(({ data, error }) => {
      if (error) return recent.replaceChildren(h('p', { class: 'hint' }, 'Nie udało się wczytać protokołów.'));
      recent.replaceChildren(...(data.length ? data.map(r => h('a', { class: 'tk-mini', href: `#/sprawozdania/${r.id}` },
        h('span', {}, h('b', {}, r.clients?.name || r.params?.company || '—'), r.period_to ? ` · rok ${r.period_to.slice(0, 4)}` : ''),
        h('span', { class: 'small muted' }, dShort(r.updated_at)))) : [h('p', { class: 'hint' }, 'Brak zapisanych protokołów.')]),
      h('a', { class: 'small', href: '#/sprawozdania', style: { display: 'inline-block', marginTop: '8px' } }, 'Wszystkie protokoły →'));
    });

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Generowanie dokumentów', infoTip(HELP, 'Generowanie dokumentów – instrukcja')),
        h('p', { class: 'sub' }, 'Umowy, pełnomocnictwa, protokoły, oferty i raporty – wszystko w jednym miejscu.'))),
    group('Umowy i oferty',
      tile('Umowa o usługi księgowe', 'Wzór RKDP – ryczałt, KPiR albo księgi rachunkowe. Dane klienta i wynagrodzenie wypełniają się same.', doc('umowa'), ['PDF', 'Word']),
      tile('Oferta na usługi', 'Profesjonalna oferta RKDP: księgowość, kadry, doradztwo podatkowe – z wyceną z umów.', '#/oferty/nowa', ['PDF']),
      tile('Zapisane oferty', 'Lista ofert RKDP ze statusem: projekt, wysłana, zaakceptowana.', '#/oferty')),
    group('Pełnomocnictwa',
      tile('UPL-1', 'Pełnomocnictwo do podpisywania deklaracji składanych elektronicznie (urząd skarbowy).', doc('upl1'), ['PDF']),
      tile('PEL', 'Pełnomocnictwo do ZUS (PUE ZUS / e-ZUS).', doc('pel'), ['PDF']),
      tile('PPS-1', 'Pełnomocnictwo szczególne w sprawie podatkowej.', doc('pps1'), ['PDF']),
      tile('Pełnomocnictwo procesowe', 'Do WSA i NSA – na papierze firmowym RKDP.', doc('procesowe'), ['PDF', 'Word'])),
    group('Spółki',
      tile('Protokół zgromadzenia wspólników (ZZW)', 'Zatwierdzenie sprawozdania finansowego, podział zysku / pokrycie straty, absolutoria. Dane z KRS.', '#/sprawozdania/nowy', ['PDF', 'Word']),
      h('div', { class: 'card dk-tile dk-list' }, h('b', {}, 'Ostatnie protokoły'), recent)),
    group('Wzory umów i uchwał dla klientów',
      ...Object.entries(WZORY).map(([k, w]) => tile(w.label, w.desc, `#/wzory?wzor=${k}`, ['Word', 'PDF']))),
    group('Narzędzia',
      tile('Kalkulator: JDG czy spółka z o.o.?', 'Porównanie obciążeń: JDG na skali, liniowym i ryczałcie, spółka na CIT i CIT estońskim. Wynik w PDF dla klienta.', '#/kalkulator', ['PDF'])),
    group('JPK',
      tile('Podgląd JPK_CIT', 'Otwórz plik JPK_KR_PD (księgi rachunkowe) lub JPK_ST_KR (środki trwałe): konta, dziennik, znaczniki, sumy kontrolne. Plik zostaje na Twoim komputerze.', '#/jpk', ['Excel', 'PDF'])),
    group('Raporty i zestawienia',
      tile('Raport rozliczeń', 'Stan rozliczeń klientów za miesiąc – w zakładce Rozliczenia przycisk „Pobierz”.', '#/rozliczenia', ['PDF', 'Excel', 'CSV']),
      tile('Lista obecności', 'Ewidencja czasu pracy za miesiąc – Twoja albo zespołu.', '#/obecnosc', ['PDF', 'Excel']),
      tile('Lista klientów', 'Eksport kartoteki klientów – w zakładce Klienci przycisk eksportu.', '#/klienci', ['Excel'])),
    hasModule('doradztwo') ? group('M2 TAX',
      tile('Wzory pism procesowych', 'Pisma do US, odwołania, zażalenia, skargi do WSA i NSA, wnioski o interpretację – na papierze M2 TAX z wybranym pełnomocnikiem.', '#/doradztwo/dokumenty', ['Word', 'PDF']),
      tile('Zlecenie / umowa M2 TAX', 'Zlecenie, umowa o doradztwo, pełnomocnictwa i PPS-1 dla klientów M2 TAX.', '#/doradztwo/zlecenia', ['PDF', 'Word']),
      tile('Oferta M2 TAX', 'Oferta doradztwa podatkowego na papierze M2 TAX.', '#/doradztwo/oferty', ['PDF']),
      tile('Raport sprawy', 'Podsumowanie sprawy, same godziny albo sam dziennik – otwórz sprawę i kliknij „Raport PDF”.', '#/doradztwo/sprawy', ['PDF'])) : null);
}
