// Krok budowania na Vercelu: kopiuje bibliotekę Supabase i zapisuje konfigurację.
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('@supabase/supabase-js/package.json'));
mkdirSync('public/vendor', { recursive: true });
copyFileSync(join(pkgDir, 'dist/umd/supabase.js'), 'public/vendor/supabase.js');

const env = process.env;
// Publiczne dane projektu Supabase (URL i klucz publishable są z założenia jawne —
// trafiają do przeglądarki; dane chronią zasady RLS w bazie). Zmienne środowiskowe Vercel mają pierwszeństwo.
const DEFAULT_URL = 'https://iuszfoyttqnkzjzjpzma.supabase.co';
const DEFAULT_KEY = 'sb_publishable_74tucWy_7_QYZsYSuAZayw_pV7ZYXz3';
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY;
if (!url || !key) {
  console.error('Brak zmiennych NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY w ustawieniach projektu Vercel.');
  process.exit(1);
}
if (/service_role|sb_secret_/.test(key) || /"role"\s*:\s*"service_role"/.test(Buffer.from(key.split('.')[1] || '', 'base64').toString())) {
  console.error('SUPABASE_ANON_KEY wygląda na klucz service_role / secret. Użyj klucza anon (publishable).');
  process.exit(1);
}
writeFileSync('public/config.js',
  `window.RKDP_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })};\n`);
console.log('OK: vendor/supabase.js i config.js gotowe');

// ---- Optymalizacja: jeden zminifikowany pakiet JS (z podziałem na części ładowane na żądanie) i CSS z odciskiem w nazwie.
// Pliki w /assets mają w nazwie skrót treści, więc przeglądarka trzyma je w pamięci na stałe (Cache-Control: immutable),
// a po każdej zmianie kodu nazwa się zmienia. Jeśli esbuild nie jest dostępny, aplikacja działa ze źródeł jak dotąd.
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
try {
  const esbuild = await import('esbuild');
  rmSync('public/assets', { recursive: true, force: true });
  const res = await esbuild.build({
    entryPoints: ['public/js/main.js'], bundle: true, splitting: true, format: 'esm', minify: true, target: ['es2020'],
    outdir: 'public/assets', entryNames: 'app-[hash]', chunkNames: 'c-[hash]', metafile: true, legalComments: 'none', logLevel: 'warning',
  });
  const entry = Object.entries(res.metafile.outputs).find(([, o]) => o.entryPoint === 'public/js/main.js')[0].replace(/^public/, '');
  const css = await esbuild.transform(readFileSync('public/app.css', 'utf8'), { loader: 'css', minify: true });
  const cssName = `app-${hash(css.code)}.css`;
  writeFileSync(`public/assets/${cssName}`, css.code);
  const sbJs = readFileSync('public/vendor/supabase.js');
  const sbName = `supabase-${hash(sbJs)}.js`;
  writeFileSync(`public/assets/${sbName}`, sbJs);
  let html = readFileSync('public/index.html', 'utf8');
  html = html
    .replace('<link rel="stylesheet" href="/app.css">', `<link rel="stylesheet" href="/assets/${cssName}">\n  <link rel="modulepreload" href="${entry}">`)
    .replace('<script src="/vendor/supabase.js"></script>', `<script src="/assets/${sbName}"></script>`)
    .replace('<script type="module" src="/js/main.js"></script>', `<script type="module" src="${entry}"></script>`);
  if (!html.includes(entry) || !html.includes(cssName)) throw new Error('nie udało się podmienić odwołań w index.html');
  writeFileSync('public/index.html', html);
  // wersja demonstracyjna (/demo/?k=…) – ten sam pakiet aplikacji, dane fikcyjne w przeglądarce
  let demo = readFileSync('public/demo/index.html', 'utf8');
  demo = demo.replace('<meta name="app-entry" content="/js/main.js">', `<meta name="app-entry" content="${entry}">`)
    .replace('<link rel="stylesheet" href="/app.css">', `<link rel="stylesheet" href="/assets/${cssName}">`);
  if (!demo.includes(entry)) throw new Error('nie udało się podmienić odwołań w demo/index.html');
  writeFileSync('public/demo/index.html', demo);
  const files = readdirSync('public/assets');
  const kb = files.reduce((s, f) => s + readFileSync('public/assets/' + f).length, 0) / 1024;
  console.log(`OK: pakiet ${entry} + ${files.length - 1} plików, razem ${kb.toFixed(0)} kB`);
} catch (e) {
  console.warn('Pominięto pakietowanie (aplikacja działa ze źródeł):', e.message);
}
