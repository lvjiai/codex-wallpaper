import { randomBytes } from 'node:crypto';
import { readConfig, saveConfig, validateProject, wallpaperSource } from './platform.mjs';
import { discoverTargets, CdpClient, debugStatus, checkedPort, mainWindowExpression } from './cdp.mjs';
import { makeInjection, removeInjection } from './inject.mjs';
import { prepareScene } from './scene-host.mjs';
import { wallpaperTransitions } from './transitions.mjs';

export class SceneController {
  constructor() { this.clients = []; this.active = null; this.lastError = null; }
  async status() {
    const config = readConfig();
    const scene = this.scenes?.length ? await this.scenes[0].status().catch(() => null) : null;
    return { debug: await debugStatus(config.cdpPort || 9222), active: this.active, scene,
      lastError: this.lastError, configuredPlaylist: config.playlist || [] };
  }
  async start(options = {}) {
    const config = { ...readConfig(), ...options };
    const requested = config.playlist || [];
    if (!Array.isArray(requested)) throw new Error('播放列表必须是壁纸项目数组。');
    const playlist = requested.map(validateProject);
    if (!playlist.length) throw new Error('请先从 Wallpaper Engine 库中选择至少一张壁纸。');
    const listLength = playlist.length;
    const initial = options.initialWallpaper ? validateProject(options.initialWallpaper) : playlist[0];
    let initialIndex = playlist.findIndex(item => item.project === initial.project);
    if (initialIndex < 0) initialIndex = playlist.push(initial) - 1;
    const fps = Number(options.fps ?? (config.captureMode ? 30 : config.fps ?? 30));
    const interval = Number(config.intervalSeconds || 300), dim = Number(config.dim ?? 0.48);
    const order = config.order || 'sequential';
    const transition = config.transition || 'cut';
    const transitionMs = config.transitionMs ?? 1800;
    if (!['sequential', 'shuffle'].includes(order) || !Object.hasOwn(wallpaperTransitions, transition) ||
        ![600, 1800, 3000].includes(transitionMs)) throw new Error('无效的轮换方式或过渡设置。');
    if (!Number.isInteger(fps) || fps < 1 || fps > 60 || !Number.isInteger(interval) || interval < 30 ||
        interval > 2147483 || !Number.isFinite(dim) || dim < 0 || dim > 0.8) throw new Error('帧率、轮换间隔或暗化参数超出范围。');
    const targets = await discoverTargets(checkedPort(config.cdpPort || 9222));
    if (!targets.length) throw new Error('没有找到 Codex 调试页面，请先通过已配置的调试入口启动 Codex。');
    const renderer = randomBytes(8).toString('hex');
    await this.stop(false);
    this.lastError = null;
    this.volume = config.volume || 0;
    try {
      for (const target of targets) {
        const client = new CdpClient(target.webSocketDebuggerUrl, 65000); this.clients.push(client);
        await client.connect();
        const { result: windowKind } = await client.call('Runtime.evaluate', { expression: mainWindowExpression, returnByValue: true });
        if (!windowKind.value) {
          client.close();
          this.clients.pop();
          continue;
        }
        await client.call('Page.enable');
        const source = makeInjection({ dim, appearance: config.appearance, volume: config.volume });
        const result = await client.call('Runtime.evaluate', { expression: source, returnByValue: true });
        if (result.exceptionDetails || !result.result?.value?.installed) throw new Error('Codex 背景层安装失败。');
        if (result.result.value.reused) throw new Error('另一个壁纸会话正在播放，请在该会话中切换或关闭壁纸。');
        client.ownsBackground = true;
        client.scriptId = (await client.call('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      }
      if (!this.clients.length) throw new Error('Codex 主窗口尚未就绪。');
      this.active = { renderer, fps, intervalSeconds: interval };
      const activePlaylist = { playlist: playlist.slice(0, listLength).map(item => item.project), groupName: config.groupName,
        intervalSeconds: interval, order, transition, transitionMs };
      this.activePlaylist = activePlaylist;
      let index = initialIndex;
      let rotationIndex = index < listLength ? index : -1;
      let shuffled = [];
      let switching = false;
      const effect = { kind: transition, duration: transitionMs };
      const play = async (next, animation) => {
        const item = playlist[next];
        const resolution = await this.playWallpaper(item, fps, config, animation);
        if (this.active?.renderer !== renderer) throw new Error('壁纸切换已取消。');
        index = next;
        if (next < listLength) rotationIndex = next;
        Object.assign(this.active, item, { videoResolution: resolution });
      };

      try { await play(index); }
      catch (error) {
        if (options.initialWallpaper || this.active?.renderer !== renderer) throw error;
        const fallback = playlist.findIndex((item, i) => i !== index && item.type === 'video');
        if (fallback < 0) throw error;
        await play(fallback);
        this.lastError = error.message;
      }

      const { persist, initialWallpaper, captureMode, frameDumpDirectory, ...persistentConfig } = config;
      if (persist !== false) {
        const current = readConfig();
        saveConfig({ ...persistentConfig, wallpaperGroups: current.wallpaperGroups, appearance: current.appearance,
          volume: current.volume, enabled: true, fps, playlist: activePlaylist.playlist });
      }

      const rotate = async project => {
        if (switching) throw new Error('正在切换壁纸，请稍候。');
        switching = true;
        let next;
        try {
          if (project !== undefined) {
            next = playlist.findIndex(item => item.project === project);
            if (next < 0) next = playlist.push(validateProject(project)) - 1;
          } else if (order === 'shuffle') {
            if (!shuffled.length) {
              shuffled = playlist.slice(0, listLength).map((_, i) => i).filter(i => i !== index);
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
            }
            next = shuffled.shift();
          } else {
            next = (rotationIndex + 1) % listLength;
            if (next === index) next = (next + 1) % listLength;
          }
          if (next === undefined || next === index) return this.active;
          await play(next, effect);
          shuffled = shuffled.filter(i => i !== next);
          this.lastError = null;
          return this.active;
        } catch (error) {
          if (project === undefined && next < listLength) rotationIndex = next;
          this.lastError = error.message;
          throw error;
        } finally { switching = false; }
      };
      const schedule = () => {
        clearInterval(this.rotation);
        if (this.active?.renderer === renderer && (listLength > 1 || index >= listLength)) {
          this.rotation = setInterval(() => { void rotate().catch(() => {}); }, interval * 1000);
        }
      };
      this.selectWallpaper = async project => {
        const next = await rotate(project);
        schedule();
        return next;
      };
      schedule();
      return { applied: true, ...this.active };
    } catch (error) { this.lastError = error.message; await this.stop(false); throw error; }
  }

  async playWallpaper(item, fps, config, effect) {
    const previous = this.scenes || [];
    const session = this.active;
    if (item.type === 'video') {
      const source = wallpaperSource(item);
      const [resolution] = await Promise.all(this.clients.map(client => this.playLocalVideo(client, source, effect)));
      if (this.active !== session) throw new Error('壁纸切换已取消。');
      this.scenes = [];
      await Promise.all(previous.map(scene => scene.dispose()));
      return resolution;
    }
    // Wait for every window so a failure can release each successfully prepared scene.
    const prepared = await Promise.allSettled(this.clients.map(client => prepareScene(client, item.project, fps, config)));
    const scenes = prepared.filter(result => result.status === 'fulfilled').map(result => result.value);
    try {
      const failure = prepared.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (this.active !== session) throw new Error('壁纸切换已取消。');
      await Promise.all(previous.map(scene => scene.volume(0).catch(() => {})));
      await Promise.all(scenes.map(scene => scene.volume(this.volume)));
      await Promise.all(scenes.map(scene => scene.activate(effect)));
      if (this.active !== session) throw new Error('壁纸切换已取消。');
      this.scenes = scenes;
    } catch (error) {
      await Promise.all(scenes.map(scene => scene.dispose()));
      await Promise.all(previous.map(scene => scene.volume(this.volume).catch(() => {})));
      throw error;
    }
    await Promise.all(previous.map(scene => scene.dispose()));
    return null;
  }

  async playLocalVideo(client, source, transition) {
    const { result: { objectId } } = await client.call('Runtime.evaluate', {
      expression: "(() => { const input = document.createElement('input'); input.type = 'file'; return input; })()",
    });
    try {
      await client.call('DOM.setFileInputFiles', { objectId, files: [source] });
      const result = await client.call('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: 'function(effect) { return window.__codexWallpaperScene.playVideo(this.files[0], effect); }',
        arguments: [transition ? { value: transition } : {}],
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Codex 无法解码这张视频壁纸。');
      return result.result.value;
    } finally {
      await client.call('Runtime.releaseObject', { objectId }).catch(() => {});
    }
  }
  async refreshBackground(options = {}) {
    const module = await import('./inject.mjs?updated=' + Date.now());
    await Promise.all((this.scenes || []).map(scene => scene.dispose()));
    this.scenes = [];
    for (const client of this.clients) {
      await client.call('Runtime.evaluate', { expression: removeInjection });
      if (client.scriptId) await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: client.scriptId });
      const { appearance, volume } = readConfig();
      const source = module.makeInjection({ appearance, volume, ...options });
      client.scriptId = (await client.call('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      const result = await client.call('Runtime.evaluate', { expression: source, returnByValue: true });
      if (result.exceptionDetails || !result.result?.value?.installed) throw new Error('背景样式更新失败。');
      if (this.active?.type === 'video') {
        await this.playLocalVideo(client, wallpaperSource(this.active));
      } else if (this.active?.type === 'scene') {
        const scene = await prepareScene(client, this.active.project, this.active.fps, readConfig());
        await scene.volume(this.volume);
        await scene.activate();
        this.scenes.push(scene);
      }
    }
  }
  async setAppearance(appearance, zoomOnly) {
    const expression = 'window.__codexWallpaperScene?.setAppearance(' + JSON.stringify(appearance) + ',' + Boolean(zoomOnly) + ')';
    const results = await Promise.all(this.clients.map(client => client.call('Runtime.evaluate', { expression, returnByValue: true })));
    const result = results.find(reply => reply.result?.value);
    return result?.result.value ?? appearance;
  }
  async setVolume(volume) {
    this.volume = volume;
    await Promise.all((this.scenes || []).map(scene => scene.volume(volume)));
    await Promise.all(this.clients.map(client => client.call('Runtime.evaluate', {
      expression: 'window.__codexWallpaperScene?.setVolume(' + JSON.stringify(volume) + ')',
      userGesture: true,
    })));
  }
  async chooseWallpaper(project) {
    if (!this.selectWallpaper) {
      const { playlist, groupName } = readConfig();
      return this.start({ playlist: playlist?.length ? playlist : [project], groupName, initialWallpaper: project });
    }
    return this.selectWallpaper(project);
  }
  async stop(disable = true) {
    if (!this.stopping) this.stopping = this.cleanup();
    const stopping = this.stopping;
    try { await stopping; }
    finally { if (this.stopping === stopping) this.stopping = null; }
    if (disable) saveConfig({ ...readConfig(), enabled: false });
    return { stopped: true };
  }
  async cleanup() {
    this.selectWallpaper = null;
    this.activePlaylist = null;
    this.active = null;
    clearInterval(this.rotation);
    this.rotation = null;
    const scenes = this.scenes || [];
    this.scenes = [];
    await Promise.all(scenes.map(scene => scene.dispose()));
    const clients = this.clients; this.clients = [];
    for (const client of clients) {
      try { if (client.ownsBackground) await client.call('Runtime.evaluate', { expression: removeInjection }); }
      catch { /* A closed page has no background to remove. */ }
      try { if (client.scriptId) await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: client.scriptId }); }
      catch { /* The debugging session may already have closed. */ }
      client.close();
    }
  }
}
