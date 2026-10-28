// Prośba do klienta o brakujące dokumenty: lista braków + link do wgrania plików bez logowania.
// Wysyłka e-mailem z konta biura (gdy skonfigurowano Gmail) albo z własnego programu pocztowego; przypomnienie po 3 dniach.
import { h, toast, fail, modal, periodLabel } from './ui.js';
import { sb, state } from './store.js';

const APP = 'https://rozliczenia.rkdp.pl';
export const uploadLink = token => `${APP}/wgraj.html#${token}`;
const MONTHS_GEN = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const pl = p => `${MONTHS_GEN[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;

// gotowe pozycje do zaznaczenia według kratek z brakiem dokumentów
const ITEM_FOR = {
  saldeo: 'Faktury sprzedażowe i kosztowe (do Saldeo)', ksiegowanie: 'Pozostałe dokumenty księgowe', wb: 'Wyciągi bankowe',
  vat: 'Faktury do rozliczenia VAT', jpk: 'Faktury do JPK', pit_cit: 'Dokumenty do zaliczki na podatek', zus_podany: 'Informacje do ZUS (zmiany, zwolnienia lekarskie)',
  pit4: 'Listy płac / umowy zlecenia', zus_wyslany: 'Informacje do ZUS',
};
export function mailBody(r, client) {
  return [
    'Dzień dobry,', '', `do rozliczenia za ${pl(r.period)} potrzebujemy jeszcze dokumentów:`, '',
    ...(r.items || []).map(i => `• ${i.label}`), ...(r.message ? ['', r.message] : []), '',
    'Pliki (PDF, zdjęcia, XML, Excel) można wgrać bez logowania – także zdjęciem z telefonu:', uploadLink(r.token), '',
    `Link jest ważny do ${new Date(r.expires_at).toLocaleDateString('pl-PL')}.`, '', 'Dziękujemy,', state.me?.full_name || '', 'RKDP spółka doradztwa podatkowego sp. z o.o.',
  ].join('\n');
}
export const mailtoHref = (r, client) => `mailto:${encodeURIComponent(r.email || '')}?subject=${encodeURIComponent(`Dokumenty do rozliczenia – ${pl(r.period)} – ${client.name}`)}&body=${encodeURIComponent(mailBody(r, client))}`;

const STATE = r => r.closed_at ? 'zamknięta' : r.files_count ? `klient wgrał plików: ${r.files_count}` : r.reminded_at ? 'przypomniano, czeka na pliki' : r.sent_at ? 'wysłano, czeka na pliki' : 'utworzono – nie wysłano';

/**
 * @param {object} client {id, name, email}
 * @param {string} period 'YYYY-MM'
 * @param {string[]} codes kody kratek z brakiem dokumentów
 * @param {(tasks)=>void} [onDone]
 */
export async function openDocRequest(client, period, codes = [], onDone) {
  const pdate = period + '-01';
  const { data: prev } = await sb.from('doc_requests').select('*').eq('client_id', client.id).eq('period', pdate).order('created_at', { ascending: false });
  const tasks = state.taskTypes.filter(t => t.active);
  const preset = [...new Set(codes)].map(code => ({ code, label: ITEM_FOR[code] || tasks.find(t => t.code === code)?.label || code }));
  const boxes = preset.map(it => { const cb = h('input', { type: 'checkbox', checked: true }); cb._it = it; return cb; });
  const extra = h('textarea', { class: 'input', rows: 3, placeholder: 'Inne dokumenty – każdy w nowej linii, np. umowa najmu, faktura za leasing…' });
  const email = h('input', { class: 'input', type: 'email', value: client.email || '', placeholder: 'adres e-mail klienta' });
  const msg = h('textarea', { class: 'input', rows: 2, placeholder: 'Wiadomość dodatkowa (opcjonalnie)' });
  const history = h('div', { class: 'dr-hist' }, (prev || []).length ? [h('label', { class: 'lbl-sm' }, 'Wcześniejsze prośby w tym miesiącu'),
    ...prev.map(r => h('div', { class: 'dr-row' }, h('span', {}, new Date(r.created_at).toLocaleDateString('pl-PL'), ' · ', STATE(r)),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { navigator.clipboard?.writeText(uploadLink(r.token)); toast('Skopiowano link'); } }, 'Kopiuj link'),
      !r.closed_at ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async (e) => { e.target.disabled = true; const { error } = await sb.from('doc_requests').update({ closed_at: new Date().toISOString() }).eq('id', r.id); if (error) return fail(error); toast('Zamknięto prośbę – link przestał działać'); e.target.closest('.dr-row').querySelector('span').lastChild.textContent = 'zamknięta'; } }, 'Zamknij link') : null))] : null);

  const create = async () => {
    const items = [...boxes.filter(b => b.checked).map(b => b._it), ...extra.value.split('\n').map(s => s.trim()).filter(Boolean).map(label => ({ label }))];
    if (!items.length) { toast('Zaznacz albo wpisz, jakich dokumentów brakuje', true); return null; }
    const { data, error } = await sb.from('doc_requests').insert({ client_id: client.id, period: pdate, items, message: msg.value.trim() || null, email: email.value.trim() || null }).select('*').single();
    if (error) { fail(error, 'Nie utworzono prośby'); return null; }
    if (email.value.trim() && email.value.trim() !== (client.email || '') && confirm('Zapisać ten adres e-mail w karcie klienta?')) {
      await sb.from('clients').update({ email: email.value.trim() }).eq('id', client.id); client.email = email.value.trim();
    }
    return data;
  };
  const markSent = (r, via) => sb.from('doc_requests').update({ sent_at: new Date().toISOString(), sent_via: via }).eq('id', r.id);

  modal(`Prośba o dokumenty – ${client.name}`, h('div', { class: 'dr' },
    h('p', { class: 'muted' }, `Okres: ${periodLabel(period)}. Klient dostanie link, przez który wgra pliki bez logowania (także zdjęciem z telefonu). Pliki trafią do załączników w uwagach, a kratki „Brak dokumentów” wrócą do „Do zrobienia”. Bez odpowiedzi przez 3 dni – przypomnienie.`),
    preset.length ? h('div', {}, h('label', { class: 'lbl-sm' }, 'Brakuje'), ...boxes.map(b => h('label', { class: 'check' }, b, b._it.label))) : null,
    h('label', { class: 'lbl-sm' }, preset.length ? 'Dodatkowo' : 'Jakich dokumentów brakuje'), extra,
    h('label', { class: 'lbl-sm' }, 'Do'), email, msg, history),
  close => [
    h('button', { class: 'btn btn-ghost', onclick: async () => { const r = await create(); if (!r) return; await navigator.clipboard?.writeText(uploadLink(r.token)).catch(() => {}); await markSent(r, 'link'); toast('Skopiowano link dla klienta'); close(); onDone?.(r); } }, 'Tylko skopiuj link'),
    h('button', { class: 'btn btn-outline', onclick: async () => { const r = await create(); if (!r) return; location.href = mailtoHref(r, client); await markSent(r, 'mailto'); close(); onDone?.(r); } }, 'Otwórz w programie pocztowym'),
    h('button', { class: 'btn btn-primary', onclick: async (e) => {
      if (!email.value.trim()) { toast('Wpisz adres e-mail klienta', true); return; }
      e.target.disabled = true;
      const r = await create(); if (!r) { e.target.disabled = false; return; }
      const { data, error } = await sb.functions.invoke('docs', { body: { action: 'send', request_id: r.id } });
      if (!error && data?.sent) { toast(`Wysłano prośbę do ${r.email}`); close(); onDone?.(r); return; }
      // poczta biura nieskonfigurowana – otwieramy program pocztowy z gotową treścią
      toast(data?.reason === 'not_configured' ? 'Wysyłka z konta biura nie jest skonfigurowana – otwieram program pocztowy' : 'Nie udało się wysłać z konta biura – otwieram program pocztowy', true);
      location.href = mailtoHref(r, client); await markSent(r, 'mailto'); close(); onDone?.(r);
    } }, 'Wyślij e-mailem'),
  ]);
}
