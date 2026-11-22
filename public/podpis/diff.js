// Porównanie dwóch wersji dokumentu (HTML podglądu umowy): zaznacza zmienione akapity –
// usunięte słowa <del>, dodane <ins>, usunięte akapity przekreślone. Wspólne dla strony klienta (/podpis/) i aplikacji.
// Użycie: DocDiff.mark(nowyHtml, staryHtml) → { html, labels: ['§ 9', '§ 12'], count }
(function (g) {
  'use strict';
  var norm = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var STYLE = 'ins.dd,del.dd{text-decoration:none;border-radius:2px;padding:0 1px}ins.dd{background:#DDF0D8;color:#14532D}'
    + 'del.dd{background:#FBE1DC;color:#7F1D1D;text-decoration:line-through}.dd-chg{box-shadow:-6px 0 0 #E8C58C;background:#FFFBF2}'
    + '.dd-new{box-shadow:-6px 0 0 #7FB97A;background:#F2FAF0}.dd-del{box-shadow:-6px 0 0 #E7A49A;opacity:.85}.dd-del *{text-decoration:line-through;color:#7F1D1D}';

  function lcs(a, b, eq) {
    var n = a.length, m = b.length, i, j, t = [];
    for (i = 0; i <= n; i++) { t.push(new Uint16Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    var out = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
    }
    return out;
  }
  function wordDiff(oldT, newT) {
    var A = oldT.split(/(\s+)/).filter(Boolean), B = newT.split(/(\s+)/).filter(Boolean);
    if (A.length * B.length > 400000) return '<del class="dd">' + esc(oldT) + '</del> <ins class="dd">' + esc(newT) + '</ins>';
    var m = lcs(A, B, function (x, y) { return x === y; }), out = '', i = 0, j = 0, k, d, a;
    var flush = function (ti, tj) {
      d = A.slice(i, ti).join(''); a = B.slice(j, tj).join('');
      if (norm(d)) out += '<del class="dd">' + esc(d) + '</del>'; else out += esc(d);
      if (norm(a)) out += '<ins class="dd">' + esc(a) + '</ins>'; else if (!norm(d)) out += '';
    };
    for (k = 0; k < m.length; k++) { flush(m[k][0], m[k][1]); out += esc(B[m[k][1]]); i = m[k][0] + 1; j = m[k][1] + 1; }
    flush(A.length, B.length);
    return out;
  }
  function container(doc) { return doc.querySelector('.paper') || doc.body; }
  function blocks(el) {
    return Array.prototype.filter.call(el.children, function (c) { return !/^(SCRIPT|STYLE)$/.test(c.tagName) && !c.classList.contains('lh-c') && !c.classList.contains('lh'); });
  }
  function labelFor(list, idx) {
    for (var i = idx; i >= 0; i--) { var m = norm(list[i].textContent).match(/^§\s*\d+[a-z]?/i); if (m) return m[0].replace(/\s+/, ' '); }
    var t = norm(list[idx].textContent); return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }
  function mark(newHtml, oldHtml) {
    var P = new DOMParser(), nd = P.parseFromString(newHtml || '', 'text/html'), od = P.parseFromString(oldHtml || '', 'text/html');
    var nb = blocks(container(nd)), ob = blocks(container(od));
    if (!nb.length || !ob.length || nb.length * ob.length > 600000) return { html: newHtml, labels: [], count: 0 };
    var nt = nb.map(function (x) { return norm(x.textContent); }), ot = ob.map(function (x) { return norm(x.textContent); });
    var m = lcs(ot, nt, function (x, y) { return x === y; });
    m.push([ot.length, nt.length]);
    var labels = [], count = 0, oi = 0, ni = 0, k, d, a, j;
    var add = function (l) { if (l && labels.indexOf(l) < 0) labels.push(l); };
    for (k = 0; k < m.length; k++) {
      var olds = ob.slice(oi, m[k][0]), news = nb.slice(ni, m[k][1]);
      for (j = 0; j < Math.max(olds.length, news.length); j++) {
        d = olds[j]; a = news[j];
        if (a && d && (norm(d.textContent) || norm(a.textContent))) {
          a.innerHTML = wordDiff(norm(d.textContent), norm(a.textContent)); a.classList.add('dd-chg'); count++; add(labelFor(nb, ni + j));
        } else if (a && norm(a.textContent)) { a.classList.add('dd-new'); count++; add(labelFor(nb, ni + j)); }
        else if (d && norm(d.textContent)) {
          var c = nd.importNode(d, true); c.classList.add('dd-del');
          var before = nb[m[k][1]] || null, host = container(nd);
          if (before && before.parentNode === host) host.insertBefore(c, before); else host.appendChild(c);
          count++; add(ni + j > 0 ? labelFor(nb, Math.min(ni + j, nb.length) - 1) : null);
        }
      }
      oi = m[k][0] + 1; ni = m[k][1] + 1;
    }
    var st = nd.createElement('style'); st.textContent = STYLE; (nd.head || nd.documentElement).appendChild(st);
    return { html: '<!doctype html>' + nd.documentElement.outerHTML, labels: labels, count: count };
  }
  g.DocDiff = { mark: mark };
})(typeof window !== 'undefined' ? window : globalThis);
