# Arquitectura: ciclo de tracking y límites

[Volver al documento principal](overview.md).

## 8. Ciclo de Vida del Tracking

### 8.1 Carga inicial de la asignación

`SendCoordinates` monta `loadAssignment()` al entrar con sesión. El ciclo hace
**dos intentos totales** de consulta (`ASSIGNMENT_RETRIES=2`), no dos reintentos
adicionales. Cada intento tiene un timeout de 10 s que cubre la lectura
opcional del nombre del conductor y la consulta de asignación. Entre el primero
y el segundo hay una pausa de 1.5 s.

La consulta usa `queryDailyAssignment()`: `orderByChild('choferId')` con
`equalTo(dni)` y resuelve la fecha en `America/Lima` al recibir la respuesta, no
al montar. Descarta registros cancelados, duplicados, de otro conductor o con
datos inválidos. El nombre del conductor es opcional: su fallo no invalida el
intento.

Estados visibles:

| Condición | Acción disponible |
|-----------|-------------------|
| Cargando asignación, sin controles de tracking | Spinner |
| Dos intentos agotados, sin controles | REINTENTAR y CERRAR SESIÓN |
| Asignación válida, detenido | INICIAR RECORRIDO y CERRAR SESIÓN |
| Sin bus asignado, detenido | INICIAR RECORRIDO y CERRAR SESIÓN (la revalidación al iniciar vuelve a bloquear si no hay asignación) |
| Iniciando, enviando, deteniendo o parada fallida | DETENER RECORRIDO; no se muestra CERRAR SESIÓN |

INICIAR no está disponible durante la carga inicial ni en la tarjeta de error.
La validación de asignación no ocurre solo al montar: se repite al presionar
INICIAR.

### 8.2 Secuencia de INICIAR

1. Se comprueba que no haya inicio, reinicio, parada o parada fallida en curso,
   y que el servicio no esté ya activo.
2. Se incrementa la generación, se marca `shouldRun=true` y `starting` con esa
   generación.
3. Se solicitan permisos en este orden exacto: `POST_NOTIFICATIONS` (API 33+),
   `ACCESS_FINE_LOCATION` y `ACCESS_BACKGROUND_LOCATION`. Cada denegación
   devuelve temprano.
4. Se revalida la asignación diaria con timeout de 10 s.
5. Si la respuesta conocida es inválida, ausente, cancelada, contradictoria o de
   otro conductor, se revoca el respaldo y se bloquea el inicio.
6. Si la consulta falla, solo se permite continuar cuando `.info/connected`
   reporta `false` y existe un respaldo en memoria del mismo conductor y día.
   Un timeout aislado no habilita el respaldo.
7. Se vuelve a comprobar que la fecha siga siendo la de Lima. Si cambió el día,
   se revoca el respaldo y se pide presionar INICIAR de nuevo.
8. Se fija `trackingIntent.run = { driverDni, busId }` y se inicia el
   `BackgroundJob` con las opciones de §9.1. La generación se revalida después
   de cada espera.

La revalidación ocurre **después** de los permisos y **antes** de arrancar el
servicio. No se reordena esa secuencia.

### 8.3 GPS, heartbeat y watchdog

`locationTask` ejecuta `Geolocation.watchPosition` con `enableHighAccuracy`,
`distanceFilter:2`, `interval:3000` y `fastestInterval:2000`. El callback
guarda la última posición, emite el pulso local y llama a `writeLocation()`.

`writeLocation()` usa `updateBusLocation(busId, {...coords, timestamp:
Date.now()})`. Fija `lastWriteAt` antes del `await`, para que el heartbeat no se
salte fuegos ni duplique escrituras; en fallo lo reinicia para permitir el
siguiente intento. `timestamp` es el instante del intento de publicación, no el
del fix GPS. Con bus quieto, el heartbeat refresca ese timestamp.

El heartbeat corre cada 8 s dentro del mismo `locationTask`. Solo escribe si ya
hay una `lastLocation` y si pasaron al menos 8 s desde el último intento. Emite
el pulso antes de escribir, incluso si la escritura falla, y no abre una segunda
ruta de escritura. Un `keepAlive` de 1 s verifica que el servicio siga en
ejecución y limpia la ejecución si dejó de estarlo.

El watchdog es un efecto de la pantalla, no del servicio. Se activa mientras
`isSending` es verdadero, revisa cada 10 s y reinicia si pasaron más de 30 s sin
pulso. Antes de reiniciar exige intención/generación vigente y ausencia de
inicio, reinicio o parada en curso. Si el reinicio falla, detiene la UI, emite
un Alert y deja un banner persistente.

El watchdog solo puede actuar mientras la pantalla y el proceso JavaScript
sigan vivos. Al desmontar la pantalla se elimina su intervalo y sus listeners,
pero el motor GPS puede continuar en el foreground service. Al remontar, la UI
restaura el estado si `shouldRun`, `sending` y `BackgroundJob.isRunning()`
siguen vigentes; el watchdog nuevo empieza con un reloj nuevo. No es una
garantía de supervivencia del proceso ni cubre un kill del sistema operativo.

### 8.4 DETENER

DETENER captura la identidad del recorrido antes del primer `await`, invalida
la intención/generación, limpia los recursos locales y serializa la parada
nativa con las demás transiciones.

- Si `BackgroundJob.stop()` falla, la parada local no está confirmada: se
  bloquea INICIAR y se permite reintentar DETENER.
- Si la parada nativa tiene éxito, se solicita `stopBusService(run.busId)`
  (`isActive:false`) antes de liberar INICIAR, sin esperar la confirmación
  remota.
- El resultado de la operación remota solo informa diagnóstico. Un ACK antiguo
  no reescribe el estado local ni cambia la identidad del recorrido nuevo.
- `trackingIntent.run` se libera cuando la parada local se confirma; el
  resultado remoto no decide esa liberación.

`isActive:false` se escribe en la parada funcional. Un kill anormal del proceso,
un crash nativo o una pérdida de ejecución pueden dejar `isActive:true`; el
watchdog dentro del proceso no cubre ese caso. No hay `onDisconnect`.

### 8.5 Cerrar sesión y relevos

CERRAR SESIÓN ejecuta `auth().signOut()` y vuelve a `LoginDriverScreen`. No
detiene el servicio ni escribe `isActive:false`; es una acción distinta de
DETENER. Su visibilidad en la UI no es simultánea con el recorrido activo.

El piloto usa un teléfono compartido: la sesión se mantiene durante los
relevos y el conductor no necesariamente cierra sesión al terminar su turno. La
cuenta autenticada identifica la sesión del teléfono, no necesariamente a la
persona física que lleva el bus en ese momento. Esta es una condición operativa
del MVP y una limitación de identidad, no una función de cambio automático de
conductor.

### 8.6 Identidad I08 y respaldo offline

Al validar INICIAR, `trackingIntent.run` fija `{driverDni, busId}`. Esa
identidad la usan GPS y la parada aunque la pantalla se remonte o la asignación
cambie después. Los `turnos` son informativos: no habilitan ni bloquean el
tracking (ADR-028).

El respaldo de asignación vive en un `useRef` de la pantalla, no en el objeto
compartido de intención. Solo sirve para el mismo conductor y la misma fecha.
No persiste entre procesos, se revoca ante una respuesta conocida como inválida
y no permite adivinar altas, cancelaciones ni cambios administrativos ocurridos
durante la desconexión. Un timeout aislado no equivale a offline.

`.info/connected` debe consultarse sin barra inicial (`ref('.info/connected')`)
porque el SDK instalado lanza excepción con `/`. Que reporte `false` habilita el
respaldo, pero no prueba entrega ni confirmación de escrituras remotas. Ver
`../diagnostics/resolved-bugs/driverapp.md` (CASO 021).

### 8.7 I07: idempotencia, restauración y HeadlessJS

El foreground service se implementa con `react-native-background-actions` 4.1.0
y `RNBackgroundActionsTask`. En la configuración actual, la Activity y el Service
comparten el proceso Android, pero tienen ciclos de vida distintos.

`trackingIntent` comparte intención, generación y transiciones entre montajes.
DETENER invalida antes del primer `await`. Cada ejecución de GPS tiene identidad
propia y un `dispose` idempotente para su watch, heartbeat y keepAlive. Las
guardas de callbacks y continuaciones impiden que una ejecución cancelada vuelva
a publicar o altere a su sucesora.

Un fallo de `stop()` no es éxito: conserva el error, bloquea INICIAR y permite
reintentar DETENER. Tras el éxito nativo, la solicitud remota se emite antes de
liberar INICIAR, sin esperar confirmación. Los ACK antiguos solo informan
diagnóstico como operación anterior.

Al re-montar, `SendCoordinates` recupera el estado compartido y escucha
`PRO_TRACKING_STATE` para operaciones iniciadas antes del remontaje. No basta
`isRunning()`: se exige intención vigente y envío activo, sin inicio o
recuperación en curso. Una parada cancelada no revive; un recorrido legítimo se
restaura sin crear otro motor. El desmontaje no detiene por sí mismo el
servicio.

La promesa de usuario de `locationTask` queda pendiente al limpiar para evitar
el `stop()` global automático del wrapper al resolverla. En esa versión, entregas
tardías pueden sobrescribir el resolver global y dejar envolturas pendientes. Los
tests caracterizan ese residual; no hay dos motores GPS
completos simultáneos. Ver `../diagnostics/resolved-bugs/driverapp.md` (CASO 020).

### 8.8 Persistencia y estado de la UI

La persistencia en disco no está activada: no se llama a
`database().setPersistenceEnabled(true)` (ADR-003). Desactivar la persistencia
en disco no elimina las escrituras pendientes en memoria del SDK durante una
desconexión: pueden confirmarse al reconectar. No se garantiza que cada intento
offline se descarte. I07 no agrega cola propia ni cancela escrituras ya
solicitadas; separa su confirmación del cierre local.

La etiqueta «Servicio de ubicación activo» describe el servicio Android local en
ejecución. No afirma que la última posición se haya publicado en RTDB ni
distingue conectado/desconectado. La UI no agrega listeners de conectividad en
esta fase (ADR-028).

## 9. Consideraciones de Implementación y Límites

### 9.1 Android 14 y foreground service

`foregroundServiceType` debe declararse en tres lugares coherentes:

1. `AndroidManifest.xml`: `<service android:foregroundServiceType="location" />`.
2. Permiso: `FOREGROUND_SERVICE_LOCATION` (además de `FOREGROUND_SERVICE`,
   `ACCESS_BACKGROUND_LOCATION` y `POST_NOTIFICATIONS`).
3. Opciones JS de `getBackgroundOptions()`:
   `foregroundServiceType: ['location' as const]`.

La configuración actual también usa `android:stopWithTask="false"` para que
cerrar la tarea no detenga el servicio. Eso no cubre un kill del proceso ni una
restricción del fabricante.

Un faltante de configuración puede producir excepciones específicas como
`MissingForegroundServiceTypeException` o `SecurityException`; no todas las
causas producen la misma `InvalidForegroundServiceTypeException`. Un inicio
desde background puede ser rechazado con
`ForegroundServiceStartNotAllowedException`, que la app informa al conductor.

El foreground service reduce la suspensión mientras está correctamente
configurado y autorizado, pero no garantiza ejecución ilimitada, inmunidad a
Doze, una cadencia exacta ni supervivencia a la terminación del proceso. Sin el
servicio, `watchPosition` puede detenerse al minimizar la app. No se debe
atribuir al sistema una garantía que el código no controla.

### 9.2 Multi-bus, caducidad y deuda pendiente

La selección de un solo bus, la caducidad y el estado `offline` se explican en
§5.3. El render multi-marcador completo sigue pendiente (`../planning/roadmap.md`, T4.4) y no debe
presentarse como implementado.

### 9.3 Geofencing y Haversine

`calculateDistance()` está en `User/src/features/map/utils/geo.ts` y lo usa
`burritoLocationStore.ts` para la clasificación de movimiento. No está en
`Map.tsx`.

La arquitectura actual no incorpora geofencing, cierre automático de vueltas ni
escritura a `/recorridos`. Su planificación está en `../planning/roadmap.md`, T4.3. Haversine ya
se utiliza; geofencing sigue pendiente.

### 9.4 Índices de RTDB

La consulta I08 usa `orderByChild('choferId')` sobre `/asignaciones`. El índice
`.indexOn` debe existir en la configuración desplegada para evitar advertencias
y escaneos costosos:

```json
{
  "asignaciones": {
    ".indexOn": "choferId"
  }
}
```

El índice es una optimización de rendimiento, no un mecanismo de autorización.
Las bibliotecas cliente pueden ejecutar consultas ad hoc sin él; la ausencia de
índice no convierte por sí sola la consulta en una denegación de permisos. La
autorización se define en las reglas de seguridad, que tampoco actúan como
filtros de resultados. La consulta debe cumplir las reglas y, por separado,
conviene que tenga el índice para operar eficientemente.

### 9.5 Compatibilidad iOS

BurritoDriverApp no está probada ni soportada en iOS: el foreground service
depende de APIs nativas de Android.

En El Burrito existe configuración iOS, pero el soporte funcional **no está
acreditado**. La inspección encontró un `Podfile` con target
`BurritoFeatureTest`, un `AppDelegate.swift` que registra el módulo
`BurritoFeatureTest`, un `app.json` con nombre `BurritoUserApp` y referencias
heredadas a `MapsApp` en el proyecto Xcode. No se encontró un
`GoogleService-Info.plist` versionado ni la inicialización de Firebase en el
AppDelegate inspeccionado. Esto no autoriza a declarar soporte iOS completo ni a
reparar esa configuración desde este documento.

### 9.6 Productores y simulación

El productor actual acreditado en el código es BurritoDriverApp, que escribe en
`/ubicacion_buses/{busId}`. No se acreditó en esta revisión un script Python
versionado, una carpeta de simulación ni una integración actual que escriba a
otro path como segundo productor. Si existe una herramienta externa de
simulación, debe documentarse por separado con su ruta, propósito y estado; no
se presenta aquí como parte de la topología productiva.

