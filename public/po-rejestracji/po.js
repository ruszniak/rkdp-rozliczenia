// Instrukcja po rejestracji spółki: ?firma=… (nazwa klienta), ?osoba=…, ?email=…, ?tel=… (kto z biura się kontaktuje) – wszystko jako tekst.
(() => {
  const q = new URLSearchParams(location.search);
  const val = k => (q.get(k) || '').trim().slice(0, 120);
  const firma = val('firma'), osoba = val('osoba'), email = val('email'), tel = val('tel').replace(/[^\d+ ]/g, '');
  if (firma) { const el = document.getElementById('firma'); el.textContent = firma; el.hidden = false; }
  const okMail = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(email);
  if (okMail) {
    const a = document.createElement('a'); a.href = 'mailto:' + email; a.textContent = email;
    const s = document.getElementById('mail-to'); s.append('na adres ', a);
  }
  if (osoba || okMail || tel) {
    const p = document.getElementById('kontakt-osoba');
    p.append('Państwa opiekun: ');
    if (osoba) { const b = document.createElement('strong'); b.textContent = osoba; p.append(b); }
    if (okMail) { const a = document.createElement('a'); a.href = 'mailto:' + email; a.textContent = email; p.append(osoba ? ' · ' : '', a); }
    if (tel) { const a = document.createElement('a'); a.href = 'tel:' + tel.replace(/ /g, ''); a.textContent = tel; p.append(' · ', a); }
    p.hidden = false;
  }
})();
