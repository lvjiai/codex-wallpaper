export function showLibrary({ binding, panelId, wallpapers, groups, selected, visible, transitions, current, currentIndex, appearanceControls, appearance, volume, playback, ...settings }) {
  if (document.getElementById(panelId)) return false;
  const host = document.createElement('div');
  host.id = panelId;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { color-scheme:dark; font:14px/1.5 "Segoe UI",system-ui,sans-serif; color:#f6f6fa; }
      * { box-sizing:border-box; }
      dialog { background:linear-gradient(155deg,#393430,#292321 68%,#202021); color:inherit; border:1px solid #514d55; border-radius:16px; padding:0; width:min(738px,calc(100vw - 32px)); max-height:calc(100vh - 48px); box-shadow:0 22px 90px #0009; }
      dialog[open] { display:flex; flex-direction:column; }
      dialog[data-editing] { width:min(1160px,calc(100vw - 32px)); height:calc(100vh - 48px); }
      [hidden] { display:none !important; }
      #overview,#playback { overflow:auto; padding:0 18px; }
      #pages { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin:12px 18px 0; padding:3px; border:1px solid #625957; border-radius:9px; background:#201d1bcc; flex-shrink:0; }
      #pages button { background:transparent; border:0; }
      #pages button[aria-pressed=true] { background:#191717; font-weight:600; }
      #editor { display:flex; flex:1; flex-direction:column; min-height:0; }
      header,footer,#editor > .groups,#editor > .controls { flex-shrink:0; }
      section { border-top:1px solid #625957; padding:15px 0; }
      section:first-child { border:0; }
      section h3 { margin:0 0 10px; font-size:20px; }
      .line { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:9px; }
      .line > label:first-child { margin-right:auto; }
      .current { display:flex; align-items:center; gap:15px; min-height:124px; padding:14px; border:1px solid #625957; border-radius:12px; background:#211e1dcc; }
      .current img { width:124px; height:88px; object-fit:cover; border-radius:8px; }
      .current img:not([src]) { display:none; }
      #current-title { flex:1; overflow-wrap:anywhere; }
      #choose-wallpaper { flex:0 1 155px; min-width:0; max-width:40%; text-overflow:ellipsis; }
      #wallpaper-volume { flex:1; min-width:90px; padding:0; accent-color:#598efa; }
      #volume-note { color:#cfc6c3; }
      .duration { display:flex; flex:1; gap:6px; }
      .duration button { flex:1; }
      .duration button[aria-pressed=true] { background:#4b84ed; border-color:#4b84ed; }
      #save { background:#4b84ed; border-color:#4b84ed; }
      dialog::backdrop { background:#100f1888; }
      header,footer,.controls,.groups { display:flex; align-items:center; flex-wrap:wrap; gap:9px; padding:13px 18px; }
      header,footer { background:#24212080; }
      header h2 { margin:0; flex:1; font-size:19px; }
      .groups { border-bottom:1px solid #46424a; }
      .controls label { display:flex; align-items:center; gap:6px; }
      button,input,select { font:inherit; color:inherit; background:#292523; border:1px solid #57515e; border-radius:7px; padding:6px 9px; }
      input[type=number] { width:92px; }
      input[type=search],#group { flex:1; min-width:130px; }
      button { cursor:pointer; }
      button:hover:not(:disabled) { background:#464151; }
      button:disabled { opacity:.52; cursor:default; }
      #items { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; display:grid; grid-template-columns:repeat(auto-fill,minmax(min(255px,100%),1fr)); grid-auto-rows:max-content; align-content:start; gap:12px; padding:4px 18px 14px; }
      .card { position:relative; min-width:0; display:flex; flex-direction:column; overflow:hidden; padding:0; text-align:left; background:#312e35; }
      .card[aria-pressed=true] { outline:2px solid #8eb4ff; outline-offset:-2px; background:#3d4b6a; }
      .card img,.placeholder { display:block; flex:none; width:100%; height:auto; aspect-ratio:16/10; object-fit:cover; background:#1d1c22; }
      .placeholder { display:grid; place-items:center; color:#c9c3ce; }
      .title { display:block; padding:5px 8px; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .check,.type { position:absolute; top:6px; border-radius:4px; padding:0 5px; background:#171620cf; }
      .check { left:6px; } .type { right:6px; }
      .card[aria-pressed=true] .check { background:#4988f4; color:white; }
      footer { border-top:1px solid #46424a; justify-content:flex-end; }
      #status { flex:1 1 180px; margin:0; color:#ddd6e4; overflow-wrap:anywhere; }
      #status.error { color:#ffb7ad; }
      #play { background:#4b84ed; border-color:#4b84ed; color:white; font-weight:600; }
      #count { color:#d6cfdd; }
      #appearance label { display:grid; grid-template-columns:100px minmax(90px,1fr) 62px; align-items:center; gap:12px; margin:9px 0; }
      #appearance input { width:100%; padding:0; accent-color:#598efa; }
      #appearance output { text-align:right; font-variant-numeric:tabular-nums; color:#ddd6e4; }
      #appearance-error { color:#ffb7ad; }
    </style>
    <dialog aria-labelledby="heading">
      <header><h2 id="heading">Wallpaper Engine</h2><button id="close" aria-label="关闭">×</button></header>
      <nav id="pages" aria-label="壁纸设置">
        <button id="library-page" type="button" aria-controls="overview" aria-pressed="true">壁纸库</button>
        <button id="playback-page" type="button" aria-controls="playback" aria-pressed="false">播放</button>
      </nav>
      <div id="overview">
        <section>
          <h3>当前壁纸</h3>
          <div class="current"><img id="current-image" alt=""><strong id="current-title"></strong><button id="choose-wallpaper" type="button">选择壁纸</button></div>
          <div class="line"><button id="stop">清除</button><label for="wallpaper-volume">壁纸音量</label><input id="wallpaper-volume" type="range" min="0" max="100" step="1"><output id="volume-value" for="wallpaper-volume"></output><button id="mute" type="button">静音</button></div>
          <small id="volume-note" role="status"></small>
        </section>
        <section>
          <h3>切换过场</h3>
          <div class="line"><label for="transition">过场动画</label><select id="transition"></select></div>
          <div class="line"><label>时长</label><div class="duration" role="group" aria-label="过场时长"><button data-ms="600">快</button><button data-ms="1800">标准</button><button data-ms="3000">慢</button></div></div>
        </section>
        <section>
          <h3>自动轮播</h3>
          <div class="line"><select id="group" aria-label="轮播列表"></select><button id="new">新建</button><button id="edit">编辑</button><button id="delete">删除</button></div>
          <div class="line">
            <label for="interval">轮换间隔</label><input id="interval" type="number" min="30" max="2147483" step="1" required> 秒
            <select id="order" aria-label="轮换顺序"><option value="sequential">顺序</option><option value="shuffle">随机</option></select>
          </div>
        </section>
      </div>
      <div id="playback" hidden>
        <section>
          <h3>画面</h3>
          <div id="appearance"></div>
          <button id="appearance-reset" type="button">恢复默认</button>
          <span id="appearance-error" role="status"></span>
        </section>
      </div>
      <div id="editor" hidden>
        <div class="groups"><button id="back">返回</button><input id="name" type="text" maxlength="60" placeholder="轮播列表名称" aria-label="轮播列表名称"><button id="save">保存列表</button></div>
        <div class="controls">
          <input id="search" type="search" aria-label="搜索壁纸" placeholder="搜索名称或创意工坊 ID">
          <select id="type" aria-label="壁纸类型"><option value="">所有类型</option><option value="scene">场景</option><option value="video">视频</option></select>
          <button id="select-all" title="全选当前筛选中有预览的壁纸">全选</button>
          <button id="clear-selection">取消全选</button>
          <span id="count" aria-live="polite"></span>
        </div>
        <div id="items" aria-label="本机壁纸"></div>
      </div>
      <footer><p id="status" role="status"></p><button id="play">应用轮播</button></footer>
    </dialog>`;
  const $ = id => root.getElementById(id);
  const dialog = root.querySelector('dialog');
  const list = $('items');
  const selection = new Set(selected);
  const images = new Map();
  const pending = new Set();
  let busy = false;
  let loadedGroup = '';
  let editing = null;
  let selectedFirst = new Set();
  let duration = settings.transitionMs;
  let previous;
  $('transition').replaceChildren(...Object.entries(transitions).map(([key, label]) => new Option(label, key)));
  $('current-title').textContent = current || '当前未播放壁纸';
  const send = request => window[binding](JSON.stringify(request));
  let lastAudibleVolume = volume || 50;
  let volumeFrame = 0;
  let choosingWallpaper = false;
  const volumeInput = $('wallpaper-volume');
  volumeInput.value = volume;
  function sendVolume(save) {
    cancelAnimationFrame(volumeFrame);
    volumeFrame = 0;
    send({ action: 'volume', value: volume, save });
  }
  function updateVolume() {
    volume = Number(volumeInput.value);
    if (volume > 0) lastAudibleVolume = volume;
    $('volume-value').textContent = volume + '%';
    $('mute').textContent = volume ? '静音' : '取消静音';
  }
  volumeInput.oninput = () => {
    updateVolume();
    if (!volumeFrame) volumeFrame = requestAnimationFrame(() => sendVolume(false));
  };
  volumeInput.onchange = () => sendVolume(true);
  $('mute').onclick = () => {
    volumeInput.value = volume ? 0 : lastAudibleVolume;
    updateVolume();
    sendVolume(true);
  };
  host.showVolumeError = message => { $('volume-note').textContent = message; };
  updateVolume();
  let appearanceFrame = 0;
  let appearanceRevision = 0;
  const inputs = new Map();
  const submitAppearance = (save, key) => {
    cancelAnimationFrame(appearanceFrame);
    appearanceFrame = 0;
    $('appearance-error').textContent = '';
    send({ action: 'appearance', values: appearance, save, key, revision: appearanceRevision });
  };
  host.syncZoomPosition = (revision, x, y) => {
    if (revision !== appearanceRevision) return;
    for (const [key, position] of [['x', x], ['y', y]]) {
      const { input, updateValue } = inputs.get(key);
      input.value = Math.round(position);
      updateValue();
      appearance[key] = position;
    }
  };
  for (const { key, label, min, max, unit } of appearanceControls) {
    const row = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.value = appearance[key];
    input.setAttribute('aria-label', label);
    const value = document.createElement('output');
    const updateValue = () => {
      appearance[key] = Number(input.value);
      value.textContent = input.value + unit;
    };
    updateValue();
    input.addEventListener('input', () => {
      appearanceRevision++;
      updateValue();
      cancelAnimationFrame(appearanceFrame);
      appearanceFrame = requestAnimationFrame(() => submitAppearance(false, key));
    });
    input.addEventListener('change', () => submitAppearance(true, key));
    inputs.set(key, { input, updateValue });
    row.append(caption, input, value);
    $('appearance').append(row);
  }
  $('appearance-reset').onclick = () => {
    appearanceRevision++;
    for (const { key, initial } of appearanceControls) {
      const { input, updateValue } = inputs.get(key);
      input.value = initial;
      updateValue();
    }
    submitAppearance(true);
  };
  host.showAppearanceError = message => { $('appearance-error').textContent = message; };
  function showPage(playback) {
    $('overview').hidden = playback;
    $('playback').hidden = !playback;
    $('play').hidden = playback;
    $('library-page').setAttribute('aria-pressed', String(!playback));
    $('playback-page').setAttribute('aria-pressed', String(playback));
  }
  $('library-page').onclick = () => showPage(false);
  $('playback-page').onclick = () => showPage(true);
  const loadVisiblePreviews = () => {
    if (!dialog.open || editing === null) return;
    const bounds = list.getBoundingClientRect();
    for (const card of list.querySelectorAll('.card[data-preview]:not([data-loading])')) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom < bounds.top - 80 || rect.top > bounds.bottom + 80) continue;
      const index = Number(card.dataset.index);
      if (images.has(index)) showImage(card, images.get(index));
      else if (!pending.has(index)) {
        pending.add(index);
        send({ action: 'preview', index });
      }
    }
  };

  const getSettings = () => ({
    indexes: [...selection],
    intervalSeconds: Number($('interval').value),
    order: $('order').value,
    transition: $('transition').value,
    transitionMs: duration,
  });
  const loadSettings = value => {
    $('interval').value = value.intervalSeconds;
    $('order').value = value.order;
    $('transition').value = value.transition;
    duration = value.transitionMs;
  };
  const update = () => {
    $('count').textContent = '已选 ' + selection.size + ' 张';
    const invalid = busy || !selection.size || [...selection].some(i => !wallpapers[i]?.preview || images.get(i) === '');
    $('play').disabled = $('save').disabled = invalid;
    $('edit').disabled = busy || !loadedGroup;
    $('select-all').disabled = busy || !list.querySelector('.card[data-preview][aria-pressed=false]');
    $('clear-selection').disabled = busy || !selection.size;
    $('stop').disabled = busy || !current;
    $('choose-wallpaper').disabled = busy || !wallpapers.length;
    $('delete').disabled = busy || !loadedGroup;
    for (const id of ['close', 'group', 'new', 'name', 'interval', 'order', 'transition', 'back']) $(id).disabled = busy;
    for (const button of root.querySelectorAll('[data-ms]')) {
      button.disabled = busy || $('transition').value === 'cut';
      button.setAttribute('aria-pressed', String(Number(button.dataset.ms) === duration));
    }
  };
  const setChecked = (card, checked) => {
    card.setAttribute('aria-pressed', String(checked));
    card.querySelector('.check').textContent = checked ? '✓' : '';
  };
  const showImage = (card, url) => {
    const placeholder = card.querySelector('.placeholder');
    if (!placeholder || card.dataset.loading) return;
    if (!url) { placeholder.textContent = '预览不可用'; return; }
    card.dataset.loading = 'true';
    const image = document.createElement('img');
    image.alt = '';
    image.onload = () => { card.disabled = false; placeholder.replaceWith(image); };
    image.onerror = () => {
      images.set(Number(card.dataset.index), '');
      delete card.dataset.preview;
      placeholder.textContent = '预览不可用';
      update();
    };
    image.src = url;
  };
  host.setPreview = (index, url) => {
    pending.delete(index);
    images.set(index, url);
    if (images.size > 32) images.delete(images.keys().next().value);
    if (index === currentIndex && url) $('current-image').src = url;
    const card = list.querySelector('[data-index="' + index + '"]');
    if (card && !url) delete card.dataset.preview;
    if (card) showImage(card, url);
    update();
  };
  const render = () => {
    const query = $('search').value.trim().toLowerCase();
    const filter = $('type').value;
    const fragment = document.createDocumentFragment();
    const order = wallpapers.map((_, index) => index).sort((a, b) => Number(selectedFirst.has(b)) - Number(selectedFirst.has(a)));
    for (const index of order) {
      const { title, type, workshopId, preview } = wallpapers[index];
      if ((filter && type !== filter) || (!title.toLowerCase().includes(query) && !workshopId?.includes(query))) continue;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.index = index;
      card.title = title;
      card.disabled = !choosingWallpaper;
      card.innerHTML = '<span class="placeholder"></span><span class="check" aria-hidden="true"></span><span class="type"></span><span class="title"></span>';
      card.querySelector('.placeholder').textContent = preview ? '正在载入预览' : '缺少预览';
      card.querySelector('.title').textContent = title;
      card.querySelector('.type').textContent = type === 'scene' ? '场景' : '视频';
      setChecked(card, selection.has(index));
      if (preview && images.get(index) !== '') card.dataset.preview = '';
      else if (preview) card.querySelector('.placeholder').textContent = '预览不可用';
      card.onclick = event => {
        if (!event.isTrusted || busy) return;
        if (choosingWallpaper) {
          submit(event, 'choose-wallpaper', { index }, type === 'scene' ? '正在加载实时场景…' : '正在切换壁纸…');
          return;
        }
        if (selection.has(index)) selection.delete(index);
        else selection.add(index);
        setChecked(card, selection.has(index));
        update();
      };
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    if (!list.childElementCount) list.textContent = '没有找到匹配的壁纸。';
    loadVisiblePreviews();
    update();
  };
  host.showGroups = (items, name = '') => {
    groups = items;
    loadedGroup = name;
    $('group').replaceChildren(new Option(selection.size ? '当前轮播列表' : '选择轮播列表…', ''), ...groups.map(group => new Option(group.name + '（' + group.indexes.length + ' 张）', group.name)));
    $('group').value = name;
    $('name').value = name;
    update();
  };
  host.setCurrent = (title, index) => {
    current = title || '';
    currentIndex = index;
    $('current-title').textContent = current || '当前未播放壁纸';
    $('current-image').removeAttribute('src');
    if (dialog.open) requestCurrentPreview();
    update();
  };
  host.syncPlayback = state => {
    $('volume-note').textContent = state.type === 'scene' ? '场景声音由 Wallpaper Engine 播放，此处调节视频壁纸音量。' : '';
    host.setCurrent(state.title, state.index);
    if (editing !== null) return;
    selection.clear();
    for (const index of state.indexes) selection.add(index);
    host.showGroups(state.groups, state.groupName);
    loadSettings(state);
    update();
  };
  host.showResult = (message, success, action, title, index) => {
    $('status').textContent = message;
    $('status').classList.toggle('error', !success);
    busy = false;
    if (success && ['save', 'choose-wallpaper'].includes(action)) showOverview();
    if (success && ['start', 'stop'].includes(action)) {
      host.setCurrent(title, index);
      if (action === 'stop') $('volume-note').textContent = '';
      if (action === 'start') dialog.close();
    }
    update();
  };
  host.reopen = () => {
    if (!dialog.open) {
      dialog.showModal();
      $('close').focus();
      send({ action: 'current' });
    }
    requestCurrentPreview();
    if (editing !== null) loadVisiblePreviews();
    return true;
  };
  const submit = (event, action, request, status = '') => {
    if (!event.isTrusted || busy) return;
    if (['save', 'start'].includes(action) && !$('interval').reportValidity()) return;
    $('status').textContent = status;
    $('status').classList.remove('error');
    busy = true;
    update();
    send({ action, ...request });
  };
  $('group').onchange = () => {
    const group = groups.find(item => item.name === $('group').value);
    loadedGroup = group?.name || '';
    $('name').value = loadedGroup;
    if (group) {
      selection.clear();
      for (const index of group.indexes) selection.add(index);
      loadSettings(group);
      render();
    }
    update();
  };
  function showOverview() {
    editing = null;
    choosingWallpaper = false;
    for (const id of ['name','save','select-all','clear-selection','count']) $(id).hidden = false;
    previous = null;
    $('pages').hidden = false;
    showPage(false);
    $('editor').hidden = true;
    $('play').hidden = false;
    dialog.removeAttribute('data-editing');
    list.replaceChildren();
    $('heading').textContent = 'Wallpaper Engine';
  }
  function editGroup(name) {
    previous = getSettings();
    editing = name;
    $('name').value = name;
    if (!name) selection.clear();
    selectedFirst = new Set(selection);
    $('overview').hidden = true;
    $('playback').hidden = true;
    $('pages').hidden = true;
    $('editor').hidden = false;
    $('play').hidden = true;
    dialog.setAttribute('data-editing', '');
    $('heading').textContent = name ? '编辑轮播列表' : '新建轮播列表';
    $('search').value = $('type').value = '';
    list.scrollTop = 0;
    render();
    update();
    $('name').focus();
  }
  function cancelEditing() {
    selection.clear();
    for (const index of previous.indexes) selection.add(index);
    loadSettings(previous);
    showOverview();
    update();
  }
  function requestCurrentPreview() {
    if (!wallpapers[currentIndex]?.preview) return;
    const image = images.get(currentIndex);
    if (image) $('current-image').src = image;
    else if (!pending.has(currentIndex)) {
      pending.add(currentIndex);
      send({ action: 'preview', index: currentIndex });
    }
  }
  $('new').onclick = () => editGroup('');
  $('edit').onclick = () => editGroup(loadedGroup);
  $('back').onclick = cancelEditing;
  $('select-all').onclick = () => {
    for (const card of list.querySelectorAll('.card[data-preview]')) {
      selection.add(Number(card.dataset.index));
      setChecked(card, true);
    }
    update();
  };
  $('clear-selection').onclick = () => {
    selection.clear();
    for (const card of list.querySelectorAll('.card[aria-pressed=true]')) setChecked(card, false);
    update();
  };
  for (const button of root.querySelectorAll('[data-ms]')) button.onclick = () => {
    duration = Number(button.dataset.ms);
    update();
  };
  $('save').onclick = event => submit(event, 'save', { ...getSettings(), name: $('name').value, editing });
  $('delete').onclick = event => submit(event, 'delete', { name: loadedGroup });
  $('stop').onclick = event => submit(event, 'stop', {});
  $('choose-wallpaper').onclick = () => {
    editGroup(loadedGroup);
    choosingWallpaper = true;
    $('heading').textContent = '选择壁纸';
    for (const id of ['name','save','select-all','clear-selection','count']) $(id).hidden = true;
    selectedFirst = new Set();
    render();
    $('search').focus();
  };
  $('play').onclick = event => submit(event, 'start', { ...getSettings(), groupName: loadedGroup }, [...selection].some(i => wallpapers[i].type === 'scene')
    ? '请在 Windows 选择器中授权专用场景窗口。' : '正在读取原视频…');
  $('search').addEventListener('input', render);
  $('type').addEventListener('change', render);
  $('transition').addEventListener('change', update);
  $('close').onclick = () => { if (!busy) { if (editing !== null) cancelEditing(); dialog.close(); } };
  dialog.addEventListener('cancel', event => {
    if (busy || editing !== null) event.preventDefault();
    if (!busy && editing !== null) cancelEditing();
  });

  const launcher = document.createElement('button');
  launcher.id = panelId + '-launcher';
  launcher.type = 'button';
  launcher.title = '壁纸库（Alt+Shift+W）';
  launcher.setAttribute('aria-label', '壁纸库');
  launcher.style.cssText = 'width:32px;height:32px;flex:none;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--color-text-secondary,currentColor);cursor:pointer';
  launcher.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m4 16 5-5 4 4 3-3 4 4"/><circle cx="15.5" cy="8.5" r="1"/></svg>';
  launcher.onpointerenter = () => { launcher.style.background = 'var(--color-bg-secondary-hover, #ffffff19)'; };
  launcher.onpointerleave = () => { launcher.style.background = 'transparent'; };
  launcher.onclick = event => { if (event.isTrusted) host.reopen(); };
  const attachLauncher = () => {
    const rail = document.querySelector('nav[class*="group/sidebar-rail"] [class*="group/nav-list"]');
    if (rail && launcher.parentElement !== rail) rail.append(launcher);
  };
  const railObserver = new MutationObserver(attachLauncher);
  host.dispose = () => {
    railObserver.disconnect();
    document.removeEventListener('keydown', shortcut, true);
    window.removeEventListener('resize', loadVisiblePreviews);
    launcher.remove();
    host.remove();
  };
  const shortcut = event => {
    if (!event.isTrusted || event.code !== 'KeyW' || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    host.reopen();
  };
  document.body.append(host);
  attachLauncher();
  railObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', shortcut, true);
  list.addEventListener('scroll', loadVisiblePreviews, { passive: true });
  window.addEventListener('resize', loadVisiblePreviews);
  loadSettings(settings);
  host.syncPlayback(playback);
  if (visible) host.reopen();
  return true;
}
