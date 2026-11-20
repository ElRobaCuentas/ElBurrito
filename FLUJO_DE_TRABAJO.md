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

3. ¿Qué aplicaciones están involucradas?
   - BurritoUserApp
   - BurritoDriverApp
   - AdminWeb
   (una o varias)

4. ¿Qué archivos probablemente habrá que modificar?

5. ¿Qué riesgos existen?

6. ¿Qué documentación debe consultarse ANTES de implementar?

Para cada documento explica:

- por qué debe leerse
- qué información importante contiene
- qué decisiones podrían depender de él

7. ¿La tarea contradice algún ADR existente?

8. ¿La tarea está alineada con MVP.md (alcance y cierre del MVP) o ROADMAP.md (planificación posterior), según corresponda?

9. ¿Existe algún bug anterior o limitación conocida relacionada?

10. ¿Cuál sería la estrategia de implementación recomendada?

No implementes absolutamente nada.
```

---

## Resultado esperado

Plan responde algo como:

```
Aplicación:

UserApp

Documentación necesaria:

✔ AGENTS.md

porque contiene...

✔ ARCHITECTURE.md

porque...

✔ FIREBASE_SCHEMA.md

porque...

✔ DECISIONS.md

porque...

✔ MVP.md (alcance y cierre) o ROADMAP.md (planificación posterior), según corresponda

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

Respeta AGENTS.md y los ADR existentes.
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

# ETAPA 4 — VERIFICACIÓN TÉCNICA Y CONTRACTUAL

En esta etapa se verifica el cambio.

No se programa.

No se modifican archivos.

No se actualiza documentación.

Es una revisión técnica y contractual, independiente de la implementación.

---

## Prompt guía

```
Revisa únicamente la tarea TXX.

No modifiques código.

Realiza una auditoría completa.

Primero identifica qué archivos fueron modificados.

Después determina qué documentación estaba relacionada con esos archivos.

Con base en ello verifica específicamente:

1. Que se respetó AGENTS.md.

2. Que no se violó ningún ADR.

3. Que no se modificaron paths RTDB sin actualizar FIREBASE_SCHEMA.

4. Que no se rompió la arquitectura descrita en ARCHITECTURE.

5. Que la implementación sigue alineada con MVP.md (alcance y cierre) o ROADMAP.md (planificación posterior), según corresponda.

6. Que no reaparecen bugs documentados.

7. Que no hay:

- console.log

- TODO

- código muerto

- imports innecesarios

- duplicación

- malas prácticas

8. Ejecuta:

npm run typecheck

npm run lint

npm test

(si existen)

Finalmente indica:

✔ Qué está correcto.

⚠ Qué debería corregirse.

❌ Qué impide considerar lista la tarea.
```

---

Esta verificación es específica.

No genérica.

Depende de la tarea.

No es igual revisar MultiBus que revisar Login.

---

# ETAPA 5 — CORRECCIÓN (si existe)

Si la verificación encontró errores

↓

Volver a Build

↓

Corregir solamente esos problemas

↓

Volver a la verificación

---

# ETAPA 6 — DOCUMENTACIÓN

Aquí recién entra documentación.

Se actualizan únicamente archivos Markdown.

Nunca código.

Aplica la pausa temporal vigente indicada al inicio de este documento antes de leer o actualizar documentación.

---

## Prompt guía

```
La implementación terminó correctamente.

No modifiques código.

Analiza qué documentación quedó desactualizada debido a esta tarea.

Para cada documento explica por qué debe actualizarse.

Después actualiza únicamente esos documentos.

Respeta el estilo existente.

No agregues información innecesaria.

Si un documento no cambió, explica por qué no requiere actualización.
```

---

Por ejemplo.

```
ARCHITECTURE

↓

Se agregó un nuevo flujo

↓

Actualizar
```

---

```
MVP.md (tarea del MVP) / ROADMAP.md (trabajo posterior)

↓

La tarea pasó de pendiente a completada

↓

Actualizar el estado únicamente en el documento dueño de la tarea
```

---

```
DECISIONS

↓

No hubo decisiones nuevas

↓

No modificar
```

---

Así todo queda consistente.

---

# ETAPA 7 — EVALUACIÓN ARQUITECTÓNICA (SOLO CUANDO SEA NECESARIO)

No se evalúa arquitectura todos los días.

Solo cuando aparece una decisión importante.

---

Ejemplos

✔ Migrar a Firestore

✔ Cambiar Zustand

✔ Agregar Backend

✔ Nueva arquitectura

✔ Cambiar autenticación

✔ Monorepo

✔ Dashboard Web

✔ Offline First

✔ Nueva estrategia GPS

---

## Prompt guía

```
Quiero evaluar una decisión arquitectónica.

No implementes nada.

Analiza:

- ventajas

- desventajas

- riesgos

- impacto técnico

- impacto sobre la documentación

- ADR afectados

- alternativas

- recomendación final

No escribas código.
```

```
                NUEVA TAREA
                     │
                     ▼
            ┌────────────────┐
            │      PLAN      │
            └────────────────┘
                     │
    impacto • riesgos • arquitectura
     documentación • estrategia
                     │
           decisión del desarrollador
                     │
                     ▼
            ┌────────────────┐
            │     BUILD      │
            └────────────────┘
                     │
         lee AGENTS correspondiente
                     │
                     ▼
 lee la documentación indicada por PLAN
                     │
                     ▼
      explica restricciones encontradas
                     │
                     ▼
           implementa únicamente
           la tarea solicitada
                     │
                     ▼
            SELF REVIEW (Build)
           (NO modifica código)
                     │
                     ▼
            ┌────────────────┐
            │  VERIFICACIÓN  │
            └────────────────┘
                     │
    typecheck • lint • tests • auditoría
                     │
          ¿hay problemas encontrados?
              │                 │
             Sí                No
              │                 │
              ▼                 ▼
      volver a BUILD      ┌────────────────┐
      corregir errores    │ DOCUMENTACIÓN  │
                          └────────────────┘
                                   │
                     actualiza únicamente
                       documentación (.md)
                                   │
                                   ▼
                        ¿hubo decisión
                       arquitectónica?
                           │        │
                          Sí       No
                           │        │
                           ▼        ▼
                 ┌──────────────────────┐
                 │ EVALUACIÓN           │
                 │ ARQUITECTÓNICA       │
                 └──────────────────────┘
                           │
                    evaluación de ADRs
                     y arquitectura
                            │
                            ▼
                        git commit
                            │
                            ▼
                        FIN TAREA
```

# Ciclo Operativo del MVP

Este será el procedimiento oficial de trabajo durante toda la etapa del MVP.

A partir de ahora, absolutamente todas las tareas activas deberán seguir este ciclo.

1. Abrir `MVP.md`.
2. Elegir únicamente la siguiente tarea pendiente según el order operativo del backlog (ver `MVP.md` §2 "Backlog pendiente").
3. Crear una sesión nueva dedicada exclusivamente a esa tarea.
4. Auditar únicamente el alcance de esa tarea.
5. Implementar la solución respetando el tipo de tarea (A, B o C).
6. Ejecutar las revisiones y pruebas que correspondan según el tipo de tarea.
7. Si durante la implementación aparecen nuevos problemas:
   - si bloquean el MVP, crear subtareas dentro del mismo bloque (por ejemplo C4.1, C4.2);
   - si no bloquean el MVP, registrarlos como Post-MVP.
8. Cuando la tarea esté terminada:
   - actualizar la documentación técnica correspondiente (`docs/BUGS_RESUELTOS/` o `docs/DECISIONS.md`) solo si el cambio lo requiere;
   - realizar el commit correspondiente;
   - cambiar el estado de la tarea en `MVP.md` a Terminado.
9. Continuar únicamente con la siguiente tarea pendiente del backlog.

## Reglas

- Nunca trabajar dos tareas activas en una misma sesión.
- Nunca cambiar el orden del backlog salvo decisión explícita.
- Nunca agregar funcionalidades nuevas durante una tarea.
- Si aparece deuda técnica que no bloquea el MVP, moverla a Post-MVP.
- El backlog (`MVP.md`) es la única fuente oficial de trabajo durante esta etapa.
- `FLUJO_DE_TRABAJO.md` define cómo se ejecutan las tareas.
- `MVP.md` define qué tareas deben ejecutarse.
- Los problemas resueltos y las decisiones técnicas se documentan en `docs/BUGS_RESUELTOS/` o `docs/DECISIONS.md` solo cuando sea necesario.

## Regla de una sola tarea activa

Mientras una tarea permanezca en estado "En progreso", no podrá iniciarse otra tarea del backlog.

La siguiente tarea solo podrá comenzar cuando la anterior esté:

- implementada;
- probada;
- documentada;
- con la documentación técnica correspondiente actualizada, solo si el cambio lo requiere;
- con commit realizado;
- marcada como Terminado.

Esta disciplina evita el cambio constante de contexto: ramas olvidadas, tareas pausadas y documentación desactualizada. Con ella, el proyecto avanza de forma predecible y el backlog siempre refleja el estado real del desarrollo.
