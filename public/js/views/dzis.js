// „Dziś” – lista na dzisiaj dla zalogowanej osoby: kratki do zrobienia (odhaczane w miejscu, na telefonie przesunięciem),
// zgłoszenia, terminy obowiązków w 7 dni, braki dokumentów z prośbą do klienta, terminy spraw M2, monitoring, zapis czasu pracy.
import { h, icon, toast, toastAction, fail, periodLabel, defaultPeriod } from '../ui.js';
import { sb, state, hasModule } from '../store.js';
import { STATUS, STATUS_ORDER, sectionOf } from '../dict.js';
import { fetchAll, fetchSoft, loadClients, todayIso, addDays, fmtShort, weekday, fmtMin } from '../data.js';
import { obligationsInMonth, obligationStatus, KINDS } from '../obowiazki.js';
import { TK_OPEN, statusTag, dueTag } from './zgloszenia.js';
import { openPop, closePop } from '../pop.js';
import { openDocRequest } from '../prosba.js';
import { emptyState } from '../puste.js';
import { celebrate } from '../efekty.js';

const TASK_KIND = { jpk: 'vat', vat: 'vat', pit_cit: null, zus_podany: 'zus', zus_wyslany: 'zus', pit4: 'pit4' };

export async function renderDzis(box, D) {
  const me = state.me.id, today = todayIso(), period = defaultPeriod(), pdate = period + '-01';
  const in7 = addDays(today, 7);
  const [clients, entries, reqs, alerts, m2dl, yEnt] = await Promise.all([
    loadClients(),
    fetchAll(() => sb.from('checklist_entries').select('id,client_id,task_code,status,period').eq('period', pdate)),
    fetchSoft(() => sb.from('doc_requests').select('id,client_id,period,files_count,sent_at,closed_at,expires_at,created_at').eq('period', pdate)),
    fetchSoft(() => sb.from('monitor_alerts').select('id,client_id,summary,created_at,resolved_at').eq('module', 'rkdp').is('resolved_at', null)),
    hasModule('doradztwo') ? fetchSoft(() => sb.from('m2_deadlines').select('id,title,due_date,matter_id,assignee_id,done').eq('done', false).lte('due_date', in7).order('due_date')) : [],
    fetchSoft(() => sb.from('year_close_entries').select('client_id,year,task_code,status').gte('year', +today.slice(0, 4) - 1)),
  ]);
  const tasks = state.taskTypes.filter(t => t.active);
  const tBy = new Map(tasks.map(t => [t.code, t]));
  const cBy = new Map(clients.map(c => [c.id, c]));
  const mineAcc = c => c.accountant_id === me, mineHr = c => c.hr_id === me;
  const myClients = clients.filter(c => c.status === 'aktywny' && (mineAcc(c) || mineHr(c)));
  const eMap = new Map(), yMap = new Map();
  entries.forEach(e => { if (!eMap.has(e.client_id)) eMap.set(e.client_id, new Map()); eMap.get(e.client_id).set(`${period}|${e.task_code}`, e.status); });
  yEnt.forEach(e => { if (!yMap.has(e.client_id)) yMap.set(e.client_id, new Map()); yMap.get(e.client_id).set(`${e.year}|${e.task_code}`, e.status); });

  // termin kratki: z obowiązków klienta w miesiącu po okresie (np. JPK – 25., PIT – 20.)
  const [py, pm] = period.split('-').map(Number);
  const dueY = pm === 12 ? py + 1 : py, dueM = pm === 12 ? 1 : pm + 1;
  const oblCache = new Map();
  const oblOf = c => { if (!oblCache.has(c.id)) oblCache.set(c.id, obligationsInMonth(c, dueY, dueM)); return oblCache.get(c.id); };
  const dueOf = (c, code) => {
    const os = oblOf(c).filter(o => o.kind !== 'roczne');
    const kind = code === 'pit_cit' ? (os.find(o => o.kind === 'pit' || o.kind === 'cit')?.kind) : TASK_KIND[code];
    const hit = kind ? os.find(o => o.kind === kind) : null;
    if (hit) return hit.date;
    const dates = os.map(o => o.date).sort();
    return dates[0] || `${dueY}-${String(dueM).padStart(2, '0')}-20`;
  };
  const items = entries.filter(e => {
    const c = cBy.get(e.client_id), t = tBy.get(e.task_code);
    if (!c || !t || c.status !== 'aktywny') return false;
    if (!['todo', 'in_progress', 'missing_docs'].includes(e.status)) return false;
    return t.area === 'kadry' ? mineHr(c) : mineAcc(c);
  }).map(e => ({ e, c: cBy.get(e.client_id), t: tBy.get(e.task_code), due: dueOf(cBy.get(e.client_id), e.task_code) }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.c.name.localeCompare(b.c.name, 'pl'));

  const myTickets = (D?.tickets || []).filter(t => TK_OPEN.includes(t.status) && t.assignee_id === me)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const obl7 = myClients.flatMap(c => {
    const ms = new Set([today.slice(0, 7), in7.slice(0, 7)]);
    return [...ms].flatMap(ym => obligationsInMonth(c, +ym.slice(0, 4), +ym.slice(5, 7)));
  }).filter(o => o.date >= today && o.date <= in7).map(o => ({ ...o, status: obligationStatus(o, eMap, yMap) })).filter(o => o.status !== 'done' && o.status !== 'na');
  const missing = myClients.filter(c => entries.some(e => e.client_id === c.id && e.status === 'missing_docs'));
  const myAlerts = alerts.filter(a => myClients.some(c => c.id === a.client_id));
  const myM2 = m2dl.filter(d => d.assignee_id === me);

  // ---------- lista kratek ----------
  const listBox = h('div', { class: 'dz-list' });
  let showAll = false;
  function drawItems() {
    const open = items.filter(x => ['todo', 'in_progress', 'missing_docs'].includes(x.e.status));
    if (!open.length) { listBox.replaceChildren(emptyState('Wszystko odhaczone', `Twoje kratki za ${periodLabel(period).toLowerCase()} są zrobione. 🎉`)); return; }
    const groups = new Map();
    (showAll ? open : open.slice(0, 40)).forEach(x => { const k = x.due < today ? 'late' : x.due; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    listBox.replaceChildren(...[...groups.entries()].map(([k, xs]) => h('div', { class: 'dz-g' },
      h('div', { class: 'dz-gh' + (k === 'late' ? ' late' : '') }, k === 'late' ? 'Po terminie' : `${k === today ? 'Dziś' : weekday(k)} ${fmtShort(k)}`, h('span', { class: 'muted small' }, ` · ${xs.length}`)),
      ...xs.map(itemRow))),
    open.length > 40 && !showAll ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { showAll = true; drawItems(); } }, `Pokaż wszystkie (${open.length})`) : '');
  }
  function itemRow(x) {
    const st = x.e.status;
    const row = h('div', { class: 'dz-item' + (st === 'missing_docs' ? ' miss' : ''), 'data-eid': x.e.id },
      h('div', { class: 'dz-swipe', 'aria-hidden': 'true' }, '✓ Zrobione'),
      h('div', { class: 'dz-in' },
        h('button', { class: `cb cb-${st === 'in_progress' ? 'todo' : st}`, type: 'button', 'data-tip': 'Kliknij: Zrobione · prawy przycisk / przytrzymaj: inne statusy', 'aria-label': `${x.t.label} – oznacz jako zrobione`,
          onclick: () => setSt(x, x.e.status === 'done' ? 'todo' : 'done'),
          oncontextmenu: ev => { ev.preventDefault(); menu(ev.currentTarget, x); } }, STATUS[st].mark),
        h('div', { class: 'dz-t' }, h('a', { href: `#/klient/${x.c.id}`, 'data-panel': x.c.id }, x.c.name),
          h('span', { class: 'muted small' }, `${x.t.code === 'pit_cit' ? (sectionOf(x.c) === 'kapitalowe' ? 'CIT' : 'PIT') : x.t.label}${x.t.area === 'kadry' ? ' · kadry' : ''}`)),
        st === 'missing_docs' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openDocRequest(x.c, period, entries.filter(e => e.client_id === x.c.id && e.status === 'missing_docs').map(e => e.task_code)) }, icon('mail'), 'Poproś') : null,
        h('button', { class: 'icon-btn dz-more', type: 'button', 'aria-label': 'Inne statusy', onclick: ev => menu(ev.currentTarget, x) }, '⋯')));
    swipe(row, () => setSt(x, 'done'));
    return row;
  }
  function menu(anchor, x) {
    openPop(anchor, [h('label', {}, `${x.t.label} – ${x.c.name}`), STATUS_ORDER.map(s => h('button', { class: 'opt' + (x.e.status === s ? ' cur' : ''), onclick: () => { closePop(); setSt(x, s); } },
      h('span', { class: `cb cb-${s}`, style: { width: '22px', height: '22px', fontSize: '12px' } }, STATUS[s].mark), s === 'todo' ? 'Wyczyść (do zrobienia)' : STATUS[s].label))]);
  }
  async function setSt(x, s, silent) {
    const before = x.e.status;
    x.e.status = s; drawItems(); drawStats();
    const { error } = await sb.from('checklist_entries').update({ status: s }).eq('id', x.e.id);
    if (error) { x.e.status = before; drawItems(); drawStats(); return fail(error, 'Nie zapisano'); }
    if (!silent) toastAction(`${x.c.name} · ${x.t.label}: ${STATUS[s].label}`, 'Cofnij', () => setSt(x, before, true));
    if (!items.some(i => ['todo', 'in_progress', 'missing_docs'].includes(i.e.status))) celebrate('Wszystkie Twoje kratki na ten miesiąc są zrobione!');
  }

  // przesunięcie w lewo na telefonie = „Zrobione”
  function swipe(row, fn) {
    const inner = row.querySelector('.dz-in');
    let x0 = null, y0 = 0, dx = 0, lock = null;
    row.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; inner.style.transition = 'none'; }, { passive: true });
    row.addEventListener('touchmove', e => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (lock == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (lock !== 'x') return;
      dx = Math.min(0, mx); inner.style.transform = `translateX(${dx}px)`; row.classList.toggle('armed', dx < -90);
    }, { passive: true });
    row.addEventListener('touchend', () => {
      inner.style.transition = ''; inner.style.transform = '';
      if (lock === 'x' && dx < -90) { row.classList.add('gone'); setTimeout(fn, 160); }
      row.classList.remove('armed'); x0 = null;
    });
  }

  // ---------- statystyki ----------
  const stats = h('div', { class: 'dz-stats' });
  function drawStats() {
    const open = items.filter(x => ['todo', 'in_progress', 'missing_docs'].includes(x.e.status));
    const late = open.filter(x => x.due < today).length;
    const chip = (n, l, cls) => h('div', { class: 'dz-stat ' + (cls || '') }, h('b', {}, String(n)), h('span', {}, l));
    stats.replaceChildren(chip(open.length, 'kratek do zrobienia', late ? 'warn' : ''), chip(late, 'po terminie', late ? 'warn' : ''), chip(myTickets.length, 'moich zgłoszeń'),
      chip(obl7.length, 'terminów w 7 dni'), chip(missing.length, 'braków dokumentów', missing.length ? 'warn' : ''));
  }
  drawStats(); drawItems();

  // ---------- czas pracy ----------
  const cSel = h('select', { class: 'select' }, h('option', { value: '' }, 'Klient…'), ...(myClients.length ? myClients : clients.filter(c => c.status === 'aktywny')).map(c => h('option', { value: c.id }, c.name)));
  const mins = h('input', { class: 'input', type: 'number', min: 5, step: 5, value: 30, style: { width: '84px' } });
  const desc = h('input', { class: 'input grow', placeholder: 'Opis (opcjonalnie)' });
  const timeBox = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Zapisz czas pracy'), h('a', { class: 'small', href: '#/rentownosc' }, 'Rentowność →')),
    h('div', { class: 'dz-time' }, cSel, mins, h('span', { class: 'muted small' }, 'min'), desc,
      h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        const m = Math.round(+mins.value);
        if (!cSel.value) return toast('Wybierz klienta', true);
        if (!(m > 0 && m <= 1440)) return toast('Podaj liczbę minut', true);
        const { error } = await sb.from('client_time').insert({ client_id: cSel.value, minutes: m, description: desc.value.trim() || null, work_date: today });
        if (error) return fail(error, 'Nie zapisano czasu');
        toast(`Zapisano ${fmtMin(m)} – ${cBy.get(cSel.value)?.name}`); desc.value = '';
      } }, 'Zapisz')));

  const sec = (title, link, ...els) => h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, title), link || null), ...els);
  box.replaceChildren(stats, h('div', { class: 'two dz' },
    h('div', {}, sec(`Moje kratki – ${periodLabel(period).toLowerCase()}`, h('a', { class: 'small', href: `#/rozliczenia?okres=${period}` }, 'Rozliczenia →'),
      h('p', { class: 'muted small dz-tip' }, 'Kliknij kratkę = zrobione · ⋯ = inne statusy · na telefonie przesuń wiersz w lewo'), listBox)),
    h('div', {},
      sec(`Moje zgłoszenia (${myTickets.length})`, h('a', { class: 'small', href: '#/zgloszenia?f=moje' }, 'Wszystkie →'),
        ...(myTickets.length ? myTickets.slice(0, 8).map(t => h('a', { class: 'tk-mini', href: `#/zgloszenia/${t.id}` }, h('div', { style: { minWidth: 0 } }, h('b', {}, t.title), h('div', { class: 'small muted' }, `#${t.no}${t.client_id && cBy.get(t.client_id) ? ' · ' + cBy.get(t.client_id).name : ''}`)), h('div', { style: { textAlign: 'right', flex: 'none' } }, statusTag(t.status), h('div', {}, dueTag(t)))))
          : [h('p', { class: 'hint' }, 'Nie masz otwartych zgłoszeń.')])),
      sec('Terminy w 7 dni', h('a', { class: 'small', href: '#/terminy?kto=moi' }, 'Kalendarz →'),
        ...(obl7.length ? groupObl(obl7) : [h('p', { class: 'hint' }, 'Brak niezrobionych terminów u Twoich klientów w najbliższym tygodniu.')])),
      myM2.length ? sec('Terminy spraw M2', h('a', { class: 'small', href: '#/doradztwo/kalendarz' }, 'Kalendarz M2 →'),
        ...myM2.map(d => h('a', { class: 'tk-mini', href: `#/doradztwo/sprawa/${d.matter_id}` }, h('span', {}, d.title), h('b', { class: d.due_date < today ? 'late-t' : '' }, fmtShort(d.due_date))))) : null,
      missing.length ? sec(`Braki dokumentów (${missing.length})`, null, ...missing.map(c => {
        const r = reqs.filter(x => x.client_id === c.id && !x.closed_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return h('div', { class: 'tk-mini' }, h('a', { href: `#/klient/${c.id}`, 'data-panel': c.id }, c.name),
          r ? h('span', { class: 'small ' + (r.files_count ? 'ok-t' : 'muted') }, r.files_count ? `klient wgrał ${r.files_count} plik.` : r.sent_at ? `poproszono ${fmtShort(r.sent_at.slice(0, 10))}` : 'prośba niewysłana')
            : h('button', { class: 'btn btn-ghost btn-sm', onclick: () => openDocRequest(c, period, entries.filter(e => e.client_id === c.id && e.status === 'missing_docs').map(e => e.task_code)) }, icon('mail'), 'Poproś'));
      })) : null,
      myAlerts.length ? sec('Monitoring – zmiany u klientów', null, ...myAlerts.map(a => h('a', { class: 'tk-mini', href: `#/klient/${a.client_id}`, 'data-panel': a.client_id }, h('div', { style: { minWidth: 0 } }, h('b', {}, cBy.get(a.client_id)?.name || ''), h('div', { class: 'small muted' }, a.summary))))) : null,
      timeBox)));
  function groupObl(list) {
    const g = new Map();
    list.sort((a, b) => a.date.localeCompare(b.date)).forEach(o => { const k = o.date + '|' + o.kind; if (!g.has(k)) g.set(k, []); g.get(k).push(o); });
    return [...g.values()].map(os => h('a', { class: 'tk-mini', href: `#/terminy?kto=moi&dzien=${os[0].date}&rok=${os[0].date.slice(0, 4)}&m=${+os[0].date.slice(5, 7)}` },
      h('span', {}, h('span', { class: 'kchip', style: `--k:${KINDS[os[0].kind].color}` }, KINDS[os[0].kind].short), ' ', os.length === 1 ? `${os[0].label} – ${os[0].client.name}` : `${KINDS[os[0].kind].label} – ${os.length} klientów`),
      h('b', {}, `${weekday(os[0].date)} ${fmtShort(os[0].date)}`)));
  }
}
