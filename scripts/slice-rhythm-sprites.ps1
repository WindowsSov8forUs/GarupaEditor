param(
    [Parameter(Mandatory = $true)]
    [string]$MetaJsonPath,

    [Parameter(Mandatory = $true)]
    [string[]]$ImagePaths,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputRoot,

    [Parameter(Mandatory = $false)]
    [switch]$SkipFullyTransparent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $MetaJsonPath)) {
    throw "Meta JSON not found: $MetaJsonPath"
}

if (-not (Test-Path -LiteralPath $OutputRoot)) {
    New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

$raw = Get-Content -LiteralPath $MetaJsonPath -Raw
$meta = $raw | ConvertFrom-Json

# Some exports may wrap JSON as a quoted JSON string. Keep parsing until it is an array/object.
while ($meta -is [string]) {
    $meta = $meta | ConvertFrom-Json
}

if ($meta -isnot [System.Collections.IEnumerable]) {
    throw "Unexpected JSON root type. Expected array."
}

function Test-AnyVisiblePixel {
    param(
        [System.Drawing.Bitmap]$Bitmap
    )
    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt 0) {
                return $true
            }
        }
    }
    return $false
}

$manifest = New-Object System.Collections.Generic.List[object]

foreach ($imgPath in $ImagePaths) {
    if (-not (Test-Path -LiteralPath $imgPath)) {
        Write-Warning "Image not found, skipped: $imgPath"
        continue
    }

    $imgName = [System.IO.Path]::GetFileNameWithoutExtension($imgPath)
    $imgOutDir = Join-Path $OutputRoot $imgName
    if (-not (Test-Path -LiteralPath $imgOutDir)) {
        New-Item -ItemType Directory -Path $imgOutDir | Out-Null
    }

    $bmp = [System.Drawing.Bitmap]::new($imgPath)
    try {
        $written = 0
        foreach ($item in $meta) {
            if (-not $item.PSObject.Properties.Name.Contains("Base")) {
                continue
            }
            $base = $item.Base
            if (-not $base) { continue }

            $name = [string]$base.m_Name
            if ([string]::IsNullOrWhiteSpace($name)) {
                continue
            }

            $rect = $base.m_Rect
            if (-not $rect) { continue }

            $x = [int][Math]::Round([double]$rect.x)
            $yUnity = [int][Math]::Round([double]$rect.y)
            $w = [int][Math]::Round([double]$rect.width)
            $h = [int][Math]::Round([double]$rect.height)
            $yTop = $bmp.Height - $yUnity - $h

            if ($w -le 0 -or $h -le 0) { continue }
            if ($x -lt 0 -or $yTop -lt 0 -or ($x + $w) -gt $bmp.Width -or ($yTop + $h) -gt $bmp.Height) {
                Write-Warning "Out-of-range rect skipped: $name on $imgName"
                continue
            }

            $cropRect = New-Object System.Drawing.Rectangle($x, $yTop, $w, $h)
            $crop = $bmp.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                if ($SkipFullyTransparent -and -not (Test-AnyVisiblePixel -Bitmap $crop)) {
                    continue
                }

                $safeName = ($name -replace '[\\/:*?"<>|]', "_")
                $outPath = Join-Path $imgOutDir ($safeName + ".png")
                $crop.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
                $written++

                $pathId = $null
                if ($base.m_RD -and $base.m_RD.texture) {
                    $pathId = [string]$base.m_RD.texture.m_PathID
                }

                $manifest.Add([pscustomobject]@{
                    image     = $imgName
                    sprite    = $name
                    path_id   = $pathId
                    x         = $x
                    y_unity   = $yUnity
                    y_top     = $yTop
                    width     = $w
                    height    = $h
                    out_file  = $outPath
                }) | Out-Null
            }
            finally {
                $crop.Dispose()
            }
        }
        Write-Host "Done: $imgName -> $written files"
    }
    finally {
        $bmp.Dispose()
    }
}

$manifestPath = Join-Path $OutputRoot "slices_manifest.csv"
$manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8
Write-Host "Manifest: $manifestPath"
