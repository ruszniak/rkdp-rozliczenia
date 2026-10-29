// Drobne narzędzia interfejsu

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // używane tylko dla stałych ikon
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
export function toast(msg, bad = false) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), bad ? 6000 : 2600);
}

// komunikat z przyciskiem (np. „Cofnij”); Ctrl+Z wywołuje ostatnią akcję cofania
let undoFn = null;
export function toastAction(msg, label, fn, ms = 7000) {
  document.querySelector('.toast')?.remove();
  const btn = h('button', { type: 'button', class: 'toast-btn' }, label);
  const t = h('div', { class: 'toast with-btn', role: 'status' }, h('span', {}, msg), btn);
  const done = () => { t.remove(); if (undoFn === run) undoFn = null; };
  const run = () => { done(); fn(); };
  btn.addEventListener('click', run);
  undoFn = run;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(done, ms);
}
document.addEventListener('keydown', (e) => {
  if (undoFn && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); undoFn(); }
});

export function fail(error, prefix = 'Błąd') {
  console.error(error);
  toast(`${prefix}: ${error?.message || error}`, true);
}

export const icons = {
  left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/></svg>',
  paperclip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
};

export function icon(name) {
  return h('span', { html: icons[name], style: { display: 'inline-flex' } });
}

export const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec',
  'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

export function periodLabel(p) {
  const [y, m] = p.split('-').map(Number);
  const s = MONTHS[m - 1];
  return s[0].toUpperCase() + s.slice(1) + ' ' + y;
}

export function shiftPeriod(p, delta) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// domyślnie: poprzedni miesiąc (w październiku rozliczamy wrzesień)
export function defaultPeriod() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// miniatura osoby: zdjęcie profilowe (jeśli ustawione) albo inicjały
export function ava(m) {
  if (m?.avatar) return h('img', { src: m.avatar, alt: '', class: 'av-img', loading: 'lazy', decoding: 'async' });
  return initials(m?.full_name || m?.name || '?');
}
export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

export function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Podpowiedzi po najechaniu: dowolny element z atrybutem data-tip
let tipEl = null;
export function initTooltips() {
  if (tipEl) return;
  tipEl = document.createElement('div');
  tipEl.className = 'tip'; tipEl.hidden = true; tipEl.setAttribute('role', 'tooltip');
  document.body.append(tipEl);
  let timer = 0, cur = null;
  const hide = () => { clearTimeout(timer); cur = null; tipEl.hidden = true; tipEl.classList.remove('in'); };
  const show = (target) => {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    cur = target;
    // pierwsza krótka linia jako tytuł dymka, reszta jako opis
    const nl = text.indexOf('\n');
    if (nl > 0 && nl <= 60) { tipEl.replaceChildren(h('b', { class: 'tip-t' }, text.slice(0, nl)), h('span', {}, text.slice(nl + 1))); }
    else tipEl.textContent = text;
    tipEl.classList.toggle('wide', target.hasAttribute('data-tip-wide'));
    tipEl.classList.remove('in', 'below');
    tipEl.hidden = false;
    const r = target.getBoundingClientRect();
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, innerWidth - tw - 8));
    let top = r.top - th - 10;
    if (top < 8) { top = r.bottom + 10; tipEl.classList.add('below'); }
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    tipEl.style.setProperty('--ax', Math.max(12, Math.min(tw - 12, r.left + r.width / 2 - left)) + 'px');
    void tipEl.offsetWidth; tipEl.classList.add('in');
  };
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { if (cur) hide(); return; }
    if (t === cur) return;
    clearTimeout(timer);
    // natychmiast, gdy dymek już jest widoczny (przesuwanie po nagłówkach); inaczej krótka zwłoka
    if (!tipEl.hidden) show(t); else { cur = t; timer = setTimeout(() => { if (cur === t) show(t); }, 140); }
  });
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && t.matches(':focus-visible')) show(t); });
  ['scroll', 'mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, hide, true));
}

// Ikonka „i” z instrukcją: podpowiedź po najechaniu, pełna treść w okienku po kliknięciu (też na telefonie)
export function infoTip(text, title = 'Jak to działa') {
  return h('button', { type: 'button', class: 'info-i', 'aria-label': title, 'data-tip': text, 'data-tip-wide': '',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); modal(title, h('div', { class: 'info-body' }, text), close => [h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Rozumiem')]); } }, 'i');
}

// Okno dialogowe (wspólne): actions(close) zwraca listę przycisków
export function modal(title, body, actions, { wide = false } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': title, style: wide ? { maxWidth: '980px' } : null },
      h('div', { class: 'section-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Zamknij', onclick: close }, '✕')),
      body, h('div', { class: 'row', style: { justifyContent: 'flex-end', display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } }, ...actions(close).filter(Boolean))));
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  back.querySelector('input, select, textarea')?.focus();
  return close;
}

// Telefon: tabele .list wyświetlane jako karty – każda komórka dostaje etykietę z nagłówka kolumny
let tableObs = null;
export function initMobileTables() {
  if (tableObs) return;
  let queued = false;
  const label = () => {
    queued = false;
    document.querySelectorAll('table.list').forEach(t => {
      const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!heads.length) return;
      t.querySelectorAll('tbody tr').forEach(tr => {
        let i = 0;
        for (const td of tr.children) {
          if (!td.hasAttribute('data-label')) td.setAttribute('data-label', td.colSpan > 1 ? '' : (heads[i] || ''));
          i += td.colSpan || 1;
        }
      });
    });
  };
  // tylko na telefonie – na komputerze obserwator niepotrzebnie spowalniałby przełączanie zakładek
  const mq = window.matchMedia('(max-width: 820px)');
  tableObs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(label); } });
  const sync = () => { if (mq.matches) { tableObs.observe(document.body, { childList: true, subtree: true }); label(); } else tableObs.disconnect(); };
  mq.addEventListener?.('change', sync);
  sync();
}

// Drukowanie / zapis do PDF w ukrytej ramce na tej samej stronie (bez nowego okna).
// Nowe okno about:blank dzieli wątek z aplikacją – gdy podgląd wydruku zostawał otwarty
// w innej karcie, aplikacja przestawała reagować. Ramka znika po wydruku, a strona działa dalej.
let printFrame = null;
export function printHtml(html, title) {
  printFrame?.remove();
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0', pointerEvents: 'none' });
  printFrame = f;
  const docTitle = title || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || document.title;
  f.onload = async () => {
    const w = f.contentWindow, d = f.contentDocument;
    if (!w || !d) return;
    await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
    try { await Promise.race([d.fonts?.ready, new Promise(r => setTimeout(r, 1500))]); } catch { /* */ }
    const prev = document.title;
    document.title = docTitle; // Chrome bierze tytuł z dokumentu jako nazwę pliku PDF
    const restore = () => { document.title = prev; };
    w.addEventListener('afterprint', restore, { once: true });
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error(e); } setTimeout(restore, 1000); }, 150);
  };
  f.srcdoc = html;
  document.body.append(f);
  return true;
}
