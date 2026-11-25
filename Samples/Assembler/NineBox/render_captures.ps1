$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'screenshots'
foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*.pixels') {
 $data=[IO.File]::ReadAllBytes($file.FullName)
 if($data.Length -ne 7680){throw 'Expected 240x32 LCD pixels'}
 $bmp=New-Object Drawing.Bitmap(240,32)
 $scaled=New-Object Drawing.Bitmap(1440,192)
 $g=[Drawing.Graphics]::FromImage($scaled)
 try {
  for($y=0;$y -lt 32;$y++){for($x=0;$x -lt 240;$x++){
   $color=if($data[$y*240+$x]){[Drawing.Color]::FromArgb(36,53,29)}else{[Drawing.Color]::FromArgb(189,208,139)}
   $bmp.SetPixel($x,$y,$color)
  }}
  $bmp.Save((Join-Path $folder ($file.BaseName+'-1x.png')),[Drawing.Imaging.ImageFormat]::Png)
  $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($bmp,0,0,1440,192)
  $scaled.Save((Join-Path $folder ($file.BaseName+'.png')),[Drawing.Imaging.ImageFormat]::Png)
 }finally{$g.Dispose();$scaled.Dispose();$bmp.Dispose()}
}
