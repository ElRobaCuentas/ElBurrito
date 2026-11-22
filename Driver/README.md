# BurritoDriverApp

Aplicación móvil para los conductores del sistema de transporte
universitario "Oficina de Transportes" de la UNMSM. Captura coordenadas
GPS y las transmite en tiempo real a Firebase Realtime Database.

Es una de las aplicaciones del ecosistema con permisos de escritura sobre
los nodos de tracking. Está diseñada para ejecutarse en dispositivos
Android dedicados instalados en los buses.

**La DriverApp es conductor-only**: su única función es capturar GPS y
escribirlo en RTDB. No incluye panel administrativo. La gestión de
conductores, buses y asignaciones se realiza exclusivamente desde
**AdminWeb**.

## Stack Principal

| Capa | Tecnología |
|------|-----------|
| Framework | React Native 0.83.1 (CLI) |
| Lenguaje | TypeScript |
| Base de datos | Firebase Realtime Database + Auth (23.8.x) |
| Foreground Service | `react-native-background-actions` 4.1.0 |
| Geolocalización | `@react-native-community/geolocation` 3.4.x |

## Requisitos de Plataforma

- **SDK de Android**: `compileSdkVersion` 36 y `targetSdkVersion` 34
  (Android 14), según `android/build.gradle`. El target no es la versión
  mínima de instalación.
- **Foreground Service**: el servicio de rastreo utiliza el tipo
  `location`, que debe declararse en tres lugares:
  - `AndroidManifest.xml`: `android:foregroundServiceType="location"`
  - Permisos: `android.permission.FOREGROUND_SERVICE_LOCATION`
  - Tiempo de ejecución: `foregroundServiceType: ['location']`
- **Permisos obligatorios**:
  - `POST_NOTIFICATIONS` (API 33+)
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
- **Min SDK**: 24
- **Dispositivo físico**: el emulador no proporciona GPS real ni
  foreground services fiables.

## Setup

```bash
npm install
```

Se necesita `android/app/google-services.json` correspondiente al proyecto
Firebase usado para desarrollo; no asumir que una copia contiene una
configuración válida para otro entorno.

No se requiere archivo `.env`. Las credenciales de Firebase se
configuran exclusivamente mediante `google-services.json`.

**iOS no está soportado.** El Foreground Service tipo `location` depende
de APIs nativas de Android que no existen en iOS. Esta app es
Android-only y no está probada en iOS.

## Scripts

| Acción | Comando |
|--------|---------|
| Metro dev server | `npm start` |
| Compilar Android | `npm run android` |
| Tests | `npm test -- --runInBand --ci` |
| Lint | `npm run lint` |

La suite estándar es `npm test -- --runInBand --ci` (9 suites, 120 pruebas).
`jest.config.js` contiene las excepciones de transformación para React Native y
las dependencias ESM; no requiere flags adicionales.

## Estructura del Código

```
src/
├── DriverApp.tsx              # Entrypoint, auth gate
├── screen/
│   ├── LoginDriverScreen.tsx  # Login con DNI
│   └── SendCoordinates.tsx    # Tracking, permisos, GPS, debug console
└── services/
    └── firebase_service.ts    # Escritura a RTDB (tracking)
```

## Flujo de Tracking

```
Login con DNI
    ↓
Consulta /asignaciones → obtiene busId
    ↓
Solicita permisos Android
    ↓
Inicia Foreground Service (tipo location)
    ↓
watchPosition captura GPS cada ~3s
    ↓
Firebase RTDB (/ubicacion_buses/{busId})
    ↓
UserApp (vía listener propio)
```

Para el detalle del payload y la estructura del nodo de tracking,
consultar el [esquema Firebase](../docs/architecture/firebase-schema.md).

## Estado de Implementación

- Login con DNI + contraseña.
- Asignación automática de bus desde `/asignaciones`.
- Rastreo GPS continuo con foreground service.
- Servicio de ubicación con las declaraciones requeridas para Android 14;
  esto no garantiza compatibilidad con todos los dispositivos.
- Tracking en segundo plano con heartbeat y watchdog. La conexión, los
  permisos o la terminación del proceso pueden interrumpir las publicaciones;
  el watchdog intenta recuperar fallos mientras el proceso sigue vivo.

**Pendiente**: geofencing, control de turnos.

## Documentación Relacionada

La documentación compartida vive en `../docs/`, dentro del monorepo. El
reporte de recuperación de compilación pertenece a este componente y conserva
el contexto histórico del incidente, no una certificación de builds actuales.

| Documento | Propósito |
|-----------|-----------|
| [Versionado y publicación](../docs/engineering/versioning-and-releases.md) | Procedimiento previsto de entregas y actualizaciones mediante APK privada. |
| [Recuperación de compilación](docs/build-recovery-report.md) | Incidente de julio de 2026 y workaround de geolocation. |
| [Arquitectura](../docs/architecture/overview.md) | Flujo de datos y ciclo de vida del tracking. |
| [Esquema Firebase](../docs/architecture/firebase-schema.md) | Nodos y payloads de la RTDB. |
| [AGENTS.md](AGENTS.md) | Convenciones e instrucciones para asistentes IA. |
| [Roadmap](../docs/planning/roadmap.md) | Trabajo planificado después del MVP. |
| [Diagnóstico](../docs/diagnostics/troubleshooting.md) | Problemas conocidos. |
| [Decisiones](../docs/adr/README.md) | Decisiones de arquitectura (ADR). |
| [Bugs resueltos](../docs/diagnostics/resolved-bugs/) | Historial de correcciones. |
