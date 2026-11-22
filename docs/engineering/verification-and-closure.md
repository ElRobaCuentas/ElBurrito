# Flujo de trabajo: verificación y cierre

[Volver al documento principal](workflow.md).

# ETAPA 4 — VERIFICACIÓN TÉCNICA Y CONTRACTUAL

En esta etapa se verifica el cambio.

No se programa.

No se modifican archivos.

No se actualiza documentación.

Es una revisión técnica y contractual, independiente de la implementación.

Revisar el diff de la rama contra su base en `main`, incluidos documentos y
memorias propuestas. Usar los comandos vigentes del componente, no una suite
genérica. Una prueba omitida o una validación histórica no cuentan como aprobadas.

---

## Prompt guía

```
Revisa únicamente la tarea TXX.

No modifiques código.

Realiza una auditoría completa.

Primero identifica qué archivos fueron modificados.

Después determina qué documentación estaba relacionada con esos archivos.

Con base en ello verifica específicamente:

1. Que se respetó ../../AGENTS.md.

2. Que no se violó ningún ADR.

3. Que no se modificaron paths RTDB sin actualizar ../architecture/firebase-schema.md.

4. Que no se rompió la arquitectura descrita en ../architecture/overview.md.

5. Que la implementación sigue alineada con ../planning/mvp.md (alcance y cierre) o ../planning/roadmap.md (planificación posterior), según corresponda.

6. Que no reaparecen bugs documentados.

7. Que no hay:

- console.log

- TODO

- código muerto

- imports innecesarios

- duplicación

- malas prácticas

8. Ejecuta las comprobaciones aplicables del AGENTS.md y README del componente.
Indica directorio, comando, resultado y advertencias. Usa los comandos
documentados en el README del componente.
Para cambios solo documentales, verifica enlaces, coherencia y límite de líneas.

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

Aplicar la [pausa temporal vigente](workflow.md) antes de entrar en esta
etapa. Una solicitud explícitamente documental aprobada permite trabajar en su
alcance; no elimina la pausa para intervenciones futuras.

La documentación pertinente forma parte de cada tarea y del mismo PR que cambia
su contrato. Usar la matriz de `../../AGENTS.md` §7, sin duplicar procedimientos de los
README. Si no cambia ningún contrato, explicar por qué no hace falta actualizar.
Mantener cada documento activo en un máximo de 500 líneas; enlazar un complemento
si es necesario, preservando referencias e historial.

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
../architecture/overview.md

↓

Se agregó un nuevo flujo

↓

Actualizar
```

---

```
../planning/mvp.md (tarea del MVP) / ../planning/roadmap.md (trabajo posterior)

↓

La tarea pasó de pendiente a completada

↓

Actualizar el estado únicamente en el documento dueño de la tarea
```

---

```
Registro correspondiente en ../adr/ y su índice

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
                  commits autorizados
                             │
                             ▼
                  PR y aprobación según rol
                             │
                             ▼
                 integración y cierre en main
```

## Memorias técnicas compartidas

La base habitual conserva contexto de trabajo. Git comparte únicamente síntesis
revisadas mediante [engram-team.ps1](../../scripts/engram-team.ps1), con Engram **3.7.0**.
No usar `engram sync` directamente sobre la base habitual ni los flags `--all`
o `--include-prompts`. `scope: personal` no protege los resúmenes de sesiones.

1. Proponer solo decisiones vigentes, causas de bugs, convenciones o aprendizajes
   reproducibles. Contrastar código y documentación; no copiar conversaciones,
   prompts, credenciales, rutas personales ni sesiones originales.
2. Crear un lote JSON con la estructura de [engram-initial.json](../../scripts/engram-initial.json):
   `project`, `batch_id` nuevo y `notes` con `title`, `type`, `topic_key`, `content`
   y `sources` relativas a archivos existentes. Escribir una síntesis por tema,
   con razón, alcance y límites; no clonar todo el lote inicial para una nota nueva.
   Una revisión posterior conserva el `topic_key` del tema y usa otro `batch_id`.
3. El responsable humano revisa el lote antes de autorizar su registro local.
   Guardarlo en `scripts/memory-<tarea>.json` y ejecutar desde la raíz:

   ```powershell
   .\scripts\engram-team.ps1 Publish -NotesFile .\scripts\memory-txx.json -Reviewed
   ```

4. `Publish` usa solo la base local marcada de publicación, independiente de
   `ENGRAM_DATA_DIR`. La crea al publicar el primer lote si la ubicación está
   vacía. No copiar una base histórica a esa carpeta. El servidor efímero se
   cierra al terminar; no se necesita un servicio adicional ni Cloud.
5. Antes de hacer commit o push, revisar el manifiesto y **todo** el chunk nuevo,
   incluidos sesiones, observaciones y metadatos. `-Reviewed` declara la revisión
   del lote; no reemplaza esta inspección ni detecta automáticamente secretos.
   Para leer un chunk, usar su ID exacto anunciado por el comando:

   ```powershell
   $chunkId = Read-Host 'ID del chunk nuevo, ocho caracteres hexadecimales'
   if ($chunkId -cnotmatch '^[a-f0-9]{8}$') { throw 'ID inválido.' }
   $path = Join-Path $PWD ".engram/chunks/$chunkId.jsonl.gz"
   $file = [IO.File]::OpenRead($path)
   try {
       $gzip = New-Object IO.Compression.GZipStream($file, [IO.Compression.CompressionMode]::Decompress)
       $reader = New-Object IO.StreamReader($gzip, [Text.Encoding]::UTF8)
       try { $reader.ReadToEnd() } finally { $reader.Dispose() }
   } finally { $file.Dispose() }
   ```

6. Incluir el JSON fuente revisado, el manifiesto y los chunks necesarios en el
   PR de la tarea, seleccionando rutas concretas. No agregar toda `.engram/` ni
   publicar bases, marcas locales, logs o configuración Cloud. Una nota sobre
   código pendiente solo pasa a conocimiento vigente cuando su PR se integra.
   Si el conocimiento no corresponde al cambio funcional, usar un PR pequeño
   separado después de integrar ese cambio.
7. Coordinar un publicador por vez al actualizar el manifiesto. Ante conflicto,
   conservar las entradas de ambos lados por ID y sus archivos correspondientes;
   no renombrar chunks ni elegir una versión descartando la otra. Revisar el
   significado de notas contradictorias; el merge de Git no decide cuál es vigente.

Después de actualizar `main`, los demás reciben según la
[preparación de una tarea](workflow.md#preparación-de-una-tarea).
No importar desde ramas ajenas pendientes: SQLite no se revierte al cambiar de
rama. Reimportar el mismo chunk no lo duplica. `gentle-ai sync` actualiza
configuración de agentes, no mueve memorias. El lote inicial se recibe, no se
vuelve a publicar como parte de la incorporación.

## Revisión humana e integración del PR

- Antes de solicitar revisión: rama actualizada respecto a `main`, diff acotado,
  pruebas pertinentes, documentación y cualquier lote de memoria inspeccionados.
  Mantener los cambios preexistentes ajenos fuera de la selección de archivos.
- Con autorización, registrar commits de unidades revisables y abrir PR hacia
  `main`. Describir objetivo, componentes, pruebas, advertencias, documentos y
  memorias incluidas. No publicar secretos en descripciones ni evidencias.
- La protección de `main` sigue vigente: los cambios se integran mediante rama
  y PR.
- Juan, como propietario, puede autorizar e integrar sus propios PR sin
  aprobación externa; la revisión de sus PR por otros colaboradores es opcional.
- José y los demás colaboradores necesitan la aprobación de Juan antes de
  integrar sus cambios. La aprobación de un agente o de un orquestador no
  sustituye la aprobación de Juan. Resolver observaciones dentro del alcance;
  repetir las comprobaciones que afecten las correcciones.
- Integrar solo con la aprobación que corresponda según el rol y autorización
  para merge. Una prohibición de commits, push o PR mantiene el trabajo local:
  informar el pendiente.
- Verificar el resultado en `main`, registrar cierre del backlog y actualizar
  las copias locales antes de la próxima tarea. Si cambió el candidato durante
  la revisión, verificar el candidato final, no reutilizar evidencia incompatible.
- Una integración no publica Android, Hosting, Workers ni reglas Firebase.
  Seguir [Versionado y publicación](versioning-and-releases.md) únicamente
  cuando exista una entrega autorizada.

