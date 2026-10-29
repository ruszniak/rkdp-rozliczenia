// Wiadomość e-mail do jednego albo wielu klientów, wysyłana z aplikacji z adresu biura (kancelaria@rkdp.pl),
// podpisana przez osobę wysyłającą. Szablony: niezatwierdzone faktury KSeF w Saldeo, brak wyciągu bankowego, inne dokumenty.
import { h, toast, fail, modal, periodLabel, defaultPeriod, shiftPeriod } from './ui.js';
import { sb, state } from './store.js';
import { fetchAll } from './data.js';
import { uploadLink } from './prosba.js';

export const MSG_KINDS = {
  ksef: {
    label: 'Faktury KSeF w Saldeo', task: 'saldeo',
    subject: 'Niezatwierdzone faktury z KSeF w Saldeo – {okres}',
    body: `Dzień dobry,

w aplikacji SaldeoSMART widzimy faktury pobrane z Krajowego Systemu e-Faktur (KSeF) za {okres}, które nie zostały jeszcze przez Państwa zatwierdzone.

Prosimy o niezwłoczne zalogowanie się do Saldeo i zatwierdzenie faktur – bez tego nie możemy ich zaksięgować ani terminowo rozliczyć podatków.

Jeżeli któraś z faktur nie dotyczy Państwa działalności lub budzi wątpliwości, prosimy o informację w odpowiedzi na tę wiadomość.

Z poważaniem,`,
  },
  wyciag: {
    label: 'Wyciąg bankowy', task: 'wb',
    subject: 'Wyciąg bankowy za {okres} – prośba o przesłanie',
    body: `Dzień dobry,

nie otrzymaliśmy jeszcze wyciągu bankowego za {okres}.

Prosimy o przesłanie wyciągów ze wszystkich rachunków firmowych:
• w formie PDF oraz
• w formacie MT940 (plik do importu do programu księgowego)

– w odpowiedzi na tę wiadomość albo przez wgranie plików do aplikacji SaldeoSMART.

Wyciąg jest nam potrzebny do zaksięgowania operacji i terminowego rozliczenia.

Z poważaniem,`,
  },
  dokumenty: {
    label: 'Inne dokumenty', task: null,
    subject: 'Dokumenty do rozliczenia – {okres}',
    body: `Dzień dobry,

do rozliczenia za {okres} potrzebujemy jeszcze następujących dokumentów:
•

Pliki można przesłać w odpowiedzi na tę wiadomość albo wgrać bez logowania – także zdjęciem z telefonu:
{link}

Z poważaniem,`,
  },
};
const fmt = t => new Date(t).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
const emailOf = c => String(c.email || '').split(/[;,\s]+/).find(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) || '';

/**
 * @param {object} o
 * @param {Array<{id,name,email}>} o.clients – wstępnie wybrani klienci (jeden albo wielu)
 * @param {'ksef'|'wyciag'|'dokumenty'} [o.kind]
 * @param {string} [o.period] 'YYYY-MM'
 */
export async function openMessage({ clients = [], kind = 'ksef', period = defaultPeriod() } = {}) {
  let all = [];
  try { all = await fetchAll(() => sb.from('clients').select('id,name,email,status,legal_form').order('name')); } catch (e) { return fail(e); }
  const byId = new Map(all.map(c => [c.id, c]));
  const chosen = new Map(clients.map(c => [c.id, byId.get(c.id) || c]));
  let entries = [], last = new Map();
  const st = { kind, period };

  const kindTabs = h('div', { class: 'tabs msg-kinds' });
  const perSel = h('select', { class: 'select' }, ...Array.from({ length: 13 }, (_, i) => shiftPeriod(defaultPeriod(), 1 - i)).map(p => h('option', { value: p }, periodLabel(p))));
  perSel.value = st.period;
  const subj = h('input', { class: 'input' });
  const body = h('textarea', { class: 'input', rows: 12 });
  const mark = h('input', { type: 'checkbox', checked: true });
  const markLbl = h('label', { class: 'check small' }, mark, '');
  const withLink = h('input', { type: 'checkbox', checked: true });
  const linkLbl = h('label', { class: 'check small' }, withLink, 'Utwórz dla każdego klienta link do wgrania plików ({link} w treści)');
  const listBox = h('div', { class: 'msg-list' });
  const quick = h('div', { class: 'msg-quick' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Dodaj klienta – wpisz nazwę…' });
  const sugg = h('div', { class: 'msg-sugg' });
  const sig = h('p', { class: 'muted small msg-sig' });
  const sendBtn = h('button', { class: 'btn btn-primary' });

  const setTemplate = () => {
    const k = MSG_KINDS[st.kind];
    subj.value = k.subject; body.value = k.body;
    markLbl.hidden = !k.task; linkLbl.hidden = st.kind !== 'dokumenty';
    markLbl.lastChild.textContent = k.task ? `Po wysłaniu oznacz kratkę „${state.taskTypes.find(t => t.code === k.task)?.label || k.task}” jako „Wysłano przypomnienie”` : '';
    kindTabs.replaceChildren(...Object.entries(MSG_KINDS).map(([key, v]) => h('button', { type: 'button', class: st.kind === key ? 'on' : '', onclick: () => { st.kind = key; setTemplate(); drawQuick(); drawList(); } }, v.label)));
  };
  async function loadPeriod() {
    const pdate = st.period + '-01';
    [entries, last] = await Promise.all([
      fetchAll(() => sb.from('checklist_entries').select('client_id,task_code,status').eq('period', pdate)).catch(() => []),
      sb.from('client_messages').select('client_id,kind,sent_at,status').gte('sent_at', shiftPeriod(st.period, -1) + '-01').order('sent_at', { ascending: false })
        .then(r => { const m = new Map(); (r.data || []).forEach(x => { const k = x.client_id + '|' + x.kind; if (!m.has(k) && x.status === 'wyslano') m.set(k, x.sent_at); }); return m; }, () => new Map()),
    ]);
    drawQuick(); drawList();
  }
  // szybkie zaznaczanie: klienci, u których kratka Saldeo / Wyciągi nie jest zrobiona w wybranym miesiącu
  const pendingFor = code => [...new Set(entries.filter(e => e.task_code === code && !['done', 'na'].includes(e.status)).map(e => e.client_id))].filter(id => byId.get(id)?.status === 'aktywny');
  function drawQuick() {
    const k = MSG_KINDS[st.kind];
    if (!k.task) { quick.replaceChildren(); return; }
    const ids = pendingFor(k.task);
    quick.replaceChildren(h('button', { type: 'button', class: 'vchip add', disabled: !ids.length, onclick: () => { ids.forEach(id => chosen.set(id, byId.get(id))); drawList(); } },
      `+ wszyscy z niezrobioną kratką „${state.taskTypes.find(t => t.code === k.task)?.label}” (${ids.length})`),
      chosen.size ? h('button', { type: 'button', class: 'vchip add', onclick: () => { chosen.clear(); drawList(); } }, 'Wyczyść listę') : null);
  }
  function drawList() {
    const rows = [...chosen.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const ok = rows.filter(emailOf).length;
    listBox.replaceChildren(...(rows.length ? rows.map(c => {
      const em = emailOf(c), prev = last.get(c.id + '|' + st.kind);
      return h('div', { class: 'msg-row' + (em ? '' : ' no-mail') },
        h('span', { class: 'msg-n' }, c.name),
        em ? h('span', { class: 'muted small' }, em) : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
          const v = prompt(`Adres e-mail klienta ${c.name}:`, ''); if (!v?.trim()) return;
          const { error } = await sb.from('clients').update({ email: v.trim() }).eq('id', c.id);
          if (error) return fail(error); c.email = v.trim(); drawList(); toast('Zapisano adres w karcie klienta');
        } }, '+ dodaj e-mail'),
        prev ? h('span', { class: 'badge', 'data-tip': 'Ta wiadomość była już wysłana' }, `wysłano ${fmt(prev)}`) : null,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Usuń z listy', onclick: () => { chosen.delete(c.id); drawList(); drawQuick(); } }, '✕'));
    }) : [h('p', { class: 'hint' }, 'Dodaj klientów z wyszukiwarki albo przyciskiem powyżej.')]));
    sendBtn.textContent = ok ? `Wyślij do ${ok} ${ok === 1 ? 'klienta' : 'klientów'}` : 'Wyślij';
    sendBtn.disabled = !ok;
    drawQuick();
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    sugg.replaceChildren(...(q.length < 2 ? [] : all.filter(c => c.status === 'aktywny' && !chosen.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 8)
      .map(c => h('button', { type: 'button', class: 'opt', onclick: () => { chosen.set(c.id, c); search.value = ''; sugg.replaceChildren(); drawList(); } }, c.name, h('span', { class: 'muted small' }, emailOf(c) ? ' · ' + emailOf(c) : ' · brak e-maila')))));
  });
  perSel.addEventListener('change', () => { st.period = perSel.value; loadPeriod(); });

  const me = state.me;
  sig.textContent = `Podpis: ${me.full_name}${me.job_title ? ', ' + me.job_title : ''} · RKDP spółka doradztwa podatkowego sp. z o.o. · nadawca: kancelaria@rkdp.pl · {klient} i {okres} uzupełnią się dla każdego klienta.`;

  async function send(close) {
    const rows = [...chosen.values()].filter(emailOf);
    if (!rows.length) return;
    if (!subj.value.trim() || !body.value.trim()) return toast('Uzupełnij temat i treść', true);
    if (!confirm(`Wysłać wiadomość „${MSG_KINDS[st.kind].label}” do ${rows.length} ${rows.length === 1 ? 'klienta' : 'klientów'} z adresu kancelaria@rkdp.pl?`)) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Wysyłanie…';
    let links = null;
    if (st.kind === 'dokumenty' && withLink.checked) {
      links = {};
      for (const c of rows) {
        const { data, error } = await sb.from('doc_requests').insert({ client_id: c.id, period: st.period + '-01', items: [{ label: 'Dokumenty wskazane w wiadomości' }], email: emailOf(c), sent_at: new Date().toISOString(), sent_via: 'gmail' }).select('token').single();
        if (!error) links[c.id] = uploadLink(data.token);
      }
    }
    const { data, error } = await sb.functions.invoke('mail', { body: { action: 'send', kind: st.kind, period: st.period, subject: subj.value, body: body.value, client_ids: rows.map(c => c.id), mark_missing: !!MSG_KINDS[st.kind].task && mark.checked, links } });
    if (error || data?.error) {
      sendBtn.disabled = false; drawList();
      if (data?.error === 'not_configured') return notConfigured(rows, data.detail);
      return fail(error || data.error, 'Nie wysłano');
    }
    const bad = (data.results || []).filter(r => !r.ok);
    toast(`Wysłano: ${data.sent}${bad.length ? ` · nie wysłano: ${bad.length}` : ''}`, !!bad.length);
    if (bad.length) alert('Nie wysłano do:\n' + bad.map(r => `• ${byId.get(r.client_id)?.name || r.client_id}: ${r.error}`).join('\n'));
    close();
  }
  // poczta biura jeszcze nieskonfigurowana – instrukcja i wysyłka z programu pocztowego (UDW, bez ujawniania adresów)
  function notConfigured(rows, detail) {
    const txt = body.value.replaceAll('{okres}', periodLabel(st.period)).replaceAll('{klient}', '').replaceAll('{link}', '') + `\n\n${me.full_name}${me.job_title ? '\n' + me.job_title : ''}\nRKDP spółka doradztwa podatkowego sp. z o.o.\nkancelaria@rkdp.pl`;
    const href = `mailto:?bcc=${encodeURIComponent(rows.map(emailOf).join(','))}&subject=${encodeURIComponent(subj.value.replaceAll('{okres}', periodLabel(st.period)).replaceAll(' – {klient}', '').replaceAll('{klient}', ''))}&body=${encodeURIComponent(txt)}`;
    modal('Wysyłka z kancelaria@rkdp.pl nie jest jeszcze włączona', h('div', {},
      h('p', {}, 'Aplikacja wysyła pocztę przez Gmail konta michal@ruszniak.io z adresu kancelaria@rkdp.pl (alias „Wyślij jako” jest już ustawiony). Brakuje tylko hasła aplikacji w Supabase – jednorazowo:'),
      h('ol', { class: 'small' },
        h('li', {}, 'myaccount.google.com/apppasswords (konto michal@ruszniak.io) → utwórz hasło aplikacji, np. „RKDP aplikacja”.'),
        h('li', {}, 'supabase.com → projekt → Edge Functions → Secrets: SMTP_USER = michal@ruszniak.io oraz SMTP_PASS = 16-znakowe hasło aplikacji.'),
        h('li', {}, 'Zespół i ustawienia → „Sprawdź wysyłkę”.')),
      detail ? h('p', { class: 'muted small' }, `Szczegóły: ${detail}`) : null,
      h('p', {}, 'Na razie możesz wysłać jedną wiadomość z własnego programu pocztowego – wszyscy klienci w polu UDW (nie widzą się nawzajem), bez nazwy klienta w treści.')),
    c2 => [h('button', { class: 'btn btn-ghost', onclick: c2 }, 'Zamknij'), h('a', { class: 'btn btn-primary', href, onclick: () => c2() }, 'Otwórz w programie pocztowym')]);
  }

  setTemplate();
  modal('Wiadomość do klientów', h('div', { class: 'msg' },
    kindTabs,
    h('div', { class: 'msg-grid' },
      h('div', {},
        h('label', { class: 'lbl-sm' }, 'Okres'), perSel,
        h('label', { class: 'lbl-sm' }, 'Odbiorcy – każdy dostaje osobną wiadomość'), quick, search, sugg, listBox),
      h('div', {},
        h('label', { class: 'lbl-sm' }, 'Temat'), subj,
        h('label', { class: 'lbl-sm' }, 'Treść'), body, sig, markLbl, linkLbl))),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), (sendBtn.onclick = () => send(close), sendBtn)], { wide: true });
  drawList();
  loadPeriod();
}
