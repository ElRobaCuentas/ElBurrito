# Versionado y publicación del Ecosistema El Burrito

Guía operativa de Juan y Jose para el MVP, acordada el **19/11/2026**.
**Versionamos entregas, no commits.** Para Android: preparar → integrar el PR y
fijar el SHA de `main` → compilar → verificar → respaldar → crear tag y registro
de release → distribuir por el canal autorizado → confirmar el resultado.

El monorepo comparte un único repositorio e historial. Cada aplicación conserva
sus propias versiones, dependencias, comandos de compilación y canal de
distribución.

## 1. Reglas y fuentes de verdad

| Componente | Identificación de la entrega | Distribución |
|------------|-----------------------------|--------------|
| El Burrito (`User/`) | SemVer, `versionCode`, commit, tag anotado y GitHub Release | Google Play |
| PILOTO (`Driver/`) | SemVer, `versionCode`, commit, tag anotado y GitHub Release | APK privada |
| CENTRAL y servicio PULSO (`AdminWeb/`) | Commits e IDs de Hosting/Workers; sin nuevo SemVer ni tags obligatorios | Firebase Hosting / Cloudflare |
| `docs/` | Historial Git del monorepo | Documentación compartida |

- Este documento define el procedimiento. **GitHub Releases** registra las
  entregas Android; no es el canal de alojamiento ni de distribución de binarios privados.
- El directorio privado de Releases, fuera del monorepo, conserva el APK y el AAB.
  El AAB se entrega mediante **Play Console**, fuente del estado de publicación de
  El Burrito. El APK de PILOTO se distribuye por el canal privado autorizado.
- Las versiones y los contadores son propios de cada app. No mover tags, reemplazar
  artefactos publicados ni atribuir origen a binarios históricos sin evidencia.
- No incorporar CI/CD de publicación, Fastlane, generadores de changelog ni otras herramientas.

## 2. Elegir versión y código

Modificar manualmente `versionName` y `versionCode` en `android/app/build.gradle`.
No automatizar su sincronización con `package.json` mediante Gradle antes del MVP.

| Valor | Regla |
|-------|-------|
| `versionName` | SemVer visible: PATCH para correcciones compatibles; MINOR para funciones compatibles; MAJOR para cambios incompatibles |
| `versionCode` | Entero mayor que todos los utilizados por esa app; no reiniciarlo ni incrementarlo por cada commit o build local |
| `package.json.version` | Versión del paquete JavaScript, separada de Android; sincronización no obligatoria durante el MVP |
| `package-lock.json` | Dependencias resueltas y metadatos npm; no identifica el binario. Si cambia la versión npm, mantener el lock coherente |

Ejemplos desde `1.2.0`: PATCH `1.2.1`, MINOR `1.3.0`, MAJOR `2.0.0`.
No exigir sufijos `alpha`, `beta` o `rc`: el canal y la clasificación pre-release
de GitHub indican la etapa. Cada nuevo binario entregado/subido necesita un código
nuevo; si modifica una entrega ya registrada, también una nueva versión de entrega.
Promover **el mismo artefacto** entre canales conserva versión, código, hash y tag.

## 3. Preparar el candidato y fijar el commit

Los comandos son para **futuras entregas autorizadas**, no para recrear `v1.2.0`.
Usar el entorno y las herramientas existentes, PowerShell 5.1 y la misma sesión
para conservar las variables. Ejecutar paso a paso y detenerse ante cualquier error.

### Preparar la versión Android

1. Acordar alcance, responsable, versión y canal. Consultar las pruebas del
   `AGENTS.md` de la app y [condiciones de publicación](../planning/roadmap.md#4-condiciones-de-pre-release-y-publicación).
2. Preparar la versión en la rama candidata acordada, no directamente en `main`.
   Integrar los cambios funcionales y completar sus pruebas antes de preparar la versión.
3. Consultar el máximo código en todos los canales de Play (User) o en entregas
   e instalaciones privadas (Driver). Cambiar solo los dos valores aprobados;
   no mezclar dependencias, Firebase, `applicationId` ni firma.

**Desde la raíz del monorepo**, seleccionar `User` o `Driver` y comprobar el candidato:

```powershell
$app = 'User' # Cambiar a 'Driver' para su entrega.
$repoRoot = (git rev-parse --show-toplevel)
$appPath = Join-Path $repoRoot $app
Set-Location -LiteralPath $repoRoot
git status --short -- $app # Identificar cambios propios o ajenos.
git branch --show-current    # Confirmar la rama acordada.
git remote -v                # Confirmar el remoto del monorepo.
$version = Read-Host 'SemVer acordada'
$code = [int](Read-Host 'versionCode acordado')
git diff -- "$app/android/app/build.gradle"
git diff --cached            # Comprobar que no haya otros cambios preparados.
git add -- "$app/android/app/build.gradle"
git diff --cached            # Revisar exactamente lo que se va a registrar.
git commit -m "chore(android): bump version to $version"
```

### Fijar el SHA integrado

Para Android, CENTRAL y PULSO, publicar la rama candidata solo con autorización y seguir la
[revisión humana e integración del PR](verification-and-closure.md#revisión-humana-e-integración-del-pr).
Obtener de GitHub el SHA completo resultante de integrar en `main` el PR de la
entrega aprobada. Verificar que está en `origin/main` y usar ese SHA exacto con
el árbol limpio para compilar y publicar. No usar el SHA previo al merge ni la
punta de `main` si avanzó. Volver a generar desde el SHA integrado cualquier
salida preparada antes del merge.

**Desde la raíz del monorepo**, en la misma sesión PowerShell:

```powershell
git fetch origin refs/heads/main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar main en origin.' }
$integratedSha = (Read-Host 'SHA completo del PR integrado en main').Trim()
if ($integratedSha -notmatch '^[0-9a-fA-F]{40}$') { throw 'Se requiere el SHA completo.' }
git merge-base --is-ancestor $integratedSha FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'El SHA no está acreditado en origin/main.' }
$pending = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $pending) { throw 'Revisar el estado del árbol antes de continuar.' }
git switch --detach $integratedSha
if ($LASTEXITCODE -ne 0) { throw 'No se pudo fijar el SHA de compilación.' }
$commit = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $commit -ne $integratedSha) { throw 'HEAD no coincide con el SHA integrado.' }
$pending = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $pending) { throw 'El árbol debe estar limpio en el SHA integrado.' }
```

Para Android, confirmar versión y código en el `build.gradle` del SHA fijado.
Sin acceso confirmado al remoto o sin PR integrado, no preparar una entrega oficial.

Mantener el código y la configuración estables al compilar. Un commit y un lock
identifican fuentes, pero no garantizan reconstrucciones idénticas byte a byte.

## 4. Compilar y verificar el artefacto

Ejecutar **solo el bloque de la app elegida**. Exigir `BUILD SUCCESSFUL`; si falla,
no reutilizar una salida anterior. No regenerar ni rotar claves para publicar.

### User: AAB para Play

**Directorio: `User/android`.** Generar el bundle y verificar su firma:

```powershell
Set-Location -LiteralPath "$repoRoot\User\android"
.\gradlew.bat bundleRelease
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación.' }
$source = "$repoRoot\User\android\app\build\outputs\bundle\release\app-release.aab"
$fileName = "el-burrito-v$version-vc$code.aab"
jarsigner -verify -verbose -certs "$source"
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación de firma.' }
```

Comprobar `jar verified`, revisar advertencias y contrastar el certificado con
el de carga esperado. Ese resultado no significa «sin advertencias» ni aceptación
de Play. Play App Signing distingue la firma de carga del AAB de la firma de los
APK distribuidos. `apksigner` verifica APK, no AAB; `npm run android` no genera
el AAB de publicación.

### Driver: APK privada

**Procedimiento previsto, pendiente de validación como nueva entrega formal.**
**Directorio: `Driver/android`.** Ajustar Build Tools al SDK instalado:

```powershell
Set-Location -LiteralPath "$repoRoot\Driver\android"
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación.' }
$source = "$repoRoot\Driver\android\app\build\outputs\apk\release\app-release.apk"
$fileName = "burrito-driver-v$version-vc$code.apk"
$buildTools = "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0"
& "$buildTools\aapt.exe" dump badging "$source" # Ver paquete y versión/código.
if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar el APK.' }
& "$buildTools\apksigner.bat" verify --verbose --print-certs "$source"
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación de firma.' }
```

Conservar `com.burritodriverapp` y la firma release de la instalación existente.
Contrastar la huella del certificado con la entrega instalada conocida; no
confundirla con el hash del archivo. Resolver discrepancias antes de instalar,
sin desinstalar para eludirlas. Elegir SemVer de tres componentes en la próxima entrega.

## 5. Calcular el hash y respaldar la copia exacta

**Con las variables de la misma sesión**, calcular el hash y respaldar la copia:

```powershell
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$hash # Registrar este valor en la GitHub Release.
$releasesRoot = Join-Path (Split-Path -Parent $repoRoot) 'BurritoReleases'
$backupDir = Join-Path $releasesRoot $app
if (-not (Test-Path -LiteralPath $releasesRoot)) { throw 'Revisar el directorio privado de Releases.' }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$artifact = Join-Path $backupDir $fileName
if (Test-Path -LiteralPath $artifact) { throw 'El destino ya existe; no sobrescribir.' }
[System.IO.File]::Copy($source, $artifact, $false)
if ((Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash -ne $hash) {
    throw 'La copia no coincide con el original.'
}
```

Ajustar `$releasesRoot` al directorio privado acordado; debe quedar fuera del
monorepo. Usar esa copia para distribuir. Mantener `Releases` fuera del
repositorio; guardar una segunda copia en el destino privado acordado y
comprobar su hash.
Una copia en el mismo disco no cubre la pérdida del equipo. Conservar mappings
y sourcemaps de esa compilación cuando sean necesarios para diagnosticarla.
No adjuntar ni publicar automáticamente binarios privados. Cualquier excepción
requiere autorización específica y verificación de visibilidad. No incluir tokens,
contraseñas ni keystores en releases o paquetes. Respaldar las claves separadamente.

## 6. Crear el tag anotado y la GitHub Release

La convención aprobada es `user-vX.Y.Z` para User y `driver-vX.Y.Z` para
Driver. Los tags históricos permanecen en los repositorios anteriores.

**Desde la raíz del monorepo**, comprobar que sigue seleccionado el SHA compilado:

```powershell
Set-Location -LiteralPath $repoRoot
$pending = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $pending) { throw 'Revisar los cambios del árbol antes de etiquetar.' }
$current = git rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $current -ne $commit) { throw 'HEAD no es el SHA compilado.' }
$tag = "$($app.ToLower())-v$version"
git tag --list "$tag"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el tag local.' }
git ls-remote --tags origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el tag remoto.' }
```

**Ambas consultas del tag deben estar vacías.** Si existe, inspeccionar la entrega
existente y detener su creación: no eliminar, mover ni forzar el tag.

```powershell
git tag -a "$tag" "$commit" -m "Release $tag - MVP"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el tag.' }
$tagType = git cat-file -t "$tag"
if ($LASTEXITCODE -ne 0 -or $tagType -ne 'tag') { throw 'El tag no es anotado.' }
$tagCommit = git rev-parse "${tag}^{}"
if ($LASTEXITCODE -ne 0 -or $tagCommit -ne $commit) { throw 'El tag no apunta al SHA compilado.' }
git push origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo publicar el tag.' }
git ls-remote --tags origin "refs/tags/$tag" "refs/tags/${tag}^{}"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar el tag remoto.' }
```

Antes de publicar el tag, comprobar que su destino coincide con `$commit`;
después, contrastar ese mismo destino con el tag anotado remoto.

En **GitHub web → Releases del monorepo → nueva release**, seleccionar ese tag
existente. Usar títulos como `El Burrito user-vX.Y.Z - Pruebas cerradas MVP` o
`PILOTO driver-vX.Y.Z - Piloto privado`. Marcar **pre-release** para pruebas;
clasificar como estable solo cuando se acuerde. Incluir:

- Commit completo, versión/código y cambios de la entrega.
- Nombre del artefacto, SHA-256, firma y advertencias, referencia no sensible a la copia privada y responsable/fecha. El registro no requiere adjuntar el archivo.
- Pruebas, compatibilidad, limitaciones y vía de recuperación.
- Canal y estado fechado: inicialmente, pendiente de envío o instalación.

Usar Conventional Commits: `fix`, `feat`, `chore(android)` o `docs` según el cambio.
Cada app conserva su propia secuencia SemVer. Los prefijos distinguen las
entregas en el espacio de tags compartido. Los tags históricos `vX.Y.Z` de los
repositorios anteriores no se recrean ni se mueven.

## 7. Distribuir y confirmar el resultado

### User: Google Play Console

1. Abrir `com.sythor.burritoapp` y el canal acordado. Para el piloto se utilizó
   **Closed testing - El Burrito - App Beta**. Subir la copia privada verificada.
2. Contrastar versión/código reconocidos por Play; completar notas, testers,
   países y rollout. Revisar exclusiones/advertencias y registrar las decisiones.
   **100 % del canal cerrado** significa testers elegibles, no lanzamiento público.
3. Enviar a revisión y registrar el estado en la release. «En revisión» no es
   «disponible»: Play Console es la fuente de verdad.
4. Tras aprobación, confirmar publicación efectiva e instalación/actualización
   desde Play con un tester autorizado; verificar versión y funcionamiento.
5. Actualizar el estado fechado. Ante rechazo/demora, conservar el binario y el
   diagnóstico. Para producción, revisar las condiciones vigentes; promover el
   mismo AAB no requiere reconstruirlo ni cambiar sus identificadores.

### Driver: instalar sin interrumpir la jornada

**Procedimiento previsto; no acredita una actualización ya validada.** Distribuir
el APK por el canal privado autorizado; aplicar la regla de adjuntos de §5.
Actualizar **después de que el último conductor finalice la jornada o antes de
que el primero la inicie**. Nunca durante un relevo ni interrumpiendo un recorrido
activo. Confirmar servicio detenido, estado remoto esperado y versión previa.

**Desde `Driver/`**, con ADB configurado y `$artifact` de esta entrega:

```powershell
Set-Location -LiteralPath "$repoRoot\Driver"
adb devices # Elegir el teléfono autorizado.
$serial = Read-Host 'Serial del teléfono'
adb -s "$serial" install -r "$artifact" # Actualizar conservando los datos.
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación; registrar el error.' }
adb -s "$serial" shell dumpsys package com.burritodriverapp |
    Select-String -Pattern 'versionCode=|versionName='
```

Confirmar versión y probar acceso, asignación, INICIAR/publicación y DETENER en
condiciones controladas antes del servicio. Registrar fecha, dispositivo sin
datos sensibles, versiones previa/nueva y resultado. Compilar no acredita instalar.

## 8. CENTRAL y PULSO

Antes de compilar, migrar o desplegar, [fijar el SHA integrado](#fijar-el-sha-integrado)
desde la raíz del monorepo. Mantener ese SHA y el árbol limpio durante la entrega;
registrar `$commit` como SHA fuente de los pasos efectuados.
CENTRAL incluye la pantalla PULSO; el Worker se publica aparte e incluye código
de `monitor/src/` y `monitor/worker/`. No requieren nuevo SemVer ni GitHub Releases.

| Destino | Registro asociado al commit fuente |
|---------|-------------------------------------|
| Hosting | Proyecto/sitio/canal, version y release ID, fecha y resultado |
| Workers | Entorno/Worker, version y deployment ID, fecha y resultado |
| D1 | Migraciones aplicadas y compatibilidad requerida |

Asociar el SHA a la descripción del proveedor cuando sea posible; no inferirlo
por fechas. Para una entrega conjunta, la secuencia es **migración compatible
(solo si hay una pendiente y autorizada) → Worker → verificación → Hosting**.
Si se publica solo CENTRAL, no migrar D1 ni volver a publicar el Worker. Detener
la publicación ante incompatibilidad o pérdida de integridad. Ejecutar los
comandos y comprobaciones del [README de CENTRAL](../../AdminWeb/README.md#migraciones-y-publicación-en-producción).
Conservar `STATE_VERSION`,
validaciones y migraciones; `compatibility_date` identifica compatibilidad del
runtime, no del producto. Validar combinaciones con [../architecture/firebase-schema.md](../architecture/firebase-schema.md)
y la API vigente. Evidencia histórica: [PULSO §8](../architecture/pulso.md#8-operación-en-producción).

## 9. Hotfixes y recuperación

- **Android:** si `main` contiene avances no destinados a producción, preparar la
  corrección a partir del tag afectado. Incrementar PATCH y usar un código superior
  a todos los utilizados. Integrar el hotfix por PR antes de compilar la entrega oficial.
  Si no hay un SHA integrado con el alcance autorizado, detener la publicación.
- **User:** frenar una distribución no revierte instalaciones. Recuperar el
  comportamiento anterior mediante una nueva entrega con código superior.
- **Driver:** suspender instalaciones y corregir en la ventana indicada en §7;
  no usar downgrade forzado ni desinstalación como recuperación habitual.
- **CENTRAL:** volver a una versión compatible en Hosting, registrar el nuevo
  release de rollback y comprobar el contenido servido.
- **PULSO:** revisar D1, estado y configuración antes de volver a otro Worker.
  Su rollback no revierte D1; el Worker anterior a `0003` no mantiene el inicio
  observado. No borrar columnas, memoria ni incidentes para forzar compatibilidad.

Conservar artefactos fallidos, hashes y evidencias; registrar qué entrega los
sustituye y el resultado de recuperación, sin mover tags ni reemplazar backups.

## 10. Checklist breve

- [ ] Alcance/canal acordados, condiciones revisadas y pruebas completadas.
- [ ] Versión/código correctos; PR integrado y compilación desde su SHA exacto con árbol limpio.
- [ ] Identidad/firma verificadas, advertencias revisadas y SHA-256 registrado.
- [ ] Copia privada y respaldo coinciden; el tag anotado apunta al SHA compilado y GitHub Release registra la entrega.
- [ ] Distribución realizada en el canal o ventana acordados; resultado comprobado.
- [ ] Estado real fechado y recuperación registrada, si aplica.

## 11. Primera aplicación y validación pendiente

El Burrito `1.2.0 (3)` fue la primera aplicación del procedimiento; consultar su
[GitHub Release v1.2.0](https://github.com/ElRobaCuentas/BurritoUserApp/releases/tag/v1.2.0)
para artefacto, firma, hash y evidencias. El enlace pertenece al repositorio
anterior de User y se conserva como evidencia histórica. Al corte del
**19/11/2026**, los desarrolladores reportaron envío a revisión;
aprobación/disponibilidad para testers seguían sin confirmar. El estado actual
se consulta en Play Console. Los pasos Driver de esta guía siguen pendientes de
validación como entrega formal.
