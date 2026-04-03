param(
  [string]$InputPath,
  [string]$OutputPath,
  [switch]$All
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root "source-models"
$modelDir = Join-Path $root "model"

if (-not (Test-Path $modelDir)) {
  New-Item -ItemType Directory -Path $modelDir | Out-Null
}

function Invoke-CompressPipeline {
  param(
    [string]$SourceFile,
    [string]$TargetFile
  )

  $tempFile = [System.IO.Path]::Combine($modelDir, ([System.IO.Path]::GetFileNameWithoutExtension($TargetFile) + ".tmp.glb"))

  Write-Host "Optimizing textures and structure:" $SourceFile
  npx @gltf-transform/cli optimize $SourceFile $tempFile --texture-compress webp
  if ($LASTEXITCODE -ne 0) {
    throw "gltf-transform optimize failed for $SourceFile"
  }

  Write-Host "Applying Draco geometry compression:" $tempFile
  npx @gltf-transform/cli draco $tempFile $TargetFile --method edgebreaker
  if ($LASTEXITCODE -ne 0) {
    throw "gltf-transform draco failed for $SourceFile"
  }

  if (Test-Path $tempFile) {
    Remove-Item -LiteralPath $tempFile
  }

  $sourceSize = [Math]::Round((Get-Item $SourceFile).Length / 1MB, 2)
  $targetSize = [Math]::Round((Get-Item $TargetFile).Length / 1MB, 2)
  Write-Host "Done:" ([System.IO.Path]::GetFileName($SourceFile)) "->" ([System.IO.Path]::GetFileName($TargetFile)) "($sourceSize MB -> $targetSize MB)"
}

if ($All) {
  if (-not (Test-Path $sourceDir)) {
    throw "Create a source-models folder with original .glb files before using -All."
  }
  $files = Get-ChildItem -Path $sourceDir -Filter *.glb -File
  foreach ($file in $files) {
    $target = Join-Path $modelDir $file.Name
    Invoke-CompressPipeline -SourceFile $file.FullName -TargetFile $target
  }
  exit 0
}

if (-not $InputPath) {
  throw "Pass -InputPath source-models\\YourModel.glb -OutputPath model\\YourModel.glb or use -All."
}

$resolvedInput = if ([System.IO.Path]::IsPathRooted($InputPath)) { $InputPath } else { Join-Path $root $InputPath }
$resolvedOutput = if ($OutputPath) {
  if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $root $OutputPath }
} else {
  Join-Path $modelDir ([System.IO.Path]::GetFileName($resolvedInput))
}

Invoke-CompressPipeline -SourceFile $resolvedInput -TargetFile $resolvedOutput
