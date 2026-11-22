# Documentación compartida — AGENTS.md

## 1. Alcance

`docs/` reúne la documentación técnica compartida del ecosistema: arquitectura,
contratos, decisiones, diagnóstico, procesos y planificación. La identidad y
los nombres de los productos se definen en [AGENTS.md](../AGENTS.md#2-terminología-obligatoria).

Este archivo rige solo el trabajo dentro de `docs/`; no reemplaza las reglas de
cada app ni el índice del ecosistema. Los comandos Git se ejecutan desde la
raíz del monorepo (`../`).

---

## 2. Convenciones

- Escribí en español. Identificadores, paths de RTDB y nombres de símbolos van
  en su forma exacta.
- Documentá el comportamiento vigente, no el deseado. Lo pendiente se marca como
  pendiente.
- Preferí referencias concretas (`archivo:línea`, path de RTDB, nombre de
  función) sobre descripciones vagas.
- No dupliques contenido: si un dato ya vive en otro documento, referencialo.
- Mantené la estructura y el estilo existentes; no reordenes ni renombres
  secciones sin necesidad.

---

## 3. Preservación

- Las decisiones arquitectónicas se registran en `adr/`; `adr/README.md` es el
  índice. No reescribas una decisión histórica.
- Los bugs corregidos van en `diagnostics/resolved-bugs/`, en el archivo de la app afectada
  (`userapp.md`, `driverapp.md`, `adminweb.md`). Los bugs abiertos o conocidos
  van en `diagnostics/troubleshooting.md`.
- No elimines historial, evidencias, contratos técnicos ni documentación
  histórica vigente sin autorización explícita.
- Las referencias a ramas, tags, remotos y commits del esquema polyrepo en
  `adr/` y `diagnostics/resolved-bugs/` se conservan como evidencia histórica.
  No sustituyen el [flujo vigente](engineering/workflow.md).
- No sobrescribas backups ni evidencias.
- Si un cambio invalida un contrato (path o nodo de RTDB, flujo, variable de
  entorno), actualizá el documento que lo define en la misma tarea.

---

## 4. Verificación contra las fuentes

Confirmá toda afirmación técnica contra el código o la configuración vigente del
componente correspondiente. Una inferencia, un resumen previo o una herramienta
de navegación no constituyen verificación. Si no podés comprobarlo, decilo en
vez de afirmarlo.

---

## 5. Reglas comunes del ecosistema

Antes de modificar documentación, consultá `../AGENTS.md` (índice y reglas
comunes) y `engineering/workflow.md` (procedimiento). Si no están disponibles,
informalo y no asumas que fueron cargados automáticamente. `planning/mvp.md` define el
alcance y el estado del MVP.

---

## 6. Tareas exclusivamente documentales

Durante una tarea de documentación no modifiques código de `../User/`,
`../Driver/` ni `../AdminWeb/` por iniciativa propia. Si detectás una
discrepancia entre código y documentación, documentá la discrepancia o preguntá;
no "corrijas" el código como efecto colateral. Cambiar código requiere una
solicitud explícita.

---

## 7. Mapa de documentos

| Carpeta | Documentos |
|---------|------------|
| `architecture/` | [Visión general](architecture/overview.md), [flujos y componentes](architecture/flows.md), [ciclo y límites del tracking](architecture/tracking.md), [esquema RTDB](architecture/firebase-schema.md) y [PULSO](architecture/pulso.md). |
| `adr/` | [Índice de decisiones](adr/README.md) y registros [003–011](adr/adr-003-011.md), [012–020](adr/adr-012-020.md), [021–026](adr/adr-021-026.md) y [027–030](adr/adr-027-030.md). |
| `diagnostics/` | [Diagnóstico y bugs conocidos](diagnostics/troubleshooting.md), [deuda de lint de El Burrito](diagnostics/lint-debt.md) e [historial de bugs resueltos por app](diagnostics/resolved-bugs/). |
| `engineering/` | [Flujo de trabajo](engineering/workflow.md), [verificación y cierre](engineering/verification-and-closure.md), [incorporación](engineering/onboarding.md) y [versionado y publicación](engineering/versioning-and-releases.md). |
| `planning/` | [Alcance y estado del MVP](planning/mvp.md) y [prioridades posteriores](planning/roadmap.md). |
