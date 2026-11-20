# Ecosistema El Burrito — AGENTS.md

## 1. Propósito y alcance

Este archivo está dirigido **exclusivamente a asistentes de IA** (OpenCode,
Gemini CLI, Claude Code, Cursor, etc.). NO es un README. Describe **cómo
trabajar en el ecosistema sin romperlo**.

`C:\Movil` es una **carpeta integradora, no un repositorio Git**. Contiene
cuatro repositorios Git independientes:

| Ruta | Producto | Naturaleza |
|------|----------|------------|
| `User/` | El Burrito | App pública de estudiantes (React Native: mapa + tracking) |
| `Driver/` | BurritoDriverApp | App privada de conductores (productor GPS Android) |
| `AdminWeb/` | AdminWeb | Panel administrativo web (SPA React) |
| `docs/` | — | Documentación compartida |

Los comandos Git, diffs y commits se ejecutan dentro del repositorio afectado,
nunca desde `C:\Movil`. Cada app tiene además su **propio** `AGENTS.md` con
reglas específicas: `User/AGENTS.md`, `Driver/AGENTS.md`,
`AdminWeb/AGENTS.md`. Antes de tocar una app, leé **este archivo y el de esa
app**.

El procedimiento de trabajo (plan, build, verificación, documentación) está en
`FLUJO_DE_TRABAJO.md`. El backlog y el alcance del MVP están en `MVP.md`.

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
| Historial de cambios | Git (commits) |
