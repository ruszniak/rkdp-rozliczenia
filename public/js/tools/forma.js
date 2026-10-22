// Kalkulator formy opodatkowania: JDG (skala, liniowy, ryczałt) vs sp. z o.o. (CIT klasyczny, CIT estoński).
// Wyliczenie roczne, poglądowe – parametry na 2026 r.

export const PARAMS = {
  2026: {
    rok: 2026,
    minWage: 4806,
    // pełny ZUS: podstawa 5 652 zł (60% prognozowanego przeciętnego wynagrodzenia 9 420 zł)
    zusFull: { spol: 1103.27 + 452.16 + 94.39, chor: 138.47, fp: 138.47 },
    // preferencyjny: podstawa 1 441,80 zł (30% minimalnego wynagrodzenia), bez FP
    zusPref: { spol: 281.44 + 115.35 + 24.08, chor: 35.32, fp: 0 },
    zdrMin: 432.54,            // minimalna składka zdrowotna (skala, liniowy) – 9% × 4 806 zł
    zdrLinLimit: 14100,        // limit odliczenia składki zdrowotnej przy podatku liniowym
    zdrRycz: [498.35, 830.58, 1495.04], // ryczałt: do 60 tys., do 300 tys., powyżej 300 tys. przychodu
    zdrWspolnik: 830.58,       // wspólnik jednoosobowej sp. z o.o. – 9% przeciętnego wynagrodzenia z IV kw. 2025 r.
    prog: 120000, kwotaZmn: 3600, danina: 1000000,
  },
};

const r2 = v => Math.round(v * 100) / 100;
const pos = v => Math.max(0, v);

// roczne składki społeczne JDG (z FP) wg wariantu
export function zusJdg(P, variant, chor) {
  const m = z => z.spol + (chor ? z.chor : 0) + z.fp;
  if (variant === 'pref') return 12 * m(P.zusPref);
  if (variant === 'start') return 6 * m(P.zusPref); // 6 mies. ulgi na start (0 zł) + 6 mies. preferencyjnego
  if (variant === 'brak') return 0;
  return 12 * m(P.zusFull);
}

/**
 * in: { rok, przychod, koszty, zus: 'pelny'|'pref'|'start'|'brak', chor: bool, wspolnicy: 1|2,
 *       wyplata: 0..1, maly: bool, kosztySpolki: number, ryczalt: 0 | stawka (np. 0.12) }
 */
export function compute(inp) {
  const P = PARAMS[inp.rok] || PARAMS[2026];
  const R = Number(inp.przychod) || 0, K = Number(inp.koszty) || 0;
  const D = R - K;
  const S = zusJdg(P, inp.zus, inp.chor);
  const B = pos(D - S);
  const zdrMinY = 12 * P.zdrMin;
  const out = [];

  // --- JDG skala ---
  {
    const zdr = Math.max(zdrMinY, 0.09 * B);
    const pit = B <= P.prog ? pos(0.12 * B - P.kwotaZmn) : 0.12 * P.prog - P.kwotaZmn + 0.32 * (B - P.prog);
    const dan = 0.04 * pos(B - P.danina);
    out.push(row('skala', 'JDG – skala', '12% / 32%, zdrowotna 9%', D, { zus: S, zdr, pit, dan }, D - S - zdr - pit - dan, 0));
  }
  // --- JDG liniowy ---
  {
    const zdr = Math.max(zdrMinY, 0.049 * B);
    const base = pos(B - Math.min(zdr, P.zdrLinLimit));
    const pit = 0.19 * base;
    const dan = 0.04 * pos(base - P.danina);
    out.push(row('liniowy', 'JDG – liniowy', '19%, zdrowotna 4,9%', D, { zus: S, zdr, pit, dan }, D - S - zdr - pit - dan, 0));
  }
  // --- JDG ryczałt (opcjonalnie) ---
  if (inp.ryczalt) {
    const zdr = 12 * (R <= 60000 ? P.zdrRycz[0] : R <= 300000 ? P.zdrRycz[1] : P.zdrRycz[2]);
    const base = pos(R - S - 0.5 * zdr);
    const pit = inp.ryczalt * base;
    const pct = String(Math.round(inp.ryczalt * 1000) / 10).replace('.', ',');
    out.push(row('ryczalt', 'JDG – ryczałt', `${pct}% od przychodu, zdrowotna wg progów`, D, { zus: S, zdr, pit, dan: 0 }, D - S - zdr - pit, 0));
  }

  // --- spółka ---
  const DS = D - (Number(inp.kosztySpolki) || 0);
  const f = Math.min(1, Math.max(0, Number(inp.wyplata)));
  const sole = Number(inp.wspolnicy) === 1;
  const zusW = sole ? 12 * (P.zusFull.spol + (inp.chor ? P.zusFull.chor : 0) + P.zusFull.fp) : 0;
  const zdrW = sole ? 12 * P.zdrWspolnik : 0;

  {
    const rate = inp.maly ? 0.09 : 0.19;
    const cit = rate * pos(DS);
    const net = DS - cit;
    const div = f * pos(net);
    const pit = 0.19 * div;
    out.push(row('cit', 'Sp. z o.o. – CIT', `CIT ${inp.maly ? 9 : 19}% + 19% od dywidendy`, D, { zus: zusW, zdr: zdrW, cit, pit, koszt: D - DS }, div - pit - zusW - zdrW, net - div));
  }
  {
    const rate = inp.maly ? 0.10 : 0.20, ded = inp.maly ? 0.9 : 0.7;
    const avail = pos(DS);
    const dist = f * avail / (1 + rate); // ryczałt płacony od wypłaconego zysku – wypłata + ryczałt mieszczą się w zysku
    const cit = rate * dist;
    const pit = pos(0.19 * dist - ded * cit);
    const left = (DS - dist - cit);
    out.push(row('estonski', 'CIT estoński', `ryczałt ${inp.maly ? 10 : 20}% przy wypłacie, PIT −${Math.round(ded * 100)}% ryczałtu`, D, { zus: zusW, zdr: zdrW, cit, pit, koszt: D - DS }, dist - pit - zusW - zdrW, left));
  }

  // najkorzystniej = najwięcej na rękę + zysk zatrzymany w spółce (przy pełnej wypłacie – po prostu na rękę)
  const score = x => x.naReke + x.wSpolce;
  const best = out.reduce((a, b) => score(b) > score(a) ? b : a, out[0]);
  best.best = true;
  return { P, D, S, rows: out, sole, f };
}

function row(key, label, sub, D, parts, naReke, wSpolce) {
  const p = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r2(v || 0)]));
  const obc = r2((p.zus || 0) + (p.zdr || 0) + (p.pit || 0) + (p.dan || 0) + (p.cit || 0));
  return { key, label, sub, dochod: r2(D), ...p, obc, naReke: r2(naReke), wSpolce: r2(wSpolce), stopa: D > 0 ? obc / D : null };
}
