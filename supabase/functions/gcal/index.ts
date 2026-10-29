// Integracja z Kalendarzem Google M2 TAX została wyłączona (rezygnacja z kalendarza w aplikacji).
// Funkcja zostaje jako zaślepka, żeby stare wywołania nie powodowały błędów.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve((req: Request) => req.method === 'OPTIONS' ? new Response('ok', { headers: CORS })
  : new Response(JSON.stringify({ configured: false, reason: 'Integracja z Kalendarzem Google jest wyłączona.' }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }));
