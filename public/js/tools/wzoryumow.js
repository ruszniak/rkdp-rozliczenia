// Generator wzorów umów: wybierasz wzór i wysyłasz klientowi projekt do zapoznania się (e-mail z PDF do pobrania albo sam link).
// Bez wybierania klienta – dane klienta w umowie zostają puste do uzupełnienia.
import { h, fail, modal, icon } from '../ui.js';
import { sb, state, hasModule, isAdmin } from '../store.js';

const today = () => new Date().toLocaleDateString('sv-SE');

function options() {
  const doradztwo = isAdmin() || hasModule('doradztwo');
  return [
    ['ks:ryczalt', 'Umowa o usługi księgowe – ryczałt', 'RKDP'],
    ['ks:kpir', 'Umowa o usługi księgowe – KPiR', 'RKDP'],
    ['ks:ksiegi', 'Umowa o usługi księgowe – księgi rachunkowe (spółki)', 'RKDP'],
    ['ks:fundacja', 'Umowa o usługi księgowe – fundacja rodzinna', 'RKDP'],
    ['dor:rkdp', 'Umowa o świadczenie usług doradztwa podatkowego', 'RKDP'],
    doradztwo ? ['dor:m2', 'Umowa o świadczenie usług doradztwa podatkowego', 'M2 TAX'] : null,
  ].filter(Boolean);
}

// PDF wybranego wzoru
async function build(key) {
  const [kind, v] = key.split(':');
  const { contractPdf, orderPdf } = await import('../umowapdf.js');
  if (kind === 'ks') {
    const { blankAccountingXml, ACCOUNTING_TEMPLATES } = await import('../rkdp/docs.js');
    const title = `Umowa o usługi księgowe – ${ACCOUNTING_TEMPLATES[v].toLowerCase()}`;
    const xml = await blankAccountingXml(v);
    return { firm: 'rkdp', title, pdf: () => contractPdf(xml, title) };
  }
  const { docBlocks, orderDocumentXml, brandOf, CONTRACT_DEFAULTS } = await import('../m2/order.js');
  const { data: signers, error } = await sb.from('m2_signers').select('*').eq('active', true).order('sort');
  if (error) throw error;
  // podpisujący: dla RKDP – osoby z zespołu RKDP, dla M2 TAX – wszyscy wspólnicy; najpierw osoba wysyłająca
  const rkNames = state.members.filter(m => m.active && (m.modules || []).includes('rozliczenia')).map(m => m.full_name);
  const sig = (v === 'rkdp' ? signers.filter(x => rkNames.includes(x.full_name)) : signers)
    .sort((a, b) => (b.full_name === state.me.full_name) - (a.full_name === state.me.full_name));
  const draft = { doc_type: 'umowa', firm: v, order_date: today(), status: 'projekt', payment_days: 14, signer_ids: sig.map(x => x.id), params: { ...CONTRACT_DEFAULTS } };
  const xml = orderDocumentXml(docBlocks(draft, null, sig));
  const title = `Umowa o świadczenie usług doradztwa podatkowego – ${v === 'm2' ? 'M2 TAX' : 'RKDP'}`;
  return { firm: v, title, pdf: () => orderPdf(xml, brandOf(v), title) };
}

export function wzorUmowyDialog() {
  const opts = options();
  let cur = opts[0][0];
  const list = h('div', { style: { display: 'grid', gap: '8px' } });
  const draw = () => list.replaceChildren(...opts.map(([k, t, firm]) => h('label', { class: 'card', style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', margin: 0, borderColor: k === cur ? 'var(--accent, #2563EB)' : '' } },
    h('input', { type: 'radio', name: 'wzor', checked: k === cur, onchange: () => { cur = k; draw(); } }),
    h('span', { style: { flex: 1 } }, h('b', {}, t)), h('span', { class: 'badge' }, firm))));
  draw();
  let close = () => {};
  const busy = async (b, label, fn) => { b.disabled = true; const t = b.textContent; b.textContent = label; try { await fn(); } catch (e) { fail(e, 'Nie udało się przygotować wzoru'); } finally { b.disabled = false; b.textContent = t; } };
  modal('Generator wzorów umów', h('div', {},
    h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Wybierz wzór i wyślij go klientowi do zapoznania się – e-mailem (PDF do pobrania przez 30 dni) albo jako link. Klienta nie trzeba mieć w bazie; jego dane w umowie zostaną puste do uzupełnienia.'),
    list), c => { close = c; return [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: c }, 'Anuluj'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: e => busy(e.currentTarget, 'Przygotowuję…', async () => {
      const w = await build(cur);
      const url = URL.createObjectURL(new Blob([await w.pdf()], { type: 'application/pdf' }));
      const a = h('a', { href: url, download: `${w.title}.pdf` }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }) }, icon('download'), 'Podgląd PDF'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: e => busy(e.currentTarget, 'Przygotowuję…', async () => {
      const w = await build(cur);
      const { mailDraft } = await import('../podpisy.js');
      close();
      mailDraft({ client: null, target: {}, firm: w.firm, title: w.title, buildPdf: w.pdf });
    }) }, icon('mail'), 'Wyślij klientowi'),
  ]; });
}
