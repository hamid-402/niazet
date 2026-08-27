param(
  [ValidateSet('start', 'stop', 'status', 'health')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $RepoRoot '_runtime'
$PidRoot = Join-Path $RuntimeRoot 'pids'
$LogRoot = Join-Path $RuntimeRoot 'logs'

$Services = @(
  @{
    Name = 'api'
    WorkDir = Join-Path $RepoRoot 'apps\api'
    Arguments = @('run', 'start:dev')
    HealthUrl = 'http://localhost:3001/health'
  },
  @{
    Name = 'web'
    WorkDir = Join-Path $RepoRoot 'apps\web'
    Arguments = @('run', 'dev', '--', '--port', '3002')
    HealthUrl = 'http://localhost:3002/'
  }
)

function Get-StateFile($Service) {
  return Join-Path $PidRoot "$($Service.Name).json"
}

function Get-TrackedProcess($Service) {
  $StateFile = Get-StateFile $Service
  if (-not (Test-Path -LiteralPath $StateFile)) {
    return $null
  }

  try {
    $State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    $Process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
    if ($Process.StartTime.ToUniversalTime().ToFileTimeUtc() -ne [long]$State.startedAt) {
      return $null
    }
    return $Process
  }
  catch {
    return $null
  }
}

function Stop-ProcessTree([int]$ProcessId) {
  $Children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId"
  foreach ($Child in $Children) {
    Stop-ProcessTree ([int]$Child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Test-Health($Service) {
  try {
    $Response = Invoke-WebRequest -Uri $Service.HealthUrl -UseBasicParsing -TimeoutSec 3
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 400
  }
  catch {
    return $false
  }
}

New-Item -ItemType Directory -Path $PidRoot, $LogRoot -Force | Out-Null

if ($Action -eq 'start') {
  & (Join-Path $PSScriptRoot 'runtime.ps1') attach | Out-Null

  foreach ($Service in $Services) {
    if (Get-TrackedProcess $Service) {
      Write-Host "$($Service.Name) is already running."
      continue
    }

    $StateFile = Get-StateFile $Service
    if (Test-Path -LiteralPath $StateFile) {
      Remove-Item -LiteralPath $StateFile -Force
    }

    $StdOut = Join-Path $LogRoot "$($Service.Name).out.log"
    $StdErr = Join-Path $LogRoot "$($Service.Name).err.log"
    $Process = Start-Process -FilePath 'npm.cmd' -ArgumentList $Service.Arguments `
      -WorkingDirectory $Service.WorkDir -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $StdOut -RedirectStandardError $StdErr
    $Process.Refresh()
    @{
      pid = $Process.Id
      startedAt = $Process.StartTime.ToUniversalTime().ToFileTimeUtc()
    } | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
  }

  $Deadline = (Get-Date).AddSeconds(45)
  do {
    $Ready = @($Services | Where-Object { -not (Test-Health $_) })
    if ($Ready.Count -eq 0) { break }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $Deadline)
}

if ($Action -eq 'stop') {
  foreach ($Service in $Services) {
    $Process = Get-TrackedProcess $Service
    if ($Process) {
      Stop-ProcessTree $Process.Id
    }
    $StateFile = Get-StateFile $Service
    if (Test-Path -LiteralPath $StateFile) {
      Remove-Item -LiteralPath $StateFile -Force
    }
  }
}

$Services | ForEach-Object {
  $Process = Get-TrackedProcess $_
  [pscustomobject]@{
    Service = $_.Name
    Process = if ($Process) { "running ($($Process.Id))" } else { 'stopped' }
    Health = if (Test-Health $_) { 'healthy' } else { 'unavailable' }
    Url = $_.HealthUrl
  }
} | Format-Table -AutoSize
