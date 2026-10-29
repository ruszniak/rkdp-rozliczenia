// Wejście do wersji demonstracyjnej tylko z linku: ?k=<klucz>. W kodzie jest wyłącznie skrót SHA-256 klucza,
// więc samo repozytorium nie zdradza adresu. Bez poprawnego klucza nic się nie wczytuje.
(async function () {
  const HASH = '527d7bde0f1af2d5ffe6dc1859be9ca1aa6c8f94b92bd3b7003ea622658e1984';
  const key = new URLSearchParams(location.search).get('k') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!key || hex !== HASH) {
    document.getElementById('app').innerHTML = '<div style="max-width:420px;margin:18vh auto;text-align:center;font-family:Inter,Arial,sans-serif;color:#2B2722"><img src="/logo-rkdp.png" alt="" style="height:42px"><h1 style="font-size:20px;margin:22px 0 8px">Brak dostępu</h1><p style="color:#6A6157">Ta strona jest dostępna wyłącznie z otrzymanego linku.</p></div>';
    return;
  }
  const load = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.body.append(s); });
  await load('/demo/demo-dane.js');
  await load('/demo/demo-silnik.js');
  const entry = document.querySelector('meta[name="app-entry"]').content;
  const m = document.createElement('script'); m.type = 'module'; m.src = entry; document.body.append(m);
  // pasek „wersja demonstracyjna”
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.innerHTML = 'Wersja demonstracyjna · wszystkie dane są fikcyjne · zmiany znikają po odświeżeniu strony';
  document.body.append(bar);
})();
