// FULL SCREEN button: hides the browser or app window frame so the screen is all glass.
// Hidden where the browser can't do it (iPhone Safari, sandboxed frames).
(() => {
  const button = document.getElementById('fullscreen');
  if (!button || !document.fullscreenEnabled) return;
  button.hidden = false;
  const label = () => { button.textContent = document.fullscreenElement ? 'EXIT FULL SCREEN' : 'FULL SCREEN'; };
  button.addEventListener('click', () => {
    const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    Promise.resolve(done).catch(() => { /* refused: stay windowed */ });
  });
  document.addEventListener('fullscreenchange', label);
})();
