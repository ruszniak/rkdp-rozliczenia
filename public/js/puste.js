// Puste stany w stylu RKDP: mały rysunek sieci (złoto logo) + tytuł, opis i opcjonalny przycisk.
import { h } from './ui.js';

const NET = `<svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true" fill="none">
<g stroke="currentColor" stroke-opacity=".45" stroke-width="1">
<path d="M14 58 38 30 62 46 88 18 106 40M38 30 52 12 88 18M62 46 74 68 106 40M14 58 42 70 74 68M42 70 62 46"/></g>
<g fill="currentColor"><circle cx="14" cy="58" r="3"/><circle cx="38" cy="30" r="3.5"/><circle cx="62" cy="46" r="4.5"/><circle cx="88" cy="18" r="3"/>
<circle cx="106" cy="40" r="3"/><circle cx="52" cy="12" r="2.5"/><circle cx="74" cy="68" r="3"/><circle cx="42" cy="70" r="2.5"/></g></svg>`;

export function emptyState(title, text, action) {
  return h('div', { class: 'card empty-art' },
    h('span', { class: 'ea-ico', html: NET }),
    h('b', {}, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action || null);
}
