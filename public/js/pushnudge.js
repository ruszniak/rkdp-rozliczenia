// Zachęta na Pulpicie / w „Moich sprawach”: zainstaluj aplikację i włącz powiadomienia na tym urządzeniu
// (bez powiadomień pracownik nie dowie się od razu o nowym zleceniu ani o odpowiedzi).
import { h, toast, fail } from './ui.js';
import { isIOS, isStandalone, pushSupported, canInstall, promptInstall, currentSubscription, enablePush, DEFAULT_PREFS } from './push.js';

const KEY = 'rkdp-push-nudge-hidden';
const hiddenUntil = () => { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } };
const hide = days => { try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch { /* */ } };

export function pushNudge() {
  const box = h('div', { class: 'push-nudge', hidden: true });
  (async () => {
    if (Date.now() < hiddenUntil()) return;
    const ios = isIOS(), standalone = isStandalone();
    if (!ios && !pushSupported()) return;
    if (pushSupported()) {
      const sub = await currentSubscription().catch(() => null);
      if (sub && Notification.permission === 'granted') return;
    }
    const later = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { hide(7); box.remove(); } }, 'Później');
    let text, actions = [];
    if (ios && !standalone) {
      text = [h('b', {}, 'Zainstaluj aplikację na iPhonie, żeby dostawać powiadomienia o zleceniach'), h('br'),
        h('span', { class: 'small' }, 'W Safari stuknij „Udostępnij” (kwadrat ze strzałką) → „Do ekranu początkowego” → „Dodaj”. Potem otwórz aplikację z nowej ikony i włącz tu powiadomienia.')];
    } else {
      text = [h('b', {}, 'Włącz powiadomienia na tym urządzeniu'), h('br'),
        h('span', { class: 'small' }, 'Od razu dowiesz się o nowym zleceniu, pytaniu albo odpowiedzi – bez sprawdzania poczty.' + (!standalone && !ios ? ' Możesz też zainstalować aplikację – będzie miała własną ikonę na pulpicie i w pasku zadań.' : ''))];
      const on = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
        on.disabled = true;
        try { await enablePush(DEFAULT_PREFS); toast('Powiadomienia włączone na tym urządzeniu'); box.remove(); }
        catch (e) { on.disabled = false; fail(e, 'Powiadomienia'); }
      } }, 'Włącz powiadomienia');
      actions.push(on);
      if (canInstall()) actions.push(h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => promptInstall() }, 'Zainstaluj aplikację'));
    }
    box.replaceChildren(h('span', { class: 'pn-ico', 'aria-hidden': 'true' }, '🔔'), h('span', { class: 'pn-txt' }, ...text), h('span', { class: 'pn-act' }, ...actions, later));
    box.hidden = false;
  })().catch(() => {});
  return box;
}
