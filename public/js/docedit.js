// Ręczna edycja treści umowy / zlecenia przed wysłaniem do podpisu.
// Działa na document.xml (Word): każdy akapit (także w tabelach) można poprawić, usunąć albo dodać nowy pod nim.
// Formatowanie akapitu (wyrównanie, wcięcia, odstępy) zostaje; poprawiony akapit dostaje jednolity krój pisma
// z jego głównego fragmentu (np. pogrubienie nagłówka § zostaje). Nieruszane akapity pozostają bez zmian.
import { h, modal, toast } from './ui.js';
import { sb } from './store.js';

// ---- zapamiętana treść poprawiona ręcznie (tabela doc_edits); „Od nowa” = xml null ----
export async function loadEdit(key) {
  if (!key) return null;
  const { data } = await sb.from('doc_edits').select('xml, updated_at, updated_by').eq('key', key).maybeSingle();
  return data?.xml ? data : null;
}
export async function saveEdit(key, xml, ids = {}) {
  if (!key) return;
  const { error } = await sb.from('doc_edits').upsert({ key, xml, ...ids, updated_at: new Date().toISOString() });
  if (error) throw error;
}
export const resetEdit = key => saveEdit(key, null);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const kids = (el, name) => [...el.childNodes].filter(n => n.nodeType === 1 && n.namespaceURI === W && n.localName === name);

// tekst akapitu: \t – tabulator, \n – nowa linia w akapicie
function paraText(p) {
  let t = '';
  p.querySelectorAll('*').forEach(n => {
    if (n.namespaceURI !== W) return;
    if (n.localName === 't') t += n.textContent;
    else if (n.localName === 'tab' && n.parentNode.localName === 'r') t += '\t';
    else if (n.localName === 'br' || n.localName === 'cr') t += '\n';
  });
  return t;
}
// krój głównego fragmentu (najdłuższy tekst) – używany dla całego poprawionego akapitu
function mainRPr(p) {
  let best = null, len = -1;
  p.querySelectorAll('*').forEach(r => {
    if (r.namespaceURI !== W || r.localName !== 'r') return;
    const l = [...r.childNodes].filter(n => n.localName === 't').reduce((a, n) => a + n.textContent.length, 0);
    if (l > len) { len = l; best = r; }
  });
  const rpr = best && kids(best, 'rPr')[0];
  return rpr ? rpr.cloneNode(true) : null;
}
function setText(doc, p, text, rpr) {
  [...p.childNodes].forEach(n => { if (!(n.nodeType === 1 && n.localName === 'pPr')) p.removeChild(n); });
  if (!text) return;
  const r = doc.createElementNS(W, 'w:r');
  if (rpr) r.appendChild(rpr.cloneNode(true));
  text.split('\n').forEach((line, i) => {
    if (i) r.appendChild(doc.createElementNS(W, 'w:br'));
    line.split('\t').forEach((part, j) => {
      if (j) r.appendChild(doc.createElementNS(W, 'w:tab'));
      if (part) { const t = doc.createElementNS(W, 'w:t'); t.setAttribute('xml:space', 'preserve'); t.textContent = part; r.appendChild(t); }
    });
  });
  p.appendChild(r);
}
const look = p => {
  const ppr = kids(p, 'pPr')[0], rpr = mainRPr(p);
  const jc = ppr && ppr.getElementsByTagNameNS(W, 'jc')[0]?.getAttributeNS(W, 'val');
  const b = rpr && [...rpr.childNodes].some(n => n.localName === 'b' && !['0', 'false'].includes(n.getAttributeNS(W, 'val')));
  return { center: jc === 'center', right: jc === 'right', bold: !!b, inTable: !!p.closest?.('tc') || p.parentNode?.localName === 'tc' };
};

// Okno edycji. Zwraca Promise<string|null> – nowy document.xml albo null (anulowano).
export function editDocumentXml(xml, { title = 'Edycja treści' } = {}) {
  return new Promise(resolve => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) { toast('Nie udało się odczytać dokumentu do edycji', true); return resolve(null); }
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const paras = [...body.getElementsByTagNameNS(W, 'p')];
    // wiersz edytora: { p, ta, orig, added }
    const rows = [];
    const list = h('div', { class: 'de-list' });
    const grow = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
    const mkRow = (p, text, added = false, ref = null) => {
      const L = look(ref || p);
      const ta = h('textarea', { class: 'de-ta' + (L.bold ? ' b' : '') + (L.center ? ' c' : L.right ? ' r' : ''), rows: 1, spellcheck: 'true', lang: 'pl' });
      ta.value = text;
      const row = { p, ta, orig: added ? null : text, added, ref, rpr: mainRPr(ref || p), removed: false };
      const el = h('div', { class: 'de-row' + (L.inTable ? ' tb' : '') + (added ? ' new' : '') }, ta,
        h('div', { class: 'de-acts' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm de-b', title: 'Dodaj nowy akapit pod tym', onclick: () => {
            const nr = mkRow(null, '', true, row.p || row.ref);
            nr.after = row;
            rows.splice(rows.indexOf(row) + 1, 0, nr);
            el.after(nr.el); nr.ta.focus();
          } }, '+ akapit'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm de-b', title: 'Usuń ten akapit', onclick: () => {
            row.removed = !row.removed; el.classList.toggle('del', row.removed); ta.disabled = row.removed;
            e_target(el).textContent = row.removed ? 'Przywróć' : 'Usuń';
          } }, 'Usuń')));
      const e_target = x => x.querySelector('.de-acts button:last-child');
      ta.addEventListener('input', () => { grow(ta); el.classList.toggle('chg', !row.added && ta.value !== row.orig); });
      row.el = el;
      return row;
    };
    paras.forEach(p => { const r = mkRow(p, paraText(p)); rows.push(r); list.append(r.el); });
    requestAnimationFrame(() => rows.forEach(r => grow(r.ta)));

    const apply = () => {
      let n = 0;
      // 1) nowe akapity (kopia ustawień akapitu, pod którym je dodano), 2) usunięte, 3) poprawione
      for (const r of rows) {
        if (!r.added || r.removed || !r.ta.value.trim()) continue;
        const np = doc.createElementNS(W, 'w:p');
        const ppr = r.ref && kids(r.ref, 'pPr')[0];
        if (ppr) np.appendChild(ppr.cloneNode(true));
        setText(doc, np, r.ta.value, r.rpr);
        const anchor = (r.after && r.after.p) || r.ref;
        anchor.parentNode.insertBefore(np, anchor.nextSibling);
        r.p = np; n++;
      }
      for (const r of rows) {
        if (r.added || !r.removed) continue;
        const par = r.p.parentNode;
        if (par.localName === 'tc' && kids(par, 'p').length === 1) setText(doc, r.p, '', null);   // komórka tabeli musi mieć akapit
        else par.removeChild(r.p);
        n++;
      }
      for (const r of rows) if (!r.added && !r.removed && r.ta.value !== r.orig) { setText(doc, r.p, r.ta.value, r.rpr); n++; }
      return n;
    };
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    modal(title, h('div', { class: 'de-wrap' },
      h('p', { class: 'small', style: { margin: '0 0 10px' } }, 'Popraw tekst bezpośrednio w akapitach. „+ akapit” dodaje nowy pod spodem, „Usuń” usuwa akapit. Poprawki zapiszą się przy tym dokumencie (także do pobrania PDF i kolejnych wysyłek); wzór umowy się nie zmienia. „Od nowa” wygeneruje dokument ze wzoru. Wyrównanie i wcięcia zostają; poprawiony akapit ma jednolity krój (np. cały pogrubiony nagłówek).'),
      list), close => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { close(); finish(null); } }, 'Anuluj'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
        const n = apply();
        close();
        if (!n) { toast('Bez zmian'); return finish(null); }
        finish(new XMLSerializer().serializeToString(doc));
      } }, 'Zapisz zmiany w treści'),
    ], { wide: true });
  });
}
