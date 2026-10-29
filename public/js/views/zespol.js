import { h, toast, fail, infoTip } from '../ui.js';
import { sb, state } from '../store.js';
import { ROLE, RULE } from '../dict.js';
import { fetchAll } from './rozliczenia.js';
import { downloadBackup } from '../backup.js';

export async function renderZespol(main) {
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const [clients, assigns] = await Promise.all([
    fetchAll(() => sb.from('clients').select('id,name,status,accountant_id,hr_id').order('name')),
    fetchAll(() => sb.from('client_assignments').select('client_id,member_id')),
  ]);
  let devices = [];
  const loadDevices = async () => { const { data, error } = await sb.from('auth_devices').select('id,member_id,label,created_at,last_used_at,expires_at'); devices = error ? null : data; };
  await loadDevices();
  const fmtD = iso => iso ? new Date(iso).toLocaleDateString('pl-PL') : '';
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
        cb.addEventListener('change', () => {
          // „Tylko podgląd JPK” wyklucza pozostałe moduły i zawsze oznacza dostęp ograniczony
          if (key === 'jpk') return update(m, cb.checked ? { modules: ['jpk'], role: 'limited' } : { modules: ['rozliczenia'] });
          const next = cb.checked ? [...new Set([...mods.filter(x => x !== 'jpk'), key])] : mods.filter(x => x !== key);
          update(m, { modules: next.length ? next : ['jpk'] });
        });
        return h('label', { class: 'check small' }, cb, label);
      };
      const count = assigns.filter(a => a.member_id === m.id).length;
      let loginCell = h('td', { class: 'small muted' }, '—');
      if (devices !== null) {
        const allow = h('input', { type: 'checkbox', checked: !!m.can_set_password });
        allow.addEventListener('change', () => update(m, { can_set_password: allow.checked }));
        const mine = devices.filter(d => d.member_id === m.id && new Date(d.expires_at) > new Date());
        const revoke = h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Zapomina zapamiętane przeglądarki i kończy sesje tej osoby na innych urządzeniach (przy następnym wejściu musi podać hasło i kod).',
          onclick: async () => {
            if (!confirm(`Wylogować ${m.full_name} ze wszystkich urządzeń i zapomnieć zapamiętane przeglądarki?`)) return;
            const { error } = await sb.rpc('admin_revoke_member', { p_member: m.id });
            if (error) return fail(error);
            toast('Wylogowano ze wszystkich urządzeń'); await loadDevices(); renderTeam();
          } }, 'Wyloguj wszędzie');
        loginCell = h('td', { class: 'small' },
          m.password_set_at ? h('div', {}, `hasło ustawione ${fmtD(m.password_set_at)}`) : h('div', { class: 'muted' }, 'hasło nieustawione'),
          h('label', { class: 'check small', 'data-tip': 'Pozwala jeden raz ustawić nowe hasło przez „Pierwsze logowanie / ustaw nowe hasło” (np. gdy ktoś zapomniał hasła). Po ustawieniu zgoda sama się wyłącza.' },
            allow, 'zgoda na nowe hasło'),
          h('div', { class: 'muted', 'data-tip': mine.map(d => `${d.label || 'przeglądarka'} – od ${fmtD(d.created_at)}, ostatnio ${fmtD(d.last_used_at || d.created_at)}`).join(' · ') || null },
            `zapamiętane przeglądarki: ${mine.length}`),
          revoke);
      }
      const nAcc = clients.filter(c => c.accountant_id === m.id).length, nHr = clients.filter(c => c.hr_id === m.id).length;
      return h('tr', {},
        h('td', {}, h('b', {}, m.full_name), h('div', { class: 'small muted' }, m.email)),
        h('td', {}, m.short_name),
        h('td', {}, modBox('rozliczenia', 'Rozliczenia'), h('br'), modBox('doradztwo', 'Doradztwo M2 TAX'), h('br'), h('span', { 'data-tip': 'Konto, które widzi wyłącznie zakładkę JPK (podgląd plików JPK_CIT). Nie ma dostępu do klientów, rozliczeń ani M2 TAX.' }, modBox('jpk', 'Tylko podgląd JPK'))),
        h('td', {}, role),
        h('td', {}, h('label', { class: 'check' }, active, m.active ? 'aktywny' : 'zablokowany')),
        loginCell,
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
      h('option', { value: 'doradztwo' }, 'Moduł: Doradztwo M2 TAX'), h('option', { value: 'oba' }, 'Moduł: oba'), h('option', { value: 'jpk' }, 'Tylko podgląd JPK'));
    mod.addEventListener('change', () => { if (mod.value === 'jpk') role.value = 'limited'; });
    return h('form', { class: 'toolbar', style: { marginTop: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      const modules = mod.value === 'oba' ? ['rozliczenia', 'doradztwo'] : [mod.value];
      // konto „tylko JPK” zawsze z dostępem ograniczonym – nie widzi żadnych klientów
      const { error } = await sb.from('team_members').insert({ email: email.value.trim().toLowerCase(), full_name: name.value.trim(), short_name: short.value.trim(), role: mod.value === 'jpk' ? 'limited' : role.value, modules });
      if (error) return fail(error);
      toast('Dodano. Ta osoba loguje się przez „Pierwsze logowanie”: kod z e-maila, potem własne hasło.');
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
        h('thead', {}, h('tr', {}, ['Osoba', 'Skrót', 'Moduły', 'Dostęp (Rozliczenia)', 'Konto', 'Logowanie', 'Prowadzi', 'Wgląd do innych'].map(t => h('th', {}, t)))), teamBody)),
      addForm,
      h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Logować się mogą wyłącznie aktywne adresy z tej listy: hasłem i kodem z e-maila (albo hasłem w zapamiętanej przeglądarce). Zablokowanie konta działa natychmiast.')),
    assignPanel,
    h('section', { class: 'card section', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' }, h('h2', {}, 'Kolumny listy kontrolnej'), addTask),
      h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Reguła decyduje, kiedy przy otwieraniu miesiąca kolumna dostaje automatycznie „nie dotyczy”.'),
      h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Nazwa i opis', 'Zakładka', 'Reguła „nie dotyczy”', 'Kolejność', ''].map(t => h('th', {}, t)))), taskBody))));
  renderTeam(); renderTasks();

  // ---------- kopia danych ----------
  const backupBtn = h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
    backupBtn.disabled = true;
    try { const n = await downloadBackup(t => { backupBtn.textContent = 'Pobieranie… ' + t; }); toast(`Kopia pobrana (${n} wierszy)`); }
    catch (e) { fail(e, 'Nie udało się zrobić kopii'); }
    finally { backupBtn.disabled = false; backupBtn.textContent = 'Pobierz kopię danych'; }
  } }, 'Pobierz kopię danych');
  const { data: secRows } = await sb.from('app_settings').select('key,value').in('key', ['session_idle_minutes', 'device_trust_days']);
  const secVal = Object.fromEntries((secRows || []).map(r => [r.key, r.value]));
  const secSelect = (key, label, opts, tip) => {
    const sel = h('select', { class: 'select' }, opts.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = secVal[key] || opts[0][0];
    sel.addEventListener('change', async () => {
      const { error } = await sb.from('app_settings').upsert({ key, value: sel.value }); if (error) return fail(error);
      toast('Zapisano – obowiązuje od następnego wejścia do aplikacji');
    });
    return h('label', { class: 'field', 'data-tip': tip }, h('span', {}, label), sel);
  };
  if (secRows?.length) main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Bezpieczeństwo logowania')),
    h('div', { class: 'form-grid' },
      secSelect('session_idle_minutes', 'Wylogowanie po bezczynności', [['60', '1 godzina'], ['120', '2 godziny'], ['240', '4 godziny'], ['480', '8 godzin'], ['720', '12 godzin']],
        'Po tym czasie bez żadnej aktywności aplikacja wyloguje (sprawdza to też baza danych).'),
      secSelect('device_trust_days', 'Pamiętanie przeglądarki', [['7', '7 dni'], ['14', '14 dni'], ['30', '30 dni'], ['60', '60 dni']],
        'Jak długo w zapamiętanej przeglądarce wystarczy samo hasło, bez kodu z e-maila.')),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Logowanie: hasło + kod z e-maila. W zapamiętanej przeglądarce wystarczy hasło. Nowe hasło można ustawić tylko za zgodą administratora (kolumna „Logowanie” wyżej).')));
  const termsBox = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
  main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Regulamin – akceptacje')),
    h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Każdy użytkownik akceptuje regulamin przy pierwszym logowaniu, co najmniej raz na 30 dni i po zmianie treści. Historii nie można zmienić ani usunąć.'),
    termsBox));
  import('./regulamin.js').then(m => m.termsAdminSection(state.members)).then(el => termsBox.replaceChildren(el)).catch(() => termsBox.replaceChildren(h('p', { class: 'hint' }, 'Historia akceptacji jest niedostępna.')));
  main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Kopia zapasowa'), backupBtn),
    h('p', { class: 'hint' }, 'Plik ZIP ze wszystkimi danymi aplikacji (klienci, rozliczenia, notatki, Doradztwo M2 TAX, historia zmian) – w formacie JSON i Excel. ',
      'Niezależnie od tego co noc wykonywana jest automatyczna, zaszyfrowana kopia bazy w GitHubie. ',
      'Plik zawiera dane osobowe – trzymaj go na zaszyfrowanym dysku.')));

  // ---------- poczta: wiadomości do klientów z kancelaria@rkdp.pl ----------
  const mailSt = h('p', { class: 'small' }, '');
  const mailCheck = async () => {
    mailSt.textContent = 'Sprawdzam…';
    try {
      const { data, error } = await sb.functions.invoke('mail', { body: { action: 'status' } });
      if (error) throw error;
      mailSt.replaceChildren(data.ready ? h('b', { style: { color: 'var(--ok)' } }, `✓ Gotowe – wiadomości wychodzą z ${data.from}`)
        : h('span', {}, h('b', { style: { color: 'var(--warn)' } }, 'Jeszcze nie działa. '), String(data.reason || '').replace(/^not_(configured|authorized): ?/, '')));
    } catch (e) { mailSt.textContent = 'Nie udało się sprawdzić: ' + (e.message || e); }
  };
  main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Poczta – wiadomości do klientów'), h('button', { class: 'btn btn-outline btn-sm', onclick: mailCheck }, 'Sprawdź wysyłkę')),
    h('p', { class: 'hint' }, 'Wiadomości z okna „Wiadomość” wychodzą z kancelaria@rkdp.pl (alias konta michal@ruszniak.io) przez Gmail, podpisane przez osobę wysyłającą. Kliknij „Sprawdź wysyłkę” po konfiguracji w Google Workspace.'),
    mailSt));

  // ---------- ustawienia M2 TAX ----------
  const [{ data: settings }, { data: signers }] = await Promise.all([
    sb.from('app_settings').select('key,value'), sb.from('m2_signers').select('*').order('sort')]);
  const sv = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
  const setInput = (key, label, ph) => {
    const inp = h('input', { class: 'input', value: sv[key] || '', placeholder: ph, style: { width: '100%' } });
    inp.addEventListener('change', async () => {
      let v = inp.value.trim() || null;
      const m = v && v.match(/src="([^"]+)"/); if (m) v = m[1].replace(/&amp;/g, '&'); // wklejony cały kod <iframe>
      if (key === 'm2_google_calendar_src' && v && /gserviceaccount\.com/i.test(v))
        return toast('To adres konta usługi, nie kalendarza. Wklej „Identyfikator kalendarza” z ustawień Twojego kalendarza Google (np. Twój e-mail).', true);
      const { error } = await sb.from('app_settings').upsert({ key, value: v }); if (error) return fail(error);
      inp.value = v || ''; toast('Zapisano');
    });
    return h('label', { class: 'field wide' }, h('span', {}, label), inp);
  };
  const sgBody = h('tbody', {}, ...(signers || []).map(sg => {
    const f = (k, w) => { const i = h('input', { class: 'input', value: sg[k] || '', style: { width: w || '100%' } });
      i.addEventListener('change', async () => { const { error } = await sb.from('m2_signers').update({ [k]: i.value.trim() || null }).eq('id', sg.id); if (error) return fail(error); toast('Zapisano'); });
      return i; };
    return h('tr', {}, h('td', {}, f('full_name')), h('td', {}, f('title')), h('td', {}, f('license_no', '90px')), h('td', {}, f('role_label')), h('td', {}, f('nip', '130px')), h('td', {}, f('ae_address', '240px')));
  }));
  main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Doradztwo M2 TAX – ustawienia')),
    h('div', { class: 'form-grid' },
      setInput('m2_zoho_bookings_url', 'Zoho Bookings – adres strony rezerwacji', 'https://…zohobookings.eu/…')),
    h('p', { class: 'eyebrow', style: { margin: '18px 0 8px' } }, 'Podpisujący zlecenia i pełnomocnicy (PPS-1)'),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' }, h('thead', {}, h('tr', {}, ...['Imię i nazwisko', 'Tytuł', 'Nr wpisu', 'Funkcja', 'NIP (PPS-1)', 'Adres do doręczeń elektronicznych'].map(t => h('th', {}, t)))), sgBody))));
}

