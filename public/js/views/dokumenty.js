// Generowanie dokumentów – jedno miejsce na wszystkie pliki, które aplikacja tworzy (umowy, pełnomocnictwa, protokoły, oferty, raporty).
import { h, fail, infoTip } from '../ui.js';
import { sb, hasModule } from '../store.js';
import { dokumentyDialog } from '../rkdp/docs.js';
import { WZORY } from '../tools/wzory.js';
import { INSTRUKCJE, instrukcjaDialog } from '../tools/instrukcje.js';

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
      h('div', {},
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Generowanie dokumentów', infoTip(HELP, 'Generowanie dokumentów – instrukcja')),
        h('p', { class: 'sub' }, 'Umowy, pełnomocnictwa, protokoły, oferty i raporty – wszystko w jednym miejscu.')),
      h('button', { class: 'btn btn-primary', onclick: () => import('../tools/nowydok.js').then(m => m.nowyDokument()).catch(e => fail(e)) }, '+ Nowy dokument')),
    group('Umowy i oferty',
      tile('Generator wzorów umów', 'Wzór umowy dla klienta – e-mailem albo linkiem, także bez klienta w bazie.', () => import('../tools/wzoryumow.js').then(m => m.wzorUmowyDialog()).catch(e => fail(e)), ['E-mail', 'Link']),
      tile('Umowa o usługi księgowe', 'Ryczałt, KPiR albo księgi – dane klienta wpisują się same.', doc('umowa'), ['PDF', 'Word']),
      tile('Oferta na usługi', 'Księgowość, kadry, doradztwo – z wyceną.', '#/oferty/nowa', ['PDF']),
      tile('Zapisane oferty', 'Projekty, wysłane i zaakceptowane.', '#/oferty')),
    group('Instrukcje dla klientów',
      ...INSTRUKCJE.map(it => tile(it.title, it.desc, () => instrukcjaDialog(it), ['Link']))),
    group('Pełnomocnictwa',
      tile('UPL-1', 'Podpisywanie e-deklaracji w urzędzie skarbowym.', doc('upl1'), ['PDF']),
      tile('PEL', 'Pełnomocnictwo do ZUS (e-ZUS).', doc('pel'), ['PDF']),
      tile('PPS-1', 'Pełnomocnictwo szczególne w sprawie podatkowej.', doc('pps1'), ['PDF']),
      tile('Konto organizacji e-US', 'Dostęp do konta organizacji w e-Urzędzie Skarbowym.', doc('uko'), ['PDF']),
      tile('ZAW-FA', 'Uprawnienia KSeF – PDF z instrukcją dla klienta.', doc('zawfa'), ['PDF']),
      tile('Pełnomocnictwo procesowe', 'Do WSA i NSA – na papierze firmowym RKDP.', doc('procesowe'), ['PDF', 'Word'])),
    group('Spółki',
      tile('Sprawozdanie finansowe – jednostka mikro', 'e-Sprawozdanie (XML do eKRS) z JPK_KR_PD.', '#/sprawozdanie-finansowe', ['XML', 'PDF']),
      tile('Protokół zgromadzenia wspólników (ZZW)', 'Zatwierdzenie sprawozdania, wynik, absolutoria.', '#/sprawozdania/nowy', ['PDF', 'Word']),
      h('div', { class: 'card dk-tile dk-list' }, h('b', {}, 'Ostatnie protokoły'), recent)),
    group('Wzory umów i uchwał dla klientów',
      ...Object.entries(WZORY).map(([k, w]) => tile(w.label, w.desc, `#/wzory?wzor=${k}`, ['Word', 'PDF']))),
    group('Narzędzia',
      tile('Kalkulator: JDG czy spółka z o.o.?', 'Skala, liniowy, ryczałt, CIT i estoński CIT – PDF dla klienta.', '#/kalkulator', ['PDF'])),
    group('JPK',
      tile('Podgląd i weryfikacja JPK', 'JPK_CIT, JPK_PKPIR, JPK_EWP – sumy i kontrola. Plik zostaje u Ciebie.', '#/jpk', ['Excel', 'PDF']),
      tile('Znaczniki JPK CIT – podpowiedzi', 'Propozycja znacznika dla konta albo całego planu kont.', '#/znaczniki', ['Excel'])),
    group('Raporty i zestawienia',
      tile('Raport rozliczeń', 'Stan rozliczeń klientów za miesiąc.', '#/rozliczenia', ['PDF', 'Excel', 'CSV']),
      tile('Lista obecności', 'Ewidencja czasu pracy za miesiąc – Twoja albo zespołu.', '#/obecnosc', ['PDF', 'Excel']),
      tile('Lista klientów', 'Eksport kartoteki klientów.', '#/klienci', ['Excel'])),
    group('Doradztwo podatkowe (RKDP i M2 TAX)',
      tile('Wzory pism procesowych', 'Odwołania, zażalenia, skargi, wnioski o interpretację.', '#/doradztwo/dokumenty', ['Word', 'PDF']),
      tile('Zlecenia i umowy', 'Zlecenie, umowa o doradztwo, pełnomocnictwa.', '#/doradztwo/zlecenia', ['PDF', 'Word']),
      hasModule('doradztwo') ? tile('Oferta M2 TAX', 'Oferta doradztwa podatkowego na papierze M2 TAX.', '#/doradztwo/oferty', ['PDF']) : null,
      tile('Raport sprawy', 'Podsumowanie, godziny albo dziennik sprawy.', '#/doradztwo/sprawy', ['PDF'])));
}
