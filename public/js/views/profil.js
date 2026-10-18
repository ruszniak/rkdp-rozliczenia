// „Mój profil” – każdy pracownik sam uzupełnia swoje dane do pełnomocnictw (UPL-1, PEL, PPS-1).
import { h, toast, fail, infoTip } from '../ui.js';
import { sb, state } from '../store.js';
import { validNip, cleanNip } from '../nip.js';

const HELP = `Te dane wpisują się automatycznie w pełnomocnictwa UPL-1, PEL (ZUS) i PPS-1, gdy w „Umowy i pełnomocnictwa” wybierzesz siebie jako pełnomocnika.

• NIP – tylko jeśli prowadzisz działalność; bez niej na formularzu wpisze się PESEL.
• PESEL widzisz i zmieniasz tylko Ty – nie widzi go nikt z zespołu ani administrator. Wpisuje się wyłącznie do pełnomocnictw, które generujesz sam(a). Gdy dokument z Tobą wygeneruje ktoś inny, pole PESEL zostanie puste do wpisania ręcznie.
• Adres do doręczeń: domyślnie biuro RKDP (ul. Beaty Artemskiej 11/44, Wrocław). Własny adres wpisz tylko, jeśli pisma mają trafiać do Ciebie.
• Adres do doręczeń elektronicznych (e-Doręczenia) – jeśli go masz, np. AE:PL-12345-67890-ABCDE-12.`;

const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, (o[k] ?? '').toString().trim() || null]));
const ADDR = ['voiv', 'county', 'commune', 'street', 'house', 'flat', 'zip', 'city', 'post'];

export async function renderProfil(main) {
  const me = state.me;
  const [{ data: prof, error: e1 }, { data: priv, error: e2 }] = await Promise.all([
    sb.from('member_profiles').select('*').eq('member_id', me.id).maybeSingle(),
    sb.from('member_private').select('*').eq('member_id', me.id).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const d = { delivery: 'biuro', email: me.email, ...(prof || {}), pesel: priv?.pesel || '', id_doc: priv?.id_doc || '' };
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
    h('div', { class: 'savebar' }, info, h('button', { class: 'btn btn-primary', onclick: save }, 'Zapisz')));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}

// Dane pełnomocników-pracowników do formularzy (PESEL tylko własny – RLS nie pokaże cudzego)
export function memberPoa(member, prof, priv) {
  const p = prof || {};
  const own = p.delivery === 'wlasny' && (p.street || p.city);
  return {
    mode: 'pracownik', full_name: member.full_name,
    nip: p.nip || '', pesel: priv?.pesel || '', ae_address: p.ae_address || '',
    phone: p.phone || '', email: p.email || member.email || '',
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
