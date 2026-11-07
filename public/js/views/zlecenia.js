// Zadania (w kodzie „zlecenia”) – dodatkowe zadania dla pracowników RKDP.
// Zadanie może dodać każdy użytkownik RKDP; widzi je osoba wykonująca, zlecający i administrator. Zlecający (lub administrator) akceptuje wykonanie. Przebieg: nowe → w trakcie → (pytanie) → zgłoszone → zaakceptowane / do poprawy.
// Każde zlecenie i każda zmiana stanu: powiadomienie na telefon i e-mail (robi to baza – wyzwalacze → funkcje push i mail).
import { h, toast, fail, modal, icon, ava, infoTip } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fileTile, dropZone, pastedFiles, safeName, named, fmtSize } from './zgloszenia.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

// ---------- załączniki (schowek „zlecenia”, folder = id zlecenia) ----------
const ZL_BUCKET = 'zlecenia', MAX_MB = 25;
async function uploadZl(zid, files, wpisId = null) {
  let ok = 0;
  for (const raw of files) {
    const f = named(raw);
    if (f.size > MAX_MB * 1048576) { toast(`„${f.name}” jest większy niż ${MAX_MB} MB`, true); continue; }
    const path = `${zid}/${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
    const { error } = await sb.storage.from(ZL_BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) { fail(error, `Nie udało się wysłać „${f.name}”`); continue; }
    const { error: e2 } = await sb.from('zlecenia_pliki').insert({ zlecenie_id: zid, wpis_id: wpisId, path, name: f.name, mime: f.type || null, size: f.size, uploaded_by: state.me.id });
    if (e2) { await sb.storage.from(ZL_BUCKET).remove([path]); fail(e2); continue; }
    ok++;
  }
  return ok;
}
// pole „dodaj pliki / zdjęcia” z listą oczekujących (wysyłane razem z zapisem)
function pendingBox(pending, hint = 'zdjęcia, PDF, dokumenty · zrzut ekranu: Ctrl+V / ⌘V') {
  const list = h('div', { class: 'zl-pend' });
  const draw = () => put(list, ...pending.map((f, i) => h('span', { class: 'zl-pfile' }, f.type?.startsWith('image/') ? h('img', { src: URL.createObjectURL(f), alt: '' }) : null,
    h('span', {}, `${f.name} · ${fmtSize(f.size)}`), h('button', { type: 'button', 'aria-label': 'Usuń', onclick: () => { pending.splice(i, 1); draw(); } }, '✕'))));
  const add = fs => { fs.map(named).forEach(f => pending.push(f)); draw(); };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { if (cam.files.length) add([...cam.files]); cam.value = ''; } });
  const box = h('div', { class: 'zl-att' }, dropZone(add, hint), h('button', { type: 'button', class: 'btn btn-ghost btn-sm zl-cam', onclick: () => cam.click() }, 'Zrób zdjęcie'), cam, list);
  setTimeout(() => box.closest('.modal')?.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); add(fs); } }), 0);
  return box;
}

export const ZL_ST = {
  nowe: ['Nowe', 'zl-new'], w_toku: ['W trakcie', 'zl-prog'], pytanie: ['Pytanie', 'zl-q'], zgloszone: ['Do sprawdzenia', 'zl-rep'],
  zaakceptowane: ['Zaakceptowane', 'zl-ok'], anulowane: ['Anulowane', 'zl-off'],
};
const OPEN = ['nowe', 'w_toku', 'pytanie', 'zgloszone'];
const isAdmin = () => state.me?.role === 'admin';
// zlecający danego zadania (albo administrator) – akceptuje, odpowiada, edytuje, anuluje
const canManage = z => isAdmin() || z?.created_by === state.me?.id;
const helpersOf = z => Array.isArray(z?.helpers) ? z.helpers : [];
const isHelper = z => helpersOf(z).includes(state.me?.id);
// osoby pracujące nad zadaniem: zlecający, wykonujący albo administrator mogą dodawać kolejne
const canAddPeople = z => isAdmin() || z?.created_by === state.me?.id || z?.assignee_id === state.me?.id;
const firstName = id => (memberById(id)?.full_name || '').split(' ')[0] || 'zlecający';
const today = () => new Date().toLocaleDateString('sv-SE');
const fmtD = d => d ? d.split('-').reverse().join('.') : '';
const late = z => ['nowe', 'w_toku', 'pytanie'].includes(z.status) && z.due_date && z.due_date < today();
const who = id => memberById(id)?.full_name || '—';
const pill = z => h('span', { class: 'zl-pill ' + (ZL_ST[z.status]?.[1] || '') }, ZL_ST[z.status]?.[0] || z.status);
const dueEl = z => z.due_date ? h('span', { class: 'zl-due' + (late(z) ? ' late' : z.due_date === today() ? ' today' : '') }, late(z) ? `po terminie · ${fmtD(z.due_date)}` : `termin ${fmtD(z.due_date)}`) : null;
const stepsOf = z => Array.isArray(z.steps) ? z.steps : [];
const HELP = `Zadania to dodatkowe zadania w zespole RKDP.
• Każdy może dodać zadanie – dla siebie albo dla innej osoby („+ Zadanie”). Wybrana osoba dostaje powiadomienie na telefon i e-mail.
• Wykonujący klika „Zaczynam”, odhacza kroki, a gdy skończy – „Zrobione – zgłaszam” (może dopisać komentarz).
• Gdy coś jest niejasne – „Mam pytanie”. Odpowiedź przyjdzie powiadomieniem.
• Zlecający akceptuje wykonanie albo odsyła do poprawy z uwagą. Może też sam zamknąć zadanie jako wykonane.
Widzisz zadania, które masz do zrobienia, i te, które zleciłeś.
Nie odpowiadaj na maile o zadaniach – odpowiadaj tutaj. Sprawy bieżących rozliczeń klienta (braki dokumentów, problemy z księgowaniem) prowadź w „Rozmowach”.`;

async function loadAll() {
  const { data, error } = await sb.from('zlecenia').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

function row(z, onOpen) {
  const st = stepsOf(z), done = st.filter(s => s.done).length;
  return h('button', { type: 'button', class: 'zl-row' + (late(z) ? ' late' : '') + (z.status === 'zgloszone' && canManage(z) && z.assignee_id !== state.me.id ? ' attn' : '') + (['nowe', 'poprawka'].includes(z.status) && z.assignee_id === state.me.id ? ' attn' : ''), onclick: () => onOpen(z) },
    h('span', { class: 'zl-no' }, `#${z.no}`),
    h('span', { class: 'zl-main' }, h('b', {}, z.title, z.priority === 'pilne' ? h('span', { class: 'zl-hot' }, 'pilne') : null),
      h('span', { class: 'zl-meta' }, ...[z.assignee_id !== state.me.id ? `dla: ${who(z.assignee_id)}` : z.created_by && z.created_by !== state.me.id ? `od: ${who(z.created_by)}` : '', helpersOf(z).length ? `razem z: ${helpersOf(z).map(id => who(id).split(' ')[0]).join(', ')}` : '', st.length ? `kroki ${done}/${st.length}` : ''].filter(Boolean).join(' · '))),
    dueEl(z), pill(z));
}

// ---------- widok #/zlecenia ----------
export async function renderZlecenia(main, id) {
  const admin = isAdmin();
  let all = [], filter = admin ? 'aktywne' : 'aktywne';
  const listBox = h('div', {}, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const chips = h('div', { class: 'zl-chips' });
  const reload = async () => { try { all = await loadAll(); } catch (e) { put(listBox, h('p', { class: 'hint' }, 'Zadania są niedostępne.')); return; } draw(); };
  const open = z => openZlecenie(z.id, reload);

  function draw() {
    const F = admin ? [
      ['aktywne', 'Aktywne', z => OPEN.includes(z.status)],
      ['sprawdz', 'Do sprawdzenia', z => z.status === 'zgloszone'],
      ['pytania', 'Pytania', z => z.status === 'pytanie'],
      ['po', 'Po terminie', late],
      ['koniec', 'Zakończone', z => !OPEN.includes(z.status)],
    ] : [
      ['aktywne', 'Do zrobienia', z => OPEN.includes(z.status) && (z.assignee_id === state.me.id || isHelper(z))],
      ['zlecone', 'Zlecone przeze mnie', z => OPEN.includes(z.status) && z.created_by === state.me.id && z.assignee_id !== state.me.id],
      ['sprawdz', 'Do sprawdzenia', z => z.status === 'zgloszone' && z.created_by === state.me.id && z.assignee_id !== state.me.id],
      ['koniec', 'Zakończone', z => !OPEN.includes(z.status)]];
    put(chips, ...F.map(([k, l, f]) => { const n = all.filter(f).length; return h('button', { type: 'button', class: 'zl-chip' + (filter === k ? ' on' : '') + ((k === 'sprawdz' || k === 'pytania' || k === 'po') && n ? ' hot' : ''), onclick: () => { filter = k; draw(); } }, l, h('span', {}, String(n))); }));
    const f = F.find(x => x[0] === filter)[2];
    const rows = all.filter(f).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.created_at.localeCompare(a.created_at));
    if (!rows.length) { put(listBox, h('p', { class: 'hint', style: { padding: '16px 0' } }, filter === 'aktywne' ? (admin ? 'Brak aktywnych zadań. Kliknij „+ Zadanie”, aby zlecić zadanie.' : 'Nie masz zadań do zrobienia. 👍 Kliknij „+ Zadanie”, aby dodać zadanie dla siebie lub kogoś z zespołu.') : 'Brak zadań.')); return; }
    if (!admin) { put(listBox, h('div', { class: 'zl-list' }, ...rows.map(z => row(z, open)))); return; }
    const by = new Map(); rows.forEach(z => by.set(z.assignee_id, [...(by.get(z.assignee_id) || []), z]));
    put(listBox, ...[...by.entries()].sort((a, b) => who(a[0]).localeCompare(who(b[0]), 'pl')).map(([mid, zs]) =>
      h('section', { class: 'zl-person' }, h('div', { class: 'zl-phead' }, h('span', { class: 'zl-av' }, ava(memberById(mid) || { full_name: '?' })), h('b', {}, who(mid)), h('span', { class: 'small muted' }, `${zs.length}`)),
        h('div', { class: 'zl-list' }, ...zs.map(z => row(z, open))))));
  }

  put(main, 
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, admin ? 'Zadania dla zespołu' : 'Zadania', infoTip(HELP, 'Zadania – jak to działa')),
        h('p', { class: 'sub' }, admin ? 'Dodatkowe zadania dla pracowników – z akceptacją wykonania.' : 'Twoje zadania i te, które zleciłeś innym. Gdy skończysz, kliknij „Zrobione – zgłaszam”.')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => newZlecenie(reload) }, icon('plus'), 'Zadanie')),
    h('section', { class: 'card section' }, chips, listBox));
  await reload();
  if (id) openZlecenie(id, reload);
}

// ---------- karta na Pulpicie ----------
export function zleceniaCard() {
  const box = h('section', { class: 'card section zl-card' });
  (async () => {
    let all; try { all = await loadAll(); } catch { box.remove(); return; }
    const admin = isAdmin(), act = all.filter(z => OPEN.includes(z.status));
    if (!admin && !act.length) { box.remove(); return; }
    const rep = act.filter(z => z.status === 'zgloszone' && canManage(z) && z.assignee_id !== state.me.id), q = act.filter(z => z.status === 'pytanie'), lt = act.filter(late);
    const show = (admin ? [...rep, ...q, ...lt.filter(z => !rep.includes(z) && !q.includes(z))] : act.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))).slice(0, 6);
    put(box, 
      h('div', { class: 'section-head' }, h('h2', {}, admin ? `Zadania (${act.length} aktywnych)` : `Zadania (${act.length})`),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => newZlecenie(() => { location.hash = '#/zlecenia'; }) }, icon('plus'), 'Zadanie'),
          h('a', { class: 'btn btn-ghost btn-sm', href: '#/zlecenia' }, 'Wszystkie →'))),
      admin ? h('div', { class: 'zl-sum' }, h('span', { class: rep.length ? 'hot' : '' }, `do sprawdzenia: ${rep.length}`), h('span', { class: q.length ? 'hot' : '' }, `pytania: ${q.length}`), h('span', { class: lt.length ? 'hot' : '' }, `po terminie: ${lt.length}`)) : null,
      show.length ? h('div', { class: 'zl-list' }, ...show.map(z => row(z, x => openZlecenie(x.id, () => { location.hash = '#/zlecenia'; })))) : h('p', { class: 'hint' }, admin ? 'Nic nie czeka na Ciebie.' : ''));
  })();
  return box;
}

// ---------- nowe zadanie (każdy użytkownik RKDP) ----------
export async function newZlecenie(onDone, preset = {}) {
  const team = state.members.filter(m => m.active !== false && (m.role === 'admin' || (m.modules || ['rozliczenia']).includes('rozliczenia'))).sort((a, b) => (a.id === state.me.id) - (b.id === state.me.id));
  const pick = new Set(preset.assignee_id ? [preset.assignee_id] : []);
  const people = h('div', { class: 'zl-people' }, ...team.map(m => { const cb = h('input', { type: 'checkbox', checked: pick.has(m.id) }); cb.addEventListener('change', () => cb.checked ? pick.add(m.id) : pick.delete(m.id)); return h('label', { class: 'zl-person-pick' }, cb, ava(m), m.id === state.me.id ? 'Ja (dla siebie)' : m.full_name); }));
  const title = h('input', { class: 'input', maxlength: 200, placeholder: 'Co trzeba zrobić? (krótko)', value: preset.title || '' });
  const body = h('textarea', { class: 'input', rows: 4, maxlength: 5000, placeholder: 'Szczegóły, wskazówki, linki…' }, preset.body || '');
  const due = h('input', { class: 'input', type: 'date', value: preset.due_date || '' });
  const hot = h('input', { type: 'checkbox', checked: preset.priority === 'pilne' });
  const steps = h('textarea', { class: 'input', rows: 3, placeholder: 'Opcjonalnie – po jednym kroku w linii, np.\nSprawdź listę klientów\nWyślij przypomnienia' }, stepsOf(preset).map(s => s.t).join('\n'));
  const { data: cl } = await sb.from('clients').select('id,name').eq('status', 'aktywny').order('name');
  const client = h('select', { class: 'select' }, h('option', { value: '' }, '— bez klienta —'), ...(cl || []).map(c => h('option', { value: c.id, selected: c.id === preset.client_id }, c.name)));
  const editing = !!preset.id;
  const hpick = new Set(helpersOf(preset));
  const helperBox = h('div', { class: 'zl-people' }, ...team.filter(m => m.id !== preset.assignee_id).map(m => { const cb = h('input', { type: 'checkbox', checked: hpick.has(m.id) }); cb.addEventListener('change', () => cb.checked ? hpick.add(m.id) : hpick.delete(m.id)); return h('label', { class: 'zl-person-pick' }, cb, ava(m), m.id === state.me.id ? 'Ja' : m.full_name); }));
  const pending = [];
  modal(editing ? `Edytuj zadanie #${preset.no}` : 'Nowe zadanie', h('div', { class: 'zl-form' },
    editing ? null : h('div', { class: 'field' }, h('span', {}, 'Dla kogo'), people),
    editing && canAddPeople(preset) ? h('div', { class: 'field' }, h('span', {}, 'Pracują razem nad zadaniem (dodatkowe osoby)'), helperBox) : null,
    h('label', { class: 'field' }, h('span', {}, 'Zadanie'), title),
    h('label', { class: 'field' }, h('span', {}, 'Opis'), body),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Termin'), due), h('label', { class: 'field' }, h('span', {}, 'Klient (opcjonalnie)'), client)),
    h('label', { class: 'field' }, h('span', {}, 'Kroki do odhaczenia'), steps),
    h('label', { class: 'check' }, hot, 'Pilne'),
    editing ? null : h('div', { class: 'field' }, h('span', {}, 'Załączniki (opcjonalnie)'), pendingBox(pending)),
    editing ? null : h('p', { class: 'small muted' }, 'Każda wybrana osoba dostanie osobne zadanie oraz powiadomienie na telefon i e-mail.')),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async e => {
    if (!editing && !pick.size) return toast('Wybierz osobę', true);
    if (!title.value.trim()) { title.focus(); return toast('Wpisz zadanie', true); }
    const old = stepsOf(preset);
    const st = steps.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30).map(t => ({ t: t.slice(0, 300), done: !!old.find(o => o.t === t)?.done }));
    const rec = { title: title.value.trim(), body: body.value.trim() || null, due_date: due.value || null, priority: hot.checked ? 'pilne' : 'normalny', steps: st, client_id: client.value || null };
    e.currentTarget.disabled = true;
    const btn = e.currentTarget;
    const { data: made, error } = editing ? await sb.from('zlecenia').update(rec).eq('id', preset.id).select('id')
      : await sb.from('zlecenia').insert([...pick].map(a => ({ ...rec, assignee_id: a }))).select('id');
    if (error) { btn.disabled = false; return fail(error); }
    if (editing && canAddPeople(preset) && [...hpick].sort().join() !== [...helpersOf(preset)].sort().join()) {
      const { error: e2 } = await sb.rpc('zlecenie_osoby', { p_id: preset.id, p_helpers: [...hpick] });
      if (e2) { btn.disabled = false; return fail(e2); }
    }
    if (!editing && pending.length) { btn.textContent = 'Wysyłanie plików…'; for (const r of made || []) await uploadZl(r.id, pending); }
    close(); toast(editing ? 'Zapisano zmiany' : pick.size > 1 ? `Zlecono ${pick.size} osobom – wysłano powiadomienia` : [...pick][0] === state.me.id ? 'Dodano zadanie dla Ciebie' : `Zlecono: ${who([...pick][0])} – wysłano powiadomienie`);
    onDone?.();
  } }, editing ? 'Zapisz' : 'Zleć')], { wide: true });
}

// ---------- osoby pracujące razem nad zadaniem ----------
function peopleDialog(z, onDone) {
  const team = state.members.filter(m => m.active !== false && m.id !== z.assignee_id && (m.role === 'admin' || (m.modules || ['rozliczenia']).includes('rozliczenia')));
  const pick = new Set(helpersOf(z));
  const box = h('div', { class: 'zl-people' }, ...team.map(m => { const cb = h('input', { type: 'checkbox', checked: pick.has(m.id) }); cb.addEventListener('change', () => cb.checked ? pick.add(m.id) : pick.delete(m.id)); return h('label', { class: 'zl-person-pick' }, cb, ava(m), m.id === state.me.id ? 'Ja' : m.full_name); }));
  modal(`Osoby w zadaniu #${z.no}`, h('div', { class: 'zl-form' },
    h('p', { class: 'small muted', style: { marginTop: 0 } }, `Wykonuje: ${who(z.assignee_id)}. Zaznacz osoby, które mają pracować razem nad tym zadaniem – zobaczą je u siebie, mogą komentować, dodawać pliki i odhaczać kroki. Nowe osoby dostaną powiadomienie.`), box),
  close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async e => {
    e.currentTarget.disabled = true;
    const { error } = await sb.rpc('zlecenie_osoby', { p_id: z.id, p_helpers: [...pick] });
    if (error) { e.currentTarget.disabled = false; return fail(error); }
    close(); toast('Zapisano osoby w zadaniu'); onDone?.();
  } }, 'Zapisz')]);
}

// ---------- szczegóły zlecenia ----------
export async function openZlecenie(id, onChange) {
  let admin = isAdmin();
  const [{ data: z, error }, { data: wp }] = await Promise.all([
    sb.from('zlecenia').select('*').eq('id', id).maybeSingle(),
    sb.from('zlecenia_wpisy').select('*').eq('zlecenie_id', id).order('created_at'),
  ]);
  const { data: files } = await sb.from('zlecenia_pliki').select('*').eq('zlecenie_id', id).order('created_at');
  const tiles = list => list.length ? h('div', { class: 'tk-files zl-files' }, ...list.map(f => fileTile({ ...f, bucket: ZL_BUCKET }, {
    onDelete: f.uploaded_by === state.me.id || admin ? async () => { if (!confirm(`Usunąć „${f.name}”? Trafi do kosza na 30 dni.`)) return; const { error: e } = await sb.from('zlecenia_pliki').delete().eq('id', f.id); if (e) return fail(e); toast('Usunięto'); refresh(); } : null }))) : null;
  if (error || !z) return toast('Nie znaleziono zadania (albo nie masz do niego dostępu)', true);
  const mine = z.assignee_id === state.me.id;
  admin = canManage(z); // zlecający tego zadania ma te same przyciski co administrator
  const helper = isHelper(z);
  const boss = firstName(z.created_by);
  const { data: cl } = z.client_id ? await sb.from('clients').select('name').eq('id', z.client_id).maybeSingle() : { data: null };
  let closeFn = () => {};
  const refresh = () => { closeFn(); onChange?.(); openZlecenie(id, onChange); };
  const act = async (akcja, tekst, att = []) => {
    const { error: e } = await sb.rpc('zlecenie_akcja', { p_id: id, p_akcja: akcja, p_tekst: tekst || null });
    if (e) return fail(e);
    if (att.length) {
      const { data: lw } = await sb.from('zlecenia_wpisy').select('id').eq('zlecenie_id', id).eq('author_id', state.me.id).order('created_at', { ascending: false }).limit(1);
      await uploadZl(id, att, lw?.[0]?.id || null);
    }
    toast({ start: 'Powodzenia!', pytanie: `Wysłano pytanie – ${boss} dostanie powiadomienie`, zglos: `Zgłoszono wykonanie – ${boss} dostanie powiadomienie`, akceptuj: 'Zaakceptowano', zakoncz: 'Zadanie zamknięte jako wykonane', popraw: 'Odesłano do poprawy', odpowiedz: 'Wysłano odpowiedź', anuluj: 'Anulowano zadanie', wznow: 'Wznowiono' }[akcja] || 'Zapisano');
    refresh();
  };
  const ask = (title, label, akcja, required, btn) => { const att = []; return modal(title, h('div', { class: 'zl-form' }, h('label', { class: 'field' }, h('span', {}, label), h('textarea', { class: 'input', rows: 4, maxlength: 3000, id: 'zl-ask' })),
      h('div', { class: 'field' }, h('span', {}, 'Załączniki (opcjonalnie)'), pendingBox(att))),
    c => [h('button', { class: 'btn btn-ghost', onclick: c }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: e => { const v = document.getElementById('zl-ask').value.trim(); if (required && !v && !att.length) return toast('Wpisz treść', true); e.currentTarget.disabled = true; c(); act(akcja, v || (att.length ? '📎 w załączniku' : ''), att); } }, btn)]); };

  const st = stepsOf(z);
  const stepsBox = st.length ? h('div', { class: 'zl-steps' }, ...st.map((s, i) => {
    const cb = h('input', { type: 'checkbox', checked: !!s.done, disabled: !(mine || admin || helper) || !OPEN.includes(z.status) });
    cb.addEventListener('change', async () => { const { error: e } = await sb.rpc('zlecenie_krok', { p_id: id, p_idx: i, p_done: cb.checked }); if (e) { cb.checked = !cb.checked; return fail(e); } s.done = cb.checked; onChange?.(); });
    return h('label', { class: 'check zl-step' }, cb, s.t);
  })) : null;

  const KIND = { pytanie: 'Pytanie', zgloszenie: 'Zgłoszenie wykonania', poprawka: 'Do poprawy', akceptacja: 'Akceptacja', status: 'Zmiana', komentarz: '' };
  const timeline = h('div', { class: 'zl-tl' }, ...(wp || []).map(w => h('div', { class: 'zl-w zl-w-' + w.kind + (w.author_id === state.me.id ? ' mine' : '') },
    h('span', { class: 'zl-av', title: who(w.author_id) }, ava(memberById(w.author_id) || { full_name: '?' })),
    h('div', { class: 'zl-wmain' }, h('div', { class: 'small muted zl-whead' }, h('b', {}, who(w.author_id)), KIND[w.kind] ? ` · ${KIND[w.kind]}` : '', ' · ', new Date(w.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
      w.body ? h('div', { class: 'zl-wbody' }, w.body) : null, tiles((files || []).filter(f => f.wpis_id === w.id))))));
  // ---- komentarz: pole + małe przyciski „plik” i „zdjęcie” (przeciąganie i wklejanie zrzutu też działa) ----
  const comment = h('textarea', { class: 'input zl-ctext', rows: 2, maxlength: 3000, placeholder: 'Napisz komentarz albo dołącz plik…' });
  const cAtt = [];
  const cList = h('div', { class: 'zl-pend' });
  const drawAtt = () => put(cList, ...cAtt.map((f, i) => h('span', { class: 'zl-pfile' }, f.type?.startsWith('image/') ? h('img', { src: URL.createObjectURL(f), alt: '' }) : null,
    h('span', {}, `${f.name} · ${fmtSize(f.size)}`), h('button', { type: 'button', 'aria-label': 'Usuń', onclick: () => { cAtt.splice(i, 1); drawAtt(); } }, '✕'))));
  const addAtt = fs => { fs.map(named).forEach(f => cAtt.push(f)); drawAtt(); };
  const fileIn = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { if (fileIn.files.length) addAtt([...fileIn.files]); fileIn.value = ''; } });
  const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => { if (camIn.files.length) addAtt([...camIn.files]); camIn.value = ''; } });
  const sendC = async ev => {
    const v = comment.value.trim(); if (!v && !cAtt.length) { comment.focus(); return toast('Wpisz komentarz albo dodaj plik', true); }
    const btn = ev.currentTarget; btn.disabled = true;
    const { data: w, error: e } = await sb.from('zlecenia_wpisy').insert({ zlecenie_id: id, kind: 'komentarz', body: v || `📎 ${cAtt.length === 1 ? 'załącznik' : `załączniki (${cAtt.length})`}`, author_id: state.me.id }).select('id').single();
    if (e) { btn.disabled = false; return fail(e); }
    if (cAtt.length) await uploadZl(id, cAtt, w.id);
    toast('Dodano komentarz'); refresh();
  };
  const composer = (mine || admin || helper) && z.status !== 'anulowane' ? h('div', { class: 'zl-composer' }, comment, cList,
    h('div', { class: 'zl-ctools' },
      h('button', { type: 'button', class: 'zl-tool', title: 'Dołącz plik', onclick: () => fileIn.click() }, '📎', h('span', {}, 'Plik')),
      h('button', { type: 'button', class: 'zl-tool', title: 'Zrób zdjęcie', onclick: () => camIn.click() }, '📷', h('span', {}, 'Zdjęcie')),
      h('span', { class: 'zl-ctools-sp' }),
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: sendC }, 'Wyślij komentarz')), fileIn, camIn) : null;
  if (composer) {
    ['dragenter', 'dragover'].forEach(t => composer.addEventListener(t, e => { e.preventDefault(); composer.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => composer.addEventListener(t, e => { e.preventDefault(); composer.classList.remove('over'); }));
    composer.addEventListener('drop', e => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) addAtt(fs); });
    composer.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); addAtt(fs); } });
  }
  // plik do samego zlecenia (zlecający)
  const topIn = h('input', { type: 'file', multiple: true, hidden: true, onchange: async () => { const fs = [...topIn.files]; topIn.value = ''; if (!fs.length) return; const n = await uploadZl(id, fs); if (n) { toast(n === 1 ? 'Dodano załącznik' : `Dodano załączniki: ${n}`); refresh(); } } });

  // ---- „Co teraz?” – jeden wyraźny krok dla osoby, która patrzy ----
  const B = (cls, label, fn) => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label);
  const first = (who(z.assignee_id) || '').split(' ')[0] || 'Pracownik';
  let hint = '', main = [], extra = [];
  const closed = !OPEN.includes(z.status);
  if (closed) {
    hint = z.status === 'anulowane' ? 'Zadanie anulowane.' : `Zadanie zakończone${z.accepted_at ? ' ' + new Date(z.accepted_at).toLocaleDateString('pl-PL') : ''}. 👍`;
    if (admin) extra.push(B('btn-ghost btn-sm', 'Wznów zadanie', () => act('wznow')));
  } else if (mine) {
    hint = { nowe: 'Kliknij „Zaczynam”, gdy się za to weźmiesz. Po wykonaniu – „Zrobione – zgłaszam”.', w_toku: 'Gdy skończysz, kliknij „Zrobione – zgłaszam”. Coś niejasne? „Mam pytanie”.',
      pytanie: 'Czekasz na odpowiedź – dostaniesz powiadomienie. Możesz dalej pracować.', zgloszone: 'Zgłoszone – czeka na sprawdzenie i akceptację.' }[z.status];
    if (['nowe', 'pytanie'].includes(z.status)) main.push(B('btn-outline', 'Zaczynam', () => act('start')));
    if (['nowe', 'w_toku', 'pytanie'].includes(z.status)) main.push(B('btn-primary', '✓ Zrobione – zgłaszam', () => ask('Zgłoś wykonanie', 'Komentarz (opcjonalnie) – co zostało zrobione', 'zglos', false, 'Zgłaszam wykonanie')));
    if (['nowe', 'w_toku'].includes(z.status)) extra.push(B('btn-ghost btn-sm', '? Mam pytanie', () => ask('Pytanie do zadania', 'Twoje pytanie', 'pytanie', true, 'Wyślij pytanie')));
  }
  if (!closed && admin && !mine) {
    hint = { nowe: `Czeka, aż ${first} zacznie.`, w_toku: `${first} pracuje nad zadaniem.`, pytanie: `${first} ma pytanie – odpowiedz.`,
      zgloszone: `${first} zgłosił(a) wykonanie – sprawdź i zaakceptuj albo odeślij do poprawy.` }[z.status];
  }
  if (!closed && admin) {
    if (z.status === 'zgloszone') main.push(B('btn-outline', 'Do poprawy', () => ask('Odeślij do poprawy', 'Co trzeba poprawić?', 'popraw', true, 'Odeślij')), B('btn-primary', '✓ Akceptuję – zakończ', () => act('akceptuj')));
    if (z.status === 'pytanie') main.push(B('btn-primary', 'Odpowiedz', () => ask('Odpowiedź', 'Twoja odpowiedź', 'odpowiedz', true, 'Wyślij odpowiedź')));
    if (['nowe', 'w_toku', 'pytanie'].includes(z.status)) main.push(B(z.status === 'pytanie' ? 'btn-outline' : 'btn-primary', '✓ Zakończ – wykonane', () => { if (confirm('Zamknąć zadanie jako wykonane?')) act('zakoncz'); }));
    extra.push(B('btn-ghost btn-sm', 'Edytuj', () => { closeFn(); newZlecenie(() => { onChange?.(); openZlecenie(id, onChange); }, z); }),
      B('btn-ghost btn-sm zl-danger', 'Anuluj zadanie', () => { if (confirm('Anulować to zadanie?')) act('anuluj'); }));
  }
  if (admin) extra.unshift(B('btn-ghost btn-sm', '📎 Plik do zadania', () => topIn.click()));
  const STEPS = [['Zlecone', ['nowe']], ['W trakcie', ['w_toku', 'pytanie']], ['Zgłoszone', ['zgloszone']], ['Zakończone', ['zaakceptowane']]];
  const cur = STEPS.findIndex(([, ss]) => ss.includes(z.status));
  const stepper = z.status === 'anulowane' ? null : h('ol', { class: 'zl-stepper' }, ...STEPS.map(([l], i) => h('li', { class: i < cur ? 'done' : i === cur ? 'cur' : '' }, h('span', { class: 'dot' }, i < cur ? '✓' : String(i + 1)), h('span', { class: 'lbl' }, l + (i === 1 && z.status === 'pytanie' ? ' · pytanie' : '')))));
  const next = h('div', { class: 'zl-next' + (closed ? ' closed' : '') },
    hint ? h('p', { class: 'zl-next-hint' }, hint) : null,
    main.length ? h('div', { class: 'zl-next-main' }, ...main) : null,
    extra.length ? h('div', { class: 'zl-next-extra' }, ...extra) : null, topIn);

  closeFn = modal(`Zadanie #${z.no}`, h('div', { class: 'zl-detail' },
    h('div', { class: 'zl-dhead' }, h('h3', {}, z.title, z.priority === 'pilne' ? h('span', { class: 'zl-hot' }, 'pilne') : null), pill(z)),
    h('div', { class: 'zl-dmeta' },
      h('span', {}, 'Dla: ', h('b', {}, who(z.assignee_id))), h('span', {}, 'Zlecił(a): ', who(z.created_by)), dueEl(z),
      helpersOf(z).length || canAddPeople(z) ? h('span', { class: 'zl-helpers' }, helpersOf(z).length ? ['Razem z: ', h('b', {}, helpersOf(z).map(who).join(', '))] : null,
        canAddPeople(z) && OPEN.includes(z.status) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm zl-addp', onclick: () => peopleDialog(z, () => { closeFn(); onChange?.(); openZlecenie(id, onChange); }) }, helpersOf(z).length ? 'Zmień osoby' : '+ Dodaj osobę') : null) : null,
      cl?.name ? h('a', { href: `#/klient/${z.client_id}`, onclick: () => closeFn() }, cl.name) : null),
    z.body ? h('div', { class: 'zl-body' }, z.body) : null,
    stepper,
    next,
    tiles((files || []).filter(f => !f.wpis_id)),
    stepsBox,
    h('h4', { class: 'zl-h4' }, 'Komentarze i przebieg'), timeline,
    composer),
  c => [B('btn-ghost', 'Zamknij okno', c)], { wide: true });
}
