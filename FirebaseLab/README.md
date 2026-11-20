# FirebaseLab — control local de permisos

Laboratorio independiente de SYTHOR para el Ecosistema El Burrito. No es un
repositorio Git ni está conectado a User, Driver o AdminWeb.

**Las reglas son locales y no están publicadas.** `database.rules.json` es la
política ficticia de control. `rules/i03-choferes.rules.json` conserva la
candidata histórica de conductores. `rules/i03-choferes-asignaciones.rules.json`
conserva la candidata acumulativa I03. `rules/i03-i04.rules.json` es la
candidata acumulativa vigente: conductores, asignaciones y comentarios.
Reproduce las reglas de referencia del usuario y modifica únicamente los nodos
indicados. Ninguna es una verificación de lo desplegado en Firebase Console.
Nunca ejecutar `deploy` ni copiarlas a producción sin autorización.

## Archivos de reglas

| Archivo | Uso |
|---|---|
| `database.rules.json` | Política ficticia de control para las seis pruebas originales. |
| `rules/i03-choferes.rules.json` | Candidata histórica I03 de conductores; se conserva intacta y no se usa en la regresión actual. |
| `rules/i03-choferes-asignaciones.rules.json` | Candidata acumulativa I03: conductores + asignaciones; se conserva intacta. |
| `rules/i03-i04.rules.json` | Candidata acumulativa vigente I03 + I04: conductores, asignaciones y comentarios. Es la política usada por las suites I03/I04; la suite de control conserva su política ficticia. |

En la candidata acumulativa vigente, `/choferes` conserva la regla aprobada
(administrador lee el catálogo; conductor lee su perfil mediante
`/choferes_uids/{auth.uid} === $dni`). En `/asignaciones` conserva la
restricción I03:

```json
".read": "auth != null && (root.child('administradores').child(auth.uid).exists() || (root.child('choferes_uids').child(auth.uid).isString() && query.orderByChild === 'choferId' && query.equalTo === root.child('choferes_uids').child(auth.uid).val()))"
```

El administrador conserva lectura completa. Un conductor solo obtiene la
consulta `orderByChild('choferId').equalTo(suDni)`. `.write` y `.indexOn` no
cambiaron; tampoco `/ubicacion_buses`.

`/comentarios` deja de aceptar cualquier escritura autenticada. Conserva
`.read: false` y `.write: false` en el padre; la creación solo se permite en un
hijo nuevo (`$comentarioId`) cuando `auth != null`, `!data.exists()` y
`newData.exists()`. `uid` debe ser string e igual a `auth.uid`; `rating` debe
ser un entero de 1 a 5. `mensaje` vacío es válido y los demás campos actuales
(`username`, `avatar`, `email`, `timestamp`) son opcionales con tipo validado.
No se permiten sobrescrituras, modificaciones, eliminaciones ni lecturas.

## Requisitos

- Node 24.12.0 o superior y npm.
- Firebase CLI global 15.20.0.
- Java 21 en `C:\Program Files\Android\Android Studio\jbr`.
- Puertos 9000, 9099, 4400 y 4500 libres.

Dos dependencias locales exactas: `@firebase/rules-unit-testing` 5.0.0 y
`firebase` 12.17.1. Se utiliza el runner incorporado `node:test`, sin Jest.
Para reinstalar desde el lockfile dentro de esta carpeta:

```powershell
cd C:\Movil\FirebaseLab
npm ci --cache .npm-cache --no-audit --no-fund
```

Las primeras descargas de paquetes y del binario RTDB requieren internet.
La caché npm indicada y la caché de emuladores `.cache/emulators` permanecen
en el laboratorio. No son bases de datos ni copias de datos productivos.

## Ejecutar la regresión de reglas

```powershell
cd C:\Movil\FirebaseLab
npm test
```

El comando valida configuración y puertos, selecciona Java 21 solo para el
proceso hijo, arranca Authentication y RTDB, ejecuta los cuatro archivos de
prueba de forma secuencial y detiene los emuladores mediante `emulators:exec`.
Un fallo devuelve código de salida distinto de cero. Repetir el comando realiza
un arranque nuevo y vuelve a cargar datos ficticios.

`tests/rules.test.js` conserva las seis pruebas originales de la política de
control:

- T1: lectura pública anónima permitida.
- T2: lectura privada anónima rechazada.
- T3: lectura del propietario permitida.
- T4: lectura de otro UID rechazada.
- T5: escritura prohibida rechazada.
- T6: configuraciones inseguras y servicios ausentes rechazados.

`tests/i03-choferes.test.js` conserva los 18 casos de conductores y se ejecuta
contra la candidata vigente: catálogo e individuos para administrador,
conductor y estudiante; usuario no autenticado; vínculo ausente, cruzado,
numérico y con objeto; escritura administrativa; escritura denegada para
conductor y estudiante; lectura cerrada de `/choferes_uids`; y perfil histórico
sin `uid`.

`tests/i03-asignaciones.test.js` conserva los 23 casos de asignaciones:
lectura completa e individual del administrador; consulta exacta del conductor;
denegación de otro DNI, colección completa, otro campo de ordenación y ausencia
de `equalTo`; estudiante y anónimo; vínculo ausente, cruzado, numérico y con
objeto; ceros iniciales; resultado vacío sin `PERMISSION_DENIED`; creación,
cancelación y edición de turnos por administrador; escritura denegada para
conductor y estudiante; dos conductores en el mismo bus; históricas y futuras;
comprobación administrativa de un bus; `/ubicacion_buses`; y ausencia de
lecturas individuales directas para el conductor.

`tests/i04-comentarios.test.js` añade 18 casos de comentarios: creación propia;
UID ajeno, ausente o no coincidente; usuario anónimo; sobrescritura;
modificación parcial; eliminación individual y de colección; lectura denegada;
ratings enteros válidos y fuera de rango o con tipo incorrecto; mensaje vacío;
timestamp de servidor; payload completo; actualización múltiple atómica;
escritura directa al padre; y campos obligatorios.

`--test-concurrency=1` evita que un archivo cambie reglas mientras otro
ejecuta pruebas. Cada archivo inicializa su propio entorno con su archivo de
reglas; las dos suites I03 y la suite I04 cargan la candidata acumulativa
vigente y el archivo de control carga `database.rules.json`. Los fixtures se
cargan con `withSecurityRulesDisabled`; las aserciones de permisos usan
clientes normales. `authenticatedContext` simula identidad para reglas: no es
una prueba de login. La disponibilidad del emulador Auth se comprueba
separadamente antes de cargar datos.

### Integración de Auth y RTDB

```powershell
npm run test:integration
```

Ejecuta `tests/auth-rtdb.integration.test.js`, que crea cuentas ficticias e
inicia sesión contra Auth Emulator para comprobar el acceso a RTDB con esa
identidad. A diferencia de `authenticatedContext`, ejercita el login local.
No utiliza cuentas ni servicios de producción.

Para ejecutar integración y regresión en un mismo arranque:

```powershell
npm run test:all
```

Ambos comandos usan las mismas validaciones, aislamiento y cierre de
emuladores que `npm test`. La ejecución sigue siendo secuencial.

## Modo interactivo

```powershell
npm run emulators
```

Detener con **Ctrl+C en esa misma terminal**. No ejecutar los comandos de
pruebas ni iniciar otro modo mientras este siga activo: el laboratorio
rechaza puertos ocupados. No matar procesos preexistentes para liberar puertos.

### Escenario B2 con datos ficticios

Desde `C:\Movil\FirebaseLab`:

```powershell
npm run b2
```

Arranca los emuladores, espera a que respondan y ejecuta `b2-seed.js` para
cargar `rules/i03-i04.rules.json`, cuentas ficticias y datos de ejemplo de
administración, conductores, bus y asignación.

**La carga reemplaza la raíz de datos de RTDB Emulator.** No conserva
ediciones de una sesión local previa. Las identidades de prueba se imprimen
en la terminal; no usar credenciales reales.

El modo permanece abierto hasta **Ctrl+C en esa misma terminal**. No inicia
AdminWeb ni cambia su conexión a Firebase. La URL que imprime el seed es
solo una referencia: abrir AdminWeb normalmente no lo conecta al laboratorio.

## Aislamiento

- Proyecto fijo y exclusivo: `demo-el-burrito-i03i04`.
- Namespace RTDB explícito con ese mismo nombre, tanto en CLI como en tests.
- Auth: `127.0.0.1:9099`; RTDB: `127.0.0.1:9000`.
- Hub `127.0.0.1:4400` y logging `127.0.0.1:4500` son servicios auxiliares
  internos de Emulator Suite; la interfaz web está deshabilitada.
- Sin credenciales, URL real de RTDB, `.firebaserc` ni detección de producción.
- `lab.js` rechaza proyectos/endpoints/variables contradictorios antes de
  iniciar. Los tests comprueban ambos servicios con timeout y sin redirects
  antes de inicializar Firebase o escribir fixtures.
- Una ejecución directa de `node --test tests/rules.test.js` sin emuladores
  debe fallar; no hay fallback a Firebase real.
- La política de control usa solo rutas ficticias `/publico`, `/privado/{uid}` y `/bloqueado`.
- La candidata vigente usa rutas reales de conductores, asignaciones y comentarios con datos exclusivamente ficticios.
- Los logs automáticos de Firebase quedan en esta carpeta. No se exportan datos.

No se cambian variables globales de Windows. No usar comandos `deploy`,
credenciales reales ni las cuentas del ecosistema en este laboratorio.
