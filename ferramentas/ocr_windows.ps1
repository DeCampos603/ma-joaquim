# OCR com o motor nativo do Windows (Windows.Media.Ocr, pt-BR). Sem instalar nada.
# Uso: powershell -File ocr_windows.ps1 <pasta com PNG> <saida.json>
param([string]$Pasta, [string]$Saida)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
if ($Pasta -eq '--max') { [Windows.Media.Ocr.OcrEngine]::MaxImageDimension; exit }
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) {
    $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
$lang = [Windows.Globalization.Language]::new('pt-BR')
$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
$todos = @{}
foreach ($f in Get-ChildItem $Pasta -Filter *.png | Sort-Object Name) {
    $arq = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
    $fluxo = Esperar ($arq.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($fluxo)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Esperar ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Esperar ($motor.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $linhas = @()
    foreach ($l in $res.Lines) {
        $ws = @($l.Words | ForEach-Object { @{ t = $_.Text; x = [int]$_.BoundingRect.X; y = [int]$_.BoundingRect.Y; w = [int]$_.BoundingRect.Width; h = [int]$_.BoundingRect.Height } })
        $linhas += , @{ t = $l.Text; p = $ws }
    }
    $todos[$f.Name] = $linhas
    $fluxo.Dispose()
}
$todos | ConvertTo-Json -Depth 6 -Compress | Out-File -FilePath $Saida -Encoding utf8
"max=" + [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
