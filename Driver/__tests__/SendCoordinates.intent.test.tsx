import React from 'react';
import {DeviceEventEmitter, PermissionsAndroid, Platform} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import {SendCoordinates} from '../src/screen/SendCoordinates';
import {stopBusService} from '../src/services/firebase_service';

const mockNative = {start: jest.fn(), stop: jest.fn()};
const mockRef = jest.fn();
const mockRecordError = jest.fn();

// Wrapper real: únicamente su frontera nativa está simulada. No invocamos aquí
// locationTask: GPS/heartbeat siguen cubiertos por I01; el Paso 0 cubre HeadlessJS.
jest.mock('react-native-background-actions/src/RNBackgroundActionsModule', () => ({
  RNBackgroundActions: {
    start: (...args: unknown[]) => mockNative.start(...args),
    stop: () => mockNative.stop(),
  },
  nativeEventEmitter: {addListener: jest.fn()},
}));
jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: () => ({ref: mockRef}),
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
jest.mock('../src/services/firebase_service', () => ({
  updateBusLocation: jest.fn(),
  stopBusService: jest.fn(),
}));

type Action = () => Promise<void>;
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const flushMicrotasks = async () => {
  for (let i = 0; i < 12; i++) { await Promise.resolve(); }
};

describe('I07 Paso 1: intención compartida y vigencia de operaciones', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let permission: jest.SpyInstance;
  let emit: jest.SpyInstance;
  let operations: Promise<void>[];
  let waits: ReturnType<typeof deferred>[];
  let lastStop: Action | undefined;

  const wait = () => {
    const result = deferred();
    waits.push(result);
    return result;
  };
  const action = (label: string): Action => {
    let node = renderer.root.findByProps({children: label});
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) { throw new Error(`Acción no encontrada: ${label}`); }
      node = node.parent;
    }
    return node.props.onPress;
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
    const result = await invoke(action('INICIAR RECORRIDO'));
    lastStop = action('DETENER RECORRIDO');
    return result;
  };
  const stop = () => invoke(action('DETENER RECORRIDO'));
  const messages = () => emit.mock.calls
    .filter(([event]) => event === 'PRO_DEBUG_LOG')
    .map(([, payload]) => payload.t as string);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 30, 9));
    jest.replaceProperty(Platform, 'OS', 'android');
    operations = [];
    waits = [];
    lastStop = undefined;
    mockNative.start.mockReset().mockResolvedValue(undefined);
    mockNative.stop.mockReset().mockResolvedValue(undefined);
    mockRecordError.mockReset();
    jest.mocked(stopBusService).mockReset().mockResolvedValue(true);
    const once = jest.fn().mockResolvedValue({
      exists: () => true,
      val: () => ({nombre: 'Prueba', apellidos: 'Sintética'}),
      forEach: (callback: (child: unknown) => void) => callback({
        key: 'asignacion-prueba',
        val: () => ({fecha: '2026-10-30', activo: true, busId: 'AHK-459'}),
      }),
    });
    mockRef.mockReset().mockReturnValue({
      once,
      orderByChild: () => ({equalTo: () => ({once})}),
    });
    permission = jest.spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    emit = jest.spyOn(DeviceEventEmitter, 'emit');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      waits.forEach(pending => pending.resolve());
      await Promise.all(operations);
      if (lastStop) { await lastStop(); }
      renderer.unmount();
    });
    await BackgroundJob.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('DETENER invalida antes del stop nativo y el watchdog no reinicia con Firebase pendiente', async () => {
    await start();
    const nativeStop = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    let stopping!: Promise<void>;
    // La llamada no devuelve ninguna promesa nativa resuelta al invalidar.
    act(() => {
      stopping = action('DETENER RECORRIDO')();
      operations.push(stopping);
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(120000); });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(messages().some(text => text.includes('Motor sin pulsos'))).toBe(false);

    const remote = wait();
    jest.mocked(stopBusService).mockReturnValueOnce(remote.promise.then(() => true));
    await act(async () => { nativeStop.resolve(); await flushMicrotasks(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(120000); });
    expect(stopBusService).toHaveBeenCalledWith('AHK-459');
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    // Paso 3: el cierre local libera INICIAR aunque Firebase siga pendiente.
    expect(action('INICIAR RECORRIDO')).toBeDefined();
    await act(async () => { remote.resolve(); await stopping; });
  });

  it('cancela una recuperación que espera stop y no ejecuta su siguiente start', async () => {
    await start();
    const recoveryStop = wait();
    mockNative.stop.mockReturnValueOnce(recoveryStop.promise);
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    expect(messages().some(text => text.includes('Motor sin pulsos'))).toBe(true);
    expect(emit.mock.calls).toContainEqual(['PRO_DEBUG_LOG', expect.objectContaining({type: 'warning', t: expect.stringContaining('Motor sin pulsos')})]);
    const stopping = await stop();
    expect(mockNative.stop).toHaveBeenCalledTimes(1);

    await act(async () => { recoveryStop.resolve(); await stopping.operation; });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).toHaveBeenCalledTimes(2);
    expect(messages().some(text => text.includes('Servicio Android reiniciado'))).toBe(false);
  });

  it('DETENER durante permisos impide el arranque cuando se conceden después', async () => {
    const permissions = wait();
    permission.mockReturnValueOnce(permissions.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const starting = await start();
    const stopping = await stop();
    await stopping.operation;
    await act(async () => { permissions.resolve(); await starting.operation; });

    expect(mockNative.start).not.toHaveBeenCalled();
    expect(action('INICIAR RECORRIDO')).toBeDefined();
  });

  it('dos pulsaciones de INICIAR comparten exclusión y solo solicitan un inicio', async () => {
    const permissions = wait();
    permission.mockReturnValueOnce(permissions.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const startAction = action('INICIAR RECORRIDO');
    const first = await invoke(startAction);
    const second = await invoke(startAction);
    lastStop = action('DETENER RECORRIDO');
    expect(permission).toHaveBeenCalledTimes(1);
    await act(async () => {
      permissions.resolve();
      await Promise.all([first.operation, second.operation]);
    });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });

  it('el finally de un inicio cancelado no libera el inicio pendiente de la generación nueva', async () => {
    const permissionsA = wait();
    permission.mockReturnValueOnce(permissionsA.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const startAction = action('INICIAR RECORRIDO');
    const first = await start();
    const stopping = await stop();
    await stopping.operation;

    const permissionsB = wait();
    permission.mockReturnValueOnce(permissionsB.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const second = await start();
    await act(async () => { permissionsA.resolve(); await first.operation; });
    expect(action('DETENER RECORRIDO')).toBeDefined();
    const permissionCalls = permission.mock.calls.length;
    await invoke(startAction);
    expect(permission).toHaveBeenCalledTimes(permissionCalls);
    expect(mockNative.start).not.toHaveBeenCalled();

    await act(async () => { permissionsB.resolve(); await second.operation; });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });

  it('permite un inicio legítimo después de parar y mantiene DETENER idempotente', async () => {
    await start();
    const nativeStop = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    const stopAction = action('DETENER RECORRIDO');
    const first = await invoke(stopAction);
    const second = await invoke(stopAction);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      nativeStop.resolve();
      await Promise.all([first.operation, second.operation]);
    });
    await start();
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it('el watchdog conserva la recuperación cuando el recorrido sigue autorizado', async () => {
    await start();
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(messages().some(text => text.includes('Servicio Android reiniciado'))).toBe(true);
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it('serializa DETENER detrás de un start pendiente y descarta su confirmación antigua', async () => {
    const nativeStart = wait();
    mockNative.start.mockReturnValueOnce(nativeStart.promise);
    const starting = await start();
    const stopping = await stop();
    expect(mockNative.stop).not.toHaveBeenCalled();
    await act(async () => {
      nativeStart.resolve();
      await Promise.all([starting.operation, stopping.operation]);
    });

    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(BackgroundJob.isRunning()).toBe(false);
    expect(messages().some(text => text.includes('Servicio Android iniciado'))).toBe(false);
    await start();
    expect(mockNative.start).toHaveBeenCalledTimes(2);
  });

  it('una recuperación legítima fallida libera sus controles y permite reintentar', async () => {
    await start();
    mockNative.start.mockRejectedValueOnce(new Error('fallo nativo sintético'));
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'restartBackgroundJob');
    expect(action('INICIAR RECORRIDO')).toBeDefined();
    await start();
    expect(mockNative.start).toHaveBeenCalledTimes(3);
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it('un inicio nativo cancelado que rechaza no altera la UI ni bloquea el siguiente inicio', async () => {
    const nativeStart = wait();
    mockNative.start.mockReturnValueOnce(nativeStart.promise);
    const starting = await start();
    const stopping = await stop();
    await act(async () => {
      nativeStart.reject(new Error('inicio antiguo rechazado'));
      await Promise.all([starting.operation, stopping.operation]);
    });
    expect(mockRecordError).not.toHaveBeenCalled();
    expect(action('INICIAR RECORRIDO')).toBeDefined();
    await start();
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it('conserva la intención y restaura el seguimiento activo al remontar la pantalla', async () => {
    await start();
    await act(async () => { renderer.unmount(); });
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    lastStop = action('DETENER RECORRIDO');
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).not.toHaveBeenCalled();
    expect(messages().some(text => text.includes('Recorrido restaurado'))).toBe(true);
  });
});
