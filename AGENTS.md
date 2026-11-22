# Ecosistema El Burrito — AGENTS.md

## 1. Propósito y alcance

Este archivo está dirigido **exclusivamente a asistentes de IA** (OpenCode,
Gemini CLI, Claude Code, Cursor, etc.). NO es un README. Describe **cómo
trabajar en el ecosistema sin romperlo**.

La raíz del monorepo es una **única raíz Git**. Estas carpetas forman parte del
mismo repositorio:

| Ruta | Producto | Naturaleza |
|------|----------|------------|
| `User/` | El Burrito | App pública de estudiantes (React Native: mapa + tracking) |
| `Driver/` | PILOTO | App privada de conductores (productor GPS Android) |
| `AdminWeb/` | CENTRAL | Panel administrativo web (SPA React) |
| `AdminWeb/monitor/` | PULSO | Monitor de seguimiento |
| `docs/` | — | Documentación compartida |
| `FirebaseLab/` | FirebaseLab | Laboratorio local de permisos de Firebase |

Ejecutá los comandos Git desde la raíz del monorepo. Los comandos de cada app
se ejecutan desde su carpeta (`User/`, `Driver/` o `AdminWeb/`). Cada app tiene
además su **propio** `AGENTS.md` con reglas específicas: `User/AGENTS.md`,
`Driver/AGENTS.md`, `AdminWeb/AGENTS.md`. Antes de tocar una app, leé **este
archivo y el de esa app**. Las rutas de esta documentación son relativas a la
raíz del monorepo salvo que se indique lo contrario.

El procedimiento de trabajo (plan, build, verificación, documentación) está en
`docs/engineering/workflow.md`. El backlog y el alcance del MVP están en `docs/planning/mvp.md`.

En OpenCode, el agente `plan` no puede editar, ejecutar comandos de terminal
ni delegar tareas. Después de aprobar el plan, usá `build` para ejecutar las
verificaciones y los cambios autorizados.

Gentle-Orchestrator (`gentle-orchestrator`) coordina trabajo complejo solo si el
usuario lo invoca expresamente. Debe respetar el mismo alcance, las reglas del
componente y la revisión humana; no reemplaza Plan ni autoriza operaciones Git.
No iniciarlo automáticamente ni delegar desde Plan.

---

## 2. Terminología obligatoria

Usá siempre estos nombres:

| Término | Significado |
|---------|-------------|
| **well.** | Marca principal; siempre en minúsculas y con punto. |
| **Ecosistema El Burrito** | Proyecto de transporte universitario de la UNMSM. En menciones genéricas, «el ecosistema» o «el proyecto». |
| **El Burrito** | App pública para estudiantes, no abreviatura del proyecto. |
| **PILOTO** | App privada para conductores. |
| **CENTRAL** | Panel administrativo web. `AdminWeb/` es su directorio técnico. |
| **PULSO** | Monitor de seguimiento. |

No anteponer la marca a los productos ni usarla como nombre de ruta. Usar
«piloto», «central», «pulso», «monitor» y «panel administrativo» en minúscula en
sentido genérico. Mantener los identificadores técnicos, las citas de la interfaz
y los nombres de evidencia histórica tal como se registraron.

---

## 3. Convenciones comunes

| Ámbito | Regla |
|--------|-------|
| UI strings | Español |
| Código (variables, funciones, tipos) | Inglés |
| Comentarios en código | Español |
| Documentación (.md) | Español |
| Commits | Conventional Commits |

---

## 4. Verificación contra las fuentes

Confirmá las afirmaciones sobre el comportamiento del sistema en el código
vigente. Las herramientas de navegación no reemplazan la lectura del código
para cambios reales; una inferencia no constituye una verificación.

---

## 5. Cambios y alcance

- No modifiques código de aplicación fuera de la solicitud.
- No expandas el alcance: si la tarea pide un arreglo, no hagas refactors ni
  limpiezas no pedidas.
- Si no podés determinar la intención del cambio, detenete y preguntá. No asumas.
- Ante una decisión destructiva o nueva (que cambia el alcance), **detenete y
  preguntá**.

### Trabajo colaborativo

- Seguir la [preparación del flujo](docs/engineering/workflow.md#preparación-de-una-tarea)
  y la [revisión humana e integración](docs/engineering/verification-and-closure.md#revisión-humana-e-integración-del-pr).
  Si no hay acceso al remoto o no están autorizadas las operaciones, informar el bloqueo.
- La aprobación de una implementación no autoriza por sí sola commit, push,
  creación de PR, merge ni despliegue. Respetar las restricciones de la sesión.
- Actualizar la documentación afectada en la misma tarea y PR. Respetar la pausa
  documental vigente de `docs/engineering/workflow.md`; no cerrar una tarea con documentación
  pendiente ni declarar integración por tener únicamente un commit local.
- Recuperar memoria solo cuando esté autorizada la importación; consultar
  [incorporación](docs/engineering/onboarding.md). La memoria es contexto y debe
  contrastarse con las fuentes actuales.
- Conservar las notas de trabajo en la base habitual. Para compartir aprendizajes,
  usar únicamente el [procedimiento de publicación curada](docs/engineering/verification-and-closure.md#memorias-técnicas-compartidas):
  revisión humana del lote y del chunk completo antes de publicarlo por Git.
  Nunca sincronizar directamente la base histórica, prompts ni notas personales.

---

## 6. Límites y seguridad

- No elimines documentación histórica vigente sin autorización. Los archivos obsoletos pueden eliminarse cuando su información indispensable ya esté conservada y la eliminación haya sido aprobada.
- No sobrescribas backups ni evidencias.
- No instales dependencias opcionales sin evaluar antes su necesidad.
- No certifiques configuración que no hayas inspeccionado.
- No ocultes errores ni advertencias.

### Archivos sensibles — NO leer ni mostrar

`**/google-services.json`, `**/keystore.properties`, `**/gradle.properties`,
`**/.xcode.env`, `**/.firebaserc`, `**/*.keystore`, `AdminWeb/.env`,
`User/.env`.

---

## 7. Documentación afectada

| Si cambias... | Actualiza... |
|---------------|-------------|
| Un path o nodo de RTDB | `docs/architecture/firebase-schema.md` |
| Un flujo o la arquitectura | `docs/architecture/overview.md`, `docs/architecture/flows.md` o `docs/architecture/tracking.md`, según corresponda |
| Una decisión arquitectónica | Registro correspondiente en `docs/adr/` y su índice `docs/adr/README.md` |
| Un bug identificado | `docs/diagnostics/troubleshooting.md` |
| Un bug corregido | `docs/diagnostics/resolved-bugs/` |
| Una limitación del sistema | `docs/architecture/tracking.md` §9 / `docs/diagnostics/troubleshooting.md` |
| El estado de una tarea del MVP | `docs/planning/mvp.md` |
| Prioridades post-MVP | `docs/planning/roadmap.md` |
| Una regla de trabajo para IA | El `AGENTS.md` correspondiente |
| Setup, comandos o variables de entorno | El `README.md` de la app |
| Una variable `VITE_*` de AdminWeb | `AdminWeb/README.md` + `.env.example` |

Si un cambio impacta varios documentos, todos deben quedar sincronizados antes
de cerrar la tarea.

---

## 8. Referencias

| Si necesitas... | Leé... |
|-----------------|--------|
| Reglas de una app | `User/AGENTS.md`, `Driver/AGENTS.md`, `AdminWeb/AGENTS.md` |
| Entrada al monorepo / mapa completo | [README](README.md) / [mapa de documentos](docs/AGENTS.md#7-mapa-de-documentos) |
| Procedimiento de trabajo | [Flujo de trabajo](docs/engineering/workflow.md) |
| Alcance y cierre del MVP | [MVP](docs/planning/mvp.md) |
| Arquitectura y flujos | [Visión general](docs/architecture/overview.md), [flujos](docs/architecture/flows.md), [tracking](docs/architecture/tracking.md) |
| Estructura RTDB | [Esquema Firebase](docs/architecture/firebase-schema.md) |
| Monitor de seguimiento | [PULSO](docs/architecture/pulso.md) |
| Decisiones (ADR) | [Índice de ADR](docs/adr/README.md) |
| Limitaciones y diagnóstico | [Tracking §9](docs/architecture/tracking.md#9-consideraciones-de-implementación-y-límites), [diagnóstico](docs/diagnostics/troubleshooting.md) |
| Próximas fases | [Roadmap](docs/planning/roadmap.md) |
| Bugs conocidos / resueltos | [Diagnóstico](docs/diagnostics/troubleshooting.md), [historial](docs/diagnostics/resolved-bugs/) |
| Deuda de lint de El Burrito | [Deuda de lint](docs/diagnostics/lint-debt.md) |
| Incorporación de desarrolladores y tipos de configuración | [Guía de incorporación](docs/engineering/onboarding.md) |
| Entregas y publicación | [Versionado y publicación](docs/engineering/versioning-and-releases.md) |
| Revisión del PR y publicación de memoria | [Verificación y cierre](docs/engineering/verification-and-closure.md#revisión-humana-e-integración-del-pr) |
| Historial de cambios | Git (commits) |
