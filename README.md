# El Burrito

![El Burrito](assets/readme-title.gif)

El Burrito permite a los estudiantes de la Universidad Nacional Mayor de
San Marcos (UNMSM) consultar dónde está el bus universitario mientras
esperan en el campus. Muestra en el mapa la ubicación que transmite el
conductor, junto con la ruta y los paraderos.

Este repositorio contiene la app de estudiantes, identificada en el código
como **BurritoUserApp**. No captura el GPS del bus ni inicia o detiene sus
recorridos: recibe las ubicaciones de **BurritoDriverApp**. La gestión de
conductores, buses y asignaciones corresponde a **AdminWeb**.

## Qué permite hacer

- Consultar la posición y orientación del bus sobre un mapa de Mapbox.
- Ver la ruta del campus y seleccionar sus paraderos.
- Iniciar sesión con correo y contraseña o con Google.
- Cambiar entre tema claro y oscuro; la preferencia se conserva.
- Enviar una calificación y un comentario desde el menú lateral.

### Alcance actual

La app está orientada a **Android**; iOS no está configurado ni soportado.
Aunque recibe ubicaciones de varias unidades, el mapa muestra **un solo
bus**: selecciona la unidad activa con la publicación más reciente. La
visualización simultánea de varios buses queda fuera de esta versión.

La ubicación depende de las publicaciones del conductor y de la conexión
con Firebase; no es una predicción del tiempo de llegada.

## Preparar el entorno

El proyecto utiliza React Native CLI, no Expo. Para trabajar en Android:

| Requisito | Referencia |
|-----------|------------|
| Node.js y npm | Node **20.19.4 o superior**, según React Native 0.83. El manifiesto local declara `>=20`. |
| Java | **JDK 17**, recomendado por React Native 0.83. |
| Android Studio y SDK | SDK **36**, Build Tools **36.0.0** y NDK **27.1.12297006**, declarados en `android/build.gradle`. |
| Dispositivo o emulador | Android **API 24 o superior**, con depuración habilitada. |
| Servicios | Configuración Android de Firebase, token público de Mapbox y cliente web de Google Sign-In. |

La [guía de entorno de React Native 0.83](https://reactnative.dev/docs/0.83/set-up-your-environment)
explica la instalación de las herramientas y las variables del SDK. Los
valores Android de este repositorio están en
[`android/build.gradle`](android/build.gradle).

## Ejecutar en Android

Desde la raíz del repositorio:

1. Instalar las dependencias:

   ```bash
   npm install
   ```

2. Disponer de `android/app/google-services.json` correspondiente al proyecto
   Firebase usado para desarrollo. No asumir que una copia del repositorio
   contiene una configuración válida para otro entorno.

3. Crear `.env` en la raíz con los valores de ese entorno:

   ```dotenv
   MAPBOX_PUBLIC_TOKEN=<token_publico_de_mapbox>
   GOOGLE_WEB_CLIENT_ID=<id_del_cliente_web_de_google>
   ```

   Estos nombres están declarados en [`env.d.ts`](env.d.ts). No publicar el
   archivo `.env` ni agregar credenciales privadas al código.

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
| Ejecutar pruebas | `npm test` |
| Revisar lint | `npm run lint` |
| Comprobar tipos | `npx tsc --noEmit` |

La comprobación de tipos es un comando manual; no hay un script npm
`typecheck`. La [deuda de lint documentada](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/LINT_DEBT.md)
distingue los hallazgos preexistentes de los cambios nuevos.

## Organización del proyecto

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
Zustand → mapa**. El listener recibe `/ubicacion_buses`; los comentarios se
envían a `/comentarios`. La sesión se conserva con Zustand y AsyncStorage;
el arranque espera a restaurar la sesión y el tema antes de mostrar la
navegación.

La base técnica es React Native **0.83.1**, TypeScript estricto, Zustand
**5.x**, React Native Firebase **23.8.x**, `@rnmapbox/maps` **10.2.x** y
React Navigation. Las dependencias y scripts están en
[`package.json`](package.json).

## Documentación técnica

La documentación del Ecosistema El Burrito se mantiene en el repositorio
compartido [BurritoDocs](https://github.com/ElRobaCuentas/BurritoDocs). En el
workspace `C:\Movil`, ese repositorio corresponde a la carpeta hermana
`docs/`; no forma parte de este repositorio de la app.

| Documento | Contenido |
|-----------|-----------|
| [Arquitectura](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/ARCHITECTURE.md) | Componentes y flujo de datos entre aplicaciones. |
| [Esquema Firebase](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/FIREBASE_SCHEMA.md) | Nodos y payloads de Realtime Database. |
| [Diagnóstico](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/TROUBLESHOOTING.md) | Limitaciones y problemas conocidos. |
| [Decisiones](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/DECISIONS.md) | Decisiones de arquitectura e historial técnico. |
| [Roadmap](https://github.com/ElRobaCuentas/BurritoDocs/blob/main/ROADMAP.md) | Trabajo planificado después del MVP. |
| [Bugs resueltos](https://github.com/ElRobaCuentas/BurritoDocs/tree/main/BUGS_RESUELTOS) | Registro de correcciones por aplicación. |
