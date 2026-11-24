import React from 'react';
import {AppRegistry, DeviceEventEmitter, PermissionsAndroid, Platform} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';
import {stopBusService, updateBusLocation} from '../src/services/firebase_service';

const mockNative = {start: jest.fn(), stop: jest.fn()};
const mockRef = jest.fn();
jest.mock('react-native-background-actions/src/RNBackgroundActionsModule', () => ({
  RNBackgroundActions: {
    start: (...args: unknown[]) => mockNative.start(...args),
    stop: () => mockNative.stop(),
  },
  nativeEventEmitter: {addListener: jest.fn()},
}));
jest.mock('@react-native-firebase/database', () => ({
  __esModule: true, default: () => ({ref: mockRef}),
}));
jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true, default: () => ({recordError: jest.fn()}),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true, default: () => ({signOut: jest.fn()}),
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {watchPosition: jest.fn(), clearWatch: jest.fn()},
}));
jest.mock('../src/services/firebase_service', () => ({
  updateBusLocation: jest.fn(), stopBusService: jest.fn(),
}));

type Action = () => Promise<void>;
type HeadlessTask = () => Promise<void>;
const position = {
  coords: {latitude: -12.058, longitude: -77.084, heading: null, speed: null},
};
const rosterData = {'12345678': {nombre: 'Chofer', apellidos: 'De Prueba'}};
type Watch = {
  position: (value: typeof position) => Promise<void>;
  error: (value: {message: string}) => void;
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const flushMicrotasks = async () => {
  for (let i = 0; i < 12; i++) { await Promise.resolve(); }
};

describe('I07 Paso 2: recursos reales de locationTask con wrapper JS real', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let emit: jest.SpyInstance;
  let interval: jest.SpyInstance;
  let clearIntervalSpy: jest.SpyInstance;
  let activeOwnTimers: Set<ReturnType<typeof setInterval>>;
  let nextWatch: number;
  let watches: Map<number, Watch>;
  let activeWatches: Set<number>;
  let factories: Map<string, () => HeadlessTask>;
  let entries: {promise: Promise<void>; finished: jest.Mock}[];
  let waits: ReturnType<typeof deferred>[];
  let operations: Promise<void>[];
  let lastStop: Action | undefined;

  const wait = () => {
    const pending = deferred();
    waits.push(pending);
    return pending;
  };
  const action = (label: string): Action => {
    let node = renderer.root.findByProps({children: label});
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) { throw new Error(`Acción no encontrada: ${label}`); }
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
    lastStop = action('DETENER RECORRIDO');
    return result;
  };
  const stop = () => invoke(action('DETENER RECORRIDO'));
  const enter = (name: string) => {
    const factory = factories.get(name);
    if (!factory) { throw new Error(`Tarea no registrada: ${name}`); }
    const promise = factory()();
    const finished = jest.fn();
    promise.then(finished);
    entries.push({promise, finished});
    return promise;
  };
  const ownTimers = () => interval.mock.calls.flatMap((args, i) =>
    args[1] === 8000 || args[1] === 1000
      ? [{callback: args[0] as () => void, handle: interval.mock.results[i].value, delay: args[1]}]
      : [],
  );
  const messages = () => emit.mock.calls
    .filter(([event]) => event === 'PRO_DEBUG_LOG')
    .map(([, payload]) => payload.t as string);
  const currentWatch = () => {
    const value = watches.get(nextWatch);
    if (!value) { throw new Error('Observador no creado'); }
    return value;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 30, 9));
    jest.replaceProperty(Platform, 'OS', 'android');
    nextWatch = 100;
    watches = new Map();
    activeWatches = new Set();
    activeOwnTimers = new Set();
    factories = new Map();
    entries = [];
    waits = [];
    operations = [];
    lastStop = undefined;
    jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation((name, factory) => {
      factories.set(name, factory as () => HeadlessTask);
    });
    mockNative.start.mockReset().mockImplementation(async ({taskName}: {taskName: string}) => {
      // Despacho controlado: tarea real antes del ACK nativo. No copia el wrapper.
      enter(taskName);
    });
    mockNative.stop.mockReset().mockResolvedValue(undefined);
    jest.mocked(updateBusLocation).mockReset().mockResolvedValue(true);
    jest.mocked(stopBusService).mockReset().mockResolvedValue(true);
    jest.mocked(Geolocation.watchPosition).mockReset().mockImplementation((onPosition, onError) => {
      const id = ++nextWatch;
      watches.set(id, {
        position: onPosition as unknown as Watch['position'],
        error: onError as unknown as Watch['error'],
      });
      activeWatches.add(id);
      return id;
    });
    jest.mocked(Geolocation.clearWatch).mockReset().mockImplementation(id => { activeWatches.delete(id); });
    const once = jest.fn().mockResolvedValue({
      exists: () => true,
      val: () => ({nombre: 'Prueba', apellidos: 'Sintética'}),
      forEach: (callback: (child: unknown) => void) => callback({
        key: 'asignacion-prueba',
        val: () => ({fecha: '2026-10-30', activo: true, busId: 'AHK-459'}),
      }),
    });
    mockRef.mockReset().mockImplementation((path: string) => {
      if (path.startsWith('/directorio_choferes/')) {
        return {
          on: (_event: string, callback: (snapshot: unknown) => void) => callback({val: () => rosterData}),
          off: () => {},
        };
      }
      return {
        once,
        orderByChild: () => ({equalTo: () => ({once})}),
      };
    });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emit = jest.spyOn(DeviceEventEmitter, 'emit');
    const fakeSetInterval = globalThis.setInterval;
    const fakeClearInterval = globalThis.clearInterval;
    interval = jest.spyOn(globalThis, 'setInterval').mockImplementation((callback, delay, ...args) => {
      const handle = fakeSetInterval(callback, delay, ...args);
      if (delay === 8000 || delay === 1000) { activeOwnTimers.add(handle); }
      return handle;
    });
    clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval').mockImplementation(handle => {
      activeOwnTimers.delete(handle);
      fakeClearInterval(handle);
    });
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    await selectChofer();
  }, 15000); // Presupuesto del arranque en frío de React Native, no espera del motor.

  afterEach(async () => {
    await act(async () => {
      waits.forEach(pending => pending.resolve());
      await Promise.all(operations);
      if (lastStop) { await lastStop(); }
      await flushMicrotasks();
      renderer.unmount();
    });
    await BackgroundJob.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('limpia el watch correcto y ambos temporizadores antes del ACK nativo/Firebase', async () => {
    await start();
    const id = nextWatch;
    const timers = ownTimers();
    expect(timers).toHaveLength(2);
    const nativeStop = wait();
    const remote = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    jest.mocked(stopBusService).mockReturnValueOnce(remote.promise.then(() => true));
    const stopping = await stop();

    expect(Geolocation.clearWatch).toHaveBeenCalledWith(id);
    expect(emit.mock.calls).toContainEqual(['PRO_DEBUG_LOG', expect.objectContaining({type: 'info', t: expect.stringContaining('Limpieza local de recursos GPS procesada')})]);
    expect(emit.mock.calls).toContainEqual(['PRO_DEBUG_LOG', expect.objectContaining({type: 'success', t: expect.stringContaining('Servicio Android iniciado · bus AHK-459')})]);
    expect(activeWatches.size).toBe(0);
    timers.forEach(timer => expect(clearIntervalSpy).toHaveBeenCalledWith(timer.handle));
    expect(entries[0].finished).toHaveBeenCalledTimes(1);
    expect(stopBusService).not.toHaveBeenCalled();
    await act(async () => { nativeStop.resolve(); await flushMicrotasks(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(24000); });
    expect(updateBusLocation).not.toHaveBeenCalled();
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(action('INICIAR RECORRIDO')).toBeDefined(); // El ACK remoto no bloquea el cierre local.
    await act(async () => { remote.resolve(); await stopping.operation; });
    expect(activeOwnTimers.size).toBe(0);
  });

  it('la limpieza repetida no vuelve a liberar el mismo watch', async () => {
    await start();
    const oldKeepAlive = ownTimers().find(timer => timer.delay === 1000)!.callback;
    const id = nextWatch;
    const stopping = await stop();
    await stopping.operation;
    await act(async () => { oldKeepAlive(); oldKeepAlive(); await lastStop!(); });
    expect(jest.mocked(Geolocation.clearWatch).mock.calls).toEqual([[id]]);
    expect(activeWatches.size).toBe(0);
    expect(activeOwnTimers.size).toBe(0);
  });

  it('distingue la limpieza local del fallo al liberar el observador', async () => {
    await start();
    jest.mocked(Geolocation.clearWatch).mockImplementationOnce(() => {
      throw new Error('liberación sintética');
    });
    await (await stop()).operation;
    const logs = emit.mock.calls.filter(([event]) => event === 'PRO_DEBUG_LOG').map(([, payload]) => payload);
    expect(logs).toContainEqual(expect.objectContaining({type: 'error', t: expect.stringContaining('Error liberando observador GPS: liberación sintética')}));
    expect(logs).toContainEqual(expect.objectContaining({type: 'info', t: expect.stringContaining('Limpieza local de recursos GPS procesada')}));
    expect(logs.find(log => log.t.includes('Limpieza local')).t).not.toContain('PARADA REMOTA');
  });

  it('callbacks GPS y de error tardíos no publican, no pulsan ni emiten diagnósticos viejos', async () => {
    await start();
    const old = currentWatch();
    const stopping = await stop();
    await stopping.operation;
    const events = emit.mock.calls.length;
    await old.position(position);
    old.error({message: 'error GPS antiguo'});
    expect(updateBusLocation).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(events);
  });

  it('un callback heartbeat ya capturado pierde autorización después de detener', async () => {
    await start();
    await act(async () => { await currentWatch().position(position); });
    const oldHeartbeat = ownTimers().find(timer => timer.delay === 8000)!.callback;
    const stopping = await stop();
    await stopping.operation;
    const events = emit.mock.calls.length;
    oldHeartbeat();
    await flushMicrotasks();
    expect(updateBusLocation).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(events);
  });

  it.each(['éxito', 'false', 'rechazo'])(
    'una escritura pendiente que termina con %s no altera la ejecución nueva', async outcome => {
      await start();
      const pending = wait();
      jest.mocked(updateBusLocation).mockReturnValueOnce(pending.promise.then(() => outcome !== 'false'));
      const writing = currentWatch().position(position);
      const stopping = await stop();
      await stopping.operation;
      await start();
      await act(async () => { await currentWatch().position(position); });
      const events = emit.mock.calls.length;
      await act(async () => {
        if (outcome === 'rechazo') { pending.reject(new Error('respuesta antigua')); }
        else { pending.resolve(); }
        await writing;
      });
      expect(emit).toHaveBeenCalledTimes(events);
      expect(BackgroundJob.isRunning()).toBe(true);
      expect(mockNative.stop).toHaveBeenCalledTimes(1);
      expect(activeWatches.size).toBe(1);
    },
  );

  it('GPS/heartbeat nuevos siguen normales y la limpieza A no afecta B ni introduce stop global', async () => {
    await start();
    const watchA = currentWatch();
    const idA = nextWatch;
    const timersA = ownTimers();
    await (await stop()).operation;
    await start();
    const idB = nextWatch;
    const timersB = ownTimers().slice(2);
    await act(async () => {
      timersA.forEach(timer => timer.callback());
      await watchA.position(position);
      await currentWatch().position(position);
      await jest.advanceTimersByTimeAsync(8000);
    });
    expect(jest.mocked(Geolocation.clearWatch).mock.calls).toEqual([[idA]]);
    expect(activeWatches).toEqual(new Set([idB]));
    timersB.forEach(timer => expect(clearIntervalSpy).not.toHaveBeenCalledWith(timer.handle));
    expect(updateBusLocation).toHaveBeenCalledTimes(2);
    expect(updateBusLocation).toHaveBeenLastCalledWith('AHK-459', {
      latitude: -12.058, longitude: -77.084, heading: 0, speed: 0,
      timestamp: Date.now(),
    });
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(BackgroundJob.isRunning()).toBe(true);
    expect(entries[0].finished).toHaveBeenCalledTimes(1);
    expect(entries[1].finished).not.toHaveBeenCalled();
  });

  it('tres ciclos rápidos no acumulan watchers/timers propios ni paradas automáticas', async () => {
    for (let i = 1; i <= 3; i++) {
      await start();
      expect(activeWatches.size).toBe(1);
      await (await stop()).operation;
      await flushMicrotasks();
      expect(activeWatches.size).toBe(0);
      expect(activeOwnTimers.size).toBe(0);
      expect(mockNative.stop).toHaveBeenCalledTimes(i);
      expect(entries[i - 1].finished).toHaveBeenCalledTimes(1);
    }
    expect(Geolocation.clearWatch).toHaveBeenCalledTimes(3);
  });

  it('la recuperación limpia A antes de B y los callbacks de A no alcanzan B', async () => {
    await start();
    const idA = nextWatch;
    const old = currentWatch();
    const oldKeepAlive = ownTimers().find(timer => timer.delay === 1000)!.callback;
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(jest.mocked(Geolocation.clearWatch).mock.calls).toEqual([[idA]]);
    const idB = nextWatch;
    await act(async () => { oldKeepAlive(); await old.position(position); });
    expect(activeWatches).toEqual(new Set([idB]));
    expect(updateBusLocation).not.toHaveBeenCalled();
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(messages().some(text => text.includes('Servicio Android reiniciado'))).toBe(true);
  });

  it('keepAlive conserva la limpieza de respaldo sin disparar otra parada global', async () => {
    await start();
    const id = nextWatch;
    await BackgroundJob.stop();
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(jest.mocked(Geolocation.clearWatch).mock.calls).toEqual([[id]]);
    expect(activeWatches.size).toBe(0);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(entries[0].finished).toHaveBeenCalledTimes(1);
  });

  it('una entrada HeadlessJS cancelada y tardía no adquiere recursos (envoltura residual pendiente)', async () => {
    mockNative.start.mockResolvedValueOnce(undefined); // ACK sin entregar aún la tarea.
    await start();
    const name = mockNative.start.mock.calls[0][0].taskName;
    await (await stop()).operation;
    enter(name);
    await flushMicrotasks();
    expect(Geolocation.watchPosition).not.toHaveBeenCalled();
    expect(ownTimers()).toHaveLength(0);
    expect(entries[0].finished).not.toHaveBeenCalled();
    // No se declara solucionada la envoltura tardía: solo ausencia de recursos.
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('no limpia prematuramente mientras start espera ACK, pero DETENER sí limpia antes del ACK', async () => {
    const nativeStart = wait();
    mockNative.start.mockImplementationOnce(({taskName}: {taskName: string}) => {
      enter(taskName);
      return nativeStart.promise;
    });
    const starting = await start();
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(activeWatches.size).toBe(1);
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();
    const stopping = await stop();
    expect(activeWatches.size).toBe(0);
    expect(mockNative.stop).not.toHaveBeenCalled();
    await act(async () => {
      nativeStart.resolve();
      await Promise.all([starting.operation, stopping.operation]);
    });
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(entries[0].finished).toHaveBeenCalledTimes(1);
    expect(activeOwnTimers.size).toBe(0);
  });
});
