param(
  [string]$ServiceName = "ShieldApi",
  [string]$ProjectRoot = "",
  [string]$NssmPath = ""
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  throw "Run PowerShell as Administrator before installing the Windows service."
}

if (-not $ProjectRoot) {
  $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
}

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$BackendRoot = Join-Path $ProjectRoot "backend"
$BackendEntry = Join-Path $BackendRoot "dist\index.js"
$LogRoot = Join-Path $BackendRoot "logs"

if (-not (Test-Path $BackendEntry)) {
  throw "Backend build not found at $BackendEntry. Run 'npm install' and 'npm run build' in the backend folder first."
}

if (-not (Test-Path (Join-Path $BackendRoot ".env"))) {
  Write-Warning "No backend .env file was found. The service will start, but database/email settings may be missing."
}

if (-not (Test-Path $LogRoot)) {
  New-Item -ItemType Directory -Path $LogRoot | Out-Null
}

$NodePath = (Get-Command node.exe -ErrorAction Stop).Source

if (-not $NssmPath) {
  $nssmCommand = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($nssmCommand) {
    $NssmPath = $nssmCommand.Source
  }
}

if (-not $NssmPath -or -not (Test-Path $NssmPath)) {
  throw "nssm.exe was not found. Install NSSM or pass -NssmPath C:\path\to\nssm.exe."
}

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
  throw "A service named $ServiceName already exists. Remove it first or choose a different -ServiceName."
}

& $NssmPath install $ServiceName $NodePath "dist\index.js"
& $NssmPath set $ServiceName AppDirectory $BackendRoot
& $NssmPath set $ServiceName DisplayName "Shield API"
& $NssmPath set $ServiceName Description "Runs the Shield Express API and starts automatically with Windows."
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppEnvironmentExtra NODE_ENV=production
& $NssmPath set $ServiceName AppStdout (Join-Path $LogRoot "service-output.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $LogRoot "service-error.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 10485760
& $NssmPath set $ServiceName AppExit Default Restart
& $NssmPath set $ServiceName AppThrottle 1500

Start-Service -Name $ServiceName
Get-Service -Name $ServiceName

Write-Host ""
Write-Host "Installed and started $ServiceName." -ForegroundColor Green
Write-Host "Logs:"
Write-Host "  $(Join-Path $LogRoot "service-output.log")"
Write-Host "  $(Join-Path $LogRoot "service-error.log")"
