# MVP — El Burrito

> **Documento operativo del MVP: qué falta, cómo se cierra y qué sigue.**
> Lo ya resuelto (tareas terminadas, bugs, seguridad, robustez) está en
> **`docs/BUGS_RESUELTOS/`** y **`docs/DECISIONS.md`**; la evidencia de cambios, en Git. El detalle técnico profundo vive en `docs/`
> (`BUGS_RESUELTOS/`, `DECISIONS.md`, `FIREBASE_SCHEMA.md`). La planificación posterior al MVP vive en **`docs/ROADMAP.md`**.

---

## 0. Definición del MVP

El MVP se considera terminado únicamente cuando se cumplen simultáneamente los siguientes criterios:

- [ ] Un conductor puede operar el sistema durante una jornada completa.
- [ ] Los estudiantes pueden visualizar la ubicación en tiempo real.
- [ ] No existe intervención técnica durante la operación.
- [ ] Los errores críticos encontrados durante el testing fueron corregidos.
- [ ] La documentación refleja el estado real del código.
- [ ] El backlog no contiene tareas críticas pendientes.

Todo lo demás pertenece al Post-MVP.

### Definición funcional

El MVP de El Burrito estará terminado cuando **un conductor pueda operar un bus durante una jornada completa y cualquier estudiante pueda ver en tiempo real su ubicación desde la aplicación, con una experiencia estable, segura y sin intervención técnica.**

### Roles del MVP

| Rol | Debe poder hacer | Sin necesidad de |
|-----|------------------|------------------|
| Conductor | Iniciar sesión, obtener su asignación automáticamente, comenzar el recorrido, enviar ubicación durante horas sin detenerse, recuperarse de pérdidas temporales de red, finalizar correctamente | Abrir Firebase Console, reiniciar la app, intervención técnica |
| Estudiante | Iniciar sesión, ver el mapa, ver el bus correctamente, ver posición actualizada en tiempo real, ver estado real del servicio (en ruta/detenido/sin señal), no bloquearse durante el uso | Contactar al desarrollador, recargar datos |
| Administrador | Crear conductores, crear buses, crear asignaciones para hoy o fechas futuras (uno o varios turnos), mantener operativo el sistema | Editar Firebase Console, escribir código |

### Operación durante la jornada

- Se usa un único teléfono compartido entre conductores durante toda la jornada.
- La sesión de Firebase Authentication iniciada al comienzo permanece abierta; los relevos no requieren cerrar sesión ni reiniciar la aplicación.
- La cuenta autenticada no identifica necesariamente al conductor físico del momento.
- No existe autenticación individual por turno ni se crean cuentas operativas adicionales.
- El relevo no finaliza el recorrido: no es necesario detenerlo al cambiar de conductor. Solo el último conductor presiona «Detener recorrido» al terminar la jornada (ADR-026).

### Metodología de trabajo

Cada tarea del backlog se clasifica por tipo; el flujo a aplicar depende del tipo:

| Tipo | Definición | Flujo |
|------|-----------|-------|
| **A — Microtarea** (5-30 min) | Cambiar una constante, quitar un debug, corregir un README, cambiar una ruta | Implementar → Compilar → Commit |
| **B — Tarea normal** | Corregir `keepAlive`, arreglar `existeAdministrador`, timeout | Auditar → Implementar → Self Review → Compilar → Prueba manual → Commit |
| **C — Cambio arquitectónico** | MultiBus, Dashboard Web, Control de turnos, Geofencing | Auditar → Diseñar → Implementar → Self Review → Review externo → Correcciones → Compilar → Testing → Actualizar documentación → Revisión arquitectura → Commit |

Los detalles y prompts de cada etapa viven en `FLUJO_DE_TRABAJO.md`.

No se inicia una nueva tarea mientras la actual no haya finalizado completamente.

---

## 1. Estado actual

- El núcleo del MVP está operativo y tiene pruebas físicas parciales; **no se acredita una jornada completa de ~8 h**.
- Integrado en `main`: Driver I07 `9faaaf9`, I08 `67fa362` e I11 `4a05e41`; User I04 `5bc3a83` e I06-B `011a4b6`; AdminWeb I08 `80a52bd` y foco de `Modal.tsx` `5e66d46`. Los remotos están sincronizados.
- Última regresión registrada: User 124/124 pruebas en 10 suites; Driver 120/120 en 9 suites. No sustituye la prueba de jornada.
- I06-A permanece aceptada. I09, I10 y P06 están fuera del alcance de cierre del MVP; su planificación vive en `docs/ROADMAP.md` (Tareas postergadas).
- **Riesgo vigente del piloto — W12:** desactivar un conductor no revoca su autorización de escritura RTDB. Es la semántica aceptada de elegibilidad futura (ADR-024), no una detención en caliente. La revisión antes de producción está en `docs/ROADMAP.md` (Condiciones de pre-release y publicación).
- B2 (`dc58daf`) está aislado en su rama de emuladores; no es requisito del MVP.
- Deploy de AdminWeb posterior al foco `5e66d46`: no reverificado.
- **Pendientes de cierre: T1.**

---

## 2. Backlog pendiente

> Las tareas terminadas y su evidencia están en `docs/BUGS_RESUELTOS/`,
> `docs/DECISIONS.md` y el historial de Git. Aquí solo se listan las tareas pendientes o futuras del MVP.

Criterio único de prioridad: **¿esta tarea acerca o aleja el objetivo del MVP?**

Regla del backlog: si una tarea no impide que el MVP funcione correctamente durante el piloto, pertenece al Post-MVP.

Estados: `Pendiente` / `En progreso` / `En revisión` / `Terminado` / `Pospuesto (Pre-Release)`.

### T1 — Ciclo completo DriverApp (incluye prueba de resistencia de turno completo)

**Descripción**

Es la validación más importante del MVP: un conductor usa la aplicación durante una jornada completa real. Se comprueba que puede iniciar sesión, recibir su bus asignado, enviar su ubicación durante horas (incluso con la pantalla apagada y el servicio siempre activo) y finalizar correctamente. También se prueban situaciones como el GPS apagado o cerrar y reabrir la aplicación. Su objetivo es demostrar que el sistema funciona de forma estable sin intervención técnica.

**Información general**

- App: BurritoDriverApp
- Tipo: B
- Prioridad: 3 — Testing manual
- Duración objetivo: aproximadamente **8 h de operación**; pruebas más cortas son parciales
- Depende de: C1, C3, C4 (C2 queda fuera: los paneles de debug son útiles durante el piloto y no afectan la estabilidad)
- Estado: **Pendiente**

**Definición de Done**

- Login → asignación → tracking → stop → logout sin intervención técnica.
- **Prueba de resistencia**: tracking continuo aproximadamente **8 horas**; pantalla bloqueada la mayor parte; movimiento, paradas prolongadas, **relevos sin logout ni reinicio** y pérdida/recuperación de conectividad. Mantener alimentación USB y observar batería/temperatura. La ubicación sigue actualizándose en El Burrito, sin reinicios ni intervención técnica. Registrar APK/hash, cronología, muestras de publicación/recepción, incidencias y detención final local con `isActive:false` remoto estable. Las pruebas cortas de I07/I08 no sustituyen esta evidencia.
- **Escenarios adicionales**: GPS apagado antes de iniciar; GPS apagado durante el tracking; cerrar y reabrir la app; recuperación del tracking; sin crashes.
- **Ex-T3 — Permisos denegados**: POST_NOTIFICATIONS, FINE y BACKGROUND denegados individualmente; cada caso manejado sin crash.
- **Ex-T4 — Pérdida de red en pleno tracking**: cortar la red con el recorrido activo y restaurarla; el bus reaparece en el mapa sin intervención (el heartbeat reintenta vía catch-reset).
- **Ex-T2 — Ciclo completo UserApp en paralelo**: login email y Google (primera vez / recurrente / cancelado) → mapa con bus en vivo → drawer → logout; cerrar y reabrir la app (persistencia de sesión, recuperación del mapa); corte de internet con la app abierta → el bus pasa a OFFLINE/oculto por sí solo; regresión post-C4.6 (MOVIMIENTO/PARADERO) y post-rebranding (splash/logo/FAB único/maxBounds).
- **Hallazgo C**: evaluar CERRAR SESIÓN / revocación con servicio nativo vivo.
- Fallos → subtareas de T1 únicamente si bloquean el MVP; de lo contrario → Post-MVP.

---

## 3. Cierre del MVP

### Criterios de aceptación

El MVP se considera cerrado cuando:

1. [ ] Un conductor puede iniciar sesión, obtener su asignación automática y comenzar el tracking sin intervención técnica.
2. [ ] El tracking se mantiene activo durante toda la jornada (pantalla apagada, app minimizada, tareas de Android).
3. [ ] Al finalizar, el conductor detiene el servicio y el bus desaparece del mapa estudiantil.
4. [ ] Un estudiante puede iniciar sesión (email o Google), ver el mapa y ver el bus en tiempo real con su estado (en ruta/detenido/sin señal).
5. [ ] Un administrador puede crear conductores, buses y asignaciones para hoy o fechas futuras con uno o varios turnos desde el panel.
6. [ ] El sistema se recupera de pérdidas temporales de red sin intervención.
7. [ ] No hay secretos ni credenciales expuestas en el repositorio (verificado 22/08).

### Lo que queda fuera del MVP

| Funcionalidad | Motivo |
|---------------|--------|
| Dashboard web (ADR-015) | Visión de largo plazo |
| Backend propio (ADR-014) | Visión de largo plazo |
| IA o predicciones | Sin prioridad |
| Estadísticas de recorridos | Post-MVP |
| Geofencing (ADR-013) | Post-MVP |
| Render multi-marcador completo | Si el piloto usa 1 bus, no es necesario |
| Smoothing de interpolación | Post-MVP |
| Calibración de paraderos | Post-MVP (requiere campus) |
| Notificaciones push | Visión de largo plazo |
| Refactors puramente estéticos | No agregan valor funcional |
| Typecheck en DriverApp | No bloquea operación |
| Cobertura de tests por porcentaje | Solo proteger flujos críticos |

Esta tabla delimita el alcance del MVP. Los identificadores, estados y
dependencias de planificación futura están únicamente en `docs/ROADMAP.md`.

---

## 4. Trabajo posterior al MVP

Nada del Post-MVP podrá iniciarse mientras el MVP no esté cerrado oficialmente (ver §3).

`docs/ROADMAP.md` es la fuente de planificación posterior: funcionalidades,
dependencias, tareas postergadas, condiciones de pre-release y publicación,
deuda técnica y visión futura sin aprobación de ejecución. Las condiciones de
pre-release se conservan separadas de las ampliaciones post-MVP.
El inventario detallado de lint sigue en `docs/LINT_DEBT.md`.

---

## 5. Regla del backlog

Este documento refleja el estado **real** del proyecto.

Si el código cambia:

1. Primero cambia el código.
2. Luego se actualiza `MVP.md`.

Nunca al revés.

Cuando una tarea del MVP se **termina**, se registra su evidencia en `docs/BUGS_RESUELTOS/` o `docs/DECISIONS.md` según corresponda, y se retira de la sección de backlog pendiente de este documento. El estado del trabajo posterior se actualiza en `docs/ROADMAP.md`, sin duplicarlo aquí. El historial de cambios queda en Git.
