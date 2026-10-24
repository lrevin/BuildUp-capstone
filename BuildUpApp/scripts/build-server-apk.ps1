# 배포 서버에 바로 붙는 설치 파일 만들기(최종 APK)
# 실행: powershell -ExecutionPolicy Bypass -File scripts\build-server-apk.ps1 -ServerUrl https://api.도메인/api
#       (도메인이 없으면 예: -ServerUrl http://3.35.0.10/api)
# 결과: C:\Users\ljb12\Buildup\BuildUp.apk
param(
  [Parameter(Mandatory = $true)][string]$ServerUrl
)
$ErrorActionPreference = 'Stop'
$ServerUrl = $ServerUrl.TrimEnd('/')
if ($ServerUrl -notmatch '^https?://.+/api$') {
  throw "서버 주소는 http(s)://주소/api 형태로 넣어 주세요. 받은 값: $ServerUrl"
}

$app = Split-Path -Parent $PSScriptRoot
$flag = Join-Path $app 'src\demoBuild.ts'
$client = Join-Path $app 'src\api\client.ts'
$flagOriginal = [IO.File]::ReadAllText($flag)
$clientOriginal = [IO.File]::ReadAllText($client)
$utf8 = New-Object Text.UTF8Encoding $false

$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

try {
  # 데모 모드 끄기 + 처음 켤 때 접속할 서버 주소 바꾸기
  [IO.File]::WriteAllText($flag, $flagOriginal.Replace('DEMO_BUILD = true', 'DEMO_BUILD = false'), $utf8)
  $patched = $clientOriginal -replace "export const DEFAULT_BASE_URL = '[^']*';", "export const DEFAULT_BASE_URL = '$ServerUrl';"
  if ($patched -eq $clientOriginal -and $clientOriginal -notmatch [regex]::Escape("'$ServerUrl'")) {
    throw 'client.ts에서 DEFAULT_BASE_URL을 찾지 못했습니다.'
  }
  [IO.File]::WriteAllText($client, $patched, $utf8)

  Push-Location (Join-Path $app 'android')
  cmd /c "gradlew.bat assembleRelease --console=plain 2>&1"
  if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
  Pop-Location
  $out = Join-Path (Split-Path -Parent $app) 'BuildUp.apk'
  Copy-Item (Join-Path $app 'android\app\build\outputs\apk\release\app-release.apk') $out -Force
  Write-Output "완성: $out  (서버: $ServerUrl)"
} finally {
  # 개발용으로 되돌리기
  [IO.File]::WriteAllText($flag, $flagOriginal, $utf8)
  [IO.File]::WriteAllText($client, $clientOriginal, $utf8)
}
