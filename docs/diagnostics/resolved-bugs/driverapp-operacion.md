# BurritoDriverApp: operación, respaldo y auditoría

[Volver al documento principal](driverapp.md).

## CASO 019 — El heartbeat escribía cada ~16s en paradero en vez de cada 8s (T4.1)

**Síntoma:** Tras implementar el heartbeat T4.1 (`setInterval` de `HEARTBEAT_INTERVAL_MS = 8000`), la
Prueba 1 (20/08/2026) mostró que la cadencia real de escrituras en RTDB durante PARADERO era de
**~16.25 s** (huecos deterministas de 16 s entre timestamps consecutivos), el doble de la cadencia
configurada. En MOVIMIENTO la cadencia era correcta (~8 s). Consecuencia directa: la frescura
percibida por la UserApp se degradaba exactamente cuando el bus está detenido, que es el escenario
crítico para distinguir "bus parado" de "bus desaparecido".

**Causa Raíz:** Carrera ε entre el marcador de frescura y el chequeo del intervalo. `writeLocation`
asignaba `lastWriteAt = Date.now()` DESPUÉS del `await` de la escritura en RTDB, mientras el tick
del heartbeat evaluaba `Date.now() - lastWriteAt < HEARTBEAT_INTERVAL_MS` de forma independiente. Si
el tick vencía mientras una escritura estaba en vuelo (o justo antes de que el `await` resolviera y
actualizara el marcador), la condición daba "vencida", disparaba una segunda escritura y reiniciaba
el ciclo desfasado: dos ciclos de 8 s colisionados producían un hueco efectivo de ~16 s. En PARADERO
—sin GPS updates reales que re-frescaran el marcador— el desfase era determinista y se acumulaba
visible; en MOVIMIENTO cada update GPS enmascaraba el problema.

**Solución (refinamiento de T4.1):**
- `lastWriteAt = Date.now()` se fija ANTES del `await` de la escritura: el instante del
  INTENTO es la marca de frescura, no el instante de confirmación de RTDB. Así ningún tick
  puede evaluar la condición con el marcador "viejo" mientras la escritura está en vuelo.
- En el `catch` de la escritura fallida, `lastWriteAt = 0`: si RTDB rechaza, el siguiente
  tick reintenta de inmediato en vez de esperar otro intervalo completo creyendo que los
  datos están frescos.
- Sin cambios en el intervalo (8000 ms), ni en `writeLocation` como API, ni en el esquema
  de RTDB.

**Archivo:** Driver/src/screen/SendCoordinates.tsx

**Estado:** Resuelto — verificado empíricamente con captura directa de RTDB (22/08/2026), dos sesiones
independientes (`stat_rtdb.jsonl`, `stat2_rtdb.jsonl`, muestreo a 1 Hz sobre `/ubicacion_buses`):
- Sesión 1 (paradero sostenido): deltas de timestamp 8003–8005 ms, **cero valores ≥16 s**
  en toda la sesión.
- Sesión 2: idem, cadencia estable 8003–8005 ms durante todo el paradero.
- Antes del fix: medias de ~16.25 s documentadas en los reportes de Prueba 1.
- `npx tsc --noEmit` exit 0. Lint sin errores nuevos. Commit `99eafa0` (rama
  `feat/driverapp/heartbeat`). Decisión registrada en ADR-019.

**Lección:** Nunca fijar un marcador de frescura DESPUÉS de un `await` cuando un intervalo independiente
evalúa ese mismo marcador: el hueco entre intento y confirmación es justamente la ventana donde el
intervalo decide mal. La marca debe capturar el instante del intento, y el camino de error debe
invalidar el marcador para no postergar el reintento.

## CASO 020 — DETENER offline permitía reinicio del watchdog y desincronización de UI (I07)

**Síntoma:** El 31/10/2026, con AHK-459, DETENER offline a las 16:29:24 apagó el servicio, pero el
watchdog lo reinició indebidamente a las 16:30:01. Al completar la parada remota a las 16:31:21, la
UI mostró Detenido con el servicio activo.

**Causa Raíz:** El cierre local esperaba Firebase; el watchdog no respetaba la parada voluntaria y la
finalización antigua podía sobrescribir el estado nuevo. D1, D2 y D4 se confirmaron físicamente. D3
(recuperación en vuelo sin invalidación) era un riesgo de código, no una variante física aislada. D5
(limpieza diferida) se verificó como mecanismo, sin demostrar dos motores GPS completos simultáneos.

**Solución (tarea I07):**
- Intención/generación compartida entre montajes e identidad por ejecución; DETENER invalida antes del
  primer await y las continuaciones/callbacks comprueban vigencia. El watchdog no reinicia un
  recorrido cancelado.
- `dispose` idempotente libera watch, heartbeat y keepAlive propios; las transiciones
  nativas se serializan sin esperar red.
- Tras éxito nativo se solicita la parada remota antes de liberar INICIAR, sin esperar
  ACK. Las respuestas antiguas solo diagnostican la operación; no modifican UI ni vuelven
  a escribir. Orden de solicitudes: A:true → A:false → B:true; no equivale a ordenar todos
  los ACK del SDK.
- Si falla el stop nativo no se declara éxito: INICIAR queda bloqueado y DETENER permite
  reintento. `PRO_TRACKING_STATE` sincroniza estado y resultados pendientes con la
  pantalla remontada.

**Archivos:** `Driver/src/screen/SendCoordinates.tsx` y cinco suites de `Driver/__tests__`. Sin cambios
de producción durante el cierre; según la auditoría reportada, `firebase_service.ts`, dependencias y
Android quedaron idénticos a main.

**Estado:** Corregido funcionalmente, validado e integrado/publicado (01/11/2026). Driver `9faaaf9`;
documentación técnica `d5c4d48`; fast-forward y publicación de ambos commits verificados en sus
respectivos `main` remotos. Se conservan las ramas `fix/i07-ciclo-vida-gps`.
- H1 A aprobado: parada local offline 19:23:52, confirmación 19:26:41 (169 s), sin rearranque hasta
  INICIAR manual 19:28:24 (~272 s); parada final 19:29:31, `isActive=false`.
- H1 B aprobado: A online 21:00:18, DETENER A offline 21:03:32, INICIAR B offline 21:05:36 antes
  del ACK A. Confirmación A 21:12:41 identificada como operación anterior, sin afectar B;
  `true` y timestamps actuales hasta DETENER B 21:14:17, luego `false` estable. REST cada
  ~3 s no observó un `false` transitorio de A: no se afirma haberlo visto.
- Ambos bloques cerraron sin servicio ni solicitudes GPS Driver y con `false`. No se
  requiere H2 adicional: B cubrió el inicio offline antes del ACK, A aportó ciclos/retornos y los
  tests cubren integración/remontajes, sin fallo nuevo. No se forzaron físicamente fallos
  nativos ni recuperación en vuelo; esa cobertura es automática y no valida una jornada de 8 horas.
- Regresión de cierre reportada: Jest 64/64, cinco suites, 26.59 s; `tsc --noEmit`, ESLint de los
  cinco tests y `git diff --check`: exit 0. `npm run lint` global falla por el único error
  preexistente `SendCoordinates.tsx:277:12`, `asignacionId` unused
  (`@typescript-eslint/no-unused-vars`); no se corrigió ni se oculta.
- Jest usado, sin cambiar `jest.config.js`: `npm test -- --runInBand
  --transformIgnorePatterns
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-background-actions)/)'
  --json --outputFile=<temporal>`. Resultado externo: `i07_close_jest_20261101.json`.
  Auditoría externa `i07_close_apk_audit.json`: ocho archivos propios (index.js y src) coinciden con el
  `sourcesContent` del sourcemap conservado y el hash del bundle compilado coincide con el
  APK. SHA-256 del APK aprobado:
  `3aead0a9855b6df5b146c5701bca9af542635297ea79a42cc8d45597fbcaece4`.

**Lección:** Parada local, solicitud remota y confirmación son hechos distintos. Un ACK tardío o un
heartbeat con timestamp nuevo no prueban nueva adquisición GPS. La promesa de usuario pendiente
evita el stop automático del wrapper al resolverla, pero no garantiza cierre HeadlessJS. Los tests
con wrapper real 4.1.0 y entrega controlada caracterizan el resolver global sobrescrito y
envolturas tardías pendientes; no reproducen un defecto del planificador Android ni eliminan ese
residual de la biblioteca. Los casos 012/013/019 conservan su diagnóstico histórico; el ciclo vigente
está en ARCHITECTURE.md §8.

**Referencias:**
- `C:/Users/matia/AppData/Local/Temp/opencode/i07_20261031_161839/INFORME_I07.md`
  (incidente previo).
- `C:/Users/matia/AppData/Local/Temp/opencode/h1_A_20261031_190246/INFORME_H1_BLOQUE_A.md`
  (aprobación parcial; pendientes resueltos con B).
- `C:/Users/matia/AppData/Local/Temp/opencode/h1_B_20261031_204257/INFORME_H1_BLOQUE_B.md`
  (veredicto físico final).

## CASO 021 — INICIAR offline no habilitaba el respaldo por la ruta `/\.info/connected` (I08)

**Síntoma:** El 01/11/2026, con AHK-459 y la asignación del día ya cargada, INICIAR sin red mostraba "No
se pudo validar la asignación…" y no iniciaba el servicio. Con red, el mismo recorrido iniciaba y
publicaba normalmente.

**Causa Raíz:** El chequeo de desconexión usaba `database().ref('/.info/connected')`. El SDK instalado
solo admite las rutas especiales sin barra inicial; la variante con `/` lanza una excepción de ruta
inválida. El `catch` del chequeo la absorbía y dejaba `offline = false`, de modo que la consulta
fallida por red nunca habilitaba el respaldo en memoria. El timeout de la consulta no era la causa.

**Solución (tarea I08):**
- Referencia corregida a `database().ref('.info/connected')` (una línea de producción). El
  mock de pruebas rechaza explícitamente la variante con `/` para que la regresión no vuelva a pasar.
- La validación al INICIAR usa `queryDailyAssignment()` con la fecha `America/Lima` del momento; una
  respuesta conocida como inválida revoca el respaldo. Solo una consulta fallida **con
  desconexión confirmada** permite iniciar con el respaldo del mismo conductor y fecha
  (ADR-028).
- `trackingIntent.run = { driverDni, busId }` conserva la identidad del recorrido para GPS
  y parada aunque la pantalla se remonte.
- Etiqueta de UI cambiada de «Compartiendo ubicación» a «Servicio de ubicación activo»:
  describe el servicio Android local, no afirma publicación de la última posición. Las
  aserciones de I07 e I08 conservaron su lógica `true`/`false`.

**Archivos:** `Driver/src/screen/SendCoordinates.tsx`,
`Driver/__tests__/SendCoordinates.assignment.test.tsx` (nueva suite I08, 33 pruebas) y
`Driver/__tests__/SendCoordinates.stop.test.tsx` (aserciones de etiqueta). No se agregaron estados,
listeners ni dependencias.

**Estado:** Corregido, validado físicamente, integrado y publicado. Driver `67fa362` está contenido en
`main` y en GitHub; documentación `5735fa8` publicada en `docs/main`. Estado actualizado al
03/11/2026; se conserva la rama `feat/i08-asignaciones-diarias`. AdminWeb I08 ya integrado/publicado
y desplegado desde `80a52bd`; no se requiere repetir el deploy de I08.
- El primer APK offline falló con el síntoma; se corrigió la ruta y se repitió con un APK
  nuevo, que inició, publicó tras reconectar y detuvo con `isActive=false` estable.
- Aprobado online: inicio 22:37:58 y parada 22:41:18.719, con publicaciones atribuidas a esa
  jornada.
- Aprobado offline (ruta B): INICIAR a las 23:05:56 sin red, reconexión con publicaciones y parada
  final 23:08:38.062. La regresión posterior quedó en `isActive=false`, sin servicio
  activo.
- Regresión de cierre: Jest 97/97 (seis suites; 64 de I07 + 33 de I08); `tsc --noEmit`,
  ESLint de los tests y `git diff --check`: exit 0. `npm run lint` global conserva el
  único error preexistente `asignacionId` unused en `SendCoordinates.tsx`; no se corrigió
  ni se oculta.
- Jest usado, sin cambiar `jest.config.js`: `node node_modules/jest/bin/jest.js
  --runInBand --transformIgnorePatterns
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-background-actions)/)'`.
- SHA-256 del APK validado físicamente:
  `e604c06891581a86844ce57a0216c38788a70f7b927161a6de63dcf5a8feb6ff`. Ese APK **no
  contiene** el microcambio de etiqueta posterior; no se generó otro APK para esa
  etiqueta.

**Limitaciones:**
- El respaldo offline es en memoria: no sobrevive al reinicio del proceso ni al cambio de
  día.
- No detecta altas, cancelaciones ni reasignaciones administrativas ocurridas durante la
  desconexión; al reconectar, la siguiente validación manda.
- La ruta offline se probó sin desplazamiento físico; el remontaje durante el recorrido se
  cubre con Jest, no con una prueba física.
- No se observó la ruta A (consulta válida al iniciar) en este bloque; la cobertura es automática.
- No se forzaron fallos nativos ni se validó una jornada de 8 horas.

**Lección:** Un `catch` que solo registra o degrada un flag puede convertir un error de contrato del SDK
en una decisión de negocio equivocada. Las rutas `.info` no son nodos de datos: no llevan `/`
inicial y no confirman entregas remotas. Un timeout aislado no prueba desconexión; el respaldo
offline debe ser acotado, revocable y explícito sobre lo que no puede observar.

**Referencias:**
- `C:/Users/matia/AppData/Local/Temp/opencode/i08_20261101_223147/INFORME_REPETICION_OFFLINE_I08.md`
- `C:/Users/matia/AppData/Local/Temp/opencode/i08_20261101_223147/i08_fix_baseline.xml`
- `C:/Users/matia/AppData/Local/Temp/opencode/i08_20261101_223147/i08_fix_offline.xml`
- `C:/Users/matia/AppData/Local/Temp/opencode/i08_20261101_223147/i08_fix_final.xml`

## CASO 022 — Nombre y DNI en el panel de diagnóstico y UID de Crashlytics sin limpiar (I11)

**Síntoma:** El panel técnico de la DriverApp mostraba el nombre y apellidos del conductor al
identificarlo, el DNI completo cuando no había registro en `/choferes` y un prefijo del DNI al
iniciar el motor. Además, `DriverApp.tsx` configuraba `crashlytics().setUserId(uid)` al
autenticarse, pero no solicitaba limpieza al cerrar sesión ni al arrancar sin usuario.

**Causa Raíz:** Los tres mensajes interpolaban datos personales que no aportaban diagnóstico operativo.
La llamada de Crashlytics solo cubría la rama con usuario; la rama nula actualizaba la UI, pero no
el identificador del SDK.

**Solución (tarea I11):**
- `Motor iniciado`, `Conductor identificado` y `Perfil del conductor no disponible`
  reemplazan los tres mensajes personales. Se conservan el nivel del log y el registro del
  problema.
- `uidChofer` dejó de desestructurarse en `locationTask` porque ya no se imprimía; el
  payload del servicio y la identidad del recorrido no cambiaron.
- `syncCrashlyticsUser()` solicita `setUserId(uid)` con usuario autenticado y
  `setUserId('')` con usuario nulo, incluido el arranque sin sesión. La navegación no
  espera la promesa y los fallos síncronos o asíncronos del SDK quedan contenidos
  localmente.
- Se conservaron los diagnósticos de GPS, heartbeat, Firebase, bus, asignaciones,
  permisos, watchdog, parada local/remota y los objetos de error con sus stack traces. No
  se agregó sanitización general ni una cola de reintentos.

**Archivos:** `Driver/src/screen/SendCoordinates.tsx`, `Driver/src/DriverApp.tsx`,
`Driver/__tests__/SendCoordinates.privacy.test.tsx` (5 pruebas) y
`Driver/__tests__/DriverApp.crashlytics.test.tsx` (5 pruebas).

**Estado:** Implementado, probado, integrado y publicado (02/11/2026). Driver: `4a05e41`; integración
fast-forward en `Driver/main` y publicación verificada. La rama `fix/i11-limpieza-logs` se conserva.

**Verificación:**
- 10/10 pruebas nuevas aprobadas.
- Composición A — cierre I11: 120/120 en 9 suites. Incluye las 110 pruebas previas, de las
  cuales 13 pertenecen a la suite no versionada del punto 2.5
  (`__tests__/SendCoordinates.logout.test.tsx`), conservada intacta y fuera del commit de
  I11. Cobertura propia de I11: 107 pruebas versionadas (97 previas más 10 nuevas).
- `tsc --noEmit`, ESLint de los archivos de I11 y `git diff --check`: correctos. Se
  conserva el único error preexistente `asignacionId` unused en `SendCoordinates.tsx`.
- Revisión visual reportada por el usuario en emulador debug conectado a Metro: el panel
  mostró «Motor iniciado» sin DNI. No se iniciaron recorridos ni se publicaron coordenadas
  durante el cierre.

**Limitaciones:**
- Las pruebas verifican las solicitudes de `setUserId` y el comportamiento observable de
  la app, no la aplicación nativa del UID ni la recepción efectiva de reportes en
  Crashlytics.
- La limpieza no elimina reportes históricos.
- Los objetos de error y sus stack traces no se sanitizaron: podrían contener datos
  sensibles según su origen y requieren evaluación separada.
- No se añadió una cola que garantice el orden de finalización nativa de `setUserId`; solo
  se verificó el orden de solicitudes.

**Lección:** Un dato útil para el negocio no es automáticamente útil para el diagnóstico. La identidad
interna debe conservarse para operar, pero el panel y la telemetría deben exponer solo lo necesario.
Limpiar un identificador de Crashlytics es una acción de alcance futuro: no reescribe reportes
pasados.

**Referencias:**
- `ARCHITECTURE.md` (§7, servicios externos)
- `DECISIONS.md` (ADR-029)
- `ARCHITECTURE.md` (§9, límites)
- `Driver/__tests__/SendCoordinates.logout.test.tsx` (punto 2.5, no forma parte de I11)

### Composición B — estabilización posterior (03/11/2026)

La auditoría posterior sobre Driver `9047dca` aprobó **120/120 pruebas versionadas en nueve
suites**, excluyendo el test protegido no rastreado del punto 2.5. No confundir este total con las
120 del cierre histórico de I11 (Composición A: 107 versionadas + 13 del test no versionado).
TypeScript aprobado; lint conserva `asignacionId` sin uso. El runner actual requiere incluir
`react-native-vector-icons` además de Background Actions:

```powershell
node node_modules/jest/bin/jest.js --runInBand --testPathIgnorePatterns SendCoordinates.logout.test.tsx --transformIgnorePatterns 'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-background-actions|react-native-vector-icons)/)'
```

No se modifica código Driver ni se repiten H1 A/B. El hash histórico del test protegido es
`364561ad4b686c128ec69599ef4b47492f955160`; no puede revalidarse en este checkout porque el archivo
no está presente ni trackeado. Se conserva como referencia de la Composición A. La jornada de ~8 h
continúa pendiente.

## Hallazgos de auditoría pendientes (sin corrección)

Hallazgos detectados durante la validación de C4.2. Se registran por separado porque no fueron
corregidos en esa tarea y requieren evaluación propia.

### Hallazgo A — Cerrar la app desde recientes con tracking activo desincroniza la UI
Si el conductor inicia el recorrido, desliza la app desde recientes (el servicio sigue vivo por
`stopWithTask="false"` y escribe en RTDB) y la reabre, la UI muestra "INICIAR RECORRIDO" (estado por
defecto al re-montar) aunque el servicio sigue transmitiendo; el botón INICIAR no responde. →
Convertido en la tarea **C4.7** en el backlog (`MVP.md`). Sonda previa validada en el Motorola (G24
Power): tras INICIAR → quitar de recientes → reabrir, `BackgroundJob.isRunning()` devuelve
**`true`** con el servicio vivo (mismo proceso, singleton JS conservado). Fuente de verdad fiable
para la corrección. → **Resuelto por C4.7** (ver CASO 013): al re-montar `SendCoordinates`, si
`isRunning()` es `true` se restaura `isSending` y la UI recupera "Compartiendo ubicación" + DETENER
RECORRIDO.

### Hallazgo B — `isActive=true` con timestamp congelado — RESUELTO (22/08)
Puede quedar `isActive=true` en RTDB mientras el servicio está muerto y el timestamp deja de
actualizarse. Validar en C4.6/T1 que BurritoUserApp oculta el bus por inactividad; si no lo oculta,
abrir subtarea bloqueante. → **Resuelto por diseño**: el heartbeat T4.1 garantiza timestamp fresco
cada 8 s (CASO 019, verificado en campo con deltas de 8003–8005 ms) y la UserApp oculta el bus por
OFFLINE (estrategia C, ADR-020) cuando los datos caducan. Ambas piezas fusionadas a main (`99eafa0`,
`916f123`, merge `aed7bf1`).

### Hallazgo C — Logout/revocación remota con tracking activo (limitación aceptada)

CERRAR SESIÓN (o la revocación remota) con el servicio nativo vivo desmonta la UI, pero no detiene
el tracking: no hay cleanup en unmount ni stop implícito. Es una **limitación conocida y aceptada
para el MVP** según ADR-026: cerrar sesión es independiente de DETENER RECORRIDO y no debe alterar
el servicio de forma silenciosa. No está solucionado y no se convierte automáticamente en una tarea
nueva: el conductor debe detener el recorrido antes de cerrar sesión. Discrepancia pendiente:
`MVP.md:106` todavía pide evaluar este hallazgo; debe resolverse en ese documento.
