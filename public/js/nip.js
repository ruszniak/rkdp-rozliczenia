// Wyszukiwanie kontrahenta po NIP (Biała lista VAT przez funkcję serwerową nip-lookup)
import { h, toast } from './ui.js';
import { sb } from './store.js';

export const cleanNip = (v) => String(v || '').replace(/\D/g, '');
export function validNip(nip) {
  const n = cleanNip(nip);
  if (!/^\d{10}$/.test(n)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  return w.reduce((s, x, i) => s + x * Number(n[i]), 0) % 11 === Number(n[9]);
}

export async function lookupNip(nip) {
  const n = cleanNip(nip);
  if (!validNip(n)) throw new Error('Nieprawidłowy numer NIP – sprawdź cyfry.');
  const { data, error } = await sb.functions.invoke('nip-lookup', { body: { nip: n } });
  if (error) {
    let msg = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const vatLine = (r) => r?.found
  ? `Biała lista VAT ${r.checkedAt.split('-').reverse().join('.')}: ${r.statusVat || 'brak statusu'}${r.requestId ? ` (nr zapytania ${r.requestId})` : ''}`
  : `Biała lista VAT ${r?.checkedAt?.split('-').reverse().join('.') || ''}: nie znaleziono podmiotu`;

// Pasek: [NIP] [Pobierz dane] + wynik. onData(result) – wypełnia formularz.
export function nipLookupBar(initialNip, onData) {
  const input = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'NIP, np. 899-287-11-26', value: initialNip || '', style: { width: '200px' } });
  const info = h('div', { class: 'small', style: { flexBasis: '100%' } });
  const btn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Szukam…'; info.textContent = '';
    try {
      const r = await lookupNip(input.value);
      if (!r.found) { info.replaceChildren(h('span', { class: 'err' }, 'Nie znaleziono w wykazie podatników VAT. Firma może nie być podatnikiem VAT – uzupełnij dane ręcznie (po podłączeniu GUS znajdziemy też takie podmioty).')); return; }
      info.replaceChildren(h('b', {}, r.name), ` · status VAT: `, h('b', { class: r.statusVat === 'Czynny' ? '' : 'err' }, r.statusVat || '—'),
        r.krs ? ` · KRS ${r.krs}` : '', r.accounts?.length ? ` · rachunków w wykazie: ${r.accounts.length}` : '',
        h('span', { class: 'muted' }, ` · źródło: Biała lista MF, ${r.checkedAt.split('-').reverse().join('.')}`));
      onData(r);
    } catch (e) {
      info.replaceChildren(h('span', { class: 'err' }, e.message));
    } finally { btn.disabled = false; btn.textContent = 'Pobierz dane'; }
  } }, 'Pobierz dane');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
  return h('div', { class: 'panel nip-bar' },
    h('span', { class: 'eyebrow' }, 'Dane z NIP'), input, btn, info);
}

// Zwraca pola do wpisania w formularz klienta; nadpisuje nazwę tylko za zgodą
export function mergeNipData(target, r, { nameField = 'name' } = {}) {
  if (r.name && target[nameField] && target[nameField].trim() !== r.name.trim()
      && !confirm(`Zastąpić nazwę „${target[nameField]}” nazwą z rejestru:\n„${r.name}”?`)) {
    // zostaw nazwę
  } else if (r.name) target[nameField] = r.name;
  if (r.nip) target.nip = r.nip;
  if (r.regon) target.regon = r.regon;
  if (r.krs) target.krs = r.krs;
  if (r.address) target.address = r.address;
  toast('Uzupełniono dane z Białej listy – sprawdź i zapisz');
}
