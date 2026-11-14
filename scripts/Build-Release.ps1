$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $project '.codex-plugin\plugin.json') | ConvertFrom-Json
$nodeVersion = '22.23.5'
$nodeHash = '247E9693D316DA9857E44990E5E11709F596F18112251B8026EC6EED80BDF38A'
$licenseHash = 'C738AE413CF561F174E34F6961F8CA458AAE2369A73640DDA6234C629B98BCC4'
$runtimeCache = Join-Path $project "work\node-v$nodeVersion"
$node = Join-Path $runtimeCache 'node.exe'
$license = Join-Path $runtimeCache 'LICENSE'

New-Item -ItemType Directory -Force -Path $runtimeCache | Out-Null
foreach ($file in @(
    @{ Path = $node; Hash = $nodeHash; Url = "https://nodejs.org/dist/v$nodeVersion/win-x64/node.exe" },
    @{ Path = $license; Hash = $licenseHash; Url = "https://raw.githubusercontent.com/nodejs/node/v$nodeVersion/LICENSE" }
)) {
    if (!(Test-Path -LiteralPath $file.Path) -or (Get-FileHash -LiteralPath $file.Path).Hash -ne $file.Hash) {
        & curl.exe --fail --silent --show-error --location --max-time 180 --output $file.Path $file.Url
        if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $file.Path).Hash -ne $file.Hash) {
            throw "Could not verify downloaded release file $($file.Path)"
        }
    }
}

$name = "Codex-Wallpaper-$($manifest.version)-Windows-x64"
$build = Join-Path $project ('work\release-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $build $name
$output = Join-Path $project 'dist'
foreach ($directory in @($output, (Join-Path $stage 'runtime'), (Join-Path $stage 'scripts'), (Join-Path $stage 'vendor'))) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
foreach ($entry in @('.codex-plugin', 'src', 'Install.cmd', 'README.md', 'README.en.md')) {
    Copy-Item -LiteralPath (Join-Path $project $entry) -Destination $stage -Recurse
}
Copy-Item -LiteralPath (Join-Path $project 'vendor\webwallgl') -Destination (Join-Path $stage 'vendor') -Recurse
Copy-Item -LiteralPath (Join-Path $project 'scripts\Install-Local.ps1') -Destination (Join-Path $stage 'scripts')
Copy-Item -LiteralPath $node,$license -Destination (Join-Path $stage 'runtime')

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $build "$name.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
$release = Join-Path $output "$name.zip"
Copy-Item -LiteralPath $zip -Destination $release -Force
Write-Output $release
