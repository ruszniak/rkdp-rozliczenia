// „Nowy dokument” – jedno miejsce startu dla wszystkich dokumentów: wybierasz rodzaj, a aplikacja otwiera właściwy edytor
// (z klientem, jeśli startujesz z karty klienta). Dalej w edytorze: podgląd, pobierz, wyślij wzór albo do podpisu.
import { h, fail, modal } from '../ui.js';
import { hasModule, isAdmin } from '../store.js';

export function nowyDokument({ client = null } = {}) {
  const m2 = isAdmin() || hasModule('doradztwo');
  const rk = client?.id ? `&rkdp=${client.id}` : '';
  const docs = t => () => import('../rkdp/docs.js').then(x => x.dokumentyDialog({ type: t, client })).catch(e => fail(e));
  const go = href => () => { location.hash = href; };
  const groups = [
    ['Umowy i zlecenia', [
      ['Umowa o usługi księgowe', 'RKDP – ryczałt, KPiR, księgi, fundacja', docs('umowa')],
      ['Umowa o doradztwo podatkowe – RKDP', 'stała współpraca, z załącznikiem o sprawie', go(`#/doradztwo/zlecenie/nowe?typ=umowa&firma=rkdp${rk}`)],
      m2 ? ['Umowa o doradztwo podatkowe – M2 TAX', 'na papierze M2 TAX', go('#/doradztwo/zlecenie/nowe?typ=umowa&firma=m2')] : null,
      ['Zlecenie – RKDP', 'krótkie, jednorazowe', go(`#/doradztwo/zlecenie/nowe?typ=zlecenie&firma=rkdp${rk}`)],
      m2 ? ['Zlecenie – M2 TAX', 'krótkie, jednorazowe', go('#/doradztwo/zlecenie/nowe?typ=zlecenie&firma=m2')] : null,
      client ? null : ['Wzór umowy dla przyszłego klienta', 'bez klienta w bazie – e-mail albo link', () => import('./wzoryumow.js').then(x => x.wzorUmowyDialog()).catch(e => fail(e))],
    ]],
    ['Pełnomocnictwa i wnioski', [
      ['UPL-1', 'deklaracje elektroniczne – urząd skarbowy', docs('upl1')],
      ['PEL', 'ZUS (PUE / e-ZUS)', docs('pel')],
      ['PPS-1', 'pełnomocnictwo szczególne w sprawie podatkowej', docs('pps1')],
      ['ZAW-FA', 'uprawnienia KSeF', docs('zawfa')],
      ['Konto organizacji e-US', 'wniosek o dostęp', docs('uko')],
      ['Pełnomocnictwo procesowe', 'WSA i NSA', docs('procesowe')],
    ]],
    ['Oferty i spółki', [
      ['Oferta RKDP', 'księgowość, kadry, doradztwo', go(`#/oferty/nowa${client?.id ? `?klient=${client.id}` : ''}`)],
      m2 ? ['Oferta M2 TAX', 'doradztwo podatkowe', go('#/doradztwo/oferty/nowa')] : null,
      ['Protokół zgromadzenia wspólników', 'zatwierdzenie sprawozdania, podział zysku', go('#/sprawozdania/nowy')],
    ]],
  ];
  let close = () => {};
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj: umowa, UPL, PEL, oferta…', style: { marginBottom: '10px', width: '100%' } });
  const box = h('div', {});
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const draw = () => {
    const f = norm(q.value.trim());
    box.replaceChildren(...groups.map(([g, items]) => {
      const list = items.filter(Boolean).filter(([t, d]) => !f || norm(t + ' ' + d).includes(f));
      return list.length ? h('div', { style: { marginBottom: '12px' } }, h('p', { class: 'small muted', style: { margin: '0 0 6px', fontWeight: 600 } }, g),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '8px' } },
          ...list.map(([t, d, fn]) => h('button', { type: 'button', class: 'btn btn-outline', style: { justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', height: 'auto', whiteSpace: 'normal' }, onclick: () => { close(); fn(); } },
            h('span', {}, h('b', {}, t), h('br'), h('span', { class: 'small', style: { opacity: .8, fontWeight: 400 } }, d)))))) : null;
    }).filter(Boolean));
  };
  q.addEventListener('input', draw);
  draw();
  modal(client ? `Nowy dokument – ${client.name}` : 'Nowy dokument', h('div', {}, q, box), c => { close = c; setTimeout(() => q.focus(), 50); return [h('button', { class: 'btn btn-ghost btn-sm', onclick: c }, 'Anuluj')]; });
}
