// Klucz podpisu aplikacji Android (rdp.app) dla automatycznego budowania na GitHubie.
// Bez stałych haseł w repozytorium: workflow przedstawia token OIDC wystawiony przez GitHub,
// a funkcja wydaje klucz tylko dla repozytorium ruszniak/rkdp-rozliczenia, gałęzi main i workflow android.yml.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks'));
const REPO = 'ruszniak/rkdp-rozliczenia';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  const token = (req.headers.get('x-github-oidc') || '').trim();
  if (!token) return json({ error: 'Brak tokenu' }, 401);
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: 'app-r-apk' });
    const wf = String(payload.job_workflow_ref || payload.workflow_ref || '');
    if (payload.repository !== REPO || payload.ref !== 'refs/heads/main' || !wf.startsWith(`${REPO}/.github/workflows/android.yml@`)) {
      console.error('odrzucono', payload.repository, payload.ref, wf);
      return json({ error: 'Brak dostępu' }, 403);
    }
    const { data, error } = await admin.rpc('apk_signing');
    if (error || !data?.keystore) return json({ error: 'Brak klucza' }, 500);
    return json(data);
  } catch (e) {
    console.error(e);
    return json({ error: 'Nieprawidłowy token' }, 401);
  }
});
