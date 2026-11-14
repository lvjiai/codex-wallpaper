import { appSurfaceCss } from './app-surfaces.mjs';
import { normalizeAppearance, preserveZoomAnchor } from './appearance.mjs';

export function installBackground({ appearance, volume = 0 } = {}, surfaceCss = '', preserveAnchor) {
  if (window.__codexWallpaperScene) return { installed: true, reused: true };

  const marker = 'data-codex-wallpaper-active';
  const mainSelector = 'main[class*="MainContentSurface-"]';
  const sidebarSelector = '[data-sidebar-navigation-root]';
  const composerSelector = '[class*="ComposerLayoutRoot-"]';
  const stage = document.createElement('div');
  stage.id = 'codex-wallpaper-scene';
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden;';
  const scrim = document.createElement('div');
  scrim.setAttribute('data-codex-wallpaper-darkness', '');
  scrim.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;background:#000;';
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(surfaceCss);

  let destroyed = false;
  let resolution = null;
  let body;
  let previousMarker;
  let current;
  const scenes = new Map();
  let cancelVideoLoad;
  let transitionCover;
  let transitionAnimation;
  let incomingAnimation;

  function frameMedia(element) {
    const { zoom, x, y } = appearance;
    const scene = element.tagName === 'IFRAME';
    Object.assign(element.style, {
      width: scene ? '100%' : zoom + '%', height: scene ? '100%' : zoom + '%',
      maxWidth: 'none', maxHeight: 'none',
      left: (100 - zoom) * x / 100 + '%', top: (100 - zoom) * y / 100 + '%',
      objectPosition: x + '% ' + y + '%',
      scale: scene ? String(zoom / 100) : '',
      transformOrigin: scene ? '0 0' : '',
    });
  }

  function applyAppearance() {
    stage.style.filter = appearance.blur ? 'blur(' + appearance.blur + 'px)' : '';
    if (current?.tagName === 'VIDEO') frameMedia(current);
    if (transitionCover?.tagName === 'VIDEO') frameMedia(transitionCover);
    for (const frame of scenes.values()) frameMedia(frame);
    scrim.style.opacity = appearance.darkness / 100;
  }

  function releaseMedia(element) {
    if (!element) return;
    if (element.tagName === 'VIDEO') releaseVideo(element, element.src);
    else {
      scenes.delete(element.src);
      URL.revokeObjectURL(element.src);
      element.remove();
    }
  }

  function clearTransition() {
    transitionAnimation?.cancel();
    incomingAnimation?.cancel();
    transitionAnimation = incomingAnimation = null;
    releaseMedia(transitionCover);
    transitionCover = null;
  }

  async function showMedia(element, effect) {
    clearTransition();
    const cover = current;
    current = element;
    frameMedia(element);
    element.style.opacity = '';
    element.style.visibility = 'visible';
    if (!cover) return;
    if (cover.tagName === 'VIDEO') cover.muted = true;
    const { kind = 'cut', duration = 0 } = effect || {};
    if (kind === 'cut' || document.hidden) {
      releaseMedia(cover);
      return;
    }
    transitionCover = cover;
    cover.style.zIndex = '1';
    cover.dataset.wallpaperTransition = kind;
    const stripes = width => 'polygon(evenodd,' + Array.from({ length: 8 }, (_, index) => {
      const top = index * 12.5;
      const right = index % 2 ? 100 - width : width;
      const edge = index % 2 ? 100 : 0;
      return `${edge}% ${top}%,${right}% ${top}%,${right}% ${top + 12.5}%,${edge}% ${top + 12.5}%,${edge}% ${top}%`;
    }).join(',') + ')';
    const keyframes = {
      crossfade: [{ opacity: 1 }, { opacity: 0 }],
      push: [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }],
      wipe: [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }],
      iris: [{ clipPath: 'circle(72% at center)' }, { clipPath: 'circle(0% at center)' }],
      zoom: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }],
      stripes: [{ clipPath: stripes(100) }, { clipPath: stripes(0) }],
    };
    const options = { duration, easing: 'ease-in-out', fill: 'forwards' };
    const animation = cover.animate(keyframes[kind], options);
    transitionAnimation = animation;
    if (kind === 'push') {
      incomingAnimation = element.animate(
        [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        options,
      );
    }
    await animation.finished.catch(() => {});
    if (transitionAnimation === animation) clearTransition();
  }

  function mount() {
    body = document.body;
    if (!body || !body.querySelector('#root')) throw new Error('找不到 Codex 应用容器');
    previousMarker = body.getAttribute(marker);
    body.prepend(stage);
    stage.appendChild(scrim);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    body.setAttribute(marker, '');
    document.addEventListener('visibilitychange', resumeVideo);
    applyAppearance();
  }

  function releaseVideo(element, url) {
    element.pause();
    element.removeAttribute('src');
    element.load();
    element.remove();
    URL.revokeObjectURL(url);
  }

  function resumeVideo() {
    for (const element of [current, transitionCover]) {
      if (element?.tagName !== 'VIDEO') continue;
      if (document.hidden) element.pause();
      else void element.play().catch(() => {});
    }
  }

  function applyVolume() {
    if (current?.tagName !== 'VIDEO') return;
    current.volume = volume / 100;
    current.muted = volume === 0;
    if (!document.hidden) void current.play().catch(() => {});
  }

  function styleOf(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, opacity: style.opacity, blur: style.backdropFilter };
  }

  window.__codexWallpaperScene = {
    createSceneFrame() {
      if (destroyed) return null;
      if (!body) mount();
      const element = document.createElement('iframe');
      element.setAttribute('sandbox', 'allow-scripts');
      element.setAttribute('allow', 'autoplay');
      element.tabIndex = -1;
      element.style.cssText = 'position:absolute;inset:0;border:0;pointer-events:none;opacity:0.001';
      element.src = URL.createObjectURL(new Blob(['<!doctype html><title>Codex Wallpaper</title><body>'], { type: 'text/html' }));
      scenes.set(element.src, element);
      frameMedia(element);
      stage.insertBefore(element, current || scrim);
      return element.src;
    },
    async activateSceneFrame(url, effect) {
      const frame = scenes.get(url);
      if (!frame || destroyed) return false;
      resolution = { width: frame.clientWidth, height: frame.clientHeight };
      await showMedia(frame, effect);
      return true;
    },
    removeSceneFrame(url) {
      const frame = scenes.get(url);
      if (frame === current) { current = null; resolution = null; }
      releaseMedia(frame);
    },
    async playVideo(file, transition) {
      if (!file) throw new Error('没有读取到视频源文件。');
      cancelVideoLoad?.();
      if (!body) mount();
      const element = document.createElement('video');
      element.muted = true;
      element.loop = true;
      element.playsInline = true;
      element.preload = 'auto';
      element.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;visibility:hidden';
      const url = URL.createObjectURL(file);
      const loaded = new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          element.removeEventListener('loadeddata', ready);
          element.removeEventListener('error', failed);
          cancelVideoLoad = null;
        };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error(element.error?.message || '等待原视频解码超时。请让 Codex 保持可见。')); };
        const timer = setTimeout(failed, 55000);
        cancelVideoLoad = () => { cleanup(); reject(new Error('视频播放已取消。')); };
        element.addEventListener('loadeddata', ready);
        element.addEventListener('error', failed);
      });
      stage.insertBefore(element, scrim);
      element.src = url;
      try { await loaded; }
      catch (error) { releaseVideo(element, url); throw error; }
      if (destroyed) { releaseVideo(element, url); return null; }
      if (!document.hidden) {
        try { await element.play(); } catch { /* Visibility changes can interrupt playback. */ }
      }
      resolution = { width: element.videoWidth, height: element.videoHeight };
      const switched = showMedia(element, transition);
      applyVolume();
      await switched;
      return resolution;
    },
    setAppearance(value, zoomOnly = false) {
      const viewport = stage.getBoundingClientRect();
      const source = current?.tagName === 'IFRAME' ? viewport : resolution;
      appearance = zoomOnly ? preserveAnchor(appearance, value, viewport, source) : value;
      applyAppearance();
      return appearance;
    },
    setVolume(value) { volume = value; applyVolume(); },
    status() {
      const video = current?.tagName === 'VIDEO' ? current : null;
      return {
        hidden: document.hidden, scope: 'window', sourceResolution: resolution,
        video: video ? {
          time: video.currentTime, readyState: video.readyState, volume: video.volume, muted: video.muted,
          totalFrames: video.getVideoPlaybackQuality().totalVideoFrames,
          droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
        } : null,
        type: current ? (video ? 'video' : 'scene') : null,
        main: styleOf(mainSelector), sidebar: styleOf(sidebarSelector), composer: styleOf(composerSelector),
        backgroundPointerEvents: stage.style.pointerEvents,
      };
    },
    remove() {
      destroyed = true;
      clearTransition();
      cancelVideoLoad?.();
      document.removeEventListener('visibilitychange', resumeVideo);
      releaseMedia(current);
      for (const frame of scenes.values()) releaseMedia(frame);
      stage.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(value => value !== sheet);
      if (body) {
        if (previousMarker === null) body.removeAttribute(marker);
        else body.setAttribute(marker, previousMarker);
      }
      delete window.__codexWallpaperScene;
    },
  };
  return { installed: true, scope: 'window', renderer: 'webwallgl' };
}

export const makeInjection = options => '(() => { if (window !== window.top || location.href !== "app://-/index.html") return { installed: false };\nreturn (' + installBackground.toString() + ')(' + JSON.stringify({ appearance: normalizeAppearance(options?.appearance, options?.dim), volume: Number.isFinite(options?.volume) ? Math.max(0, Math.min(100, options.volume)) : 0 }) + ',' + JSON.stringify(appSurfaceCss) + ',(' + preserveZoomAnchor.toString() + ')); })()';
export const removeInjection = 'window.__codexWallpaperScene?.remove(); true';
