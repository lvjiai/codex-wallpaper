import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { debugStatus } from './cdp.mjs';
import { readConfig } from './platform.mjs';
import { backgroundRequest } from './background.mjs';

let normal = process.argv.includes('--normal');
const dryRun = process.argv.includes('--dry-run');
const requestedWallpaper = process.argv.includes('--wallpaper') && !normal;
const configFile = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'config.toml');
if (requestedWallpaper) {
  const config = existsSync(configFile) ? readFileSync(configFile, 'utf8') : '';
  const enabled = config.match(/^\[plugins\."codex-wallpaper@codex-wallpaper-local"\][^\S\r\n]*\r?\n([^\[]*)/m)?.[1];
  if (!enabled || !/^\s*enabled\s*=\s*true\b/m.test(enabled)) {
    normal = true;
  }
}
const wallpaper = requestedWallpaper && !normal;
const port = readConfig().cdpPort || 9222;
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const ps = script => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + script], { windowsHide: true, encoding: 'utf8' }).trim();
const installedExecutable = process.env.CODEX_WALLPAPER_APP;
const executable = installedExecutable && existsSync(installedExecutable) ? installedExecutable :
  path.join(ps('(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation)'), 'app', 'ChatGPT.exe');
if (!existsSync(executable)) throw new Error('Codex 启动文件未找到。');
const args = normal ? [] : ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port];
const running = Number(ps("@(Get-CimInstance Win32_Process -Filter \"Name='ChatGPT.exe'\" | Where-Object { $_.ExecutablePath -like '*OpenAI.Codex_*ChatGPT.exe' }).Count"));
if (dryRun) {
  console.log(JSON.stringify({ executable, args, runningProcesses: running, wallpaper, launchesApplication: false }, null, 2));
} else {
  const current = await debugStatus(port);
  if (!normal && current.available) {
    if (wallpaper) await backgroundRequest('initialize');
    console.log('本地 Codex 页面调试已就绪。');
  } else if (running > 0) {
    console.error('请先在 Codex 中正常退出应用，再重新运行此入口。此脚本不会强制结束应用或当前聊天。');
    process.exit(2);
  } else {
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; }); child.unref();
    if (wallpaper) {
      let startupError;
      for (let attempt = 0; attempt < 45; attempt++) {
        if ((await debugStatus(port)).available) {
          try {
            await backgroundRequest('initialize');
            process.exit(0);
          } catch (error) { startupError = error; }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw startupError || new Error('Codex 启动后未提供本机调试连接。');
    }
  }
}
