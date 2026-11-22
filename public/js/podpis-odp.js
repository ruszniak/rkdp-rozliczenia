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
    if (m) { m.classList.add('odp-ed-modal', 'odp-full'); m.style.maxWidth = ''; }
  });
}

// r: { id, title, email, firm, version, changes, status, notes: [...] }
// opts.final – „Wyślij do podpisu” po uzgodnieniach: e-mail „umowa czeka na podpis” (z nową wersją albo bez zmian)
export async function replyDialog(r, onDone, opts = {}) {
  const final = !!opts.final;
  const { data: full, error } = await sb.from('sign_requests').select('doc_html').eq('id', r.id).maybeSingle();
  if (error) return fail(error);
  const oldHtml = full?.doc_html ? fullDoc(full.doc_html) : '';
  const ver = r.version || 1, next = ver + 1;
  const notes = (r.notes || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pending = notes.filter(n => n.from_client !== false && !n.verdict);
  const verdict = {};
  // treść odpowiedzi – szablon odświeża się po wyborze oceny, dopóki nie zaczniesz pisać sam
  let touched = false;
  const ta = h('textarea', { class: 'input odp-ta', rows: 12 });

  // podział długiej uwagi na punkty: akapity; nowy punkt zaczyna się od „1.”, „2)”, „§ 5”… (można dzielić i łączyć ręcznie)
  const paras = n => n.body.replace(/\r/g, '').split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
  const isHead = t => /^(\d{1,2}[.)]\s|§\s*\d|[a-z][.)]\s)/i.test(t);
  const split = {};   // id uwagi → { on, cuts: Set(indeksów akapitów rozpoczynających punkt), v: {start: werdykt}, c: {start: komentarz} }
  pending.forEach(n => {
    const ps = paras(n); const cuts = new Set([0]); ps.forEach((t, i) => { if (i && isHead(t)) cuts.add(i); });
    split[n.id] = { on: cuts.size >= 2, cuts, v: {}, c: {}, ps, wc: '' };
    if (Array.isArray(n.points) && n.points.some(p => p.a)) split[n.id].follow = n.points;   // odpowiedź klienta do punktów poprzedniego stanowiska
  });
  const groups = sp => { const st = [...sp.cuts].sort((x, y) => x - y); return st.map((s0, k) => ({ start: s0, items: sp.ps.slice(s0, st[k + 1] ?? sp.ps.length) })); };
  const titleOf = t => { const l = t.split('\n')[0].trim(); return l.length > 90 ? l.slice(0, 90) + '…' : l; };
  const ptName = (g, k, gs) => {
    if (!isHead(g.items[0])) return k === 0 ? 'Wstęp' : k === gs.length - 1 ? 'Zakończenie' : 'Fragment';
    const m = g.items[0].match(/^(\d{1,2})[.)]\s/); return 'Punkt ' + (m ? m[1] : gs.slice(0, k + 1).filter(x => isHead(x.items[0])).length);
  };
  const agg = vs => !vs.length ? undefined : vs.every(x => x === 'przyjete') ? 'przyjete' : vs.every(x => x === 'odrzucone') ? 'odrzucone' : 'czesciowo';
  // punkty do zapisania przy uwadze – klient zobaczy ocenę i komentarz bezpośrednio pod każdym punktem
  const notePoints = n => {
    const sp = split[n.id];
    if (sp.follow) return sp.follow.map((p, i) => ({ ...p, v: p.a === 'uwaga' ? sp.v[i] : undefined, c: p.a === 'uwaga' ? (sp.c[i] || '').trim() : undefined }));
    if (!sp.on) return verdict[n.id] || sp.wc.trim() ? [{ n: '', t: n.body, v: verdict[n.id], c: sp.wc.trim() }] : null;
    const gs = groups(sp);
    return gs.map((g, k) => ({ n: ptName(g, k, gs), t: g.items.join('\n\n'), v: sp.v[g.start], c: (sp.c[g.start] || '').trim() }));
  };
  const noteVerdict = n => {
    const sp = split[n.id];
    if (sp?.follow) return agg(sp.follow.map((p, i) => p.a === 'uwaga' ? sp.v[i] : null).filter(Boolean));
    if (!sp?.on) return verdict[n.id];
    const vs = groups(sp).map(g => sp.v[g.start]).filter(Boolean);
    return agg(vs);
  };
  const tpl = () => `Dzień dobry,\n\ndziękujemy za uwagi do dokumentu. Nasze stanowisko jest przy każdym punkcie Państwa uwag.\n\nW razie pytań jesteśmy do dyspozycji.`;
  ta.value = final ? 'Dziękujemy za uzgodnienia. Umowa czeka na Państwa podpis.' : tpl();
  if (final) touched = true;
  ta.addEventListener('input', () => { touched = true; });
  const refresh = () => { if (!touched) ta.value = tpl(); };

  const vButtons = (get, set) => {
    const btns = VERDICTS.map(([k, label]) => h('button', { class: 'btn btn-ghost btn-sm odp-v' + (get() === k ? ' on' : ''), type: 'button', 'data-v': k, onclick: () => {
      set(get() === k ? undefined : k); btns.forEach(b => b.classList.toggle('on', b.dataset.v === get())); refresh();
    } }, label));
    return h('div', { class: 'row-btns odp-vs' }, ...btns);
  };
  const comment = (get, set, ph) => { const inp = h('input', { class: 'input odp-c', placeholder: ph, value: get() || '' }); inp.addEventListener('input', () => set(inp.value)); return inp; };
  const renderPending = (n, host) => {
    const sp = split[n.id];
    if (sp.follow) {   // klient odpowiedział do punktów poprzedniego stanowiska – oceniasz punkty z nową uwagą
      host.replaceChildren(h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, 'Odpowiedź klienta do punktów Twojego stanowiska – oceń punkty, przy których ma uwagi.'),
        ...sp.follow.map((p, i) => h('div', { class: 'odp-pt' + (p.a === 'ok' ? ' v-przyjete' : sp.v[i] ? ' v-' + sp.v[i] : '') },
          h('div', { class: 'odp-pt-h' }, h('b', {}, p.n || 'Uwaga'), p.pv ? h('span', { class: 'odp-vd' }, 'było: ' + VERDICT_WORD[p.pv]) : null),
          h('div', { class: 'odp-b small muted' }, short(p.t)),
          p.pc ? h('div', { class: 'odp-b small' }, 'Nasz komentarz: ' + p.pc) : null,
          p.a === 'ok' ? h('div', { class: 'odp-b' }, h('b', {}, 'Klient akceptuje stanowisko.'))
            : [h('div', { class: 'odp-b first' }, h('b', {}, 'Klient: '), p.x || ''),
              vButtons(() => sp.v[i], v => { sp.v[i] = v; renderPending(n, host); }),
              comment(() => sp.c[i], v => { sp.c[i] = v; }, 'Komentarz do punktu (opcjonalnie)')])));
      return;
    }
    if (!sp.on) {
      host.replaceChildren(h('div', { class: 'odp-b' }, n.body),
        h('div', { class: 'odp-tools' }, vButtons(() => verdict[n.id], v => { verdict[n.id] = v; }),
          sp.ps.length > 1 ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { sp.on = true; renderPending(n, host); refresh(); } }, '✂ Podziel na punkty') : null),
        comment(() => sp.wc, v => { sp.wc = v; }, 'Komentarz do uwagi (opcjonalnie) – klient zobaczy go pod uwagą'));
      return;
    }
    const gs = groups(sp);
    host.replaceChildren(
      h('div', { class: 'odp-tools' }, h('span', { class: 'small muted' }, `Podzielone na ${gs.length} ${gs.length === 1 ? 'punkt' : gs.length < 5 ? 'punkty' : 'punktów'} – oceń każdy osobno. „✂” dzieli punkt w tym miejscu, „Połącz” scala z poprzednim.`),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { sp.on = false; renderPending(n, host); refresh(); } }, 'Cała uwaga naraz')),
      ...gs.map((g, k) => h('div', { class: 'odp-pt' + (sp.v[g.start] ? ' v-' + sp.v[g.start] : '') },
        h('div', { class: 'odp-pt-h' }, h('b', {}, ptName(g, k, gs)),
          k ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { sp.cuts.delete(g.start); renderPending(n, host); refresh(); } }, '⤒ Połącz z poprzednim') : null),
        ...g.items.map((t, j) => [
          j ? h('button', { class: 'odp-cut', type: 'button', title: 'Zacznij tu nowy punkt', onclick: () => { sp.cuts.add(g.start + j); renderPending(n, host); refresh(); } }, '✂ podziel tutaj') : null,
          h('div', { class: 'odp-b' + (j === 0 ? ' first' : '') }, t)]).flat(),
        vButtons(() => sp.v[g.start], v => { sp.v[g.start] = v; renderPending(n, host); }),
        (() => { const inp = h('input', { class: 'input odp-c', placeholder: 'Komentarz do punktu (opcjonalnie) – np. proponujemy 2 miesiące', value: sp.c[g.start] || '' });
          inp.addEventListener('input', () => { sp.c[g.start] = inp.value; refresh(); }); return inp; })())));
  };

  const pointsView = pts => pts.map(p => h('div', { class: 'odp-pt' + (p.v ? ' v-' + p.v : p.a === 'ok' ? ' v-przyjete' : '') },
    h('div', { class: 'odp-pt-h' }, h('b', {}, p.n || 'Uwaga'), p.v ? h('span', { class: 'odp-vd' }, VERDICT_WORD[p.v]) : null),
    p.a ? h('div', { class: 'odp-b small muted' }, short(p.t)) : h('div', { class: 'odp-b' }, p.t),
    p.a ? h('div', { class: 'odp-b' }, h('b', {}, 'Klient: '), p.a === 'ok' ? 'akceptuje stanowisko.' : p.x || '') : null,
    p.c ? h('div', { class: 'odp-b' }, h('b', {}, 'Nasz komentarz: '), p.c) : null));
  const thread = h('div', { class: 'odp-thread' }, ...notes.map(n => {
    const office = n.from_client === false;
    const row = h('div', { class: 'odp-n' + (office ? ' office' : '') },
      h('small', {}, `${office ? (n.author || 'Biuro') : 'Klient' + (n.author ? ' – ' + n.author : '')} · ${dt(n.created_at)}${n.version ? ` · ${office ? 'wersja' : 'do wersji'} ${n.version}` : ''}`,
        n.verdict ? h('span', { class: 'odp-vd' }, VERDICT_WORD[n.verdict]) : null));
    if (!office && !n.verdict && n.kind !== 'akceptacja') { const host = h('div'); row.append(host); renderPending(n, host); }
    else if (!office && Array.isArray(n.points) && n.points.length) row.append(...pointsView(n.points));
    else row.append(h('div', { class: 'odp-b' }, n.body));
    return row;
  }));

  // nowa wersja
  let mode = 'none', newHtml = null, newBytes = null, autoChanges = '';
  const changes = h('input', { class: 'input', maxlength: 2000, placeholder: 'np. § 12 ust. 2 – okres wypowiedzenia 2 miesiące' });
  const verInfo = h('p', { class: 'small', hidden: true });
  const changesBox = h('label', { class: 'field wide', hidden: true }, h('span', {}, 'Co się zmieniło (klient zobaczy to nad treścią)'), changes);
  const sendLabel = has => final ? (has ? `Wyślij wersję ${next} do podpisu` : 'Wyślij do podpisu (bez zmian)') : has ? `Wyślij odpowiedź i wersję ${next}` : 'Wyślij odpowiedź';
  const sendBtn = h('button', { class: 'btn btn-primary btn-sm' }, icon('mail'), sendLabel(false));
  const setMode = m => {
    mode = m;
    modeBtns.forEach(b => b.classList.toggle('on', b.dataset.m === m));
    const has = m !== 'none' && (newHtml || newBytes);
    changesBox.hidden = !has; verInfo.hidden = !has;
    sendBtn.replaceChildren(icon('mail'), sendLabel(has));
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

  const body = h('div', { class: 'odp odp-grid' },
    h('div', { class: 'odp-left' },
      h('p', { class: 'small', style: { margin: '0 0 6px' } }, h('b', {}, r.title), ` · wersja ${ver} · ${r.email ? 'odpowiedź pójdzie na ' + r.email : 'prośba bez e-maila – odpowiedź pojawi się na stronie, link wyślesz sam'}`),
      h('h4', { class: 'odp-h' }, 'Rozmowa z klientem'),
      pending.length ? h('p', { class: 'hint', style: { margin: '0 0 8px' } }, 'Przy każdej uwadze (albo każdym punkcie) zaznacz: przyjmuję / częściowo / nie przyjmuję i dopisz komentarz. Klient zobaczy to pod każdym punktem i przy każdym kliknie „Akceptuję” albo „Mam uwagę”.') : null,
      thread),
    h('div', { class: 'odp-right' },
    h('label', { class: 'field wide' }, h('span', {}, final ? 'Wiadomość na stronie umowy (klient dostanie e-mail „umowa czeka na podpis” z linkiem)' : 'Wiadomość nad stanowiskiem – ocenę i komentarz każdego punktu klient zobaczy bezpośrednio pod tym punktem (e-mail: krótka informacja i link)'), ta),
    h('h4', { class: 'odp-h' }, 'Nowa wersja dokumentu (opcjonalnie)'),
    h('div', { class: 'row-btns' }, ...modeBtns),
    verInfo, changesBox,
    h('p', { class: 'hint', style: { marginTop: '6px' } }, 'Nowa wersja trafia pod ten sam link – klient zobaczy zaznaczone zmiany i podpisze tylko najnowszą. Poprzednia zostaje w historii.')));

  modal(final ? 'Wyślij umowę do podpisu' : 'Odpowiedz na uwagi', body, close => {
    sendBtn.onclick = async () => {
      const text = ta.value.trim();
      if (!final && text.length < 2) return toast('Wpisz odpowiedź dla klienta', true);
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
        const { data: x, error: e } = await sb.functions.invoke('podpis', { body: { action: 'reply', id: r.id, text, final,
          verdicts: pending.map(n => ({ id: n.id, verdict: noteVerdict(n), points: notePoints(n) })).filter(x => x.verdict), version } });
        if (e || x?.error) throw new Error(x?.detail || x?.error || e.message);
        close();
        if (x.mail_error) toast('Odpowiedź zapisana, ale e-mail się nie wysłał – skopiuj link i wyślij klientowi', true);
        else toast(r.email ? `Wysłano ${final ? 'do podpisu' : 'odpowiedź'}${version ? ` i wersję ${x.version}` : ''}: ${r.email}` : 'Zapisano odpowiedź – wyślij klientowi link');
        if (!r.email || x.mail_error) { try { await navigator.clipboard.writeText(x.link); } catch { /* */ } }
        onDone?.(x);
      } catch (err) { fail(err, 'Nie udało się wysłać odpowiedzi'); sendBtn.disabled = false; setMode(mode); }
    };
    return [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), sendBtn];
  }, { wide: true });
  const bs = document.querySelectorAll('.modal-back'), m = bs[bs.length - 1]?.firstChild;
  if (m) { m.classList.add('odp-full'); m.style.maxWidth = ''; }
}
