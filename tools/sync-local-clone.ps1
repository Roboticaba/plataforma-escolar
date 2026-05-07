$ErrorActionPreference = "Stop"

$source = "E:\plataforma-escolar-main"
$destination = "C:\Users\USUARIO\Documents\Plataforma\plataforma-escolar-main-clone"

if (!(Test-Path -LiteralPath $source -PathType Container)) {
  throw "Pasta de origem nao encontrada: $source"
}

if (!(Test-Path -LiteralPath $destination -PathType Container)) {
  New-Item -ItemType Directory -Path $destination | Out-Null
}

robocopy $source $destination /E /XD .git node_modules /XF dev-server.out.log dev-server.err.log | Out-Host

$exitCode = $LASTEXITCODE
if ($exitCode -le 7) {
  exit 0
}

exit $exitCode
