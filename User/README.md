# <img src="../docs/assets/readme-title.gif" alt="El Burrito" width="640">

El Burrito permite a los estudiantes de la Universidad Nacional Mayor de
San Marcos (UNMSM) consultar dónde está el bus universitario mientras
esperan en el campus. Muestra en el mapa la ubicación que transmite el
conductor, junto con la ruta y los paraderos.

Conoce los demás productos en el [README principal](../README.md).

## Qué permite hacer

- Consultar la ubicación y orientación del bus en el mapa.
- Ver la ruta del campus y seleccionar sus paraderos.
- Iniciar sesión con correo y contraseña o con Google.
- Cambiar entre tema claro y oscuro; la preferencia se conserva.
- Enviar una calificación y un comentario desde el menú lateral.

## Disponibilidad

El Burrito está desarrollado para **Android**. Este README todavía no ofrece
un enlace público de descarga o de instalación desde una tienda.

Las instrucciones de **Desarrollo local** son para ejecutar la aplicación
desde el código fuente; no son pasos que deba seguir un estudiante para
utilizar una versión ya instalada.

### Qué tener en cuenta

- El mapa muestra **un solo bus a la vez**; la visualización simultánea de
  varias unidades queda fuera de esta versión.
- La ubicación depende de la conexión y de las publicaciones del conductor;
  no es una predicción del tiempo de llegada.
- iOS no está configurado ni soportado.

## Desarrollo local

Esta sección está dirigida a quienes quieran trabajar en el código de la
aplicación.

### Requisitos

El proyecto utiliza React Native CLI, no Expo. Para trabajar en Android:

| Requisito | Referencia |
|-----------|------------|
| Node.js y npm | Node **20.19.4 o superior**, según React Native 0.83. |
| Java | **JDK 17**, recomendado por React Native 0.83. |
| Android Studio y SDK | SDK **36**, Build Tools **36.0.0** y NDK **27.1.12297006**, declarados en `android/build.gradle`. |
| Dispositivo o emulador | Android **API 24 o superior**, con depuración habilitada. |
| Servicios | Configuración Android de Firebase, token público de Mapbox y cliente web de Google Sign-In. |

La [guía de entorno de React Native 0.83](https://reactnative.dev/docs/0.83/set-up-your-environment)
explica la instalación de las herramientas y las variables del SDK. Los valores
Android de esta app están en
[`android/build.gradle`](android/build.gradle). El manifiesto local declara
Node `>=20`; para preparar el entorno debe respetarse el mínimo más
específico de React Native indicado arriba.

### Configuración y ejecución

Desde esta carpeta (`User/`):

1. Instalar las dependencias:

   ```bash
   npm install
   ```

2. Disponer de `android/app/google-services.json` correspondiente al proyecto
   Firebase usado para desarrollo. No asumir que una copia del repositorio
   contiene una configuración válida para otro entorno.

3. Crear `.env` en la raíz con la configuración de desarrollo propia.
   El siguiente ejemplo contiene solo nombres de variables y marcadores
   de posición, no valores del proyecto:

   ```dotenv
   MAPBOX_PUBLIC_TOKEN=<token_publico_de_mapbox>
   GOOGLE_WEB_CLIENT_ID=<id_del_cliente_web_de_google>
   ```

   Estos nombres están declarados en [`env.d.ts`](env.d.ts). El token de
   Mapbox debe ser público y el identificador de Google es un client ID,
   no un client secret. No publicar `.env` ni incluir tokens secretos,
   contraseñas o claves privadas en el código. Usar `.env` no convierte
   los valores utilizados por una aplicación cliente en secretos.

4. Conectar el dispositivo o iniciar el emulador. Arrancar Metro y, en otra
   terminal, instalar y abrir la aplicación:

   ```bash
   npm start
   ```

   ```bash
   npm run android
   ```

### Comandos de desarrollo

| Acción | Comando |
|--------|---------|
| Iniciar Metro | `npm start` |
| Ejecutar Android | `npm run android` |
| Ejecutar iOS (sin soporte funcional acreditado) | `npm run ios` |
| Ejecutar pruebas | `npm test` |
| Revisar lint | `npm run lint` |
| Comprobar tipos | `npx tsc --noEmit` |
| Formatear un archivo | `npx prettier --write <file>` |

La comprobación de tipos es un comando manual; no hay un script npm
`typecheck`. Los hallazgos de lint preexistentes se registran en la
documentación técnica enlazada al final.

### Organización del proyecto

Esta carpeta contiene **El Burrito**, identificado como `BurritoUserApp`
en la configuración de la app. Recibe las ubicaciones de **PILOTO**:
no captura el GPS del bus ni inicia o detiene sus recorridos. La gestión
de conductores, buses y asignaciones corresponde a **CENTRAL**.

```text
src/
├── app/          # Inicio, splash y navegación
├── features/
│   ├── auth/     # Sesión y pantallas de acceso
│   └── map/      # Mapa, paraderos, seguimiento y comentarios
├── shared/       # Configuración de Firebase y tema visual
└── store/        # Estado compartido con Zustand
```

El flujo de ubicación es **Firebase RTDB → servicio de mapa → store de
Zustand → mapa**. Se reciben ubicaciones de varias unidades desde
`/ubicacion_buses`, pero el mapa selecciona la unidad activa con la
publicación más reciente. Los comentarios se envían a `/comentarios`.
La sesión se conserva con Zustand y AsyncStorage; el arranque espera a
restaurar la sesión y el tema antes de mostrar la navegación.

La base técnica es React Native **0.83.1**, TypeScript estricto, Zustand
**5.x**, React Native Firebase **23.8.x**, `@rnmapbox/maps` **10.2.x** y
React Navigation. Las dependencias y scripts están en
[`package.json`](package.json).

## Documentación técnica

Para otros temas, consultar el [mapa de documentación del monorepo](../docs/AGENTS.md#7-mapa-de-documentos).

| Documento | Contenido |
|-----------|-----------|
| [Versionado y publicación](../docs/engineering/versioning-and-releases.md) | Procedimiento oficial de entregas Android, firmas, artefactos y distribución. |
| [Arquitectura](../docs/architecture/overview.md) | Componentes y flujo de datos entre aplicaciones. |
| [Esquema Firebase](../docs/architecture/firebase-schema.md) | Nodos y payloads de Realtime Database. |
| [Diagnóstico](../docs/diagnostics/troubleshooting.md) | Limitaciones y problemas conocidos. |
| [Decisiones](../docs/adr/README.md) | Decisiones de arquitectura e historial técnico. |
| [Roadmap](../docs/planning/roadmap.md) | Trabajo planificado después del MVP. |
| [Bugs resueltos](../docs/diagnostics/resolved-bugs/) | Registro de correcciones por aplicación. |
| [Deuda de lint](../docs/diagnostics/lint-debt.md) | Hallazgos preexistentes y criterios para distinguir cambios nuevos. |
| [AGENTS.md](AGENTS.md) | Instrucciones específicas para asistentes. |
