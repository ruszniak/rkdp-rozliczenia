// Karta klienta w panelu bocznym: dane, kratki z bieżącego miesiąca, uwagi, prośby o dokumenty, zgłoszenia,
// najbliższe terminy, monitoring. Lista pod spodem zostaje na miejscu.
import { h, icon, toast, toastAction, fail, periodLabel, defaultPeriod, initials, ava } from './ui.js';
import { sb, state, memberById, hasModule } from './store.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT, VAT_SHORT, PIT_SHORT, CIT_SHORT, sectionOf } from './dict.js';
import { CLIENT_COLS, todayIso, fmtShort, fmtFull, fetchSoft } from './data.js';
import { obligationsInMonth, KINDS } from './obowiazki.js';
import { openPop, closePop } from './pop.js';
import { openDocRequest, uploadLink } from './prosba.js';
import { rememberRecent } from './cmdk.js';

let current = null;
export function closePanel() {
  if (!current) return;
  const p = current; current = null;
  p.classList.remove('in'); document.body.classList.remove('panel-open');
  document.removeEventListener('keydown', onEsc);
  setTimeout(() => p.remove(), 220);
}
const onEsc = e => { if (e.key === 'Escape' && !document.querySelector('.pop, .modal-back')) closePanel(); };

// otwieranie z dowolnego linku z atrybutem data-panel="<id klienta>" (Ctrl/⌘/środkowy przycisk – zwykła nawigacja)
export function initPanelLinks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-panel]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    if (!hasModule('rozliczenia')) return;
    e.preventDefault();
    openClientPanel(a.dataset.panel);
  });
}

const sec = (title, ...body) => h('section', { class: 'cp-sec' }, h('h3', {}, title), ...body);

export async function openClientPanel(id) {
  closePanel();
  const box = h('div', { class: 'cp-body' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const panel = h('aside', { class: 'cpanel', role: 'dialog', 'aria-label': 'Karta klienta' },
    h('div', { class: 'cp-top' }, h('button', { class: 'icon-btn', 'aria-label': 'Zamknij', onclick: closePanel }, '✕')), box);
  const shade = h('div', { class: 'cp-shade', onclick: closePanel });
  const wrap = h('div', { class: 'cp-wrap' }, shade, panel);
  document.body.append(wrap);
  current = wrap; document.body.classList.add('panel-open');
  requestAnimationFrame(() => wrap.classList.add('in'));
  document.addEventListener('keydown', onEsc);

  const period = defaultPeriod(), pdate = period + '-01', today = todayIso();
  const [{ data: c, error }, { data: ents }, { data: note }, { data: tickets }, reqs, alerts, files] = await Promise.all([
    sb.from('clients').select(CLIENT_COLS + ',address,regon,notes').eq('id', id).maybeSingle(),
    sb.from('checklist_entries').select('id,client_id,task_code,status,updated_by,updated_at').eq('client_id', id).eq('period', pdate),
    sb.from('period_notes').select('notes,questions').eq('client_id', id).eq('period', pdate).maybeSingle(),
    sb.from('rkdp_tickets').select('id,no,title,status,due_date,priority').eq('client_id', id).in('status', ['nowe', 'w_toku', 'czeka']).order('due_date'),
    fetchSoft(() => sb.from('doc_requests').select('*').eq('client_id', id).order('created_at', { ascending: false })),
    fetchSoft(() => sb.from('monitor_alerts').select('*').eq('client_id', id).eq('module', 'rkdp').order('created_at', { ascending: false })),
    fetchSoft(() => sb.from('period_files').select('id').eq('client_id', id).eq('period', pdate)),
  ]);
  if (current !== wrap) return;
  if (error || !c) { box.replaceChildren(h('p', { class: 'empty' }, 'Nie udało się wczytać klienta.')); return; }
  rememberRecent({ label: c.name, href: `#/klient/${c.id}`, meta: c.nip ? `NIP ${c.nip}` : '', panel: c.id });

  const tasks = state.taskTypes.filter(t => t.active);
  const byCode = new Map((ents || []).map(e => [e.task_code, e]));
  const acc = memberById(c.accountant_id), hr = memberById(c.hr_id);
  const chip = (v) => v ? h('span', { class: 'badge' }, v) : null;

  // kratki bieżącego miesiąca
  const cellsBox = h('div', { class: 'cp-cells' });
  const drawCells = () => cellsBox.replaceChildren(...['ksiegowosc', 'kadry'].map(area => {
    const ts = tasks.filter(t => t.area === area && byCode.has(t.code));
    if (!ts.length) return null;
    return h('div', { class: 'cp-area' }, h('span', { class: 'lbl-sm' }, area === 'kadry' ? 'Kadry i ZUS' : 'Księgowość'),
      h('div', { class: 'cp-row' }, ts.map(t => {
        const e = byCode.get(t.code);
        return h('button', { class: 'cp-cell', type: 'button', 'data-tip': `${t.label}: ${STATUS[e.status].label}`,
          onclick: ev => openPop(ev.currentTarget, [h('label', {}, t.label), STATUS_ORDER.map(s => h('button', { class: 'opt' + (e.status === s ? ' cur' : ''), onclick: () => { closePop(); set(e, s); } },
            h('span', { class: `cb cb-${s}`, style: { width: '22px', height: '22px', fontSize: '12px' } }, STATUS[s].mark), s === 'todo' ? 'Wyczyść (do zrobienia)' : STATUS[s].label))]) },
        h('span', { class: `cb cb-${e.status === 'in_progress' ? 'todo' : e.status}` }, STATUS[e.status].mark), h('span', {}, t.code === 'pit_cit' ? (sectionOf(c) === 'kapitalowe' ? 'CIT' : 'PIT') : t.label));
      })));
  }).filter(Boolean).concat((ents || []).length ? [] : [h('p', { class: 'muted small' }, `Brak listy na ${periodLabel(period).toLowerCase()}.`)]));
  async function set(e, s, silent) {
    const before = e.status; e.status = s; drawCells();
    const { error: er } = await sb.from('checklist_entries').update({ status: s }).eq('id', e.id);
    if (er) { e.status = before; drawCells(); return fail(er); }
    if (!silent) toastAction(`${c.name}: ${STATUS[s].label}`, 'Cofnij', () => set(e, before, true));
  }
  drawCells();

  // zdjęcie dokumentu / plik do bieżącego miesiąca
  const cam = h('input', { type: 'file', accept: 'image/*,application/pdf', capture: 'environment', hidden: true });
  cam.addEventListener('change', async () => {
    const f = cam.files[0]; cam.value = '';
    if (!f) return;
    const path = `${c.id}/${period}/${crypto.randomUUID().slice(0, 8)}-${(f.name || 'zdjecie.jpg').replace(/[^\w.\-]+/g, '_').slice(-60)}`;
    const { error: e1 } = await sb.storage.from('rozliczenia').upload(path, f, { contentType: f.type || 'image/jpeg', upsert: false });
    if (e1) return fail(e1, 'Nie wysłano zdjęcia');
    const { error: e2 } = await sb.from('period_files').insert({ client_id: c.id, period: pdate, path, name: f.name || 'zdjęcie dokumentu', mime: f.type || null, size: f.size, uploaded_by: state.me.id });
    if (e2) { await sb.storage.from('rozliczenia').remove([path]); return fail(e2); }
    toast(`Dodano do załączników – ${periodLabel(period).toLowerCase()}`);
  });

  const upcoming = [0, 1].flatMap(k => { const d = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1 + k, 1); return obligationsInMonth(c, d.getFullYear(), d.getMonth() + 1); })
    .filter(o => o.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const openReq = reqs.filter(r => !r.closed_at && new Date(r.expires_at) > new Date());
  const missingCodes = (ents || []).filter(e => ['missing_docs', 'reminded'].includes(e.status)).map(e => e.task_code);

  box.replaceChildren(...[
    h('div', { class: 'cp-head' },
      h('p', { class: 'eyebrow' }, [LEGAL_SHORT[c.legal_form], c.status !== 'aktywny' ? c.status : null].filter(Boolean).join(' · ')),
      h('h2', {}, c.name),
      h('div', { class: 'cp-chips' }, chip(VAT_SHORT[c.vat_status]), chip(sectionOf(c) === 'kapitalowe' ? CIT_SHORT[c.cit_type] : PIT_SHORT[c.pit_form]), c.has_employees ? chip('pracownicy') : null, c.nip ? chip('NIP ' + c.nip) : null),
      h('div', { class: 'cp-contact' },
        c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : h('span', { class: 'muted' }, 'brak e-maila'),
        c.phone ? h('a', { href: `tel:${c.phone.replace(/\s/g, '')}` }, c.phone) : null),
      h('div', { class: 'cp-people' },
        h('span', { class: 'person', style: { cursor: 'default' } }, h('span', { class: 'av' }, acc ? ava(acc) : '–'), acc ? `Księgowa: ${acc.short_name}` : 'Księgowa: brak'),
        h('span', { class: 'person', style: { cursor: 'default' } }, h('span', { class: 'av' }, hr ? ava(hr) : '–'), hr ? `Kadry: ${hr.short_name}` : 'Kadry: brak')),
      h('div', { class: 'cp-actions' },
        h('a', { class: 'btn btn-primary btn-sm', href: `#/klient/${c.id}`, onclick: () => closePanel() }, 'Pełna karta klienta →'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => import('./watek.js').then(m => m.openThread({ client: c, period })) }, 'Rozmowa'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => openDocRequest(c, period, missingCodes) }, icon('mail'), 'Wyślij wiadomość'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => cam.click() }, icon('camera'), 'Zdjęcie dokumentu'), cam)),
    alerts.filter(a => !a.resolved_at).length ? sec('Monitoring – zmiany do sprawdzenia', ...alerts.filter(a => !a.resolved_at).map(a => h('div', { class: 'cp-alert' }, h('b', {}, fmtFull(a.created_at.slice(0, 10))), ' ', a.summary,
      h('button', { class: 'btn btn-ghost btn-sm', onclick: async (e) => { const { error: er } = await sb.from('monitor_alerts').update({ resolved_at: new Date().toISOString(), resolved_by: state.me.id }).eq('id', a.id); if (er) return fail(er); e.target.closest('.cp-alert').remove(); toast('Oznaczono jako sprawdzone'); } }, 'Sprawdzone')))) : null,
    sec(`Bieżący miesiąc – ${periodLabel(period).toLowerCase()}`, cellsBox,
      note?.notes || note?.questions ? h('div', { class: 'cp-note' }, note.notes ? h('p', {}, h('b', {}, 'Uwagi: '), note.notes) : null, note.questions ? h('p', {}, h('b', {}, 'Pytania: '), note.questions) : null) : null,
      files.length ? h('p', { class: 'muted small' }, `Załączniki w tym miesiącu: ${files.length}`) : null),
    openReq.length ? sec('Prośby o dokumenty', ...openReq.map(r => h('div', { class: 'cp-li' }, h('span', {}, `${periodLabel(String(r.period).slice(0, 7))} · `, r.files_count ? h('b', { class: 'ok-t' }, `wgrano plików: ${r.files_count}`) : r.sent_at ? 'czeka na pliki' : 'nie wysłano'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { navigator.clipboard?.writeText(uploadLink(r.token)); toast('Skopiowano link dla klienta'); } }, 'Kopiuj link')))) : null,
    sec('Najbliższe terminy', upcoming.length ? h('div', { class: 'cp-list' }, upcoming.map(o => h('div', { class: 'cp-li' }, h('span', {}, h('span', { class: 'kchip', style: `--k:${KINDS[o.kind].color}` }, KINDS[o.kind].short), ' ', o.label), h('b', {}, fmtShort(o.date)))))
      : h('p', { class: 'muted small' }, 'Brak terminów w najbliższych tygodniach (albo profil klienta nie jest uzupełniony).'),
    h('a', { class: 'small', href: '#/terminy', onclick: () => closePanel() }, 'Kalendarz obowiązków →')),
    sec('Zgłoszenia w toku', (tickets || []).length ? h('div', { class: 'cp-list' }, tickets.map(t => h('a', { class: 'cp-li', href: `#/zgloszenia/${t.id}`, onclick: () => closePanel() }, h('span', {}, `#${t.no} ${t.title}`), h('span', { class: 'muted small' }, t.due_date ? fmtShort(t.due_date) : ''))))
      : h('p', { class: 'muted small' }, 'Brak otwartych zgłoszeń.')),
  ].filter(Boolean));
}
