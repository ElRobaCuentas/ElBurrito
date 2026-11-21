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
| `Driver/` | BurritoDriverApp | App privada de conductores (productor GPS Android) |
| `AdminWeb/` | AdminWeb | Panel administrativo web (SPA React) |
| `docs/` | — | Documentación compartida |
| `FirebaseLab/` | FirebaseLab | Laboratorio local de permisos de Firebase |

Ejecutá los comandos Git desde la raíz del monorepo. Los comandos de cada app
se ejecutan desde su carpeta (`User/`, `Driver/` o `AdminWeb/`). Cada app tiene
además su **propio** `AGENTS.md` con reglas específicas: `User/AGENTS.md`,
`Driver/AGENTS.md`, `AdminWeb/AGENTS.md`. Antes de tocar una app, leé **este
archivo y el de esa app**. Las rutas de esta documentación son relativas a la
raíz del monorepo salvo que se indique lo contrario.

El procedimiento de trabajo (plan, build, verificación, documentación) está en
`FLUJO_DE_TRABAJO.md`. El backlog y el alcance del MVP están en `MVP.md`.

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
| **El Burrito** | App pública para estudiantes (carpeta `User/`). |
| **BurritoDriverApp** | App privada para conductores (carpeta `Driver/`). |
| **AdminWeb** | Panel administrativo web (carpeta `AdminWeb/`). |
| **Ecosistema El Burrito** | Conjunto de apps, servicios e infraestructura. |

**Regla de rutas vs productos:** los prefijos de carpeta `BurritoUserApp/` y
`BurritoDriverApp/` son **obsoletos** (hoy son `User/` y `Driver/`). Pero
`BurritoDriverApp` y `BurritoUserApp` como **nombres de producto** siguen
siendo válidos (aparecen en títulos y documentación). No los "corrijas".

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

- Antes de una tarea, seguir la [preparación del flujo](FLUJO_DE_TRABAJO.md#preparación-de-una-tarea):
  revisar el árbol, actualizar `main`, recibir memoria compartida y crear una rama.
  Si no hay remoto publicado o no están autorizadas las operaciones, informar el
  bloqueo; no configurar un remoto ni simular que la actualización ocurrió.
- Trabajar por tarea en ramas `feat/`, `fix/`, `docs/` o `chore/`; integrar a
  `main` por pull request revisado por otro desarrollador. No trabajar
  directamente sobre `main` ni incluir cambios ajenos.
- La aprobación de una implementación no autoriza por sí sola commit, push,
  creación de PR, merge ni despliegue. Respetar las restricciones de la sesión.
- Actualizar la documentación afectada en la misma tarea y PR. Respetar la pausa
  documental vigente de `FLUJO_DE_TRABAJO.md`; no cerrar una tarea con documentación
  pendiente ni declarar integración por tener únicamente un commit local.
- Recuperar memoria con `scripts/engram-team.ps1 Receive`, solo cuando esté
  autorizada la importación. Verificar la identidad `ecosistema-el-burrito`;
  la memoria es contexto y debe contrastarse con las fuentes actuales.
- Conservar las notas de trabajo en la base habitual. Para compartir aprendizajes,
  usar únicamente el [procedimiento de publicación curada](FLUJO_VERIFICACION_Y_CIERRE.md#memorias-técnicas-compartidas):
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
| Un path o nodo de RTDB | `docs/FIREBASE_SCHEMA.md` |
| Un flujo o la arquitectura | `docs/ARCHITECTURE.md` |
| Una decisión arquitectónica | `docs/DECISIONS.md` |
| Un bug identificado | `docs/TROUBLESHOOTING.md` |
| Un bug corregido | `docs/BUGS_RESUELTOS/` |
| Una limitación del sistema | `docs/ARCHITECTURE.md` §9 / `docs/TROUBLESHOOTING.md` |
| El estado de una tarea del MVP | `MVP.md` |
| Prioridades post-MVP | `docs/ROADMAP.md` |
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
| Procedimiento de trabajo | `FLUJO_DE_TRABAJO.md` |
| Alcance y cierre del MVP | `MVP.md` |
| Arquitectura y flujos | `docs/ARCHITECTURE.md` |
| Estructura RTDB | `docs/FIREBASE_SCHEMA.md` |
| Decisiones (ADR) | `docs/DECISIONS.md` |
| Limitaciones y diagnóstico | `docs/ARCHITECTURE.md` §9, `docs/TROUBLESHOOTING.md` |
| Próximas fases | `docs/ROADMAP.md` |
| Bugs conocidos / resueltos | `docs/TROUBLESHOOTING.md`, `docs/BUGS_RESUELTOS/` |
| Deuda de lint de UserApp | `docs/LINT_DEBT.md` |
| Incorporación de desarrolladores y tipos de configuración | [Guía de incorporación](docs/INCORPORACION.md) |
| Revisión del PR y publicación de memoria | [Verificación y cierre](FLUJO_VERIFICACION_Y_CIERRE.md#revisión-humana-e-integración-del-pr) |
| Historial de cambios | Git (commits) |
