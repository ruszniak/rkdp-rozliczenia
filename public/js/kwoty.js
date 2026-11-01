// Kwoty do zapłaty dla klienta (VAT, PIT/CIT, ZUS, PIT-4): kwota i termin przy kratce, rachunki klienta,
// jeden e-mail z kwotami z kancelaria@rkdp.pl i automatyczne odhaczenie kratek „podany”.
import { h, toast, fail, modal } from './ui.js';
import { sb } from './store.js';

export const AMOUNT_CODES = ['vat', 'pit_cit', 'zus_podany', 'pit4'];
const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const fmtD = d => d ? d.split('-').reverse().join('.') : '';
const money = n => (+n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const nextMonthDay = (period, day) => { const [y, m] = period.split('-').map(Number); const d = new Date(Date.UTC(y, m, day)); return d.toISOString().slice(0, 10); };
const acc = s => String(s || '').replace(/\s+/g, '').replace(/^PL/i, '');
const accFmt = s => { const a = acc(s); return a ? a.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6 $7') : ''; };
const accOk = s => /^\d{26}$/.test(acc(s));
// mikrorachunek podatkowy z NIP (podatki.gov.pl): KK + 10100071 + 222 + „2” (NIP) + NIP + 00; KK jak w IBAN (mod 97, „PL” = 2521)
export function mikrorachunek(nip) {
  const n = String(nip || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(n)) return '';
  const bban = '10100071' + '222' + '2' + n + '00';
  const s = bban + '252100';
  let r = 0; for (const ch of s) r = (r * 10 + +ch) % 97;
  return String(98 - r).padStart(2, '0') + bban;
}
const parseAmt = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) / 100 : null; };

function lines(c, period) {
  const yy = period.slice(2, 4), mm = period.slice(5, 7);
  const pitSym = { skala: 'PIT-36', liniowy: 'PIT-36L', ryczalt: 'PIT-28' }[c.pit_form] || 'PIT-36';
  const company = ['spzoo', 'spolka_akcyjna'].includes(c.legal_form);
  return {
    vat: { label: 'VAT', due: nextMonthDay(period, 25), account: 'tax', title: `VAT-7 ${yy}M${mm}` },
    pit_cit: { label: company ? 'CIT – zaliczka' : 'PIT – zaliczka', due: nextMonthDay(period, 20), account: 'tax', title: company ? `${c.cit_type === 'estonski' ? 'CIT-8E' : 'CIT-8'} ${yy}M${mm}` : `${pitSym} ${yy}M${mm}` },
    zus_podany: { label: 'ZUS – składki', due: nextMonthDay(period, 20), account: 'zus', title: '' },
    pit4: { label: 'PIT-4 – zaliczka od wynagrodzeń', due: nextMonthDay(period, 20), account: 'tax', title: `PIT-4R ${yy}M${mm}` },
  };
}

// entries: kratki klienta w miesiącu (task_code → entry); onDone(): odśwież widok
export async function openAmounts({ client, period, entries, onDone }) {
  const { data: c, error } = await sb.from('clients').select('id,name,email,nip,legal_form,pit_form,cit_type,acc_tax,acc_zus').eq('id', client.id).single();
  if (error) return fail(error);
  const autoTax = !c.acc_tax && mikrorachunek(c.nip);
  if (autoTax) c.acc_tax_auto = autoTax;
  const L = lines(c, period);
  const rows = AMOUNT_CODES.map(code => ({ code, e: entries.get(code) })).filter(r => r.e && r.e.status !== 'na');
  if (!rows.length) return toast('Ten klient nie ma w tym miesiącu kratek z kwotami (VAT, PIT/CIT, ZUS, PIT-4)', true);
  const accTax = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'mikrorachunek podatkowy (26 cyfr)', value: accFmt(c.acc_tax || c.acc_tax_auto) });
  const accZus = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'rachunek składkowy ZUS (26 cyfr)', value: accFmt(c.acc_zus) });
  const inputs = rows.map(r => {
    const amt = h('input', { class: 'input kw-amt', inputmode: 'decimal', placeholder: '0,00', value: r.e.amount != null ? String(r.e.amount).replace('.', ',') : '' });
    const due = h('input', { class: 'input', type: 'date', value: r.e.due_date || L[r.code].due });
    const on = h('input', { type: 'checkbox', checked: true });
    return { ...r, amt, due, on };
  });
  const sumEl = h('b', {});
  const recalc = () => { const s = inputs.filter(i => i.on.checked).reduce((t, i) => t + (parseAmt(i.amt.value) || 0), 0); sumEl.textContent = money(s); };
  inputs.forEach(i => { i.amt.addEventListener('input', recalc); i.on.addEventListener('change', recalc); });
  recalc();
  const periodLbl = `${MON[+period.slice(5, 7) - 1]} ${period.slice(0, 4)}`;

  async function saveAll() {
    const bad = inputs.find(i => i.amt.value.trim() && parseAmt(i.amt.value) == null);
    if (bad) { bad.amt.focus(); toast('Wpisz kwotę liczbą', true); return false; }
    for (const i of inputs) {
      const amount = i.amt.value.trim() ? parseAmt(i.amt.value) : null;
      if (amount === (i.e.amount ?? null) && (i.due.value || null) === (i.e.due_date || null)) continue;
      const { error: e } = await sb.from('checklist_entries').update({ amount, due_date: i.due.value || null }).eq('id', i.e.id);
      if (e) { fail(e); return false; }
      i.e.amount = amount; i.e.due_date = i.due.value || null;
    }
    const upd = {};
    if (acc(accTax.value) !== acc(c.acc_tax)) upd.acc_tax = acc(accTax.value) || null;
    if (acc(accZus.value) !== acc(c.acc_zus)) upd.acc_zus = acc(accZus.value) || null;
    if (Object.keys(upd).length) { const { error: e } = await sb.from('clients').update(upd).eq('id', c.id); if (e) { fail(e); return false; } Object.assign(c, upd); }
    return true;
  }
  function mailText(chosen) {
    const t = chosen.map(i => {
      const l = L[i.code], a = l.account === 'zus' ? c.acc_zus : c.acc_tax;
      return [`• ${l.label}: ${money(parseAmt(i.amt.value))} – termin ${fmtD(i.due.value)}`,
        a ? `  rachunek: ${accFmt(a)}${l.account === 'tax' ? ' (mikrorachunek podatkowy)' : ' (rachunek składkowy ZUS)'}` : '',
        l.title ? `  tytuł przelewu: ${l.title}` : ''].filter(Boolean).join('\n');
    }).join('\n');
    const total = chosen.reduce((s, i) => s + parseAmt(i.amt.value), 0);
    return `Dzień dobry,\n\nprzekazujemy kwoty do zapłaty za ${periodLbl}:\n\n${t}\n\nRazem: ${money(total)}.\n\nProsimy o terminowe przelewy. W razie pytań jesteśmy do dyspozycji.`;
  }

  modal(`Kwoty do zapłaty – ${c.name}`, h('div', { class: 'kw' },
    h('p', { class: 'small muted', style: { marginTop: 0 } }, `Okres: ${periodLbl}. Wpisz kwoty – możesz je tylko zapisać albo od razu wysłać klientowi jednym mailem (z kancelaria@rkdp.pl). Wysłane pozycje odhaczą się w Rozliczeniach.`),
    h('div', { class: 'kw-rows' }, ...inputs.map(i => h('div', { class: 'kw-row' },
      h('label', { class: 'check kw-name' }, i.on, L[i.code].label),
      h('label', { class: 'field' }, h('span', {}, 'Kwota (zł)'), i.amt),
      h('label', { class: 'field' }, h('span', {}, 'Termin'), i.due)))),
    h('div', { class: 'kw-sum' }, 'Razem do wysłania: ', sumEl),
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Mikrorachunek podatkowy (VAT, PIT/CIT, PIT-4)'), accTax),
      h('label', { class: 'field' }, h('span', {}, 'Rachunek składkowy ZUS'), accZus)),
    h('p', { class: 'small muted' }, c.acc_tax_auto ? 'Mikrorachunek wyliczony automatycznie z NIP klienta (zapisze się w karcie). Rachunek ZUS (NRS) nadaje ZUS – skopiuj go raz z PUE/eZUS albo z pisma ZUS.' : 'Rachunek ZUS (NRS) nadaje ZUS – skopiuj go raz z PUE/eZUS albo z pisma ZUS; zapamięta się w karcie klienta.')),
  close => [
    h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-outline', onclick: async () => { if (await saveAll()) { close(); toast('Zapisano kwoty'); onDone?.(); } } }, 'Zapisz'),
    h('button', { class: 'btn btn-primary', onclick: async e => {
      const chosen = inputs.filter(i => i.on.checked && parseAmt(i.amt.value) != null && i.amt.value.trim());
      if (!chosen.length) return toast('Wpisz co najmniej jedną kwotę', true);
      if ([accTax, accZus].some(x => x.value.trim() && !accOk(x.value))) return toast('Numer rachunku powinien mieć 26 cyfr', true);
      if (!c.email) return toast('Klient nie ma adresu e-mail w karcie', true);
      if (!(await saveAll())) return;
      const body = mailText(chosen);
      const btn = e.currentTarget;
      modal('Podgląd wiadomości', h('div', {}, h('p', { class: 'small muted', style: { marginTop: 0 } }, `Do: ${c.email} · Temat: Kwoty do zapłaty – ${periodLbl}`), h('pre', { class: 'wt-mailbody' }, body)),
        c2 => [h('button', { class: 'btn btn-ghost', onclick: c2 }, 'Wróć'), h('button', { class: 'btn btn-primary', onclick: async ev => {
          ev.currentTarget.disabled = true; btn.disabled = true;
          const { data, error: er } = await sb.functions.invoke('mail', { body: { action: 'send', kind: 'kwoty', period, client_ids: [c.id], subject: `Kwoty do zapłaty – ${periodLbl}`, body, mark_done: { [c.id]: chosen.map(i => i.code) } } });
          c2();
          if (er) { btn.disabled = false; return fail(er); }
          if (data?.error === 'not_configured') { btn.disabled = false; return toast('Wysyłka e-maili nie jest skonfigurowana', true); }
          if (data?.error) { btn.disabled = false; return toast(data.error, true); }
          if (!data?.sent) { btn.disabled = false; return toast('Nie udało się wysłać: ' + (data?.results?.[0]?.error || ''), true); }
          chosen.forEach(i => { i.e.status = 'done'; });
          close(); toast('Wysłano kwoty do klienta i odhaczono kratki'); onDone?.();
        } }, 'Wyślij')], { wide: true });
    } }, 'Wyślij klientowi…')], { wide: true });
}
