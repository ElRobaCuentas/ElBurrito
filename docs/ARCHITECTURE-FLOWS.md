# Arquitectura: flujos, componentes y servicios

[Volver al documento principal](ARCHITECTURE.md).

## 5. Comunicación y Flujo de Datos

Esta sección describe **qué componentes se comunican y con qué contrato**. El
ciclo de vida, las guardas y la recuperación del tracking se detallan en §8.

### 5.1 Pipeline de tracking

```
MapScreen.mount()
    ↓
burritoLocationStore.startTracking()
    ↓
MapService.subscribeToBusLocations() → ref.on('value')
    ↓
Recepción de Record<string, BurritoLocation>
    ↓
Validación I06 + deduplicación I05 + estrategia C experimental
    ↓
store.locations / busMovementStates
    ↓
Map.tsx / MapBranding.tsx → interpolación RNAnimated (~2 s) → render del marcador y estado
```

En el productor, `locationTask` recibe los fixes y los publica:

```
GPS watchPosition ─┐
                   ├─→ writeLocation() ─→ updateBusLocation() ─→ RTDB
Heartbeat (8 s) ───┘
```

`writeLocation()` es la única ruta para publicar posiciones GPS y heartbeat;
no es la única escritura de RTDB del ecosistema. `stopBusService()` escribe
`isActive:false`, y AdminWeb inicializa o elimina `/ubicacion_buses/{placa}` al
gestionar un bus.

Señales distintas que no deben confundirse:

| Señal | Origen | Significado |
|-------|--------|-------------|
| Fix GPS | `watchPosition` | Coordenadas, heading y speed entregados por el dispositivo |
| Intento de publicación | `writeLocation` | Se fija antes del `await`; el `timestamp` se toma al intentar publicar, no en el fix ni en el servidor |
| Pulso local | `PRO_LOCATION_PULSE` | Señal para la UI y el watchdog; se emite antes de intentar escribir y aunque la escritura falle |
| Resultado/ACK de la promesa | `updateBusLocation` / `stopBusService` | Éxito o fallo local de la operación; no certifica que otro cliente lo haya leído ni la frescura remota |
| Recepción | `on('value')` en El Burrito | Snapshot completo del nodo, con una hora de recepción por snapshot |

El heartbeat de 8 s solo publica si ya existe una `lastLocation` y si no hubo
un intento de escritura reciente. Un fallo de escritura reinicia el contador
para permitir el siguiente intento y evitar una cola propia. La lógica completa
está en §8.3.

### 5.2 Recepción RTDB: snapshots completos e I06

`MapService` se suscribe a `/ubicacion_buses` y recibe snapshots completos del
nodo; no recibe deltas independientes por bus. Por cada snapshot toma una hora
de recepción y valida cada entrada. La regla general I06 rechaza valores
explícitamente inválidos de coordenadas, timestamp e `isActive`; las excepciones
y límites aprobados son:

- **I06-A (limitación aceptada)**: los campos ausentes o `null` conservan los
  respaldos de coordenadas `0` y timestamp `Date.now()`. No se rechazan todos
  los registros incompletos. Una detención sin coordenadas válidas conserva la
  posición previa y pasa a offline; se mantiene I05.
- **I06-B**: un timestamp explícito mayor que la hora de recepción + 300 000 ms
  se rechaza y no se entrega al store. El límite de +300 000 ms es inclusivo; no
  se recorta. La última ubicación válida y su caducidad se conservan. El margen
  tolera diferencias de reloj, no deriva del heartbeat ni prueba sincronización
  de relojes.
- **Deduplicación I05**: se acepta un timestamp más nuevo; también se acepta la
  transición activo → inactivo con el mismo timestamp. Los datos viejos y las
  reactivaciones con timestamp igual se rechazan.

El mecanismo de recepción no borra una entrada por el hecho de que falte en un
snapshot: el store mezcla las entradas aceptadas con su estado anterior.

### 5.3 Estado visual, multi-bus y caducidad

La fuente de datos es multi-bus: el store conserva
`Record<string, BurritoLocation>`. Sin embargo, la UI actual no renderiza toda
la flota. `Map.tsx` y `MapBranding.tsx`:

1. Filtran entradas con `isActive !== false`.
2. Ordenan por `timestamp` descendente.
3. Seleccionan la primera entrada.

No buscan una alternativa fresca ni eligen un bus arbitrario. El render
multi-marcador completo sigue pendiente (ROADMAP T4.4).

La caducidad de 30 s se evalúa cada 2 s y cambia el estado del bus a `offline`
cuando `!isActive` o cuando la edad del timestamp alcanza el umbral. Ese estado
oculta el marcador y el radar en `Map.tsx`, pero no elimina necesariamente la
entrada de `locations` ni escribe `isActive:false` en RTDB. Un bus activo pero
viejo puede seguir siendo el seleccionado y mostrarse como `SIN SEÑAL`.

La clasificación en vivo usa la **estrategia C experimental** (distancia, Δt,
speed condicional y memoria con `STOP_CONFIRM_PAIRS=2`). `MOVEMENT_THRESHOLD_M`
(8 m) pertenece a la estrategia A histórica y no decide el estado en vivo. Los
parámetros de `movement.ts` son calibración pendiente, no valores definitivos
(ADR-020).

### 5.4 Feedback de El Burrito

`CustomDrawer` obtiene el UID de Firebase Auth y `MapService.sendFeedback()`
lo contrasta con la sesión vigente antes de crear un hijo mediante
`push().set()`, con `ServerValue.TIMESTAMP`. Las reglas publicadas exigen
creación con UID propio y rating entero 1–5; deniegan editar o borrar
comentarios. Los permisos de conductores y asignaciones se detallan en
`FIREBASE_SCHEMA.md` §9.

### 5.5 Autenticación de El Burrito

```
SignInScreen.handleEmailLogin()
    ↓
firebaseAuth.signInWithEmailAndPassword(email, password)
    ↓
Lee /usuarios/{uid}
    ↓
Actualiza /usuarios/{uid}/ultimaConexion = ServerValue.TIMESTAMP
    ↓
userStore.login(uid, username, avatar, email, 'estudiante')
    ↓
StackNavigator detecta isLoggedIn=true → DrawerNavigator → MapScreen
```

La API correcta es `signInWithEmailAndPassword`. El login con Google usa
`@react-native-google-signin/google-signin`, configurado con `webClientId` y
`offlineAccess:true`; `AvatarPickerScreen` completa el registro cuando
corresponde.

### 5.6 Flujo administrativo

```
createChofer:
    Auth temporal (${dni}@conductor.com)
    → /choferes/{dni}
    → /choferes_uids/{uid}

createBus:
    → /buses/{placa}
    → /ubicacion_buses/{placa} = { isActive:false }

createAsignacion:
    → /asignaciones/{pushId} con choferId, busId, fecha, turnos,
      createdAt y createdBy

updateTurnos:
    → actualiza turnos y espejo horaInicio/horaFin del mismo nodo

createAdmin:
    Auth temporal (${dni}@admin.com)
    → /administradores/{uid}
```

Los payloads completos, reglas e índices están en `FIREBASE_SCHEMA.md`. Las
validaciones y limitaciones del panel están en §3.1.

## 6. Componentes Principales

Inventario central de archivos relevantes. Los árboles completos de directorios
pertenecen al README de cada aplicación; esta tabla es el mapa de arquitectura.

### BurritoDriverApp

| Archivo | Responsabilidad |
|---------|----------------|
| `index.js` | Registro de la app; comentario sobre persistencia desactivada; import de gesture-handler |
| `src/DriverApp.tsx` | Auth gate (login ↔ tracking conductor); sincronización de Crashlytics |
| `src/screen/LoginDriverScreen.tsx` | Login con DNI, construcción del email y manejo de errores |
| `src/screen/SendCoordinates.tsx` | Asignación diaria, permisos, foreground service, GPS, heartbeat, watchdog, debug |
| `src/services/firebase_service.ts` | `updateBusLocation()` y `stopBusService()` contra RTDB |
| `src/shared/utils/timeout.ts` | Helper con timeout para lecturas RTDB |

### AdminWeb

| Archivo | Responsabilidad |
|---------|----------------|
| `src/main.tsx` | Entry point de la SPA (BrowserRouter + ToastProvider) |
| `src/App.tsx` | Auth gate: sesión → rol (`checking/admin/denied/error`) |
| `src/index.css` + `src/styles/*` | Sistema de diseño por tokens |
| `src/screen/LoginScreen.tsx` | Login admin (DNI → `{dni}@admin.com`) |
| `src/navigation/AdminNavigator.tsx` | Rutas del panel dentro de `AppShell` |
| `src/shared/layout/AppShell.tsx` | Sidebar, topbar y drawer móvil; provee la sesión |
| `src/shared/layout/SessionContext.tsx` | Datos del admin en sesión (`useSession`) |
| `src/shared/ui/*` | Primitivas de UI y overlays (Button, Field, Card, Modal/ConfirmDialog, Toast, Icon) |
| `src/features/admin/services/admin_service.ts` | CRUD con Auth temporal + RTDB |
| `src/features/admin/services/admin_check.ts` | `existeAdministrador(uid)` con timeout |
| `src/features/admin/screen/ChoferesScreen.tsx` | Gestión de conductores |
| `src/features/admin/screen/BusesScreen.tsx` | CRUD de buses |
| `src/features/admin/screen/AsignacionesScreen.tsx` | Asignaciones por fecha y edición de turnos |
| `src/features/admin/screen/AdminsScreen.tsx` | Gestión de administradores |
| `src/features/admin/components/TurnosEditor.tsx` | Editor reutilizable de turnos |
| `src/features/admin/utils/turno.ts` | Modelo, validación y formato de turnos |
| `src/features/admin/utils/turnoDraft.ts` | Estado de edición de turnos |
| `src/features/pulso/services/pulso_service.ts` | Cliente de `GET /api/pulso` con el token de sesión y validación del contrato |
| `src/features/pulso/pulsoPresentation.ts` | Etiquetas y formato es-PE de la pantalla PULSO |
| `src/features/pulso/screen/PulsoScreen.tsx` | Vista `/pulso`: estados diferenciados y refresco automático cada 60 s con Actualizar manual |
| `src/shared/config/env.ts` | Validación de `VITE_FIREBASE_*` y del origen HTTPS opcional de PULSO (`VITE_PULSO_API_ORIGIN`) |
| `src/shared/config/firebase.ts` | Instancia de Firebase (Firebase JS SDK) |
| `src/shared/utils/dni.ts` | Normalización y validación de DNI |
| `src/shared/utils/date.ts` | Fechas de calendario America/Lima |
| `src/shared/utils/format.ts` | Formateo de fechas y nombres de admin |

### El Burrito

| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/App.tsx` | Montaje global, hidratación, Google Sign-In, Firebase offline/online, splash |
| `src/app/navigations/StackNavigator.tsx` | Auth gate declarativo |
| `src/app/navigations/DrawerNavigator.tsx` | Drawer con MapScreen |
| `src/features/map/screen/MapScreen.tsx` | Orquestador del mapa y ciclo start/stop del store |
| `src/features/map/components/Map.tsx` | Canvas Mapbox, selección y render del marcador, ruta, radar |
| `src/features/map/components/MapBranding.tsx` | Estado moving/stopped/offline |
| `src/features/map/components/CustomDrawer.tsx` | Perfil, tema, feedback y logout |
| `src/features/map/services/map_service.ts` | Listener RTDB, validación I06 y feedback |
| `src/features/map/utils/geo.ts` | Haversine (`calculateDistance`) |
| `src/features/map/utils/movement.ts` | Estrategia C experimental y su memoria |
| `src/features/auth/services/studentLogout.ts` | Logout estudiantil y tareas best-effort |
| `src/store/burritoLocationStore.ts` | Tracking, dedup, caducidad y clasificación de movimiento |
| `src/store/userStore.ts` | Sesión persistente del estudiante |
| `src/store/themeStore.ts` | Dark mode con AsyncStorage |
| `src/shared/config/firebase.ts` | Instancia compartida de Firebase |

## 7. Servicios Externos

Firebase es el backend administrado del ecosistema. El proyecto no mantiene un
servidor propio ni una API intermedia.

### Firebase

| Servicio | BurritoDriverApp | El Burrito | AdminWeb |
|----------|------------------|------------|----------|
| Firebase Auth | Login de conductor | Login email/password + Google Sign-In | Login de admin y creación de cuentas con app temporal |
| Firebase RTDB | `/ubicacion_buses/{busId}` (write), `/asignaciones` y `/choferes` (read) | `/ubicacion_buses` (listen), `/usuarios`, `/comentarios` | CRUD de configuración y lectura de listas |
| Firebase Analytics | No | Eventos de usuario (mapa abierto, mapa centrado) | No documentado como uso activo |
| Firebase Crashlytics | Sí (`setUserId` con UID o cadena vacía) | Configuración presente; no se acreditó telemetría activa en esta revisión | No documentado como uso activo |
| `ServerValue.TIMESTAMP` | No | Sí (`ultimaConexion`, feedback) | No; los registros administrativos usan `Date.now()` |
| Firebase Hosting | No | No | Sirve `dist/` con rewrites SPA y cache de assets |

> **AdminWeb** usa Firebase Auth para login y alta de cuentas, y RTDB para
> `/choferes`, `/buses`, `/asignaciones`, `/choferes_uids` y
> `/administradores`.

> **Identidad y diagnóstico (I11):** `DriverApp.tsx` solicita
> `setUserId(uid)` cuando Firebase Auth entrega un usuario y `setUserId('')`
> cuando entrega `null`, incluido el arranque sin sesión. La limpieza no
> elimina reportes históricos. El panel deja de imprimir nombre, DNI y prefijo
> del DNI; conserva GPS, heartbeat, Firebase, bus, asignaciones, permisos,
> watchdog, parada y errores con stack trace.

### Mapbox

- SDK: `@rnmapbox/maps` v10.2.10.
- Token público vía `@env` en El Burrito.
- Renderizado: ruta LineString, paraderos como puntos, marcador del bus con
  heading, radar animado y dark mode opcional.

### Google Sign-In

- SDK: `@react-native-google-signin/google-signin`.
- Configuración: `webClientId` desde `@env`.
- Inicializado en `App.tsx` con `offlineAccess:true`.
- Flujo: `SignInScreen` maneja el login Google; `AvatarPickerScreen` completa
  el registro con nick de facultad.

### react-native-dotenv

- El Burrito usa `module:react-native-dotenv` para inyectar variables desde
  `.env` vía `@env`.
- BurritoDriverApp no usa variables de entorno.

