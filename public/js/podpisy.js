// Wysyłka dokumentu do podpisu przez klienta (link /podpis/?t=…) i panel „Do podpisu” ze statusem i uwagami klienta.
// Wspólne dla: umowy księgowej RKDP, ZUS PEL (karta klienta RKDP), zlecenia i umowy doradczej (M2 TAX / RKDP),
// umowy z biurem rachunkowym (Program Partner M2 TAX).
import { h, icon, toast, fail, modal } from './ui.js';
import { sb, state } from './store.js';
import { docxToHtml } from './docx.js';

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const firstEmail = v => String(v || '').split(/[;,\s]+/).find(x => x.includes('@')) || '';

// ---------- pulpit: umowy do podpisu – uwagi klienta, akceptacje, wysłane i niepodpisane (ze statusem) ----------
export const SIGN_SEL = 'id,title,status,created_at,opened_at,signed_at,expires_at,accepted_at,final_at,client_id,m2_client_id,order_id,created_by,firm,version,clients(name,accountant_id),m2_clients(name),sign_notes(from_client,kind,verdict,created_at)';
const daysAgo = d => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));
const agoTxt = n => n === 0 ? 'dziś' : n === 1 ? 'wczoraj' : `${n} dni temu`;
export function signState(r) {
  const notes = [...(r.sign_notes || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastOffice = notes.map(n => !n.from_client).lastIndexOf(true);
  const pending = notes.slice(lastOffice + 1).filter(n => n.from_client && n.kind !== 'akceptacja' && !n.verdict).length;
  if (r.status === 'podpisano') return { o: 3, cls: 'ok', txt: 'Podpisana przez klienta – wgraj egzemplarz obu stron' };
  if (pending) return { o: 0, cls: 'warn', txt: `Uwagi klienta – do odpowiedzi (${pending})` };
  if (r.accepted_at) return { o: 1, cls: 'warn', txt: 'Klient zaakceptował – wyślij do podpisu' };
  if (new Date(r.expires_at) < new Date()) return { o: 2, cls: 'dark', txt: 'Link wygasł' };
  if (lastOffice >= 0) return { o: 4, cls: '', txt: 'Odpowiedź wysłana – czeka na klienta' };
  if (r.opened_at) return { o: 5, cls: '', txt: `Otwarta ${agoTxt(daysAgo(r.opened_at))} – czeka na podpis` };
  return { o: 6, cls: '', txt: 'Wysłana – klient jeszcze nie otworzył' };
}
// list – wiersze z SIGN_SEL; mineOnly – tylko wysłane przeze mnie albo moich klientów (księgowa); firm – 'm2' / 'rkdp'
export function signDashCard(list, { mineOnly = false, firm = null } = {}) {
  const me = state.me.id;
  const rows = (list || []).filter(r => r.status === 'wyslano' || (r.status === 'podpisano' && !r.final_at && r.signed_at && daysAgo(r.signed_at) <= 45))
    .filter(r => !firm || r.firm === firm)
    .filter(r => !mineOnly || r.created_by === me || r.clients?.accountant_id === me)
    .map(r => ({ r, st: signState(r) })).sort((a, b) => a.st.o - b.st.o || a.r.created_at.localeCompare(b.r.created_at));
  if (!rows.length && mineOnly) return null;
  const href = r => r.order_id ? `#/doradztwo/zlecenie/${r.order_id}` : r.client_id ? `#/klient/${r.client_id}` : `#/doradztwo/klient/${r.m2_client_id}`;
  const who = id => state.members?.find(m => m.id === id)?.full_name || '';
  const comments = rows.filter(x => x.st.o === 0).length;
  return h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, `Umowy do podpisu (${rows.length})`), comments ? h('span', { class: 'badge warn' }, `uwagi: ${comments}`) : null),
    ...(rows.length ? rows.slice(0, 14).map(({ r, st }) => h('a', { class: 'tk-mini', href: href(r), 'data-panel': r.client_id || null },
      h('div', { style: { minWidth: 0 } }, h('b', {}, r.title + (r.version > 1 ? ` · wersja ${r.version}` : '')),
        h('div', { class: 'small muted' }, [r.clients?.name || r.m2_clients?.name, !firm && r.firm === 'm2' ? 'M2 TAX' : null, `wysłana ${agoTxt(daysAgo(r.created_at))}`, !mineOnly && r.created_by ? who(r.created_by) : null].filter(Boolean).join(' · '))),
      h('span', { class: 'badge' + (st.cls ? ' ' + st.cls : ''), style: { flex: 'none', whiteSpace: 'normal', textAlign: 'right', maxWidth: '46%' } }, st.txt)))
      : [h('p', { class: 'hint' }, 'Nie ma umów czekających na podpis ani uwag klientów.')]),
    rows.length > 14 ? h('p', { class: 'hint', style: { marginTop: '8px' } }, `… i ${rows.length - 14} więcej`) : null);
}
// karta ładująca dane sama (pulpit M2 TAX)
export function signDashBox(opts = {}) {
  const box = h('div');
  sb.from('sign_requests').select(SIGN_SEL).in('status', ['wyslano', 'podpisano']).order('created_at', { ascending: false }).limit(300)
    .then(({ data }) => { const el = signDashCard(data || [], opts); box.replaceChildren(...(el ? [el] : [])); });
  return box;
}

// Podgląd na stronie podpisu: pełny dokument HTML (ramka bez skryptów). „paper” – kartka A4 na szarym tle.
export function previewDoc(inner, { head = '', paper = true } = {}) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>
html{font-size:11pt}body{margin:0;background:#E9EAEE;color:#1c1d21;font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;line-height:1.4}
${paper ? `.paper{max-width:760px;margin:18px auto;background:#fff;padding:44px 56px 56px;box-shadow:0 2px 10px rgba(0,0,0,.08);border-radius:4px}
@media(max-width:640px){html{font-size:10pt}.paper{margin:0;padding:22px 16px 30px;border-radius:0;box-shadow:none}p[style*=justify]{text-align:left!important}}` : ''}
.lh-c{text-align:center;margin-bottom:18px}.lh-c img{width:190px;height:auto}p{margin:0}.tab{display:inline-block;width:36pt}
</style></head><body>${paper ? `<div class="paper">${inner}</div>` : inner}</body></html>`;
}
// podgląd treści poprawionej ręcznie (document.xml) – z logo firmy z dokumentu
export const xmlPreview = (xml, brand) => previewDoc(`${brand?.logo ? `<div class="lh-c"><img src="${location.origin}${brand.logo}" alt=""></div>` : ''}${docxToHtml(xml)}`);
export const rkdpContractPreview = bodyHtml => previewDoc(`<div class="lh-c"><img src="${location.origin}/logo-rkdp.png" alt="RKDP"></div>${bodyHtml}`);

const KIND_WORD = { umowa: 'umowę', umowa_doradcza: 'umowę', zlecenie: 'zlecenie', pel: 'pełnomocnictwo', partner: 'umowę', inne: 'dokument' };

// opts: { client: { name, email }, target: { client_id } | { m2_client_id, order_id? }, firm: 'rkdp'|'m2', kind,
//         title, buildPdf: async () => Uint8Array, preview: string (pełny HTML), fileName, onSent,
//         editable?: { xml: document.xml, key, ids, pdf: xml => Promise<Uint8Array>, preview: xml => string } – „Edytuj treść” przed wysyłką;
//         poprawiona treść zapisuje się pod kluczem (doc_edits) i jest używana przy kolejnych wysyłkach i PDF, „Od nowa” wraca do wzoru }
export async function sendForSignature(opts) {
  const { client, target, firm = 'rkdp', kind = 'umowa', onSent, editable } = opts;
  let editedXml = null;   // treść poprawiona ręcznie (tylko dla tej wysyłki)
  const buildPdf = () => editedXml ? editable.pdf(editedXml) : opts.buildPdf();
  const curPreview = () => editedXml ? editable.preview(editedXml) : opts.preview;
  const s = { title: opts.title, to: firstEmail(client.email) };
  const word = KIND_WORD[kind] || 'dokument';
  s.subject = `${opts.title} – prośba o podpis`;
  s.body = `Dzień dobry,\n\nprzygotowaliśmy dla Państwa ${word} „${opts.title}”. Pod linkiem poniżej można ${word === 'pełnomocnictwo' ? 'je' : 'ją'} przeczytać, zgłosić ewentualne uwagi i podpisać:\n{link}\n\nPodpisać można:\n• bezpłatnie profilem zaufanym (podpis zaufany na gov.pl),\n• podpisem kwalifikowanym,\n• odręcznie – po wydrukowaniu i zeskanowaniu.\n\nNa stronie jest instrukcja krok po kroku i miejsce na odesłanie podpisanego pliku. Link jest ważny 7 dni.\n\nW razie pytań jesteśmy do dyspozycji.`;
  if (word === 'zlecenie') s.body = s.body.replace('można ją', 'można je');
  const grid = h('div', { class: 'form-grid' }, ...[['title', 'Nazwa dokumentu', 'text'], ['to', 'Do (e-mail klienta)', 'email'], ['subject', 'Temat', 'text'],
    ['body', 'Treść – {link} zamieni się na przycisk do strony podpisu; e-mail wyjdzie z rdp.app z logo kancelarii, odpowiedź klienta wróci do Ciebie', 'textarea']].map(([k, label, type]) => {
    const el = type === 'textarea' ? h('textarea', { class: 'input', rows: 13 }, s[k]) : h('input', { class: 'input', type, value: s[k] });
    el.addEventListener('input', () => { s[k] = el.value; });
    return h('label', { class: 'field wide' }, h('span', {}, label), el);
  }));
  let pdfP = null;
  const editedBox = h('span', { hidden: true });
  let editedAt = null;
  const markEdited = () => { editedBox.hidden = !editedXml; editedBox.replaceChildren(h('span', { class: 'sign-edited' },
    'Treść zmieniona ręcznie' + (editedAt ? ` (zapisana ${new Date(editedAt).toLocaleDateString('pl-PL')})` : ''),
    h('button', { class: 'btn btn-ghost btn-sm de-b', type: 'button', 'data-tip': 'Wygeneruj dokument od nowa ze wzoru i aktualnych danych – Twoje poprawki zostaną skasowane', onclick: async () => {
      if (!confirm('Wygenerować dokument od nowa ze wzoru? Twoje ręczne poprawki zostaną skasowane.')) return;
      try { const { resetEdit } = await import('./docedit.js'); await resetEdit(editable.key); } catch (err) { return fail(err, 'Nie udało się'); }
      editedXml = null; editedAt = null; pdfP = null; markEdited(); toast('Dokument wygenerowany od nowa ze wzoru');
    } }, 'Od nowa'))); };
  // zapamiętana wcześniej wersja ręczna tego dokumentu
  if (editable?.key) import('./docedit.js').then(m => m.loadEdit(editable.key)).then(r => { if (r && !editedXml) { editedXml = r.xml; editedAt = r.updated_at; pdfP = null; markEdited(); } }).catch(() => {});
  const pdf = () => pdfP ||= buildPdf().catch(e => { pdfP = null; throw e; });
  const body = h('div', {},
    h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Klient: ', h('b', {}, client.name || '—'),
      ` · e-mail zawiera tylko link – klient czyta dokument, zgłasza uwagi i pobiera PDF do podpisu na stronie. Link jest ważny 7 dni.`),
    grid,
    h('div', { class: 'row-btns', style: { marginTop: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async e => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const bytes = await pdf();
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          const a = h('a', { href: url, download: `${(s.title || 'dokument').replace(/[\\/:*?"<>|]+/g, ' ')}.pdf` }); document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) { fail(err, 'Nie udało się przygotować PDF'); } finally { b.disabled = false; }
      } }, icon('download'), 'Podgląd PDF'),
      editable ? h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Popraw treść tego dokumentu – poprawki zapiszą się przy tym kliencie (wzór umowy się nie zmienia)', onclick: async () => {
        const { editDocumentXml } = await import('./docedit.js');
        const x = await editDocumentXml(editedXml || editable.xml, { title: 'Edytuj treść – ' + (s.title || 'dokument') });
        if (x == null) return;
        editedXml = x; editedAt = new Date().toISOString(); pdfP = null; markEdited();
        try { if (editable.key) { const { saveEdit } = await import('./docedit.js'); await saveEdit(editable.key, x, editable.ids || {}); } }
        catch (err) { fail(err, 'Nie udało się zapisać poprawek (zostaną użyte tylko w tej wysyłce)'); }
        toast('Zapisano poprawioną treść – sprawdź „Podgląd PDF” przed wysłaniem');
      } }, icon('file'), 'Edytuj treść') : null,
      editedBox),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Uwagi klienta, status i podpisany plik zobaczysz w sekcji „Do podpisu”; dostaniesz też e-mail.'));
  modal('Wyślij do podpisu', body, close => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    // sam link – do wysłania klientowi samodzielnie (SMS, WhatsApp, własny e-mail); bez wiadomości z aplikacji
    h('button', { class: 'btn btn-outline btn-sm', 'data-tip': 'Utwórz link do strony podpisu i skopiuj go – bez wysyłania e-maila z aplikacji', onclick: async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Przygotowuję…';
      try {
        const bytes = await pdf();
        const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'send', no_email: true, ...target, firm, kind, title: s.title.trim(), to: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.to.trim()) ? s.to.trim() : '',
          attachment: { base64: b64(bytes) }, doc_html: curPreview() || null } });
        if (error || r?.error || !r?.link) throw new Error(r?.detail || r?.error || error?.message || 'Brak linku');
        close(); onSent?.(r);
        showLink(r.link, s.title);
      } catch (err) { fail(err, 'Nie udało się utworzyć linku'); b.disabled = false; b.textContent = 'Tylko link – kopiuj'; }
    } }, '🔗 Tylko link – kopiuj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async e => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.to.trim())) return toast('Wpisz poprawny e-mail klienta', true);
      if (!s.body.includes('{link}')) return toast('Zostaw w treści {link} – tam wstawi się link do podpisu', true);
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Przygotowuję PDF…';
      try {
        const bytes = await pdf();
        b.textContent = 'Wysyłam…';
        const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'send', ...target, firm, kind, title: s.title.trim(), to: s.to.trim(),
          subject: s.subject, body: s.body, attachment: { base64: b64(bytes) }, doc_html: curPreview() || null } });
        if (error || r?.error) throw new Error(r?.detail || r?.error || error.message);
        toast(`Wysłano link do podpisu: ${s.to.trim()}`); close(); onSent?.(r);
      } catch (err) { fail(err, 'Nie udało się wysłać'); b.disabled = false; b.textContent = 'Wyślij do podpisu'; }
    } }, icon('mail'), 'Wyślij do podpisu'),
  ]);
}

// Własny plik (np. umowa przygotowana poza aplikacją) do podpisu przez link: wybór PDF → podgląd stron dla klienta → to samo okno wysyłki.
// opts: { client, target, firm, kind?, onSent }
export function sendFileForSignature(opts) {
  const inp = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast('Wybierz plik PDF (dokument z Worda zapisz najpierw jako PDF)', true);
    if (f.size > 10 * 1048576) return toast('Plik jest większy niż 10 MB', true);
    const bytes = new Uint8Array(await f.arrayBuffer());
    toast('Przygotowuję podgląd dokumentu…');
    let preview = null;
    try { preview = await pdfPagesHtml(bytes.slice()); } catch (e) { console.warn('podgląd PDF', e); }
    sendForSignature({ ...opts, kind: opts.kind || 'umowa', title: f.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Umowa',
      buildPdf: async () => bytes, preview });
  });
  document.body.append(inp); inp.click();
}
// strony PDF jako obrazy – podgląd na stronie podpisu (klient czyta dokument bez pobierania); limit ~1,4 MB
export async function pdfPagesHtml(bytes) {
  const url = '/lib/pdfjs/pdf.min.mjs';   // zmienna – bundler nie dołącza biblioteki
  const lib = await import(/* @vite-ignore */ url);
  lib.GlobalWorkerOptions.workerSrc = '/lib/pdfjs/pdf.worker.min.mjs';
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const n = Math.min(doc.numPages, 40);
  for (const [w, q] of [[1100, .72], [900, .6], [760, .5], [640, .45]]) {
    const imgs = []; let size = 0;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: w / vp0.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const url = cv.toDataURL('image/jpeg', q); size += url.length; imgs.push(url);
      if (size > 1_450_000) break;
    }
    if (size <= 1_450_000 && imgs.length === n) return '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
      + 'body{margin:0;background:#E9EAEE}img{display:block;width:calc(100% - 32px);max-width:820px;height:auto;margin:16px auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.1)}'
      + '@media(max-width:640px){img{width:100%;margin:0 0 6px;box-shadow:none}}</style></head><body>'
      + imgs.map((u, i) => `<img src="${u}" alt="Strona ${i + 1}">`).join('') + '</body></html>';
  }
  return null;   // za duży – klient pobierze PDF
}

// gotowy link do podpisu: kopiowanie (także ręczne, gdy przeglądarka nie pozwala)
function showLink(link, title) {
  const inp = h('input', { class: 'input', readonly: true, value: link, onfocus: e => e.target.select() });
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Skopiowano link do podpisu'); } catch { inp.select(); document.execCommand?.('copy'); toast('Zaznaczono link – skopiuj Ctrl+C / ⌘C'); } };
  copy();
  modal('Link do podpisu', h('div', {},
    h('p', { class: 'small', style: { margin: '0 0 10px' } }, `„${title}” – wyślij ten link klientowi (SMS, komunikator, własny e-mail). Na stronie przeczyta dokument, zgłosi uwagi, pobierze PDF i odeśle podpisany plik. Link jest ważny 7 dni.`),
    inp,
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Status, uwagi klienta i podpisany plik zobaczysz w sekcji „Do podpisu”. Link możesz skopiować tam ponownie.')),
    close => [h('button', { class: 'btn btn-outline btn-sm', onclick: copy }, 'Kopiuj ponownie'), h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Gotowe')]);
}

// Panel „Do podpisu”: filter = { client_id } | { order_id } | { m2_client_id }
// egzemplarz podpisany przez obie strony → klient pobiera go z tego samego linku (e-mail z aplikacji)
function uploadFinal(r, done) {
  const inp = h('input', { type: 'file', accept: '.pdf,.xml,.xades,.p7s,.p7m,.zip,.asice,.asics', hidden: true });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.remove(); if (!f) return;
    if (f.size > 10 * 1048576) return toast('Plik jest większy niż 10 MB', true);
    if (!confirm(`Wgrać „${f.name}” jako egzemplarz podpisany przez obie strony?${r.email ? `\n\nKlient (${r.email}) dostanie e-mail z linkiem do pobrania.` : '\n\nProśba nie ma e-maila – link do strony skopiujesz i wyślesz sam.'}`)) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      toast('Wysyłam egzemplarz…');
      const { data: x, error: e } = await sb.functions.invoke('podpis', { body: { action: 'final', id: r.id, attachment: { base64: btoa(bin), name: f.name } } });
      if (e || x?.error) throw new Error(x?.error || e.message);
      if (x.mailed) toast(`Wysłano klientowi link do egzemplarza: ${r.email}`);
      else { try { await navigator.clipboard.writeText(x.link); } catch { /* */ } toast(x.mail_error ? 'Zapisano, ale e-mail się nie wysłał – link skopiowany' : 'Zapisano egzemplarz – link do strony skopiowany', !!x.mail_error); }
      done?.();
    } catch (err) { fail(err, 'Nie udało się wgrać egzemplarza'); }
  });
  document.body.append(inp); inp.click();
}

export function signPanel(filter, { title = 'Do podpisu', emptyHidden = true } = {}) {
  const box = h('div', { class: 'sign-box', hidden: true });
  const d = v => v ? new Date(v).toLocaleDateString('pl-PL') : '';
  async function open(r, which) {
    const { data, error } = await sb.functions.invoke('podpis', { body: { action: 'file', id: r.id, which } });
    if (error || data?.error || !data?.url) return fail(error || new Error(data?.error || 'Brak pliku'));
    window.open(data.url, '_blank', 'noopener');
  }
  async function load() {
    let q = sb.from('sign_requests').select('id, title, email, status, token, kind, created_at, opened_at, signed_at, expires_at, firm, version, changes, accepted_at, final_at, final_name, sign_notes(id, body, author, created_at, from_client, verdict, version, kind, points)');
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(12);
    if (error || (!data?.length && emptyHidden)) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(h('h3', {}, title), ...(data.length ? data.map(r => {
      const expired = r.status === 'wyslano' && new Date(r.expires_at) < new Date();
      const notes = (r.sign_notes || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = notes[notes.length - 1];
      const accepted = r.status === 'wyslano' && !!r.accepted_at;   // klient zaakceptował stanowisko – przygotować umowę do podpisu
      const waiting = !accepted && !!last && last.from_client !== false;   // ostatnie słowo klienta – czeka na odpowiedź
      const [label, cls] = r.status === 'podpisano' ? [r.final_at ? 'podpisano przez obie strony · egzemplarz wysłany ' + d(r.final_at) : 'podpisano ' + d(r.signed_at) + ' – wgraj nasz podpis', 'ok'] : r.status === 'anulowano' ? ['anulowano', 'off']
        : expired ? ['link wygasł', 'off'] : accepted ? ['klient zaakceptował – wyślij umowę do podpisu', 'warn'] : waiting ? ['uwagi klienta – czeka na odpowiedź', 'warn'] : last ? ['odpowiedziano ' + d(last.created_at), 'info']
        : r.opened_at ? ['otwarto ' + d(r.opened_at), 'info'] : ['wysłano ' + d(r.created_at), 'info'];
      const mayReply = r.status === 'wyslano' && (state.me?.role === 'admin' || (r.firm === 'm2' && state.me?.id === 'c66817f8-61a2-4605-a503-07cbcf9d47d5'));
      const link = `${location.origin}/podpis/?t=${r.token}`;
      const active = r.status === 'wyslano' && !expired;
      return h('div', { class: 'sign-row' },
        h('div', { class: 'sign-top' },
          h('div', { class: 'sign-t' }, h('b', {}, r.title), (r.version || 1) > 1 ? h('span', { class: 'sign-ver', 'data-tip': r.changes || '' }, `wersja ${r.version}`) : null,
            h('span', { class: 'small muted' }, ` · ${r.email || 'link skopiowany'} · ${d(r.created_at)}`)),
          h('span', { class: 'sign-st ' + cls }, label),
          h('span', { class: 'row-btns' },
            mayReply && notes.length ? h('button', { class: 'btn btn-sm ' + (accepted ? 'btn-primary' : 'btn-outline'), type: 'button', 'data-tip': 'Umowa do podpisu po uzgodnieniach: nowa wersja albo bez zmian – klient dostanie e-mail, że umowa czeka na podpis', onclick: async () => {
              const { replyDialog } = await import('./podpis-odp.js');
              replyDialog({ ...r, notes }, () => load(), { final: true });
            } }, icon('file'), 'Wyślij do podpisu') : null,
            mayReply && notes.length && !accepted ? h('button', { class: 'btn btn-sm ' + (waiting ? 'btn-primary' : 'btn-outline'), type: 'button', 'data-tip': 'Odpowiedz klientowi na uwagi i ewentualnie wyślij nową wersję dokumentu pod tym samym linkiem', onclick: async () => {
              const { replyDialog } = await import('./podpis-odp.js');
              replyDialog({ ...r, notes }, () => load());
            } }, icon('mail'), 'Odpowiedz') : null,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => open(r, 'original') }, 'PDF'),
            r.status === 'podpisano' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => open(r, 'signed') }, 'Podpisany plik') : null,
            r.status === 'podpisano' && r.final_at ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Egzemplarz podpisany przez obie strony (klient pobiera go z linku)', onclick: () => open(r, 'final') }, 'Egzemplarz obu stron') : null,
            r.status === 'podpisano' ? h('button', { class: 'btn btn-sm ' + (r.final_at ? 'btn-ghost' : 'btn-primary'), type: 'button', 'data-tip': 'Wgraj umowę podpisaną także przez nas – klient dostanie e-mail z linkiem do pobrania swojego egzemplarza', onclick: () => uploadFinal(r, load) }, icon('paperclip'), r.final_at ? 'Podmień egzemplarz' : 'Wgraj egzemplarz podpisany przez nas') : null,
            active ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Skopiowano link do podpisu'); } catch { prompt('Link do podpisu:', link); } } }, 'Kopiuj link') : null,
            active ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
              if (!confirm(`Anulować prośbę o podpis „${r.title}”? Link u klienta przestanie działać.`)) return;
              const { data: x, error: e } = await sb.functions.invoke('podpis', { body: { action: 'cancel', id: r.id } });
              if (e || x?.error) return fail(e || new Error(x.error));
              toast('Anulowano prośbę o podpis'); load();
            } }, 'Anuluj') : null)),
        ...notes.map(n => {
          if (n.kind === 'akceptacja') return h('div', { class: 'sign-note acc' }, h('small', {}, `Klient zaakceptował stanowisko${n.author ? ' – ' + n.author : ''} · ${new Date(n.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}`), 'Prosi o przygotowanie umowy do podpisu.');
          const office = n.from_client === false, when = new Date(n.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
          return h('div', { class: 'sign-note' + (office ? ' office' : '') }, h('small', {},
            office ? `Odpowiedź – ${n.author || 'biuro'} · ${when}${n.version > 1 ? ` · z wersją ${n.version}` : ''}` : `Uwagi klienta${n.author ? ' – ' + n.author : ''} · ${when}${n.version && r.version > 1 ? ` · do wersji ${n.version}` : ''}`,
            n.verdict ? h('span', { class: 'sign-vd ' + n.verdict }, { przyjete: 'przyjęte', czesciowo: 'częściowo', odrzucone: 'nieprzyjęte' }[n.verdict]) : null),
            !office && n.verdict && Array.isArray(n.points) && n.points.length ? h('div', {}, ...n.points.map(p => h('div', { class: 'sign-pt' },
              h('b', {}, (p.n || 'Uwaga') + (p.v ? ' – ' + { przyjete: 'przyjęte', czesciowo: 'częściowo', odrzucone: 'nieprzyjęte' }[p.v] : p.a === 'ok' ? ' – klient akceptuje' : '')),
              p.a === 'uwaga' && p.x ? h('div', {}, 'Klient: ' + p.x) : !p.a && p.n ? h('div', { class: 'muted' }, p.t.length > 160 ? p.t.slice(0, 160) + '…' : p.t) : !p.n ? h('div', {}, p.t) : null,
              p.c ? h('div', {}, 'Nasz komentarz: ' + p.c) : null))) : n.body);
        }));
    }) : [h('p', { class: 'hint' }, 'Nic nie wysłano jeszcze do podpisu.')]));
  }
  box.reload = load;
  load();
  return box;
}
export { esc as escHtml };

// ---------- wzór (projekt) umowy e-mailem – do zapoznania się, bez podpisu ----------
// PDF trafia do archiwum wysyłek; klient dostaje e-mail z przyciskiem „Pobierz PDF” (link ważny 30 dni, bez załącznika).
// opts: { client, target: { client_id } | { m2_client_id }, firm: 'rkdp'|'m2', title, buildPdf, word?: 'umowę'|'zlecenie' }
export function mailDraft(opts) {
  const { client, target, firm = 'rkdp', title } = opts;
  const word = opts.word || 'umowę';
  const s = { to: firstEmail(opts.email || client?.email), subject: `Projekt: ${title}` };
  s.body = `Dzień dobry,\n\nprzesyłamy projekt ${word === 'zlecenie' ? 'zlecenia' : 'umowy'} „${title}” do zapoznania się. Plik PDF pobiorą Państwo przyciskiem „Pobierz PDF” poniżej.\n\nJeśli mają Państwo uwagi albo pytania, prosimy o odpowiedź na tę wiadomość. Gdy treść będzie uzgodniona, prześlemy ${word === 'zlecenie' ? 'zlecenie' : 'umowę'} do podpisu.`;
  const grid = h('div', { class: 'form-grid' }, ...[['to', 'Do (e-mail klienta)', 'email'], ['subject', 'Temat', 'text'],
    ['body', `Treść – e-mail wyjdzie z rdp.app z logo ${firm === 'm2' ? 'M2 TAX' : 'RKDP'}, odpowiedź klienta wróci do Ciebie`, 'textarea']].map(([k, label, type]) => {
    const el = type === 'textarea' ? h('textarea', { class: 'input', rows: 11 }, s[k]) : h('input', { class: 'input', type, value: s[k] });
    el.addEventListener('input', () => { s[k] = el.value; });
    return h('label', { class: 'field wide' }, h('span', {}, label), el);
  }));
  let pdfP = null;
  const pdf = () => pdfP ||= opts.buildPdf().catch(e => { pdfP = null; throw e; });
  const fname = `Projekt – ${title}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 110) + '.pdf';
  const body = h('div', {},
    h('p', { class: 'small', style: { margin: '0 0 12px' } }, ...(client ? ['Klient: ', h('b', {}, client.name || '—')] : [h('b', {}, 'Bez klienta w bazie'), ' – wpisz e-mail odbiorcy']),
      ' · wzór do zapoznania się (bez podpisu). PDF do pobrania linkiem ważnym 30 dni – bez załącznika w e-mailu.'),
    grid,
    h('div', { class: 'row-btns', style: { marginTop: '8px' } },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async e => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const url = URL.createObjectURL(new Blob([await pdf()], { type: 'application/pdf' }));
          const a = h('a', { href: url, download: fname }); document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) { fail(err, 'Nie udało się przygotować PDF'); } finally { b.disabled = false; }
      } }, icon('download'), 'Podgląd PDF')),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Gdy klient zaakceptuje treść, użyj „Wyślij do podpisu”.'));
  modal('Wyślij wzór umowy', body, close => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    // sam link do pobrania PDF (30 dni) – do wysłania klientowi samodzielnie (SMS, WhatsApp, własny e-mail)
    h('button', { class: 'btn btn-outline btn-sm', 'data-tip': 'Utwórz link do pobrania PDF (ważny 30 dni) i skopiuj go – bez wysyłania e-maila z aplikacji', onclick: async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Przygotowuję…';
      try {
        const bytes = await pdf();
        const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'doc_mail', ...target, firm, no_email: true,
          attachment: { name: fname, base64: b64(bytes) }, doc: { title } } });
        if (error || r?.error) throw new Error(r?.detail || r?.error || error.message);
        let copied = false; try { await navigator.clipboard.writeText(r.link); copied = true; } catch { /* */ }
        close();
        modal('Link do wzoru umowy', h('div', {},
          h('p', { class: 'small', style: { margin: '0 0 10px' } }, copied ? 'Link skopiowany – wklej go klientowi. ' : 'Skopiuj link i wyślij go klientowi. ', `Klient pobierze PDF bez logowania; link działa do ${r.until}.`),
          h('input', { class: 'input', readonly: true, value: r.link, onfocus: ev => ev.target.select() })),
          c => [h('button', { class: 'btn btn-primary btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(r.link); toast('Skopiowano link'); } catch { toast('Zaznacz i skopiuj link ręcznie', true); } } }, 'Kopiuj link'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: c }, 'Zamknij')]);
      } catch (err) { fail(err, 'Nie udało się utworzyć linku'); b.disabled = false; b.textContent = 'Tylko link'; }
    } }, icon('paperclip'), 'Tylko link'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async e => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.to).trim())) return toast('Wpisz poprawny e-mail klienta', true);
      if (!s.subject.trim() || !s.body.trim()) return toast('Uzupełnij temat i treść', true);
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Przygotowuję PDF…';
      try {
        const bytes = await pdf();
        b.textContent = 'Wysyłam…';
        const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'doc_mail', ...target, firm, to: s.to.trim(), subject: s.subject.trim(), body: s.body,
          attachment: { name: fname, base64: b64(bytes) }, doc: { kicker: 'Projekt do zapoznania się', title } } });
        if (error || r?.error) throw new Error(r?.detail || r?.error || error.message);
        toast(`Wysłano wzór do ${s.to.trim()}`); close(); opts.onSent?.();
      } catch (err) { fail(err, 'Nie udało się wysłać e-maila'); b.disabled = false; b.textContent = 'Wyślij e-mail'; }
    } }, icon('mail'), 'Wyślij e-mail'),
  ]);
}
