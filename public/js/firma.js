// RKDP + M2 TAX w jednej aplikacji. RKDP = pełna obsługa (rozliczenia + doradztwo), M2 TAX = tylko doradztwo.
// Uprawnienia do firmy: moduł „rozliczenia” = RKDP, moduł „doradztwo” = M2 TAX (pilnuje tego też baza – RLS).
import { h } from './ui.js';
import { sb, hasModule } from './store.js';

export const FIRM_LABEL = { rkdp: 'RKDP', m2: 'M2 TAX' };
export const myFirms = () => [hasModule('rozliczenia') && 'rkdp', hasModule('doradztwo') && 'm2'].filter(Boolean);
export const bothFirms = () => myFirms().length > 1;
export const defaultFirm = () => myFirms()[0] || 'm2';
export const firmTag = f => h('span', { class: 'firm-tag firm-' + f }, FIRM_LABEL[f] || f);

// przełącznik w Klientach: osobne listy RKDP i M2 TAX (tylko dla kogoś z dostępem do obu firm)
export function firmSwitch(active, counts = {}) {
  if (!bothFirms()) return null;
  return h('div', { class: 'firm-seg', role: 'tablist', 'aria-label': 'Firma' },
    ...[['rkdp', '#/klienci'], ['m2', '#/doradztwo/klienci']].map(([f, href]) => h('a', {
      href, role: 'tab', 'aria-selected': String(f === active), class: `firm-seg-b firm-${f}${f === active ? ' on' : ''}` },
    FIRM_LABEL[f], counts[f] != null ? h('span', { class: 'firm-seg-n' }, String(counts[f])) : null)));
}

// filtr firm w Sprawach / Zleceniach: Wszystkie · RKDP · M2 TAX
export function firmChips(value, onChange) {
  if (!bothFirms()) return null;
  const box = h('div', { class: 'firm-chips' });
  const draw = () => box.replaceChildren(...[['', 'Obie firmy'], ['rkdp', 'RKDP'], ['m2', 'M2 TAX']].map(([k, l]) =>
    h('button', { type: 'button', class: 'chip' + (k === value ? ' on' : ''), onclick: () => { value = k; draw(); onChange(k); } }, l)));
  draw();
  return box;
}

const kindOf = c => c.legal_form === 'jdg' ? 'osoba' : 'firma';

// Klient RKDP w doradztwie: „profil” w m2_clients (firma rkdp) powiązany z kartą klienta RKDP.
// Zakładany przy pierwszym zleceniu / umowie; dane (nazwa, NIP, adres, kontakt) odświeżane z karty RKDP.
export async function rkdpProfile(clientId) {
  const [{ data: c, error: e1 }, { data: ex }] = await Promise.all([
    sb.from('clients').select('id,name,nip,regon,krs,address,email,phone,contact_person,legal_form').eq('id', clientId).single(),
    sb.from('m2_clients').select('*').eq('firm', 'rkdp').eq('rkdp_client_id', clientId).maybeSingle(),
  ]);
  if (e1) throw e1;
  const row = { name: c.name, nip: c.nip, regon: c.regon, krs: c.krs, address: c.address, email: c.email, phone: c.phone, contact_person: c.contact_person };
  if (ex) {
    const changed = Object.keys(row).some(k => (row[k] || null) !== (ex[k] || null));
    if (!changed) return ex;
    const { data, error } = await sb.from('m2_clients').update(row).eq('id', ex.id).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('m2_clients').insert({ ...row, firm: 'rkdp', rkdp_client_id: c.id, kind: kindOf(c), status: 'aktywny' }).select('*').single();
  if (error) throw error;
  return data;
}

// Lista klientów RKDP do wyboru w zleceniu / umowie RKDP. id = id profilu albo „rk:<id klienta RKDP>” (profil założy się przy zapisie).
export async function rkdpClientChoices() {
  const [{ data: rk, error }, { data: prof }] = await Promise.all([
    sb.from('clients').select('id,name,nip,address,email,phone,contact_person,legal_form,status').order('name').limit(5000),
    sb.from('m2_clients').select('*').eq('firm', 'rkdp').limit(5000),
  ]);
  if (error) throw error;
  const byRk = new Map((prof || []).map(p => [p.rkdp_client_id, p]));
  return (rk || []).filter(c => c.status !== 'zakonczony' || byRk.has(c.id)).map(c => byRk.get(c.id)
    || { id: 'rk:' + c.id, rkdp_client_id: c.id, firm: 'rkdp', name: c.name, nip: c.nip, address: c.address, email: c.email, phone: c.phone, contact_person: c.contact_person, kind: kindOf(c) });
}

// Karta klienta RKDP → sekcja „Doradztwo podatkowe” (sprawy, zlecenia i umowy RKDP tego klienta)
export function doradztwoCard(c) {
  const box = h('section', { class: 'card section dr-card' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Doradztwo podatkowe'), firmTag('rkdp')),
    h('p', { class: 'hint' }, 'Wczytywanie…'));
  (async () => {
    const { MATTER_STATUS, OPEN_STATUSES } = await import('./m2/dict.js');
    const nip = (c.nip || '').replace(/\D/g, '');
    const [{ data: prof }, { data: twin }] = await Promise.all([
      sb.from('m2_clients').select('id').eq('firm', 'rkdp').eq('rkdp_client_id', c.id).maybeSingle(),
      hasModule('doradztwo') && nip ? sb.from('m2_clients').select('id,name,nip').eq('firm', 'm2') : Promise.resolve({ data: [] }),
    ]);
    const m2twin = (twin || []).find(x => (x.nip || '').replace(/\D/g, '') === nip);
    const [{ data: ms }, { data: os }] = prof ? await Promise.all([
      sb.from('m2_matters').select('id,number,title,status,opened_at').eq('client_id', prof.id).order('opened_at', { ascending: false }),
      sb.from('m2_orders').select('id,number,subject,doc_type,status').eq('client_id', prof.id).order('order_date', { ascending: false }),
    ]) : [{ data: [] }, { data: [] }];
    const open = (ms || []).filter(m => OPEN_STATUSES.includes(m.status));
    const rest = (ms || []).filter(m => !OPEN_STATUSES.includes(m.status));
    const row = m => h('a', { class: 'mini-matter', href: `#/doradztwo/sprawa/${m.id}` }, h('div', {}, h('b', {}, m.number), ' ', m.title),
      h('span', { class: 'pill ' + (MATTER_STATUS[m.status]?.cls || '') }, MATTER_STATUS[m.status]?.label || m.status));
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', {}, 'Doradztwo podatkowe'), firmTag('rkdp')),
      ...(open.length ? open.map(row) : [h('p', { class: 'hint' }, ms?.length ? 'Brak otwartych spraw.' : 'Brak spraw doradczych. Sprawa zakłada się razem ze zleceniem albo umową.')]),
      ...(rest.length ? [h('details', { class: 'dr-closed' }, h('summary', {}, `Zakończone i pozostałe (${rest.length})`), ...rest.map(row))] : []),
      ...((os || []).length ? [h('p', { class: 'small muted', style: { margin: '10px 0 4px' } }, 'Zlecenia i umowy: ', ...(os.map((o, i) => [i ? ', ' : '', h('a', { href: `#/doradztwo/zlecenie/${o.id}` }, o.number)]).flat()))] : []),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
        h('a', { class: 'btn btn-outline btn-sm', href: `#/doradztwo/zlecenie/nowe?typ=zlecenie&rkdp=${c.id}` }, '+ Zlecenie'),
        h('a', { class: 'btn btn-outline btn-sm', href: `#/doradztwo/zlecenie/nowe?typ=umowa&rkdp=${c.id}` }, '+ Umowa'),
        (os || []).length ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => import('./views/m2.js').then(m => m.newMatterDialog({ rkdpClientId: c.id })) }, '+ Sprawa do zlecenia') : null,
        m2twin ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/doradztwo/klient/${m2twin.id}`, style: { marginLeft: 'auto' } }, 'Też klient M2 TAX →') : null));
  })().catch(e => box.replaceChildren(h('div', { class: 'section-head' }, h('h2', {}, 'Doradztwo podatkowe')), h('p', { class: 'hint' }, 'Nie udało się wczytać: ' + (e.message || e))));
  return box;
}
