# BurritoDriverApp — AGENTS.md

## 1. Alcance

Esta app es un **productor de GPS Android**: captura coordenadas y las escribe
en Firebase RTDB. Las reglas comunes están en `../AGENTS.md` y el procedimiento
en `../FLUJO_DE_TRABAJO.md`; consultalos antes de modificar código. Si no están
disponibles, informalo y no asumas que fueron cargados.

Un error silencioso aquí no produce un crash: el bus simplemente desaparece del
mapa de los estudiantes. Ante la duda: modificar menos, preguntar antes de
asumir, mantener el ciclo de tracking intacto y no hacer refactors no
solicitados.

---

## 2. Comandos

| Acción | Comando |
|--------|---------|
| Instalar dependencias | `npm install` |
| Iniciar Metro | `npm start` |
| Compilar Android | `npm run android` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Logs Android | `adb logcat \| grep RNBackground` |
| Formatear | `npx prettier --write <file>` |

Prettier: `singleQuote`, `arrowParens: 'avoid'`, `trailingComma: 'all'`.
No hay script de typecheck ni archivo `.env`.

---

## 3. Arquitectura mínima

```
index.js → DriverApp.tsx (auth gate)
         → LoginDriverScreen (sin sesión) | SendCoordinates (con sesión)
```

| Archivo | Rol |
|---------|-----|
| `SendCoordinates.tsx` | **Crítico**: tracking, permisos, GPS, debug |
| `firebase_service.ts` | Escritura RTDB |

La app consulta `/asignaciones` y escribe en `/ubicacion_buses/{busId}`. Ciclo
completo: `../docs/ARCHITECTURE.md` §8; payloads: `../docs/FIREBASE_SCHEMA.md`.

Ciclo: login → `fetchAssignment` → `startProcess` → permisos Android →
`BackgroundJob.start` → `locationTask` → `updateBusLocation` → `stopProcess`.

---

## 4. Reglas críticas

### 4.1 Ciclo de tracking

- **No modifiques** `locationTask` sin entender el ciclo: corre dentro del
  `BackgroundJob` y sus errores dejan el tracking inoperativo sin aviso en la
  UI. Leé `../docs/ARCHITECTURE.md` §8 antes.
- **No confíes** en un cierre limpio: no hay `onDisconnect`. DETENER RECORRIDO es
  la única fuente de verdad para `isActive: false`. Si el proceso muere de forma
  anormal, `isActive` puede quedar en `true`; el watchdog reintenta dentro del
  proceso, pero no cubre la terminación del proceso.
- `stopProcess` no cierra sesión. Cerrar sesión es una acción independiente con
  confirmación por Alert.

### 4.2 Foreground Service

- Requiere `foregroundServiceType="location"` en AndroidManifest, permisos y
  opciones JS. Si falta uno, Android 14 crashea en runtime.
- **No modifiques** `stopWithTask="false"`: evita que Android mate el servicio al
  cerrar la app sin escribir `isActive: false`.

### 4.3 Permisos

- **No cambies el orden**: `POST_NOTIFICATIONS` → `ACCESS_FINE_LOCATION` →
  `ACCESS_BACKGROUND_LOCATION`, cada uno con early return. Alterar la secuencia
  puede omitir un permiso.
- **No elimines** la validación de `busId`: sin ella el servicio arranca sin bus
  asignado y escribe en `/ubicacion_buses/null`.

### 4.4 Configuración GPS

- **No modifiques** los valores sin justificación: `interval: 3000`,
  `enableHighAccuracy: true`. Impacta batería, precisión y frecuencia.

### 4.5 Escritura y persistencia

- **No reactives** persistence (ADR-003): Firebase reenvía ubicaciones viejas en
  ráfaga al reconectar.
- **No agregues** una cola de reintentos: sin persistencia, el siguiente pulso
  (3 s) reemplaza la posición fallida; una cola reintroduce la ráfaga.
- **No abras** una segunda ruta de escritura: GPS y heartbeat deben usar el mismo
  `writeLocation()`.

### 4.6 Heartbeat y watchdog

- **No elimines ni muevas** el heartbeat de 8 s (`HEARTBEAT_INTERVAL_MS`, dentro
  de `locationTask`). Garantiza publicaciones periódicas cuando el GPS no emite
  (bus quieto); sin él, el bus cruza el umbral de expiración de UserApp (C4.6) y
  el watchdog puede reiniciar en falso. Ver ADR-019.
- **No elimines** `keepAlive` ni el watchdog de C3. `keepAlive` vigila que el
  `BackgroundJob` siga corriendo; el watchdog detecta 30 s sin pulso
  `PRO_LOCATION_PULSE`, reinicia y, si falla, detiene la UI y avisa al conductor
  (Alert + banner). No alterar sin pasar por el backlog.

### 4.7 Autenticación

- `SendCoordinates.tsx` importa `auth` de forma estática
  (`import auth from '@react-native-firebase/auth'`). El `import()` dinámico en
  `stopProcess` se eliminó al separar el logout en un botón independiente. No
  revertir a import dinámico.

### 4.8 Marcadores de historial

- **No elimines** los comentarios `// T11:` de `SendCoordinates.tsx`: rastrean
  refactors anteriores en líneas críticas.

---

## 5. Verificación

- `npm run lint` sin errores nuevos.
- Sin `console.log` temporales.
- Ciclo de tracking intacto (login → start → stop → logout).
- Foreground Service consistente en los tres lugares si se modificó.
- Documentación sincronizada según `../AGENTS.md` §7.
