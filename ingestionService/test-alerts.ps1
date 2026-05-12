$apiKey = $env:SOC_API_KEY
if (-not $apiKey) {
    $apiKey = "test-api-key-12345"
    $env:SOC_API_KEY = $apiKey
}
$url = "http://localhost:4000/log"

function Send-FakeAlert {
    param (
        [string]$type,
        [hashtable]$payload
    )

    $body = @{
        type = $type
        payload = $payload
        timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json

    try {
        $response = Invoke-WebRequest -Uri $url -Method POST -Body $body -ContentType "application/json" -Headers @{
            "x-api-key" = $apiKey
        } -UseBasicParsing
        Write-Host "Sent $type alert: $($response.StatusCode)"
    } catch {
        Write-Host "Error sending $type alert: $($_.Exception.Message)"
    }
}

$severityLevels = @("low", "medium", "high", "critical")
$statusOptions = @("success", "failure")
$externalIPs = @("8.8.8.8", "1.1.1.1", "185.220.101.1")

for ($i = 1; $i -le 50; $i++) {

    $randomIP = Get-Random -InputObject $externalIPs
    $severity = Get-Random -InputObject $severityLevels
    $status = Get-Random -InputObject $statusOptions

    Send-FakeAlert -type "auth" -payload @{
        user = "user$i"
        status = $status
        ip = $randomIP
        hostname = "host-$(Get-Random -Minimum 1 -Maximum 5)"
        failed_logins = Get-Random -Minimum 0 -Maximum 10
        score = [decimal](Get-Random -Minimum 1 -Maximum 100) / 10
        severity = $severity
    }

    Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 800)
}