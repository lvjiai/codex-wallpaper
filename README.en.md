# Codex Wallpaper

[简体中文](README.md) · English

A Wallpaper Engine plugin for the ChatGPT desktop app on Windows. Play Workshop videos and live scenes inside ChatGPT, build playlists, and choose how wallpapers transition.

## Install on Windows

1. Install the official ChatGPT desktop app for x64 Windows, Steam, and Wallpaper Engine. Download at least one scene or video wallpaper in Wallpaper Engine. [Download ChatGPT](https://chatgpt.com/download/)
2. Open the latest release and download `Codex-Wallpaper-*-Windows-x64.zip` under **Assets**. [GitHub Releases](https://github.com/lvjiai/codex-wallpaper/releases/latest)
3. Extract the entire ZIP and double-click `Install.cmd`. The package includes Node.js. The installer registers the local plugin and creates a desktop shortcut.
4. If ChatGPT is running, quit it from the app menu. Open the shortcut named by the installer, usually **ChatGPT** or **ChatGPT (Wallpaper)**.
5. Click the picture icon in the left sidebar or press `Alt+Shift+W`. Pick a wallpaper in the library (`壁纸库`). ChatGPT resumes playback the next time you open it from the same shortcut.

The installer runs for the current Windows user. The shortcut enables a loopback debugging connection so the plugin can render inside ChatGPT. Scene wallpapers use local Wallpaper Engine assets and require no Windows capture permission.

If the sidebar icon is missing, fully quit ChatGPT and reopen it from the installed shortcut. If a ChatGPT update breaks the shortcut, rerun the installer to refresh it. Use ChatGPT's Plugins page to disable or uninstall Codex Wallpaper.

## Playback

- The wallpaper library shows the current wallpaper and lets you preview, search, filter, and select wallpapers when creating or editing a playlist.
- Playlists support timed rotation and seven transitions: cut, crossfade, push, wipe, iris, zoom, and stripes.
- The playback tab (`播放`) adjusts zoom around the window center, horizontal and vertical position, blur, and wallpaper dimming across the window. Changes preview immediately and save when you release the slider.
- Scenes target 30 fps by default. Actual performance and support for Wallpaper Engine effects and scripts vary by scene and GPU. The default sequential rotation interval is 300 seconds, and the dimming parameter defaults to 0.48.

## How it works

WebWallGL renders scenes in a sandboxed wallpaper layer inside ChatGPT. Videos play directly from Workshop or local project files at their source resolution and frame rate. Both media types share the appearance controls and rotation settings. Transitions start once the incoming wallpaper is ready.

The app window stays opaque, and text, code, and input controls keep their own opacity. The wallpaper inside ChatGPT is independent of the Windows desktop wallpaper.

## Develop and build

Use Node.js 22 or newer. Run `npm test` to check the plugin and `node src/cli.mjs list` to see the local wallpaper library. The old window-capture tools in `native/` and `scripts/Validate-Scene.cmd` are retained for reproducing earlier experiments.

Run `scripts\Build-Release.ps1` to write the Windows x64 ZIP to `dist\`. The build verifies the SHA-256 hashes of the Node.js runtime and license file. The ZIP contains the plugin, installer, WebWallGL, and Node.js.

To install from a checkout, run `scripts\Install-Local.ps1`. It registers the local plugin marketplace and migrates any development settings on the first installation. User settings are stored in `%LOCALAPPDATA%\CodexWallpaper`.

| Plugin tool | Action |
| --- | --- |
| `wallpaper_choose` | Open the wallpaper library. |
| `wallpaper_list` | List downloaded scene and video wallpapers. |
| `wallpaper_start` | Play a playlist with configurable interval, frame rate, and dimming. |
| `wallpaper_stop` | Release playback resources and remove the wallpaper layer. |

From the project directory, `node src/cli.mjs select` opens the wallpaper picker and `node src/cli.mjs run` plays the saved selection.

## Credits and references

- The scene renderer follows the approach documented by DSH Wallpaper Engine. [How DSH renders wallpapers](https://github.com/elysia395/dsh-wallpaper-engine/blob/44371fa5bdf6fcdd173ca894d2bbf6eb3d8c6530/docs/HOW-IT-WORKS.md)
- The bundled WebWallGL 3.0.0 license is in `vendor/webwallgl/LICENSE`. [WebWallGL package](https://www.npmjs.com/package/webwallgl/v/3.0.0)
- The original DSH video wallpaper plugin informed the early implementation. [Reference source](https://github.com/li8476295-bot/dsh-plugin-wallpaper-engine/tree/2ae85c8a491ce179633a045c663b1b51ca5189c3)
- See [project requirements](docs/requirements.md) and the [read-only app source inspector](tools/SourceInspector.cs) for development context.
