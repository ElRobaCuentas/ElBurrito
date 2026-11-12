# BurritoUserApp — AGENTS.md

## 1. Alcance

App pública de estudiantes (React Native): mapa y tracking. Las reglas comunes
del ecosistema están en `../AGENTS.md` y el procedimiento en
`../FLUJO_DE_TRABAJO.md`; consultalos antes de modificar código. Si no están
disponibles, informalo y no asumas que fueron cargados. Este archivo cubre solo
lo particular de esta app.

Prioridad: preservar la estabilidad del sistema y la consistencia entre código y
documentación. Ante la duda, modificar menos y preguntar antes de asumir. Evitá
refactors innecesarios.

---

## 2. Comandos

| Acción | Comando |
|--------|---------|
| Iniciar Metro | `npm start` |
| Android | `npm run android` |
| iOS | `npm run ios` |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |
| Formatear | `npx prettier --write <file>` |

Prettier 2.8.8: `singleQuote: true`, `arrowParens: 'avoid'`,
`trailingComma: 'all'`.

No existe npm script para typecheck. Ejecuta `npx tsc --noEmit` manualmente.

---

## 3. Arquitectura mínima

Entry point: `index.js` → `src/app/App.tsx`. La navegación es declarativa en
`StackNavigator.tsx` según `isLoggedIn`; no hay route guards manuales. `App.tsx`
espera `userStore._hasHydrated && themeStore._hasHydrated` antes de renderizar
`NavigationContainer`.

5 stores Zustand en `src/store/`. Los listeners de Firebase viven dentro de los
stores, no en componentes React:

| Store | Persistencia |
|-------|-------------|
| `userStore` | Zustand persist + AsyncStorage |
| `themeStore` | AsyncStorage manual |
| `mapStore` | Efímera |
| `burritoLocationStore` | Efímera (aquí vive el listener de tracking) |
| `drawerStore` | Efímera |

RTDB que toca la app: lectura `/ubicacion_buses`, escritura `/comentarios` y
`/usuarios/{uid}`. Payloads y flujo: `../docs/FIREBASE_SCHEMA.md` y
`../docs/ARCHITECTURE.md` §4–§5.

Nombres: stores `useXStore`, servicios `XService`, componentes PascalCase.
TypeScript en `strict: true`; estilos con `StyleSheet.create` al final del
archivo.

---

## 4. Reglas críticas

### 4.1 Sin persistencia Firebase

- **No reactives** `database().setPersistenceEnabled(true)`.
- Acumula ubicaciones durante micro-cortes de red y las reenvía en ráfaga al
  reconectar, haciendo que el bus "viaje en el tiempo" (ADR-003).
- La ubicación en tiempo real es efímera: cada pulso fallido se descarta y el
  siguiente (3 s) refleja la posición real.

### 4.2 Listeners fuera de React

- **No conectes** listeners de RTDB directamente a componentes React.
- Causa re-renders masivos en Mapbox: el canvas nativo no sigue el ritmo y cae
  el FPS.
- Usá `burritoLocationStore.startTracking()`, que canaliza los deltas por
  Zustand. `Map.tsx` usa selectores estrictos.

### 4.3 Sin gestión administrativa

- La gestión de conductores, buses y asignaciones **ya no vive aquí**. La app es
  de solo lectura respecto al tracking (auth, mapa y feedback).
- La creación de cuentas y la escritura de `/choferes`, `/buses`,
  `/asignaciones` y `/administradores` se hacen desde **AdminWeb**. No la
  reintroduzcas en UserApp.

### 4.4 Ciclo de tracking

- **No modifiques** el flujo `startTracking → listener RTDB → dedup → store` sin
  actualizar `../docs/ARCHITECTURE.md` §5.
- Es el corazón del sistema: cualquier cambio afecta cómo la app recibe
  ubicaciones. Trabajá dentro de `MapService.subscribeToBusLocation()` y
  `burritoLocationStore`.

### 4.5 Una sola fuente de estado

- **No crees** `useState` local para datos que ya existen en un store.
- Dos fuentes de verdad llevan a inconsistencias. Usá selectores de Zustand;
  para estado derivado, `useMemo` o selectores.

### 4.6 Paths de RTDB

- **No cambies** un path de RTDB sin actualizar `../docs/FIREBASE_SCHEMA.md`.
- Es la fuente de verdad: si el path cambia y el documento no, el próximo
  desarrollador escribirá en nodos inexistentes.

### 4.7 Dependencias nuevas

- **No introduzcas** librerías sin evaluar si lo existente alcanza. Cada
  dependencia aumenta el bundle y el riesgo de incompatibilidad con RN 0.83.1 +
  Firebase 23.8.x.
- Si la incorporación implica una decisión arquitectónica, registrala en
  `../docs/DECISIONS.md`. Las dependencias rutinarias no requieren un ADR.

### 4.8 Comentarios de advertencia

- **No elimines** comentarios con `//!`, `NO TOCAR` o `CAMBIO QUIRÚRGICO`.
- Son señales de peligro sobre código frágil (p. ej. `snapToRoute` comentado en
  `Map.tsx`). Si la advertencia ya no aplica, verificá el contexto antes de
  quitarla.

### 4.9 Trabajo futuro

- **No implementes** funcionalidades clasificadas como post-MVP en
  `../docs/ROADMAP.md` ni tareas del backlog sin autorización explícita.
- `ROADMAP.md` no impone una secuencia numérica: cada tarea depende solo de lo
  que allí se indica. No adelantes trabajo por número de fase.

### 4.10 Variables de entorno

- **No hardcodees** tokens en el código.
- `MAPBOX_PUBLIC_TOKEN` y `GOOGLE_WEB_CLIENT_ID` se acceden vía
  `import { VAR } from '@env'`.
- No leas ni muestres el archivo `.env` (protegido en la raíz). Si necesitás una
  variable nueva, declarala en `env.d.ts` y documentala en `README.md`, y pedile
  al usuario que la agregue a su archivo local.

### 4.11 Compatibilidad de plataforma

- **No asumas** que una dependencia funciona igual en Android e iOS
  (`react-native-haptic-feedback` es un caso conocido). Usá `Platform.OS` donde
  corresponda y evitá dependencias solo-Android.

### 4.12 Orden de plugins de Babel

- `react-native-reanimated/plugin` debe ser el **último** del array `plugins` de
  `babel.config.js`. Cualquier plugin nuevo va antes.

### 4.13 Contradicciones documentales

- Si detectás una contradicción que afecte el cambio en curso, detené la
  modificación y resolvé la inconsistencia con el usuario antes de continuar.

---

## 5. Pruebas

Las pruebas de `__tests__/` son contratos contra regresiones silenciosas:

- **No elimines** `calculateDistance.test.ts`, `getMovementStatus.test.ts`,
  `movement.test.ts` ni `burritoLocationStore.test.ts`.
- Si un refactor cambia la firma de `calculateDistance`, `getMovementStatus`,
  `evaluateMovementEvidence` o `nextMovementStatus`, actualizá los tests; no los
  borres.
- Si una dependencia nativa deja de ser compatible, mockeala con `jest.mock()`;
  no elimines la cobertura.
- Las tablas `test.each` son contratos ejecutables. El estado vigente del
  movimiento en vivo (estrategia C, C4.6) y la calibración pendiente están en
  `../docs/ARCHITECTURE.md` §5.3 y ADR-020.

---

## 6. Verificación

- `npx tsc --noEmit` sin errores.
- `npm run lint`: tu cambio no debe agregar hallazgos. La deuda preexistente
  (21 errores / 50 advertencias) está en `../docs/LINT_DEBT.md` y no se corrige
  dentro de otra tarea.
- `npm test` pasa.
- Sin `TODO` ni `console.log` temporales.
- Sin tokens ni variables hardcodeadas.
- Stores usados para datos compartidos (sin `useState` duplicado).
- Documentación sincronizada según `../AGENTS.md` §7.
