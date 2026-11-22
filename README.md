<div align="center">
  <h1><img src="docs/assets/portada.svg" alt="Ecosistema El Burrito. Transporte universitario para la UNMSM." width="960"></h1>

  <p>Desarrollado por</p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/well.gif">
    <img src="docs/assets/well-light.gif" alt="well." width="200">
  </picture>

  <p>El bus universitario de San Marcos, en tiempo real.</p>

  <p><a href="#user-content-aplicacion">Aplicación</a> · <a href="#user-content-ecosistema">Ecosistema</a> · <a href="#user-content-desarrollo">Desarrollo</a></p>
</div>

<a id="aplicacion"></a>
<h2 align="center">Aplicación</h2>

<div align="center">
  <img src="docs/assets/readme-title.gif" alt="El Burrito" width="640">
  <p>Consulta la ubicación del bus universitario en el mapa, junto con la ruta y sus paraderos.</p>
  <p><a href="User/README.md"><strong>Conocer El Burrito →</strong></a></p>
</div>

<a id="ecosistema"></a>
<h2 align="center">Ecosistema</h2>

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="docs/assets/operacion.svg" alt="" width="40"><br>
      <strong>PILOTO</strong><br>
      Operación del recorrido y transmisión de ubicación.<br>
      <a href="Driver/README.md">Aplicación de conductores →</a>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/gestion.svg" alt="" width="40"><br>
      <strong>CENTRAL</strong><br>
      Gestión de conductores, buses y asignaciones.<br>
      <a href="AdminWeb/README.md">Panel administrativo →</a>
    </td>
    <td align="center" width="33%">
      <img src="docs/assets/monitoreo.svg" alt="" width="40"><br>
      <strong>PULSO</strong><br>
      Monitoreo de las publicaciones de ubicación.<br>
      <a href="docs/architecture/pulso.md">Monitor operativo →</a>
    </td>
  </tr>
</table>

<h2 align="center">Arquitectura</h2>

<div align="center">
  <img src="docs/assets/arquitectura.svg" alt="PILOTO publica en Firebase Realtime Database y El Burrito consulta la ubicación. CENTRAL gestiona datos en Firebase y consulta la API de PULSO. PULSO lee el tracking de Firebase y guarda incidentes en D1." width="960">
  <p>PILOTO publica la ubicación en Firebase y El Burrito la consulta. PULSO observa las publicaciones y registra incidentes; CENTRAL gestiona datos y consulta el monitor.</p>
  <p><a href="docs/architecture/overview.md">Explorar la arquitectura →</a></p>
</div>

<h2 align="center">Tecnologías</h2>

<table align="center">
  <tr>
    <td align="center" width="33%"><img src="docs/assets/tech-react.svg" alt="" width="40"><br><strong>React Native</strong><br>Aplicaciones móviles</td>
    <td align="center" width="33%"><img src="docs/assets/tech-react.svg" alt="" width="40"><br><strong>React</strong><br>Interfaz administrativa</td>
    <td align="center" width="33%"><img src="docs/assets/tech-typescript.svg" alt="" width="40"><br><strong>TypeScript</strong><br>Lenguaje de desarrollo</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/tech-firebase.svg" alt="" width="40"><br><strong>Firebase</strong><br>Identidad y datos en tiempo real</td>
    <td align="center"><img src="docs/assets/tech-mapbox.svg" alt="" width="40"><br><strong>Mapbox</strong><br>Mapa y visualización de ruta</td>
    <td align="center"><img src="docs/assets/tech-cloudflare.svg" alt="" width="40"><br><strong>Cloudflare</strong><br>Worker y almacenamiento de PULSO</td>
  </tr>
</table>

<h2 align="center">Monorepo</h2>

<table align="center">
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="User/README.md"><code>User/</code></a></td><td>Aplicación para estudiantes</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="Driver/README.md"><code>Driver/</code></a></td><td>Aplicación para conductores</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="AdminWeb/README.md"><code>AdminWeb/</code></a></td><td>Panel administrativo</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="AdminWeb/monitor/"><code>AdminWeb/monitor/</code></a></td><td>Monitor de seguimiento</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="FirebaseLab/README.md"><code>FirebaseLab/</code></a></td><td>Laboratorio local de permisos de Firebase</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="docs/"><code>docs/</code></a></td><td>Documentación compartida</td></tr>
  <tr><td><img src="docs/assets/carpeta.svg" alt="" width="20"> <a href="scripts/"><code>scripts/</code></a></td><td>Utilidades del equipo</td></tr>
</table>

<a id="desarrollo"></a>
<h2 align="center">Documentación y desarrollo</h2>

<table align="center">
  <tr>
    <td align="center" width="50%">
      <strong>Ingeniería</strong><br>
      <a href="docs/architecture/overview.md">Arquitectura</a> ·
      <a href="docs/adr/README.md">Decisiones</a> ·
      <a href="docs/diagnostics/troubleshooting.md">Diagnóstico</a>
    </td>
    <td align="center" width="50%">
      <strong>Desarrollo</strong><br>
      <a href="docs/engineering/onboarding.md">Incorporación</a> ·
      <a href="docs/engineering/workflow.md">Flujo de trabajo</a> ·
      <a href="docs/engineering/versioning-and-releases.md">Versionado</a>
    </td>
  </tr>
</table>

<p align="center"><a href="FirebaseLab/README.md">FirebaseLab</a> · <a href="docs/AGENTS.md#7-mapa-de-documentos">Mapa de documentación</a></p>

<div align="center">
  <img src="docs/assets/linea.svg" alt="" width="960">
  <p><strong>well.</strong></p>
</div>
