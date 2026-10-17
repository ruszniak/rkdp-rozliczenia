// Połączenie z Supabase i wspólny stan aplikacji
const cfg = window.RKDP_CONFIG || {};
if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  document.getElementById('app').innerHTML =
    '<div class="empty">Brak konfiguracji Supabase (SUPABASE_URL / SUPABASE_ANON_KEY w ustawieniach Vercel).</div>';
  throw new Error('Brak konfiguracji');
}

export const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const state = {
  session: null,
  me: null,
  members: [],
  taskTypes: [],
};

export const canEditClients = () => ['admin', 'full'].includes(state.me?.role) && hasModule('rozliczenia');
export const isAdmin = () => state.me?.role === 'admin';
export const memberById = id => state.members.find(m => m.id === id);
export const activeTasks = () => state.taskTypes.filter(t => t.active);
export const hasModule = (m) => (state.me?.modules || ['rozliczenia']).includes(m);
