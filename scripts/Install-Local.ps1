param([string] $DesktopDirectory = [Environment]::GetFolderPath('DesktopDirectory'))

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$app = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
if (!$app) { throw 'Install the official Windows ChatGPT desktop app first: https://chatgpt.com/download' }
$icon = Join-Path $app.InstallLocation 'app\ChatGPT.exe'
$codex = Join-Path $app.InstallLocation 'app\resources\codex.exe'
if (!(Test-Path -LiteralPath $codex)) {
    $cli = Get-Command codex.exe -ErrorAction SilentlyContinue
    if (!$cli) { throw 'This ChatGPT version does not include Codex CLI. Update ChatGPT and try again.' }
    $codex = $cli.Source
}
$codexRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$market = Join-Path $codexRoot 'plugins\local-marketplaces\codex-wallpaper-local'
$package = Join-Path $market 'plugins\codex-wallpaper'
$data = Join-Path $env:LOCALAPPDATA 'CodexWallpaper'
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $project '.codex-plugin\plugin.json') | ConvertFrom-Json
$bundledNode = Join-Path $project 'runtime\node.exe'
if (Test-Path -LiteralPath $bundledNode) {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') {
        throw 'This package requires x64 Windows.'
    }
    $runtime = Join-Path $data ('runtime\' + $manifest.version)
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $node = Join-Path $runtime 'node.exe'
    if (!(Test-Path -LiteralPath $node) -or (Get-FileHash $node).Hash -ne (Get-FileHash $bundledNode).Hash) {
        Copy-Item -LiteralPath $bundledNode -Destination $node -Force
    }
    Copy-Item -LiteralPath (Join-Path $project 'runtime\LICENSE') -Destination $runtime -Force
} else {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
}
$nodeVersion = & $node -p "process.versions.node"
if ($LASTEXITCODE -ne 0 -or ([version]$nodeVersion).Major -lt 22) { throw 'Node.js 22 or newer is required.' }
foreach ($directory in @($data, (Join-Path $market '.agents\plugins'), $package, $DesktopDirectory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
foreach ($entry in @('.codex-plugin', 'src', 'vendor')) {
    Copy-Item -LiteralPath (Join-Path $project $entry) -Destination $package -Recurse -Force
}
$previous = Join-Path $project '.state\config.json'
$settings = Join-Path $data 'config.json'
if ((Test-Path -LiteralPath $previous) -and !(Test-Path -LiteralPath $settings)) {
    Copy-Item -LiteralPath $previous -Destination $settings
}
$catalog = @{
    name = 'codex-wallpaper-local'
    interface = @{ displayName = 'Codex Wallpaper Local' }
    plugins = @(@{
        name = 'codex-wallpaper'
        source = @{ source = 'local'; path = './plugins/codex-wallpaper' }
        policy = @{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }
        category = 'Productivity'
    })
}
$mcp = @{ mcpServers = @{ 'codex-wallpaper' = @{
    command = $node
    args = @((Join-Path $package 'src\mcp.mjs'))
    cwd = $package
    env = @{ CODEX_WALLPAPER_DATA = $data }
} } }
[IO.File]::WriteAllText((Join-Path $market '.agents\plugins\marketplace.json'), ($catalog | ConvertTo-Json -Depth 8))
[IO.File]::WriteAllText((Join-Path $package '.mcp.json'), ($mcp | ConvertTo-Json -Depth 8))
$null = & $codex plugin marketplace add $market --json
if ($LASTEXITCODE -ne 0) { throw 'Could not register the local wallpaper marketplace.' }
$result = & $codex plugin add codex-wallpaper@codex-wallpaper-local --json
if ($LASTEXITCODE -ne 0) { throw 'Could not install the Codex Wallpaper plugin.' }
$installed = ($result | ConvertFrom-Json).installedPath
if (!$installed) { throw 'Codex did not return the installed plugin path.' }
if (!(Test-Path -LiteralPath (Join-Path $installed 'src\background.mjs'))) { throw 'Installed plugin files could not be located.' }

$launcher = Join-Path $data 'Start-CodexWallpaper.vbs'
$shell = New-Object -ComObject WScript.Shell
$scriptHost = Join-Path $env:WINDIR 'System32\wscript.exe'
$launcherArgument = '"' + $launcher + '"'
for ($i = 0; ; $i++) {
    $name = if ($i -eq 0) { 'ChatGPT' } elseif ($i -eq 1) { 'ChatGPT (Wallpaper)' } else { "ChatGPT (Wallpaper $i)" }
    $desktopLink = Join-Path $DesktopDirectory "$name.lnk"
    $link = $shell.CreateShortcut($desktopLink)
    if (!(Test-Path -LiteralPath $desktopLink) -or
        ($link.TargetPath -ieq $scriptHost -and $link.Arguments -eq $launcherArgument)) { break }
}
$command = '"' + $node + '" "' + (Join-Path $package 'src\launch.mjs') + '" --wallpaper'
$codexHome = 'shell.Environment("Process")("CODEX_HOME") = "' + $codexRoot.Replace('"','""') + '"'
$script = @(
    'Set shell = CreateObject("WScript.Shell")',
    $codexHome,
    ('shell.Environment("Process")("CODEX_WALLPAPER_DATA") = "' + $data.Replace('"','""') + '"'),
    ('shell.Environment("Process")("CODEX_WALLPAPER_APP") = "' + $icon.Replace('"','""') + '"'),
    ('result = shell.Run("' + $command.Replace('"','""') + '", 0, True)'),
    'If result = 2 Then',
    '    MsgBox "ChatGPT is already running. Quit ChatGPT normally, then open this desktop shortcut again.", 48, "ChatGPT"',
    'ElseIf result <> 0 Then',
    '    MsgBox "ChatGPT Wallpaper could not start. Open Codex Wallpaper plugin settings or contact the maintainer.", 48, "ChatGPT"',
    'End If'
) -join [Environment]::NewLine
[IO.File]::WriteAllText($launcher, $script, [Text.Encoding]::Unicode)
$link.TargetPath = $scriptHost
$link.Arguments = $launcherArgument
$link.WorkingDirectory = $data
$link.IconLocation = "$icon,0"
$link.Description = 'Open ChatGPT with the Codex Wallpaper plugin'
$link.Save()
Write-Host "Installed Codex Wallpaper $($manifest.version). Open $name from the desktop."
