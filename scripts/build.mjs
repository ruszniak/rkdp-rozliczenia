// Krok budowania na Vercelu: kopiuje bibliotekę Supabase i zapisuje konfigurację.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
