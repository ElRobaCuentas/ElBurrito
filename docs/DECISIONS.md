# Decisiones de Arquitectura — El Burrito

## 1. Propósito

Este documento registra las decisiones de arquitectura (ADR) relevantes
del ecosistema. Cada entrada explica el problema, las alternativas
consideradas y el razonamiento detrás de la solución adoptada.

No es un manual técnico ni un changelog. Las decisiones aquí documentadas
responden a la pregunta: **¿por qué está hecho así?**

La implementación actual, la evidencia de integración y los límites de
validación se indican cuando aportan contexto a la decisión; los contratos
detallados y los procedimientos viven en los documentos referenciados.

## 2. Convenciones del Documento

Cada ADR conserva la decisión original y, cuando corresponde, notas de
evolución posteriores. La estructura de referencia es:

- **Estado**: situación actual de la decisión (`Vigente`, `Sustituida`,
  `Experimental`, `Pendiente` o `Histórica`).
- **Contexto**: situación que originó la decisión.
- **Decisión**: qué se decidió y cómo se implementó.
- **Alternativas consideradas**: opciones evaluadas y descartadas.
- **Consecuencias**: impacto positivo, negativo y límites.
- **Referencias**: documentos relacionados.

Los estados del índice describen la vigencia de la decisión. Los cuerpos
conservan el estado histórico (`Aceptada`, `Planeada`, etc.) cuando forma
parte del registro original. Los estados no describen el grado de
implementación ni la validación física: una integración en Git no acredita
una prueba de campo, y una decisión aceptada no convierte por sí sola una
funcionalidad planificada en implementada.

## 3. Índice de decisiones

| ADR | Tema | Estado actual |
|---|---|---|
| ADR-003 | Persistencia local de Firebase | Vigente, con precisión |
| ADR-004 | Arquitectura serverless directa | Vigente |
| ADR-005 | Estado con Zustand | Vigente |
| ADR-006 | Separación de apps móviles | Vigente, ampliada por ADR-025 |
| ADR-007 | Comunicación por RTDB | Vigente |
| ADR-008 | Foreground Service | Vigente |
| ADR-009 | Autenticación segmentada por roles | Sustituida por ADR-017 y ADR-025 |
| ADR-010 | Gestión manual del tracking | Sustituida por ADR-026 |
| ADR-011 | Instancia secundaria de Auth | Sustituida por ADR-025 |
| ADR-012 | DriverApp solo Android | Vigente |
| ADR-013 | Geofencing con Punto Cero Dinámico | Pendiente (post-MVP) |
| ADR-014 | Backend propio | Pendiente (visión, sin ejecución aprobada) |
| ADR-015 | Dashboard web de flota y analítica | Pendiente; administración parcial en AdminWeb |
| ADR-016 | Listener multi-bus | Vigente |
| ADR-017 | Panel admin en DriverApp y autorización UID | Sustituida parcialmente por ADR-025; autorización UID vigente |
| ADR-018 | Inicialización asíncrona de SecondaryApp | Histórica; implementación sustituida por ADR-025 |
| ADR-019 | Heartbeat de presencia | Vigente, validación actualizada |
| ADR-020 | Estrategia C de movimiento | Experimental |
| ADR-021 | Splash nativo único | Vigente |
| ADR-022 | Retiro de «Seguir Bus» | Vigente |
| ADR-023 | Autorización GPS por UID→DNI | Vigente, alcance limitado |
| ADR-024 | Auditoría de asignaciones y «desactivar» | Vigente, con evolución |
| ADR-025 | Migración a AdminWeb y dominios por rol | Vigente |
| ADR-026 | Separación detener recorrido/logout | Vigente, con evolución I07 |
| ADR-027 | Turnos informativos y un bus por conductor/fecha | Vigente |
| ADR-028 | Validación diaria y respaldo offline | Vigente, con precisión |
| ADR-029 | Minimización de datos y Crashlytics | Vigente |
| ADR-030 | Tolerancia a timestamps futuros | Vigente; integrada en `main`, validación física pendiente |

## 4. Decisiones

**[ADR-003–011: fundamentos del ecosistema](DECISIONS-003-011.md)**

### ADR-003: Desactivación de persistencia local en Firebase

[Consultar sección](DECISIONS-003-011.md#adr-003-desactivación-de-persistencia-local-en-firebase).

### ADR-004: Arquitectura serverless directa (sin backend intermedio)

[Consultar sección](DECISIONS-003-011.md#adr-004-arquitectura-serverless-directa-sin-backend-intermedio).

### ADR-005: Manejo de estado con Zustand en lugar de Context o Redux

[Consultar sección](DECISIONS-003-011.md#adr-005-manejo-de-estado-con-zustand-en-lugar-de-context-o-redux).

### ADR-006: Separación del ecosistema en dos aplicaciones independientes

[Consultar sección](DECISIONS-003-011.md#adr-006-separación-del-ecosistema-en-dos-aplicaciones-independientes).

### ADR-007: Comunicación desacoplada mediante Firebase Realtime Database

[Consultar sección](DECISIONS-003-011.md#adr-007-comunicación-desacoplada-mediante-firebase-realtime-database).

### ADR-008: Foreground Service como requisito obligatorio de plataforma

[Consultar sección](DECISIONS-003-011.md#adr-008-foreground-service-como-requisito-obligatorio-de-plataforma).

### ADR-009: Autenticación segmentada por roles

[Consultar sección](DECISIONS-003-011.md#adr-009-autenticación-segmentada-por-roles).

### ADR-010: Gestión manual del ciclo de vida del tracking

[Consultar sección](DECISIONS-003-011.md#adr-010-gestión-manual-del-ciclo-de-vida-del-tracking).

### ADR-011: Instancia secundaria de Firebase Auth para CRUD admin

[Consultar sección](DECISIONS-003-011.md#adr-011-instancia-secundaria-de-firebase-auth-para-crud-admin).

**[ADR-012–020: evolución de plataformas, administración y tracking](DECISIONS-012-020.md)**

### ADR-012: DriverApp implementada únicamente para Android

[Consultar sección](DECISIONS-012-020.md#adr-012-driverapp-implementada-únicamente-para-android).

### ADR-013: Geofencing con Punto Cero Dinámico

[Consultar sección](DECISIONS-012-020.md#adr-013-geofencing-con-punto-cero-dinámico).

### ADR-014: Backend propio

[Consultar sección](DECISIONS-012-020.md#adr-014-backend-propio).

### ADR-015: Dashboard Web de Monitoreo y Analítica

[Consultar sección](DECISIONS-012-020.md#adr-015-dashboard-web-de-monitoreo-y-analítica).

### ADR-016: Migración a listener multi-bus con fallback al primer bus activo

[Consultar sección](DECISIONS-012-020.md#adr-016-migración-a-listener-multi-bus-con-fallback-al-primer-bus-activo).

### ADR-017: Migración del panel admin a DriverApp + autorización por auth.uid

[Consultar sección](DECISIONS-012-020.md#adr-017-migración-del-panel-admin-a-driverapp--autorización-por-authuid).

### ADR-018: Corrección de inicialización asíncrona de SecondaryApp

[Consultar sección](DECISIONS-012-020.md#adr-018-corrección-de-inicialización-asíncrona-de-secondaryapp).

### ADR-019: Heartbeat de presencia en la DriverApp (T4.1)

[Consultar sección](DECISIONS-012-020.md#adr-019-heartbeat-de-presencia-en-la-driverapp-t41).

### ADR-020: C4.6 — Estrategia C experimental para MOVIMIENTO/PARADERO

[Consultar sección](DECISIONS-012-020.md#adr-020-c46--estrategia-c-experimental-para-movimientoparadero).

**[ADR-021–026: experiencia, autorización y gestión operativa](DECISIONS-021-026.md)**

### ADR-021: Splash nativo único (react-native-bootsplash) en lugar de AnimatedSplash

[Consultar sección](DECISIONS-021-026.md#adr-021-splash-nativo-único-react-native-bootsplash-en-lugar-de-animatedsplash).

### ADR-022: Desactivación de la funcionalidad "Seguir Bus" en la UserApp

[Consultar sección](DECISIONS-021-026.md#adr-022-desactivación-de-la-funcionalidad-seguir-bus-en-la-userapp).

### ADR-023: Autorización de escritura en `/ubicacion_buses` por vínculo uid→DNI (`/choferes_uids`)

[Consultar sección](DECISIONS-021-026.md#adr-023-autorización-de-escritura-en-ubicacion_buses-por-vínculo-uiddni-choferes_uids).

### ADR-024: Auditoría mínima en `/asignaciones` (`createdAt` epoch + `createdBy` UID) y semántica de "desactivar"

[Consultar sección](DECISIONS-021-026.md#adr-024-auditoría-mínima-en-asignaciones-createdat-epoch--createdby-uid-y-semántica-de-desactivar).

### ADR-025: Migración de la administración a AdminWeb y separación de dominios de correo por rol

[Consultar sección](DECISIONS-021-026.md#adr-025-migración-de-la-administración-a-adminweb-y-separación-de-dominios-de-correo-por-rol).

### ADR-026: Separación de "Detener recorrido" y "Cerrar sesión"

[Consultar sección](DECISIONS-021-026.md#adr-026-separación-de-detener-recorrido-y-cerrar-sesión).

**[ADR-027–030: asignaciones, diagnóstico y recepción](DECISIONS-027-030.md)**

### ADR-027: Asignaciones con múltiples turnos informativos y un solo bus por conductor/fecha

[Consultar sección](DECISIONS-027-030.md#adr-027-asignaciones-con-múltiples-turnos-informativos-y-un-solo-bus-por-conductorfecha).

### ADR-028: Validación diaria y respaldo offline acotado de la asignación en BurritoDriverApp

[Consultar sección](DECISIONS-027-030.md#adr-028-validación-diaria-y-respaldo-offline-acotado-de-la-asignación-en-burritodriverapp).

### ADR-029: Minimización de datos personales en diagnóstico y limpieza del UID de Crashlytics

[Consultar sección](DECISIONS-027-030.md#adr-029-minimización-de-datos-personales-en-diagnóstico-y-limpieza-del-uid-de-crashlytics).

### ADR-030: Tolerancia de cinco minutos para timestamps futuros de recepción (I06-B)

[Consultar sección](DECISIONS-027-030.md#adr-030-tolerancia-de-cinco-minutos-para-timestamps-futuros-de-recepción-i06-b).

## Referencias

| Documento | Relación |
|-----------|----------|
| `ARCHITECTURE.md` | Visión general, flujo de datos, ciclo de vida y componentes. |
| `FIREBASE_SCHEMA.md` | Estructura de nodos impactada por estas decisiones. |
| `TROUBLESHOOTING.md` | Problemas derivados de estas decisiones. |
| `ROADMAP.md` | Planificación post-MVP y referencias a las ADR planeadas. |
| `BUGS_RESUELTOS/` | Bugs resueltos que originaron decisiones arquitectónicas. |
| `User/README.md` | Setup y funcionalidad de UserApp. |
| `Driver/README.md` | Setup y funcionalidad de DriverApp. |
| `User/AGENTS.md` | Reglas de trabajo para IA en UserApp. |
| `Driver/AGENTS.md` | Reglas de trabajo para IA en DriverApp. |
