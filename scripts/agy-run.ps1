# Run agy unattended on a work branch and write its output to .agy-log.txt.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\agy-run.ps1 -PromptFile <UTF-8 text file>
# The prompt comes from a file because quotes do not survive being passed on a PowerShell command line.
param([Parameter(Mandatory = $true)][string]$PromptFile)

$Prompt = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PromptFile).Path)
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root

$branch = git branch --show-current
if (-not $branch -or $branch -eq 'main') {
  Write-Error "agy-run: create a work branch first (current: '$branch')."
  exit 2
}

$rules = 'Edit files only. Do not commit, push, or switch branches. Do not add AI attribution anywhere.'
# Windows PowerShell 5.1 does not escape quotes in native arguments.
$arg = "$rules`n`n$Prompt" -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1'

$log = Join-Path $root '.agy-log.txt'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
[IO.File]::WriteAllText($log, "branch: $branch`nprompt: $Prompt`n---`n", $utf8)

& agy -p $arg 2>&1 | ForEach-Object {
  [IO.File]::AppendAllText($log, "$_`n", $utf8)
  "$_"
}
$code = $LASTEXITCODE
[IO.File]::AppendAllText($log, "---`nexit: $code`n", $utf8)
exit $code
