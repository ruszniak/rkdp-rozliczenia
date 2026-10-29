// Link do podglądu wyniku (np. kalkulatora) dla osoby bez dostępu do aplikacji:
// zapisujemy treść zestawienia (te same bloki co w PDF), link zawiera losowy token; podgląd tylko do odczytu, bez logowania.
import { h, toast, fail, modal } from './ui.js';
import { sb, state } from './store.js';

const VALID = [['30', '30 dni'], ['90', '90 dni'], ['365', '1 rok'], ['', 'bez terminu']];
const urlOf = token => `${location.origin}/#/wynik/${token}`;
const dLong = t => new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

// okno „Link dla klienta”: utworzenie nowego linku + lista wcześniejszych (z liczbą wyświetleń i wyłączaniem)
export function shareDialog({ kind = 'kalkulator', brand = 'rkdp', title, blocks, label = '' }) {
  const lbl = h('input', { class: 'input', value: label, placeholder: 'np. Jan Kowalski – wariant 300 tys.' });
  const days = h('select', { class: 'select' }, ...VALID.map(([v, l]) => h('option', { value: v, selected: v === '90' }, l)));
  const out = h('div', { class: 'sh-out', hidden: true });
  const list = h('div', { class: 'sh-list' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
  const copy = async url => { try { await navigator.clipboard.writeText(url); toast('Skopiowano link'); } catch { toast('Nie udało się skopiować – zaznacz link i skopiuj ręcznie', true); } };

  async function create() {
    const d = days.value ? new Date(Date.now() + Number(days.value) * 86400000).toISOString() : null;
    const { data, error } = await sb.from('shared_docs').insert({ kind, brand, title, blocks, label: lbl.value.trim() || null, expires_at: d }).select('token').single();
    if (error) return fail(error);
    const url = urlOf(data.token);
    out.hidden = false;
    out.replaceChildren(h('label', { class: 'field' }, h('span', {}, 'Link do wysłania'), h('input', { class: 'input', value: url, readonly: true, onfocus: e => e.target.select() })),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => copy(url) }, 'Kopiuj link'),
        h('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener' }, 'Otwórz podgląd')));
    copy(url); loadList();
  }
  async function loadList() {
    const { data, error } = await sb.from('shared_docs').select('id,token,title,label,created_at,expires_at,revoked_at,views,last_view_at,created_by').eq('kind', kind).order('created_at', { ascending: false }).limit(30);
    if (error) { list.replaceChildren(h('p', { class: 'hint' }, 'Lista linków niedostępna.')); return; }
    const now = new Date().toISOString();
    list.replaceChildren(...(data.length ? data.map(r => {
      const dead = r.revoked_at || (r.expires_at && r.expires_at < now);
      return h('div', { class: 'sh-row' + (dead ? ' dead' : '') },
        h('div', { class: 'sh-main' }, h('b', {}, r.label || r.title.replace(/_/g, ' ')), h('div', { class: 'small muted' },
          `${dLong(r.created_at)}${r.created_by !== state.me.id ? ' · ' + (state.members.find(m => m.id === r.created_by)?.short_name || '') : ''} · ` +
          (r.revoked_at ? 'wyłączony' : r.expires_at ? (dead ? 'wygasł ' : 'ważny do ') + dLong(r.expires_at) : 'bez terminu') +
          ` · wyświetlenia: ${r.views}${r.last_view_at ? ' (ostatnio ' + dLong(r.last_view_at) + ')' : ''}`)),
        !dead ? h('div', { class: 'row-btns' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => copy(urlOf(r.token)) }, 'Kopiuj'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
            const { error: e } = await sb.from('shared_docs').update({ revoked_at: new Date().toISOString() }).eq('id', r.id);
            if (e) return fail(e); toast('Link wyłączony – nie da się go już otworzyć'); loadList();
          } }, 'Wyłącz')) : null);
    }) : [h('p', { class: 'hint' }, 'Nie ma jeszcze linków.')]));
  }
  modal('Link dla klienta (tylko podgląd)', h('div', {},
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Osoba z linkiem zobaczy samo zestawienie – tak jak w PDF – bez logowania i bez możliwości zmiany danych. Link zawiera wyliczenie z chwili utworzenia; po zmianie danych utwórz nowy link. Możesz go w każdej chwili wyłączyć.'),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Opis (widoczny tylko w aplikacji)'), lbl), h('label', { class: 'field' }, h('span', {}, 'Ważność linku'), days)),
    h('div', { class: 'row-btns', style: { margin: '12px 0' } }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: create }, 'Utwórz link')),
    out,
    h('h3', { class: 'sh-h' }, 'Wcześniejsze linki'), list), c => [h('button', { class: 'btn btn-outline', onclick: c }, 'Zamknij')], { wide: true });
  loadList();
}

// publiczny podgląd: #/wynik/<token> – działa bez logowania
export async function renderShared(app, token) {
  document.title = 'Podgląd wyliczenia';
  const box = h('div', { class: 'sh-pub' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  app.replaceChildren(box);
  const { data, error } = await sb.rpc('shared_doc', { p_token: token || '' });
  if (error || !data) {
    box.replaceChildren(h('div', { class: 'sh-pub-msg card section' }, h('h1', {}, 'Link jest nieaktywny'),
      h('p', {}, 'Ten link wygasł, został wyłączony albo jest niepoprawny. Poproś osobę, która go przesłała, o nowy.')));
    return;
  }
  const { printableHtml, M2_BRAND, RKDP_BRAND } = await import('./m2/order.js');
  const { printHtml } = await import('./ui.js');
  const brand = data.brand === 'm2' ? M2_BRAND : RKDP_BRAND;
  const html = printableHtml(data.blocks, data.title, location.origin + brand.logo, brand);
  document.title = data.title.replace(/_/g, ' ');
  const W = 820;
  const frame = h('iframe', { class: 'sh-frame', title: 'Zestawienie', sandbox: 'allow-same-origin', srcdoc: html, style: { width: W + 'px' } });
  const wrap = h('div', { class: 'sh-wrap' }, frame);
  const fit = () => {
    const doc = frame.contentDocument; if (!doc?.body) return;
    const s = Math.min(1, wrap.clientWidth / W), hgt = doc.documentElement.scrollHeight;
    frame.style.height = hgt + 'px'; frame.style.transform = `scale(${s})`; wrap.style.height = Math.ceil(hgt * s) + 'px';
  };
  frame.addEventListener('load', () => { fit(); setTimeout(fit, 600); });
  window.addEventListener('resize', fit);
  box.replaceChildren(
    h('div', { class: 'sh-bar' },
      h('img', { src: brand.logo, alt: brand.alt, class: 'sh-logo' }),
      h('div', { class: 'sh-meta small' }, `Podgląd wyliczenia · przygotowano ${dLong(data.created_at)}${data.expires_at ? ' · link ważny do ' + dLong(data.expires_at) : ''}`),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => printHtml(html, data.title) }, 'Pobierz PDF')),
    wrap);
}
