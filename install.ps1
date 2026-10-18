param(
  [switch]$SkipSkillInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Require-Node {
  $node = Get-Command node -ErrorAction Stop
  $version = (& $node.Source --version) -replace "^v", ""
  $major = [int]($version.Split(".")[0])
  if ($major -lt 20) {
    throw "Node.js 20 or newer is required. Current version: $version"
  }
  Write-Host "Node.js $version"
}

function Copy-Skill($Destination) {
  $Source = Join-Path $Root "skills/miffy-video-intel"
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
  Write-Host "Skill installed: $Destination"
}

Require-Node

Push-Location $Root
try {
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example. Fill it with local Feishu values."
  }
} finally {
  Pop-Location
}

if (-not $SkipSkillInstall) {
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
  Copy-Skill (Join-Path $codexHome "skills/miffy-video-intel")

  $claudeSkills = Join-Path $HOME ".claude/skills"
  if (Test-Path $claudeSkills) {
    Copy-Skill (Join-Path $claudeSkills "miffy-video-intel")
  }

  if ($env:MUSE_SKILLS_DIR -and (Test-Path $env:MUSE_SKILLS_DIR)) {
    Copy-Skill (Join-Path $env:MUSE_SKILLS_DIR "miffy-video-intel")
  }
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Edit .env with your Feishu app and Bitable values."
Write-Host "2. npm run doctor"
Write-Host "3. npm run validate:examples"
Write-Host "4. npm run dry-run"
