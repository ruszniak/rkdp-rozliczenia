// Kalendarz Google: połączenie konta (Profil), podgląd najbliższych wydarzeń (Pulpit) i szybka synchronizacja po zmianach.
import { h, toast, fail, icon } from './ui.js';
import { sb, state } from './store.js';

const call = async (action, extra = {}) => {
  const { data, error } = await sb.functions.invoke('gcal', { body: { action, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(x => x != null && x !== false));
let statusP = null;
export const gcalStatus = (fresh = false) => (statusP && !fresh ? statusP : (statusP = call('status').catch(() => ({ configured: false, connected: false }))));

// po zapisaniu terminu / zadania – zaktualizuj kalendarz za kilka sekund (zbiorczo)
let syncT = null;
export function gcalSyncSoon() {
  clearTimeout(syncT);
  syncT = setTimeout(async () => { const st = await gcalStatus(); if (st.configured) call('sync', { all: true }).catch(() => {}); }, 4000);
}

const ago = iso => {
  if (!iso) return 'jeszcze nie';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'przed chwilą' : m < 60 ? `${m} min temu` : m < 1440 ? `${Math.round(m / 60)} godz. temu` : new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ---------- Profil: karta „Kalendarz Google” ----------
export function gcalCard() {
  const box = h('section', { class: 'card section gc-card' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
  // wynik powrotu z Google (#/profil?google=ok&msg=…)
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('google')) {
    toast(q.get('msg') || (q.get('google') === 'ok' ? 'Połączono z Kalendarzem Google' : 'Nie udało się połączyć'), q.get('google') !== 'ok');
    history.replaceState(null, '', '#/profil');
  }
  const draw = async (fresh) => {
    const st = await gcalStatus(fresh);
    const head = h('div', { class: 'section-head' }, h('h2', {}, 'Kalendarz Google'), st.connected ? h('span', { class: 'badge ok' }, 'połączony') : null);
    if (!st.configured) {
      put(box, head, h('p', { class: 'hint' }, 'Połączenie z Kalendarzem Google nie jest jeszcze włączone przez administratora.'));
      return;
    }
    if (!st.connected) {
      const btn = h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        btn.disabled = true;
        try { const r = await call('connect', { email: state.me.email }); location.href = r.url; } catch (e) { btn.disabled = false; fail(e); }
      } }, icon('plus'), 'Połącz z Google');
      put(box, head,
        h('p', { style: { margin: '0 0 10px', lineHeight: 1.55 } }, 'Po połączeniu w Twoim Google pojawi się osobny kalendarz ', h('b', {}, st.calendar_name || 'RKDP – terminy i zadania'),
          ' z terminami spraw, zadaniami z terminem i pytaniami do Ciebie – z przypomnieniami dzień wcześniej o 9:00 (terminy procesowe także 3 dni wcześniej). Zrobione pozycje same znikają. Na Pulpicie zobaczysz najbliższe spotkania z Twojego kalendarza.'),
        h('p', { class: 'hint', style: { margin: '0 0 12px' } }, 'Google może pokazać ostrzeżenie „aplikacja niezweryfikowana” – to nasza wewnętrzna aplikacja; wybierz „Zaawansowane” → „Przejdź do…”, potem zaznacz zgody na kalendarz.'),
        btn);
      return;
    }
    const reconnect = !st.can_book ? h('div', { class: 'gc-err', style: { background: '#EEF4FF', color: '#1E3A8A' } },
      h('b', {}, 'Połącz ponownie, aby umawiać spotkania. '), 'Aplikacja potrzebuje dodatkowej zgody: dodawania spotkań do Twojego kalendarza i sprawdzania, kiedy jesteś zajęty. ',
      h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: '8px' }, onclick: async (e) => { e.target.disabled = true; try { const r = await call('connect', { email: state.me.email }); location.href = r.url; } catch (er) { e.target.disabled = false; fail(er); } } }, 'Połącz ponownie z Google'))
      : !st.can_summary ? h('div', { class: 'gc-err', style: { background: '#EEF4FF', color: '#1E3A8A' } },
        h('b', {}, 'Podsumowania spotkań z Google Meet. '), 'Połącz ponownie, aby app.R sama pobierała notatki Gemini po spotkaniach online (dostęp tylko do plików utworzonych przez Google Meet). ',
        h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: '8px' }, onclick: async (e) => { e.target.disabled = true; try { const r = await call('connect', { email: state.me.email }); location.href = r.url; } catch (er) { e.target.disabled = false; fail(er); } } }, 'Połącz ponownie z Google')) : null;
    const syncBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
      syncBtn.disabled = true;
      try { const r = await call('sync'); toast(`Kalendarz zaktualizowany (${r.total} pozycji${r.added || r.changed || r.removed ? `: +${r.added} / zmienione ${r.changed} / usunięte ${r.removed}` : ''})`); draw(true); }
      catch (e) { fail(e); syncBtn.disabled = false; }
    } }, 'Synchronizuj teraz');
    const offBtn = h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
      if (!confirm('Odłączyć Kalendarz Google? Kalendarz „RKDP – terminy i zadania” zostanie usunięty z Twojego Google (Twoje inne wydarzenia zostają).')) return;
      try { await call('disconnect'); toast('Odłączono Kalendarz Google'); draw(true); } catch (e) { fail(e); }
    } }, 'Odłącz');
    put(box, head,
      h('div', { class: 'gc-rows' },
        h('div', {}, h('span', { class: 'muted small' }, 'Konto'), h('b', {}, st.google_email || '—')),
        h('div', {}, h('span', { class: 'muted small' }, 'Kalendarz z aplikacji'), h('b', {}, st.calendar_name)),
        h('div', {}, h('span', { class: 'muted small' }, 'Ostatnia synchronizacja'), h('b', {}, ago(st.last_sync_at)))),
      reconnect,
      st.last_error ? h('p', { class: 'gc-err' }, '⚠ ', st.last_error) : null,
      h('p', { class: 'hint', style: { margin: '10px 0 12px' } }, 'Aktualizuje się samo co 10 minut i zaraz po zmianach w aplikacji. Zmieniaj terminy i zadania w aplikacji – zmiany zrobione w Google zostaną nadpisane.'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, syncBtn, offBtn));
  };
  draw(false).catch(e => put(box, h('p', { class: 'hint' }, 'Nie udało się wczytać: ' + (e.message || e))));
  return box;
}

// ---------- Pulpit: najbliższe wydarzenia z Kalendarza Google ----------
const DAY = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const HM = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
export function gcalAgendaCard({ days = 7 } = {}) {
  const box = h('section', { class: 'card gc-agenda' });
  (async () => {
    const st = await gcalStatus();
    if (!st.configured) { box.remove(); return; }
    const shared = st.shared || [];
    // kalendarze do wyboru: mój (jeśli połączony) i udostępnione mi przez innych (np. kalendarz Michała)
    const opts = [...(st.connected ? [{ id: null, name: 'Mój' }] : []), ...shared.map(x => ({ id: x.id, name: x.name.split(/\s+/)[0] }))];
    if (!opts.length) {
      let hide = false; try { hide = localStorage.getItem('rkdp_gcal_cta') === '0'; } catch { /* */ }
      if (hide) { box.remove(); return; }
      box.classList.add('gc-cta');
      put(box, h('span', { class: 'gc-ico', html: CAL_SVG }), h('div', { style: { flex: 1 } }, h('b', {}, 'Połącz Kalendarz Google'),
        h('div', { class: 'small muted' }, 'Terminy i zadania z przypomnieniami w Twoim kalendarzu, a tutaj – Twoje najbliższe spotkania.')),
      h('a', { class: 'btn btn-primary btn-sm', href: '#/profil' }, 'Połącz'),
      h('button', { class: 'icon-btn', 'aria-label': 'Ukryj', onclick: () => { try { localStorage.setItem('rkdp_gcal_cta', '0'); } catch { /* */ } box.remove(); } }, '✕'));
      return;
    }
    let cur = opts[0].id;
    try { const saved = localStorage.getItem('rkdp_gcal_view'); if (saved !== null && opts.some(o => String(o.id) === saved)) cur = saved === 'null' ? null : saved; } catch { /* */ }
    const seg = h('div', { class: 'gc-seg' });
    const head = h('div', { class: 'gc-head' }, h('span', { class: 'gc-ico', html: CAL_SVG }), h('h2', {}, 'Kalendarz'), h('span', { class: 'small muted' }, 'najbliższe ' + days + ' dni'),
      h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' } },
        h('a', { class: 'small', href: '#/spotkania' }, 'Spotkania'),
        h('button', { class: 'btn btn-primary btn-sm gc-add', type: 'button', onclick: () => import('./spotkania.js').then(m => m.openMeetingDialog({ onDone: () => location.reload() })) }, '+ Umów')));
    const listBox = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
    put(box, head, opts.length > 1 ? seg : null, listBox);
    const load = async () => {
      put(seg, ...opts.map(o => h('button', { type: 'button', class: String(o.id) === String(cur) ? 'on' : '', onclick: () => { cur = o.id; try { localStorage.setItem('rkdp_gcal_view', String(cur)); } catch { /* */ } load(); } }, o.name)));
      put(listBox, h('p', { class: 'hint' }, 'Wczytywanie…'));
      const { items } = await call('events', cur ? { days, member: cur } : { days });
      const byDay = new Map();
      for (const e of items) {
        const k = e.allDay ? e.start : new Date(e.start).toLocaleDateString('sv-SE');
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(e);
      }
      const todayK = new Date().toLocaleDateString('sv-SE');
      const tom = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');
      const label = k => k === todayK ? 'Dziś' : k === tom ? 'Jutro' : DAY.format(new Date(k + 'T12:00:00'));
      put(listBox, h('div', { class: 'gc-days' }, ...(items.length ? [...byDay.entries()].slice(0, 8).map(([k, es]) => h('div', { class: 'gc-day' + (k === todayK ? ' today' : '') },
        h('div', { class: 'gc-dl' }, label(k)),
        h('div', { class: 'gc-evs' }, ...es.map(e => h(cur ? 'div' : 'a', { class: 'gc-ev', 'data-s': e.allDay ? '' : e.start, 'data-e': e.allDay ? '' : (e.end || ''), ...(cur ? {} : { href: e.link || '#', target: '_blank', rel: 'noopener' }) },
          h('span', { class: 'gc-t' }, e.allDay ? 'cały dzień' : HM.format(new Date(e.start))),
          h('span', { class: 'gc-n' }, e.title, h('em', { class: 'gc-st' }), e.location ? h('small', {}, e.location) : null),
          e.meet ? h('a', { class: 'gc-meet', href: e.meet, target: '_blank', rel: 'noopener', onclick: ev => ev.stopPropagation() }, 'Meet') : null)))))
        : [h('p', { class: 'hint', style: { padding: '6px 0' } }, 'Brak wydarzeń w najbliższych dniach. 🙂')])));
      markNow(listBox);
    };
    // co minutę: „trwa” przy bieżącym wydarzeniu, „zakończone” (wyszarzone) przy tych, które już minęły
    const tick = setInterval(() => { if (!box.isConnected) return clearInterval(tick); markNow(listBox); }, 60_000);
    await load().catch(e => put(listBox, h('p', { class: 'hint' }, 'Kalendarz Google: ' + (e.message || e) + ' ', h('a', { href: '#/profil' }, 'Profil →'))));
  })().catch(e => { put(box, h('p', { class: 'hint' }, 'Kalendarz Google: ' + (e.message || e) + ' ', h('a', { href: '#/profil' }, 'Profil →'))); });
  return box;
}
function markNow(root) {
  const now = Date.now();
  root.querySelectorAll('.gc-ev[data-s]').forEach(el => {
    const s = Date.parse(el.dataset.s), e = Date.parse(el.dataset.e) || s + 3600_000;
    if (!s) return;
    const st = now >= e ? 'past' : now >= s ? 'now' : '';
    el.classList.toggle('past', st === 'past'); el.classList.toggle('now', st === 'now');
    const tag = el.querySelector('.gc-st'); if (tag) tag.textContent = st === 'past' ? 'zakończone' : st === 'now' ? 'trwa' : '';
  });
}
const CAL_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
