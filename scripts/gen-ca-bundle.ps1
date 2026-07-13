# Export the machine's trusted root CAs (including any corporate SSL-inspection CA) to a PEM bundle
# so Node/firebase-admin can complete TLS to Google. Run: npm run gen-certs
$dir = Join-Path $PSScriptRoot '..\certs'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$out = Join-Path $dir 'ca-bundle.pem'
$sb = New-Object System.Text.StringBuilder
$certs = Get-ChildItem Cert:\LocalMachine\Root
$certs += Get-ChildItem Cert:\CurrentUser\Root
foreach ($c in $certs) {
  $b64 = [System.Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
  [void]$sb.AppendLine('# ' + $c.Subject)
  [void]$sb.AppendLine('-----BEGIN CERTIFICATE-----')
  [void]$sb.AppendLine($b64)
  [void]$sb.AppendLine('-----END CERTIFICATE-----')
}
Set-Content -Path $out -Value $sb.ToString() -Encoding ascii
Write-Output ("Wrote {0} certs to {1}" -f $certs.Count, $out)
