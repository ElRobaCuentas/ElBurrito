<div align="center">
  <h1>ECOSISTEMA EL BURRITO</h1>

  <p>Desarrollado por</p>
  <img src="docs/assets/well.gif" alt="well." width="200">

  <p>Seguimiento del transporte universitario de la Universidad Nacional Mayor de San Marcos (UNMSM), con información al alcance de la comunidad estudiantil.</p>
</div>

<h2 align="center">La aplicación para estudiantes</h2>

<div align="center">
  <img src="docs/assets/readme-title.gif" alt="El Burrito" width="640">
  <p>Consulta la ubicación del bus universitario en el mapa, junto con la ruta y sus paraderos.</p>
  <p><a href="User/README.md">Conocer El Burrito</a></p>
</div>

<h2 align="center">El ecosistema</h2>

<table align="center">
  <tr>
    <td align="center" width="33%">
      <strong><a href="Driver/README.md">PILOTO</a></strong><br>
      Captura y transmisión de ubicación desde el dispositivo del conductor.
    </td>
    <td align="center" width="33%">
      <strong><a href="AdminWeb/README.md">CENTRAL</a></strong><br>
      Gestión de conductores, buses, asignaciones y administradores.
    </td>
    <td align="center" width="33%">
      <strong><a href="docs/architecture/pulso.md">PULSO</a></strong><br>
      Monitor operativo de las publicaciones de ubicación.
    </td>
  </tr>
</table>

<h2 align="center">Tecnologías</h2>

<p align="center">
  React Native · React · TypeScript · Firebase · Mapbox · Cloudflare Workers y D1
</p>

<h2 align="center">Monorepo</h2>

```text
User/              El Burrito · aplicación de estudiantes
Driver/            PILOTO · aplicación de conductores
AdminWeb/          CENTRAL · panel administrativo
AdminWeb/monitor/  PULSO · monitor de seguimiento
FirebaseLab/       Laboratorio local de permisos de Firebase
docs/              Arquitectura, planificación y guías compartidas
scripts/           Utilidades del equipo
```

<h2 align="center">Documentación y desarrollo</h2>

<p align="center">
  <a href="docs/architecture/overview.md">Arquitectura</a> ·
  <a href="docs/adr/README.md">Decisiones</a> ·
  <a href="docs/diagnostics/troubleshooting.md">Diagnóstico</a> ·
  <a href="docs/engineering/onboarding.md">Incorporación</a> ·
  <a href="docs/engineering/workflow.md">Flujo de trabajo</a> ·
  <a href="FirebaseLab/README.md">FirebaseLab</a> ·
  <a href="docs/AGENTS.md#7-mapa-de-documentos">Mapa de documentación</a>
</p>

<p align="center">Cada producto tiene su propia guía técnica y sus instrucciones de desarrollo.</p>
