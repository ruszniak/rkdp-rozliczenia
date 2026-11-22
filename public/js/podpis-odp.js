// Odpowiedź biura na uwagi klienta do dokumentu wysłanego do podpisu + opcjonalnie nowa wersja pod tym samym linkiem.
// Klient widzi odpowiedź na stronie /podpis/ (z oceną każdej uwagi) i dostaje e-mail; w nowej wersji zmiany są zaznaczone w treści.
// Odpowiadać mogą: klienci RKDP – administrator (Michał), klienci M2 TAX – administrator i Marcin.
import { h, icon, toast, fail, modal } from './ui.js';
import { sb, state } from './store.js';
import { rkdpContractPreview, pdfPagesHtml } from './podpisy.js';

const M2_REPLY = ['c66817f8-61a2-4605-a503-07cbcf9d47d5'];
export const canReply = r => state.me?.role === 'admin' || (r.firm === 'm2' && M2_REPLY.includes(state.me?.id));
export const VERDICTS = [['przyjete', 'Przyjmuję'], ['czesciowo', 'Częściowo'], ['odrzucone', 'Nie przyjmuję']];
export const VERDICT_WORD = { przyjete: 'przyjęte', czesciowo: 'częściowo przyjęte', odrzucone: 'nieprzyjęte' };
const b64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const dt = v => new Date(v).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
const short = t => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 70 ? s.slice(0, 70) + '…' : s; };

let diffP = null;
export function loadDiff() {
  const url = '/podpis/diff.js';   // zmienna – bundler nie dołącza pliku (wspólny ze stroną klienta)
  return diffP ||= import(/* @vite-ignore */ url).then(() => window.DocDiff);
}
const fullDoc = html => /^<!doctype/i.test(html || '') ? html : rkdpContractPreview(html || '');
const editableDoc = html => { if (!html) return false; const d = new DOMParser().parseFromString(html, 'text/html'); const p = d.querySelector('.paper'); return !!(p && p.textContent.trim().length > 40); };
// wersja do druku: biała kartka A4 bez cienia (jak umowa wygenerowana w aplikacji)
const printable = html => html.replace(/<\/head>/i, '<style>body{background:#fff!important}.paper{max-width:none!important;margin:0!important;padding:0!important;box-shadow:none!important;border-radius:0!important}@page{size:A4;margin:18mm 20mm}</style></head>');

// edycja treści w kartce dokumentu (bez skryptów, tylko tekst); zwraca pełny HTML albo null
// przejście w treści do paragrafu wskazanego w uwadze (np. „§ 9 ust. 8”) i podświetlenie go
function goTo(doc, para) {
  if (!doc) return false;
  const want = para.replace(/\s+/g, ' ').trim();
  const els = [...doc.querySelectorAll('.paper > *, .paper p, .paper div, .paper h1, .paper h2, .paper h3')];
  const hit = els.find(e => e.textContent.replace(/\s+/g, ' ').trim() === want) || els.find(e => e.textContent.replace(/\s+/g, ' ').trim().startsWith(want + ' ') || e.textContent.replace(/\s+/g, ' ').trim().startsWith(want + '.'));
  if (!hit) return false;
  hit.scrollIntoView({ behavior: 'smooth', block: 'start' });
  hit.style.transition = 'background .3s'; hit.style.background = '#FEF3C7'; setTimeout(() => { hit.style.background = ''; }, 1800);
  return true;
}

function editText(html, title, notes = []) {
  return new Promise(resolve => {
    const frame = h('iframe', { class: 'odp-edit', title: 'Treść dokumentu', sandbox: 'allow-same-origin' });
    frame.srcdoc = html;
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument; if (!doc) return;
      const p = doc.querySelector('.paper') || doc.body;
      p.setAttribute('contenteditable', 'true'); p.setAttribute('spellcheck', 'true');
      const st = doc.createElement('style'); st.id = 'odp-ed'; st.textContent = '.paper{outline:none}.paper:focus{box-shadow:0 0 0 3px rgba(37,99,235,.35)}'; doc.head.append(st);
    }, { once: true });
    let done = false;
    // uwagi klienta obok treści – widać, co poprawić; „§ 9” przenosi do paragrafu
    const side = notes.length ? h('aside', { class: 'odp-side' }, h('b', {}, 'Uwagi klienta'),
      ...notes.map(n => {
        const office = n.from_client === false;
        const paras = [...new Set((n.body.match(/§\s*\d+[a-z]?/gi) || []).map(x => x.replace(/\s+/, ' ')))];
        return h('div', { class: 'odp-n' + (office ? ' office' : '') },
          h('small', {}, `${office ? (n.author || 'Biuro') : 'Klient' + (n.author ? ' – ' + n.author : '')} · ${dt(n.created_at)}`, n.verdict ? h('span', { class: 'odp-vd' }, VERDICT_WORD[n.verdict]) : null),
          h('div', { class: 'odp-b' }, n.body),
          paras.length ? h('div', { class: 'row-btns odp-go' }, ...paras.map(pp => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { if (!goTo(frame.contentDocument, pp)) toast(`Nie znalazłem „${pp}” w treści`, true); } }, `Przejdź do ${pp}`))) : null);
      })) : null;
    modal(title, h('div', {},
      h('p', { class: 'small', style: { margin: '0 0 8px' } }, 'Kliknij w tekst i popraw go jak w edytorze. Po zapisaniu zmiany zaznaczą się klientowi automatycznie (dodane i usunięte słowa).'),
      h('div', { class: 'odp-ed-wrap' + (side ? ' with-side' : '') }, frame, side)), close => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { close(); if (!done) { done = true; resolve(null); } } }, 'Anuluj'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
        const doc = frame.contentDocument; if (!doc) return;
        const p = doc.querySelector('[contenteditable]'); p?.removeAttribute('contenteditable'); p?.removeAttribute('spellcheck'); doc.getElementById('odp-ed')?.remove();
        const out = '<!doctype html>' + doc.documentElement.outerHTML;
        done = true; close(); resolve(out);
      } }, 'Zapisz treść'),
    ], { wide: true });
    const bs = document.querySelectorAll('.modal-back'), m = bs[bs.length - 1]?.firstChild;
    if (m) { m.classList.add('odp-ed-modal'); m.style.maxWidth = side ? '1440px' : '1100px'; }
  });
}

// r: { id, title, email, firm, version, changes, status, notes: [...] }
export async function replyDialog(r, onDone) {
  const { data: full, error } = await sb.from('sign_requests').select('doc_html').eq('id', r.id).maybeSingle();
  if (error) return fail(error);
  const oldHtml = full?.doc_html ? fullDoc(full.doc_html) : '';
  const ver = r.version || 1, next = ver + 1;
  const notes = (r.notes || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pending = notes.filter(n => n.from_client !== false && !n.verdict);
  const verdict = {};
  // treść odpowiedzi – szablon odświeża się po wyborze oceny, dopóki nie zaczniesz pisać sam
  let touched = false;
  const ta = h('textarea', { class: 'input', rows: 9 });
  const tpl = () => {
    const lines = pending.filter(n => verdict[n.id]).map(n => `– „${short(n.body)}” – ${VERDICT_WORD[verdict[n.id]]}.`);
    return `Dzień dobry,\n\ndziękujemy za uwagi do dokumentu.${lines.length ? ' Nasze stanowisko:\n' + lines.join('\n') : '\n'}\n\nW razie pytań jesteśmy do dyspozycji.`;
  };
  ta.value = tpl();
  ta.addEventListener('input', () => { touched = true; });
  const refresh = () => { if (!touched) ta.value = tpl(); };

  const thread = h('div', { class: 'odp-thread' }, ...notes.map(n => {
    const office = n.from_client === false;
    const row = h('div', { class: 'odp-n' + (office ? ' office' : '') },
      h('small', {}, `${office ? (n.author || 'Biuro') : 'Klient' + (n.author ? ' – ' + n.author : '')} · ${dt(n.created_at)}${n.version ? ` · ${office ? 'wersja' : 'do wersji'} ${n.version}` : ''}`,
        n.verdict ? h('span', { class: 'odp-vd' }, VERDICT_WORD[n.verdict]) : null),
      h('div', { class: 'odp-b' }, n.body));
    if (!office && !n.verdict) {
      const btns = VERDICTS.map(([k, label]) => h('button', { class: 'btn btn-ghost btn-sm odp-v', type: 'button', 'data-v': k, onclick: () => {
        verdict[n.id] = verdict[n.id] === k ? undefined : k;
        btns.forEach(b => b.classList.toggle('on', b.dataset.v === verdict[n.id])); refresh();
      } }, label));
      row.append(h('div', { class: 'row-btns odp-vs' }, ...btns));
    }
    return row;
  }));

  // nowa wersja
  let mode = 'none', newHtml = null, newBytes = null, autoChanges = '';
  const changes = h('input', { class: 'input', maxlength: 2000, placeholder: 'np. § 12 ust. 2 – okres wypowiedzenia 2 miesiące' });
  const verInfo = h('p', { class: 'small', hidden: true });
  const changesBox = h('label', { class: 'field wide', hidden: true }, h('span', {}, 'Co się zmieniło (klient zobaczy to nad treścią)'), changes);
  const sendBtn = h('button', { class: 'btn btn-primary btn-sm' }, icon('mail'), 'Wyślij odpowiedź');
  const setMode = m => {
    mode = m;
    modeBtns.forEach(b => b.classList.toggle('on', b.dataset.m === m));
    const has = m !== 'none' && (newHtml || newBytes);
    changesBox.hidden = !has; verInfo.hidden = !has;
    sendBtn.replaceChildren(icon('mail'), has ? `Wyślij odpowiedź i wersję ${next}` : 'Wyślij odpowiedź');
  };
  const pickEdit = async () => {
    const x = await editText(newHtml && mode === 'edit' ? newHtml : oldHtml, `Wersja ${next} – edytuj treść`, notes);
    if (x == null) return;
    newHtml = x; newBytes = null;
    try {
      const D = await loadDiff(); const m = D.mark(x, oldHtml);
      if (!m.count) { toast('Treść się nie zmieniła'); newHtml = null; return setMode('none'); }
      autoChanges = m.labels.length ? 'Zmienione: ' + m.labels.join(', ') + '.' : '';
      if (!changes.value.trim() || changes.dataset.auto === '1') { changes.value = autoChanges; changes.dataset.auto = '1'; }
      verInfo.textContent = `Wersja ${next}: zmienione fragmenty – ${m.count}${m.labels.length ? ' (' + m.labels.join(', ') + ')' : ''}. Klient zobaczy je zaznaczone w treści.`;
    } catch (e) { console.warn('diff', e); verInfo.textContent = `Wersja ${next} gotowa.`; }
    setMode('edit');
  };
  const pickPdf = () => {
    const inp = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast('Wybierz plik PDF (dokument z Worda zapisz najpierw jako PDF)', true);
      if (f.size > 10 * 1048576) return toast('Plik jest większy niż 10 MB', true);
      newBytes = new Uint8Array(await f.arrayBuffer()); newHtml = null;
      toast('Przygotowuję podgląd dokumentu…');
      try { newHtml = await pdfPagesHtml(newBytes.slice()); } catch (e) { console.warn('podgląd PDF', e); }
      if (changes.dataset.auto === '1') { changes.value = ''; changes.dataset.auto = ''; }
      verInfo.textContent = `Wersja ${next}: ${f.name}. Przy pliku PDF zmian nie da się zaznaczyć automatycznie – opisz je poniżej.`;
      setMode('pdf'); changes.focus();
    });
    document.body.append(inp); inp.click();
  };
  changes.addEventListener('input', () => { changes.dataset.auto = ''; });
  const modeBtns = [
    h('button', { class: 'btn btn-ghost btn-sm odp-m on', type: 'button', 'data-m': 'none', onclick: () => { newHtml = null; newBytes = null; setMode('none'); } }, 'Bez nowej wersji'),
    editableDoc(oldHtml) ? h('button', { class: 'btn btn-ghost btn-sm odp-m', type: 'button', 'data-m': 'edit', onclick: pickEdit }, icon('file'), `Wersja ${next}: edytuj treść`) : null,
    h('button', { class: 'btn btn-ghost btn-sm odp-m', type: 'button', 'data-m': 'pdf', onclick: pickPdf }, icon('file'), `Wersja ${next}: wgraj PDF`),
  ].filter(Boolean);

  const body = h('div', { class: 'odp' },
    h('p', { class: 'small', style: { margin: '0 0 10px' } }, h('b', {}, r.title), ` · wersja ${ver} · ${r.email ? 'odpowiedź pójdzie na ' + r.email : 'prośba bez e-maila – odpowiedź pojawi się na stronie, link wyślesz sam'}`),
    h('h4', { class: 'odp-h' }, 'Rozmowa z klientem'), thread,
    pending.length ? h('p', { class: 'hint', style: { margin: '4px 0 10px' } }, 'Przy każdej uwadze zaznacz: przyjmuję / częściowo / nie przyjmuję – klient zobaczy ocenę przy swojej uwadze.') : null,
    h('label', { class: 'field wide' }, h('span', {}, 'Twoja odpowiedź (klient zobaczy ją na stronie dokumentu i dostanie e-mail; stopka dopisze się sama)'), ta),
    h('h4', { class: 'odp-h' }, 'Nowa wersja dokumentu (opcjonalnie)'),
    h('div', { class: 'row-btns' }, ...modeBtns),
    verInfo, changesBox,
    h('p', { class: 'hint', style: { marginTop: '6px' } }, 'Nowa wersja trafia pod ten sam link – klient zobaczy zaznaczone zmiany i podpisze tylko najnowszą. Poprzednia zostaje w historii.'));

  modal('Odpowiedz na uwagi', body, close => {
    sendBtn.onclick = async () => {
      const text = ta.value.trim();
      if (text.length < 2) return toast('Wpisz odpowiedź dla klienta', true);
      const withVer = mode !== 'none' && (newHtml || newBytes);
      if (withVer && !changes.value.trim()) return toast('Opisz krótko, co się zmieniło w nowej wersji', true);
      sendBtn.disabled = true;
      try {
        let version = null;
        if (withVer) {
          sendBtn.textContent = 'Przygotowuję PDF…';
          let bytes = newBytes;
          if (!bytes) { const { buildPdf } = await import('./pdfdoc.js'); bytes = await buildPdf(printable(newHtml), `${r.title} – wersja ${next}`); }
          version = { attachment: { base64: b64(bytes) }, doc_html: newHtml || null, changes: changes.value.trim() };
        }
        sendBtn.textContent = 'Wysyłam…';
        const { data: x, error: e } = await sb.functions.invoke('podpis', { body: { action: 'reply', id: r.id, text,
          verdicts: Object.entries(verdict).filter(([, v]) => v).map(([id, v]) => ({ id, verdict: v })), version } });
        if (e || x?.error) throw new Error(x?.detail || x?.error || e.message);
        close();
        if (x.mail_error) toast('Odpowiedź zapisana, ale e-mail się nie wysłał – skopiuj link i wyślij klientowi', true);
        else toast(r.email ? `Wysłano odpowiedź${version ? ` i wersję ${x.version}` : ''}: ${r.email}` : 'Zapisano odpowiedź – wyślij klientowi link');
        if (!r.email || x.mail_error) { try { await navigator.clipboard.writeText(x.link); } catch { /* */ } }
        onDone?.(x);
      } catch (err) { fail(err, 'Nie udało się wysłać odpowiedzi'); sendBtn.disabled = false; setMode(mode); }
    };
    return [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), sendBtn];
  }, { wide: true });
}
