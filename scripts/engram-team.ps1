#requires -Version 5.1
<#
.SYNOPSIS
Recibe memoria compartida o publica un lote tecnico previamente revisado.
.EXAMPLE
.\scripts\engram-team.ps1 Receive
.EXAMPLE
.\scripts\engram-team.ps1 Publish -NotesFile .\scripts\engram-initial.json -Reviewed
.NOTES
Ejecutar despues de actualizar main. No hace pull, commit ni push.
Publicacion: LocalApplicationData/ElBurrito/Engram/publication, nunca ENGRAM_DATA_DIR.
ReceiveDataDir permite probar la recepcion en una base aislada.
Requiere Engram 3.7.0; revalidar el contrato antes de cambiar de version.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('Receive', 'Publish')][string]$Action,
    [string]$NotesFile,
    [switch]$Reviewed,
    [string]$ReceiveDataDir
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$project = 'ecosistema-el-burrito'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$localRoot = $env:LOCALAPPDATA
if (-not $localRoot) { $localRoot = [Environment]::GetFolderPath('LocalApplicationData') }
if (-not $localRoot) { throw 'No se pudo resolver LocalApplicationData.' }
$publicationDir = Join-Path $localRoot 'ElBurrito/Engram/publication'
$markerPath = Join-Path $publicationDir 'publication.json'
$config = Get-Content -LiteralPath (Join-Path $repoRoot '.engram/config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.project_name -cne $project) { throw 'Identidad de proyecto inesperada.' }
$binary = (Get-Command engram -CommandType Application -ErrorAction Stop).Source

function New-EngramProcess([string[]]$Arguments, [string]$DataDir, [string]$Token = '') {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $binary
    $info.Arguments = $Arguments -join ' '
    $info.WorkingDirectory = $repoRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    # Solo cambia el entorno del hijo; no hereda seleccion de Cloud ni otra base.
    foreach ($key in @($info.EnvironmentVariables.Keys)) {
        if ([string]$key -like 'ENGRAM_*') { $info.EnvironmentVariables.Remove($key) }
    }
    $info.EnvironmentVariables['ENGRAM_DATA_DIR'] = $DataDir
    $info.EnvironmentVariables['ENGRAM_PROJECT'] = $project
    $info.EnvironmentVariables['ENGRAM_CLOUD_SYNC'] = 'false'
    $info.EnvironmentVariables['ENGRAM_CLOUD_AUTOSYNC'] = '0'
    $info.EnvironmentVariables['USER'] = 'el-burrito-team'
    $info.EnvironmentVariables['USERNAME'] = 'el-burrito-team'
    if ($Token) { $info.EnvironmentVariables['ENGRAM_TOKEN'] = $Token }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    return $process
}

function Invoke-Engram([string[]]$Arguments, [string]$DataDir) {
    $process = New-EngramProcess $Arguments $DataDir
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(60000)) { throw 'Engram excedio el tiempo limite.' }
        if ($stderr.Result) { [Console]::Error.WriteLine($stderr.Result.TrimEnd()) }
        if ($process.ExitCode -ne 0) { throw "Engram fallo (codigo $($process.ExitCode))." }
        return $stdout.Result.TrimEnd()
    } finally {
        if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}

function Assert-LocalPath([string]$Path) {
    if (-not [IO.Path]::IsPathRooted($Path) -or $Path.StartsWith('\\')) {
        throw 'La base debe estar en una ruta absoluta local.'
    }
    # No permitir que un enlace redirija la publicacion hacia otra base.
    $node = New-Object IO.DirectoryInfo([IO.Path]::GetFullPath($Path))
    while ($null -ne $node) {
        if ($node.Exists -and ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'La ruta de la base contiene un enlace o punto de reparacion.'
        }
        $node = $node.Parent
    }
}

function Invoke-MemoryApi([string]$Path, $Body = $null) {
    $options = @{ Uri = "$endpoint$Path"; Headers = @{ Authorization = "Bearer $token" }; TimeoutSec = 15 }
    if ($null -ne $Body) {
        $options.Method = 'Post'
        $options.ContentType = 'application/json; charset=utf-8'
        $options.Body = $utf8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress))
    }
    return Invoke-RestMethod @options
}

function Assert-TeamChunks {
    $manifestPath = Join-Path $repoRoot '.engram/manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { return }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $manifest.chunks) {
        if ($entry.id -cnotmatch '^[a-f0-9]{8}$') { throw 'ID de chunk invalido.' }
        $path = Join-Path $repoRoot ".engram/chunks/$($entry.id).jsonl.gz"
        $file = [IO.File]::OpenRead($path)
        try {
            $gzip = New-Object IO.Compression.GZipStream($file, [IO.Compression.CompressionMode]::Decompress)
            $memory = New-Object IO.MemoryStream
            try { $gzip.CopyTo($memory); $bytes = $memory.ToArray() }
            finally { $gzip.Dispose(); $memory.Dispose() }
        } finally { $file.Dispose() }
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $digest = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        if ($digest.Substring(0, 8) -cne $entry.id) { throw 'Hash de chunk incorrecto.' }
        $chunk = $utf8.GetString($bytes) | ConvertFrom-Json
        if (@($chunk.prompts | Where-Object { $null -ne $_ }).Count) { throw 'El chunk contiene prompts.' }
        if ($chunk.PSObject.Properties['mutations'] -and @($chunk.mutations).Count) {
            throw 'Este procedimiento solo admite lotes de notas, sin mutaciones adicionales.'
        }
        foreach ($session in $chunk.sessions) {
            if ($session.project -cne $project -or $session.directory -ne '' -or
                $session.ownership_mode -cne 'project_owned') { throw 'Sesion de chunk no apta para compartir.' }
        }
        foreach ($observation in $chunk.observations) {
            if ($observation.project -cne $project -or $observation.scope -cne 'project' -or
                $observation.tool_name -cne 'reviewed-team-memory') { throw 'Observacion fuera del contrato compartido.' }
        }
    }
}

if ($Action -eq 'Receive') {
    if ($NotesFile -or $Reviewed) { throw 'Receive no acepta notas ni Reviewed.' }
    $target = $ReceiveDataDir
    if (-not $target) { $target = $env:ENGRAM_DATA_DIR }
    if (-not $target) { $target = Join-Path $HOME '.engram' }
    Assert-LocalPath $target
    $target = [IO.Path]::GetFullPath($target).TrimEnd('\', '/')
    if ($target -ieq [IO.Path]::GetFullPath($publicationDir).TrimEnd('\', '/')) {
        throw 'Receive no puede importar en la base de publicacion.'
    }
    if ((Invoke-Engram @('version') $target).Trim() -ne 'engram 3.7.0') {
        throw 'Se requiere la version validada Engram 3.7.0.'
    }
    Assert-TeamChunks
    Write-Output (Invoke-Engram @('sync', '--import', '--project', $project) $target)
    return
}

if ($ReceiveDataDir) { throw 'Publish no acepta una ruta de base de datos.' }
if (-not $NotesFile -or -not $Reviewed) { throw 'Publish requiere NotesFile y Reviewed.' }
$batch = Get-Content -LiteralPath $NotesFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($batch.project -cne $project -or $batch.batch_id -cnotmatch '^[a-z0-9][a-z0-9-]{0,63}$') {
    throw 'Proyecto o identificador de lote invalido.'
}
if (@($batch.notes).Count -eq 0) { throw 'El lote no tiene notas.' }
$topics = @{}
foreach ($note in $batch.notes) {
    foreach ($field in @('title', 'type', 'topic_key', 'content')) {
        if ([string]::IsNullOrWhiteSpace($note.$field)) { throw "Nota sin $field." }
    }
    if ($topics.ContainsKey($note.topic_key)) { throw 'Hay temas repetidos en el lote.' }
    $topics[$note.topic_key] = $true
    if (@($note.sources).Count -eq 0) { throw 'Cada nota requiere fuentes.' }
    foreach ($source in $note.sources) {
        if ([IO.Path]::IsPathRooted($source) -or $source -match '(^|[/\\])\.\.([/\\]|$)' -or
            -not (Test-Path -LiteralPath (Join-Path $repoRoot $source) -PathType Leaf)) {
            throw 'Las fuentes deben ser archivos vigentes relativos al repositorio.'
        }
    }
}
Assert-LocalPath $publicationDir
if ((Invoke-Engram @('version') $publicationDir).Trim() -ne 'engram 3.7.0') {
    throw 'Se requiere la version validada Engram 3.7.0.'
}
if (-not (Test-Path -LiteralPath $publicationDir)) {
    [void][IO.Directory]::CreateDirectory($publicationDir)
}
$lock = [IO.File]::Open((Join-Path $publicationDir 'publication.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    if (Test-Path -LiteralPath $markerPath) {
        $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($marker.project -cne $project -or $marker.purpose -cne 'reviewed-team-publication-v1') {
            throw 'La base no tiene una marca de publicacion valida.'
        }
    } else {
        $existing = @(Get-ChildItem -LiteralPath $publicationDir -Force | Where-Object Name -ne 'publication.lock')
        if ($existing.Count) { throw 'Se rechaza una carpeta preexistente sin marca; no se reutilizan bases.' }
        $marker = [pscustomobject]@{ project = $project; purpose = 'reviewed-team-publication-v1'; instance_id = ''; batches = @() }
        [IO.File]::WriteAllText($markerPath, ($marker | ConvertTo-Json -Depth 6), $utf8)
    }
    $hash = (Get-FileHash -LiteralPath $NotesFile -Algorithm SHA256).Hash
    $previous = @($marker.batches | Where-Object id -eq $batch.batch_id)
    if ($previous.Count) {
        if ($previous[0].hash -ne $hash) { throw 'El lote ya existe con otro contenido; use un batch_id nuevo.' }
    }
        # Servidor efimero privado; el token nunca se imprime ni se persiste.
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
        $server = New-EngramProcess @('serve', '--session-owned') $publicationDir $token
        try {
            $serverError = $server.StandardError.ReadToEndAsync()
            $readyTask = $server.StandardOutput.ReadLineAsync()
            if (-not $readyTask.Wait(15000)) { throw 'El servidor aislado no respondio.' }
            $ready = $readyTask.Result | ConvertFrom-Json
            if ($ready.protocol -cne 'engram-session-owned-v1' -or $ready.pid -ne $server.Id -or
                $ready.endpoint -notmatch '^http://127\.0\.0\.1:[0-9]+$') {
                throw 'Respuesta inesperada del servidor aislado.'
            }
            $endpoint = $ready.endpoint
            $health = Invoke-MemoryApi '/health'
            if ($health.version -ne '3.7.0' -or -not $health.capabilities.isolated_session_registration) {
                throw 'El servidor no soporta sesiones sin directorio.'
            }
            if ($marker.instance_id -and $marker.instance_id -cne $ready.instance_id) {
                throw 'La instancia de publicacion fue reemplazada; se detiene la escritura.'
            }
            $marker.instance_id = $ready.instance_id
            [IO.File]::WriteAllText($markerPath, ($marker | ConvertTo-Json -Depth 6), $utf8)
            $session = 'team-' + $batch.batch_id
            if (-not $previous.Count) {
                [void](Invoke-MemoryApi '/sessions' @{ id = $session; project = $project; ownership_mode = 'project_owned'; isolated = $true })
            }
            $snapshot = Invoke-MemoryApi '/export'
            if (@($snapshot.prompts | Where-Object { $null -ne $_ }).Count) {
                throw 'La base de publicacion contiene prompts; no se exportara.'
            }
            foreach ($saved in $snapshot.observations) {
                if ($saved.scope -cne 'project' -or $saved.tool_name -cne 'reviewed-team-memory') {
                    throw 'La base contiene observaciones ajenas al procedimiento.'
                }
            }
            foreach ($saved in $snapshot.sessions) {
                if ($saved.directory -ne '' -or $saved.ownership_mode -cne 'project_owned') {
                    throw 'La base contiene sesiones ajenas al procedimiento.'
                }
            }
            if (-not $previous.Count) {
            $index = 0
            foreach ($note in $batch.notes) {
                $content = $note.content + "`n`nFuentes: " + ($note.sources -join ', ')
                [void](Invoke-MemoryApi '/observations' @{
                    session_id = $session; project = $project; scope = 'project'
                    type = $note.type; title = $note.title; content = $content
                    topic_key = $note.topic_key; capture_prompt = $false
                    operation_id = "$hash`:$index"; tool_name = 'reviewed-team-memory'
                })
                $index++
            }
            [void](Invoke-MemoryApi "/sessions/$session/end" @{ summary = "Lote tecnico revisado $($batch.batch_id): $index notas; sin prompts ni sesiones historicas." })
            $marker.batches = @($marker.batches) + @([pscustomobject]@{ id = $batch.batch_id; hash = $hash })
            [IO.File]::WriteAllText($markerPath, ($marker | ConvertTo-Json -Depth 6), $utf8)
            }
        } finally {
            $server.StandardInput.Close()
            if (-not $server.WaitForExit(5000)) { $server.Kill(); $server.WaitForExit() }
            if ($serverError.Result) { [Console]::Error.WriteLine($serverError.Result.TrimEnd()) }
            $server.Dispose()
        }
    Assert-TeamChunks
    Write-Output (Invoke-Engram @('sync', '--project', $project) $publicationDir)
    Assert-TeamChunks
    Write-Output "Base de publicacion: $publicationDir"
    Write-Output 'Revisar manifiesto y chunks descomprimidos antes de seleccionar archivos para Git.'
} finally { $lock.Dispose() }
