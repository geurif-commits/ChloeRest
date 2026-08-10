param(
  [string]$Url = "http://localhost:3000/api/health",
  [int]$TimeoutSec = 5
)
try {
  $resp = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec $TimeoutSec
  Write-Output "OK: $($resp | ConvertTo-Json -Compress)"
  exit 0
} catch {
  Write-Error "FAIL: $($_.Exception.Message)"
  exit 2
}
