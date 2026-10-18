# 시연용 설치 파일 만들기: 서버 없이 데모 데이터로 바로 동작하는 APK
# 실행: powershell -ExecutionPolicy Bypass -File scripts\build-demo-apk.ps1
# 결과: C:\Users\ljb12\Buildup\BuildUp-demo.apk  (에뮬레이터 창에 끌어다 놓으면 설치됨)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$flag = Join-Path $app 'src\demoBuild.ts'
$original = [IO.File]::ReadAllText($flag)

$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

try {
  [IO.File]::WriteAllText($flag, $original.Replace('DEMO_BUILD = false', 'DEMO_BUILD = true'), (New-Object Text.UTF8Encoding $false))
  Push-Location (Join-Path $app 'android')
  cmd /c "gradlew.bat assembleRelease --console=plain 2>&1"
  if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
  Pop-Location
  $out = Join-Path (Split-Path -Parent $app) 'BuildUp-demo.apk'
  Copy-Item (Join-Path $app 'android\app\build\outputs\apk\release\app-release.apk') $out -Force
  Write-Output "완성: $out"
} finally {
  # 개발용으로 되돌리기
  [IO.File]::WriteAllText($flag, $original, (New-Object Text.UTF8Encoding $false))
}
