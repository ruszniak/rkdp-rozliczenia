// Instrukcja KSeF w Saldeo: ?firma=…&k=…&ke=…&kt=… (księgowa) &h=…&he=…&ht=… (kadry i płace) – wszystko jako tekst.
(() => {
  const q = new URLSearchParams(location.search);
  const val = k => (q.get(k) || '').trim().slice(0, 120);
  const okMail = e => /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e);
  const firma = val('firma');
  if (firma) { const el = document.getElementById('firma'); el.textContent = firma; el.hidden = false; }
  const team = document.getElementById('team');
  const card = (role, name, mail, tel) => {
    if (!name) return;
    const d = document.createElement('div'); d.className = 'person';
    const s = document.createElement('small'); s.textContent = role;
    const b = document.createElement('b'); b.textContent = name;
    d.append(s, b);
    if (okMail(mail)) { const a = document.createElement('a'); a.href = 'mailto:' + mail; a.textContent = mail; d.append(a); }
    const t = tel.replace(/[^\d+ ]/g, '');
    if (t) { const a = document.createElement('a'); a.href = 'tel:' + t.replace(/ /g, ''); a.textContent = t; d.append(a); }
    team.append(d);
  };
  card('Państwa księgowa / księgowy', val('k'), val('ke'), val('kt'));
  card('Kadry i płace', val('h'), val('he'), val('ht'));
  if (team.children.length) document.getElementById('zespol').hidden = false;
})();
