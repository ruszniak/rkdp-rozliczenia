// Strona klienta – w aplikacji: utworzenie stałego linku (app.ruszniak.io/klient/#…), kopiowanie, wysyłka e-mailem, wyłączenie.
import { h, toast, fail, modal, icon } from './ui.js';
import { sb } from './store.js';

const APP = (location.origin.includes('localhost') ? 'https://app.ruszniak.io' : location.origin);
const linkOf = t => `${APP}/klient/#${t}`;

// target: { client_id } (klient RKDP) albo { m2_client_id }; firm: 'rkdp' | 'm2'
export async function portalDialog({ target, name = '', email = '', firm = 'rkdp' }) {
  const key = target.client_id ? ['client_id', target.client_id] : ['m2_client_id', target.m2_client_id];
  const load = async () => {
    let q = sb.from('client_portals').select('*').is('revoked_at', null).eq(key[0], key[1]);
    if (key[0] === 'm2_client_id') q = q.is('client_id', null);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  };
  let p = await load();
  const body = h('div', {});
  let close = () => {};
  const create = async () => {
    const { data, error } = await sb.from('client_portals').insert({ ...target, firm }).select('*').single();
    if (error) return fail(error, 'Nie udało się utworzyć linku');
    p = data; draw();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(linkOf(p.token)); toast('Skopiowano link'); } catch { toast('Zaznacz i skopiuj link ręcznie', true); } };
  const mailInp = h('input', { class: 'input', style: { flex: '1', minWidth: '0' }, type: 'email', placeholder: 'e-mail klienta', value: email || '' });
  const mail = async btn => {
    const to = mailInp.value;
    if (!to.trim()) return toast('Wpisz e-mail klienta', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) return toast('Wpisz poprawny e-mail', true);
    btn.disabled = true;
    const text = `Dzień dobry,\n\nprzygotowaliśmy dla Państwa stronę klienta – w jednym miejscu są tam dokumenty do podpisu i do pobrania, wgrywanie dokumentów do rozliczenia oraz umówione spotkania.\n\n{button}\n\nProsimy zachować ten link – zawsze pokazuje aktualny stan.`;
    const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'doc_mail', ...target, firm, to: to.trim(), subject: `Strona klienta – ${firm === 'm2' ? 'M2 TAX' : 'RKDP'}`, body: text,
      doc: { kicker: 'Strona klienta', title: name || 'Strona klienta', button: { url: linkOf(p.token), label: 'Otwórz stronę klienta' } } } });
    btn.disabled = false;
    if (error || r?.error) return fail(new Error(r?.detail || r?.error || error.message), 'Nie udało się wysłać e-maila');
    toast(`Wysłano link na ${to.trim()}`);
  };
  const revoke = async (andNew) => {
    if (!confirm(andNew ? 'Utworzyć nowy link? Stary przestanie działać.' : 'Wyłączyć link? Klient nie otworzy już tej strony.')) return;
    const { error } = await sb.from('client_portals').update({ revoked_at: new Date().toISOString() }).eq('id', p.id);
    if (error) return fail(error);
    p = null;
    if (andNew) await create(); else draw();
  };
  const draw = () => {
    if (!p) return body.replaceChildren(
      h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Jeden stały link dla klienta: dokumenty do podpisu i do pobrania, wgrywanie dokumentów do rozliczenia, umówione spotkania i kontakt. Bez logowania – link działa, dopóki go nie wyłączysz.'),
      h('button', { class: 'btn btn-primary', onclick: create }, icon('plus'), 'Utwórz link'));
    const inp = h('input', { class: 'input', style: { width: '100%' }, readonly: true, value: linkOf(p.token), onfocus: e => e.target.select() });
    body.replaceChildren(
      h('p', { class: 'small', style: { margin: '0 0 8px' } }, `Klient widzi: dokumenty do podpisu i do pobrania, wgrywanie dokumentów, spotkania. Otwarto ${p.views || 0} ${p.views === 1 ? 'raz' : 'razy'}${p.last_view_at ? ' · ostatnio ' + new Date(p.last_view_at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}.`),
      inp,
      h('div', { class: 'row-btns', style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-primary btn-sm', onclick: copy }, 'Kopiuj link'),
        h('a', { class: 'btn btn-outline btn-sm', href: linkOf(p.token), target: '_blank', rel: 'noopener' }, 'Podgląd'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => revoke(true) }, 'Nowy link'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => revoke(false) }, 'Wyłącz')),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' } }, mailInp,
        h('button', { class: 'btn btn-outline btn-sm', onclick: e => mail(e.currentTarget) }, icon('mail'), 'Wyślij link')));
  };
  draw();
  modal(`Strona klienta${name ? ' – ' + name : ''}`, body, c => { close = c; return [h('button', { class: 'btn btn-ghost btn-sm', onclick: c }, 'Zamknij')]; });
  return close;
}
