import { h, toast, fail, infoTip, modal } from '../ui.js';
import { sb, state } from '../store.js';
import { ROLE, RULE } from '../dict.js';
import { fetchAll } from './rozliczenia.js';
import { downloadBackup, downloadFilesBackup } from '../backup.js';

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

  // ---------- zespół: lista osób + karta osoby (zamiast szerokiej tabeli) ----------
  const teamList = h('div', { class: 'tm-list' });
  const assignPanel = h('div');
  let tf = { q: '', st: 'aktywni' };
  let openId = null, closeCard = null;
  const firmLabel = m => { const md = m.modules || ['rozliczenia']; return md.includes('jpk') ? ['Tylko JPK'] : [md.includes('rozliczenia') && 'RKDP', md.includes('doradztwo') && 'M2 TAX'].filter(Boolean); };
  const avatar = m => h('span', { class: 'tm-av' }, m.avatar ? h('img', { src: m.avatar, alt: '' }) : (m.full_name || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase());
  const sw = (checked, disabled, onchange, label, tip) => h('label', { class: 'tm-sw', 'data-tip': tip || null }, h('input', { type: 'checkbox', checked, disabled, onchange: e => onchange(e.target.checked) }), h('span', { class: 'tm-sw-ui', 'aria-hidden': 'true' }), h('span', {}, label));
  const seg = (opts, value, disabled, onpick) => h('div', { class: 'tm-seg' + (disabled ? ' dis' : '') }, ...opts.map(([k, l, tip]) => h('button', { type: 'button', class: k === value ? 'on' : '', disabled, 'data-tip': tip || null, onclick: () => onpick(k) }, l)));
  function renderTeam() {
    const q = tf.q.toLowerCase();
    const list = state.members.filter(m => (tf.st === 'wszyscy' || (tf.st === 'aktywni' ? m.active : !m.active)) && (!q || `${m.full_name} ${m.email} ${m.short_name}`.toLowerCase().includes(q)));
    teamList.replaceChildren(...(list.length ? list.map(m => {
      const nAcc = clients.filter(c => c.accountant_id === m.id).length, nHr = clients.filter(c => c.hr_id === m.id).length;
      const extra = assigns.filter(a => a.member_id === m.id).length;
      return h('button', { type: 'button', class: 'tm-row' + (m.active ? '' : ' off'), onclick: () => openCard(m.id) },
        avatar(m),
        h('span', { class: 'tm-who' }, h('b', {}, m.full_name, m.id === state.me.id ? h('small', { class: 'tm-me' }, 'Ty') : null), h('small', {}, m.email)),
        h('span', { class: 'tm-tags' }, ...firmLabel(m).map(f => h('span', { class: 'tm-tag' + (f === 'M2 TAX' ? ' m2' : f === 'Tylko JPK' ? ' jpk' : '') }, f))),
        h('span', { class: 'tm-role' }, ROLE[m.role] || m.role),
        h('span', { class: 'tm-meta' }, nAcc || nHr ? `prowadzi ${nAcc + nHr}` : '', extra ? ` · +${extra} wgląd` : ''),
        h('span', { class: 'tm-state' + (m.active ? '' : ' off') }, m.active ? 'aktywny' : 'zablokowany'),
        h('span', { class: 'tm-go', 'aria-hidden': 'true' }, '›'));
    }) : [h('p', { class: 'hint', style: { padding: '18px' } }, 'Nikogo nie znaleziono.')]));
    if (openId) drawCard();
  }
  const cardBody = h('div', { class: 'tm-card' });
  function openCard(id) {
    openId = id; drawCard();
    closeCard = modal(state.members.find(x => x.id === id)?.full_name || 'Osoba', cardBody, close => [h('button', { class: 'btn btn-primary btn-sm', onclick: () => { close(); } }, 'Gotowe')]);
  }
  function drawCard() {
    const m = state.members.find(x => x.id === openId);
    if (!m) return;
    const self = m.id === state.me.id;
    const mods = m.modules || ['rozliczenia'];
    const firm = mods.includes('jpk') ? 'jpk' : mods.includes('rozliczenia') && mods.includes('doradztwo') ? 'oba' : mods.includes('doradztwo') ? 'doradztwo' : 'rozliczenia';
    const setFirm = k => update(m, k === 'jpk' ? { modules: ['jpk'], role: 'limited' } : { modules: k === 'oba' ? ['rozliczenia', 'doradztwo'] : [k] });
    const nAcc = clients.filter(c => c.accountant_id === m.id).length, nHr = clients.filter(c => c.hr_id === m.id).length;
    const extra = assigns.filter(a => a.member_id === m.id).length;
    const mine = (devices || []).filter(d => d.member_id === m.id && new Date(d.expires_at) > new Date());
    cardBody.replaceChildren(
      h('div', { class: 'tm-head' }, avatar(m), h('div', {}, h('b', {}, m.full_name), h('div', { class: 'small muted' }, `${m.email} · skrót: ${m.short_name || '—'}${m.job_title ? ' · ' + m.job_title : ''}`))),
      h('section', { class: 'tm-sec' }, h('h3', {}, 'Dostęp'),
        h('div', { class: 'tm-field' }, h('span', {}, 'Firma'), seg([['rozliczenia', 'RKDP', 'Cała aplikacja: rozliczenia, klienci RKDP, sprawy doradcze RKDP'], ['doradztwo', 'M2 TAX', 'Tylko doradztwo: klienci M2 TAX, sprawy, zlecenia, umowy, pisma'], ['oba', 'Obie'], ['jpk', 'Tylko JPK', 'Widzi wyłącznie podgląd plików JPK']], firm, self, setFirm)),
        h('div', { class: 'tm-field' }, h('span', {}, 'Zakres'), seg(Object.entries(ROLE).map(([k, v]) => [k, v]), m.role, self || firm === 'jpk', k => update(m, { role: k }))),
        self ? h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, 'Swojego dostępu nie możesz zmienić.') : null),
      h('section', { class: 'tm-sec' }, h('h3', {}, 'Konto'),
        sw(m.active, self, v => update(m, { active: v }), m.active ? 'Konto aktywne' : 'Konto zablokowane', 'Zablokowanie działa natychmiast'),
        sw(!!m.attendance, false, v => update(m, { attendance: v }), 'Prowadzi listę obecności')),
      devices !== null ? h('section', { class: 'tm-sec' }, h('h3', {}, 'Logowanie'),
        h('p', { class: 'small', style: { margin: '0 0 8px' } }, m.password_set_at ? `Hasło ustawione ${fmtD(m.password_set_at)}` : h('span', { class: 'muted' }, 'Hasło jeszcze nieustawione'),
          ` · zapamiętane przeglądarki: ${mine.length}`),
        sw(!!m.can_set_password, false, v => update(m, { can_set_password: v }), 'Zgoda na ustawienie nowego hasła', 'Jednorazowo – np. gdy ktoś zapomniał hasła. Po ustawieniu zgoda sama się wyłącza.'),
        h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '8px' }, onclick: async () => {
          if (!confirm(`Wylogować ${m.full_name} ze wszystkich urządzeń i zapomnieć zapamiętane przeglądarki?`)) return;
          const { error } = await sb.rpc('admin_revoke_member', { p_member: m.id });
          if (error) return fail(error);
          toast('Wylogowano ze wszystkich urządzeń'); await loadDevices(); renderTeam();
        } }, 'Wyloguj ze wszystkich urządzeń')) : null,
      h('section', { class: 'tm-sec' }, h('h3', {}, 'Klienci'),
        h('div', { class: 'tm-stats' }, h('div', {}, h('b', {}, String(nAcc)), h('small', {}, 'księgowość')), h('div', {}, h('b', {}, String(nHr)), h('small', {}, 'kadry')), h('div', {}, h('b', {}, String(extra)), h('small', {}, 'dodatkowy wgląd'))),
        h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '10px' }, onclick: () => { closeCard?.(); openId = null; renderAssign(m); } }, 'Ustaw dodatkowy wgląd do klientów')));
  }
  async function update(m, patch) {
    const { error } = await sb.from('team_members').update(patch).eq('id', m.id);
    if (error) { fail(error); } else { toast('Zapisano'); }
    await reloadMembers(); renderTeam();
  }

  const addPerson = () => {
    const email = h('input', { class: 'input', type: 'email', placeholder: 'adres@rkdp.pl' });
    const name = h('input', { class: 'input', placeholder: 'Imię i nazwisko' });
    const short = h('input', { class: 'input', placeholder: 'np. Kuba' });
    let firm = 'rozliczenia', role = 'limited';
    const fBox = h('div'), rBox = h('div');
    const draw = () => { fBox.replaceChildren(seg([['rozliczenia', 'RKDP'], ['doradztwo', 'M2 TAX'], ['oba', 'Obie'], ['jpk', 'Tylko JPK']], firm, false, k => { firm = k; if (k === 'jpk') role = 'limited'; draw(); }));
      rBox.replaceChildren(seg(Object.entries(ROLE).map(([k, v]) => [k, v]), role, firm === 'jpk', k => { role = k; draw(); })); };
    draw();
    modal('Dodaj osobę', h('div', { class: 'form-grid' },
      h('label', { class: 'field wide' }, h('span', {}, 'E-mail (login)'), email), h('label', { class: 'field' }, h('span', {}, 'Imię i nazwisko'), name), h('label', { class: 'field' }, h('span', {}, 'Skrót'), short),
      h('div', { class: 'field wide' }, h('span', {}, 'Firma'), fBox), h('div', { class: 'field wide' }, h('span', {}, 'Zakres'), rBox),
      h('p', { class: 'hint wide', style: { margin: 0 } }, 'Ta osoba zaloguje się przez „Pierwsze logowanie”: kod z e-maila, potem własne hasło.')),
    close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
      if (!email.value.trim() || !name.value.trim() || !short.value.trim()) return toast('Uzupełnij e-mail, imię i nazwisko oraz skrót', true);
      const modules = firm === 'oba' ? ['rozliczenia', 'doradztwo'] : [firm];
      const { error } = await sb.from('team_members').insert({ email: email.value.trim().toLowerCase(), full_name: name.value.trim(), short_name: short.value.trim(), role: firm === 'jpk' ? 'limited' : role, modules });
      if (error) return fail(error);
      close(); toast('Dodano osobę'); await reloadMembers(); renderTeam();
    } }, 'Dodaj')]);
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj osoby…', oninput: e => { tf.q = e.target.value; renderTeam(); } });
  const stChips = h('div', { class: 'firm-chips' });
  const drawSt = () => stChips.replaceChildren(...[['aktywni', 'Aktywni'], ['zablokowani', 'Zablokowani'], ['wszyscy', 'Wszyscy']].map(([k, l]) => h('button', { type: 'button', class: 'chip' + (tf.st === k ? ' on' : ''), onclick: () => { tf.st = k; drawSt(); renderTeam(); } }, l)));
  drawSt();

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
      const area = h('select', { class: 'select' }, h('option', { value: 'ksiegowosc' }, 'Księgowość'), h('option', { value: 'kadry' }, 'Płace'));
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
      h('div', { class: 'section-head' }, h('h2', {}, 'Zespół'), h('button', { class: 'btn btn-primary btn-sm', onclick: addPerson }, '+ Dodaj osobę')),
      h('div', { class: 'tm-tools' }, search, stChips),
      teamList,
      h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Kliknij osobę, żeby zmienić dostęp, konto i logowanie. Logować się mogą wyłącznie aktywne adresy z tej listy: hasłem i kodem z e-maila (albo hasłem w zapamiętanej przeglądarce). Zablokowanie konta działa natychmiast.')),
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
  const filesBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    filesBtn.disabled = true;
    try { const r = await downloadFilesBackup(t => { filesBtn.textContent = 'Pobieranie plików… ' + t; }); toast(`Kopia plików pobrana (${r.n})` + (r.errors ? ` – nie udało się: ${r.errors}, lista w CZYTAJ.txt` : ''), !!r.errors); }
    catch (e) { fail(e, 'Nie udało się zrobić kopii plików'); }
    finally { filesBtn.disabled = false; filesBtn.textContent = 'Pobierz kopię plików'; }
  } }, 'Pobierz kopię plików');
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
    h('div', { class: 'section-head' }, h('h2', {}, 'Kopia zapasowa'), h('div', { class: 'row-btns' }, filesBtn, backupBtn)),
    h('p', { class: 'hint' }, 'Kopia danych: plik ZIP ze wszystkimi danymi aplikacji (klienci, rozliczenia, rozmowy, zadania, Doradztwo M2 TAX, historia zmian) – w formacie JSON i Excel. ',
      'Kopia plików: ZIP ze wszystkimi wgranymi plikami (archiwum klienta, załączniki, pliki od klientów, załączniki zadań) w folderach według klientów. ',
      'Niezależnie od tego co noc wykonywana jest automatyczna, zaszyfrowana kopia bazy w GitHubie (bez plików – pliki pobieraj przyciskiem co jakiś czas). ',
      'Plik zawiera dane osobowe – trzymaj go na zaszyfrowanym dysku.')));

  // ---------- kosz: usunięte pliki (30 dni) ----------
  if (state.me?.role === 'admin') {
    const trashBox = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
    const SRC = { client_files: 'Archiwum klienta', period_files: 'Załącznik w rozmowie', rkdp_ticket_files: 'Załącznik zadania', zlecenia_pliki: 'Załącznik zlecenia' };
    const loadTrash = async () => {
      const { data, error } = await sb.from('file_trash').select('*').order('deleted_at', { ascending: false }).limit(300);
      if (error) { trashBox.replaceChildren(h('p', { class: 'hint' }, 'Kosz niedostępny.')); return; }
      const cl = new Map(); const ids = [...new Set(data.map(r => r.client_id).filter(Boolean))];
      if (ids.length) { const { data: cs } = await sb.from('clients').select('id,name').in('id', ids); (cs || []).forEach(c => cl.set(c.id, c.name)); }
      const days = r => Math.max(0, Math.ceil((new Date(r.purge_after) - Date.now()) / 86400000));
      trashBox.replaceChildren(data.length ? h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ...['Plik', 'Skąd', 'Klient', 'Usunął(a)', 'Kiedy', 'Zniknie za', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, ...data.map(r => h('tr', {},
          h('td', {}, h('b', {}, r.name || r.path.split('/').pop())), h('td', { class: 'small' }, SRC[r.source] || r.source), h('td', { class: 'small' }, cl.get(r.client_id) || '—'),
          h('td', { class: 'small' }, state.members.find(m => m.id === r.deleted_by)?.short_name || '—'),
          h('td', { class: 'small' }, new Date(r.deleted_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
          h('td', { class: 'small' }, `${days(r)} dni`),
          h('td', {}, h('div', { class: 'row-btns' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { const { data: u, error: e } = await sb.storage.from(r.bucket).createSignedUrl(r.path, 120, { download: r.name || true }); if (e) return fail(e); location.href = u.signedUrl; } }, 'Pobierz'),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { const { error: e } = await sb.rpc('restore_file', { p_id: r.id }); if (e) return fail(e); toast('Przywrócono plik'); loadTrash(); } }, 'Przywróć'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
              if (!confirm(`Usunąć „${r.name}” na zawsze? Tego nie da się cofnąć.`)) return;
              const { error: e1 } = await sb.storage.from(r.bucket).remove([r.path]); if (e1) return fail(e1);
              const { error: e2 } = await sb.from('file_trash').delete().eq('id', r.id); if (e2) return fail(e2);
              toast('Usunięto na zawsze'); loadTrash(); } }, 'Usuń na zawsze'))))))))
        : h('p', { class: 'hint' }, 'Kosz jest pusty.'));
    };
    main.append(h('section', { class: 'card section', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' }, h('h2', {}, 'Kosz – usunięte pliki')),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Usunięte w aplikacji pliki (archiwum klienta, załączniki w rozmowach i zadaniach) leżą tu 30 dni – możesz je pobrać albo przywrócić na swoje miejsce. Po 30 dniach są usuwane na stałe. Widzi to tylko administrator.'),
      trashBox));
    loadTrash();
  }

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
    h('p', { class: 'hint' }, 'Wiadomości z okna „Wiadomość” wychodzą z kancelaria@rkdp.pl (alias konta michal@ruszniak.io) przez serwer poczty Gmail, podpisane przez osobę wysyłającą. Wymaga sekretów SMTP_USER i SMTP_PASS (hasło aplikacji Google) w Supabase → Edge Functions → Secrets.'),
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

