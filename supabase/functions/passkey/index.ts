// Face ID / odcisk palca (passkey, WebAuthn) w aplikacji na telefonie.
// Akcje:
//  • register_options / register_verify – włączenie Face ID na tym telefonie (zalogowany, sesja potwierdzona),
//  • login_options / login_verify – logowanie twarzą (bez hasła i kodu); zwraca jednorazowy token sesji + przepustkę do auth_passkey_step,
//  • unlock_options / unlock_verify – odblokowanie aplikacji przy uruchomieniu (zalogowany),
//  • remove – usunięcie klucza (właściciel albo administrator).
// W bazie zapisujemy tylko klucz publiczny; podpis sprawdza @simplewebauthn/server.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@13';

const RP_ID = 'rozliczenia.rkdp.pl';
const ORIGIN = 'https://rozliczenia.rkdp.pl';
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const b64u = {
  enc: (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
const randomToken = () => b64u.enc(crypto.getRandomValues(new Uint8Array(32)));
const sha256hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

// członek zespołu z potwierdzoną sesją (hasło + kod albo Face ID)
async function currentMember(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth) return null;
  const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: id } = await sb.rpc('current_member_id');
  if (!id) return null;
  const { data: m } = await db.from('team_members').select('id, email, full_name, role, active').eq('id', id).maybeSingle();
  return m?.active ? m : null;
}

async function saveChallenge(kind: string, challenge: string, memberId: string | null) {
  // sprzątanie starych wyzwań
  await db.from('passkey_challenges').delete().lt('created_at', new Date(Date.now() - 10 * 60000).toISOString());
  const { data, error } = await db.from('passkey_challenges').insert({ kind, challenge, member_id: memberId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
async function takeChallenge(id: string, kind: string) {
  if (!id) return null;
  const { data } = await db.from('passkey_challenges').delete().eq('id', id).eq('kind', kind)
    .gt('created_at', new Date(Date.now() - 5 * 60000).toISOString()).select('challenge, member_id').maybeSingle();
  return data;
}

async function checkAssertion(response: any, challenge: string, memberId?: string) {
  const credId = String(response?.id || '');
  let q = db.from('passkeys').select('id, member_id, credential_id, public_key, counter, transports').eq('credential_id', credId);
  if (memberId) q = q.eq('member_id', memberId);
  const { data: pk } = await q.maybeSingle();
  if (!pk) return { error: 'Ten klucz Face ID nie jest już zapisany w aplikacji. Zaloguj się hasłem i włącz Face ID ponownie.' };
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    credential: { id: pk.credential_id, publicKey: b64u.dec(pk.public_key), counter: Number(pk.counter) || 0, transports: pk.transports || undefined },
  });
  if (!v.verified) return { error: 'Nie udało się potwierdzić twarzy.' };
  await db.from('passkeys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', pk.id);
  return { pk };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'register_options') {
      const m = await currentMember(req);
      if (!m) return json({ error: 'Brak dostępu' }, 401);
      const { data: existing } = await db.from('passkeys').select('credential_id, transports').eq('member_id', m.id);
      const opts = await generateRegistrationOptions({
        rpName: 'RKDP Rozliczenia', rpID: RP_ID,
        userName: m.email, userDisplayName: m.full_name || m.email,
        userID: new TextEncoder().encode(m.id),
        attestationType: 'none',
        excludeCredentials: (existing || []).map(e => ({ id: e.credential_id, transports: e.transports || undefined })),
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
        timeout: 120000,
      });
      const cid = await saveChallenge('register', opts.challenge, m.id);
      return json({ options: opts, challenge_id: cid });
    }

    if (action === 'register_verify') {
      const m = await currentMember(req);
      if (!m) return json({ error: 'Brak dostępu' }, 401);
      const ch = await takeChallenge(body.challenge_id, 'register');
      if (!ch || ch.member_id !== m.id) return json({ error: 'Minęło za dużo czasu – spróbuj ponownie.' }, 400);
      const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return json({ error: 'Nie udało się zapisać Face ID.' }, 400);
      const c = v.registrationInfo.credential;
      const { error } = await db.from('passkeys').insert({
        member_id: m.id, credential_id: c.id, public_key: b64u.enc(c.publicKey), counter: c.counter || 0,
        transports: c.transports || body.response?.response?.transports || null, label: String(body.label || '').slice(0, 80) || null,
      });
      if (error) return json({ error: 'Nie udało się zapisać Face ID: ' + error.message }, 400);
      return json({ ok: true, credential_id: c.id });
    }

    if (action === 'login_options' || action === 'unlock_options') {
      const unlock = action === 'unlock_options';
      let m: any = null, allow: any[] | undefined;
      if (unlock) {
        m = await currentMember(req);
        if (!m) return json({ error: 'Sesja wygasła' }, 401);
        const { data } = await db.from('passkeys').select('credential_id, transports').eq('member_id', m.id);
        if (!data?.length) return json({ error: 'Brak Face ID', none: true }, 400);
        allow = data.map(e => ({ id: e.credential_id, transports: e.transports || undefined }));
      } else if (body.credential_id) {
        // ten telefon pamięta swój klucz – podpowiadamy go od razu (bez listy kont)
        allow = [{ id: String(body.credential_id) }];
      }
      const opts = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: allow, timeout: 120000 });
      const cid = await saveChallenge(unlock ? 'unlock' : 'login', opts.challenge, m?.id || null);
      return json({ options: opts, challenge_id: cid });
    }

    if (action === 'unlock_verify') {
      const m = await currentMember(req);
      if (!m) return json({ error: 'Sesja wygasła' }, 401);
      const ch = await takeChallenge(body.challenge_id, 'unlock');
      if (!ch || ch.member_id !== m.id) return json({ error: 'Minęło za dużo czasu – spróbuj ponownie.' }, 400);
      const r = await checkAssertion(body.response, ch.challenge, m.id);
      if (r.error) return json({ error: r.error }, 400);
      return json({ ok: true });
    }

    if (action === 'login_verify') {
      const ch = await takeChallenge(body.challenge_id, 'login');
      if (!ch) return json({ error: 'Minęło za dużo czasu – spróbuj ponownie.' }, 400);
      const r = await checkAssertion(body.response, ch.challenge);
      if (r.error || !r.pk) return json({ error: r.error }, 400);
      const { data: m } = await db.from('team_members').select('id, email, active').eq('id', r.pk.member_id).maybeSingle();
      if (!m?.active) return json({ error: 'To konto nie ma już dostępu do aplikacji.' }, 403);
      // jednorazowy token sesji (bez wysyłania e-maila) + przepustka potwierdzająca logowanie twarzą
      const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: m.email });
      if (error || !link?.properties?.hashed_token) return json({ error: 'Nie udało się zalogować – spróbuj hasłem.' }, 500);
      const grant = randomToken();
      await db.from('passkey_grants').delete().lt('created_at', new Date(Date.now() - 10 * 60000).toISOString());
      await db.from('passkey_grants').insert({ token_hash: await sha256hex(grant), member_id: m.id });
      return json({ email: m.email, token_hash: link.properties.hashed_token, grant });
    }

    if (action === 'remove') {
      const m = await currentMember(req);
      if (!m) return json({ error: 'Brak dostępu' }, 401);
      let q = db.from('passkeys').delete().eq('id', String(body.id || ''));
      if (m.role !== 'admin') q = q.eq('member_id', m.id);
      const { data, error } = await q.select('id');
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, removed: data?.length || 0 });
    }

    return json({ error: 'Nieznana akcja' }, 400);
  } catch (e) {
    console.error('passkey', e);
    return json({ error: (e as Error).message || 'Błąd' }, 500);
  }
});
