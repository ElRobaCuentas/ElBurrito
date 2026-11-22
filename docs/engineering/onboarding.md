# Incorporación al Ecosistema El Burrito

Guía para preparar un equipo Windows y completar una primera tarea en el
monorepo. Los README de cada componente conservan sus procedimientos; esta guía
indica el orden y los puntos de entrada.

## 1. Acceso y copia de trabajo

Solicitar al responsable acceso al repositorio privado del monorepo.
Usar una identidad GitHub propia, con acceso a ramas y PR según el rol acordado;
tener el código no concede acceso a Firebase, Cloudflare ni Play Console.
Configurar la autenticación Git en el equipo sin incrustar tokens en URLs.

Si se conservan copias de los repositorios anteriores:

- Conservarlos sin cambios junto con cualquier trabajo local pendiente.
- Clonar el monorepo en otra carpeta; no convertir una carpeta anterior cambiando
  `origin`, copiar sus `.git` ni mezclar sus `node_modules`.
- Acordar cómo recuperar cambios propios aún no integrados. No descartarlos ni
  volver a migrar historiales como parte de la incorporación.
- Recrear la configuración local para la nueva ruta. No copiar toda la carpeta
  privada de otro integrante ni distribuir sus claves de firma.

Si ya existe una copia del monorepo, comprobar `origin` con `git remote get-url origin`
y seguir la [preparación de una tarea](workflow.md#preparación-de-una-tarea).
Para una copia nueva, comprobar el acceso usando la URL del monorepo desde un
directorio padre existente:

```powershell
$parent = Read-Host 'Directorio padre existente para la copia nueva'
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Revisar el directorio padre.' }
Set-Location -LiteralPath $parent
$repositoryUrl = 'https://github.com/ElRobaCuentas/ElBurrito.git'
git ls-remote --exit-code $repositoryUrl refs/heads/main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar main; revisar acceso al monorepo.' }
git clone --branch main -- $repositoryUrl EcosistemaElBurrito
if ($LASTEXITCODE -ne 0) { throw 'No se pudo clonar; revisar URL y acceso.' }
Set-Location -LiteralPath .\EcosistemaElBurrito
$repoRoot = (Get-Location).Path
git status --short
```

Confirmar una raíz Git con `User/`, `Driver/`, `AdminWeb/`, `docs/`,
`FirebaseLab/` y `scripts/`. Leer [AGENTS.md](../../AGENTS.md) y el
[flujo de trabajo](workflow.md) antes de pedir cambios a un agente.

## 2. Herramientas y versiones de referencia

Comprobaciones del equipo de referencia realizadas el **21/11/2026**. No son una
certificación del equipo nuevo. Los valores Android declarados no equivalen a
una inspección del SDK instalado; comprobarlo en Android Studio.

| Herramienta | Referencia comprobada o requisito |
|-------------|-----------------------------------|
| PowerShell | 5.1; versión mínima del script de memoria. |
| Git | 2.50.1.windows.1 comprobado; disponible en PATH y con identidad propia. |
| Node.js / npm | 24.12.0 / 11.6.2 comprobados. Node 24.12.0 satisface el mínimo declarado de FirebaseLab y del Worker. |
| OpenCode | 1.19.5 comprobado con la configuración del monorepo. |
| Gentle AI | 4.4.0 comprobado. |
| Engram | **3.7.0 exacto**: el script rechaza otras versiones hasta revalidarlas. |
| Go, para instalar desde fuente | 1.27.4 comprobado. Engram 3.7.0 declara Go **1.26.10**; Gentle AI 4.4.0 declara 1.25.10. Respetar el requisito mayor. |
| Java para Android | JDK 17.0.12 comprobado por ruta explícita; usar JDK 17 para las apps móviles. |
| Java para emuladores Firebase | JBR 21.0.8 de Android Studio comprobado. Los runners Windows esperan su ubicación documentada. |
| Android Studio / SDK | SDK 36, NDK 27.1.12297006; User declara Build Tools 36.0.0. Revisar los Gradle de cada app. Ambas tienen mínimo API 24; los targets son distintos. |
| Firebase CLI | 15.20.0 comprobado; se necesita para los laboratorios, no implica permiso de despliegue. |
| Navegador | Chrome/Chromium o Edge para la integración de pantalla de PULSO; consultar `PULSO_CHROME` en su README. |

En una terminal nueva, verificar las herramientas y qué copia se resuelve:

```powershell
git --version
node --version
npm --version
go version
opencode --version
gentle-ai version
engram version
firebase --version
Get-Command opencode, gentle-ai, engram -All | Format-Table Name, Source
```

El equipo de referencia aún resolvía **Java 8** con `java -version`, aunque tenía
los JDK anteriores instalados. No usar esa salida como certificación de Gradle.
Para Android, seleccionar el JDK en la terminal dedicada, sin cambiar variables
globales ni imponer una ruta de otra máquina:

```powershell
$env:JAVA_HOME = Read-Host 'Ruta local del JDK 17 instalado'
& (Join-Path $env:JAVA_HOME 'bin/java.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'Revisar JAVA_HOME.' }
```

Usar esa terminal para Gradle; revisar también el Gradle JDK de Android Studio.
Los runners de Firebase seleccionan Java 21 para sus hijos según los
[requisitos de FirebaseLab](../../FirebaseLab/README.md#requisitos).
Si la instalación de Android Studio tiene otra ruta, resolver ese bloqueo con el
responsable antes de ejecutar pruebas; no modificar el runner durante el onboarding.

## 3. OpenCode, Gentle AI y Engram

Si faltan herramientas, instalarlas en el equipo propio tras revisar las
[fuentes oficiales](#fuentes-oficiales). Para reproducir las versiones usadas:

```powershell
npm install -g opencode-ai@1.19.5
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de OpenCode.' }
go install github.com/gentleman-programming/gentle-ai/v4/cmd/gentle-ai@v4.4.0
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de Gentle AI.' }
go install github.com/Gentleman-Programming/engram/v3/cmd/engram@v3.7.0
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de Engram.' }
```

Comprobar las tres versiones y que el directorio de binarios de Go esté en PATH
antes de seguir. Si se resuelve otra copia, o Engram imprime `dev`, detenerse y
revisar la instalación; no cambiar el script para saltarse su comprobación.

Configurar los componentes de OpenCode en el perfil del usuario, **no** sobre
la configuración compartida del repositorio. El siguiente bloque fija el
binario Engram y evita la autoactualización de Gentle AI durante la instalación;
restaura después los valores previos de la terminal:

```powershell
$previousBin = $env:GENTLE_AI_ENGRAM_BIN
$previousUpdate = $env:GENTLE_AI_NO_SELF_UPDATE
try {
    $env:GENTLE_AI_ENGRAM_BIN = (Get-Command engram -CommandType Application).Source
    $env:GENTLE_AI_NO_SELF_UPDATE = '1'
    gentle-ai install --agent opencode --component engram,skills,context7,permissions --scope global
    if ($LASTEXITCODE -ne 0) { throw 'Revisar la instalación de componentes.' }
} finally {
    $env:GENTLE_AI_ENGRAM_BIN = $previousBin
    $env:GENTLE_AI_NO_SELF_UPDATE = $previousUpdate
}
```

La selección evita herramientas opcionales no necesarias. ODD es orientación
compartida de Gentle AI, no un componente `sdd` que haya que instalar. Las
preferencias de modelos, persona y revisión automatizada se acuerdan al configurar
el perfil; no copiar el perfil ni las credenciales de otro desarrollador.

Gentle AI usa `engram setup` para la integración. Si la verificación informa que
falta el plugin de OpenCode, revisar el diagnóstico y ejecutar en el equipo nuevo
`engram setup opencode`; no agregar un segundo MCP manual para compensarlo.
Reabrir OpenCode después de cambiar sus componentes o permisos.

Ejecutar `opencode auth login` para conectar el proveedor de IA autorizado con
una cuenta propia. Mantener sus credenciales fuera de Git y de las memorias.
Desde la raíz, verificar `gentle-ai doctor` y `opencode agent list`: deben estar
disponibles Plan, Build y `gentle-orchestrator`, y el Plan efectivo debe negar
`edit`, `bash` y `task`. No usar `/init` para regenerar el `AGENTS.md` existente.

CodeGraph es opcional. Si el equipo acuerda instalarlo, usar la integración de
Community Tools de Gentle AI y generar el índice de esta copia; no copiar el
índice de otro checkout. `.codegraph/` permanece local. Su ausencia no se resuelve
instalando servicios remotos ni compartiendo bases privadas.

## 4. Recibir el conocimiento técnico

El `config.json` del proyecto fija `ecosistema-el-burrito`; no ejecutarle `engram
init` con otro nombre. La configuración explícita prevalece sobre el nombre de
la carpeta y el remoto. Una selección de proceso contradictoria, como
`ENGRAM_PROJECT`, debe revisarse antes de guardar notas desde OpenCode.

En el equipo nuevo, con Engram 3.7.0 y el monorepo actualizado, desde su raíz:

```powershell
.\scripts\engram-team.ps1 Receive
engram search monorepo --project ecosistema-el-burrito
```

`Receive` importa a `ENGRAM_DATA_DIR` si está definido, o a `$HOME\.engram`.
Confirmar que esa es también la base usada por OpenCode; no apuntarlo a la base
de publicación. Pedir al agente que consulte `mem_current_project`: debe
informar el workspace correcto y `ecosistema-el-burrito`, no guardar notas para
adivinar la identidad. El lote inicial de fase 6.3 contiene 12 síntesis técnicas.
Buscar, por ejemplo, «Monorepo con aplicaciones independientes» y contrastar sus fuentes.

No importar la base histórica de otro integrante ni volver a publicar el lote
inicial. Repetir `Receive` no duplica un chunk ya procesado. No activar Cloud ni
sincronización automática. Para aportar conocimiento nuevo, seguir la
[publicación curada](verification-and-closure.md#memorias-técnicas-compartidas).

## 5. Qué se comparte y qué debe prepararse localmente

| Categoría | Ejemplos y tratamiento |
|-----------|------------------------|
| Compartida mediante Git | Código, lockfiles, `AGENTS.md`, `opencode.json`, ejemplos de entorno, reglas de FirebaseLab, configuración pública del Worker; de `.engram/`, solo `config.json`, manifiesto y chunks revisados. |
| Generada localmente | `node_modules/`, builds, cachés, `.wrangler/`, `.codegraph/`, `.atl/` y estado de emuladores. Regenerar en cada equipo; no copiar ni publicar. Los lockfiles se generan pero sí se versionan. |
| Personal o dependiente del equipo | Perfiles y modelos de OpenCode/Gentle AI, ubicación del SDK (`local.properties`), bases Engram habitual/de publicación y su marca local. No versionar. |
| Configuración cliente local | `User/.env`, `AdminWeb/.env` y los `google-services.json` necesarios: obtener o recrear para el entorno autorizado según los README. Aunque algunos valores sean públicos en el cliente, el proyecto trata esos archivos como sensibles y no se comparten por memoria. |
| Credenciales y permisos externos | Cuenta GitHub, proveedor de IA, sesiones/roles Firebase, Mapbox/Google y Cloudflare. El responsable concede solo el acceso necesario por el canal correspondiente; no copiar tokens, credenciales administrativas ni sesiones. |
| Firma de publicaciones | Keystores release, contraseñas y `keystore.properties`: reservados para responsables de entrega y respaldos privados. Los dos `debug.keystore` versionados no son material release. |

No hace falta distribuir claves release para incorporarse. Si una compilación
local exige material reservado, registrar el bloqueo y consultarlo; no cambiar
la firma ni copiar claves para eludirlo. La
[política de publicación](versioning-and-releases.md) define la entrega, no esta guía.

### Preparar cada aplicación

- **El Burrito:** seguir [configuración y ejecución](../../User/README.md#configuración-y-ejecución)
  para Firebase Android y los nombres de variables Mapbox/Google.
- **PILOTO:** seguir [setup](../../Driver/README.md#setup); no requiere `.env`.
- **CENTRAL:** completar solo los nombres previstos en
  [variables de entorno](../../AdminWeb/README.md#variables-de-entorno). Sus `VITE_*`
  llegan al bundle; no colocar secretos de servidor.
- **FirebaseLab y PULSO local:** utilizar cuentas y datos ficticios. El modo
  `pulso-local` no carga el `.env` operativo. Abrir CENTRAL normalmente no lo
  conecta automáticamente a los emuladores.

Mantener la configuración de producción separada. Solicitar una cuenta de prueba
o el entorno aprobado antes de ejecutar una app que pueda leer o escribir datos
reales. No se requiere otorgar acceso a consolas externas para las pruebas locales
aisladas de FirebaseLab y las integraciones automatizadas de PULSO.

## 6. Instalar dependencias de forma reproducible

Desde la raíz, instalar por lockfile, sin crear un `package.json` común ni copiar
dependencias de los repositorios anteriores. En esta incorporación, `npm ci`
sustituye el `npm install` general de los README para reproducir el lock existente:

```powershell
npm --prefix .\User ci
if ($LASTEXITCODE -ne 0) { throw 'Falló User.' }
npm --prefix .\Driver ci
if ($LASTEXITCODE -ne 0) { throw 'Falló Driver.' }
npm --prefix .\AdminWeb ci
if ($LASTEXITCODE -ne 0) { throw 'Falló AdminWeb.' }
npm --prefix .\AdminWeb\monitor\worker ci
if ($LASTEXITCODE -ne 0) { throw 'Falló el Worker.' }
npm --prefix .\FirebaseLab ci --cache .npm-cache --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Falló FirebaseLab.' }
```

No omitir los scripts de instalación: Driver usa un `postinstall` versionado.
Si un lock y su manifiesto discrepan, detenerse; no regenerar el lock ni actualizar
dependencias como reparación del onboarding. Revisar errores y advertencias, y
comprobar después que no aparecieron cambios de fuentes inesperados en Git.

## 7. Ejecutar y verificar los componentes

Ejecutar cada procedimiento desde su carpeta. Los siguientes enlaces son la
fuente de comandos y fixtures; no se duplican aquí sus pasos completos.

| Componente | Entrada de ejecución y verificación | Resultado que comprobar |
|------------|------------------------------------|------------------------|
| El Burrito | [Desarrollo local](../../User/README.md#desarrollo-local) y [comandos](../../User/README.md#comandos-de-desarrollo) | Metro y Android; distinguir la [deuda de lint conocida](../diagnostics/lint-debt.md). |
| PILOTO | [Scripts](../../Driver/README.md#scripts) y [requisitos de plataforma](../../Driver/README.md#requisitos-de-plataforma) | Un emulador no acredita GPS físico ni continuidad del servicio. |
| CENTRAL | [Desarrollo](../../AdminWeb/README.md#desarrollo) y [linting](../../AdminWeb/README.md#linting) | El acceso real requiere un usuario autorizado; no deducir el rol por tener código. |
| FirebaseLab | [Regresión de reglas](../../FirebaseLab/README.md#ejecutar-la-regresión-de-reglas) e [integración Auth/RTDB](../../FirebaseLab/README.md#integración-de-auth-y-rtdb) | Fixtures locales, reglas y login; el runner inicia y cierra emuladores y rechaza puertos ocupados. |
| PULSO | [Desarrollo con memoria y CENTRAL](../../AdminWeb/README.md#desarrollo-local-con-memoria-y-central) y [pruebas](../../AdminWeb/README.md#pruebas-y-comprobaciones-previas) | Emuladores, Worker y Vite separados; integraciones API/pantalla con sus fixtures, tipos y tests del Worker. Actualizar solo consulta D1. |

No iniciar todo a la vez: User y Driver requieren sesiones Metro separadas según
la app elegida. Las integraciones API/pantalla de PULSO comparten puertos y se
ejecutan secuencialmente; detener antes los emuladores interactivos de ese sandbox.
La integración histórica RTDB del Worker es distinta y necesita preparación
expresa: una prueba omitida no está aprobada. No matar procesos ajenos para liberar puertos.

Registrar comando, directorio, resultado, avisos y cualquier bloqueo. La evidencia
histórica de la migración no sustituye estas comprobaciones en el equipo nuevo.
No ejecutar deploy, aplicar migraciones remotas ni publicar artefactos durante
la incorporación.

## 8. Primera tarea y confirmación de incorporación

1. Acordar una tarea pequeña, responsable y criterios de aceptación; consultar
   `../planning/mvp.md` y los bloqueos antes de elegirla. Una prueba de setup no cierra el MVP.
2. Seguir la [preparación de una tarea](workflow.md#preparación-de-una-tarea):
   árbol limpio, `main` actualizado, memoria recibida y rama propia.
3. Usar Plan para el análisis y Build después de aprobarlo. Invocar
   Gentle-Orchestrator solo si se solicita coordinación explícita. Las credenciales
   del proveedor y las preferencias de modelos siguen siendo personales.
4. Implementar el alcance, comprobarlo y actualizar la documentación afectada en
   el mismo PR. Si aparece conocimiento útil, proponer una síntesis para revisión;
   no exportar automáticamente todas las notas de la sesión.
5. Pedir revisión a otro desarrollador y seguir el
   [cierre e integración](verification-and-closure.md#revisión-humana-e-integración-del-pr).
   Un commit local no es una tarea integrada y un PR no autoriza un despliegue.

La incorporación queda confirmada cuando el integrante puede recuperar contexto,
reproducir las comprobaciones pertinentes a su tarea y completar un PR revisado.
Registrar por separado cualquier componente aún bloqueado por acceso o entorno;
no dar por verificados los cinco por haber probado solo uno.

## Fuentes oficiales

- [OpenCode 1.19.5: instalación y uso](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/web/src/content/docs/index.mdx).
- [Gentle AI 4.4.0: uso e instalación](https://github.com/Gentleman-Programming/gentle-ai/blob/v4.4.0/docs/usage.md) y [componentes](https://github.com/Gentleman-Programming/gentle-ai/blob/v4.4.0/docs/components.md).
- [Engram 3.7.0: instalación](https://github.com/Gentleman-Programming/engram/blob/v3.7.0/docs/INSTALLATION.md), [plugins](https://github.com/Gentleman-Programming/engram/blob/v3.7.0/docs/PLUGINS.md) y [requisito Go](https://github.com/Gentleman-Programming/engram/blob/v3.7.0/go.mod).

Las versiones se fijan para reproducir lo validado, no porque sean las últimas.
Revisar cambios de versión como una tarea separada; `gentle-ai sync` refresca
activos del agente y no reemplaza `engram-team.ps1 Receive`.
