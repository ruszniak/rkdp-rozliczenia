// Karta „Monitoring” w karcie klienta: ostatni stan z Białej listy VAT i KRS, wykryte zmiany i ręczne sprawdzenie.
import { h, toast, fail } from './ui.js';
import { sb, state } from './store.js';
import { fetchSoft, fmtFull } from './data.js';

export function monitorCard(c) {
  const box = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Monitoring (Biała lista, KRS)')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  const draw = async () => {
    const [snapRows, alerts] = await Promise.all([
      fetchSoft(() => sb.from('client_monitor').select('snapshot,checked_at').eq('module', 'rkdp').eq('client_id', c.id)),
      fetchSoft(() => sb.from('monitor_alerts').select('*').eq('module', 'rkdp').eq('client_id', c.id).order('created_at', { ascending: false })),
    ]);
    const snap = snapRows[0];
    const v = snap?.snapshot?.vat, k = snap?.snapshot?.krs;
    const btn = h('button', { class: 'btn btn-outline btn-sm', onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Sprawdzanie…';
      const { data, error } = await sb.functions.invoke('monitor', { body: { action: 'run', client_id: c.id } });
      if (error || data?.error) { e.target.disabled = false; e.target.textContent = 'Sprawdź teraz'; return fail(error || data.error, 'Nie udało się sprawdzić'); }
      toast(data.changes ? `Wykryto zmiany: ${data.changes}` : snap ? 'Bez zmian' : 'Zapisano stan wyjściowy – kolejne zmiany będą wykrywane automatycznie');
      draw();
    } }, 'Sprawdź teraz');
    const row = (l, val, cls) => h('div', { class: 'pl-dl' }, h('span', {}, l), h('b', { class: cls || '' }, val || '—'));
    box.replaceChildren(h('div', { class: 'section-head' }, h('h2', {}, 'Monitoring (Biała lista, KRS)'), btn),
      snap ? h('div', {},
        row('Status VAT', v?.status || 'brak danych', v?.status && v.status !== 'Czynny' ? 'late-t' : ''),
        v?.accounts ? row('Rachunki na Białej liście', String(v.accounts.length)) : null,
        k?.found ? row('Zarząd (KRS)', (k.board || []).join(', ')) : null,
        k?.found && k.owners?.length ? row('Wspólnicy (KRS)', k.owners.join(', ')) : null,
        k?.liquidation ? row('KRS', 'likwidacja', 'late-t') : null,
        h('p', { class: 'hint' }, `Ostatnie sprawdzenie: ${fmtFull(snap.checked_at.slice(0, 10))}. Automatycznie co tydzień (poniedziałek rano); zmiana statusu VAT, zarządu lub wspólników trafia do alertów, karty AML i powiadomień.`))
        : h('p', { class: 'hint' }, c.nip || c.krs ? 'Klient nie był jeszcze sprawdzany. Kliknij „Sprawdź teraz”, aby zapisać stan wyjściowy.' : 'Uzupełnij NIP lub KRS, aby włączyć monitoring.'),
      ...alerts.slice(0, 8).map(a => h('div', { class: 'cp-alert' + (a.resolved_at ? ' done' : '') }, h('b', {}, fmtFull(a.created_at.slice(0, 10))), ' ', a.summary,
        a.resolved_at ? h('span', { class: 'muted small' }, ' · sprawdzone') : h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
          const { error } = await sb.from('monitor_alerts').update({ resolved_at: new Date().toISOString(), resolved_by: state.me.id }).eq('id', a.id);
          if (error) return fail(error); draw();
        } }, 'Sprawdzone'))));
  };
  draw();
  return box;
}
