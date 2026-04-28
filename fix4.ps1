$c = Get-Content "professor-ver.html" -Raw
$c = $c -replace "htmlContent \+= </div>";[\s]+htmlContent \+= </div>", "htmlContent += </div>"
Set-Content -Path "professor-ver.html" -Value $c -Encoding UTF8 -NoNewline
Write-Host "Fixed"
