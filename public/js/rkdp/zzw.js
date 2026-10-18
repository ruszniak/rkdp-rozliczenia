// Protokół Zwyczajnego Zgromadzenia Wspólników sp. z o.o. – zatwierdzenie sprawozdania finansowego (art. 231 KSH).
// Generuje bloki dokumentu (te same, co umowy M2: HTML do PDF i .docx), bez papieru firmowego biura.
import { dateLong, zl, slownie } from '../m2/order.js';

const P = '……………';
const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/\s| /g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const kw = v => num(v) === null ? `${P} zł (słownie: ${P})` : `${zl(Math.abs(num(v)))} (słownie: ${slownie(Math.abs(num(v)))})`;
const dShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : P;
const fullName = p => (p.entity || `${p.first || ''} ${p.last || ''}`).trim() || P;
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? b : c;
const udz = n => `${n} ${plural(n, 'udział', 'udziały', 'udziałów')}`;
const glos = n => `${n} ${plural(n, 'głos', 'głosy', 'głosów')}`;
const roleLc = r => (r || 'członek zarządu').toLowerCase();
const roleDat = r => {
  const x = roleLc(r);
  if (/wiceprezes/.test(x)) return x.replace('wiceprezes', 'wiceprezesowi');
  if (/prezes/.test(x)) return x.replace('prezes', 'prezesowi');
  return x.replace('członek', 'członkowi');
};

// „670 (SZEŚĆSET…) UDZIAŁÓW O ŁĄCZNEJ WYSOKOŚCI 33.500,00 (…) ZŁOTYCH” → { shares: 670, value: 33500 }
export function parseShares(text) {
  const t = String(text || '');
  const shares = Number((t.match(/^\s*(\d[\d .]*)/) || [, ''])[1].replace(/[ .]/g, '')) || null;
  const v = (t.match(/(?:WYSOKO[ŚS]CI|WARTO[ŚS]CI)\s+([\d .]+,\d{2})/i) || [])[1];
  return { shares, value: v ? Number(v.replace(/[ .]/g, '').replace(',', '.')) : null };
}

// maska z KRS: „R*******” – pierwsza litera + gwiazdki (osobno każde słowo)
export const maskOf = s => String(s || '').trim().toUpperCase().split(/\s+/).filter(Boolean).map(w => w[0] + '*'.repeat(w.length - 1)).join(' ');
export const isMasked = p => /\*/.test(`${p.first || ''} ${p.last || ''}`);
// dopasowanie zamaskowanej osoby z KRS do osoby wpisanej wcześniej
export function matchKnown(masked, known) {
  return known.find(k => k.first && k.last && maskOf(k.last) === String(masked.last || '').toUpperCase() && maskOf(k.first) === String(masked.first || '').toUpperCase()) || null;
}

export const ZZW_DEFAULTS = () => {
  const y = new Date().getFullYear() - 1;
  return {
    company: '', krs: '', nip: '', regon: '', seat: '', address: '', capital: '',
    period_from: `${y}-01-01`, period_to: `${y}-12-31`, meeting_date: new Date().toISOString().slice(0, 10), place: '', time: '',
    convening: 'art240', convened_on: '', chair: '', chair_g: 'm', recorder: '', recorder_g: 'k',
    shareholders: [], board: [],
    total: '', result: '', profit_use: 'zapasowy', loss_cover: 'przyszle', custom_use: '', div_day: '', div_pay: '',
    mgmt_report: false, full_scope: false, entity_type: 'mikro',
  };
};

export function zzwBlocks(p) {
  const sh = (p.shareholders || []).filter(s => fullName(s) !== P || s.shares);
  const present = sh.filter(s => s.present !== false);
  const totalShares = sh.reduce((a, s) => a + (Number(s.shares) || 0), 0);
  const presentShares = present.reduce((a, s) => a + (Number(s.shares) || 0), 0);
  const sole = sh.length === 1;
  const company = (p.company || P).trim();
  const R = num(p.result);
  const profit = R !== null && R > 0, loss = R !== null && R < 0;
  const per = `od ${dShort(p.period_from)} do ${dShort(p.period_to)}`;
  const year = (p.period_to || '').slice(0, 4);
  const perName = (p.period_from || '').slice(5) === '01-01' && (p.period_to || '').slice(5) === '12-31' && p.period_from.slice(0, 4) === year ? `rok obrotowy ${year}` : `rok obrotowy obejmujący okres ${per}`;
  const f = (g, m, k) => g === 'k' ? k : m;
  const chair = p.chair || P, cg = p.chair_g;
  const B = [];
  let n = 0;
  const board = (p.board || []).filter(b => fullName(b) !== P);

  // --- treść uchwał ---
  const resolutions = [];
  if (!sole) {
    resolutions.push({ key: 'chair', title: 'wyboru Przewodniczącego Zgromadzenia', secret: true,
      body: [`${f(cg, 'Przewodniczącym', 'Przewodniczącą')} Zwyczajnego Zgromadzenia Wspólników ${f(cg, 'wybrany zostaje Pan', 'wybrana zostaje Pani')} ${chair}.`] });
    resolutions.push({ key: 'agenda', title: 'przyjęcia porządku obrad', body: ['Zwyczajne Zgromadzenie Wspólników przyjmuje porządek obrad w brzmieniu przedstawionym w protokole.'] });
  }
  const who = sole ? 'Jedyny Wspólnik' : 'Zwyczajne Zgromadzenie Wspólników';
  const fsParts = [
    `bilans sporządzony na dzień ${dShort(p.period_to)}, który po stronie aktywów i pasywów wykazuje sumę ${kw(p.total)},`,
    `rachunek zysków i strat za okres ${per}, wykazujący ${loss ? 'stratę netto' : profit ? 'zysk netto' : 'wynik finansowy netto'} w wysokości ${R === 0 ? '0,00 zł' : kw(p.result)},`,
    ...(p.full_scope ? ['zestawienie zmian w kapitale (funduszu) własnym,', 'rachunek przepływów pieniężnych,'] : []),
    'informację dodatkową.',
  ];
  resolutions.push({ key: 'fs', title: `zatwierdzenia sprawozdania finansowego Spółki za ${perName}`,
    body: [`${who}, działając na podstawie art. 231 § 2 pkt 1 Kodeksu spółek handlowych oraz art. 53 ust. 1 ustawy z dnia 29 września 1994 r. o rachunkowości, po rozpatrzeniu zatwierdza sprawozdanie finansowe Spółki za ${perName}, obejmujące:`],
    list: fsParts });
  if (p.mgmt_report) resolutions.push({ key: 'mr', title: `zatwierdzenia sprawozdania zarządu z działalności Spółki za ${perName}`,
    body: [`${who}, działając na podstawie art. 231 § 2 pkt 1 Kodeksu spółek handlowych, po rozpatrzeniu zatwierdza sprawozdanie zarządu z działalności Spółki za ${perName}.`] });
  if (profit) {
    const use = {
      zapasowy: 'przeznaczyć w całości na kapitał zapasowy Spółki',
      dywidenda: `przeznaczyć w całości do podziału między wspólników (dywidenda), proporcjonalnie do liczby posiadanych udziałów${p.div_day ? `; dzień dywidendy ustala się na ${dShort(p.div_day)}` : ''}${p.div_pay ? `, a termin wypłaty dywidendy na ${dShort(p.div_pay)}` : ''}`,
      straty_lat: 'przeznaczyć w całości na pokrycie straty z lat ubiegłych',
      inne: (p.custom_use || P).trim().replace(/[.\s]+$/, ''),
    }[p.profit_use];
    resolutions.push({ key: 'res', title: `podziału zysku za ${perName}`,
      body: [`${who}, działając na podstawie art. 231 § 2 pkt 2 Kodeksu spółek handlowych, postanawia zysk netto Spółki za ${perName} w wysokości ${kw(p.result)} ${use}.`] });
  } else if (loss) {
    const cov = { przyszle: 'pokryć z zysków lat przyszłych', zapasowy: 'pokryć z kapitału zapasowego Spółki', inne: (p.custom_use || P).trim().replace(/[.\s]+$/, '') }[p.loss_cover];
    resolutions.push({ key: 'res', title: `pokrycia straty za ${perName}`,
      body: [`${who}, działając na podstawie art. 231 § 2 pkt 2 Kodeksu spółek handlowych, postanawia stratę netto Spółki za ${perName} w wysokości ${kw(p.result)} ${cov}.`] });
  }
  for (const b of board) {
    const nm = fullName(b);
    const bg = b.g || 'm';
    const own = sh.find(s => fullName(s).toLowerCase() === nm.toLowerCase());
    resolutions.push({ key: 'abs', person: nm, own, title: `udzielenia absolutorium ${roleDat(b.role)} (${nm})`, secret: true,
      body: [`${who}, działając na podstawie art. 231 § 2 pkt 3 Kodeksu spółek handlowych, udziela ${roleDat(b.role)} Spółki (${nm}) absolutorium z wykonania obowiązków w okresie ${per}.`] });
  }

  // --- protokół ---
  if (sole) {
    const s = sh[0];
    const sg = s.g || cg;
    B.push({ t: 'title', text: 'PROTOKÓŁ' });
    B.push({ t: 'center', text: `ze Zwyczajnego Zgromadzenia Wspólników spółki ${company}` });
    B.push({ t: 'meta', text: `${p.place || P}, ${dateLong(p.meeting_date)}` });
    B.push({ t: 'intro', text: `W dniu ${dateLong(p.meeting_date)}${p.time ? ` o godz. ${p.time}` : ''}${p.place ? `, w miejscowości ${p.place},` : ''} ${s.entity ? `jedyny wspólnik spółki ${company}${p.krs ? ` (KRS ${p.krs})` : ''} – ${s.entity}${s.rep ? `, reprezentowana przez ${s.rep}` : ''}` : `jedyny wspólnik spółki ${company}${p.krs ? ` (KRS ${p.krs})` : ''} – ${f(sg, 'Pan', 'Pani')} ${fullName(s)}`}, ${s.entity ? 'posiadająca' : f(sg, 'posiadający', 'posiadająca')} wszystkie ${s.shares ? udz(Number(s.shares)) : `${P} udziałów`}${s.value ? ` o łącznej wartości nominalnej ${zl(s.value)}` : ''}, działając na podstawie art. 156 w związku z art. 231 Kodeksu spółek handlowych, ${s.entity ? 'wykonała' : f(sg, 'wykonał', 'wykonała')} uprawnienia Zwyczajnego Zgromadzenia Wspólników i ${s.entity ? 'podjęła' : f(sg, 'podjął', 'podjęła')} następujące uchwały:` });
  } else {
    B.push({ t: 'title', text: 'PROTOKÓŁ' });
    B.push({ t: 'center', text: `ze Zwyczajnego Zgromadzenia Wspólników spółki ${company}${p.seat ? ` (siedziba: ${p.seat})` : ''}${p.krs ? `, KRS ${p.krs}` : ''}` });
    B.push({ t: 'meta', text: `${p.place || P}, ${dateLong(p.meeting_date)}` });
    B.push({ t: 'h', text: '1. Otwarcie Zgromadzenia i wybór Przewodniczącego' });
    B.push({ t: 'p', text: `Zwyczajne Zgromadzenie Wspólników otwarto${p.time ? ` o godz. ${p.time}` : ''}. Na ${f(cg, 'Przewodniczącego', 'Przewodniczącą')} Zgromadzenia ${f(cg, 'wybrany został', 'wybrana została')} ${f(cg, 'Pan', 'Pani')} ${chair} (uchwała nr 1).${p.recorder && p.recorder !== p.chair ? ` Protokół ${f(p.recorder_g, 'sporządził Pan', 'sporządziła Pani')} ${p.recorder}.` : ''}` });
    B.push({ t: 'h', text: '2. Stwierdzenie ważności Zgromadzenia' });
    const pct = totalShares ? Math.round(presentShares / totalShares * 10000) / 100 : null;
    B.push({ t: 'p', text: p.convening === 'art240'
      ? `${f(cg, 'Przewodniczący', 'Przewodnicząca')} Zgromadzenia ${f(cg, 'stwierdził', 'stwierdziła')}, że na Zgromadzeniu reprezentowany jest cały kapitał zakładowy Spółki${p.capital ? ` w wysokości ${zl(num(p.capital))}` : ''}, dzielący się na ${totalShares ? udz(totalShares) : `${P} udziałów`}, uprawniających do ${totalShares ? glos(totalShares) : `${P} głosów`}, a żaden z obecnych nie zgłosił sprzeciwu dotyczącego odbycia Zgromadzenia ani wniesienia poszczególnych spraw do porządku obrad. Zgromadzenie, mimo braku formalnego zwołania, jest zatem ważne i zdolne do podejmowania wiążących uchwał (art. 240 Kodeksu spółek handlowych).`
      : `${f(cg, 'Przewodniczący', 'Przewodnicząca')} Zgromadzenia ${f(cg, 'stwierdził', 'stwierdziła')}, że Zgromadzenie zostało prawidłowo zwołane przez zarząd${p.convened_on ? ` zawiadomieniami wysłanymi w dniu ${dShort(p.convened_on)}` : ''}, zgodnie z art. 238 Kodeksu spółek handlowych, oraz że na Zgromadzeniu reprezentowanych jest ${presentShares ? udz(presentShares) : P} z ogólnej liczby ${totalShares ? udz(totalShares) : P}${pct !== null ? ` (${String(pct).replace('.', ',')}% kapitału zakładowego)` : ''}. Zgromadzenie jest zdolne do podejmowania wiążących uchwał.` });
    B.push({ t: 'p', text: 'Lista obecności, podpisana przez Przewodniczącego Zgromadzenia i obecnych wspólników, stanowi załącznik do protokołu.' });
    B.push({ t: 'h', text: '3. Porządek obrad' });
    B.push({ t: 'p', text: 'Zgromadzenie przyjęło (uchwała nr 2) następujący porządek obrad:' });
    const agenda = [
      'Otwarcie Zgromadzenia i wybór Przewodniczącego.', 'Stwierdzenie prawidłowości zwołania Zgromadzenia i jego zdolności do podejmowania uchwał.', 'Przyjęcie porządku obrad.',
      `Rozpatrzenie i zatwierdzenie sprawozdania finansowego Spółki za ${perName}.`,
      ...(p.mgmt_report ? [`Rozpatrzenie i zatwierdzenie sprawozdania zarządu z działalności Spółki za ${perName}.`] : []),
      ...(profit ? [`Podjęcie uchwały o podziale zysku za ${perName}.`] : loss ? [`Podjęcie uchwały o sposobie pokrycia straty za ${perName}.`] : []),
      ...(board.length ? ['Udzielenie członkom zarządu absolutorium z wykonania obowiązków.'] : []),
      'Zamknięcie Zgromadzenia.',
    ];
    agenda.forEach((a, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: a }));
    B.push({ t: 'h', text: '4. Podjęte uchwały' });
    B.push({ t: 'p', text: `${f(cg, 'Przewodniczący', 'Przewodnicząca')} Zgromadzenia ${f(cg, 'przedstawił', 'przedstawiła')} sprawozdanie finansowe${p.mgmt_report ? ' oraz sprawozdanie zarządu z działalności' : ''} Spółki za ${perName}. Zgromadzenie podjęło następujące uchwały:` });
  }

  for (const r of resolutions) {
    n++;
    B.push({ t: 'h', text: `Uchwała nr ${n}` });
    B.push({ t: 'center', text: `${sole ? 'Jedynego Wspólnika wykonującego uprawnienia Zwyczajnego Zgromadzenia Wspólników' : 'Zwyczajnego Zgromadzenia Wspólników'} spółki ${company} z dnia ${dateLong(p.meeting_date)} w sprawie ${r.title}` });
    B.push({ t: 'ust', n: '§ 1.', text: r.body[0] });
    (r.list || []).forEach((x, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: x }));
    B.push({ t: 'ust', n: '§ 2.', text: 'Uchwała wchodzi w życie z chwilą jej podjęcia.' });
    if (!sole) {
      const voting = r.key === 'abs' && r.own ? presentShares - (Number(r.own.shares) || 0) : presentShares;
      const mode = r.secret ? 'tajnym' : 'jawnym';
      B.push({ t: 'small', text: `Uchwała została podjęta w głosowaniu ${mode}: oddano ${voting ? glos(voting) : `${P} głosów`} ważnych, w tym ${voting ? glos(voting) : P} „za”, 0 głosów „przeciw” i 0 głosów „wstrzymujących się”.${r.key === 'abs' && r.own ? ` ${fullName(r.own)}, jako wspólnik, nie ${f(r.own.g || 'm', 'brał', 'brała')} udziału w głosowaniu nad tą uchwałą (art. 244 Kodeksu spółek handlowych).` : ''}` });
    }
  }

  if (sole) {
    const s = sh[0];
    B.push({ t: 'sign2', left: { label: 'JEDYNY WSPÓLNIK', firm: s.entity || null, people: [s.entity ? (s.rep || `${P} – ${P}`) : fullName(s)] }, right: { label: ' ', firm: null, people: [] } });
  } else {
    B.push({ t: 'h', text: `${5}. Zamknięcie Zgromadzenia` });
    B.push({ t: 'p', text: `Wobec wyczerpania porządku obrad ${f(cg, 'Przewodniczący', 'Przewodnicząca')} ${f(cg, 'zamknął', 'zamknęła')} Zwyczajne Zgromadzenie Wspólników.` });
    B.push({ t: 'sign2', left: { label: f(cg, 'PRZEWODNICZĄCY ZGROMADZENIA', 'PRZEWODNICZĄCA ZGROMADZENIA'), firm: null, people: [chair] },
      right: p.recorder && p.recorder !== p.chair ? { label: f(p.recorder_g, 'PROTOKOLANT', 'PROTOKOLANTKA'), firm: null, people: [p.recorder] } : { label: ' ', firm: null, people: [] } });
    B.push({ t: 'pb' });
    B.push({ t: 'att', text: `Lista obecności – Zwyczajne Zgromadzenie Wspólników spółki ${company}, ${dateLong(p.meeting_date)}` });
    B.push({ t: 'kv', head: ['Wspólnik', 'Udziały / głosy / podpis'],
      rows: sh.map(s => [fullName(s) + (s.entity && s.rep ? `, reprezentowana przez: ${s.rep}` : ''), `${s.shares ? `${udz(Number(s.shares))} = ${glos(Number(s.shares))}` : P}${s.present === false ? ' – nieobecny' : ' · podpis: ……………………………'}`]) });
    B.push({ t: 'small', text: `Razem obecni: ${presentShares ? udz(presentShares) : P} z ${totalShares ? udz(totalShares) : P}.` });
    B.push({ t: 'sign2', left: { label: f(cg, 'PRZEWODNICZĄCY ZGROMADZENIA', 'PRZEWODNICZĄCA ZGROMADZENIA'), firm: null, people: [chair] }, right: { label: ' ', firm: null, people: [] } });
  }
  return B;
}

export const companyBrand = p => ({
  key: 'plain', plain: true, logo: null, ratio: 1, alt: '', lines: [],
  foot1: `${(p.company || '').trim()}${p.krs ? ` · KRS ${p.krs}` : ''}${p.nip ? ` · NIP ${p.nip}` : ''}`,
  foot2: `Protokół ZZW – zatwierdzenie sprawozdania finansowego za ${(p.period_to || '').slice(0, 4)}`,
  firmName: p.company, firmAddress: p.address, city: p.place,
});
