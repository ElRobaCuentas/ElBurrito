# Architecture — El Burrito

Documento de la arquitectura implementada del Ecosistema El Burrito. Describe
componentes, responsabilidades, comunicación, estado local, ciclo de vida del
tracking y límites observables. Los contratos completos de datos viven en
`FIREBASE_SCHEMA.md`; las decisiones y su razonamiento, en `DECISIONS.md`; la
evidencia histórica, en `BUGS_RESUELTOS/`.

## Índice

- [§1. Visión General](#1-visión-general)
- [§2. Arquitectura del Ecosistema](#2-arquitectura-del-ecosistema)
- [§3. Arquitectura de BurritoDriverApp](#3-arquitectura-de-burritodriverapp-conductor)
- [§3.1. Arquitectura de AdminWeb](#31-arquitectura-de-adminweb-administrador)
- [§3.2. PULSO (monitor de seguimiento)](#32-pulso-monitor-de-seguimiento)
- [§4. Arquitectura de BurritoUserApp](#4-arquitectura-de-burritouserapp)
- [§5. Comunicación y Flujo de Datos](#5-comunicación-y-flujo-de-datos)
- [§6. Componentes Principales](#6-componentes-principales)
- [§7. Servicios Externos](#7-servicios-externos)
- [§8. Ciclo de Vida del Tracking](#8-ciclo-de-vida-del-tracking)
- [§9. Consideraciones de Implementación y Límites](#9-consideraciones-de-implementación-y-límites)
- [§10. Referencias](#10-referencias)

## 1. Visión General

El Burrito es un sistema de seguimiento en tiempo real para los autobuses
universitarios de la Universidad Nacional Mayor de San Marcos (UNMSM). Resuelve
una **asimetría de información**: los estudiantes esperan en paraderos sin saber
cuándo llegará el próximo bus; la aplicación muestra la posición en vivo de cada
unidad sobre un mapa accesible desde el celular.

El ecosistema usa un patrón **productor-consumidor para el tracking**: la
BurritoDriverApp produce posiciones GPS y El Burrito las consume. Esa parte del
sistema es **unidireccional** y no tiene una API propia ni un backend intermedio
mantenido por el proyecto. Firebase proporciona servicios backend administrados
(Auth, Realtime Database, Hosting, Analytics y Crashlytics), que se consumen
directamente desde las aplicaciones.

El resto del ecosistema no es estrictamente unidireccional: AdminWeb administra
configuración y BurritoDriverApp lee datos necesarios para operar.

```
BurritoDriverApp ── escribe tracking ──▶ RTDB /ubicacion_buses/{busId}
        │                                        │
        └── lee perfil y asignaciones ◀──────────┘

AdminWeb ── escribe/lee configuración ──▶ RTDB /choferes, /buses,
        │                                   /asignaciones, /administradores
        └── inicializa/elimina /ubicacion_buses/{placa} al crear/eliminar bus

El Burrito ── escucha /ubicacion_buses ──▶ mapa
        ├── lee /usuarios/{uid}
        └── escribe /usuarios/{uid} y /comentarios
```

Firebase RTDB es el bus de sincronización del tracking y también el almacén de
configuración administrativa. Firebase Auth es la fuente de identidad. No hay
un servidor de aplicación propio que opaque estas operaciones.

## 2. Arquitectura del Ecosistema

### Separación de responsabilidades

| Aplicación | Rol | Función principal | Identidad | Autorización |
|-----------|-----|-------------------|-----------|--------------|
| BurritoDriverApp | **Conductor** | Capturar GPS, mantener presencia y escribir tracking en RTDB | DNI + contraseña | Sesión de conductor y reglas RTDB |
| El Burrito | **Consumidor** (estudiante) | Leer tracking y renderizar el mapa; gestionar perfil y feedback | Email/contraseña o Google Sign-In | Sesión de estudiante y reglas por UID |
| AdminWeb | **Administración** | Gestionar conductores, buses, asignaciones y administradores | DNI + contraseña | Nodo `/administradores/{uid}` |
| Firebase RTDB | **Bus y almacén** | Sincronizar tracking y configuración | — | Reglas de seguridad |
| Firebase Auth | **Identidad** | Autenticar las tres aplicaciones | — | — |

La autenticación demuestra una identidad; la autorización decide qué puede
hacer esa identidad. El rol no se deduce del email ni del UID: se deriva del
nodo administrativo, del índice de conductores o de las reglas de cada path.

### Operaciones entre componentes

| Origen | Operación | Destino |
|--------|-----------|---------|
| BurritoDriverApp | Escribe posición y `isActive` del recorrido | `/ubicacion_buses/{busId}` |
| BurritoDriverApp | Lee perfil y asignación diaria | `/choferes/{dni}`, `/asignaciones` |
| BurritoDriverApp | Consulta estado de conexión para el respaldo I08 | `.info/connected` |
| El Burrito | Escucha la colección completa | `/ubicacion_buses` |
| El Burrito | Lee y actualiza perfil | `/usuarios/{uid}` |
| El Burrito | Crea feedback | `/comentarios` |
| AdminWeb | CRUD de configuración y lectura de listas | `/choferes`, `/buses`, `/asignaciones`, `/administradores` |
| AdminWeb | Inicializa o elimina el nodo de un bus | `/ubicacion_buses/{placa}` |
| AdminWeb (PULSO) | El Worker lee el tracking por HTTP público cada minuto en producción; conserva modos locales de prueba | REST `/ubicacion_buses/{busId}.json` |
| AdminWeb (PULSO) | Verifica el rol de la sesión de Central al autorizar su API de lectura | REST `/administradores/{uid}.json` |

### Autenticación y autorización

- **BurritoDriverApp (conductores)**: Firebase Auth con email compuesto
  `${dni}@conductor.com`. La contraseña inicial es el DNI, establecida al crear
  el conductor desde AdminWeb. El gate de la app comprueba sesión, no rol.
- **AdminWeb (administradores)**: Firebase Auth con email `${dni}@admin.com`.
  Tras el login, el auth gate consulta `/administradores/{uid}` para autorizar
  el acceso al panel.
- **El Burrito (estudiantes)**: Firebase Auth con email/contraseña o Google
  Sign-In. El perfil y el feedback se vinculan al UID autenticado.
- **Autorización RTDB**: las reglas limitan la escritura de tracking a
  conductores indexados en `/choferes_uids` o administradores, y las escrituras
  de perfil/feedback al UID propio. La UI no sustituye esas reglas.

### Proyectos y repositorios

Las tres aplicaciones comparten el proyecto Firebase `burritounmsm`, pero son
proyectos independientes con su propio `package.json`, entry point y
configuración. Cada una se ejecuta desde su carpeta (`User/`, `Driver/` o
`AdminWeb/`). El monorepo tiene una única raíz Git: `User/`, `Driver/`,
`AdminWeb/`, `docs/` y `FirebaseLab/` comparten repositorio e historial; la
independencia es de aplicación, no de repositorio.

## 3. Arquitectura de BurritoDriverApp (conductor)

### Entry point y enrutador

```
index.js → src/DriverApp.tsx
              ├── sin sesión → LoginDriverScreen
              └── con sesión → SendCoordinates
```

`DriverApp.tsx` monta `onAuthStateChanged` y decide entre login y tracking. La
app está destinada exclusivamente a conductores y no incluye panel de
administración ni consulta `/administradores`. El gate solo comprueba que
exista una sesión; no verifica por sí mismo el rol ni el flag `activo` del
conductor. La separación operativa se apoya en la cuenta convencional de
conductor y en las reglas de RTDB (ADR-023, ADR-025).

### Login y sesión

`LoginDriverScreen` construye `${dni}@conductor.com` y llama a
`auth().signInWithEmailAndPassword`. Maneja errores de red, credenciales
inválidas y cuentas deshabilitadas.

`DriverApp.tsx` escucha la sesión y deriva `driverDni` de la parte local del
email. En cada cambio de usuario sincroniza Crashlytics con `setUserId(uid)` o
`setUserId('')`. `SendCoordinates` contiene el resto de la lógica de tracking;
el ciclo detallado está en §8.

CERRAR SESIÓN es una acción separada de DETENER RECORRIDO: no escribe
`isActive:false` ni detiene el servicio. La pantalla la ofrece en estado
detenido o en la tarjeta de error de asignación; durante un recorrido activo se
muestra DETENER, no CERRAR SESIÓN. La separación de responsabilidades está en
ADR-026.

La estructura de archivos relevante está centralizada en §6.

## 3.1 Arquitectura de AdminWeb (administrador)

### Entry point y auth gate

```
src/main.tsx → src/App.tsx
                   ├── sin sesión → LoginScreen
                   ├── checking → verificación de rol
                   ├── admin → AdminNavigator
                   ├── denied → "No autorizado"
                   └── error → "No se pudo verificar" (Reintentar / Cerrar Sesión)
```

`App.tsx` escucha `onAuthStateChanged` y mantiene un estado explícito de rol
(`checking` → `admin` / `denied` / `error`). Con sesión, consulta
`existeAdministrador(uid)` sobre `/administradores/{uid}` con timeout de 10 s.
Mientras está en `checking` no muestra "No autorizado". Una denegación de
reglas equivale a `denied`: el SDK la entrega como `PERMISSION_DENIED` o como
el mensaje exacto `Permission denied` sin `code`
(`BUGS_RESUELTOS/adminweb.md`); un timeout o fallo de red va a `error` con
reintento o cierre de sesión.

`existeAdministrador` usa `get()` y retorna `snapshot.exists()`. Es la fuente
de verdad del auth gate y no se reemplaza por un claim local ni por la UI.

### Interfaz

La interfaz usa CSS propio con **tokens** (sin dependencias de UI). `index.css`
importa las hojas de `src/styles/`; usa cian `#00AEEF`, gris `#F5F5F5`, fondo
blanco y texto `#222222` en tema claro. `AppShell` aporta sidebar, topbar y
drawer móvil, muestra la identidad del admin y la expone vía
`SessionContext`/`useSession`. Las pantallas usan las primitivas de
`shared/ui/`; las confirmaciones usan `ConfirmDialog` y los avisos, toasts.

El efecto de apertura de `Modal.tsx` depende solo de `open`: enfoca el diálogo
y bloquea el scroll hasta cerrar o desmontar. Escape se registra en otro efecto
con `[open, onClose]` para usar el callback vigente sin robar el foco al editar
inputs (corrección 03/11/2026; ver `BUGS_RESUELTOS/adminweb.md`). Los cambios B2
de emuladores se preservan en `test/b2-adminweb-emulator` (`dc58daf`), fuera de
`main`.

### Módulo Admin

Accesible solo para usuarios cuyo `auth.uid` existe en `/administradores/`.
Gestión contra RTDB:

| Entidad | Path | Operaciones |
|---------|------|-------------|
| Choferes | `/choferes/{dni}` | Crear (Auth + RTDB + índice `/choferes_uids`), listar, editar, activar/desactivar (no se eliminan) |
| Buses | `/buses/{placa}` | Crear e inicializar `/ubicacion_buses/{placa}`, listar, toggle, eliminar |
| Asignaciones | `/asignaciones/{pushId}` | Crear para hoy/futuro con uno o varios turnos (valida mínimo 1, inicio < fin, mismo día, sin solape y los ordena), validar exclusividad conductor/fecha, listar, editar turnos (con la misma validación/orden) y cancelar |
| Administradores | `/administradores/{uid}` | Crear (Auth + RTDB), listar, editar, eliminar (nodo) |

Al crear cuentas de Auth, `admin_service.ts` usa una **app temporal por
operación** con `inMemoryPersistence` (`initializeApp(config, 'reg_...' /
'admin_...')`) para no sobrescribir la sesión del admin actual (ADR-011,
ADR-025).

Límites de la operación administrativa:

- `createAsignacion` valida la exclusividad conductor/fecha en el cliente con
  una lectura seguida de una escritura; no es una transacción atómica y dos
  administradores podrían competir. No valida exclusividad del bus: varios
  conductores pueden usar la misma placa.
- `hasActiveOrFutureBusAssignment` se usa para bloquear la eliminación de un bus
  con asignación activa o futura; no participa del alta de asignaciones.
- Desactivar un conductor no cancela sus asignaciones ni detiene su tracking.
  No existe eliminación física habitual de conductores.
- Eliminar un administrador borra su nodo, no su cuenta de Authentication.
- Crear un bus normaliza la placa y crea `/ubicacion_buses/{placa}` con
  `isActive:false`. Eliminarlo también elimina ese nodo.
- Los turnos son datos administrativos dentro de una asignación; no habilitan
  ni bloquean el tracking.

La estructura de archivos relevante está centralizada en §6.

### 3.2 PULSO (monitor de seguimiento)

PULSO es el monitor técnico interno, implementado en `AdminWeb/monitor/`, que
observa las publicaciones de BurritoDriverApp sin intervenir en el pipeline del
mapa de El Burrito ni escribir en RTDB.

```text
BurritoDriverApp → RTDB → Worker de Cloudflare (cron) → D1
                                                       ↓
                                  API administrativa → Central
```

El Worker comprueba el bus configurado cada minuto y persiste estado e
incidentes. Central consulta `GET /api/pulso` con la sesión administrativa
existente; la API autoriza mediante Firebase y lee D1, sin evaluar ni consultar
el tracking. El refresco del navegador y el cron son procesos independientes.
Se conservan modos locales de comprobación manual y programada para desarrollo.

La referencia principal es [PULSO.md](PULSO.md): funcionamiento, estados e
incidentes (§3–5), memoria y migraciones (§6), indicadores y datos antiguos (§7),
operación (§8), evidencia del MVP (§9) y límites (§10). Los contratos RTDB siguen
en `FIREBASE_SCHEMA.md`; los comandos de desarrollo, pruebas y despliegue, en el
[README de AdminWeb](https://github.com/ElRobaCuentas/AdminWeb/blob/main/README.md#monitor-pulso-local-y-despliegue-remoto).

#### 3.2.1 Despliegue remoto e integración con Central (vigilancia activa)

El MVP está implementado y publicado con vigilancia automática en Cloudflare y
memoria D1; Central usa la API remota. Fue validado operativamente el
**18/11/2026**, incluyendo interrupción, persistencia sin duplicados, recuperación,
detención e inicio/duración observados.

La configuración, las referencias de publicación y la integridad de migraciones
están consolidadas en [PULSO §8](PULSO.md#8-operación-en-producción); las ocho
pruebas, en [§9](PULSO.md#9-validación-operativa-del-mvp). Las limitaciones no son
fallos atribuidos a esas pruebas. La evolución posterior pertenece a
[ROADMAP §2.1](ROADMAP.md#21-evolución-de-pulso-posterior-al-mvp), sin dar por cerrado
el MVP general del ecosistema.

## 4. Arquitectura de BurritoUserApp

### Entry point, hidratación y splash

```
index.js → src/app/App.tsx → StackNavigator → DrawerNavigator → MapScreen
```

`App.tsx` configura Google Sign-In, cambia Firebase RTDB entre offline/online
según `AppState`, espera la hidratación de `userStore` y `themeStore`, y monta
`NavigationContainer`. El splash nativo de `react-native-bootsplash` se oculta
en `onReady` mediante `requestAnimationFrame`. Esa secuencia reduce la ventana
de splash sobre una UI vacía, pero no demuestra que todo trabajo asíncrono
posterior haya terminado ni que la primera pantalla esté completamente
pintada. Un watchdog de sesión limpia el estado local si el store indica sesión
pero Firebase Auth ya no entrega usuario.

### Navegación

```
StackNavigator (root)
├── logged-out: Welcome → SignIn/SignUp → ForgotPassword → AvatarPicker
└── logged-in:
    └── DrawerNavigator
        └── MapScreen (única pantalla del drawer; sin rutas admin)
```

El gating de autenticación es declarativo según `isLoggedIn`. No existen rutas
administrativas ni gating por `rol === 'admin'`. El módulo admin fue eliminado
de la app; la evolución está documentada en ADR-025 y en el historial de
`BUGS_RESUELTOS/adminweb.md`.

### Stores de Zustand

| Store | Persistencia | Propósito |
|-------|-------------|-----------|
| `userStore` | Zustand persist + AsyncStorage | uuid, username, avatar, nickname, email, rol (`'estudiante' \| null`), isLoggedIn |
| `themeStore` | AsyncStorage manual | isDarkMode |
| `mapStore` | Efímera | command (center) |
| `burritoLocationStore` | Efímera | locations, busMovementStates, movementDisplacements, movementMemory, isConnecting, connectionError, startTracking/stopTracking |
| `drawerStore` | Efímera | isOpen, open/close |

El listener RTDB vive en `burritoLocationStore`, no en componentes React. Esto
evita re-renders masivos del canvas y mantiene una única fuente de estado para
`Map.tsx` y `MapBranding.tsx`.

### Logout estudiantil

```
CustomDrawer → logoutStudent()
    ↓
firebaseAuth.signOut()
    ├── falla → no se confirma el cierre local
    └── confirma → onConfirmed() limpia la sesión local
                    ↓
          Google Sign-Out y Analytics se intentan sin bloquear el resultado
```

El cierre local solo se confirma después de que Firebase acepta `signOut`. La
limpieza de Google y el evento `sesion_cerrada` son best-effort: un fallo en
esos pasos no revierte el logout ya confirmado.

### Limpieza de recursos

`MapScreen` inicia `startTracking()` al montar y llama `stopTracking()` al
desmontar. `stopTracking()` libera el listener RTDB y los intervalos/timeout
del store. Esto acredita la limpieza de esos recursos, no la ausencia global de
cualquier listener o consumo en toda la aplicación.

La estructura de archivos relevante está centralizada en §6.

**[Arquitectura: flujos, componentes y servicios](ARCHITECTURE-FLOWS.md)**

## 5. Comunicación y Flujo de Datos

[Consultar sección](ARCHITECTURE-FLOWS.md#5-comunicación-y-flujo-de-datos).

### 5.1 Pipeline de tracking

[Consultar sección](ARCHITECTURE-FLOWS.md#51-pipeline-de-tracking).

### 5.2 Recepción RTDB: snapshots completos e I06

[Consultar sección](ARCHITECTURE-FLOWS.md#52-recepción-rtdb-snapshots-completos-e-i06).

### 5.3 Estado visual, multi-bus y caducidad

[Consultar sección](ARCHITECTURE-FLOWS.md#53-estado-visual-multi-bus-y-caducidad).

### 5.4 Feedback de El Burrito

[Consultar sección](ARCHITECTURE-FLOWS.md#54-feedback-de-el-burrito).

### 5.5 Autenticación de El Burrito

[Consultar sección](ARCHITECTURE-FLOWS.md#55-autenticación-de-el-burrito).

### 5.6 Flujo administrativo

[Consultar sección](ARCHITECTURE-FLOWS.md#56-flujo-administrativo).

## 6. Componentes Principales

[Consultar sección](ARCHITECTURE-FLOWS.md#6-componentes-principales).

### BurritoDriverApp

[Consultar sección](ARCHITECTURE-FLOWS.md#burritodriverapp).

### AdminWeb

[Consultar sección](ARCHITECTURE-FLOWS.md#adminweb).

### El Burrito

[Consultar sección](ARCHITECTURE-FLOWS.md#el-burrito).

## 7. Servicios Externos

[Consultar sección](ARCHITECTURE-FLOWS.md#7-servicios-externos).

### Firebase

[Consultar sección](ARCHITECTURE-FLOWS.md#firebase).

### Mapbox

[Consultar sección](ARCHITECTURE-FLOWS.md#mapbox).

### Google Sign-In

[Consultar sección](ARCHITECTURE-FLOWS.md#google-sign-in).

### react-native-dotenv

[Consultar sección](ARCHITECTURE-FLOWS.md#react-native-dotenv).

**[Arquitectura: ciclo de tracking y límites](ARCHITECTURE-TRACKING.md)**

## 8. Ciclo de Vida del Tracking

[Consultar sección](ARCHITECTURE-TRACKING.md#8-ciclo-de-vida-del-tracking).

### 8.1 Carga inicial de la asignación

[Consultar sección](ARCHITECTURE-TRACKING.md#81-carga-inicial-de-la-asignación).

### 8.2 Secuencia de INICIAR

[Consultar sección](ARCHITECTURE-TRACKING.md#82-secuencia-de-iniciar).

### 8.3 GPS, heartbeat y watchdog

[Consultar sección](ARCHITECTURE-TRACKING.md#83-gps-heartbeat-y-watchdog).

### 8.4 DETENER

[Consultar sección](ARCHITECTURE-TRACKING.md#84-detener).

### 8.5 Cerrar sesión y relevos

[Consultar sección](ARCHITECTURE-TRACKING.md#85-cerrar-sesión-y-relevos).

### 8.6 Identidad I08 y respaldo offline

[Consultar sección](ARCHITECTURE-TRACKING.md#86-identidad-i08-y-respaldo-offline).

### 8.7 I07: idempotencia, restauración y HeadlessJS

[Consultar sección](ARCHITECTURE-TRACKING.md#87-i07-idempotencia-restauración-y-headlessjs).

### 8.8 Persistencia y estado de la UI

[Consultar sección](ARCHITECTURE-TRACKING.md#88-persistencia-y-estado-de-la-ui).

## 9. Consideraciones de Implementación y Límites

[Consultar sección](ARCHITECTURE-TRACKING.md#9-consideraciones-de-implementación-y-límites).

### 9.1 Android 14 y foreground service

[Consultar sección](ARCHITECTURE-TRACKING.md#91-android-14-y-foreground-service).

### 9.2 Multi-bus, caducidad y deuda pendiente

[Consultar sección](ARCHITECTURE-TRACKING.md#92-multi-bus-caducidad-y-deuda-pendiente).

### 9.3 Geofencing y Haversine

[Consultar sección](ARCHITECTURE-TRACKING.md#93-geofencing-y-haversine).

### 9.4 Índices de RTDB

[Consultar sección](ARCHITECTURE-TRACKING.md#94-índices-de-rtdb).

### 9.5 Compatibilidad iOS

[Consultar sección](ARCHITECTURE-TRACKING.md#95-compatibilidad-ios).

### 9.6 Productores y simulación

[Consultar sección](ARCHITECTURE-TRACKING.md#96-productores-y-simulación).

## 10. Referencias

| Documento | Relación |
|-----------|----------|
| `FIREBASE_SCHEMA.md` | Estructura detallada de nodos, payloads, reglas e índices de RTDB. |
| `DECISIONS.md` | Decisiones de arquitectura (ADR) con razonamiento técnico. |
| `ROADMAP.md` | Planificación posterior al MVP y dependencias. |
| `../MVP.md` | Operación del piloto, aceptación de jornada y supuestos de relevo. |
| `TROUBLESHOOTING.md` | Incidentes, diagnóstico y soluciones operativas. |
| `BUGS_RESUELTOS/` | Historial de bugs resueltos y evidencia de validación. |
| `../Driver/README.md` | Setup, requisitos y funcionalidad de BurritoDriverApp. |
| `../User/README.md` | Setup, requisitos y funcionalidad de El Burrito. |
| `../AdminWeb/README.md` | Setup, requisitos y funcionalidad del panel administrativo. |
