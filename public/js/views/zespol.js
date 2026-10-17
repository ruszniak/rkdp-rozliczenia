import { h, toast, fail } from '../ui.js';
import { sb, state } from '../store.js';
import { ROLE, RULE } from '../dict.js';
import { fetchAll } from './rozliczenia.js';

export async function renderZespol(main) {
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const [clients, assigns] = await Promise.all([
    fetchAll(() => sb.from('clients').select('id,name,status,accountant_id,hr_id').order('name')),
    fetchAll(() => sb.from('client_assignments').select('client_id,member_id')),
  ]);
  const reloadMembers = async () => {
    const { data, error } = await sb.from('team_members').select('*').order('full_name');
    if (error) throw error; state.members = data;
  };

  // ---------- zespół ----------
  const teamBody = h('tbody');
  const assignPanel = h('div');
  function renderTeam() {
    teamBody.replaceChildren(...state.members.map(m => {
      const role = h('select', { class: 'select', disabled: m.id === state.me.id }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k }, v)));
      role.value = m.role;
      role.addEventListener('change', () => update(m, { role: role.value }));
      const active = h('input', { type: 'checkbox', checked: m.active, disabled: m.id === state.me.id });
      active.addEventListener('change', () => update(m, { active: active.checked }));
      const mods = m.modules || ['rozliczenia'];
      const modBox = (key, label) => {
        const cb = h('input', { type: 'checkbox', checked: mods.includes(key), disabled: m.id === state.me.id });
        cb.addEventListener('change', () => update(m, { modules: cb.checked ? [...new Set([...mods, key])] : mods.filter(x => x !== key) }));
        return h('label', { class: 'check small' }, cb, label);
      };
      const count = assigns.filter(a => a.member_id === m.id).length;
      const nAcc = clients.filter(c => c.accountant_id === m.id).length, nHr = clients.filter(c => c.hr_id === m.id).length;
      return h('tr', {},
        h('td', {}, h('b', {}, m.full_name), h('div', { class: 'small muted' }, m.email)),
        h('td', {}, m.short_name),
        h('td', {}, modBox('rozliczenia', 'Rozliczenia'), h('br'), modBox('doradztwo', 'Doradztwo M2 TAX')),
        h('td', {}, role),
        h('td', {}, h('label', { class: 'check' }, active, m.active ? 'aktywny' : 'zablokowany')),
        h('td', { class: 'small' }, `księgowość: ${nAcc}`, h('br'), `kadry: ${nHr}`),
        h('td', {}, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => renderAssign(m) }, `Dodatkowy dostęp (${count})`)));
    }));
  }
  async function update(m, patch) {
    const { error } = await sb.from('team_members').update(patch).eq('id', m.id);
    if (error) { fail(error); } else { toast('Zapisano'); }
    await reloadMembers(); renderTeam();
  }

  const addForm = (() => {
    const email = h('input', { class: 'input', type: 'email', placeholder: 'adres@rkdp.pl', required: true });
    const name = h('input', { class: 'input', placeholder: 'Imię i nazwisko', required: true });
    const short = h('input', { class: 'input', placeholder: 'Skrót (np. Kuba)', required: true });
    const role = h('select', { class: 'select' }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k }, v)));
    role.value = 'limited';
    const mod = h('select', { class: 'select', 'aria-label': 'Moduł' }, h('option', { value: 'rozliczenia' }, 'Moduł: Rozliczenia'),
      h('option', { value: 'doradztwo' }, 'Moduł: Doradztwo M2 TAX'), h('option', { value: 'oba' }, 'Moduł: oba'));
    return h('form', { class: 'toolbar', style: { marginTop: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      const modules = mod.value === 'oba' ? ['rozliczenia', 'doradztwo'] : [mod.value];
      const { error } = await sb.from('team_members').insert({ email: email.value.trim().toLowerCase(), full_name: name.value.trim(), short_name: short.value.trim(), role: role.value, modules });
      if (error) return fail(error);
      toast('Dodano. Ta osoba może się teraz zalogować kodem z e-maila.');
      e.target.reset(); role.value = 'limited';
      await reloadMembers(); renderTeam();
    } }, email, name, short, role, mod, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Dodaj osobę'));
  })();

  function renderAssign(m) {
    const mine = new Set(assigns.filter(a => a.member_id === m.id).map(a => a.client_id));
    const filter = h('input', { class: 'input', type: 'search', placeholder: 'Filtruj klientów…', style: { width: '100%', marginBottom: '10px' } });
    const listBox = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '6px 18px', maxHeight: '420px', overflow: 'auto' } });
    const draw = () => {
      const q = filter.value.toLowerCase();
      listBox.replaceChildren(...clients.filter(c => c.name.toLowerCase().includes(q)).map(c => {
        const cb = h('input', { type: 'checkbox', checked: mine.has(c.id) });
        cb.addEventListener('change', async () => {
          const { error } = cb.checked
            ? await sb.from('client_assignments').insert({ client_id: c.id, member_id: m.id })
            : await sb.from('client_assignments').delete().eq('client_id', c.id).eq('member_id', m.id);
          if (error) { cb.checked = !cb.checked; return fail(error); }
          if (cb.checked) { mine.add(c.id); assigns.push({ client_id: c.id, member_id: m.id }); }
          else { mine.delete(c.id); const i = assigns.findIndex(a => a.client_id === c.id && a.member_id === m.id); if (i >= 0) assigns.splice(i, 1); }
          renderTeam();
        });
        return h('label', { class: 'check small' }, cb, c.name, c.status !== 'aktywny' ? h('span', { class: 'muted' }, ' (nieaktywny)') : null);
      }));
    };
    filter.addEventListener('input', draw);
    assignPanel.replaceChildren(h('section', { class: 'card section', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' }, h('h2', {}, `Klienci: ${m.full_name}`),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => assignPanel.replaceChildren() }, 'Zamknij')),
      h('p', { class: 'hint', style: { marginBottom: '12px' } }, m.role === 'limited'
        ? 'Ta osoba widzi klientów, u których jest księgową lub kadrową, oraz dodatkowo zaznaczonych tutaj.'
        : 'Ta osoba ma pełny dostęp; zaznaczenie oznacza tylko, że jest opiekunem klienta.'),
      filter, listBox));
    draw();
    assignPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- kolumny ----------
  const taskBody = h('tbody');
  function renderTasks() {
    taskBody.replaceChildren(...state.taskTypes.map(t => {
      const label = h('input', { class: 'input', value: t.label, style: { width: '100%' } });
      label.addEventListener('change', () => updTask(t, { label: label.value.trim() || t.label }));
      const rule = h('select', { class: 'select' }, Object.entries(RULE).map(([k, v]) => h('option', { value: k }, v)));
      rule.value = t.rule; rule.addEventListener('change', () => updTask(t, { rule: rule.value }));
      const sort = h('input', { class: 'input', type: 'number', value: t.sort, style: { width: '80px' } });
      sort.addEventListener('change', () => updTask(t, { sort: Number(sort.value) || t.sort }));
      const desc = h('input', { class: 'input', value: t.description || '', placeholder: 'Opis widoczny po najechaniu', style: { width: '100%' } });
      desc.addEventListener('change', () => updTask(t, { description: desc.value.trim() || null }));
      const area = h('select', { class: 'select' }, h('option', { value: 'ksiegowosc' }, 'Księgowość'), h('option', { value: 'kadry' }, 'Kadry i ZUS'));
      area.value = t.area; area.addEventListener('change', () => updTask(t, { area: area.value }));
      const req = h('input', { type: 'checkbox', checked: t.counts_to_settled !== false });
      req.addEventListener('change', () => updTask(t, { counts_to_settled: req.checked }));
      const act = h('input', { type: 'checkbox', checked: t.active });
      act.addEventListener('change', () => updTask(t, { active: act.checked }));
      return h('tr', {}, h('td', {}, label, h('div', { style: { marginTop: '6px' } }, desc)), h('td', {}, area), h('td', {}, rule), h('td', {}, sort), h('td', {}, h('label', { class: 'check' }, act, 'widoczna'), h('label', { class: 'check', style: { marginTop: '6px' } }, req, 'liczy się do „rozliczony”')));
    }));
  }
  async function updTask(t, patch) {
    const { error } = await sb.from('task_types').update(patch).eq('code', t.code);
    if (error) return fail(error);
    Object.assign(t, patch); state.taskTypes.sort((a, b) => a.sort - b.sort); renderTasks(); toast('Zapisano');
  }
  const addTask = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    const label = prompt('Nazwa nowej kolumny (np. „KSeF – faktury pobrane”, „PFRON”):');
    if (!label?.trim()) return;
    const code = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'kolumna';
    const sort = Math.max(0, ...state.taskTypes.map(t => t.sort)) + 10;
    const { data, error } = await sb.from('task_types').insert({ code, label: label.trim(), sort, rule: 'always', area: 'ksiegowosc' }).select().single();
    if (error) return fail(error);
    state.taskTypes.push(data); renderTasks();
    toast('Dodano kolumnę. Pojawi się w miesiącach otwieranych od teraz (lub po „Dodaj brakujących”).');
  } }, '+ Dodaj kolumnę');

  main.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Administracja'), h('h1', { style: { marginTop: '6px' } }, 'Zespół i ustawienia'),
      h('p', { class: 'sub' }, 'Kto ma dostęp do aplikacji i których klientów widzi.'))),
    h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Zespół')),
      h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Osoba', 'Skrót', 'Moduły', 'Dostęp (Rozliczenia)', 'Konto', 'Prowadzi', 'Wgląd do innych'].map(t => h('th', {}, t)))), teamBody)),
      addForm,
      h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Logować się mogą wyłącznie aktywne adresy z tej listy. Zablokowanie konta działa natychmiast.')),
    assignPanel,
    h('section', { class: 'card section', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' }, h('h2', {}, 'Kolumny listy kontrolnej'), addTask),
      h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Reguła decyduje, kiedy przy otwieraniu miesiąca kolumna dostaje automatycznie „nie dotyczy”.'),
      h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Nazwa i opis', 'Zakładka', 'Reguła „nie dotyczy”', 'Kolejność', ''].map(t => h('th', {}, t)))), taskBody))));
  renderTeam(); renderTasks();

  // ---------- ustawienia M2 TAX ----------
  const [{ data: settings }, { data: signers }] = await Promise.all([
    sb.from('app_settings').select('key,value'), sb.from('m2_signers').select('*').order('sort')]);
  const sv = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
  const setInput = (key, label, ph) => {
    const inp = h('input', { class: 'input', value: sv[key] || '', placeholder: ph, style: { width: '100%' } });
    inp.addEventListener('change', async () => {
      let v = inp.value.trim() || null;
      const m = v && v.match(/src="([^"]+)"/); if (m) v = m[1].replace(/&amp;/g, '&'); // wklejony cały kod <iframe>
      const { error } = await sb.from('app_settings').upsert({ key, value: v }); if (error) return fail(error);
      inp.value = v || ''; toast('Zapisano');
    });
    return h('label', { class: 'field wide' }, h('span', {}, label), inp);
  };
  const sgBody = h('tbody', {}, ...(signers || []).map(sg => {
    const f = (k, w) => { const i = h('input', { class: 'input', value: sg[k] || '', style: { width: w || '100%' } });
      i.addEventListener('change', async () => { const { error } = await sb.from('m2_signers').update({ [k]: i.value.trim() || null }).eq('id', sg.id); if (error) return fail(error); toast('Zapisano'); });
      return i; };
    return h('tr', {}, h('td', {}, f('full_name')), h('td', {}, f('title')), h('td', {}, f('license_no', '110px')), h('td', {}, f('role_label')));
  }));
  main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Doradztwo M2 TAX – ustawienia')),
    h('div', { class: 'form-grid' },
      setInput('m2_google_calendar_src', 'Kalendarz Google M2 TAX – identyfikator kalendarza albo kod/link do osadzenia', 'np. kancelaria@m2tax.pl albo https://calendar.google.com/calendar/embed?src=…'),
      setInput('m2_zoho_bookings_url', 'Zoho Bookings – adres strony rezerwacji', 'https://…zohobookings.eu/…')),
    h('p', { class: 'eyebrow', style: { margin: '18px 0 8px' } }, 'Podpisujący zlecenia'),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' }, h('thead', {}, h('tr', {}, ...['Imię i nazwisko', 'Tytuł', 'Nr wpisu', 'Funkcja'].map(t => h('th', {}, t)))), sgBody))));
}
