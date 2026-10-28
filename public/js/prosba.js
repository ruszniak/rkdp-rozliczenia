// Prośba do klienta o dokumenty: link do wgrania plików bez logowania (strona wgraj.html) oraz otwarcie wiadomości
// e-mail z aplikacji z szablonem dobranym do kratek z brakiem dokumentów (Saldeo → KSeF, Wyciągi → wyciąg bankowy).
const APP = 'https://rozliczenia.rkdp.pl';
export const uploadLink = token => `${APP}/wgraj.html#${token}`;

export async function openDocRequest(client, period, codes = []) {
  const { openMessage } = await import('./wiadomosc.js');
  const kind = codes.includes('saldeo') ? 'ksef' : codes.includes('wb') ? 'wyciag' : codes.length ? 'dokumenty' : 'ksef';
  return openMessage({ clients: [client], kind, period });
}
