# FLUJO DE TRABAJO

> **REGLA TEMPORAL VIGENTE — PAUSA OBLIGATORIA ANTES DE DOCUMENTACIÓN**
>
> Cuando una intervención llegue a la fase de actualización de documentación,
> el asistente debe **detenerse y avisar al usuario** para que cambie de modelo.
> No debe leer ni actualizar la documentación hasta recibir confirmación explícita
> del usuario.
>
> Esta regla prevalece sobre las Etapas 6 y 7 y sobre el paso 8 del Ciclo
> Operativo mientras esté vigente. Permanece activa hasta que el usuario indique
> expresamente retirarla.

# CONTEXTO DEL MONOREPO

La raíz del repositorio contiene `User/`, `Driver/`, `AdminWeb/`, `docs/` y
`FirebaseLab/` bajo una única raíz Git. Cada tarea debe indicar el componente
afectado.

- Los comandos de la app (`npm`, Gradle, tests) se ejecutan dentro de su carpeta.
- Los comandos Git se ejecutan desde la raíz del monorepo.
- Las reglas comunes están en `../../AGENTS.md`; las tres aplicaciones y `docs/`
  tienen además su propio `AGENTS.md`.
- Las aplicaciones conservan dependencias, versiones y publicación
  independientes. El procedimiento de entregas está en
  `versioning-and-releases.md`.

---

# Preparación de una tarea

El ciclo colaborativo es **actualizar `main` → recibir contexto → rama → Plan →
implementación → pruebas y documentación → commit autorizado → PR → revisión
humana → integración en `main`**.
La [guía de incorporación](onboarding.md) prepara el equipo; este documento
define el trabajo cotidiano.

Los pasos con `origin` y pull requests requieren acceso confirmado al remoto del
monorepo y autorización para la operación. La URL y los pasos para el primer
acceso están en [incorporación](onboarding.md#1-acceso-y-copia-de-trabajo).

## Actualizar y abrir la rama

Trabajar en una rama por tarea (`feat/`, `fix/`, `docs/` o `chore/`), no
directamente en `main`. Mantener fuera del cambio cualquier trabajo ajeno.

Desde la raíz del monorepo, comprobar `git status --short`. Si hay cambios,
identificar su dueño antes de continuar: no descartarlos ni usar stash
automáticamente. En un árbol limpio y con las operaciones autorizadas:

```powershell
git switch main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo cambiar a main.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar main; revisar la divergencia.' }
.\scripts\engram-team.ps1 Receive
if (-not $?) { throw 'Falló la recepción de memoria; revisar antes de continuar.' }
$branch = Read-Host 'Rama acordada, por ejemplo fix/user-txx'
git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la rama.' }
```

No usar reset o force-push para resolver una divergencia. Si la recepción está
prohibida, omitirla expresamente y comunicar qué contexto falta. `Receive` apunta
a la base habitual; no configura Cloud ni actualiza Git. Confirmar que el agente
consulta esa misma base y resuelve `ecosistema-el-burrito` antes de recuperar notas.

Actualizar la rama con los cambios pertinentes de `main` antes de pedir la
revisión final; resolver conflictos y repetir las pruebas afectadas. El
[cierre](verification-and-closure.md#revisión-humana-e-integración-del-pr)
define las condiciones para integrar. Una rama rechazada o abandonada no debe
convertirse en fuente de memoria compartida de decisiones vigentes.

## Elegir el agente

| Agente | Uso | Límite |
|--------|-----|--------|
| Plan (`plan`) | Analizar impacto, fuentes, riesgos y estrategia. | En este repo no edita, no usa terminal y no delega. La preparación Git la hace el desarrollador o Build autorizado. |
| Build (`build`) | Implementar el plan aprobado, verificar y corregir dentro del alcance. | No ampliar la tarea ni publicar por iniciativa propia. |
| Gentle-Orchestrator (`gentle-orchestrator`) | Coordinar una tarea compleja y sus unidades de trabajo cuando el usuario lo solicite. | Invocación manual; conserva las restricciones, la aprobación humana y los pasos de revisión. |

Cambiar de agente no amplía la autorización. En trabajo coordinado, registrar
responsable, alcance y evidencias por unidad; el coordinador debe comprobar el
resultado integrado. Las instrucciones automáticas de Gentle AI no sustituyen
las reglas del repositorio ni una prohibición de commits o sincronización.

---

# ETAPA 1 — ANÁLISIS (PLAN)

Objetivo:

**Pensar antes de programar.**

Aquí todavía NO existe código.

Solo análisis.

---

## Prompt guía

```
Nueva tarea: TXX

No programes nada.

Primero analiza la tarea.

Quiero que determines:

1. ¿Qué impacto tiene esta tarea sobre el proyecto?

2. ¿Qué módulos podrían verse afectados?

3. ¿Qué productos están involucrados: El Burrito, PILOTO, CENTRAL o PULSO?

4. ¿Qué archivos probablemente habrá que modificar?

5. ¿Qué riesgos existen?

6. ¿Qué documentación debe consultarse ANTES de implementar?

Para cada documento explica:

- por qué debe leerse
- qué información importante contiene
- qué decisiones podrían depender de él

7. ¿La tarea contradice algún ADR existente?

8. ¿La tarea está alineada con ../planning/mvp.md (alcance y cierre del MVP) o ../planning/roadmap.md (planificación posterior), según corresponda?

9. ¿Existe algún bug anterior o limitación conocida relacionada?

10. ¿Cuál sería la estrategia de implementación recomendada?

No implementes absolutamente nada.
```

---

## Resultado esperado

Plan responde algo como:

```
Aplicación:

El Burrito

Documentación necesaria:

✔ ../../AGENTS.md

porque contiene...

✔ ../architecture/overview.md

porque...

✔ ../architecture/firebase-schema.md

porque...

✔ ../adr/README.md

porque...

✔ ../planning/mvp.md (alcance y cierre) o ../planning/roadmap.md (planificación posterior), según corresponda

porque...

Archivos afectados:

Map.tsx

MapStore.ts

etc.

Riesgos:

...

Estrategia:

...
```

Aquí termina Plan.

Ahora tú decides.

---

# ETAPA 2 — IMPLEMENTACIÓN (BUILD)

Ahora sí se programa.

Pero Build NO empieza inmediatamente.

Primero debe entender el proyecto.

---

## Prompt guía

```
Implementemos la tarea TXX.

Primero determina qué aplicación será modificada.

Luego lee el AGENTS.md correspondiente.

Después lee únicamente la documentación que PLAN determinó necesaria.

Antes de escribir código explícame:

- qué documentos leíste
- por qué eran necesarios
- qué restricciones importantes encontraste

No implementes nada hasta terminar ese análisis.

Una vez entendido el contexto completo, implementa únicamente la tarea solicitada.

No expandas el alcance.

Respeta ../../AGENTS.md y los ADR existentes.
```

---

## Lo que hace Build

↓

Lee AGENTS

↓

Lee documentación

↓

Explica restricciones

↓

Programa

↓

Explica qué modificó

---

# ETAPA 3 — SELF REVIEW (BUILD)

Aquí todavía seguimos en Build.

NO se programa.

Solo se audita.

---

## Prompt guía

```
Terminaste la implementación.

Ahora realiza un Self Review.

NO modifiques código.

Quiero que respondas:

1. ¿Qué cambió exactamente?

2. ¿Qué comportamiento nuevo existe?

3. ¿Qué comportamiento NO cambió?

4. ¿Qué partes podrían haberse visto afectadas?

5. ¿Qué riesgos existen?

6. ¿Qué pruebas manuales harías?

7. ¿Qué pruebas automáticas ejecutarías?

8. ¿Qué documentación probablemente quedó desactualizada?

No corrijas nada.

Solo analiza.
```

---

Aquí Build dice

```
Detecté un posible problema...
```

pero NO lo arregla.

---

Si quieres arreglarlo

tú decides.

```
Corrígelo.
```

y recién vuelve a escribir código.

---

**[Flujo de trabajo: verificación y cierre](verification-and-closure.md)**

# ETAPA 4 — VERIFICACIÓN TÉCNICA Y CONTRACTUAL

[Consultar sección](verification-and-closure.md#etapa-4--verificación-técnica-y-contractual).

## Prompt guía

[Consultar sección](verification-and-closure.md#prompt-guía).

# ETAPA 5 — CORRECCIÓN (si existe)

[Consultar sección](verification-and-closure.md#etapa-5--corrección-si-existe).

# ETAPA 6 — DOCUMENTACIÓN

[Consultar sección](verification-and-closure.md#etapa-6--documentación).

## Prompt guía

[Consultar sección](verification-and-closure.md#prompt-guía-1).

# ETAPA 7 — EVALUACIÓN ARQUITECTÓNICA (SOLO CUANDO SEA NECESARIO)

[Consultar sección](verification-and-closure.md#etapa-7--evaluación-arquitectónica-solo-cuando-sea-necesario).

## Prompt guía

[Consultar sección](verification-and-closure.md#prompt-guía-2).

# Ciclo Operativo del MVP

Este será el procedimiento oficial de trabajo durante toda la etapa del MVP.

A partir de ahora, absolutamente todas las tareas activas deberán seguir este ciclo.

1. Abrir `../planning/mvp.md`.
2. Acordar responsable y siguiente tarea según el orden operativo del backlog (ver `../planning/mvp.md` §2 "Backlog pendiente").
3. Completar la preparación anterior y crear una sesión dedicada a la tarea, en su rama.
4. Auditar únicamente el alcance de esa tarea.
5. Implementar la solución respetando el tipo de tarea (A, B o C).
6. Ejecutar las revisiones y pruebas que correspondan según el tipo de tarea.
7. Si durante la implementación aparecen nuevos problemas:
   - si bloquean el MVP, crear subtareas dentro del mismo bloque (por ejemplo C4.1, C4.2);
   - si no bloquean el MVP, registrarlos como Post-MVP.
8. Cuando la tarea esté terminada:
   - actualizar los documentos afectados según `../../AGENTS.md` §7, respetando la pausa documental;
   - preparar aprendizajes técnicos para revisión humana si corresponde, sin exportar la base histórica;
   - seguir la [revisión humana e integración del PR](verification-and-closure.md#revisión-humana-e-integración-del-pr), solo con las operaciones autorizadas;
   - registrar la integración en `main` antes de dar por cerrada la tarea en el backlog;
   - si un PR marca una tarea como terminada, entender esa marca como propuesta hasta su integración.
9. Continuar únicamente con la siguiente tarea pendiente del backlog.

## Reglas

- Nunca trabajar dos tareas activas en una misma sesión.
- Nunca cambiar el orden del backlog salvo decisión explícita.
- Nunca agregar funcionalidades nuevas durante una tarea.
- Si aparece deuda técnica que no bloquea el MVP, moverla a Post-MVP.
- El backlog (`../planning/mvp.md`) es la única fuente oficial de trabajo durante esta etapa.
- `workflow.md` define cómo se ejecutan las tareas.
- `../planning/mvp.md` define qué tareas deben ejecutarse.
- Cuando corresponda documentar un bug resuelto o una decisión arquitectónica, seguir la [matriz de documentación afectada](../../AGENTS.md#7-documentación-afectada).

## Regla de una sola tarea activa

Cada desarrollador mantiene una sola tarea activa por sesión y rama. La
secuencia del MVP sigue siendo la acordada: otro integrante no toma una tarea
dependiente aún bloqueada. El trabajo independiente en paralelo requiere
responsables y alcance coordinados, sin cambiar el orden del backlog por cuenta propia.

La siguiente tarea solo podrá comenzar cuando la anterior esté:

- implementada;
- probada;
- documentada;
- con la documentación técnica correspondiente actualizada, solo si el cambio lo requiere;
- revisada por otro desarrollador e integrada mediante PR en `main`;
- con el resultado de integración y el estado de cierre registrados en el backlog.

Si una restricción impide documentar, hacer commit o integrar, entregar el estado
parcial verificable y el pendiente; no declarar la tarea cerrada.

Esta disciplina evita el cambio constante de contexto: ramas olvidadas, tareas pausadas y documentación desactualizada. Con ella, el proyecto avanza de forma predecible y el backlog siempre refleja el estado real del desarrollo.
