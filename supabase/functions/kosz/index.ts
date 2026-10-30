// Kosz na pliki: codzienne usuwanie z magazynu plików, które leżą w koszu (file_trash) dłużej niż 30 dni.
// Wywołanie tylko z harmonogramu bazy (x-push-secret, { action: 'purge' }).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const given = req.headers.get('x-push-secret') || '';
    const s = await hookSecret();
    if (!given || !s || given !== s) return json({ error: 'Brak dostępu' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action !== 'purge') return json({ error: 'Nieznana operacja' }, 400);
    const { data: rows, error } = await admin.from('file_trash').select('id,bucket,path').lt('purge_after', new Date().toISOString()).limit(500);
    if (error) throw error;
    let removed = 0; const errors: string[] = [];
    const byBucket = new Map<string, any[]>();
    for (const r of rows || []) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) || []), r]);
    for (const [bucket, list] of byBucket) {
      for (let i = 0; i < list.length; i += 100) {
        const part = list.slice(i, i + 100);
        const { error: e } = await admin.storage.from(bucket).remove(part.map(r => r.path));
        if (e) { errors.push(`${bucket}: ${e.message}`); continue; }
        await admin.from('file_trash').delete().in('id', part.map(r => r.id));
        removed += part.length;
      }
    }
    return json({ removed, errors });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
