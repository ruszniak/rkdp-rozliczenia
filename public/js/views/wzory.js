// Wzory umów i uchwał dla klientów – lista, formularz, podgląd; pobranie Word lub PDF. Wspólne dla RKDP i M2 TAX.
import { h, toast, fail, icon, infoTip, printHtml } from '../ui.js';
import { WZORY, GROUPS } from '../tools/wzory.js';
import { orderHtml, printableHtml, buildOrderDocx, ORDER_CSS } from '../m2/order.js';
import { downloadBytes } from '../docx.js';

const HELP = `Wzory umów i uchwał dla klientów:
• Wybierz wzór z listy i uzupełnij to, co znasz – reszta zostaje jako [pole do uzupełnienia], w Wordzie z żółtym wyróżnieniem.
• Podgląd po prawej odświeża się na bieżąco.
• „Pobierz Word” – do dalszej edycji i przekazania klientowi. „PDF” – szybki wydruk.
• Dokumenty są bez papieru firmowego biura – to dokumenty klienta.
• Pod formularzem znajdziesz „Na co uważać” – najważniejsze skutki podatkowe i wymogi formalne danego wzoru.`;

const slug = s => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 50);

export async function renderWzory(main, { mod = 'rkdp', params } = {}) {
  if (!document.getElementById('order-css')) document.head.append(h('style', { id: 'order-css' }, ORDER_CSS));
  const base = mod === 'm2' ? '#/doradztwo/wzory' : '#/wzory';
  let key = WZORY[params?.get('wzor')] ? params.get('wzor') : Object.keys(WZORY)[0];
  const data = {};
  const D = () => (data[key] ||= { ...(WZORY[key].defaults || {}) });

  const brand = () => ({ key: 'plain', plain: true, logo: null, ratio: 1, alt: '', lines: [], foot1: WZORY[key].label, foot2: '', firmName: '', firmAddress: '', city: '' });
  const blocks = () => WZORY[key].build(D());
  const fileBase = () => slug(`${WZORY[key].label}${D().spolka || D().najemca || D().wykonawca ? '_' + (D().spolka || D().najemca || D().wykonawca) : ''}`);

  const preview = h('div', { class: 'paper' });
  const draw = () => { preview.innerHTML = orderHtml(blocks(), '', brand()); };

  const list = h('div', { class: 'pz-list' });
  const drawList = () => list.replaceChildren(...GROUPS.map(g => h('div', { class: 'pz-group' }, h('p', { class: 'eyebrow' }, g),
    ...Object.entries(WZORY).filter(([, w]) => w.group === g).map(([k, w]) => h('button', { type: 'button', class: 'pz-item' + (k === key ? ' on' : ''), onclick: () => {
      key = k; drawList(); drawForm(); draw(); history.replaceState(null, '', `${base}?wzor=${k}`);
    } }, h('b', {}, w.label), h('span', { class: 'small muted' }, w.desc))))));

  const form = h('div');
  function drawForm() {
    const W = WZORY[key], d = D();
    const ctl = ([k, label, type, opts]) => {
      let el;
      if (type === 'select') {
        el = h('select', { class: 'select' }, ...opts.map(([v, l]) => h('option', { value: v, selected: d[k] === v }, l)));
        el.addEventListener('change', () => { d[k] = el.value; draw(); });
      } else if (type === 'area') {
        el = h('textarea', { class: 'input', rows: 2 }); el.value = d[k] || '';
        el.addEventListener('input', () => { d[k] = el.value; draw(); });
      } else {
        el = h('input', { class: 'input', type: type === 'date' ? 'date' : 'text', inputmode: type === 'money' ? 'decimal' : null, value: d[k] || '', placeholder: type === 'money' ? 'np. 50 000' : '' });
        el.addEventListener('input', () => { d[k] = el.value; draw(); });
      }
      return h('label', { class: 'field' + (type === 'wide' || type === 'area' ? ' wide' : '') }, h('span', {}, label), el);
    };
    form.replaceChildren(
      h('h2', { style: { margin: '0 0 4px' } }, W.label), h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, W.desc),
      h('div', { class: 'form-grid' }, ...W.fields.map(ctl)),
      W.hints?.length ? h('div', { class: 'wz-hints' }, h('b', {}, 'Na co uważać'), h('ul', {}, ...W.hints.map(t => h('li', {}, t)))) : null,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { data[key] = { ...(W.defaults || {}) }; drawForm(); draw(); } }, 'Wyczyść pola')));
  }

  async function word() {
    try { downloadBytes(await buildOrderDocx(blocks(), brand()), fileBase() + '.docx'); toast('Pobrano plik Word'); }
    catch (e) { fail(e, 'Nie udało się przygotować pliku Word'); }
  }
  const pdf = () => printHtml(printableHtml(blocks(), fileBase(), '', brand()));

  drawList(); drawForm(); draw();
  main.replaceChildren(
    h('a', { href: mod === 'm2' ? '#/doradztwo/dokumenty' : '#/dokumenty', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Dokumenty'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, `Wzory dla klientów · ${mod === 'm2' ? 'M2 TAX' : 'RKDP'}`),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Wzory umów i uchwał', infoTip(HELP, 'Wzory – instrukcja')),
        h('p', { class: 'sub' }, 'Umowy cywilnoprawne, uchwały wspólników i dokumenty do CIT estońskiego – do pobrania w Wordzie.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-outline btn-sm', onclick: pdf }, icon('download'), 'PDF'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: word }, icon('download'), 'Pobierz Word'))),
    h('div', { class: 'pz-layout' },
      h('aside', { class: 'card pz-side' }, list),
      h('section', { class: 'card section pz-form' }, form),
      h('div', { class: 'paper-wrap pz-paper' }, preview)));
}
