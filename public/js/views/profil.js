// „Mój profil” – każdy pracownik sam uzupełnia swoje dane do pełnomocnictw (UPL-1, PEL, PPS-1).
import { h, toast, fail, infoTip, ava } from '../ui.js';
import { sb, state } from '../store.js';
import { validNip, cleanNip } from '../nip.js';
import { isIOS, isStandalone, pushSupported, canInstall, onInstallChange, promptInstall, currentSubscription, enablePush, disablePush, savePrefs, loadPrefs, sendTest, DEFAULT_PREFS } from '../push.js';

const HELP = `Te dane wpisują się automatycznie w pełnomocnictwa UPL-1, PEL (ZUS) i PPS-1, gdy w „Umowy i pełnomocnictwa” wybierzesz siebie jako pełnomocnika.

• NIP – tylko jeśli prowadzisz działalność; bez niej na formularzu wpisze się PESEL.
• PESEL widzisz i zmieniasz tylko Ty – nie widzi go nikt z zespołu ani administrator. Wpisuje się wyłącznie do pełnomocnictw, które generujesz sam(a). Gdy dokument z Tobą wygeneruje ktoś inny, pole PESEL zostanie puste do wpisania ręcznie.
• Adres do doręczeń: domyślnie biuro RKDP (ul. Beaty Artemskiej 11/44, Wrocław). Własny adres wpisz tylko, jeśli pisma mają trafiać do Ciebie.
• Adres do doręczeń elektronicznych (e-Doręczenia) – jeśli go masz, np. AE:PL-12345-67890-ABCDE-12.`;

const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, (o[k] ?? '').toString().trim() || null]));
const ADDR = ['voiv', 'county', 'commune', 'street', 'house', 'flat', 'zip', 'city', 'post'];

// ---------- aplikacja na urządzeniu: instalacja i powiadomienia push ----------
let offInstall = null;
function appSection() {
  const installBox = h('div', { class: 'pw-row' });
  const drawInstall = () => {
    if (isStandalone()) return installBox.replaceChildren(h('span', { class: 'pw-ok' }, '✓'), h('span', {}, h('b', {}, 'Aplikacja jest zainstalowana na tym urządzeniu.'), h('br'), h('span', { class: 'small muted' }, 'Otwierasz ją z ikony – działa w osobnym oknie, jak zwykły program.')));
    if (canInstall()) return installBox.replaceChildren(h('span', {}, h('b', {}, 'Zainstaluj aplikację na tym urządzeniu'), h('br'), h('span', { class: 'small muted' }, 'Ikona na pulpicie lub ekranie głównym, osobne okno, powiadomienia.')),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => promptInstall().then(ok => ok && toast('Aplikacja zainstalowana')) }, 'Zainstaluj'));
    if (isIOS()) return installBox.replaceChildren(h('span', {}, h('b', {}, 'iPhone / iPad: dodaj aplikację do ekranu początkowego'), h('br'),
      h('span', { class: 'small muted' }, 'W Safari stuknij „Udostępnij” (kwadrat ze strzałką), potem „Do ekranu początkowego” i „Dodaj”. Otwieraj aplikację z nowej ikony – dopiero wtedy działają powiadomienia.')));
    installBox.replaceChildren(h('span', {}, h('b', {}, 'Instalacja'), h('br'), h('span', { class: 'small muted' }, 'W Chrome lub Edge kliknij ikonę instalacji w pasku adresu (monitor ze strzałką) albo w menu „Zainstaluj aplikację”. Na Macu w Safari: Plik → Dodaj do Docka.')));
  };
  drawInstall();
  offInstall?.(); offInstall = onInstallChange(drawInstall);

  const pushBox = h('div', {}, h('p', { class: 'hint' }, 'Sprawdzanie…'));
  const LABELS = [['zgloszenia', 'Nowe i przypisane do mnie zgłoszenia'], ['komentarze', 'Komentarze i wykonanie w moich zgłoszeniach'], ['terminy', 'Poranny plan dnia (dni robocze): zgłoszenia na dziś, po terminie, terminy spraw M2 TAX']];
  async function drawPush() {
    if (isIOS() && !isStandalone()) return pushBox.replaceChildren(h('p', { class: 'small muted' }, 'Na iPhonie i iPadzie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego (iOS 16.4 lub nowszy). Dodaj ją (instrukcja wyżej), otwórz z ikony i włącz powiadomienia tutaj.'));
    if (!pushSupported()) return pushBox.replaceChildren(h('p', { class: 'small muted' }, 'Ta przeglądarka nie obsługuje powiadomień. Użyj Chrome, Edge, Firefox albo Safari w aktualnej wersji.'));
    const sub = await currentSubscription().catch(() => null);
    const on = !!sub && Notification.permission === 'granted';
    const prefs = { ...DEFAULT_PREFS, ...(on ? (await loadPrefs().catch(() => null)) || {} : {}) };
    const checks = LABELS.map(([k, l]) => {
      const cb = h('input', { type: 'checkbox', checked: prefs[k] !== false, disabled: !on });
      cb.addEventListener('change', () => { prefs[k] = cb.checked; savePrefs(prefs).then(() => toast('Zapisano ustawienia powiadomień')).catch(e => fail(e)); });
      return h('label', { class: 'check', style: { margin: '4px 0' } }, cb, l);
    });
    const btn = h('button', { class: on ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
      btn.disabled = true;
      try { if (on) { await disablePush(); toast('Powiadomienia wyłączone na tym urządzeniu'); } else { await enablePush(prefs); toast('Powiadomienia włączone na tym urządzeniu'); } }
      catch (e) { fail(e, 'Powiadomienia'); }
      drawPush();
    } }, on ? 'Wyłącz na tym urządzeniu' : 'Włącz powiadomienia');
    const test = on ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
      try { const n = await sendTest(); toast(n ? 'Wysłano powiadomienie testowe' : 'Brak aktywnych urządzeń – włącz powiadomienia ponownie', !n); } catch (e) { fail(e, 'Powiadomienie testowe'); }
    } }, 'Wyślij testowe') : null;
    pushBox.replaceChildren(
      h('div', { class: 'pw-row' }, h('span', {}, h('b', {}, on ? 'Powiadomienia są włączone na tym urządzeniu.' : 'Powiadomienia są wyłączone na tym urządzeniu.'), h('br'),
        h('span', { class: 'small muted' }, Notification.permission === 'denied' ? 'Przeglądarka blokuje powiadomienia dla tej strony – odblokuj je w ustawieniach witryny (ikona kłódki przy adresie).' : 'Każde urządzenie (komputer, telefon) włączasz osobno.')),
        h('span', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 'none' } }, test, btn)),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: '8px' } }, ...checks));
  }
  drawPush();
  return h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Aplikacja i powiadomienia na tym urządzeniu')),
    installBox, h('hr', { class: 'pw-hr' }), pushBox);
}

export async function renderProfil(main) {
  const me = state.me;
  const [{ data: prof, error: e1 }, { data: priv, error: e2 }] = await Promise.all([
    sb.from('member_profiles').select('*').eq('member_id', me.id).maybeSingle(),
    sb.from('member_private').select('*').eq('member_id', me.id).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const d = { delivery: 'biuro', ...(prof || {}), pesel: priv?.pesel || '', id_doc: priv?.id_doc || '' };
  let dirty = false;
  const info = h('span', { class: 'small muted' }, prof?.updated_at ? `Zapisano ${new Date(prof.updated_at).toLocaleDateString('pl-PL')}` : 'Profil jeszcze niezapisany');
  const mark = () => { dirty = true; info.textContent = 'Niezapisane zmiany'; };

  const inp = (key, label, o = {}) => {
    const el = h('input', { class: 'input', value: d[key] ?? '', placeholder: o.ph || '', inputmode: o.num ? 'numeric' : null, autocomplete: 'off' });
    el.addEventListener('input', () => { d[key] = el.value; mark(); });
    return h('label', { class: 'field' + (o.wide ? ' wide' : '') }, h('span', {}, label), el, o.hint ? h('small', { class: 'hint' }, o.hint) : null);
  };
  const addrBox = h('div');
  const renderAddr = () => addrBox.replaceChildren(d.delivery === 'wlasny' ? h('div', { class: 'form-grid', style: { marginTop: '12px' } },
    inp('street', 'Ulica'), inp('house', 'Nr domu'), inp('flat', 'Nr lokalu'), inp('zip', 'Kod pocztowy', { ph: '00-000' }),
    inp('city', 'Miejscowość'), inp('post', 'Poczta'), inp('commune', 'Gmina'), inp('county', 'Powiat'), inp('voiv', 'Województwo'))
    : h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Na pełnomocnictwach wpisze się adres biura: ul. Beaty Artemskiej 11/44, 52-234 Wrocław.'));
  const radio = (val, label) => {
    const el = h('input', { type: 'radio', name: 'delivery', value: val, checked: d.delivery === val });
    el.addEventListener('change', () => { d.delivery = val; mark(); renderAddr(); });
    return h('label', { class: 'check' }, el, label);
  };
  renderAddr();

  async function save() {
    const nip = cleanNip(d.nip), pesel = String(d.pesel || '').replace(/\D/g, '');
    if (nip && !validNip(nip)) return toast('Nieprawidłowy NIP (zła suma kontrolna)', true);
    if (pesel && !/^\d{11}$/.test(pesel)) return toast('PESEL musi mieć 11 cyfr', true);
    const row = { member_id: me.id, ...pick(d, ['ae_address', 'phone', 'email', ...ADDR]), nip: nip || null, delivery: d.delivery };
    const { error } = await sb.from('member_profiles').upsert(row, { onConflict: 'member_id' });
    if (error) return fail(error);
    if (pesel || priv || d.id_doc) {
      const { error: e } = await sb.from('member_private').upsert({ member_id: me.id, pesel: pesel || null, id_doc: (d.id_doc || '').trim() || null }, { onConflict: 'member_id' });
      if (e) return fail(e);
    }
    dirty = false; info.textContent = 'Zapisano'; toast('Zapisano dane do pełnomocnictw');
  }

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Mój profil'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, me.full_name, infoTip(HELP, 'Dane do pełnomocnictw')),
        h('p', { class: 'sub' }, `${me.job_title ? me.job_title + ' · ' : ''}${me.email}`))),
    photoCard(),
    h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Dane do pełnomocnictw (UPL-1, PEL, PPS-1)')),
      h('div', { class: 'form-grid' },
        inp('nip', 'NIP', { num: true, hint: 'Tylko jeśli prowadzisz działalność – inaczej zostaw puste' }),
        inp('pesel', 'PESEL', { num: true, hint: 'Widzisz go tylko Ty' }),
        inp('id_doc', 'Seria i numer dowodu (opcjonalnie)', { hint: 'Widzisz go tylko Ty' }),
        inp('ae_address', 'Adres do doręczeń elektronicznych (opcjonalnie)', { ph: 'AE:PL-…' }),
        inp('phone', 'Telefon', { ph: 'np. 600 000 000' }),
        inp('email', 'E-mail na pełnomocnictwa'))),
    h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Adres do doręczeń')),
      h('div', { style: { display: 'flex', gap: '22px', flexWrap: 'wrap' } }, radio('biuro', 'Biuro RKDP (Beaty Artemskiej 11/44)'), radio('wlasny', 'Mój adres')),
      addrBox),
    appSection(),
    h('div', { class: 'savebar' }, info, h('button', { class: 'btn btn-primary', onclick: save }, 'Zapisz')));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { window.removeEventListener('beforeunload', beforeUnload); offInstall?.(); };
}

// Dane pełnomocników-pracowników do formularzy (PESEL tylko własny – RLS nie pokaże cudzego)
export function memberPoa(member, prof, priv) {
  const p = prof || {};
  const own = p.delivery === 'wlasny' && (p.street || p.city);
  return {
    mode: 'pracownik', full_name: member.full_name,
    nip: p.nip || '', pesel: priv?.pesel || '', ae_address: p.ae_address || '',
    phone: p.phone || '', email: p.email || '',
    delivery: own ? { country: 'POLSKA', voiv: p.voiv || '', county: p.county || '', commune: p.commune || '', street: p.street || '', house: p.house || '', flat: p.flat || '', city: p.city || '', zip: p.zip || '', post: p.post || p.city || '' } : 'biuro',
    filled: !!prof,
  };
}
export async function loadTeamPoa(members) {
  const [{ data: profs }, { data: privs }] = await Promise.all([
    sb.from('member_profiles').select('*'),
    sb.from('member_private').select('member_id, pesel, id_doc'),
  ]);
  const P = Object.fromEntries((profs || []).map(x => [x.member_id, x])), Q = Object.fromEntries((privs || []).map(x => [x.member_id, x]));
  return Object.fromEntries(members.map(m => [m.id, memberPoa(m, P[m.id], Q[m.id])]));
}

// ---------- zdjęcie profilowe (miniatura zamiast inicjałów w całej aplikacji) ----------
// zdjęcie zmniejszane w przeglądarce do 160×160 (kadr kwadratowy ze środka) i zapisywane jako mały JPEG
function shrink(file, size = 160) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('Nie udało się odczytać zdjęcia')); };
    img.src = url;
  });
}
function photoCard() {
  const me = state.me;
  const pp = h('span', { class: 'pp' });
  const draw = () => { pp.replaceChildren(ava(me)); del.hidden = !me.avatar; document.querySelectorAll('.avatar').forEach(a => a.replaceChildren(ava(me))); };
  const set = async v => {
    const { error } = await sb.rpc('set_my_avatar', { p_avatar: v });
    if (error) return fail(error);
    me.avatar = v; const m = state.members.find(x => x.id === me.id); if (m) m.avatar = v;
    draw(); toast(v ? 'Zapisano zdjęcie' : 'Usunięto zdjęcie');
  };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { await set(await shrink(f)); } catch (e) { fail(e); } });
  const del = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => set(null) }, 'Usuń zdjęcie');
  draw();
  return h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Zdjęcie profilowe')),
    h('div', { class: 'prof-photo' }, pp,
      h('div', {}, h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Miniatura widoczna dla zespołu zamiast inicjałów (rozmowy, zadania, przypisania). Zdjęcie zmniejszy się automatycznie.'),
        h('div', { class: 'row-btns' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => file.click() }, me.avatar ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'), del, file))));
}
