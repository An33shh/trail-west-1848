// Installable app: registers the offline service worker and shows INSTALL where the browser
// supports a one-click install (Chrome and Edge on desktop and Android). On iPhone and iPad,
// players use Share, then Add to Home Screen. Only included in dist/index.html.
(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* still playable online */ }); });

  const button = document.getElementById('install');
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    button.hidden = true;
  });
  addEventListener('appinstalled', () => { deferred = null; button.hidden = true; });
})();
