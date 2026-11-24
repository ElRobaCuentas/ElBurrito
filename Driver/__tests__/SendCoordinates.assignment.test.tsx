import React from 'react';
import {Alert, AppRegistry, DeviceEventEmitter, PermissionsAndroid, Platform} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';

// I08: aceptación de fecha, respaldo B e identidad del recorrido (Pasos 1 y 2).
// Los tres casos originales del Paso 0 ya esperan el comportamiento corregido.
// La frontera nativa se simula; SendCoordinates y firebase_service son reales.

const mockNative = {start: jest.fn(), stop: jest.fn()};
const mockRef = jest.fn();
const mockUpdate = jest.fn();
const mockRecordError = jest.fn();

jest.mock('react-native-background-actions/src/RNBackgroundActionsModule', () => ({
  RNBackgroundActions: {
    start: (...args: unknown[]) => mockNative.start(...args),
    stop: () => mockNative.stop(),
  },
  nativeEventEmitter: {addListener: jest.fn()},
}));
jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: () => ({ref: (path: string) => mockRef(path)}),
}));
jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  default: () => ({recordError: mockRecordError}),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({signOut: jest.fn()}),
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {watchPosition: jest.fn(), clearWatch: jest.fn()},
}));

type Action = () => Promise<void>;

interface AssignmentRow {
  key: string;
  fecha: string;
  activo: boolean;
  busId: string;
  choferId?: string;
}
interface AssignmentSnapshot {
  exists: () => boolean;
  forEach: (callback: (child: {key: string; val: () => Omit<AssignmentRow, 'key'>}) => void) => void;
}
interface Gate {
  promise: Promise<AssignmentSnapshot>;
  resolve: (value: AssignmentSnapshot) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

const position = {
  coords: {latitude: -12.058, longitude: -77.084, heading: null, speed: null},
};
const rosterData = {'12345678': {nombre: 'Chofer', apellidos: 'De Prueba'}};
type PositionCallback = (value: typeof position) => Promise<void>;

const snapshotOf = (rows: AssignmentRow[]): AssignmentSnapshot => ({
  exists: () => rows.length > 0,
  forEach: callback =>
    rows.forEach(row =>
      callback({
        key: row.key,
        val: () => ({fecha: row.fecha, activo: row.activo, busId: row.busId, choferId: row.choferId}),
      }),
    ),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};

describe('I08 Pasos 1 y 2: asignación diaria, respaldo B e identidad del recorrido', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let emit: jest.SpyInstance;
  let alert: jest.SpyInstance;
  let factories: Map<string, () => () => Promise<void>>;
  let positions: PositionCallback[];
  let operations: Promise<void>[];
  let gates: Gate[];
  let queuedGates: Gate[];
  let currentRows: AssignmentRow[];
  let connected: boolean | undefined;
  let readError: Error | undefined;
  let assignmentQueries: number;
  let lastStop: Action | undefined;

  const newGate = (): Gate => {
    const pending = deferred<AssignmentSnapshot>();
    const gate: Gate = {
      promise: pending.promise,
      resolve: value => {
        gate.settled = true;
        pending.resolve(value);
      },
      reject: error => {
        gate.settled = true;
        pending.reject(error);
      },
      settled: false,
    };
    gates.push(gate);
    queuedGates.push(gate);
    return gate;
  };

  const mount = async () => {
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
      await flushMicrotasks();
    });
  };

  const settle = async (gate: Gate, rows: AssignmentRow[]) => {
    currentRows = rows;
    await act(async () => {
      gate.resolve(snapshotOf(rows));
      await flushMicrotasks();
    });
    await selectChofer(false);
  };

  const remount = async () => {
    await act(async () => {
      renderer.unmount();
    });
    await mount();
    if (hasText('DETENER RECORRIDO')) {
      lastStop = action('DETENER RECORRIDO');
    }
  };

  const action = (label: string): Action => {
    let node = renderer.root.findByProps({children: label});
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) {
        throw new Error(`Acción no encontrada: ${label}`);
      }
      node = node.parent;
    }
    return node.props.onPress;
  };

  const selectChofer = async (required = true) => {
    const opcion = renderer.root.findAll(node =>
      typeof node.props?.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Seleccionar a '),
    )[0];
    if (!opcion) {
      if (required) throw new Error('No hay chofer seleccionable');
      return;
    }
    await act(async () => { opcion.props.onPress(); });
  };

  const invoke = async (callback: Action) => {
    let operation!: Promise<void>;
    await act(async () => {
      operation = callback();
      operations.push(operation);
      await flushMicrotasks();
    });
    return {operation};
  };

  const start = async () => {
    await selectChofer(false);
    const result = await invoke(action('INICIAR RECORRIDO'));
    if (hasText('DETENER RECORRIDO')) lastStop = action('DETENER RECORRIDO');
    return result;
  };

  const stop = () => invoke(action('DETENER RECORRIDO'));

  const messages = () =>
    emit.mock.calls
      .filter(([event]) => event === 'PRO_DEBUG_LOG')
      .map(([, payload]) => payload.t as string);

  const hasText = (text: string) =>
    renderer.root.findAllByProps({children: text}).length > 0;

  const startedTitles = () =>
    mockNative.start.mock.calls.map(([options]) => String(options.taskTitle));

  const gpsPaths = () =>
    mockUpdate.mock.calls
      .filter(([, value]) => value.isActive === true)
      .map(([path]) => path as string);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-26T09:00:00-05:00'));
    jest.replaceProperty(Platform, 'OS', 'android');
    factories = new Map();
    positions = [];
    operations = [];
    gates = [];
    queuedGates = [];
    currentRows = [];
    connected = true;
    readError = undefined;
    assignmentQueries = 0;
    lastStop = undefined;
    jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation((name, factory) => {
      factories.set(name, factory as () => () => Promise<void>);
    });
    mockNative.start.mockReset().mockImplementation(async ({taskName}: {taskName: string}) => {
      const factory = factories.get(taskName);
      if (!factory) {
        throw new Error(`Tarea no registrada: ${taskName}`);
      }
      factory()();
    });
    mockNative.stop.mockReset().mockResolvedValue(undefined);
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockRecordError.mockReset();
    jest.mocked(Geolocation.watchPosition).mockReset().mockImplementation(callback => {
      positions.push(callback as unknown as PositionCallback);
      return positions.length;
    });
    jest.mocked(Geolocation.clearWatch).mockReset();

    const chofer = {
      exists: () => true,
      val: () => ({nombre: 'Prueba', apellidos: 'Sintética'}),
    };
    // Cada consulta a /asignaciones consume una respuesta encolada por el test.
    // Sin espera encolada, devolver los registros o el error controlado del SDK.
    mockRef.mockReset().mockImplementation((path: string) => {
      // Contrato real del SDK: las rutas especiales .info no admiten barra inicial.
      if (path.startsWith('/.info/')) {
        throw new Error('firebase.database() Paths can\'t contain "."');
      }
      if (path.startsWith('/directorio_choferes/')) {
        return {
          on: (_event: string, callback: (snapshot: unknown) => void) => callback({val: () => rosterData}),
          off: () => {},
        };
      }
      if (path.startsWith('/choferes/')) {
        return {once: () => Promise.resolve(chofer)};
      }
      if (path === '/asignaciones') {
        return {
          orderByChild: () => ({
            equalTo: () => ({
              once: () => {
                assignmentQueries += 1;
                const gate = queuedGates.shift();
                return gate ? gate.promise : readError ? Promise.reject(readError) : Promise.resolve(snapshotOf(currentRows));
              },
            }),
          }),
        };
      }
      if (path === '.info/connected') {
        return {once: () => Promise.resolve({val: () => connected})};
      }
      return {update: (values: Record<string, unknown>) => mockUpdate(path, values)};
    });

    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emit = jest.spyOn(DeviceEventEmitter, 'emit');
  }, 15000);

  afterEach(async () => {
    await act(async () => {
      gates.forEach(gate => {
        if (!gate.settled) {
          gate.resolve(snapshotOf([]));
        }
      });
      await Promise.all(operations);
      if (lastStop) {
        await lastStop();
      }
      await flushMicrotasks();
      renderer.unmount();
    });
    await BackgroundJob.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ACEPTACIÓN: el martes rechaza la asignación cargada el lunes y vuelve a consultar', async () => {
    const gate = newGate();
    await mount();

    await settle(gate, [
      {key: 'asignacion-lunes', fecha: '2026-10-26', activo: true, busId: 'AHK-459'},
    ]);
    expect(messages().some(text => text.includes('Bus asignado: AHK-459'))).toBe(true);
    expect(assignmentQueries).toBe(1);

    // Martes 27/10. El estado del componente aún conserva el bus del lunes.
    jest.setSystemTime(new Date('2026-10-27T09:00:00-05:00'));
    await (await start()).operation;

    expect(assignmentQueries).toBe(2);
    expect(startedTitles()).toEqual([]);
    expect(alert).toHaveBeenCalledWith('Bloqueo', expect.stringContaining('No tienes un bus'));
  }, 15000);

  it('ACEPTACIÓN: al remontar y cargar B, GPS y DETENER conservan el bus A original', async () => {
    const primera = newGate();
    await mount();
    await settle(primera, [
      {key: 'asignacion-a', fecha: '2026-10-26', activo: true, busId: 'AHK-459'},
    ]);
    await start();
    await act(async () => {
      await positions[0](position);
    });
    expect(gpsPaths()).toEqual(['/ubicacion_buses/AHK-459']);

    // Remontaje con otra asignación del mismo día: la pantalla nueva carga B.
    const segunda = newGate();
    await remount();
    await settle(segunda, [
      {key: 'asignacion-b', fecha: '2026-10-26', activo: true, busId: 'EAP-439'},
    ]);
    expect(messages().some(text => text.includes('Bus asignado: EAP-439'))).toBe(true);
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
    expect(gpsPaths()).toEqual(['/ubicacion_buses/AHK-459']);
    expect(backgroundRunning()).toBe(true);
    expect(mockNative.start).toHaveBeenCalledTimes(1);

    // El motor GPS sigue escribiendo en el bus con el que inició.
    await act(async () => {
      await positions[0](position);
    });
    expect(gpsPaths()).toEqual([
      '/ubicacion_buses/AHK-459',
      '/ubicacion_buses/AHK-459',
    ]);

    await (await stop()).operation;

    // DETENER solicita isActive:false para el bus original del recorrido.
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {
      isActive: false,
    });
    expect(mockUpdate).not.toHaveBeenCalledWith('/ubicacion_buses/EAP-439', {
      isActive: false,
    });
    expect(backgroundRunning()).toBe(false);
  }, 15000);

  function backgroundRunning() {
    return BackgroundJob.isRunning();
  }

  it('ACEPTACIÓN: una consulta que atraviesa medianoche no acepta el día anterior', async () => {
    jest.setSystemTime(new Date('2026-10-26T23:59:59-05:00'));
    const gate = newGate();
    await mount();
    expect(assignmentQueries).toBe(1);

    // La respuesta de Firebase llega ya pasada la medianoche del martes.
    jest.setSystemTime(new Date('2026-10-27T00:00:01-05:00'));
    await settle(gate, [
      {key: 'asignacion-lunes', fecha: '2026-10-26', activo: true, busId: 'AHK-459'},
    ]);

    expect(messages().some(text => text.includes('Bus asignado: AHK-459'))).toBe(false);

    await (await start()).operation;
    expect(assignmentQueries).toBe(2);
    expect(startedTitles()).toEqual([]);
    expect(hasText('Servicio de ubicación activo')).toBe(false);
  }, 15000);

  const today = (changes: Partial<AssignmentRow> = {}): AssignmentRow => ({
    key: 'asignacion-hoy', fecha: '2026-10-26', activo: true,
    busId: 'AHK-459', choferId: '12345678', ...changes,
  });

  const loadToday = async () => {
    const gate = newGate();
    await mount();
    await settle(gate, [today()]);
  };

  it.each(['B', 'cancelada', 'ausente'])('ACEPTACIÓN: falla la parada nativa y conserva A al remontar con asignación %s y reintentar', async scenario => {
    await loadToday();
    await (await start()).operation;
    mockNative.stop.mockRejectedValueOnce(new Error('fallo nativo de parada'));
    await (await stop()).operation;
    expect(hasText('No se pudo completar la detención')).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();

    currentRows = scenario === 'ausente' ? [] : [today({busId: 'EAP-439', activo: scenario === 'B'})];
    await remount();
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
    await (await stop()).operation;
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(hasText('Detenido')).toBe(true);
  });

  it('ACEPTACIÓN: continúa y recupera A tras medianoche y remontaje con B; un recorrido nuevo valida B', async () => {
    jest.setSystemTime(new Date('2026-10-26T23:59:59-05:00'));
    await loadToday();
    await (await start()).operation;
    jest.setSystemTime(new Date('2026-10-27T00:00:01-05:00'));
    currentRows = [today({key: 'martes', fecha: '2026-10-27', busId: 'EAP-439'})];
    await remount();
    const queriesBeforeRecovery = assignmentQueries;
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    expect(mockNative.stop).not.toHaveBeenCalled();

    // Sin posiciones: el watchdog existente recupera el mismo recorrido.
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta', 'El Bus AHK-459 está en ruta']);
    expect(assignmentQueries).toBe(queriesBeforeRecovery);
    await act(async () => { await positions[positions.length - 1](position); });
    expect(gpsPaths()).toEqual(['/ubicacion_buses/AHK-459']);
    await (await stop()).operation;
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});

    await (await start()).operation;
    expect(assignmentQueries).toBe(queriesBeforeRecovery + 1);
    expect(startedTitles()).toEqual([
      'El Bus AHK-459 está en ruta', 'El Bus AHK-459 está en ruta', 'El Bus EAP-439 está en ruta',
    ]);
    await (await stop()).operation;
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/EAP-439', {isActive: false});
  });

  it('ACEPTACIÓN: permite detener A mientras la asignación del remontaje sigue pendiente; la respuesta tardía no revive A', async () => {
    await loadToday();
    await (await start()).operation;
    const lateAssignment = newGate();
    await remount();
    const canStopWhileLoading = hasText('DETENER RECORRIDO');
    if (canStopWhileLoading) await (await stop()).operation;
    await settle(lateAssignment, [today({busId: 'EAP-439'})]);
    expect(canStopWhileLoading).toBe(true);
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
    expect(backgroundRunning()).toBe(false);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    await (await start()).operation;
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta', 'El Bus EAP-439 está en ruta']);
  });

  it('ACEPTACIÓN: inicio nativo A pendiente termina tras remontar con B y DETENER conserva A', async () => {
    await loadToday();
    const nativeStart = deferred<void>();
    mockNative.start.mockImplementationOnce(({taskName}: {taskName: string}) => {
      factories.get(taskName)!()();
      return nativeStart.promise;
    });
    const starting = await start();
    currentRows = [today({busId: 'EAP-439'})];
    await remount();
    await act(async () => { nativeStart.resolve(); await starting.operation; });
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
    await act(async () => { await positions[0](position); });
    expect(gpsPaths()).toEqual(['/ubicacion_buses/AHK-459']);
    await (await stop()).operation;
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
  });

  it('ACEPTACIÓN: recuperación A pendiente termina tras remontar con B sin cambiar de bus', async () => {
    await loadToday();
    await (await start()).operation;
    const recoveryStop = deferred<void>();
    mockNative.stop.mockReturnValueOnce(recoveryStop.promise);
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    currentRows = [today({busId: 'EAP-439'})];
    await remount();
    const queriesBeforeResume = assignmentQueries;
    await act(async () => { recoveryStop.resolve(); await flushMicrotasks(); });
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta', 'El Bus AHK-459 está en ruta']);
    expect(assignmentQueries).toBe(queriesBeforeResume);
    await (await stop()).operation;
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
  });

  it.each(['confirmación', 'fallo'])('ACEPTACIÓN: la %s remota tardía de A no borra la identidad del nuevo recorrido B', async outcome => {
    await loadToday();
    await (await start()).operation;
    const remoteA = deferred<void>();
    mockUpdate.mockReturnValueOnce(remoteA.promise);
    await (await stop()).operation;
    currentRows = [today({busId: 'EAP-439'})];
    await (await start()).operation;
    await act(async () => {
      if (outcome === 'fallo') remoteA.reject(new Error('parada A rechazada'));
      else remoteA.resolve();
      await flushMicrotasks();
    });
    currentRows = [today({busId: 'BUS-C'})];
    await remount();
    await act(async () => { await positions[positions.length - 1](position); });
    expect(gpsPaths()).toEqual(['/ubicacion_buses/EAP-439']);
    expect(startedTitles()).toContain('El Bus EAP-439 está en ruta');
    await (await stop()).operation;
    expect(mockUpdate.mock.calls.map(([path, values]) => [path, values.isActive])).toEqual([
      ['/ubicacion_buses/AHK-459', false],
      ['/ubicacion_buses/EAP-439', true],
      ['/ubicacion_buses/EAP-439', false],
    ]);
  });

  it('ACEPTACIÓN: INICIAR usa la asignación actualizada del SDK, no el bus mostrado anteriormente', async () => {
    await loadToday();
    currentRows = [today({busId: 'EAP-439'})];
    await (await start()).operation;
    expect(assignmentQueries).toBe(2);
    expect(startedTitles()).toEqual(['El Bus EAP-439 está en ruta']);
    expect(messages().some(text => text.includes('no garantiza confirmación remota reciente'))).toBe(true);
  });

  it.each([
    ['futura', {fecha: '2026-10-27'}],
    ['vencida', {fecha: '2026-10-25'}],
    ['cancelada', {activo: false}],
    ['otro conductor', {choferId: '87654321'}],
    ['bus inválido', {busId: 'bus/invalido'}],
    ['bus vacío', {busId: '   '}],
  ] as const)('ACEPTACIÓN: no inicia con asignación %s ni reutiliza el respaldo', async (_name, changes) => {
    await loadToday();
    currentRows = [today(changes)];
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Bloqueo', expect.any(String));
    // La respuesta conocida revocó el respaldo, incluso si luego desaparece la red.
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('ACEPTACIÓN: un conflicto de asignaciones activas bloquea sin elegir la última', async () => {
    await loadToday();
    currentRows = [today(), today({key: 'duplicada', busId: 'EAP-439'})];
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Bloqueo', expect.stringContaining('contradictorias'));
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('ACEPTACIÓN: permite inicio offline con respaldo válido del mismo usuario y día', async () => {
    await loadToday();
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
    expect(messages().some(text => text.includes('Puede haber cancelaciones remotas aún no recibidas'))).toBe(true);
    expect(emit.mock.calls).toContainEqual(['PRO_DEBUG_LOG', expect.objectContaining({type: 'warning', t: expect.stringContaining('Inicio sin conexión')})]);
  });

  it('describe el reintento de asignación como advertencia sin atribuirlo a la conexión', async () => {
    readError = new Error('PERMISSION_DENIED');
    await mount();
    expect(emit.mock.calls).toContainEqual(['PRO_DEBUG_LOG', expect.objectContaining({type: 'warning', t: expect.stringContaining('Reintentando la carga de asignación (2/2)')})]);
    expect(messages().some(text => text.includes('Problemas de conexión, reintentando'))).toBe(false);
  });

  it('ACEPTACIÓN: offline sin asignación previa no inicia', async () => {
    await mount(); // Firebase devuelve ausencia de asignación.
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('No se pudo validar la asignación', expect.any(String));
  });

  it('ACEPTACIÓN: offline no utiliza el respaldo de ayer', async () => {
    await loadToday();
    connected = false;
    readError = new Error('NETWORK_ERROR');
    jest.setSystemTime(new Date('2026-10-27T09:00:00-05:00'));
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it.each([true, undefined])('ACEPTACIÓN: timeout con conexión %s no autoriza por sí solo el respaldo', async status => {
    await loadToday();
    connected = status;
    newGate(); // La nueva lectura queda pendiente.
    const starting = await start();
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    await starting.operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it('ACEPTACIÓN: timeout solo permite respaldo con desconexión conocida y asignación vigente', async () => {
    await loadToday();
    connected = false;
    newGate();
    const starting = await start();
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    await starting.operation;
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
  });

  it('ACEPTACIÓN: PERMISSION_DENIED no se oculta con un respaldo offline', async () => {
    await loadToday();
    connected = false;
    readError = new Error('PERMISSION_DENIED');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it.each(['válida', 'cancelada'])('ACEPTACIÓN: respuesta tardía %s tras DETENER no inicia', async outcome => {
    await loadToday();
    const gate = newGate();
    const starting = await start();
    await (await stop()).operation;
    await settle(gate, [today({busId: 'EAP-439', activo: outcome === 'válida'})]);
    await starting.operation;
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(hasText('Servicio de ubicación activo')).toBe(false);
  });

  it('ACEPTACIÓN: una respuesta válida de un inicio cancelado no sustituye el respaldo vigente', async () => {
    await loadToday();
    const gate = newGate();
    const starting = await start();
    await (await stop()).operation;
    await settle(gate, [today({busId: 'EAP-439'})]);
    await starting.operation;
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(startedTitles()).toEqual(['El Bus AHK-459 está en ruta']);
  });

  it('ACEPTACIÓN: ausencia de asignaciones revoca un respaldo anterior del mismo día', async () => {
    await loadToday();
    currentRows = [];
    await (await start()).operation;
    connected = false;
    readError = new Error('NETWORK_ERROR');
    await (await start()).operation;
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('ACEPTACIÓN: cambia de conductor durante permisos pendientes y no inicia con la operación anterior', async () => {
    await loadToday();
    const permission = deferred<typeof PermissionsAndroid.RESULTS.GRANTED>();
    jest.mocked(PermissionsAndroid.request).mockReturnValueOnce(permission.promise);
    const starting = await start();
    currentRows = [today({choferId: '87654321', busId: 'EAP-439'})];
    await act(async () => {
      renderer.update(<SendCoordinates driverDni="87654321" />);
      await flushMicrotasks();
    });
    await act(async () => {
      permission.resolve(PermissionsAndroid.RESULTS.GRANTED);
      await starting.operation;
    });
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('ACEPTACIÓN: INICIAR a través de medianoche selecciona el nuevo día de Lima al recibir la respuesta', async () => {
    jest.setSystemTime(new Date('2026-10-27T04:59:59Z')); // Todavía lunes en Lima.
    await loadToday();
    const gate = newGate();
    const starting = await start();
    jest.setSystemTime(new Date('2026-10-27T05:00:00Z')); // Martes exactamente.
    await settle(gate, [today(), today({key: 'martes', fecha: '2026-10-27', busId: 'EAP-439'})]);
    await starting.operation;
    expect(startedTitles()).toEqual(['El Bus EAP-439 está en ruta']);
  });
});
