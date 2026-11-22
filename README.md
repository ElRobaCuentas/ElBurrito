# Ecosistema El Burrito

Proyecto de transporte universitario de la Universidad Nacional Mayor de San Marcos (UNMSM), bajo la marca **well.** El monorepo reúne las aplicaciones, el monitor de seguimiento y la documentación compartida.

## Productos

| Producto | Ubicación | Qué hace |
|---|---|---|
| [El Burrito](User/README.md) | `User/` | Permite a estudiantes consultar la ubicación del bus, la ruta y los paraderos. |
| [PILOTO](Driver/README.md) | `Driver/` | Captura y transmite la ubicación del bus desde el dispositivo del conductor. |
| [CENTRAL](AdminWeb/README.md) | `AdminWeb/` | Panel web para gestionar conductores, buses, asignaciones y administradores. |
| [PULSO](docs/architecture/pulso.md) | `AdminWeb/monitor/` | Monitor de seguimiento que detecta y registra incidencias de la publicación de ubicación. |

## Estructura del monorepo

Además de los directorios de producto, [FirebaseLab](FirebaseLab/README.md) contiene el laboratorio local de permisos de Firebase y `scripts/` reúne utilidades del equipo. `AGENTS.md`, `opencode.json` y `.gitignore` permanecen en la raíz.

| Documentación compartida | Punto de entrada |
|---|---|
| `docs/architecture/` | [Arquitectura del ecosistema](docs/architecture/overview.md) |
| `docs/adr/` | [Índice de decisiones arquitectónicas](docs/adr/README.md) |
| `docs/diagnostics/` | [Diagnóstico y problemas conocidos](docs/diagnostics/troubleshooting.md) |
| `docs/engineering/` | [Incorporación al monorepo](docs/engineering/onboarding.md) |
| `docs/planning/` | [Alcance y estado del MVP](docs/planning/mvp.md) |

Para navegar por toda la documentación, consultar el [mapa de documentos](docs/AGENTS.md#7-mapa-de-documentos). El [flujo de trabajo](docs/engineering/workflow.md) y el [procedimiento de publicación](docs/engineering/versioning-and-releases.md) tienen sus propias guías. Las reglas para asistentes y la [nomenclatura oficial](AGENTS.md#2-terminología-obligatoria) están en `AGENTS.md`.
