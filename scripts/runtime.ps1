param(
  [ValidateSet('attach', 'detach', 'install', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $RepoRoot '_runtime'

$Links = @(
  @{
    Link = Join-Path $RepoRoot 'apps\api\node_modules'
    Target = Join-Path $RuntimeRoot 'apps\api\node_modules'
  },
  @{
    Link = Join-Path $RepoRoot 'apps\web\node_modules'
    Target = Join-Path $RuntimeRoot 'apps\web\node_modules'
  },
  @{
    Link = Join-Path $RepoRoot 'apps\web\.next'
    Target = Join-Path $RuntimeRoot 'apps\web\.next'
  },
  @{
    Link = Join-Path $RepoRoot 'apps\api\storage'
    Target = Join-Path $RuntimeRoot 'apps\api\storage'
  }
)

$Packages = @(
  @{
    Source = Join-Path $RepoRoot 'apps\api'
    Target = Join-Path $RuntimeRoot 'apps\api'
  },
  @{
    Source = Join-Path $RepoRoot 'apps\web'
    Target = Join-Path $RuntimeRoot 'apps\web'
  }
)

function Get-LinkState($Entry) {
  if (-not (Test-Path -LiteralPath $Entry.Link)) {
    return 'detached'
  }

  $Item = Get-Item -LiteralPath $Entry.Link -Force
  if ($Item.LinkType -eq 'Junction' -and $Item.Target -contains $Entry.Target) {
    return 'attached'
  }

  return 'occupied'
}

if ($Action -eq 'install') {
  foreach ($Package in $Packages) {
    New-Item -ItemType Directory -Path $Package.Target -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $Package.Source 'package.json') -Destination $Package.Target -Force
    Copy-Item -LiteralPath (Join-Path $Package.Source 'package-lock.json') -Destination $Package.Target -Force

    Write-Host "Installing dependencies in $($Package.Target)"
    & npm.cmd ci --prefix $Package.Target
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed for $($Package.Source)"
    }
  }

  $Action = 'attach'
}

foreach ($Entry in $Links) {
  $State = Get-LinkState $Entry

  if ($Action -eq 'attach') {
    if ($State -eq 'attached') {
      continue
    }
    if ($State -eq 'occupied') {
      throw "Cannot attach: path is occupied by a real directory: $($Entry.Link)"
    }
    if (-not (Test-Path -LiteralPath $Entry.Target)) {
      New-Item -ItemType Directory -Path $Entry.Target -Force | Out-Null
    }
    New-Item -ItemType Junction -Path $Entry.Link -Target $Entry.Target | Out-Null
  }

  if ($Action -eq 'detach') {
    if ($State -eq 'occupied') {
      throw "Refusing to remove a real directory: $($Entry.Link)"
    }
    if ($State -eq 'attached') {
      # Remove-Item can throw a PowerShell NullReferenceException for valid
      # junctions on some Windows versions. Directory.Delete removes only the
      # verified reparse-point entry, never the runtime target or its content.
      [System.IO.Directory]::Delete($Entry.Link)
    }
  }
}

$Links | ForEach-Object {
  [pscustomobject]@{
    Path = $_.Link
    State = Get-LinkState $_
    RuntimeTarget = $_.Target
    RuntimeExists = Test-Path -LiteralPath $_.Target
  }
} | Format-Table -AutoSize
