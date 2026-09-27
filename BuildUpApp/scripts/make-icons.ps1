# 앱 아이콘 생성: 로고 그림(Buildup_image.png)에서 글자·크레인 부분만 잘라
# 어두운 바탕 위 가운데에 놓고, 안드로이드 해상도별 아이콘을 만든다.
#   - ic_launcher.png        : 모서리가 둥근 사각형(예전 휴대폰)
#   - ic_launcher_round.png  : 원형(예전 휴대폰)
#   - ic_launcher_foreground.png + mipmap-anydpi-v26/*.xml : 안드로이드 8 이상(모양이 바뀌는 아이콘)
# 실행: powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconTool {
    // 바탕색과 많이 다른 점(글자·크레인)이 들어 있는 사각형 범위 [왼쪽, 위, 오른쪽, 아래]
    public static int[] ContentBox(Bitmap src, Color bg, Rectangle area, int tolerance) {
        var data = src.LockBits(new Rectangle(0, 0, src.Width, src.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var buf = new byte[data.Stride * src.Height];
        Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        src.UnlockBits(data);
        int l = int.MaxValue, t = int.MaxValue, r = -1, b = -1;
        for (int y = area.Top; y < area.Bottom; y++) {
            for (int x = area.Left; x < area.Right; x++) {
                int i = y * data.Stride + x * 4;
                int d = Math.Abs(buf[i + 2] - bg.R) + Math.Abs(buf[i + 1] - bg.G) + Math.Abs(buf[i] - bg.B);
                if (d > tolerance) {
                    if (x < l) l = x; if (x > r) r = x;
                    if (y < t) t = y; if (y > b) b = y;
                }
            }
        }
        return new[] { l, t, r, b };
    }
}
'@

$root = Join-Path $PSScriptRoot '..'
$res = Join-Path $root 'android\app\src\main\res'
$srcPath = Join-Path $root '..\Buildup_image.png'
$src = New-Object System.Drawing.Bitmap ((Resolve-Path $srcPath).Path)

# 바탕색: 어두운 사각형 안쪽 아래쪽 한 점
$bg = $src.GetPixel([int]($src.Width / 2), [int]($src.Height * 0.85))
$bgHex = '#{0:X2}{1:X2}{2:X2}' -f $bg.R, $bg.G, $bg.B

# 둥근 사각형 가장자리(흰 여백)를 피해서 안쪽만 검사
$inset = [int]($src.Width * 0.12)
$area = New-Object System.Drawing.Rectangle $inset, $inset, ($src.Width - 2 * $inset), ($src.Height - 2 * $inset)
$box = [IconTool]::ContentBox($src, $bg, $area, 90)
$pad = [int]($src.Width * 0.01)
$crop = New-Object System.Drawing.RectangleF ($box[0] - $pad), ($box[1] - $pad), ($box[2] - $box[0] + 2 * $pad), ($box[3] - $box[1] + 2 * $pad)
"바탕색 $bgHex / 로고 부분 $($crop.Width)x$($crop.Height)"

# size 크기 그림에 로고를 가로 비율 widthRatio로 가운데 놓기. shape: square | round | none
function New-Icon([int]$size, [string]$shape, [double]$widthRatio, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush $bg

    if ($shape -eq 'round') {
        $g.FillEllipse($brush, 0, 0, $size - 1, $size - 1)
    } elseif ($shape -eq 'square') {
        $d = [single]($size * 0.44)
        $e = [single]($size - 1) - $d
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddArc((New-Object System.Drawing.RectangleF 0, 0, $d, $d), 180, 90)
        $p.AddArc((New-Object System.Drawing.RectangleF $e, 0, $d, $d), 270, 90)
        $p.AddArc((New-Object System.Drawing.RectangleF $e, $e, $d, $d), 0, 90)
        $p.AddArc((New-Object System.Drawing.RectangleF 0, $e, $d, $d), 90, 90)
        $p.CloseFigure()
        $g.FillPath($brush, $p)
    } else {
        $g.FillRectangle($brush, 0, 0, $size, $size)
    }

    $w = $size * $widthRatio
    $h = $w * $crop.Height / $crop.Width
    $dest = New-Object System.Drawing.RectangleF (($size - $w) / 2), (($size - $h) / 2), $w, $h
    $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

$sizes = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($k in $sizes.Keys) {
    $dir = Join-Path $res "mipmap-$k"
    $s = $sizes[$k]
    New-Icon $s 'square' 0.80 (Join-Path $dir 'ic_launcher.png')
    New-Icon $s 'round' 0.72 (Join-Path $dir 'ic_launcher_round.png')
    # 안드로이드 8 이상: 108dp 크기에서 가운데 원(지름 66dp) 안에 로고의 네 모서리까지 들어가도록 48% 폭으로
    New-Icon ([int]($s * 108 / 48)) 'none' 0.48 (Join-Path $dir 'ic_launcher_foreground.png')
}

# 앱 화면 안에서 쓰는 로고(상단, 시작 화면, 로그인 화면)
New-Icon 512 'square' 0.80 (Join-Path $root 'src\assets\logo.png')

# 모양이 바뀌는 아이콘 설정(바탕색 + 로고)
$any = Join-Path $res 'mipmap-anydpi-v26'
New-Item -ItemType Directory -Force $any | Out-Null
$xml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'@
[System.IO.File]::WriteAllText((Join-Path $any 'ic_launcher.xml'), $xml)
[System.IO.File]::WriteAllText((Join-Path $any 'ic_launcher_round.xml'), $xml)
$colors = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$bgHex</color>
</resources>
"@
[System.IO.File]::WriteAllText((Join-Path $res 'values\ic_launcher_background.xml'), $colors)

$src.Dispose()
'아이콘 만들기 완료'
