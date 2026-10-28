// Wspólny papier firmowy RKDP do wydruków i PDF (raporty, zestawienia, tabele) – jeden nagłówek, stopka i typografia.
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export { esc };

export const PAPER_CSS = `
*{box-sizing:border-box}
body{font-family:Inter,Montserrat,Arial,sans-serif;color:#1D1A16;font-size:10px;line-height:1.45;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:8px;margin-bottom:12px;border-bottom:2px solid transparent;border-image:linear-gradient(90deg,#806341,#E0C098) 1}
.ph h1{font-family:Montserrat,Arial,sans-serif;font-size:17px;margin:0;letter-spacing:-.01em}
.ph p{margin:3px 0 0;color:#6A6157;font-size:9.5px}
.ph img{height:30px}
h2{font-family:Montserrat,Arial,sans-serif;font-size:12.5px;margin:16px 0 6px}
h2 small{font-weight:400;color:#6A6157}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}tr{page-break-inside:avoid}
th{background:#F3EEE6;color:#4A433B;font-size:8.8px;font-weight:600;padding:5px;border-bottom:1px solid #DCCFBC;text-align:center}
td{padding:4px 5px;border-bottom:1px solid #E9E1D4;text-align:center;vertical-align:middle}
.l{text-align:left}.r{text-align:right}.muted{color:#6A6157}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 4px}
.kpi{border:1px solid #E3D9CA;border-radius:8px;padding:8px 10px}
.kpi b{display:block;font-family:Montserrat,Arial,sans-serif;font-size:18px}
.kpi span{color:#6A6157;font-size:8.8px}
.up{color:#3E6B47}.down{color:#A4462F}
.bar{height:5px;background:#EFE8DC;border-radius:5px;overflow:hidden;margin-top:5px}.bar i{display:block;height:100%;background:linear-gradient(90deg,#806341,#CFAE86)}
.pf{position:fixed;bottom:0;left:0;right:0;font-size:8px;color:#8F8579;display:flex;justify-content:space-between;border-top:1px solid #E3D9CA;padding-top:4px}
.warn{color:#A4462F;font-weight:600}
`;

export function paper({ title, subtitle = '', body, landscape = false, extraCss = '' }) {
  const now = new Date().toLocaleString('pl-PL');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm 12mm 16mm}${PAPER_CSS}${extraCss}</style></head><body>
<div class="ph"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}${subtitle ? ' · ' : ''}wygenerowano ${esc(now)}</p></div><img src="${location.origin}/logo-rkdp.png" alt="RKDP"></div>
${body}
<div class="pf"><span>RKDP spółka doradztwa podatkowego sp. z o.o. · dokument wewnętrzny – dane objęte tajemnicą doradcy podatkowego</span><span>rozliczenia.rkdp.pl</span></div>
</body></html>`;
}
