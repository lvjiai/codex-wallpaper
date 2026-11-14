// Runs inside the wallpaper iframe's isolated world.
export function installSceneRenderer(hasAssets) {
  document.documentElement.style.cssText = 'width:100%;height:100%;overflow:hidden';
  document.body.style.cssText = 'margin:0;width:100%;height:100%;overflow:hidden';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0';
  document.body.append(host);
  const pending = new Map();
  let requestId = 0;
  let scene;
  let error;
  let diagnostics = [];

  globalThis.__wallpaperRead = (name, signal) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const abort = () => {
      pending.delete(id);
      reject(signal.reason);
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, file => {
      signal?.removeEventListener('abort', abort);
      resolve(file);
    });
    globalThis.__codexWallpaperReadFile(JSON.stringify({ id, name }));
  });
  globalThis.__wallpaperReadResult = (id, file) => {
    const complete = pending.get(id);
    pending.delete(id);
    complete?.(file ?? null);
  };

  // Give WebWallGL its usual HTTP-style source while resolving files through CDP.
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.__wallpaperFetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.href, 'https://codex-wallpaper.invalid');
    if (url.protocol === 'blob:' || url.protocol === 'data:') return nativeFetch(input, options);
    if (url.origin !== 'https://codex-wallpaper.invalid') return new Response(null, { status: 404 });
    const name = decodeURIComponent(url.pathname);
    if (name === '/api/local-assets') return Response.json({ ok: hasAssets, roots: [{ id: 'local' }] });
    const file = await globalThis.__wallpaperRead(name, options?.signal);
    return file ? new Response(file) : new Response(null, { status: 404 });
  };
  globalThis.__wallpaperLocation = { href: location.href, search: hasAssets ? '?localAssets=1' : '' };

  function state() {
    return {
      ...scene?.stats,
      error,
      diagnostics,
      width: scene?.canvas?.width,
      height: scene?.canvas?.height,
      info: scene?.info,
    };
  }
  function visibility() {
    if (scene && scene.paused !== document.hidden) {
      if (document.hidden) scene.pause();
      else scene.resume();
    }
  }
  globalThis.__wallpaperRenderer = {
    async load(fps) {
      scene = globalThis.WebWallGL.createScene(host, {
        fit: 'cover',
        fps,
        volume: 0,
        mountTimeoutMs: 50000,
        onDiagnostic(message, level) {
          if (level !== 'info') diagnostics = [...diagnostics.slice(-7), String(message).slice(0, 300)];
        },
        onError(reason) { error = reason.message; },
      });
      await scene.load(globalThis.WebWallGL.httpSource('https://codex-wallpaper.invalid/project'));
      visibility();
      document.addEventListener('visibilitychange', visibility);
      return state();
    },
    volume(value) { scene?.setVolume(value); },
    state,
    release() {
      document.removeEventListener('visibilitychange', visibility);
      scene?.destroy({ releasePkgCache: true });
      scene = null;
    },
  };
}
