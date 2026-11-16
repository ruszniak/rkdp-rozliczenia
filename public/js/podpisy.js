// Wysyłka dokumentu do podpisu przez klienta (link /podpis/?t=…) i panel „Do podpisu” ze statusem i uwagami klienta.
// Wspólne dla: umowy księgowej RKDP, ZUS PEL (karta klienta RKDP), zlecenia i umowy doradczej (M2 TAX / RKDP),
// umowy z biurem rachunkowym (Program Partner M2 TAX).
import { h, icon, toast, fail, modal } from './ui.js';
import { sb } from './store.js';
import { docxToHtml } from './docx.js';

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const firstEmail = v => String(v || '').split(/[;,\s]+/).find(x => x.includes('@')) || '';

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
//         editable?: { xml: document.xml, pdf: xml => Promise<Uint8Array>, preview: xml => string } – „Edytuj treść” przed wysyłką }
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
    ['body', 'Treść – {link} zamieni się na link do strony podpisu (pod spodem dopisze się Twoja stopka)', 'textarea']].map(([k, label, type]) => {
    const el = type === 'textarea' ? h('textarea', { class: 'input', rows: 13 }, s[k]) : h('input', { class: 'input', type, value: s[k] });
    el.addEventListener('input', () => { s[k] = el.value; });
    return h('label', { class: 'field wide' }, h('span', {}, label), el);
  }));
  let pdfP = null;
  const editedBox = h('span', { hidden: true });
  const markEdited = () => { editedBox.hidden = !editedXml; editedBox.replaceChildren(h('span', { class: 'sign-edited' }, 'Treść zmieniona ręcznie',
    h('button', { class: 'btn btn-ghost btn-sm de-b', type: 'button', onclick: () => { if (!confirm('Przywrócić treść z wzoru (bez Twoich zmian)?')) return; editedXml = null; pdfP = null; markEdited(); } }, 'Przywróć oryginał'))); };
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
      editable ? h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Popraw treść dokumentu tylko dla tej wysyłki (wzór się nie zmienia)', onclick: async () => {
        const { editDocumentXml } = await import('./docedit.js');
        const x = await editDocumentXml(editedXml || editable.xml, { title: 'Edytuj treść – ' + (s.title || 'dokument') });
        if (x == null) return;
        editedXml = x; pdfP = null; markEdited();
        toast('Zmieniono treść – sprawdź „Podgląd PDF” przed wysłaniem');
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
export function signPanel(filter, { title = 'Do podpisu', emptyHidden = true } = {}) {
  const box = h('div', { class: 'sign-box', hidden: true });
  const d = v => v ? new Date(v).toLocaleDateString('pl-PL') : '';
  async function open(r, which) {
    const { data, error } = await sb.functions.invoke('podpis', { body: { action: 'file', id: r.id, which } });
    if (error || data?.error || !data?.url) return fail(error || new Error(data?.error || 'Brak pliku'));
    window.open(data.url, '_blank', 'noopener');
  }
  async function load() {
    let q = sb.from('sign_requests').select('id, title, email, status, token, kind, created_at, opened_at, signed_at, expires_at, sign_notes(body, author, created_at)');
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(12);
    if (error || (!data?.length && emptyHidden)) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(h('h3', {}, title), ...(data.length ? data.map(r => {
      const expired = r.status === 'wyslano' && new Date(r.expires_at) < new Date();
      const notes = (r.sign_notes || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const [label, cls] = r.status === 'podpisano' ? ['podpisano ' + d(r.signed_at), 'ok'] : r.status === 'anulowano' ? ['anulowano', 'off']
        : expired ? ['link wygasł', 'off'] : notes.length ? ['uwagi klienta', 'warn'] : r.opened_at ? ['otwarto ' + d(r.opened_at), 'info'] : ['wysłano ' + d(r.created_at), 'info'];
      const link = `${location.origin}/podpis/?t=${r.token}`;
      const active = r.status === 'wyslano' && !expired;
      return h('div', { class: 'sign-row' },
        h('div', { class: 'sign-top' },
          h('div', { class: 'sign-t' }, h('b', {}, r.title), h('span', { class: 'small muted' }, ` · ${r.email || 'link skopiowany'} · ${d(r.created_at)}`)),
          h('span', { class: 'sign-st ' + cls }, label),
          h('span', { class: 'row-btns' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => open(r, 'original') }, 'PDF'),
            r.status === 'podpisano' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => open(r, 'signed') }, 'Podpisany plik') : null,
            active ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Skopiowano link do podpisu'); } catch { prompt('Link do podpisu:', link); } } }, 'Kopiuj link') : null,
            active ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
              if (!confirm(`Anulować prośbę o podpis „${r.title}”? Link u klienta przestanie działać.`)) return;
              const { data: x, error: e } = await sb.functions.invoke('podpis', { body: { action: 'cancel', id: r.id } });
              if (e || x?.error) return fail(e || new Error(x.error));
              toast('Anulowano prośbę o podpis'); load();
            } }, 'Anuluj') : null)),
        ...notes.map(n => h('div', { class: 'sign-note' }, h('small', {}, `Uwagi klienta${n.author ? ' – ' + n.author : ''} · ${new Date(n.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}`), n.body)));
    }) : [h('p', { class: 'hint' }, 'Nic nie wysłano jeszcze do podpisu.')]));
  }
  box.reload = load;
  load();
  return box;
}
export { esc as escHtml };
