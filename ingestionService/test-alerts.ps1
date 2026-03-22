$apiKey = $env:SOC_API_KEY
$url = "http://localhost:3000/log"

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
        }
        Write-Host "Sent $type alert: $($response.StatusCode)"
    } catch {
        Write-Host "Error sending $type alert: $($_.Exception.Message)"
    }
}

$severityLevels = @("low", "medium", "high", "critical")
$statusOptions = @("success", "failure")
$externalIPs = @("8.8.8.8", "1.1.1.1", "185.220.101.1")

for ($i = 1; $i -le 20; $i++) {

    $randomIP = Get-Random -InputObject $externalIPs
    $severity = Get-Random -InputObject $severityLevels

    Send-FakeAlert -type "auth" -payload @{
        user = "user$i"
        status = Get-Random -InputObject $statusOptions
        ip = $randomIP
        
    }

    Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 800)
}