// Archiwum współpracy z klientem: umowy, pełnomocnictwa, dokumenty rejestrowe, AML/KYC, korespondencja – niezależnie
// od miesięcznych rozliczeń. Pliki z komputera (przeciągnij / wklej) albo zdjęcia z telefonu; kilka zdjęć stron można
// złożyć w jeden PDF (np. podpisana umowa). Dostęp jak do klienta (RLS + prywatny koszyk „klienci”).
import { h, icon, toast, fail, modal } from './ui.js';
import { sb, state } from './store.js';
import { fileTile, dropZone, pastedFiles, named, safeName } from './views/zgloszenia.js';

export const ARCH_CATS = {
  umowa: 'Umowy', pelnomocnictwo: 'Pełnomocnictwa', rejestrowe: 'Dokumenty rejestrowe',
  aml: 'AML / KYC', korespondencja: 'Korespondencja', inne: 'Inne',
};
const CAT_ONE = { umowa: 'Umowa', pelnomocnictwo: 'Pełnomocnictwo', rejestrowe: 'Dokument rejestrowy', aml: 'AML', korespondencja: 'Pismo', inne: 'Dokument' };
const BUCKET = 'klienci', MAX_MB = 25;
const today = () => new Date().toLocaleDateString('sv-SE');

export function archiveCard(c) {
  let rows = [], filter = '', cat = 'umowa';
  const list = h('div', { class: 'tk-files arch-files' });
  const chips = h('div', { class: 'arch-chips', role: 'group', 'aria-label': 'Kategoria' });
  const count = h('span', { class: 'muted', style: { fontWeight: 500 } });
  const catSel = h('select', { class: 'arch-cat', 'aria-label': 'Kategoria nowych plików', onchange: () => { cat = catSel.value; } },
    ...Object.entries(ARCH_CATS).map(([k, v]) => h('option', { value: k }, CAT_ONE[k] + (k === 'inne' ? ' / inne' : ''))));
  const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  camIn.addEventListener('change', () => { const fs = [...camIn.files]; camIn.value = ''; if (fs.length) scanDialog(fs); });
  const box = h('section', { class: 'card section arch' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Archiwum dokumentów ', count)),
    h('p', { class: 'hint', style: { marginTop: '-4px' } }, 'Podpisane umowy, pełnomocnictwa, KRS/CEIDG, dokumenty AML i korespondencja – wszystko, co dotyczy współpracy, a nie rozliczeń miesięcznych.'),
    h('div', { class: 'arch-add' },
      h('label', { class: 'arch-lbl' }, 'Dodaj jako', catSel),
      h('div', { class: 'row-btns' }, camIn,
        h('button', { class: 'btn btn-primary btn-sm cam-btn', type: 'button', onclick: () => camIn.click() }, icon('camera'), 'Zdjęcie / skan telefonem'))),
    dropZone(fs => upload(fs), 'albo wklej Ctrl+V / ⌘V · PDF, zdjęcia, Word, Excel do 25 MB'),
    chips, list);
  box.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); upload(fs); } });

  function draw() {
    const used = Object.keys(ARCH_CATS).filter(k => rows.some(r => r.category === k));
    count.textContent = rows.length ? `(${rows.length})` : '';
    chips.replaceChildren(...(used.length > 1 ? [['', 'Wszystkie'], ...used.map(k => [k, ARCH_CATS[k]])].map(([k, v]) =>
      h('button', { type: 'button', class: 'arch-chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; draw(); } },
        v, h('span', { class: 'muted' }, ' ' + (k ? rows.filter(r => r.category === k).length : rows.length)))) : []));
    const shown = rows.filter(r => !filter || r.category === filter);
    list.replaceChildren(...(shown.length ? shown.map(tile) : [h('p', { class: 'hint', style: { gridColumn: '1/-1' } }, rows.length ? 'Brak plików w tej kategorii.' : 'Archiwum jest puste. Dodaj pierwszy dokument – np. zdjęcie podpisanej umowy.')]));
  }
  function tile(r) {
    const canDel = r.uploaded_by === state.me.id || state.me.role === 'admin';
    const t = fileTile({ ...r, bucket: BUCKET }, { onDelete: canDel ? () => del(r) : null });
    const sel = h('select', { class: 'arch-tcat', 'aria-label': 'Kategoria', onchange: async () => {
      const { error } = await sb.from('client_files').update({ category: sel.value }).eq('id', r.id);
      if (error) { sel.value = r.category; return fail(error); }
      r.category = sel.value; toast(`Przeniesiono do: ${ARCH_CATS[r.category]}`); draw();
    } }, ...Object.entries(CAT_ONE).map(([k, v]) => h('option', { value: k, selected: r.category === k }, v)));
    t.append(h('div', { class: 'arch-meta' }, sel, r.note ? h('div', { class: 'small muted arch-note' }, r.note) : null));
    return t;
  }
  async function load() {
    const { data, error } = await sb.from('client_files').select('*').eq('client_id', c.id).order('created_at', { ascending: false });
    if (error) { list.replaceChildren(h('p', { class: 'hint' }, 'Archiwum będzie dostępne po aktualizacji bazy danych.')); return; }
    rows = data || []; draw();
  }
  async function upload(files, { name, note } = {}) {
    box.classList.add('busy');
    let ok = 0;
    for (const raw of files) {
      const f = named(raw);
      if (f.size > MAX_MB * 1048576) { toast(`„${f.name}” jest większy niż ${MAX_MB} MB`, true); continue; }
      const fname = name || f.name;
      const path = `${c.id}/${crypto.randomUUID().slice(0, 8)}-${safeName(fname)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (error) { fail(error, `Nie udało się wysłać „${fname}”`); continue; }
      const { error: e2 } = await sb.from('client_files').insert({ client_id: c.id, category: cat, name: fname.slice(0, 200), note: note || null, path, mime: f.type || null, size: f.size, uploaded_by: state.me.id });
      if (e2) { await sb.storage.from(BUCKET).remove([path]); fail(e2); continue; }
      ok++;
    }
    box.classList.remove('busy');
    if (ok) { toast(ok === 1 ? `Dodano do archiwum (${CAT_ONE[cat]})` : `Dodano do archiwum: ${ok}`); filter = ''; }
    load();
  }
  async function del(r) {
    if (!confirm(`Usunąć „${r.name}” z archiwum klienta?`)) return;
    const { error } = await sb.from('client_files').delete().eq('id', r.id);
    if (error) return fail(error);
    await sb.storage.from(BUCKET).remove([r.path]);
    toast('Usunięto'); load();
  }

  // ---------- skan telefonem: kolejne strony → jeden PDF albo osobne zdjęcia ----------
  function scanDialog(first) {
    const pages = [];
    const strip = h('div', { class: 'scan-strip' });
    const nameIn = h('input', { type: 'text', value: `${CAT_ONE[cat]} – ${c.name.slice(0, 60)} – ${today()}`, 'aria-label': 'Nazwa pliku' });
    const noteIn = h('input', { type: 'text', placeholder: 'Opis (opcjonalnie), np. „UPL-1 do US, podpisane 12.10”' });
    const more = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const gallery = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const addPages = fs => { fs.forEach(f => pages.push({ f, url: URL.createObjectURL(f) })); drawStrip(); };
    more.addEventListener('change', () => { addPages([...more.files]); more.value = ''; });
    gallery.addEventListener('change', () => { addPages([...gallery.files]); gallery.value = ''; });
    function drawStrip() {
      strip.replaceChildren(...pages.map((p, i) => h('div', { class: 'scan-page' }, h('img', { src: p.url, alt: `Strona ${i + 1}` }), h('span', {}, i + 1),
        h('button', { type: 'button', class: 'tk-file-del', 'aria-label': `Usuń stronę ${i + 1}`, onclick: () => { URL.revokeObjectURL(p.url); pages.splice(i, 1); drawStrip(); } }, '✕'),
        i > 0 ? h('button', { type: 'button', class: 'scan-left', 'aria-label': 'Przesuń wcześniej', onclick: () => { [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]]; drawStrip(); } }, '‹') : null)),
        h('button', { type: 'button', class: 'scan-add', onclick: () => more.click() }, icon('camera'), h('span', {}, 'Kolejna strona')));
    }
    addPages(first);
    modal('Skan dokumentu', h('div', { class: 'scan' },
      h('p', { class: 'hint' }, 'Zrób zdjęcie każdej strony. Zapiszemy je jako jeden PDF w archiwum klienta – w kategorii „' + CAT_ONE[cat] + '”.'),
      strip, more, gallery,
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => gallery.click() }, icon('plus'), 'Dodaj z galerii'),
      h('label', {}, 'Nazwa'), nameIn, h('label', {}, 'Opis'), noteIn), close => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (!pages.length) return; close(); await upload(pages.map(p => p.f), { note: noteIn.value.trim() }); } }, 'Zapisz jako osobne zdjęcia'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
        if (!pages.length) return toast('Dodaj co najmniej jedną stronę', true);
        e.target.disabled = true; e.target.textContent = 'Tworzenie PDF…';
        try {
          const pdf = await imagesToPdf(pages.map(p => p.f));
          const nm = (nameIn.value.trim() || 'skan').replace(/\.pdf$/i, '') + '.pdf';
          close();
          await upload([new File([pdf], nm, { type: 'application/pdf' })], { name: nm, note: noteIn.value.trim() });
        } catch (err) { e.target.disabled = false; e.target.textContent = 'Zapisz jako PDF'; fail(err, 'Nie udało się utworzyć PDF'); }
      } }, 'Zapisz jako PDF')]);
  }

  load();
  return box;
}

// ---------- zdjęcia → PDF (bez bibliotek: strony z obrazami JPEG, rozmiar strony = proporcje zdjęcia, szerokość A4) ----------
async function toJpeg(file, max = 2200) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
  });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), hgt = Math.round(bmp.height * s);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt); ctx.drawImage(bmp, 0, 0, w, hgt);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h: hgt };
}
export async function imagesToPdf(files) {
  const imgs = [];
  for (const f of files) imgs.push(await toJpeg(f));
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = imgs.length, kids = imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  imgs.forEach((im, i) => {
    const p = 3 + i * 3, W = 595.28, H = +(W * im.h / im.w).toFixed(2);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
    obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(p + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream'); });
  });
  const total = 3 + n * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
