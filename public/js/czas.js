// Czas pracy przy kliencie (RKDP i M2 TAX): licznik start/stop (jeden naraz), wpisy ręczne, pakiet godzin i rentowność.
import { h, toast, fail, modal } from './ui.js';
import { sb, state, memberById } from './store.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

let running = null, loaded = null;
const EV = 'rkdp-timer';
const emit = () => window.dispatchEvent(new CustomEvent(EV));
export const onTimer = fn => { window.addEventListener(EV, fn); return () => window.removeEventListener(EV, fn); };
const hm = min => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
export const hours = min => (min / 60).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
const elapsed = r => Math.max(0, (Date.now() - new Date(r.started_at || Date.now())) / 60000) || 0;
const monthRange = ym => { const [y, m] = ym.split('-').map(Number); return [new Date(y, m - 1, 1).toISOString(), new Date(y, m, 1).toISOString()]; };
const thisMonth = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
const entryMin = e => e.minutes ?? (e.ended_at ? Math.round((new Date(e.ended_at) - new Date(e.started_at)) / 60000) : Math.round(elapsed(e)));

export async function loadRunning(force = false) {
  if (loaded && !force) return loaded;
  loaded = (async () => {
    const { data } = await sb.from('time_entries').select('*').eq('member_id', state.me.id).is('ended_at', null).maybeSingle();
    if (data) {
      const t = data.module === 'm2' ? await sb.from('m2_clients').select('name').eq('id', data.m2_client_id).maybeSingle() : await sb.from('clients').select('name').eq('id', data.client_id).maybeSingle();
      data.name = t.data?.name || 'klient';
    }
    running = data || null; emit(); return running;
  })();
  return loaded;
}

export async function startTimer({ module, clientId, name }) {
  await loadRunning();
  if (running) {
    const same = running.module === module && (running.client_id || running.m2_client_id) === clientId;
    if (same) return;
    if (!confirm(`Trwa licznik dla „${running.name}” (${hm(elapsed(running))}). Zatrzymać go i zacząć nowy?`)) return;
    await stopTimer({ silent: true });
  }
  const { data, error } = await sb.from('time_entries').insert({ member_id: state.me.id, module, client_id: module === 'rkdp' ? clientId : null, m2_client_id: module === 'm2' ? clientId : null }).select('*').single();
  if (error) return fail(error);
  running = { ...data, started_at: data.started_at || new Date().toISOString(), name }; loaded = Promise.resolve(running); emit();
  toast(`Liczę czas: ${name}`);
}

export async function stopTimer({ silent = false } = {}) {
  await loadRunning();
  if (!running) return;
  const r = running, mins = Math.max(1, Math.round(elapsed(r)));
  const save = async (minutes, note) => {
    const { error } = await sb.from('time_entries').update({ ended_at: new Date().toISOString(), minutes, note: note || null }).eq('id', r.id);
    if (error) return fail(error);
    running = null; loaded = Promise.resolve(null); emit();
    if (!silent) toast(`Zapisano ${hm(minutes)} h – ${r.name}`);
  };
  if (silent) return save(mins, null);
  const minIn = h('input', { class: 'input', inputmode: 'numeric', value: String(mins) });
  const noteIn = h('input', { class: 'input', maxlength: 500, placeholder: 'np. konsultacja telefoniczna – VAT od zaliczki' });
  modal(`Zatrzymaj licznik – ${r.name}`, h('div', { class: 'form-grid' },
    h('label', { class: 'field' }, h('span', {}, 'Minuty'), minIn),
    h('label', { class: 'field' }, h('span', {}, 'Co zrobiono? (opcjonalnie)'), noteIn)),
  c => [h('button', { class: 'btn btn-ghost', onclick: async () => { c(); const { error } = await sb.from('time_entries').delete().eq('id', r.id); if (error) return fail(error); running = null; loaded = Promise.resolve(null); emit(); toast('Odrzucono pomiar'); } }, 'Odrzuć pomiar'),
    h('button', { class: 'btn btn-primary', onclick: () => { const m = parseInt(minIn.value, 10); if (!(m >= 0 && m <= 1440)) return toast('Podaj minuty (0–1440)', true); c(); save(m, noteIn.value.trim()); } }, 'Zapisz czas')]);
}

// przycisk przy kliencie: „⏱ Start” / „■ Stop 0:23”
export function timerButton({ module, clientId, name }) {
  const b = h('button', { type: 'button', class: 'btn btn-outline btn-sm tm-btn' });
  let tick;
  const draw = () => {
    const mine = running && running.module === module && (running.client_id || running.m2_client_id) === clientId;
    b.classList.toggle('on', !!mine);
    b.textContent = mine ? `■ Stop ${hm(elapsed(running))}` : '⏱ Licz czas';
    b.setAttribute('data-tip', mine ? 'Zatrzymaj licznik i zapisz czas pracy' : 'Włącz licznik czasu pracy dla tego klienta');
    b.onclick = () => mine ? stopTimer() : startTimer({ module, clientId, name });
  };
  const off = onTimer(draw);
  tick = setInterval(() => { if (!b.isConnected) { clearInterval(tick); off(); return; } draw(); }, 20000);
  loadRunning().then(draw); draw();
  return b;
}

// pasek w nagłówku aplikacji, gdy licznik działa
export function timerPill() {
  const el = h('div', { class: 'tm-pill', hidden: true });
  const draw = () => {
    if (!running) { el.hidden = true; return; }
    el.hidden = false;
    put(el, 
      h('a', { href: running.module === 'm2' ? `#/doradztwo/klient/${running.m2_client_id}` : `#/klient/${running.client_id}`, 'data-tip': 'Licznik czasu pracy' }, '⏱ ', h('span', { class: 'tm-name' }, running.name), ' ', h('b', {}, hm(elapsed(running)))),
      h('button', { type: 'button', 'aria-label': 'Zatrzymaj licznik', onclick: () => stopTimer() }, '■'));
  };
  const off = onTimer(draw);
  const tick = setInterval(() => { if (!el.isConnected) { clearInterval(tick); off(); return; } draw(); }, 20000);
  loadRunning().then(draw);
  return el;
}

// karta klienta → „Czas pracy”: ten miesiąc vs pakiet, ostatnie wpisy, wpis ręczny, pakiet godzin (administrator)
export function timeCard({ module, client }) {
  const admin = state.me?.role === 'admin';
  const box = h('section', { class: 'card section tm-card' }, h('div', { class: 'section-head' }, h('h2', {}, 'Czas pracy')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  const col = module === 'm2' ? 'm2_client_id' : 'client_id', table = module === 'm2' ? 'm2_clients' : 'clients';
  async function draw() {
    const ym = thisMonth(), [a, b] = monthRange(ym);
    const [{ data: rows, error }, { data: cl }] = await Promise.all([
      sb.from('time_entries').select('*').eq(col, client.id).gte('started_at', new Date(Date.now() - 92 * 86400000).toISOString()).order('started_at', { ascending: false }).limit(200),
      sb.from(table).select('monthly_fee,package_hours').eq('id', client.id).maybeSingle(),
    ]);
    if (error) { put(box, h('div', { class: 'section-head' }, h('h2', {}, 'Czas pracy')), h('p', { class: 'hint' }, 'Niedostępne.')); return; }
    const month = rows.filter(r => r.started_at >= a && r.started_at < b);
    const min = month.reduce((s, r) => s + entryMin(r), 0);
    const pkg = cl?.package_hours != null ? +cl.package_hours : null, fee = cl?.monthly_fee != null ? +cl.monthly_fee : null;
    const pct = pkg ? Math.min(100, Math.round((min / 60) / pkg * 100)) : null;
    const over = pkg != null && min / 60 > pkg;
    const pkgIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'np. 2', value: pkg != null ? String(pkg).replace('.', ',') : '', style: { maxWidth: '90px' } });
    put(box, 
      h('div', { class: 'section-head' }, h('h2', {}, 'Czas pracy'), h('div', { class: 'row-btns' }, timerButton({ module, clientId: client.id, name: client.name }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: manual }, '+ Wpisz'))),
      h('div', { class: 'tm-sum' },
        h('div', {}, h('span', { class: 'small muted' }, 'W tym miesiącu'), h('b', { class: over ? 'late-t' : '' }, `${hm(min)} h`)),
        h('div', {}, h('span', { class: 'small muted' }, 'Pakiet'), h('b', {}, pkg != null ? `${hours(pkg * 60)} h` : '—')),
        fee != null && admin ? h('div', {}, h('span', { class: 'small muted' }, 'Stawka efektywna'), h('b', {}, min ? `${Math.round(fee / (min / 60)).toLocaleString('pl-PL')} zł/h` : '—')) : null),
      pct != null ? h('div', { class: 'tm-bar' + (over ? ' over' : ''), role: 'img', 'aria-label': `Wykorzystano ${pct}% pakietu` }, h('div', { style: { width: pct + '%' } })) : null,
      over ? h('p', { class: 'small late-t' }, `Pakiet przekroczony o ${hm(min - pkg * 60)} h – podstawa do dopłaty.`) : null,
      admin ? h('div', { class: 'tm-pkg' }, h('span', { class: 'small muted' }, 'Pakiet godzin / mies.'), pkgIn, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
        const v = pkgIn.value.trim() ? parseFloat(pkgIn.value.replace(',', '.')) : null;
        if (pkgIn.value.trim() && !(v >= 0)) return toast('Podaj liczbę godzin', true);
        const { error: e } = await sb.from(table).update({ package_hours: v }).eq('id', client.id); if (e) return fail(e); toast('Zapisano pakiet'); draw();
      } }, 'Zapisz')) : null,
      rows.length ? h('div', { class: 'tm-list' }, ...rows.slice(0, 12).map(r => h('div', { class: 'tm-row' },
        h('span', { class: 'small' }, new Date(r.started_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })),
        h('span', { class: 'small muted' }, memberById(r.member_id)?.short_name || ''),
        h('span', { class: 'tm-note' }, r.ended_at ? (r.note || '—') : 'trwa…'),
        h('b', { class: 'small' }, hm(entryMin(r))),
        (r.member_id === state.me.id || admin) && r.ended_at ? h('button', { type: 'button', class: 'chat-a', 'aria-label': 'Usuń wpis', onclick: async () => { if (!confirm('Usunąć wpis czasu?')) return; const { error: e } = await sb.from('time_entries').delete().eq('id', r.id); if (e) return fail(e); draw(); } }, '✕') : h('span')))) : h('p', { class: 'small muted' }, 'Brak wpisów z ostatnich 3 miesięcy. Włącz licznik przy rozmowie z klientem albo wpisz czas ręcznie.'));
  }
  function manual() {
    const day = h('input', { class: 'input', type: 'date', value: new Date().toLocaleDateString('sv-SE') });
    const mins = h('input', { class: 'input', placeholder: 'np. 45 albo 1:30' });
    const note = h('input', { class: 'input', maxlength: 500, placeholder: 'Co zrobiono?' });
    modal(`Czas pracy – ${client.name}`, h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Dzień'), day), h('label', { class: 'field' }, h('span', {}, 'Czas (minuty albo g:mm)'), mins), h('label', { class: 'field' }, h('span', {}, 'Opis'), note)),
    c => [h('button', { class: 'btn btn-ghost', onclick: c }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
      const v = mins.value.trim(), m = /^\d+:\d{1,2}$/.test(v) ? (+v.split(':')[0]) * 60 + (+v.split(':')[1]) : parseInt(v, 10);
      if (!(m > 0 && m <= 1440)) return toast('Podaj czas, np. 45 albo 1:30', true);
      const start = new Date(day.value + 'T09:00:00'), end = new Date(start.getTime() + m * 60000);
      const { error } = await sb.from('time_entries').insert({ member_id: state.me.id, module, client_id: module === 'rkdp' ? client.id : null, m2_client_id: module === 'm2' ? client.id : null, started_at: start.toISOString(), ended_at: end.toISOString(), minutes: m, note: note.value.trim() || null });
      if (error) return fail(error); c(); toast('Zapisano'); draw();
    } }, 'Zapisz')]);
  }
  const off = onTimer(() => { if (!box.isConnected) return off(); draw(); });
  draw();
  return box;
}

// raport (administrator): #/czas – godziny, pakiet, nadgodziny, stawka efektywna i rentowność
export async function renderCzas(main, params) {
  let ym = /^\d{4}-\d{2}$/.test(params?.get('m') || '') ? params.get('m') : thisMonth();
  const box = h('div', {});
  async function draw() {
    put(box, h('div', { class: 'spinner' }, 'Wczytywanie…'));
    const [a, b] = monthRange(ym);
    const [{ data: rows, error }, { data: cs }, { data: m2 }, { data: st }] = await Promise.all([
      sb.from('time_entries').select('*').gte('started_at', a).lt('started_at', b).limit(5000),
      sb.from('clients').select('id,name,monthly_fee,package_hours'),
      sb.from('m2_clients').select('id,name,monthly_fee,package_hours'),
      sb.from('app_settings').select('value').eq('key', 'target_hourly_rate').maybeSingle(),
    ]);
    if (error) { put(box, h('p', { class: 'hint' }, 'Raport niedostępny.')); return; }
    const target = parseFloat(st?.value || '250') || 250;
    const C = new Map([...(cs || []).map(c => ['rkdp:' + c.id, { ...c, mod: 'RKDP', href: `#/klient/${c.id}` }]), ...(m2 || []).map(c => ['m2:' + c.id, { ...c, mod: 'M2 TAX', href: `#/doradztwo/klient/${c.id}` }])]);
    const agg = new Map(), per = new Map();
    for (const r of rows) {
      const k = r.module + ':' + (r.client_id || r.m2_client_id), m = entryMin(r);
      agg.set(k, (agg.get(k) || 0) + m); per.set(r.member_id, (per.get(r.member_id) || 0) + m);
    }
    const list = [...agg.entries()].map(([k, min]) => { const c = C.get(k) || { name: '?', mod: '' }; const fee = c.monthly_fee != null ? +c.monthly_fee : null, pkg = c.package_hours != null ? +c.package_hours : null;
      const rate = fee != null && min ? fee / (min / 60) : null; return { c, min, fee, pkg, over: pkg != null ? Math.max(0, min - pkg * 60) : 0, rate }; })
      .sort((x, y) => (x.rate ?? 1e9) - (y.rate ?? 1e9));
    const total = list.reduce((s, x) => s + x.min, 0);
    put(box, 
      h('div', { class: 'tiles' }, h('div', { class: 'card tile' }, h('span', { class: 'num' }, hm(total)), h('span', { class: 'lbl' }, 'godzin łącznie')),
        h('div', { class: 'card tile' }, h('span', { class: 'num' }, String(list.length)), h('span', { class: 'lbl' }, 'klientów z czasem')),
        h('div', { class: 'card tile' + (list.filter(x => x.rate != null && x.rate < target).length ? ' dark' : '') }, h('span', { class: 'num' }, String(list.filter(x => x.rate != null && x.rate < target).length)), h('span', { class: 'lbl' }, `poniżej ${target} zł/h`)),
        h('div', { class: 'card tile' }, h('span', { class: 'num' }, hm(list.reduce((s, x) => s + x.over, 0))), h('span', { class: 'lbl' }, 'godzin ponad pakiety'))),
      h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Klienci'), h('span', { class: 'small muted' }, `Stawka efektywna = opłata miesięczna ÷ godziny. Próg: ${target} zł/h.`)),
        list.length ? h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
          h('thead', {}, h('tr', {}, ...['Klient', 'Firma', 'Godziny', 'Pakiet', 'Ponad pakiet', 'Opłata / mies.', 'Stawka efektywna'].map(x => h('th', {}, x)))),
          h('tbody', {}, ...list.map(x => h('tr', {},
            h('td', {}, h('a', { href: x.c.href }, x.c.name)), h('td', { class: 'small' }, x.c.mod), h('td', {}, hm(x.min)),
            h('td', {}, x.pkg != null ? hm(x.pkg * 60) : '—'), h('td', { class: x.over ? 'late-t' : '' }, x.over ? hm(x.over) : '—'),
            h('td', {}, x.fee != null ? `${x.fee.toLocaleString('pl-PL')} zł` : '—'),
            h('td', {}, x.rate != null ? h('span', { class: 'tm-rate' + (x.rate < target ? ' low' : '') }, `${Math.round(x.rate).toLocaleString('pl-PL')} zł/h`) : '—')))))) : h('p', { class: 'hint' }, 'Brak wpisów czasu w tym miesiącu.')),
      per.size ? h('section', { class: 'card section', style: { marginTop: '16px' } }, h('div', { class: 'section-head' }, h('h2', {}, 'Osoby')),
        h('div', { class: 'tm-list' }, ...[...per.entries()].sort((x, y) => y[1] - x[1]).map(([id, m]) => h('div', { class: 'tm-row' }, h('span', {}, memberById(id)?.full_name || '—'), h('b', {}, hm(m) + ' h'))))) : null);
  }
  const monIn = h('input', { class: 'input', type: 'month', value: ym, style: { maxWidth: '180px' } });
  const targetIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'próg zł/h', style: { maxWidth: '110px' } });
  sb.from('app_settings').select('value').eq('key', 'target_hourly_rate').maybeSingle().then(({ data }) => { targetIn.value = data?.value || '250'; });
  monIn.addEventListener('change', () => { if (monIn.value) { ym = monIn.value; history.replaceState(null, '', '#/czas?m=' + ym); draw(); } });
  put(main, 
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP · M2 TAX'), h('h1', { style: { marginTop: '6px' } }, 'Czas pracy i rentowność'), h('p', { class: 'sub' }, 'Ile czasu zajmują klienci, wykorzystanie pakietów godzin i stawka efektywna.')),
      h('div', { class: 'row-btns' }, monIn, targetIn, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { const v = parseFloat(targetIn.value.replace(',', '.')); if (!(v > 0)) return toast('Podaj stawkę', true); const { error } = await sb.from('app_settings').upsert({ key: 'target_hourly_rate', value: String(v) }); if (error) return fail(error); toast('Zapisano próg'); draw(); } }, 'Zapisz próg zł/h'))),
    box);
  draw();
}
