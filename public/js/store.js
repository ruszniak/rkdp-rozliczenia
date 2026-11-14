// Połączenie z Supabase i wspólny stan aplikacji
const cfg = window.RKDP_CONFIG || {};
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  document.getElementById('app').innerHTML =
    '<div class="empty">Brak konfiguracji Supabase (SUPABASE_URL / SUPABASE_ANON_KEY w ustawieniach Vercel).</div>';
  throw new Error('Brak konfiguracji');
}

import { cachedFetch } from './cache.js';
export { setStaleHandler, invalidateCache, cacheableRoute, autoRefreshRoute } from './cache.js';

export const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: cachedFetch },
});

export const state = {
  session: null,
  me: null,
  members: [],      // zespół kancelarii (RKDP / M2 TAX) – do wyboru osób
  allMembers: [],   // także konta zewnętrzne (partnerzy – biura rachunkowe, tylko JPK) – do pokazywania nazwisk
  taskTypes: [],
};

export const canEditClients = () => ['admin', 'full'].includes(state.me?.role) && hasModule('rozliczenia');
export const isAdmin = () => state.me?.role === 'admin';
export const memberById = id => state.allMembers.find(m => m.id === id) || state.members.find(m => m.id === id);
export const isStaffMember = m => (m?.modules || ['rozliczenia']).some(x => x === 'rozliczenia' || x === 'doradztwo');
export const activeTasks = () => state.taskTypes.filter(t => t.active);
export const hasModule = (m) => (state.me?.modules || ['rozliczenia']).includes(m);
// konto tylko do podglądu plików JPK (bez dostępu do danych RKDP i M2 TAX)
export const isJpkOnly = () => (hasModule('jpk') || hasModule('partner')) && !hasModule('rozliczenia') && !hasModule('doradztwo');
// konto pracownika biura rachunkowego w Programie Partner M2 TAX: zadania dla doradców, wzory, JPK
export const isPartner = () => hasModule('partner') && !hasModule('rozliczenia') && !hasModule('doradztwo');
