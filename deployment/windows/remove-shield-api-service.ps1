param(
  [string]$ServiceName = "ShieldApi",
  [string]$NssmPath = ""
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  throw "Run PowerShell as Administrator before removing the Windows service."
}

if (-not $NssmPath) {
  $nssmCommand = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($nssmCommand) {
    $NssmPath = $nssmCommand.Source
  }
}

if (-not $NssmPath -or -not (Test-Path $NssmPath)) {
  throw "nssm.exe was not found. Install NSSM or pass -NssmPath C:\path\to\nssm.exe."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Host "Service $ServiceName is not installed."
  exit 0
}

if ($service.Status -ne "Stopped") {
  Stop-Service -Name $ServiceName -Force
}

& $NssmPath remove $ServiceName confirm

Write-Host "Removed $ServiceName." -ForegroundColor Green
