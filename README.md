# Codex Wallpaper

简体中文 · [English](README.en.md)

Windows ChatGPT 桌面端的 Wallpaper Engine 动态背景插件。支持在应用内播放创意工坊视频和实时场景、创建轮播列表及设置过场。

## 安装 Windows 发行包

1. 安装[官方 Windows x64 版 ChatGPT](https://chatgpt.com/download/)、Steam 和 Wallpaper Engine。在 Wallpaper Engine 中下载至少一张场景或视频壁纸。
2. 打开 [GitHub Releases](https://github.com/lvjiai/codex-wallpaper/releases/latest)，在 **Assets** 下下载 `Codex-Wallpaper-*-Windows-x64.zip`。
3. 完整解压 ZIP，双击解压目录中的 `Install.cmd`。安装包自带 Node.js，安装脚本会注册本地插件并创建桌面快捷方式。
4. 如果 ChatGPT 正在运行，从应用菜单正常退出。双击安装过程中提示的桌面快捷方式「ChatGPT」或「ChatGPT (Wallpaper)」。
5. 点击 ChatGPT 左侧的图片图标，或按 `Alt+Shift+W`。在「壁纸库」里选择一张壁纸。之后用同一个桌面入口打开 ChatGPT，插件会自动恢复已启用的壁纸。

安装脚本按当前 Windows 用户安装。桌面快捷方式会启用回环地址上的调试连接，供插件在应用内绘制壁纸。视频和场景文件来自自己的壁纸库，播放场景无需 Windows 捕获授权。

如果侧栏图标未出现，请确认 ChatGPT 已完全退出，再从安装程序创建的快捷方式打开。如果 ChatGPT 更新后快捷方式无法启动，可重新运行安装脚本以刷新入口。可在 ChatGPT 的「插件」页面停用或卸载 Codex 壁纸。

## 实现方向

场景壁纸由插件内置的 WebWallGL 在 ChatGPT 的沙箱壁纸图层中实时渲染，读取本机 Wallpaper Engine 的项目和素材。视频壁纸直接播放创意工坊或本地项目里的源文件，保留源分辨率和帧率。场景与视频共用外观、轮播及过场，新壁纸准备好后才切换。

Codex 原生窗口保持不透明，文字、代码、输入框保持独立不透明。应用内壁纸可与桌面不同。插件使用本机调试连接和临时页面背景层。

## 开发与构建

需要 Node.js 22+。运行 `npm test` 检查插件，运行 `node src/cli.mjs list` 查看壁纸库。旧版窗口捕获验证工具保留在 `native/` 和 `scripts/Validate-Scene.cmd`，仅供历史复现实验使用。

运行 `scripts\Build-Release.ps1` 生成 `dist\` 下的 Windows x64 ZIP。构建脚本校验 Node.js 运行时和许可文件的 SHA-256。包内包含插件运行文件、安装脚本、WebWallGL 和 Node.js。

## 安装本地插件

从项目目录运行 `scripts\Install-Local.ps1`。安装程序注册本地插件市场并安装「Codex 壁纸」，首次安装会迁移开发版的壁纸列表和分组。壁纸设置保存在当前用户的 `%LOCALAPPDATA%\CodexWallpaper`。

插件可从 Codex 的插件管理界面管理。安装后，从桌面双击「ChatGPT」即可打开官方客户端并恢复已启用的壁纸。这个桌面快捷方式会启用仅绑定回环地址的调试连接。如果已从其他入口打开 ChatGPT，先正常退出，再双击桌面图标。场景播放和自动轮播均无需 Windows 捕获授权。

- `wallpaper_choose` 打开壁纸库。运行后可从 Codex 左侧应用导航里的图片图标或 `Alt+Shift+W` 再次打开。设置页显示当前壁纸、切换过场和自动轮播。新建或编辑轮播列表时打开大图预览，可搜索、筛选并多选。过场支持硬切、交叉淡化、推移、擦除、光圈、缩放和条带。
- `wallpaper_list` 列出已下载的场景和视频壁纸。
- 「播放」页支持以页面中心为锚点缩放、水平和垂直构图位置、壁纸模糊及全窗口壁纸暗化。调整即时预览，松开滑块后保存。放大后，位置滑块可以移动到更多画面区域。缩小时若原位置会露出空边，自动贴合最近的边缘。
- `wallpaper_start` 播放指定列表，可设置轮换间隔、帧率和暗化。
- `wallpaper_stop` 释放场景和视频资源并移除背景层。

在项目目录运行 `node src/cli.mjs select` 也可打开选择器，`node src/cli.mjs run` 播放上次保存的选择。

场景默认以 30 fps 为目标，帧率随场景复杂度和 GPU 性能变化。顺序轮换间隔默认 300 秒，暗化 0.48。WebWallGL 对 Wallpaper Engine 的效果和场景脚本支持随项目而异。

## 历史资料

- 场景渲染参考 [DSH Wallpaper Engine](https://github.com/elysia395/dsh-wallpaper-engine/blob/44371fa5bdf6fcdd173ca894d2bbf6eb3d8c6530/docs/HOW-IT-WORKS.md)。内置 [WebWallGL 3.0.0](https://www.npmjs.com/package/webwallgl/v/3.0.0)，授权文件位于 `vendor/webwallgl/LICENSE`。
- [早期 DSH 视频壁纸参考仓库](https://github.com/li8476295-bot/dsh-plugin-wallpaper-engine/tree/2ae85c8a491ce179633a045c663b1b51ca5189c3)。
- tools/SourceInspector.cs：只读查看当前安装包的主题和窗口相关源码。
- docs/requirements.md：当前需求和已批准的边界。
