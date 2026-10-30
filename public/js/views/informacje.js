// Informacja do klientów – jedna wiadomość e-mail do wielu klientów (z kancelaria@rkdp.pl), adresaci w UDW.
// Wybór z listy albo grupami (forma prawna, księgowość, VAT, pracodawcy, księgowa). Treść wklejana przez osobę wysyłającą.
import { h, toast, fail, modal, infoTip, icon } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { LEGAL_SHORT } from '../dict.js';

const HELP = `Jedna wiadomość do wielu klientów naraz:
• wybierz klientów grupami (np. wszystkie JDG, spółki z o.o., pracodawcy) albo zaznacz pojedynczo na liście,
• wklej temat i treść – linki w treści będą klikalne, na końcu dołączy się Twoja stopka,
• wiadomość wychodzi z adresu kancelaria@rkdp.pl; klienci są w polu UDW (ukryta kopia), więc nikt nie widzi innych adresatów,
• najpierw „Wyślij test do siebie”, żeby zobaczyć, jak wygląda wiadomość,
• po wysłaniu informacja pojawia się w rozmowie każdego klienta, a wysyłka – w historii na dole strony.`;
const SPZOO = ['spzoo'], OSOB = ['spolka_cywilna', 'spolka_jawna', 'spolka_partnerska', 'spolka_komandytowa'];
const emails = c => [...new Set(String(c.email || '').split(/[;,\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];

export async function renderInformacje(main) {
  const clients = await fetchAll(() => sb.from('clients').select('id,name,email,status,legal_form,bookkeeping,vat_status,has_employees,cit_type,accountant_id,hr_id').order('name'));
  let status = 'aktywny', q = '';
  const sel = new Set();
  const pool = () => clients.filter(c => status === 'wszyscy' || c.status === status);
  const GROUPS = [
    ['Formy prawne', [
      ['JDG', c => c.legal_form === 'jdg'], ['Spółki z o.o.', c => SPZOO.includes(c.legal_form)], ['Spółki osobowe (s.c., sp.j., sp.p., sp.k.)', c => OSOB.includes(c.legal_form)],
      ['Spółki cywilne', c => c.legal_form === 'spolka_cywilna'], ['Spółki partnerskie', c => c.legal_form === 'spolka_partnerska'], ['Spółki komandytowe', c => c.legal_form === 'spolka_komandytowa'],
      ['S.A. / PSA', c => c.legal_form === 'spolka_akcyjna'], ['Fundacje i stowarzyszenia', c => c.legal_form === 'fundacja_stowarzyszenie'], ['Wspólnoty mieszkaniowe', c => c.legal_form === 'wspolnota']]],
    ['Księgowość i podatki', [
      ['KPiR', c => c.bookkeeping === 'kpir'], ['Ryczałt', c => c.bookkeeping === 'ryczalt'], ['Pełna księgowość', c => c.bookkeeping === 'pelna'],
      ['Czynni VAT', c => String(c.vat_status || '').startsWith('czynny')], ['Zwolnieni z VAT', c => String(c.vat_status || '').startsWith('zwolniony')],
      ['CIT estoński', c => c.cit_type === 'estonski'], ['Pracodawcy', c => c.has_employees]]],
    ['Księgowa / kadry', state.members.filter(m => m.active !== false && clients.some(c => c.accountant_id === m.id || c.hr_id === m.id))
      .map(m => [m.full_name, c => c.accountant_id === m.id || c.hr_id === m.id])],
  ];
  const groupsBox = h('div', { class: 'inf-groups' });
  const list = h('div', { class: 'inf-list' });
  const countEl = h('b', {});
  const subj = h('input', { class: 'input', placeholder: 'Temat wiadomości', maxlength: 200 });
  const body = h('textarea', { class: 'input inf-body', rows: 14, placeholder: 'Wklej treść informacji…\n\nLinki (https://…) będą klikalne. Na końcu dołączy się Twoja stopka.' });
  const sigCb = h('input', { type: 'checkbox', checked: true });
  const sendBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => send() }, icon('mail'), 'Wyślij');
  const histBox = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));

  const visible = () => pool().filter(c => !q || c.name.toLowerCase().includes(q) || String(c.email || '').toLowerCase().includes(q));
  const chosen = () => clients.filter(c => sel.has(c.id));
  const addrCount = () => new Set(chosen().flatMap(emails)).size;
  const groupDesc = () => GROUPS.flatMap(([, gs]) => gs).filter(([, f]) => { const m = pool().filter(f); return m.length && m.every(c => sel.has(c.id)); }).map(([l]) => l).join(', ');

  function drawGroups() {
    groupsBox.replaceChildren(...GROUPS.filter(([, gs]) => gs.length).map(([title, gs]) => h('div', { class: 'inf-gsec' }, h('span', { class: 'inf-gtitle' }, title),
      h('div', { class: 'inf-chips' }, ...gs.map(([label, f]) => {
        const m = pool().filter(f); if (!m.length) return null;
        const n = m.filter(c => sel.has(c.id)).length, full = n === m.length;
        return h('button', { type: 'button', class: 'inf-chip' + (full ? ' on' : n ? ' part' : ''), 'aria-pressed': String(full),
          onclick: () => { if (full) m.forEach(c => sel.delete(c.id)); else m.forEach(c => sel.add(c.id)); draw(); } }, label, h('span', {}, full ? `✓ ${m.length}` : n ? `${n}/${m.length}` : String(m.length)));
      }).filter(Boolean)))));
  }
  function drawList() {
    const v = visible();
    list.replaceChildren(...(v.length ? v.map(c => {
      const em = emails(c);
      const cb = h('input', { type: 'checkbox', checked: sel.has(c.id) });
      cb.addEventListener('change', () => { if (cb.checked) sel.add(c.id); else sel.delete(c.id); draw(); });
      return h('label', { class: 'inf-row' + (sel.has(c.id) ? ' on' : '') + (em.length ? '' : ' noemail') }, cb,
        h('span', { class: 'inf-name' }, c.name, h('span', { class: 'inf-form' }, LEGAL_SHORT[c.legal_form] || '')),
        h('span', { class: 'inf-mail' }, em.length ? em.join(', ') : 'brak e-maila'));
    }) : [h('p', { class: 'hint', style: { padding: '12px' } }, 'Brak klientów.')]));
  }
  function draw() {
    drawGroups(); drawList();
    const ch = chosen(), noMail = ch.filter(c => !emails(c).length).length;
    countEl.textContent = `Wybrano klientów: ${ch.length} · adresów e-mail: ${addrCount()}${noMail ? ` · bez e-maila: ${noMail}` : ''}`;
    sendBtn.replaceChildren(icon('mail'), `Wyślij do ${addrCount()} ${addrCount() === 1 ? 'adresu' : 'adresów'}`);
    sendBtn.disabled = !addrCount();
  }
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj klienta lub e-maila…' });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); drawList(); });
  const statusSel = h('select', { class: 'select' }, ...[['aktywny', 'Aktywni'], ['zawieszony', 'Zawieszeni'], ['zakonczony', 'Współpraca zakończona'], ['wszyscy', 'Wszyscy']].map(([v, l]) => h('option', { value: v }, l)));
  statusSel.addEventListener('change', () => { status = statusSel.value; draw(); });

  const call = async payload => {
    const { data, error } = await sb.functions.invoke('mail', { body: { action: 'broadcast', subject: subj.value.trim(), body: body.value, signature: sigCb.checked, ...payload } });
    if (error) throw error;
    if (data?.error === 'not_configured') throw new Error('Wysyłka e-maili nie jest skonfigurowana: ' + (data.detail || ''));
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const valid = () => { if (!subj.value.trim()) { toast('Wpisz temat', true); subj.focus(); return false; } if (!body.value.trim()) { toast('Wklej treść', true); body.focus(); return false; } return true; };
  async function test(btn) {
    if (!valid()) return;
    btn.disabled = true;
    try { const r = await call({ test: true }); toast(`Wysłano test na ${r.email}`); loadHist(); } catch (e) { fail(e); } finally { btn.disabled = false; }
  }
  function send() {
    if (!valid()) return;
    const ch = chosen(), n = addrCount(), noMail = ch.filter(c => !emails(c).length);
    modal('Wysłać informację?', h('div', {},
      h('p', { style: { marginTop: 0 } }, h('b', {}, subj.value.trim())),
      h('p', {}, `Do ${ch.length - noMail.length} klientów (${n} adresów e-mail) – w ukrytej kopii (UDW). Nadawca: RKDP | Kancelaria <kancelaria@rkdp.pl>.`),
      noMail.length ? h('p', { class: 'jpk-warn' }, `Bez adresu e-mail – nie dostaną wiadomości (${noMail.length}): ${noMail.slice(0, 8).map(c => c.name).join(', ')}${noMail.length > 8 ? '…' : ''}`) : null,
      h('p', { class: 'small muted' }, 'Wiadomość pojawi się też w rozmowie każdego klienta.')),
    close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async e => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Wysyłanie…';
      try {
        const r = await call({ client_ids: ch.map(c => c.id), groups: groupDesc() || 'wybrani z listy' });
        close();
        toast(r.failed ? `Wysłano do ${r.sent} adresów, nie udało się: ${r.failed}` : `Wysłano do ${r.sent} adresów (${r.clients} klientów)`, !!r.failed);
        loadHist();
      } catch (err) { close(); fail(err); }
    } }, 'Wyślij')]);
  }
  const copyBcc = async () => { const a = [...new Set(chosen().flatMap(emails))]; if (!a.length) return toast('Nie wybrano adresów', true); try { await navigator.clipboard.writeText(a.join(', ')); toast(`Skopiowano ${a.length} adresów – wklej w pole UDW`); } catch { toast('Nie udało się skopiować', true); } };

  async function loadHist() {
    const { data, error } = await sb.from('mail_broadcasts').select('*').order('sent_at', { ascending: false }).limit(30);
    if (error) { histBox.replaceChildren(h('p', { class: 'hint' }, 'Historia niedostępna.')); return; }
    const ST = { wyslano: 'wysłano', czesciowo: 'częściowo', blad: 'błąd', test: 'test do siebie' };
    histBox.replaceChildren(data.length ? h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Data', 'Temat', 'Grupy', 'Klientów', 'Adresów', 'Status', 'Wysłał(a)'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...data.map(b => h('tr', { class: 'click', onclick: () => modal(b.subject, h('div', {}, h('p', { class: 'small muted', style: { marginTop: 0 } }, `${new Date(b.sent_at).toLocaleString('pl-PL')} · ${memberById(b.sent_by)?.full_name || ''} · ${b.groups || ''}`), h('pre', { class: 'wt-mailbody' }, b.body), b.error ? h('p', { class: 'jpk-warn' }, b.error) : null),
        c => [h('button', { class: 'btn btn-outline', onclick: () => { c(); subj.value = b.subject; body.value = b.body; window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Wczytano treść – wybierz odbiorców'); } }, 'Użyj ponownie'), h('button', { class: 'btn btn-primary', onclick: c }, 'Zamknij')], { wide: true }) },
        h('td', {}, new Date(b.sent_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })),
        h('td', {}, h('b', {}, b.subject)), h('td', { class: 'small' }, b.groups || ''), h('td', {}, String(b.clients)), h('td', {}, String(b.recipients)),
        h('td', {}, h('span', { class: 'pill ' + (b.status === 'wyslano' ? 'done' : b.status === 'test' ? 'unk' : 'no') }, ST[b.status] || b.status)), h('td', {}, memberById(b.sent_by)?.short_name || '')))))) : h('p', { class: 'hint' }, 'Nie wysłano jeszcze żadnej informacji.'));
  }

  main.replaceChildren(
    h('a', { href: '#/klienci', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Klienci'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP · Klienci'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Informacja do klientów', infoTip(HELP, 'Informacja do klientów – jak to działa')),
        h('p', { class: 'sub' }, 'Jedna wiadomość do wielu klientów z kancelaria@rkdp.pl – odbiorcy w ukrytej kopii (UDW).'))),
    h('div', { class: 'inf-grid' },
      h('section', { class: 'card section' },
        h('div', { class: 'section-head' }, h('h2', {}, '1. Odbiorcy'), h('div', { class: 'row-btns' }, statusSel,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { visible().forEach(c => sel.add(c.id)); draw(); } }, 'Zaznacz widocznych'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { sel.clear(); draw(); } }, 'Wyczyść'))),
        groupsBox, h('div', { class: 'inf-search' }, search), list),
      h('section', { class: 'card section inf-compose' },
        h('div', { class: 'section-head' }, h('h2', {}, '2. Wiadomość')),
        h('label', { class: 'field' }, h('span', {}, 'Temat'), subj),
        h('label', { class: 'field' }, h('span', {}, 'Treść'), body),
        h('label', { class: 'check' }, sigCb, 'Dołącz moją stopkę (z rkdp.pl/stopki)'),
        h('p', { class: 'small muted' }, 'Nadawca: RKDP | Kancelaria <kancelaria@rkdp.pl>. Klienci w UDW – nie widzą siebie nawzajem.'),
        h('div', { class: 'inf-count' }, countEl),
        h('div', { class: 'row-btns inf-actions' },
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: e => test(e.currentTarget) }, 'Wyślij test do siebie'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: copyBcc, 'data-tip': 'Adresy wybranych klientów do wklejenia w pole UDW w Gmailu' }, 'Kopiuj adresy'),
          sendBtn))),
    h('section', { class: 'card section', style: { marginTop: '16px' } }, h('div', { class: 'section-head' }, h('h2', {}, 'Wysłane informacje')), histBox));
  draw(); loadHist();
}
