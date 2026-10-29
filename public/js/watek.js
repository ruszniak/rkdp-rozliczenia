// Wątek klienta – jedna rozmowa o kliencie, podzielona na miesiące rozliczeniowe:
// uwagi, pytania, zadania (zgłoszenia) z odpowiedziami, załączniki, wysłane e-maile i zmiany kratek.
// Przypięte ustalenia na górze, otwarte pytania z wcześniejszych miesięcy, @wzmianki, edycja z historią,
// usuwanie ze śladem, wyszukiwarka i eksport historii do PDF. Licznik „Nieprzeczytane” w górnym pasku.
import { h, icon, toast, toastAction, fail, periodLabel, shiftPeriod, defaultPeriod, initials, printHtml, modal } from './ui.js';
import { sb, state, memberById } from './store.js';
import { STATUS } from './dict.js';
import { fileTile, pastedFiles, named, safeName, TK_STATUS, TK_PRIO } from './views/zgloszenia.js';
import { paper, esc } from './papier.js';

const QUICK = ['Brak wyciągu bankowego – prośba wysłana', 'Czekamy na zatwierdzenie faktur KSeF w Saldeo', 'Zaksięgowane', 'Do wyjaśnienia z klientem', 'Klient potwierdził telefonicznie'];
const who = id => id ? (memberById(id)?.short_name || memberById(id)?.full_name || 'ktoś') : 'wcześniej';
const whoEmail = e => state.members.find(m => m.email === e)?.short_name || (e === 'system' ? 'system' : String(e || '').split('@')[0]);
const tm = t => new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dt = t => new Date(t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayLbl = t => { const d = new Date(t), now = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Dziś'; if (d.toDateString() === y.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); };
const active = () => state.members.filter(m => m.active !== false);
const mentionsIn = body => active().filter(m => m.short_name && new RegExp(`@${m.short_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu').test(body)).map(m => m.id);
const mentionHtml = body => {
  const parts = String(body).split(/(@[\p{L}][\p{L}\-]*)/u);
  return parts.map(p => p.startsWith('@') && active().some(m => '@' + (m.short_name || '').toLowerCase() === p.toLowerCase()) ? h('span', { class: 'wt-at' }, p) : p);
};
const taskLabel = code => state.taskTypes?.find(t => t.code === code)?.label || code;
const nextMonth = p => shiftPeriod(p, 1) + '-01';

let open = null; // jeden wątek naraz
export function closeThread() { open?.close(); }

export async function openThread({ client, period = defaultPeriod(), focus = null, onChange = null }) {
  closeThread();
  if (!client?.name) { const { data } = await sb.from('clients').select('id,name,email,accountant_id,hr_id').eq('id', client.id || client).maybeSingle(); client = data; }
  if (!client) return toast('Nie znaleziono klienta', true);
  const me = state.me.id, admin = state.me.role === 'admin';
  let per = period, kind = 'uwaga', replyTo = null, editing = null, searching = false;
  let D = { cm: [], pins: [], carry: [], tickets: [], tcom: [], mails: [], files: [], audit: [] };
  const expanded = new Set();

  // ---------- szkielet ----------
  const thread = h('div', { class: 'wt-thread', role: 'log', 'aria-live': 'polite' });
  const pinsBox = h('div', { class: 'wt-pins' });
  const carryBox = h('div', { class: 'wt-carry-w' });
  const monthLbl = h('b', {});
  const searchIn = h('input', { class: 'input wt-search-in', type: 'search', placeholder: 'Szukaj w całej historii klienta…', hidden: true });
  const ta = h('textarea', { class: 'chat-input', rows: 1, placeholder: 'Napisz… (@ oznacza osobę)' });
  const sendBtn = h('button', { type: 'button', class: 'chat-send', 'aria-label': 'Wyślij', onclick: () => send() },
    h('span', { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>', style: { display: 'inline-flex' } }));
  const kinds = h('div', { class: 'chat-kinds', role: 'group', 'aria-label': 'Rodzaj wpisu' },
    ...[['uwaga', 'Uwaga'], ['pytanie', 'Pytanie'], ['zadanie', 'Zadanie']].map(([k, l]) => h('button', { type: 'button', class: 'chat-kind' + (k === kind ? ' on' : ''), 'data-k': k, onclick: () => setKind(k) }, l)),
    h('button', { type: 'button', class: 'chat-kind wt-qbtn', 'aria-label': 'Szybkie odpowiedzi', 'data-tip': 'Szybkie odpowiedzi', onclick: () => { quick.hidden = !quick.hidden; } }, '⚡'));
  const quick = h('div', { class: 'wt-quick', hidden: true }, ...QUICK.map(q => h('button', { type: 'button', class: 'arch-chip', onclick: () => { ta.value = (ta.value ? ta.value + ' ' : '') + q; grow(); ta.focus(); quick.hidden = true; } }, q)));
  const asg = h('select', { class: 'select' }, ...active().map(m => h('option', { value: m.id, selected: m.id === (client.accountant_id || me) }, m.full_name)));
  const due = h('input', { class: 'input', type: 'date' });
  const prio = h('select', { class: 'select' }, ...Object.entries(TK_PRIO).map(([k, v]) => h('option', { value: k, selected: k === 'normalny' }, v)));
  const taskOpts = h('div', { class: 'wt-taskopts', hidden: true }, h('label', {}, 'Kto', asg), h('label', {}, 'Termin', due), h('label', {}, 'Priorytet', prio));
  const replyBar = h('div', { class: 'wt-reply', hidden: true });
  const mentionPop = h('div', { class: 'wt-mention', hidden: true });
  const fileIn = h('input', { type: 'file', multiple: true, hidden: true });
  fileIn.addEventListener('change', () => { const fs = [...fileIn.files]; fileIn.value = ''; if (fs.length) addFiles(fs); });
  const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  camIn.addEventListener('change', () => { const fs = [...camIn.files]; camIn.value = ''; if (fs.length) addFiles(fs); });

  const drawer = h('aside', { class: 'wt', role: 'dialog', 'aria-label': `Rozmowa – ${client.name}` },
    h('div', { class: 'wt-head' },
      h('div', { class: 'wt-title' }, h('b', {}, client.name),
        h('div', { class: 'wt-month' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Poprzedni miesiąc', onclick: () => go(shiftPeriod(per, -1)) }, icon('left')), monthLbl,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Następny miesiąc', onclick: () => go(shiftPeriod(per, 1)) }, icon('right')))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Szukaj', 'data-tip': 'Szukaj w historii', onclick: toggleSearch }, h('span', { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>', style: { display: 'inline-flex' } })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Eksport historii do PDF', 'data-tip': 'Historia do PDF', onclick: exportDialog }, icon('download')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Wiadomość e-mail do klienta', 'data-tip': 'E-mail do klienta (kancelaria@rkdp.pl)', onclick: () => import('./wiadomosc.js').then(m => m.openMessage({ clients: [client], kind: 'dokumenty', period: per })) }, icon('mail')),
      h('a', { class: 'icon-btn', href: `#/klient/${client.id}`, 'aria-label': 'Karta klienta', 'data-tip': 'Karta klienta', onclick: () => close() }, '↗'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zamknij', onclick: () => close() }, '×')),
    searchIn, pinsBox, carryBox, thread,
    h('div', { class: 'chat-compose wt-compose' }, replyBar, kinds, quick, taskOpts,
      h('div', { class: 'chat-row' }, fileIn, camIn,
        h('button', { type: 'button', class: 'chat-tool', 'aria-label': 'Dodaj załącznik', 'data-tip': 'Załącz plik (albo przeciągnij / wklej zrzut)', onclick: () => fileIn.click() }, icon('paperclip')),
        h('button', { type: 'button', class: 'chat-tool cam-btn', 'aria-label': 'Zrób zdjęcie', onclick: () => camIn.click() }, icon('camera')),
        h('div', { class: 'wt-inwrap' }, mentionPop, ta), sendBtn)),
    h('div', { class: 'chat-dropzone', 'aria-hidden': 'true' }, icon('paperclip'), 'Upuść, aby załączyć'));
  const back = h('div', { class: 'wt-back', onclick: () => close() });
  document.body.append(back, drawer);
  requestAnimationFrame(() => { back.classList.add('on'); drawer.classList.add('on'); });

  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) { if (!mentionPop.hidden) { mentionPop.hidden = true; return; } close(); } };
  document.addEventListener('keydown', onKey);
  ['dragenter', 'dragover'].forEach(ev => drawer.addEventListener(ev, e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); drawer.classList.add('dropping'); } }));
  drawer.addEventListener('dragleave', e => { if (!drawer.contains(e.relatedTarget)) drawer.classList.remove('dropping'); });
  drawer.addEventListener('drop', e => { e.preventDefault(); drawer.classList.remove('dropping'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) addFiles(fs); });
  drawer.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); addFiles(fs); } });

  const ch = sb.channel('wt-' + client.id + '-' + Math.random().toString(36).slice(2, 7))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'period_comments', filter: `client_id=eq.${client.id}` }, () => { if (!searching) reload(true); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rkdp_ticket_comments' }, p => { if (D.tickets.some(t => t.id === p.new?.ticket_id)) reload(true); })
    .subscribe();
  function close() {
    if (!drawer.isConnected) return;
    sb.removeChannel(ch); document.removeEventListener('keydown', onKey);
    drawer.classList.remove('on'); back.classList.remove('on');
    setTimeout(() => { drawer.remove(); back.remove(); }, 220);
    markRead();
    if (open?.drawer === drawer) open = null;
  }
  open = { close, drawer };
  const markRead = () => sb.from('thread_reads').upsert({ member_id: me, client_id: client.id, read_at: new Date().toISOString() }, { onConflict: 'member_id,client_id' }).then(() => refreshUnread(), () => {});

  // ---------- pisanie ----------
  function setKind(k) {
    kind = k; kinds.querySelectorAll('.chat-kind[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    taskOpts.hidden = k !== 'zadanie' || !!replyTo;
    ta.placeholder = k === 'zadanie' ? 'Co trzeba zrobić? (pierwsza linia = tytuł zadania)' : k === 'pytanie' ? 'Np. jak ująć leasing? brak pełnomocnictwa…' : 'Napisz… (@ oznacza osobę)';
    ta.focus();
  }
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  ta.addEventListener('input', () => { grow(); mentionSuggest(); });
  ta.addEventListener('keydown', e => {
    if (!mentionPop.hidden && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
      const items = [...mentionPop.children]; let i = items.findIndex(x => x.classList.contains('on'));
      if (e.key === 'ArrowDown') i = (i + 1) % items.length; else if (e.key === 'ArrowUp') i = (i - 1 + items.length) % items.length;
      else { e.preventDefault(); items[Math.max(0, i)]?.click(); return; }
      e.preventDefault(); items.forEach((x, j) => x.classList.toggle('on', j === i)); return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  function mentionSuggest() {
    const pos = ta.selectionStart, before = ta.value.slice(0, pos), m = before.match(/@([\p{L}]*)$/u);
    if (!m) { mentionPop.hidden = true; return; }
    const q = m[1].toLowerCase(), list = active().filter(x => (x.short_name || '').toLowerCase().startsWith(q) || x.full_name.toLowerCase().includes(q)).slice(0, 6);
    if (!list.length) { mentionPop.hidden = true; return; }
    mentionPop.replaceChildren(...list.map((x, i) => h('button', { type: 'button', class: 'wt-m' + (i === 0 ? ' on' : ''), onmousedown: e => e.preventDefault(), onclick: () => {
      ta.value = before.slice(0, -m[0].length) + '@' + x.short_name + ' ' + ta.value.slice(pos); mentionPop.hidden = true; ta.focus(); grow();
    } }, h('span', { class: 'av chat-av' }, initials(x.full_name)), x.full_name)));
    mentionPop.hidden = false;
  }
  function setReply(r) {
    replyTo = r; taskOpts.hidden = kind !== 'zadanie' || !!r; kinds.hidden = !!r;
    replyBar.hidden = !r;
    if (r) replyBar.replaceChildren(h('span', {}, '↳ Odpowiadasz: ', h('b', {}, r.label)), h('button', { type: 'button', class: 'chat-a', onclick: () => setReply(null) }, 'anuluj'));
    ta.focus();
  }
  async function send() {
    const body = ta.value.trim();
    if (!body) return ta.focus();
    sendBtn.disabled = true;
    let error = null;
    const pdate = per + '-01';
    if (replyTo?.type === 't') ({ error } = await sb.from('rkdp_ticket_comments').insert({ ticket_id: replyTo.id, body }));
    else if (replyTo?.type === 'c') ({ error } = await sb.from('period_comments').insert({ client_id: client.id, period: replyTo.period, kind: 'uwaga', body, parent_id: replyTo.id, mentions: mentionsIn(body) }));
    else if (kind === 'zadanie') {
      const [first, ...rest] = body.split('\n');
      ({ error } = await sb.from('rkdp_tickets').insert({ module: 'rkdp', title: first.slice(0, 200), description: (rest.join('\n').trim() || (first.length > 200 ? body : '')) || null,
        client_id: client.id, period: pdate, category: 'inne', priority: prio.value, assignee_id: asg.value || null, due_date: due.value || null, source: 'wątek klienta' }));
      if (!error) { toast('Utworzono zadanie' + (asg.value && asg.value !== me ? ` dla: ${who(asg.value)}` : '')); due.value = ''; setKind('uwaga'); }
    } else ({ error } = await sb.from('period_comments').insert({ client_id: client.id, period: pdate, kind, body, mentions: mentionsIn(body) }));
    sendBtn.disabled = false;
    if (error) return fail(error);
    if (replyTo) expanded.add(replyTo.key);
    ta.value = ''; grow(); setReply(null);
    await reload(true); onChange?.(); ta.focus();
  }
  async function addFiles(fs) {
    drawer.classList.add('busy'); let ok = 0;
    for (const raw of fs) {
      const f = named(raw);
      if (f.size > 25 * 1048576) { toast(`„${f.name}” jest większy niż 25 MB`, true); continue; }
      const path = `${client.id}/${per}/${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
      const { error } = await sb.storage.from('rozliczenia').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) { fail(error, `Nie udało się wysłać „${f.name}”`); continue; }
      const { error: e2 } = await sb.from('period_files').insert({ client_id: client.id, period: per + '-01', path, name: f.name, mime: f.type || null, size: f.size, uploaded_by: me });
      if (e2) { await sb.storage.from('rozliczenia').remove([path]); fail(e2); continue; }
      ok++;
    }
    drawer.classList.remove('busy');
    if (ok) { toast(ok === 1 ? 'Dodano załącznik' : `Dodano załączniki: ${ok}`); await reload(true); onChange?.(); }
  }

  // ---------- akcje na wpisach ----------
  const upd = async (id, patch, msg) => { const { error } = await sb.from('period_comments').update(patch).eq('id', id); if (error) return fail(error); if (msg) toast(msg); await reload(true); onChange?.(); };
  const toTask = x => {
    const [first] = x.body.split('\n');
    asg.value = client.accountant_id || me; setKind('zadanie'); setReply(null);
    ta.value = first + (x.body.length > first.length ? '\n' + x.body.slice(first.length + 1) : ''); grow();
    toast('Ustaw osobę i termin, potem wyślij – powstanie zadanie');
  };
  async function setTicketStatus(t, st) {
    const { error } = await sb.from('rkdp_tickets').update({ status: st }).eq('id', t.id);
    if (error) return fail(error);
    await reload(true); onChange?.();
    if (st === 'czeka') toastAction('Zadanie czeka na klienta', 'Napisz do klienta', () => import('./wiadomosc.js').then(m => m.openMessage({ clients: [client], kind: 'dokumenty', period: per })), 9000);
  }

  // ---------- rysowanie ----------
  const avatar = id => h('span', { class: 'av chat-av' + (id ? '' : ' none'), 'aria-hidden': 'true' }, id ? initials(memberById(id)?.full_name || '?') : '');
  function bubble(x, { reply = false } = {}) {
    if (x.deleted_at) return h('div', { class: 'chat-sys wt-del' }, `Wiadomość usunięta${x.deleted_by && x.deleted_by !== x.author ? ` przez ${who(x.deleted_by)}` : ''} · ${who(x.author)}, ${tm(x.created_at)}`);
    const mine = x.author === me, q = x.kind === 'pytanie';
    if (editing === x.id) {
      const ed = h('textarea', { class: 'input', rows: 3 }, x.body);
      setTimeout(() => ed.focus(), 0);
      return h('div', { class: 'chat-msg mine wt-editing' }, h('div', { class: 'chat-bub' }, ed,
        h('div', { class: 'wt-edit-acts' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { editing = null; draw(); } }, 'Anuluj'),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { const b = ed.value.trim(); if (!b) return; editing = null; upd(x.id, { body: b, mentions: mentionsIn(b) }, 'Zapisano zmianę'); } }, 'Zapisz'))));
    }
    const hist = (x.history || []).length ? h('details', { class: 'wt-hist' }, h('summary', {}, `edytowano ${tm(x.edited_at)}`),
      ...x.history.map(v => h('div', {}, h('span', { class: 'muted' }, dt(v.at) + ': '), v.body))) : null;
    const acts = h('div', { class: 'chat-acts' },
      !reply ? h('button', { type: 'button', class: 'chat-a', onclick: () => setReply({ type: 'c', id: x.id, period: x.period, key: 'c' + x.id, label: x.body.slice(0, 60) }) }, 'Odpowiedz') : null,
      q && !reply ? h('button', { type: 'button', class: 'chat-a', onclick: () => upd(x.id, { resolved_at: x.resolved_at ? null : new Date().toISOString() }) }, x.resolved_at ? 'Otwórz ponownie' : '✓ Wyjaśnione') : null,
      !reply ? h('button', { type: 'button', class: 'chat-a', onclick: () => upd(x.id, { pinned: !x.pinned }, x.pinned ? 'Odpięto' : 'Przypięto na górze wątku') }, x.pinned ? 'Odepnij' : 'Przypnij') : null,
      !reply ? h('button', { type: 'button', class: 'chat-a', onclick: () => toTask(x) }, 'Zrób zadanie') : null,
      mine ? h('button', { type: 'button', class: 'chat-a', onclick: () => { editing = x.id; draw(); } }, 'Edytuj') : null,
      mine || admin ? h('button', { type: 'button', class: 'chat-a', onclick: () => { if (confirm('Usunąć wpis? W historii zostanie ślad „wiadomość usunięta”.')) upd(x.id, { deleted_at: new Date().toISOString() }, 'Usunięto'); } }, 'Usuń') : null);
    return h('div', { class: 'chat-msg' + (mine ? ' mine' : '') + (q ? ' q' : '') + (x.resolved_at ? ' done' : '') + (reply ? ' wt-r' : ''), 'data-id': x.id },
      !mine ? avatar(x.author) : null,
      h('div', { class: 'chat-bub' },
        h('div', { class: 'chat-meta' }, h('b', {}, mine ? 'Ty' : who(x.author)), q ? h('span', { class: 'chat-tag' }, x.resolved_at ? 'pytanie · wyjaśnione' : 'pytanie') : null,
          x.pinned ? h('span', { class: 'chat-tag' }, '📌') : null, h('span', {}, tm(x.created_at))),
        h('div', { class: 'chat-txt' }, ...mentionHtml(x.body)), hist, acts));
  }
  function replies(key, list, render) {
    if (!list.length) return null;
    const isOpen = expanded.has(key) || list.length <= 2;
    return h('div', { class: 'wt-replies' },
      isOpen ? null : h('button', { type: 'button', class: 'chat-a wt-more', onclick: () => { expanded.add(key); draw(); } }, `${list.length} odpowiedzi – pokaż`),
      ...(isOpen ? list : list.slice(-1)).map(render));
  }
  function taskCard(t) {
    const com = D.tcom.filter(c => c.ticket_id === t.id);
    const stSel = h('select', { class: 'wt-st ' + t.status, 'aria-label': 'Status zadania' }, ...Object.entries(TK_STATUS).map(([k, v]) => h('option', { value: k, selected: k === t.status }, v)));
    stSel.addEventListener('change', () => setTicketStatus(t, stSel.value));
    const late = t.due_date && t.due_date < new Date().toLocaleDateString('sv-SE') && !['zrobione', 'anulowane'].includes(t.status);
    return h('div', { class: 'wt-task' + (['zrobione', 'anulowane'].includes(t.status) ? ' closed' : ''), 'data-id': 't' + t.id },
      h('div', { class: 'wt-task-h' }, h('span', { class: 'wt-task-no' }, `Zadanie #${t.no}`), stSel),
      h('b', { class: 'wt-task-t' }, t.title),
      t.description ? h('div', { class: 'chat-txt small' }, t.description) : null,
      h('div', { class: 'wt-task-m' },
        h('span', {}, '→ ', h('b', {}, t.assignee_id ? who(t.assignee_id) : 'nieprzypisane')),
        t.due_date ? h('span', { class: late ? 'wt-late' : '' }, 'termin ' + t.due_date.split('-').reverse().join('.')) : null,
        t.priority !== 'normalny' ? h('span', { class: 'tk-pr ' + t.priority }, TK_PRIO[t.priority]) : null,
        h('span', { class: 'muted' }, `${who(t.created_by)} · ${tm(t.created_at)}`),
        h('a', { href: `#/zgloszenia/${t.id}`, class: 'chat-a', onclick: () => close() }, 'otwórz')),
      replies('t' + t.id, com, c => c.kind === 'zmiana'
        ? h('div', { class: 'chat-sys wt-small' }, `${who(c.author_id)} · ${c.body} · ${tm(c.created_at)}`)
        : h('div', { class: 'chat-msg wt-r' + (c.author_id === me ? ' mine' : '') }, c.author_id !== me ? avatar(c.author_id) : null,
          h('div', { class: 'chat-bub' }, h('div', { class: 'chat-meta' }, h('b', {}, c.author_id === me ? 'Ty' : who(c.author_id)), c.kind === 'wykonanie' ? h('span', { class: 'chat-tag' }, 'wykonanie') : null, h('span', {}, tm(c.created_at))),
            h('div', { class: 'chat-txt' }, c.body)))),
      h('button', { type: 'button', class: 'chat-a wt-reply-btn', onclick: () => setReply({ type: 't', id: t.id, key: 't' + t.id, label: `zadanie #${t.no}` }) }, 'Odpowiedz w zadaniu'));
  }

  function draw() {
    monthLbl.textContent = periodLabel(per);
    pinsBox.replaceChildren(...(D.pins.length ? [h('div', { class: 'wt-pins-h' }, '📌 Ustalenia – stałe informacje o kliencie'),
      ...D.pins.map(p => h('div', { class: 'wt-pin' }, h('span', {}, ...mentionHtml(p.body)), h('span', { class: 'muted small' }, `${who(p.author)}`),
        h('button', { type: 'button', class: 'chat-a', onclick: () => upd(p.id, { pinned: false }, 'Odpięto') }, 'odepnij')))] : []));
    carryBox.replaceChildren(...(D.carry.length ? [h('details', { class: 'wt-carry' }, h('summary', {}, `Otwarte pytania z wcześniejszych miesięcy (${D.carry.length})`),
      ...D.carry.map(q => h('div', { class: 'wt-carry-i' }, h('span', { class: 'chat-tag' }, periodLabel(q.period.slice(0, 7))), h('span', { class: 'wt-carry-t' }, q.body),
        h('button', { type: 'button', class: 'chat-a', onclick: () => upd(q.id, { resolved_at: new Date().toISOString() }, 'Oznaczono jako wyjaśnione') }, '✓ Wyjaśnione'),
        h('button', { type: 'button', class: 'chat-a', onclick: () => go(q.period.slice(0, 7), q.id) }, 'pokaż'))))] : []));
    const top = D.cm.filter(x => !x.parent_id);
    const rep = id => D.cm.filter(x => x.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const stream = [
      ...top.map(x => ({ t: x.created_at, el: () => h('div', { class: 'wt-item' }, bubble(x), replies('c' + x.id, rep(x.id), r => bubble(r, { reply: true }))) })),
      ...D.tickets.map(t => ({ t: t.created_at, el: () => taskCard(t) })),
      ...D.mails.map(m => ({ t: m.sent_at, el: () => h('button', { type: 'button', class: 'chat-sys wt-mail' + (m.status === 'blad' ? ' err' : ''), 'data-tip': 'Pokaż treść wiadomości', onclick: () => showMail(m) }, icon('mail'),
        h('span', {}, h('b', {}, who(m.sent_by)), m.status === 'blad' ? ' – nie udało się wysłać: ' : ' wysłał(a) e-mail: ', m.subject, h('span', { class: 'muted' }, ` → ${m.email} · ${tm(m.sent_at)}`))) })),
      ...D.files.map(f => ({ t: f.created_at, el: () => { const fromClient = f.source === 'klient', mine = !fromClient && f.uploaded_by === me;
        return h('div', { class: 'chat-msg chat-file' + (mine ? ' mine' : '') + (fromClient ? ' client' : '') }, !mine ? avatar(fromClient ? null : f.uploaded_by) : null,
          h('div', { class: 'chat-bub' }, h('div', { class: 'chat-meta' }, h('b', {}, fromClient ? 'Klient (przez link)' : mine ? 'Ty' : who(f.uploaded_by)), h('span', { class: 'chat-tag' }, 'załącznik'), h('span', {}, tm(f.created_at))),
            fileTile({ ...f, bucket: 'rozliczenia' }, { onDelete: mine || admin || fromClient ? () => delFile(f) : null }))); } })),
      ...D.audit.map(a => ({ t: a.at, el: () => h('div', { class: 'chat-sys wt-small' }, `${whoEmail(a.actor)} · ${taskLabel(a.detail.task_code)}: ${STATUS[a.detail.status?.z]?.label || '—'} → `, h('b', {}, STATUS[a.detail.status?.na]?.label || '—'), ` · ${tm(a.at)}`) })),
    ].sort((a, b) => a.t.localeCompare(b.t));
    const out = []; let last = '';
    for (const s of stream) { const d = dayLbl(s.t); if (d !== last) { out.push(h('div', { class: 'chat-day' }, h('span', {}, d))); last = d; } out.push(s.el()); }
    if (!stream.length) out.push(h('p', { class: 'hint chat-empty' }, `Brak wpisów za ${periodLabel(per).toLowerCase()}. Napisz uwagę, zadaj pytanie albo utwórz zadanie.`));
    const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    thread.replaceChildren(...out);
    if (focus) { const el = thread.querySelector(`[data-id="${focus}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('wt-flash'); } focus = null; }
    else if (atBottom || !thread.dataset.drawn) thread.scrollTop = thread.scrollHeight;
    thread.dataset.drawn = '1';
  }

  async function reload(keep) {
    const pdate = per + '-01', nm = nextMonth(per);
    const soft = q => q.then(r => r.data || [], () => []);
    const [cm, pins, carry, tickets, mails, files, audit] = await Promise.all([
      soft(sb.from('period_comments').select('*').eq('client_id', client.id).eq('period', pdate).order('created_at')),
      soft(sb.from('period_comments').select('id,body,author,period').eq('client_id', client.id).eq('pinned', true).is('deleted_at', null).order('created_at')),
      soft(sb.from('period_comments').select('id,body,author,period').eq('client_id', client.id).eq('kind', 'pytanie').is('resolved_at', null).is('deleted_at', null).is('parent_id', null).lt('period', pdate).order('period', { ascending: false }).limit(20)),
      soft(sb.from('rkdp_tickets').select('*').eq('client_id', client.id).or(`period.eq.${pdate},and(period.is.null,created_at.gte.${pdate},created_at.lt.${nm})`).order('created_at')),
      soft(sb.from('client_messages').select('id,kind,subject,sent_at,sent_by,status,email,period,body,error').eq('client_id', client.id).or(`period.eq.${pdate},and(period.is.null,sent_at.gte.${pdate},sent_at.lt.${nextMonth(shiftPeriod(per, 1))})`).order('sent_at')),
      soft(sb.from('period_files').select('*').eq('client_id', client.id).eq('period', pdate).order('created_at')),
      soft(sb.from('audit_log').select('at,actor,detail').eq('table_name', 'checklist_entries').eq('client_id', client.id).eq('period', pdate).order('at').limit(200)),
    ]);
    const tcom = tickets.length ? await soft(sb.from('rkdp_ticket_comments').select('*').in('ticket_id', tickets.map(t => t.id)).order('created_at')) : [];
    D = { cm, pins, carry, tickets, tcom, mails, files, audit: audit.filter(a => a.detail?.status && a.detail?.task_code) };
    if (!keep) thread.dataset.drawn = '';
    draw();
  }
  function showMail(m) {
    modal(m.subject, h('div', { class: 'wt-mailv' },
      h('div', { class: 'small muted' }, `Od: RKDP | Kancelaria <kancelaria@rkdp.pl> · wysłał(a): ${who(m.sent_by)}`), h('div', { class: 'small muted' }, `Do: ${m.email} · ${dt(m.sent_at)}`),
      m.status === 'blad' ? h('p', { class: 'esf-err' }, 'Nie udało się wysłać: ' + (m.error || '')) : null,
      m.body ? h('pre', { class: 'wt-mailbody' }, m.body) : h('p', { class: 'hint' }, 'Treść nie została zapisana – wiadomość wysłana przed włączeniem kopii w aplikacji.')),
    c => [h('button', { class: 'btn btn-primary', onclick: c }, 'Zamknij')], { wide: true });
  }
  async function go(p, f = null) { per = p; focus = f; searching = false; searchIn.hidden = true; await reload(); }
  async function delFile(f) {
    if (!confirm(`Usunąć załącznik „${f.name}”?`)) return;
    const { error } = await sb.from('period_files').delete().eq('id', f.id);
    if (error) return fail(error);
    await sb.storage.from('rozliczenia').remove([f.path]); await reload(true); onChange?.();
  }

  // ---------- wyszukiwarka ----------
  let sT = null;
  function toggleSearch() {
    searching = !searching; searchIn.hidden = !searching;
    if (searching) { searchIn.value = ''; searchIn.focus(); thread.replaceChildren(h('p', { class: 'hint chat-empty' }, 'Wpisz co najmniej 2 znaki – przeszukam uwagi, pytania, odpowiedzi i zadania z całej historii klienta.')); }
    else draw();
  }
  searchIn.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(runSearch, 300); });
  async function runSearch() {
    const q = searchIn.value.trim().replace(/[%_,()]/g, ' ');
    if (q.length < 2) return;
    const [cs, ts] = await Promise.all([
      sb.from('period_comments').select('id,body,author,period,created_at,kind,parent_id').eq('client_id', client.id).is('deleted_at', null).ilike('body', `%${q}%`).order('created_at', { ascending: false }).limit(40).then(r => r.data || [], () => []),
      sb.from('rkdp_tickets').select('id,no,title,description,period,created_at,status').eq('client_id', client.id).or(`title.ilike.%${q}%,description.ilike.%${q}%`).order('created_at', { ascending: false }).limit(20).then(r => r.data || [], () => []),
    ]);
    const res = [...cs.map(c => ({ t: c.created_at, per: c.period.slice(0, 7), id: c.parent_id || c.id, lbl: c.kind === 'pytanie' ? 'pytanie' : c.parent_id ? 'odpowiedź' : 'uwaga', who: who(c.author), body: c.body })),
      ...ts.map(t => ({ t: t.created_at, per: (t.period || t.created_at).slice(0, 7), id: 't' + t.id, lbl: `zadanie #${t.no} · ${TK_STATUS[t.status]}`, who: '', body: t.title + (t.description ? ' – ' + t.description : '') }))]
      .sort((a, b) => b.t.localeCompare(a.t));
    const hl = s => { const i = s.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return s.slice(0, 160); const a = Math.max(0, i - 50); return [a ? '…' : '', s.slice(a, i), h('mark', {}, s.slice(i, i + q.length)), s.slice(i + q.length, i + q.length + 90)]; };
    thread.replaceChildren(h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, `Wyniki: ${res.length}`),
      ...(res.length ? res.map(r => h('button', { type: 'button', class: 'wt-hit', onclick: () => go(r.per, r.id) },
        h('span', { class: 'chat-tag' }, `${periodLabel(r.per)} · ${r.lbl}`), h('span', { class: 'small muted' }, `${r.who ? r.who + ' · ' : ''}${dt(r.t)}`), h('div', {}, ...[hl(r.body)].flat()))) : [h('p', { class: 'hint chat-empty' }, 'Nic nie znaleziono.')]));
  }

  // ---------- eksport historii do PDF ----------
  function exportDialog() {
    const from = h('input', { class: 'input', type: 'month', value: shiftPeriod(per, -11) }), to = h('input', { class: 'input', type: 'month', value: per });
    (modal('Historia klienta do PDF', h('div', { class: 'esf-grid', style: { gridTemplateColumns: '1fr 1fr' } },
      h('label', { class: 'esf-f' }, h('span', {}, 'Od miesiąca'), from), h('label', { class: 'esf-f' }, h('span', {}, 'Do miesiąca'), to),
      h('p', { class: 'hint', style: { gridColumn: '1/-1' } }, 'Uwagi, pytania, odpowiedzi, zadania z komentarzami, wysłane e-maile, załączniki (nazwy) i zmiany kratek – w kolejności dat. Usunięte wpisy widoczne jako ślad.')),
    c => [h('button', { class: 'btn btn-ghost', onclick: c }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => { c(); await exportPdf(from.value, to.value); } }, 'Utwórz PDF')]));
  }
  async function exportPdf(a, b) {
    if (!a || !b || a > b) return toast('Nieprawidłowy zakres miesięcy', true);
    const p0 = a + '-01', p1 = nextMonth(b);
    const all = q => q.then(r => r.data || [], () => []);
    const [cm, tk, ml, fl, au] = await Promise.all([
      all(sb.from('period_comments').select('*').eq('client_id', client.id).gte('period', p0).lt('period', p1).order('created_at')),
      all(sb.from('rkdp_tickets').select('*').eq('client_id', client.id).or(`and(period.gte.${p0},period.lt.${p1}),and(period.is.null,created_at.gte.${p0},created_at.lt.${p1})`).order('created_at')),
      all(sb.from('client_messages').select('*').eq('client_id', client.id).gte('sent_at', p0).lt('sent_at', nextMonth(shiftPeriod(b, 1))).order('sent_at')),
      all(sb.from('period_files').select('name,created_at,uploaded_by,source,period').eq('client_id', client.id).gte('period', p0).lt('period', p1).order('created_at')),
      all(sb.from('audit_log').select('at,actor,detail,period').eq('table_name', 'checklist_entries').eq('client_id', client.id).gte('period', p0).lt('period', p1).order('at').limit(2000)),
    ]);
    const tc = tk.length ? await all(sb.from('rkdp_ticket_comments').select('*').in('ticket_id', tk.map(t => t.id)).order('created_at')) : [];
    const rows = [
      ...cm.map(c => ({ t: c.created_at, per: c.period, k: c.parent_id ? 'odpowiedź' : c.kind, who: who(c.author), txt: c.deleted_at ? `[wpis usunięty ${dt(c.deleted_at)}${c.deleted_by ? ' przez ' + who(c.deleted_by) : ''}] ${c.body}` : c.body + (c.edited_at ? ` (edytowano ${dt(c.edited_at)})` : '') + (c.resolved_at ? ' ✓ wyjaśnione' : '') })),
      ...tk.map(t => ({ t: t.created_at, per: t.period || t.created_at.slice(0, 7) + '-01', k: `zadanie #${t.no}`, who: who(t.created_by), txt: `${t.title}${t.description ? ' – ' + t.description : ''} → ${t.assignee_id ? who(t.assignee_id) : 'nieprzypisane'}${t.due_date ? ', termin ' + t.due_date : ''} · status: ${TK_STATUS[t.status]}` })),
      ...tc.map(c => ({ t: c.created_at, per: tk.find(t => t.id === c.ticket_id)?.period || c.created_at.slice(0, 7) + '-01', k: `zadanie #${tk.find(t => t.id === c.ticket_id)?.no} · ${c.kind}`, who: who(c.author_id), txt: c.body })),
      ...ml.map(m => ({ t: m.sent_at, per: m.period || m.sent_at.slice(0, 7) + '-01', k: 'e-mail', who: who(m.sent_by), txt: `${m.subject} → ${m.email}${m.status === 'blad' ? ' (błąd wysyłki)' : ''}${m.body ? '\n\n' + m.body : ''}` })),
      ...fl.map(f => ({ t: f.created_at, per: f.period, k: 'załącznik', who: f.source === 'klient' ? 'klient (link)' : who(f.uploaded_by), txt: f.name })),
      ...au.filter(x => x.detail?.status).map(x => ({ t: x.at, per: x.period, k: 'kratka', who: whoEmail(x.actor), txt: `${taskLabel(x.detail.task_code)}: ${STATUS[x.detail.status?.z]?.label || '—'} → ${STATUS[x.detail.status?.na]?.label || '—'}` })),
    ].sort((x, y) => x.t.localeCompare(y.t));
    const body = rows.length ? `<table><thead><tr><th class="l">Data</th><th class="l">Miesiąc</th><th class="l">Rodzaj</th><th class="l">Kto</th><th class="l">Treść</th></tr></thead><tbody>${rows.map(r =>
      `<tr><td class="l" style="white-space:nowrap">${esc(dt(r.t))}</td><td class="l">${esc(periodLabel(String(r.per).slice(0, 7)))}</td><td class="l">${esc(r.k)}</td><td class="l">${esc(r.who)}</td><td class="l" style="white-space:pre-wrap">${esc(r.txt)}</td></tr>`).join('')}</tbody></table>` : '<p>Brak wpisów w wybranym okresie.</p>';
    printHtml(paper({ title: `Historia współpracy – ${client.name}`, subtitle: `${periodLabel(a)} – ${periodLabel(b)} · wpisów: ${rows.length}`, body, landscape: true }), `Historia ${client.name}`);
  }

  setTimeout(() => ta.focus(), 60);
  await reload();
  markRead();
  return { close };
}

// ---------- „Nieprzeczytane” w górnym pasku ----------
let unreadEl = null, unreadT = null;
export function unreadBadge() {
  const cnt = h('span', { class: 'wt-ucount', hidden: true });
  unreadEl = h('button', { type: 'button', class: 'ob-link wt-ubtn', 'aria-label': 'Nieprzeczytane rozmowy', 'data-tip': 'Nieprzeczytane rozmowy o klientach', onclick: e => unreadMenu(e.currentTarget) },
    h('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12.5h5"/></svg>', style: { display: 'inline-flex' } }), cnt);
  unreadEl._cnt = cnt;
  setTimeout(refreshUnread, 50);
  clearInterval(unreadT); unreadT = setInterval(refreshUnread, 120000);
  return unreadEl;
}
let lastUnread = [];
export async function refreshUnread() {
  if (!unreadEl?.isConnected) return;
  const { data, error } = await sb.rpc('unread_threads');
  if (error) return;
  lastUnread = data || [];
  const n = lastUnread.length;
  unreadEl._cnt.hidden = !n; unreadEl._cnt.textContent = n > 9 ? '9+' : String(n);
  unreadEl.classList.toggle('has', n > 0); unreadEl.classList.toggle('at', lastUnread.some(x => x.mentioned));
}
async function unreadMenu(anchor) {
  await refreshUnread();
  const { openPop, closePop } = await import('./pop.js');
  openPop(anchor, h('div', { class: 'pop-body wt-upop' }, h('label', {}, 'Nieprzeczytane rozmowy'),
    ...(lastUnread.length ? lastUnread.map(u => h('button', { class: 'opt wt-uitem', onclick: () => { closePop(); openThread({ client: { id: u.client_id }, period: String(u.period).slice(0, 7) }); } },
      h('span', { class: 'wt-uname' }, u.name, u.mentioned ? h('span', { class: 'wt-at' }, ' @Ty') : null),
      h('span', { class: 'small muted' }, `${u.n} nowych · ${new Date(u.last_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`)))
      : [h('p', { class: 'hint', style: { padding: '6px 10px' } }, 'Wszystko przeczytane. 👍')]),
    lastUnread.length ? h('button', { class: 'opt', onclick: async () => { closePop(); const now = new Date().toISOString(); await sb.from('thread_reads').upsert(lastUnread.map(u => ({ member_id: state.me.id, client_id: u.client_id, read_at: now })), { onConflict: 'member_id,client_id' }); refreshUnread(); } }, 'Oznacz wszystkie jako przeczytane') : null));
}
