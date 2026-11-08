// Spotkania: umawianie (z klientem albo prywatne), lista, grafik przyjęć, rodzaje spotkań, kalendarze Google, okienko na stronę.
// Zapis spotkań przez funkcję „spotkania” (Kalendarz Google + e-mail do klienta); grafik i rodzaje – bezpośrednio w bazie (RLS).
import { h, toast, fail, icon, modal, ava } from './ui.js';
import { sb, state, isAdmin, memberById } from './store.js';

const call = async (action, extra = {}) => {
  const { data, error } = await sb.functions.invoke('spotkania', { body: { action, ...extra } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};
const gcall = async (action, extra = {}) => {
  const { data, error } = await sb.functions.invoke('gcal', { body: { action, ...extra } });
  if (error) { let msg = error.message; try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ } throw new Error(msg); }
  if (data?.error) throw new Error(data.error);
  return data;
};

// replaceChildren bez pustych elementów (null / false)
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(x => x != null && x !== false));
const CHANNEL = { rkdp: 'ze strony rkdp.pl', m2tax: 'ze strony m2tax.pl', link: 'z linku', app: 'w aplikacji' };
const MODE = { meet: 'Google Meet', office: 'Stacjonarnie', phone: 'Telefon' };
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const today = () => isoDay(new Date());
const mondayOf = s => { const d = new Date(s + 'T12:00:00'); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoDay(d); };
const DAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
const DAYS_L = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
const dayLabel = s => new Date(s + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const hm = iso => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const fmtRanges = r => (r || []).map(([a, b]) => `${a.replace(/^0/, '')}–${b.replace(/^0/, '')}`).join(', ');
const firstName = n => String(n || '').split(/\s+/)[0];

let typesP = null;
const loadTypes = (fresh) => (typesP && !fresh ? typesP : (typesP = sb.from('meeting_types').select('*').order('sort').then(r => r.data || [])));
// doradcy przyjmujący spotkania: z rodzajów spotkań + ustawień kalendarzy
async function advisorIds() {
  const [types, { data: bm }] = await Promise.all([loadTypes(), sb.from('booking_members').select('member_id')]);
  const ids = new Set([...types.flatMap(t => t.advisors || []), ...(bm || []).map(x => x.member_id)]);
  return state.members.filter(m => m.active !== false && ids.has(m.id)).map(m => m.id);
}
const avaChip = m => h('span', { class: 'sp-av', title: m?.full_name || '' }, ava(m));

// ======================= Umów spotkanie =======================
export async function openMeetingDialog(opts = {}) {
  const types = (await loadTypes()).filter(t => t.active);
  const adv = await advisorIds();
  const me = state.me.id;
  const st = {
    priv: !!opts.private, type: types[0]?.id || '', dur: types[0]?.duration_min || 60, mode: types[0]?.mode || 'meet', place: types[0]?.place || '',
    members: [adv.includes(me) || !adv.length ? me : adv[0]], day: opts.day || today(), start: null, manual: '',
    client: { id: opts.client_id || null, m2: opts.m2_client_id || null, name: opts.name || '', email: opts.email || '', phone: opts.phone || '' },
    notify: true, title: '', topic: '', matter: opts.matter_id || null,
  };
  // klienci do podpowiedzi (RKDP + M2 TAX widoczni dla tej osoby)
  let clients = [];
  Promise.all([
    sb.from('clients').select('id,name,email,phone').neq('status', 'zakonczony').order('name').limit(3000),
    sb.from('m2_clients').select('id,name,email,phone,firm').eq('firm', 'm2').order('name').limit(3000),
  ]).then(([a, b]) => { clients = [...(a.data || []).map(c => ({ ...c, kind: 'rkdp' })), ...(b.data || []).map(c => ({ ...c, kind: 'm2' }))]; }).catch(() => {});

  const body = h('div', { class: 'sp-dlg' });
  const left = h('div', { class: 'sp-dlg-l' }), right = h('div', { class: 'sp-dlg-r' });
  body.append(left, right);
  let closeFn = () => {};
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save() }, 'Umów spotkanie');

  const seg = h('div', { class: 'sp-seg', role: 'tablist' });
  const drawSeg = () => put(seg, ...[[false, 'Z klientem'], [true, 'Prywatne / wewnętrzne']].map(([v, l]) =>
    h('button', { type: 'button', class: st.priv === v ? 'on' : '', 'aria-selected': String(st.priv === v), onclick: () => { st.priv = v; draw(); } }, l)));

  // --- klient: wyszukiwarka + ręczne pola ---
  const cName = h('input', { class: 'input', placeholder: 'Wpisz nazwę klienta albo imię i nazwisko', autocomplete: 'off' });
  const cEmail = h('input', { class: 'input', type: 'email', placeholder: 'e-mail klienta' });
  const cPhone = h('input', { class: 'input', type: 'tel', placeholder: 'telefon' });
  const sugg = h('div', { class: 'sp-sugg', hidden: true });
  cName.value = st.client.name; cEmail.value = st.client.email; cPhone.value = st.client.phone;
  cName.addEventListener('input', () => {
    st.client = { ...st.client, name: cName.value, id: null, m2: null };
    const q = cName.value.trim().toLowerCase();
    const list = q.length < 2 ? [] : clients.filter(c => c.name.toLowerCase().includes(q)).slice(0, 7);
    sugg.hidden = !list.length;
    put(sugg, ...list.map(c => h('button', { type: 'button', onclick: () => {
      st.client = { id: c.kind === 'rkdp' ? c.id : null, m2: c.kind === 'm2' ? c.id : null, name: c.name, email: c.email || '', phone: c.phone || '' };
      cName.value = c.name; cEmail.value = c.email || ''; cPhone.value = c.phone || ''; sugg.hidden = true; drawNotify();
    } }, h('b', {}, c.name), h('span', { class: `firm-tag firm-${c.kind}` }, c.kind === 'm2' ? 'M2 TAX' : 'RKDP'), c.email ? h('small', {}, c.email) : null)));
  });
  cName.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 200));
  cEmail.addEventListener('input', () => { st.client.email = cEmail.value.trim(); drawNotify(); });
  cPhone.addEventListener('input', () => { st.client.phone = cPhone.value.trim(); });
  const titleIn = h('input', { class: 'input', placeholder: 'np. Lekarz, Spotkanie zespołu, Szkolenie' });
  titleIn.addEventListener('input', () => { st.title = titleIn.value; });
  const topicIn = h('textarea', { class: 'input', rows: 2, placeholder: 'Temat / notatka (widoczna w kalendarzu)' });
  topicIn.addEventListener('input', () => { st.topic = topicIn.value; });

  // --- rodzaj, forma, osoby ---
  const typeBox = h('div', { class: 'sp-chips' });
  const drawTypes = () => put(typeBox, ...types.map(t => h('button', { type: 'button', class: 'sp-chip' + (st.type === t.id ? ' on' : ''), onclick: () => {
    st.type = t.id; st.dur = t.duration_min; st.mode = t.mode; st.place = t.place || ''; drawTypes(); drawMode(); loadDay();
  } }, t.name.replace(/\s*\(.*?\)/g, '').replace(/^Spotkanie /, '').replace(/^\w/, c => c.toUpperCase()), h('small', {}, ` ${t.duration_min} min`))),
  h('button', { type: 'button', class: 'sp-chip' + (!st.type ? ' on' : ''), onclick: () => { st.type = ''; drawTypes(); drawMode(); } }, 'Inne…'));
  const durSel = h('select', { class: 'select' }, ...[15, 20, 30, 45, 60, 90, 120, 180, 240].map(m => h('option', { value: m }, m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5'))));
  durSel.addEventListener('change', () => { st.dur = +durSel.value; loadDay(); });
  const modeSel = h('select', { class: 'select' }, h('option', { value: 'meet' }, 'Google Meet'), h('option', { value: 'office' }, 'Stacjonarnie'), h('option', { value: 'phone' }, 'Telefon'));
  modeSel.addEventListener('change', () => { st.mode = modeSel.value; drawMode(); });
  const placeIn = h('input', { class: 'input', placeholder: 'Adres / miejsce' });
  placeIn.addEventListener('input', () => { st.place = placeIn.value; });
  const modeBox = h('div', { class: 'sp-mode' });
  const drawMode = () => {
    durSel.value = String(st.dur); modeSel.value = st.mode; placeIn.value = st.place;
    const t = types.find(x => x.id === st.type);
    put(modeBox, ...(t && !st.priv ? [h('p', { class: 'small muted', style: { margin: 0 } }, `${MODE[t.mode]}${t.place ? ' · ' + t.place : ''} · ${t.duration_min} min`)]
      : [h('div', { class: 'sp-row3' }, h('label', { class: 'field' }, h('span', {}, 'Czas'), durSel), h('label', { class: 'field' }, h('span', {}, 'Forma'), modeSel),
        st.mode === 'office' ? h('label', { class: 'field' }, h('span', {}, 'Miejsce'), placeIn) : null)]));
  };
  const others = state.members.filter(m => m.active !== false && !adv.includes(m.id) && !(m.modules || []).every(x => x === 'jpk'));
  const memBox = h('div', { class: 'sp-chips' });
  let showAll = false;
  const drawMembers = () => {
    const list = [...adv, ...(showAll ? others.map(m => m.id) : st.members.filter(id => !adv.includes(id)))].map(memberById).filter(Boolean);
    put(memBox, ...list.map(m => h('button', { type: 'button', class: 'sp-chip sp-chip-p' + (st.members.includes(m.id) ? ' on' : ''), onclick: () => {
      st.members = st.members.includes(m.id) ? st.members.filter(x => x !== m.id) : [...st.members, m.id];
      if (!st.members.length) st.members = [m.id];
      drawMembers(); loadDay();
    } }, avaChip(m), firstName(m.full_name))),
    !showAll && others.length ? h('button', { type: 'button', class: 'sp-chip sp-chip-ghost', onclick: () => { showAll = true; drawMembers(); } }, '+ ktoś z zespołu') : null);
  };

  // --- dzień i godzina ---
  const dayIn = h('input', { class: 'input', type: 'date', value: st.day, min: today() });
  dayIn.addEventListener('change', () => { st.day = dayIn.value || today(); loadDay(); });
  const navDay = n => { st.day = addDays(st.day, n); if (st.day < today()) st.day = today(); dayIn.value = st.day; loadDay(); };
  const slotBox = h('div', { class: 'sp-slots' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
  const manualIn = h('input', { class: 'input', type: 'time', step: 300, style: { width: '120px' } });
  manualIn.addEventListener('change', () => { st.manual = manualIn.value; st.start = null; drawSlotsSel(); });
  let slots = [];
  const drawSlotsSel = () => slotBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === st.start));
  const timeline = h('div', { class: 'sp-tl' });
  let seq = 0;
  async function loadDay() {
    const my = ++seq;
    st.start = null;
    put(slotBox, h('p', { class: 'hint' }, 'Sprawdzam wolne godziny…'));
    put(timeline, h('p', { class: 'hint' }, 'Wczytywanie…'));
    try {
      const r = await call('day', { members: st.members, day: st.day, duration: st.dur });
      if (my !== seq) return;
      slots = r.slots || [];
      const noG = Object.entries(r.google || {}).filter(([, v]) => !v).map(([k]) => firstName(memberById(k)?.full_name));
      put(slotBox, 
        ...(slots.length ? slots.map(s => h('button', { type: 'button', class: 'sp-slot', 'data-s': s.start, onclick: () => { st.start = s.start; st.manual = ''; manualIn.value = ''; drawSlotsSel(); } }, s.t))
          : [h('p', { class: 'hint', style: { margin: '4px 0' } }, st.members.length > 1 ? 'Brak godziny, w której wszyscy są wolni – wpisz godzinę ręcznie albo zmień dzień.' : 'Brak wolnych godzin w grafiku tego dnia – możesz wpisać godzinę ręcznie.')]),
        noG.length ? h('p', { class: 'sp-warn' }, `Bez Kalendarza Google: ${noG.join(', ')} – widać tylko spotkania z aplikacji.`) : null);
      drawTimeline(r.members || []);
    } catch (e) { if (my === seq) { put(slotBox, h('p', { class: 'sp-warn' }, e.message)); put(timeline, ); } }
  }
  function drawTimeline(ms) {
    const H0 = 7, H1 = 20, PX = 34;
    const y = t => { const [a, b] = t.split(':').map(Number); return Math.max(0, Math.min(H1 - H0, a + b / 60 - H0)) * PX; };
    const cols = ms.map(m => {
      const mem = memberById(m.id);
      return h('div', { class: 'sp-tl-col' },
        h('div', { class: 'sp-tl-h' }, avaChip(mem), firstName(mem?.full_name)),
        h('div', { class: 'sp-tl-body', style: { height: (H1 - H0) * PX + 'px' } },
          ...(m.hours || []).map(([a, b]) => h('div', { class: 'sp-tl-work', style: { top: y(a) + 'px', height: (y(b) - y(a)) + 'px' } })),
          ...(m.busy || []).map(b => h('div', { class: 'sp-tl-busy' + (b.app ? ' app' : ''), style: { top: y(b.s) + 'px', height: Math.max(14, y(b.e) - y(b.s)) + 'px' }, title: `${b.s}–${b.e} ${b.label}` }, `${b.s} ${b.label}`))));
    });
    put(timeline, 
      h('div', { class: 'sp-tl-head' }, h('b', {}, dayLabel(st.day)), h('span', { class: 'small muted' }, 'z Google i aplikacji'),
        h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '4px' } }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Poprzedni dzień', onclick: () => navDay(-1) }, '‹'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Następny dzień', onclick: () => navDay(1) }, '›'))),
      h('div', { class: 'sp-tl-grid' },
        h('div', { class: 'sp-tl-hours', style: { height: (H1 - H0) * PX + 'px' } }, ...Array.from({ length: H1 - H0 + 1 }, (_, i) => h('span', { style: { top: i * PX + 'px' } }, `${H0 + i}:00`))),
        ...cols),
      h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Jasne tło – godziny przyjęć. Prywatne wpisy z Google widać tylko jako „Zajęty”.'));
  }

  const notifyBox = h('div');
  const drawNotify = () => {
    const em = st.client.email;
    put(notifyBox, !st.priv ? h('label', { class: 'sp-check' }, h('input', { type: 'checkbox', checked: st.notify && !!em, disabled: !em, onchange: e => { st.notify = e.target.checked; } }),
      em ? 'Wyślij klientowi potwierdzenie i przypomnienie (e-mail z app@ruszniak.io)' : 'Podaj e-mail klienta, aby wysłać mu potwierdzenie') : null,
    st.matter ? h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'Spotkanie zostanie przypięte do sprawy.') : null);
  };

  function draw() {
    drawSeg(); drawTypes(); drawMode(); drawMembers(); drawNotify();
    put(left, 
      seg,
      st.priv ? h('label', { class: 'field' }, h('span', {}, 'Tytuł'), titleIn)
        : h('div', { class: 'field sp-client' }, h('span', {}, 'Klient'), h('div', { style: { position: 'relative' } }, cName, sugg),
          h('div', { class: 'sp-row2' }, cEmail, cPhone)),
      !st.priv ? h('div', { class: 'field' }, h('span', {}, 'Rodzaj'), typeBox) : null,
      modeBox,
      h('div', { class: 'field' }, h('span', {}, 'Kto z nas'), memBox, h('small', { class: 'muted' }, 'Zaznacz kilka osób – spotkanie trafi do kalendarza każdej z nich i każdy dostanie przypomnienie.')),
      h('div', { class: 'field' }, h('span', {}, 'Dzień'), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, dayIn)),
      h('div', { class: 'field' }, h('span', {}, st.members.length > 1 ? 'Wolne u wszystkich' : 'Wolne godziny'), slotBox,
        h('div', { class: 'small muted', style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } }, 'albo inna godzina:', manualIn)),
      h('label', { class: 'field' }, h('span', {}, st.priv ? 'Notatka' : 'Temat'), topicIn),
      notifyBox);
    put(right, timeline);
    if (st.priv && !st.type) { /* bez rodzaju */ }
  }
  async function save() {
    let start = st.start;
    if (!start && st.manual) start = new Date(`${st.day}T${st.manual}:00`).toISOString();
    if (!start) return toast('Wybierz godzinę', true);
    if (!st.priv && !cName.value.trim()) return toast('Wpisz klienta', true);
    if (st.priv && !titleIn.value.trim()) return toast('Wpisz tytuł spotkania', true);
    saveBtn.disabled = true; saveBtn.textContent = 'Umawiam…';
    try {
      const t = types.find(x => x.id === st.type);
      const r = await call('create', {
        private: st.priv, type_id: !st.priv && t ? t.id : null, duration: t && !st.priv ? t.duration_min : st.dur, mode: t && !st.priv ? t.mode : st.mode, place: t && !st.priv ? t.place : st.place,
        members: st.members, start, title: st.priv ? titleIn.value.trim() : '', topic: topicIn.value.trim(),
        client_name: cName.value.trim(), client_email: cEmail.value.trim(), client_phone: cPhone.value.trim(),
        client_id: st.client.id, m2_client_id: st.client.m2, matter_id: st.matter, notify_client: st.notify,
      });
      closeFn();
      toast(`Umówiono${r.google ? ' – jest w Kalendarzu Google' : ''}${r.mailed ? ', klient dostał potwierdzenie' : ''}`);
      import('./gcal.js').then(m => m.gcalStatus(true)).catch(() => {});
      opts.onDone?.(r.meeting);
    } catch (e) { fail(e); saveBtn.disabled = false; saveBtn.textContent = 'Umów spotkanie'; }
  }
  draw();
  loadDay();
  modal(opts.title || 'Umów spotkanie', body, close => { closeFn = close; return [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), saveBtn]; }, { wide: true });
}

// ======================= Szczegóły spotkania =======================
async function meetingMembers(ids) {
  const { data } = await sb.from('meeting_members').select('meeting_id,member_id,active').in('meeting_id', ids);
  const by = new Map(), act = new Map();
  (data || []).forEach(x => { by.set(x.meeting_id, [...(by.get(x.meeting_id) || []), x.member_id]); if (x.active) act.set(x.meeting_id, [...(act.get(x.meeting_id) || []), x.member_id]); });
  // aktywne osoby (po podmianie); przy odwołanym spotkaniu – wszystkie, które były
  for (const k of by.keys()) if (act.has(k)) by.set(k, act.get(k));
  return by;
}
export async function openMeeting(id, onChange) {
  const [{ data: m, error }, types] = await Promise.all([sb.from('meetings').select('*').eq('id', id).maybeSingle(), loadTypes()]);
  if (error || !m) return toast('Nie znaleziono spotkania (albo nie masz do niego dostępu)', true);
  const mm = (await meetingMembers([id])).get(id) || [];
  const t = types.find(x => x.id === m.type_id);
  const s = new Date(m.start_at), e = new Date(m.end_at);
  const cancelled = m.status === 'cancelled';
  const row = (k, v) => v ? h('div', { class: 'sp-kv' }, h('span', {}, k), h('div', {}, v)) : null;
  const clientLink = m.client_id ? h('a', { href: `#/klient/${m.client_id}` }, m.client_name || 'karta klienta') : m.m2_client_id ? h('a', { href: `#/doradztwo/klient/${m.m2_client_id}` }, m.client_name || 'karta klienta') : (m.client_name || null);
  const body = h('div', { class: 'sp-detail' },
    cancelled ? h('p', { class: 'sp-warn' }, 'Spotkanie odwołane' + (m.cancel_reason ? ` – ${m.cancel_reason}` : '')) : null,
    row('Termin', `${dayLabel(isoDay(s))}, ${hm(m.start_at)}–${hm(m.end_at)}`),
    row('Rodzaj', m.private ? 'Prywatne / wewnętrzne' : (t?.name || m.title)),
    row('Forma', m.mode === 'meet' ? (m.meet_url ? h('a', { href: m.meet_url, target: '_blank', rel: 'noopener' }, 'Google Meet – dołącz') : 'Google Meet') : m.mode === 'office' ? [m.place || 'Stacjonarnie', t?.map_url ? h('a', { href: t.map_url, target: '_blank', rel: 'noopener', style: { marginLeft: '8px' } }, 'mapa') : null] : 'Telefon'),
    row('Klient', clientLink),
    row('Kontakt', [m.client_email ? h('a', { href: `mailto:${m.client_email}` }, m.client_email) : null, m.client_phone ? h('a', { href: `tel:${m.client_phone.replace(/\s/g, '')}`, style: { marginLeft: '10px' } }, m.client_phone) : null].filter(Boolean)),
    row('Temat', m.topic),
    row('Kto', h('div', { class: 'sp-chips' }, ...mm.map(memberById).filter(Boolean).map(p => h('span', { class: 'sp-chip sp-chip-p on' }, avaChip(p), firstName(p.full_name))))),
    row('Skąd', m.source === 'www' ? `Klient umówił się sam – ${CHANNEL[m.channel] || 'przez stronę'}` : `Umówione w aplikacji${m.created_by ? ' – ' + (memberById(m.created_by)?.full_name || '') : ''}`),
    !m.private && m.client_email ? row('Klient wie', m.notify_client ? 'tak – dostał e-mail z potwierdzeniem (i dostanie przypomnienie)' : 'nie wysyłano e-maila') : null);
  modal(m.private ? (m.title || 'Spotkanie') : `Spotkanie – ${m.client_name || t?.name || ''}`, body, close => cancelled || e < new Date() ? [h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Zamknij')] : [
    h('button', { class: 'btn btn-ghost btn-sm', style: { color: 'var(--danger,#B3261E)' }, onclick: () => { close(); cancelDialog(m, onChange); } }, 'Odwołaj'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => { close(); membersDialog(m, mm, onChange); } }, 'Zmień osoby'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => { close(); rescheduleDialog(m, mm, onChange); } }, 'Zmień termin'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Zamknij'),
  ]);
}
// podmiana na spotkaniu (ktoś przejmuje) albo dodanie drugiej osoby (oboje uczestniczą)
async function membersDialog(m, current, onChange) {
  const adv = await advisorIds();
  const people = state.members.filter(p => p.active !== false && (adv.includes(p.id) || current.includes(p.id)));
  const rest = state.members.filter(p => p.active !== false && !people.includes(p));
  const pick = new Set(current);
  let showAll = false;
  const box = h('div', { class: 'sp-chips' });
  const draw = () => put(box, ...[...people, ...(showAll ? rest : [])].map(p => h('button', { type: 'button', class: 'sp-chip sp-chip-p' + (pick.has(p.id) ? ' on' : ''), onclick: () => { pick.has(p.id) ? pick.delete(p.id) : pick.add(p.id); draw(); } }, avaChip(p), firstName(p.full_name))),
    !showAll && rest.length ? h('button', { type: 'button', class: 'sp-chip sp-chip-ghost', onclick: () => { showAll = true; draw(); } }, '+ ktoś z zespołu') : null);
  draw();
  const notify = h('input', { type: 'checkbox', checked: !!m.client_email && m.notify_client && !m.private });
  const swap = (a, b) => { pick.delete(a); pick.add(b); draw(); };
  const quick = current.length === 1 ? people.filter(p => p.id !== current[0]).slice(0, 2).map(p => h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => swap(current[0], p.id) }, `Zastąp: ${firstName(p.full_name)} zamiast ${firstName(memberById(current[0])?.full_name || '')}`)) : [];
  modal('Kto będzie na spotkaniu?', h('div', { style: { display: 'grid', gap: '12px' } },
    h('p', { class: 'small muted', style: { margin: 0 } }, `${dayLabel(isoDay(new Date(m.start_at)))}, ${hm(m.start_at)}–${hm(m.end_at)} · ${m.private ? m.title : m.client_name || ''}`),
    box,
    quick.length ? h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ...quick) : null,
    h('p', { class: 'hint', style: { margin: 0 } }, 'Zaznacz kilka osób, żeby uczestniczyć razem. Odznacz siebie i zaznacz kogoś innego, żeby się podmienić – spotkanie przeniesie się do jego Kalendarza Google, a on dostanie powiadomienie.'),
    m.client_email && !m.private ? h('label', { class: 'sp-check' }, notify, 'Wyślij klientowi e-mail z informacją, kto będzie na spotkaniu') : null),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async (ev) => {
    if (!pick.size) return toast('Wybierz co najmniej jedną osobę', true);
    ev.target.disabled = true;
    try { await call('members', { id: m.id, members: [...pick], notify_client: notify.checked }); close(); toast('Zapisano – kalendarze i powiadomienia zaktualizowane'); onChange?.(); }
    catch (e) { fail(e); ev.target.disabled = false; }
  } }, 'Zapisz')]);
}
function cancelDialog(m, onChange) {
  const reason = h('input', { class: 'input', placeholder: 'np. choroba – zaproponujemy nowy termin' });
  const notify = h('input', { type: 'checkbox', checked: !!m.client_email && m.notify_client });
  modal('Odwołać spotkanie?', h('div', { style: { display: 'grid', gap: '12px' } },
    h('p', { style: { margin: 0 } }, `${dayLabel(isoDay(new Date(m.start_at)))}, ${hm(m.start_at)} – ${m.private ? m.title : m.client_name || ''}`),
    h('label', { class: 'field' }, h('span', {}, 'Powód (opcjonalnie, nie trafia do klienta)'), reason),
    m.client_email ? h('label', { class: 'sp-check' }, notify, 'Wyślij klientowi e-mail o odwołaniu (z linkiem do nowej rezerwacji)') : null),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Nie'), h('button', { class: 'btn btn-primary', onclick: async (ev) => {
    ev.target.disabled = true;
    try { await call('cancel_staff', { id: m.id, reason: reason.value.trim(), notify_client: notify.checked }); close(); toast('Spotkanie odwołane – usunięte też z Kalendarza Google'); onChange?.(); }
    catch (e) { fail(e); ev.target.disabled = false; }
  } }, 'Odwołaj spotkanie')]);
}
function rescheduleDialog(m, members, onChange) {
  const dur = Math.round((new Date(m.end_at) - new Date(m.start_at)) / 60000);
  let day = isoDay(new Date(m.start_at)), start = null;
  const dayIn = h('input', { class: 'input', type: 'date', value: day, min: today() });
  const box = h('div', { class: 'sp-slots' });
  const manual = h('input', { class: 'input', type: 'time', step: 300, style: { width: '120px' } });
  const load = async () => {
    start = null; put(box, h('p', { class: 'hint' }, 'Sprawdzam…'));
    try {
      const r = await call('staff_slots', { members, day, duration: dur, exclude: m.id });
      put(box, ...(r.slots.length ? r.slots.map(s => h('button', { type: 'button', class: 'sp-slot', onclick: (e) => { start = s.start; manual.value = ''; box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, s.t))
        : [h('p', { class: 'hint' }, 'Brak wolnych godzin – wpisz godzinę ręcznie albo wybierz inny dzień.')]));
    } catch (e) { put(box, h('p', { class: 'sp-warn' }, e.message)); }
  };
  dayIn.addEventListener('change', () => { day = dayIn.value || today(); load(); });
  load();
  modal('Zmień termin', h('div', { style: { display: 'grid', gap: '12px' } },
    h('label', { class: 'field' }, h('span', {}, 'Nowy dzień'), dayIn), h('div', { class: 'field' }, h('span', {}, 'Wolne godziny'), box),
    h('div', { class: 'small muted', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, 'albo inna godzina:', manual),
    m.client_email && m.notify_client ? h('p', { class: 'small muted', style: { margin: 0 } }, 'Klient dostanie e-mail z nowym terminem.') : null),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async (ev) => {
    const s = start || (manual.value ? new Date(`${day}T${manual.value}:00`).toISOString() : null);
    if (!s) return toast('Wybierz godzinę', true);
    ev.target.disabled = true;
    try { await call('reschedule_staff', { id: m.id, start: s }); close(); toast('Termin zmieniony'); onChange?.(); }
    catch (e) { fail(e); ev.target.disabled = false; }
  } }, 'Zapisz nowy termin')]);
}

// ======================= Lista spotkań (#/spotkania) =======================
export async function renderSpotkania(main, parts = [], params) {
  if (parts[1] === 'ustawienia') return renderUstawienia(main, params);
  let tab = params?.get('f') || 'nadchodzace', scope = 'moje';
  const box = h('div');
  const head = h('div', { class: 'page-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Kalendarz'), h('h1', {}, 'Spotkania'),
      h('p', { class: 'sub' }, 'Rezerwacje ze strony i spotkania umówione w aplikacji. Wszystko trafia też do Kalendarza Google.')),
    h('div', { class: 'page-actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('a', { class: 'btn btn-outline btn-sm', href: '#/spotkania/ustawienia' }, 'Grafik i ustawienia'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => openMeetingDialog({ onDone: load }) }, icon('plus'), 'Umów spotkanie')));
  const chips = h('div', { class: 'firm-chips', style: { margin: '6px 0 14px' } });
  const drawChips = () => put(chips, 
    ...[['nadchodzace', 'Nadchodzące'], ['minione', 'Minione'], ['odwolane', 'Odwołane']].map(([k, l]) => h('button', { type: 'button', class: 'chip' + (tab === k ? ' on' : ''), onclick: () => { tab = k; drawChips(); load(); } }, l)),
    h('span', { style: { width: '10px' } }),
    ...[['moje', 'Moje'], ['wszystkie', 'Wszyscy']].map(([k, l]) => h('button', { type: 'button', class: 'chip' + (scope === k ? ' on' : ''), onclick: () => { scope = k; drawChips(); load(); } }, l)));
  drawChips();
  put(main, head, chips, box);
  async function load() {
    put(box, h('div', { class: 'spinner' }, 'Wczytywanie…'));
    const now = new Date().toISOString();
    let q = sb.from('meetings').select('*');
    if (tab === 'odwolane') q = q.eq('status', 'cancelled').order('start_at', { ascending: false }).limit(200);
    else if (tab === 'minione') q = q.eq('status', 'confirmed').lt('start_at', now).order('start_at', { ascending: false }).limit(200);
    else q = q.eq('status', 'confirmed').gte('end_at', now).order('start_at').limit(300);
    const { data, error } = await q;
    if (error) return put(box, h('p', { class: 'empty' }, error.message));
    const mm = data.length ? await meetingMembers(data.map(x => x.id)) : new Map();
    const list = data.filter(x => scope === 'wszystkie' || (mm.get(x.id) || []).includes(state.me.id) || x.created_by === state.me.id);
    const types = await loadTypes();
    if (!list.length) return put(box, h('div', { class: 'card', style: { padding: '28px', textAlign: 'center' } }, h('p', { class: 'muted', style: { margin: 0 } }, tab === 'nadchodzace' ? 'Brak zaplanowanych spotkań.' : 'Brak spotkań.')));
    const byDay = new Map(); list.forEach(x => { const k = isoDay(new Date(x.start_at)); byDay.set(k, [...(byDay.get(k) || []), x]); });
    put(box, ...[...byDay.entries()].map(([d, xs]) => h('section', { class: 'sp-day' },
      h('div', { class: 'sp-day-h' + (d === today() ? ' today' : '') }, d === today() ? 'Dziś' : d === addDays(today(), 1) ? 'Jutro' : dayLabel(d)),
      h('div', { class: 'card sp-list' }, ...xs.map(x => {
        const t = types.find(y => y.id === x.type_id);
        return h('button', { type: 'button', class: 'sp-item' + (x.status === 'cancelled' ? ' off' : ''), onclick: () => openMeeting(x.id, load) },
          h('span', { class: 'sp-time' }, hm(x.start_at), h('small', {}, hm(x.end_at))),
          h('span', { class: 'sp-main' }, h('b', {}, x.private ? (x.title || 'Spotkanie') : (x.client_name || x.title)),
            h('small', {}, [x.private ? 'prywatne' : (t?.name || x.title), MODE[x.mode] || '', x.topic ? x.topic.slice(0, 80) : ''].filter(Boolean).join(' · '))),
          x.source === 'www' ? h('span', { class: 'sp-tag' + (x.channel === 'm2tax' ? ' m2' : '') }, CHANNEL[x.channel] || 'ze strony') : null,
          x.mode === 'meet' && x.meet_url && x.status !== 'cancelled' ? h('a', { class: 'sp-tag meet', href: x.meet_url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, 'Meet') : null,
          h('span', { class: 'sp-avs' }, ...(mm.get(x.id) || []).map(memberById).filter(Boolean).map(avaChip)));
      })))));
  }
  await load();
  if (parts[1]) openMeeting(parts[1], load);
}

// ======================= Ustawienia: grafik, rodzaje, kalendarze, zasady =======================
async function renderUstawienia(main, params) {
  let tab = params?.get('t') || 'grafik';
  const tabs = h('div', { class: 'sp-tabs', role: 'tablist' });
  const box = h('div');
  const T = [['grafik', 'Grafik przyjęć'], ['rodzaje', 'Rodzaje spotkań'], ['kalendarze', 'Kalendarze Google'], ['zasady', 'Zasady i e-maile'], ['strona', 'Na stronę']];
  const drawTabs = () => put(tabs, ...T.map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'on' : '', 'aria-selected': String(tab === k), onclick: () => { tab = k; history.replaceState(null, '', '#/spotkania/ustawienia?t=' + k); drawTabs(); show(); } }, l)));
  drawTabs();
  put(main, 
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, h('a', { href: '#/spotkania' }, 'Spotkania'), ' · ustawienia'), h('h1', {}, 'Grafik i umawianie'),
      h('p', { class: 'sub' }, 'Kiedy przyjmujecie, jakie spotkania można zarezerwować na stronie i do których kalendarzy trafiają.'))),
    tabs, box);
  const show = () => { put(box, h('div', { class: 'spinner' }, 'Wczytywanie…')); ({ grafik, rodzaje, kalendarze, zasady, strona })[tab](box).catch(e => put(box, h('p', { class: 'empty' }, e.message || String(e)))); };
  show();
}

// ---------- grafik tygodnia ----------
async function grafik(box) {
  const ids = await advisorIds();
  if (!ids.includes(state.me.id) && !isAdmin()) ids.push(state.me.id);
  let week = mondayOf(today());
  const can = id => id === state.me.id || isAdmin();
  const card = h('section', { class: 'card sp-week' });
  put(box, card, h('p', { class: 'small muted', style: { margin: '10px 4px' } },
    'Kliknij dzień, żeby zmienić godziny tylko w tym dniu (np. urlop, wizyta, dłuższy dzień). Bez zmian obowiązuje grafik domyślny. Wolne godziny dla klientów = grafik minus to, co już jest w Kalendarzu Google (także prywatne). Święta są wolne automatycznie.'));
  async function draw() {
    const end = addDays(week, 6);
    const [{ data: hours }, { data: days }] = await Promise.all([
      sb.from('booking_hours').select('*').in('member_id', ids),
      sb.from('booking_days').select('*').in('member_id', ids).gte('day', week).lte('day', end),
    ]);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const changes = (days || []).length;
    put(card, 
      h('div', { class: 'sp-week-head' },
        h('button', { type: 'button', class: 'btn btn-outline btn-sm', 'aria-label': 'Poprzedni tydzień', onclick: () => { week = addDays(week, -7); draw(); } }, '‹'),
        h('b', {}, `${new Date(week + 'T12:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} – ${new Date(end + 'T12:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}`),
        h('button', { type: 'button', class: 'btn btn-outline btn-sm', 'aria-label': 'Następny tydzień', onclick: () => { week = addDays(week, 7); draw(); } }, '›'),
        week !== mondayOf(today()) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { week = mondayOf(today()); draw(); } }, 'Ten tydzień') : null,
        changes ? h('span', { class: 'sp-badge' }, `${changes} ${changes === 1 ? 'zmiana' : changes < 5 ? 'zmiany' : 'zmian'} w tym tygodniu`) : null),
      h('div', { class: 'sp-wgrid' },
        h('div'), ...dates.map((d, i) => h('div', { class: 'sp-wd' + (d === today() ? ' today' : '') }, DAYS[i].toUpperCase(), h('b', {}, String(+d.slice(8))))),
        ...ids.flatMap(id => {
          const m = memberById(id);
          const def = w => (hours || []).find(x => x.member_id === id && x.weekday === w)?.ranges || [];
          return [
            h('div', { class: 'sp-who' }, avaChip(m), h('div', {}, h('b', {}, firstName(m?.full_name)),
              h('small', {}, summarizeDefault(id, hours)), can(id) ? h('button', { type: 'button', class: 'sp-link', onclick: () => editDefault(id, hours, draw) }, 'Grafik domyślny') : null)),
            ...dates.map((d, i) => {
              const ov = (days || []).find(x => x.member_id === id && x.day === d);
              const r = ov ? ov.ranges : def(i + 1);
              const cls = ov ? (r.length ? 'ch' : 'off ch') : r.length ? '' : 'off';
              return h('button', { type: 'button', class: 'sp-cell ' + cls, disabled: !can(id), onclick: () => editDay(id, d, ov, def(i + 1), draw) },
                r.length ? fmtRanges(r) : 'nie przyjmuje', ov ? h('small', {}, ov.note || 'zmienione') : null);
            }),
          ];
        })),
      h('div', { class: 'sp-week-foot' },
        ...ids.filter(can).map(id => h('div', { class: 'sp-wf' }, h('span', { class: 'small muted' }, firstName(memberById(id)?.full_name) + ':'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => { await copyWeek(id, week); draw(); } }, 'Skopiuj zmiany na kolejny tydzień'),
          (days || []).some(x => x.member_id === id) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
            if (!confirm('Przywrócić grafik domyślny w tym tygodniu?')) return;
            const { error } = await sb.from('booking_days').delete().eq('member_id', id).gte('day', week).lte('day', addDays(week, 6));
            if (error) return fail(error); toast('Przywrócono grafik domyślny'); draw();
          } }, 'Przywróć domyślny') : null))));
  }
  await draw();
}
function summarizeDefault(id, hours) {
  const r = Array.from({ length: 7 }, (_, i) => (hours || []).find(x => x.member_id === id && x.weekday === i + 1)?.ranges || []);
  const key = x => JSON.stringify(x);
  const work = r.map((x, i) => [i, x]).filter(([, x]) => x.length);
  if (!work.length) return 'brak grafiku';
  if (work.every(([, x]) => key(x) === key(work[0][1]))) {
    const idx = work.map(([i]) => i);
    const contiguous = idx.every((v, k) => !k || v === idx[k - 1] + 1);
    return `${contiguous ? `${DAYS[idx[0]]}–${DAYS[idx[idx.length - 1]]}` : idx.map(i => DAYS[i]).join(', ')} ${fmtRanges(work[0][1])}`;
  }
  return 'grafik zmienny';
}
async function copyWeek(id, week) {
  const { data } = await sb.from('booking_days').select('*').eq('member_id', id).gte('day', week).lte('day', addDays(week, 6));
  if (!data?.length) return toast('W tym tygodniu nie ma zmian do skopiowania', true);
  const { error } = await sb.from('booking_days').upsert(data.map(x => ({ member_id: id, day: addDays(x.day, 7), ranges: x.ranges, note: x.note, updated_at: new Date().toISOString() })));
  if (error) return fail(error);
  toast(`Skopiowano ${data.length} ${data.length === 1 ? 'dzień' : 'dni'} na kolejny tydzień`);
}
function rangesEditor(initial) {
  let ranges = (initial || []).map(x => [...x]);
  const box = h('div', { class: 'sp-ranges' });
  const draw = () => put(box, ...ranges.map((r, i) => {
    const a = h('input', { class: 'input', type: 'time', step: 900, value: r[0] }), b = h('input', { class: 'input', type: 'time', step: 900, value: r[1] });
    a.addEventListener('change', () => { ranges[i][0] = a.value; }); b.addEventListener('change', () => { ranges[i][1] = b.value; });
    return h('div', { class: 'sp-range' }, a, h('span', {}, '–'), b, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Usuń przedział', onclick: () => { ranges.splice(i, 1); draw(); } }, '✕'));
  }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { const last = ranges[ranges.length - 1]; ranges.push(last ? [last[1] < '20:00' ? last[1] : '09:00', '17:00'] : ['09:00', '17:00']); draw(); } }, ranges.length ? '+ kolejne godziny (np. po przerwie)' : '+ dodaj godziny'));
  draw();
  return { el: box, get: () => ranges.filter(([a, b]) => a && b && a < b).sort((x, y) => x[0].localeCompare(y[0])) };
}
function editDay(id, day, ov, def, onSave) {
  let mode = ov ? (ov.ranges.length ? 'inne' : 'wolne') : 'domyslne';
  const ed = rangesEditor(ov?.ranges?.length ? ov.ranges : def.length ? def : [['09:00', '17:00']]);
  const note = h('input', { class: 'input', placeholder: 'np. urlop, sąd, szkolenie (widzi tylko zespół)', value: ov?.note || '' });
  const opts = h('div', { class: 'sp-radio' });
  const edBox = h('div');
  const draw = () => {
    put(opts, ...[['domyslne', `Jak zwykle${def.length ? ` (${fmtRanges(def)})` : ' (nie przyjmuje)'}`], ['wolne', 'Nie przyjmuję tego dnia'], ['inne', 'Inne godziny']].map(([k, l]) =>
      h('label', {}, h('input', { type: 'radio', name: 'sp-day', checked: mode === k, onchange: () => { mode = k; draw(); } }), l)));
    put(edBox, ...(mode === 'inne' ? [ed.el] : []), mode !== 'domyslne' ? h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', {}, 'Powód / notatka'), note) : null);
  };
  draw();
  modal(`${firstName(memberById(id)?.full_name)} – ${dayLabel(day)}`, h('div', {}, opts, edBox), close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
    let error;
    if (mode === 'domyslne') ({ error } = await sb.from('booking_days').delete().eq('member_id', id).eq('day', day));
    else ({ error } = await sb.from('booking_days').upsert({ member_id: id, day, ranges: mode === 'wolne' ? [] : ed.get(), note: note.value.trim() || null, updated_at: new Date().toISOString() }));
    if (error) return fail(error);
    close(); toast('Zapisano'); onSave();
  } }, 'Zapisz')]);
}
function editDefault(id, hours, onSave) {
  const eds = Array.from({ length: 7 }, (_, i) => rangesEditor((hours || []).find(x => x.member_id === id && x.weekday === i + 1)?.ranges || []));
  modal(`Grafik domyślny – ${memberById(id)?.full_name || ''}`, h('div', { class: 'sp-defgrid' },
    h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, 'Obowiązuje co tydzień, dopóki nie zmienisz konkretnego dnia. Puste = w ten dzień nie przyjmujesz.'),
    ...eds.map((ed, i) => h('div', { class: 'sp-defrow' }, h('b', {}, DAYS_L[i]), ed.el))),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
    const { error } = await sb.from('booking_hours').upsert(eds.map((ed, i) => ({ member_id: id, weekday: i + 1, ranges: ed.get() })));
    if (error) return fail(error);
    close(); toast('Zapisano grafik domyślny'); onSave();
  } }, 'Zapisz')], { wide: true });
}

// ---------- rodzaje spotkań ----------
async function rodzaje(box) {
  const types = await loadTypes(true);
  const ids = await advisorIds();
  const admin = isAdmin();
  put(box, h('section', { class: 'card sp-types' },
    ...types.map(t => h('div', { class: 'sp-type' + (t.active ? '' : ' off') },
      h('div', { style: { flex: 1, minWidth: 0 } }, h('b', {}, t.name), h('small', {}, [`${t.duration_min} min`, MODE[t.mode], t.place, t.public ? 'na stronie' : 'tylko w aplikacji', t.active ? '' : 'wyłączony'].filter(Boolean).join(' · '))),
      h('span', { class: 'sp-avs' }, ...(t.advisors || []).map(memberById).filter(Boolean).map(avaChip)),
      admin ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => editType(t, ids, () => rodzaje(box)) }, 'Edytuj') : null)),
    admin ? h('div', { style: { padding: '12px 16px' } }, h('button', { class: 'btn btn-primary btn-sm', onclick: () => editType(null, ids, () => rodzaje(box)) }, icon('plus'), 'Nowy rodzaj spotkania')) : h('p', { class: 'hint', style: { padding: '12px 16px' } }, 'Rodzaje spotkań zmienia administrator.')));
}
function editType(t, adv, onSave) {
  const v = t ? { ...t } : { name: '', duration_min: 60, mode: 'meet', place: '', map_url: '', advisors: adv, public: true, active: true, sort: 10, description: '' };
  const name = h('input', { class: 'input', value: v.name });
  const dur = h('select', { class: 'select' }, ...[15, 20, 30, 45, 60, 90, 120].map(m => h('option', { value: m }, `${m} min`))); dur.value = String(v.duration_min);
  const mode = h('select', { class: 'select' }, ...Object.entries(MODE).map(([k, l]) => h('option', { value: k }, l))); mode.value = v.mode;
  const place = h('input', { class: 'input', value: v.place || '', placeholder: 'np. RKDP Doradztwo Podatkowe, ul. Beaty Artemskiej 11/44, Wrocław' });
  const map = h('input', { class: 'input', value: v.map_url || '', placeholder: 'link do Map Google (wizytówka)' });
  const desc = h('textarea', { class: 'input', rows: 2 }); desc.value = v.description || '';
  const pub = h('input', { type: 'checkbox', checked: v.public }), act = h('input', { type: 'checkbox', checked: v.active });
  const sel = new Set(v.advisors || []);
  const people = state.members.filter(m => m.active !== false && (adv.includes(m.id) || (m.modules || []).includes('doradztwo')));
  modal(t ? 'Rodzaj spotkania' : 'Nowy rodzaj spotkania', h('div', { class: 'form-grid' },
    h('label', { class: 'field wide' }, h('span', {}, 'Nazwa (widzi klient)'), name),
    h('label', { class: 'field' }, h('span', {}, 'Czas'), dur), h('label', { class: 'field' }, h('span', {}, 'Forma'), mode),
    h('label', { class: 'field wide' }, h('span', {}, 'Miejsce (dla spotkań stacjonarnych)'), place),
    h('label', { class: 'field wide' }, h('span', {}, 'Mapa'), map),
    h('label', { class: 'field wide' }, h('span', {}, 'Opis dla klienta'), desc),
    h('div', { class: 'field wide' }, h('span', {}, 'Kto przyjmuje'), h('div', { class: 'sp-chips' }, ...people.map(p => {
      const b = h('button', { type: 'button', class: 'sp-chip sp-chip-p' + (sel.has(p.id) ? ' on' : ''), onclick: () => { sel.has(p.id) ? sel.delete(p.id) : sel.add(p.id); b.classList.toggle('on'); } }, avaChip(p), firstName(p.full_name));
      return b;
    }))),
    h('label', { class: 'sp-check wide' }, pub, 'Można zarezerwować na stronie internetowej'),
    h('label', { class: 'sp-check wide' }, act, 'Aktywny')),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
    const row = { name: name.value.trim(), duration_min: +dur.value, mode: mode.value, place: place.value.trim() || null, map_url: map.value.trim() || null, description: desc.value.trim() || null, advisors: [...sel], public: pub.checked, active: act.checked };
    if (!row.name) return toast('Wpisz nazwę', true);
    const { error } = t ? await sb.from('meeting_types').update(row).eq('id', t.id) : await sb.from('meeting_types').insert({ ...row, sort: 10 });
    if (error) return fail(error);
    close(); toast('Zapisano'); loadTypes(true); onSave();
  } }, 'Zapisz')]);
}

// ---------- kalendarze Google doradców ----------
async function kalendarze(box) {
  const ids = await advisorIds();
  const mine = ids.filter(id => id === state.me.id || isAdmin());
  if (!mine.includes(state.me.id)) mine.unshift(state.me.id);
  const { data: bm } = await sb.from('booking_members').select('*').in('member_id', mine);
  const { gcalStatus } = await import('./gcal.js');
  const st = await gcalStatus(true);
  put(box, ...mine.map(id => {
    const card = h('section', { class: 'card section sp-cal' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
    (async () => {
      const m = memberById(id);
      const cur = (bm || []).find(x => x.member_id === id) || { write_calendar: 'primary', busy_calendars: ['primary'] };
      const head = h('div', { class: 'section-head' }, h('h2', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, avaChip(m), m?.full_name || ''));
      if (id === state.me.id && (!st.connected || !st.can_book)) {
        put(card, head, h('p', { style: { margin: '0 0 10px' } }, !st.connected ? 'Najpierw połącz Kalendarz Google.' : 'Połącz Kalendarz Google ponownie – aplikacja potrzebuje zgody na dodawanie spotkań i sprawdzanie zajętości.'),
          h('a', { class: 'btn btn-primary btn-sm', href: '#/profil' }, 'Przejdź do Profilu → Kalendarz Google'));
        return;
      }
      let items = [];
      try { items = (await gcall('calendars', { member: id })).items || []; }
      catch (e) { put(card, head, h('p', { class: 'sp-warn' }, e.message)); return; }
      const label = c => `${c.name}${c.primary ? ' (główny)' : ''}${c.email && !c.primary && c.email.includes('@') ? ` – ${c.email}` : ''}`;
      const wsel = h('select', { class: 'select' }, ...items.filter(c => ['owner', 'writer'].includes(c.role)).map(c => h('option', { value: c.id }, label(c))));
      wsel.value = cur.write_calendar;
      const busy = new Set(cur.busy_calendars || ['primary']);
      const list = h('div', { class: 'sp-callist' }, ...items.map(c => h('label', { class: 'sp-check' }, h('input', { type: 'checkbox', checked: busy.has(c.id), onchange: e => { e.target.checked ? busy.add(c.id) : busy.delete(c.id); } }), label(c))));
      put(card, head,
        h('label', { class: 'field' }, h('span', {}, 'Dodawaj spotkania do'), wsel),
        h('div', { class: 'field', style: { marginTop: '12px' } }, h('span', {}, 'Blokuj godziny zajęte w kalendarzach'), list,
          h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'Zaznacz też prywatny kalendarz (np. Gmail), jeśli jest udostępniony temu kontu – wtedy klienci nie zarezerwują tych godzin. Szczegóły prywatnych wpisów nigdzie się nie pokazują.')),
        h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
          const { error } = await sb.from('booking_members').upsert({ member_id: id, write_calendar: wsel.value || 'primary', busy_calendars: [...busy], updated_at: new Date().toISOString() });
          if (error) return fail(error); toast('Zapisano kalendarze');
        } }, 'Zapisz')));
    })().catch(e => put(card, h('p', { class: 'sp-warn' }, e.message || String(e))));
    return card;
  }), h('p', { class: 'small muted', style: { margin: '8px 4px' } }, 'Każdy doradca łączy swoje konto Google w Profilu. Konto, którym się połączysz, decyduje o tym, które kalendarze tu widać (np. Marcin – konto kancelaria@m2tax.pl).'));
}

// ---------- zasady i e-maile ----------
async function zasady(box) {
  const { data: s } = await sb.from('booking_settings').select('*').eq('id', 1).single();
  const admin = isAdmin();
  const num = (k, l, suf, opts) => { const i = h('select', { class: 'select', disabled: !admin }, ...opts.map(v => h('option', { value: v }, `${v} ${suf}`))); i.value = String(s[k]); i.dataset.k = k; return h('label', { class: 'field' }, h('span', {}, l), i); };
  const fromName = h('input', { class: 'input', value: s.from_name, disabled: !admin }), fromEmail = h('input', { class: 'input', value: s.from_email, disabled: !admin });
  const card = h('section', { class: 'card section' }, h('div', { class: 'form-grid' },
    num('min_notice_h', 'Najwcześniej (od teraz)', 'godz.', [0, 2, 4, 12, 24, 48]),
    num('max_days', 'Najdalej do przodu', 'dni', [7, 14, 21, 28, 42, 60]),
    num('step_min', 'Godziny co', 'min', [15, 20, 30, 60]),
    num('buffer_min', 'Przerwa przed i po spotkaniu', 'min', [0, 5, 10, 15, 30]),
    num('max_per_day', 'Maks. spotkań dziennie na osobę', '', [2, 3, 4, 5, 6, 8, 10, 20]),
    h('label', { class: 'field' }, h('span', {}, 'Nadawca e-maili (nazwa)'), fromName),
    h('label', { class: 'field' }, h('span', {}, 'Adres nadawcy'), fromEmail)),
  h('p', { class: 'small muted', style: { margin: '12px 0' } }, 'Klient dostaje: potwierdzenie z plikiem do kalendarza, przypomnienie dzień przed, e-mail przy zmianie terminu i odwołaniu. Odpowiedź klienta trafia do doradcy, z którym jest spotkanie.'),
  admin ? h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
    const row = { from_name: fromName.value.trim(), from_email: fromEmail.value.trim(), updated_at: new Date().toISOString() };
    card.querySelectorAll('select[data-k]').forEach(x => { row[x.dataset.k] = +x.value; });
    const { error } = await sb.from('booking_settings').update(row).eq('id', 1);
    if (error) return fail(error); toast('Zapisano');
  } }, 'Zapisz') : h('p', { class: 'hint' }, 'Zasady zmienia administrator.'));
  put(box, card);
}

// ---------- okienko na stronę ----------
async function strona(box) {
  const url = `${location.origin}/umow/`;
  const snippet = `<a href="${url}" class="rkdp-umow">Umów konsultację</a>\n<script src="${location.origin}/umow/embed.js" async></script>`;
  const pre = h('pre', { class: 'sp-code' }, snippet);
  put(box, h('section', { class: 'card section' },
    h('h2', { style: { marginTop: 0 } }, 'Rezerwacja na stronie internetowej'),
    h('p', {}, 'Strona rezerwacji: ', h('a', { href: url, target: '_blank', rel: 'noopener' }, url)),
    h('p', { class: 'small muted' }, 'Wklej ten kod na stronę (rkdp.pl, m2tax.pl): przycisk otworzy okienko rezerwacji na stronie, bez przechodzenia na inną.'),
    pre, h('button', { class: 'btn btn-outline btn-sm', onclick: () => navigator.clipboard.writeText(snippet).then(() => toast('Skopiowano kod')) }, 'Kopiuj kod'),
    h('p', { class: 'small muted', style: { marginTop: '14px' } }, 'Można też dodać ?typ=… lub ?doradca=… do linku, żeby od razu wybrać rodzaj spotkania albo doradcę.')));
}

// ======================= Karta klienta: spotkania =======================
export function clientMeetingsCard({ client_id = null, m2_client_id = null, name = '', email = '', phone = '' }) {
  const box = h('section', { class: 'card section sp-ccard' }, h('div', { class: 'section-head' }, h('h2', {}, 'Spotkania')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  const load = async () => {
    let q = sb.from('meetings').select('id,start_at,end_at,status,title,mode,type_id,meet_url,source,channel').order('start_at', { ascending: false }).limit(20);
    q = client_id ? q.eq('client_id', client_id) : q.eq('m2_client_id', m2_client_id);
    const { data } = await q;
    const now = Date.now();
    const up = (data || []).filter(x => x.status === 'confirmed' && new Date(x.end_at) > now).reverse();
    const past = (data || []).filter(x => !(x.status === 'confirmed' && new Date(x.end_at) > now));
    const row = x => h('button', { type: 'button', class: 'sp-mini' + (x.status === 'cancelled' ? ' off' : ''), onclick: () => openMeeting(x.id, load) },
      h('b', {}, `${new Date(x.start_at).toLocaleDateString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${hm(x.start_at)}`), ' ', x.title || '', x.status === 'cancelled' ? ' (odwołane)' : '', x.source === 'www' ? h('span', { class: 'sp-tag' }, CHANNEL[x.channel] || 'ze strony') : null);
    put(box, 
      h('div', { class: 'section-head' }, h('h2', {}, 'Spotkania'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => openMeetingDialog({ client_id, m2_client_id, name, email, phone, onDone: load }) }, icon('plus'), 'Umów')),
      ...(up.length ? up.map(row) : [h('p', { class: 'hint', style: { margin: '0 0 6px' } }, 'Brak zaplanowanych spotkań.')]),
      past.length ? h('details', { class: 'dr-closed' }, h('summary', {}, `Wcześniejsze (${past.length})`), ...past.map(row)) : null);
  };
  load().catch(e => put(box, h('p', { class: 'hint' }, e.message)));
  return box;
}
