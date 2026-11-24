import React from 'react';
import {AppRegistry, AppState, DeviceEventEmitter, PermissionsAndroid, Platform} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';

const mockNative = {start: jest.fn(), stop: jest.fn()};
const mockRef = jest.fn();
const mockUpdate = jest.fn();
const mockRecordError = jest.fn();
// Wrapper y firebase_service reales; solo se simulan puentes/sensores/SDK.
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
  __esModule: true, default: () => ({recordError: mockRecordError}),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true, default: () => ({signOut: jest.fn()}),
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {watchPosition: jest.fn(), clearWatch: jest.fn()},
}));

type Action = () => Promise<void>;
const position = {
  coords: {latitude: -12.058, longitude: -77.084, heading: null, speed: null},
};
const rosterData = {'12345678': {nombre: 'Chofer', apellidos: 'De Prueba'}};
type PositionCallback = (value: typeof position) => Promise<void>;
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const flushMicrotasks = async () => {
  for (let i = 0; i < 12; i++) { await Promise.resolve(); }
};

describe('I07 Paso 3: cierre local, servicio Firebase real y orden de escrituras', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let emit: jest.SpyInstance;
  let permission: jest.SpyInstance;
  let appState: jest.SpyInstance;
  let factories: Map<string, () => () => Promise<void>>;
  let positions: PositionCallback[];
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
  const messages = () => emit.mock.calls
    .filter(([event]) => event === 'PRO_DEBUG_LOG')
    .map(([, payload]) => payload.t as string);
  const hasText = (text: string) => renderer.root.findAllByProps({children: text}).length > 0;
  const active = async () => {
    await start();
    await act(async () => { await positions[positions.length - 1](position); });
  };
  const remount = async () => {
    await act(async () => { renderer.unmount(); });
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    if (hasText('INICIAR RECORRIDO')) await selectChofer();
    if (hasText('DETENER RECORRIDO')) { lastStop = action('DETENER RECORRIDO'); }
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 30, 9));
    jest.replaceProperty(Platform, 'OS', 'android');
    factories = new Map();
    positions = [];
    operations = [];
    waits = [];
    lastStop = undefined;
    jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation((name, factory) => {
      factories.set(name, factory as () => () => Promise<void>);
    });
    mockNative.start.mockReset().mockImplementation(async ({taskName}: {taskName: string}) => {
      const factory = factories.get(taskName);
      if (!factory) { throw new Error(`Tarea no registrada: ${taskName}`); }
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
        update: (values: Record<string, unknown>) => mockUpdate(path, values),
        orderByChild: () => ({equalTo: () => ({once})}),
      };
    });
    permission = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    appState = jest.spyOn(AppState, 'addEventListener');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emit = jest.spyOn(DeviceEventEmitter, 'emit');
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    await selectChofer();
  }, 15000);

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

  it('finaliza localmente con Firebase pendiente, libera INICIAR y no reactiva el watchdog', async () => {
    await active();
    const remote = wait();
    mockUpdate.mockReturnValueOnce(remote.promise);
    const stopping = await stop();
    await stopping.operation; // No se resuelve remote: esto debe poder terminar.
    expect(BackgroundJob.isRunning()).toBe(false);
    expect(hasText('Detenido')).toBe(true);
    expect(action('INICIAR RECORRIDO')).toBeDefined();
    expect(messages().some(text => text.includes('PARADA LOCAL COMPLETADA'))).toBe(true);
    expect(messages().some(text => text.includes('PARADA REMOTA PENDIENTE'))).toBe(true);
    expect(messages().some(text => text.includes('PARADA REMOTA CONFIRMADA'))).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(120000); });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(Geolocation.clearWatch).toHaveBeenCalledWith(1);
  });

  it('mantiene Deteniendo mientras el nativo está pendiente y solicita false antes de liberar INICIAR', async () => {
    await active();
    const nativeStop = wait();
    const remote = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    mockUpdate.mockReturnValueOnce(remote.promise);
    const stopping = await stop();
    expect(hasText('Deteniendo…')).toBe(true);
    expect(hasText('Detenido')).toBe(false);
    expect(hasText('INICIAR RECORRIDO')).toBe(false);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    await act(async () => { nativeStop.resolve(); await stopping.operation; });
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
    expect(action('INICIAR RECORRIDO')).toBeDefined();
    expect(hasText('Detenido')).toBe(true);
  });

  it('confirma la parada remota después sin volver a escribir ni modificar el estado local', async () => {
    await active();
    const remote = wait();
    mockUpdate.mockReturnValueOnce(remote.promise);
    await (await stop()).operation;
    await act(async () => { remote.resolve(); await flushMicrotasks(); });
    expect(messages().some(text => text.includes('PARADA REMOTA CONFIRMADA'))).toBe(true);
    expect(hasText('Detenido')).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('el fallo remoto informa FALLIDA pero el GPS permanece detenido y se permite otro inicio', async () => {
    await active();
    const remote = wait();
    mockUpdate.mockReturnValueOnce(remote.promise);
    await (await stop()).operation;
    await act(async () => { remote.reject(new Error('PERMISSION_DENIED')); await flushMicrotasks(); });
    expect(messages().some(text => text.includes('PARADA REMOTA FALLIDA'))).toBe(true);
    expect(messages().some(text => text.includes('PARADA REMOTA CONFIRMADA'))).toBe(false);
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'stopBusService');
    expect(hasText('Detenido')).toBe(true);
    expect(BackgroundJob.isRunning()).toBe(false);
    await start();
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it.each(['confirmación', 'fallo'])(
    'ordena A:true → A:false → B:true y la %s tardía de A no altera B', async result => {
      await active();
      const oldPosition = positions[0];
      const remoteA = wait();
      mockUpdate.mockReturnValueOnce(remoteA.promise);
      await (await stop()).operation;
      await active(); // B publica sin confirmar la parada A.
      await oldPosition(position);
      expect(mockUpdate.mock.calls.map(([path, value]) => [path, value.isActive])).toEqual([
        ['/ubicacion_buses/AHK-459', true],
        ['/ubicacion_buses/AHK-459', false],
        ['/ubicacion_buses/AHK-459', true],
      ]);
      await act(async () => {
        if (result === 'fallo') { remoteA.reject(new Error('parada A rechazada')); }
        else { remoteA.resolve(); }
        await flushMicrotasks();
      });
      expect(hasText('Servicio de ubicación activo')).toBe(true);
      expect(hasText('INICIAR RECORRIDO')).toBe(false);
      expect(BackgroundJob.isRunning()).toBe(true);
      expect(mockNative.stop).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(messages().some(text => text.includes('operación anterior'))).toBe(true);

      await (await stop()).operation;
      expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([true, false, true, false]);
      expect(hasText('Detenido')).toBe(true);
    },
  );

  it('la respuesta A no finaliza ni desbloquea la parada nativa pendiente de B', async () => {
    await active();
    const remoteA = wait();
    mockUpdate.mockReturnValueOnce(remoteA.promise);
    await (await stop()).operation;
    await active();
    const nativeStopB = wait();
    mockNative.stop.mockReturnValueOnce(nativeStopB.promise);
    const stoppingB = await stop();
    await act(async () => { remoteA.resolve(); await flushMicrotasks(); });
    expect(hasText('Deteniendo…')).toBe(true);
    expect(hasText('INICIAR RECORRIDO')).toBe(false);
    expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([true, false, true]);
    await act(async () => { nativeStopB.resolve(); await stoppingB.operation; });
    expect(hasText('Detenido')).toBe(true);
  });

  it('si falla stop nativo no declara éxito, bloquea INICIAR y permite reintentar DETENER', async () => {
    const oldStart = action('INICIAR RECORRIDO');
    await active();
    mockNative.stop.mockRejectedValueOnce(new Error('fallo nativo de parada'));
    await (await stop()).operation;
    expect(hasText('No se pudo completar la detención')).toBe(true);
    expect(hasText('Detenido')).toBe(false);
    expect(hasText('INICIAR RECORRIDO')).toBe(false);
    expect(messages().some(text => text.includes('PARADA LOCAL COMPLETADA'))).toBe(false);
    expect(messages().some(text => text.includes('PARADA LOCAL NO CONFIRMADA'))).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1); // No inventa confirmación ni emite false.
    expect(Geolocation.clearWatch).toHaveBeenCalledWith(1);
    await BackgroundJob.stop(); // Aun si el singleton dice false, el fallo no se ignora.
    await invoke(oldStart);
    expect(mockNative.start).toHaveBeenCalledTimes(1);

    await (await stop()).operation;
    expect(hasText('Detenido')).toBe(true);
    expect(mockUpdate).toHaveBeenLastCalledWith('/ubicacion_buses/AHK-459', {isActive: false});
    await start();
    expect(mockNative.start).toHaveBeenCalledTimes(2);
  });

  it('pulsaciones repetidas durante/después del cierre local no duplican false mientras espera Firebase', async () => {
    await active();
    const nativeStop = wait();
    const remote = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    mockUpdate.mockReturnValueOnce(remote.promise);
    const stopAction = action('DETENER RECORRIDO');
    const first = await invoke(stopAction);
    const second = await invoke(stopAction);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      nativeStop.resolve();
      await Promise.all([first.operation, second.operation]);
    });
    await invoke(stopAction);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([true, false]);
    expect(hasText('Detenido')).toBe(true);
  });

  it('integración: cambiar a segundo plano y volver conserva GPS y heartbeat sin reiniciar', async () => {
    await active();
    const onState = appState.mock.calls[appState.mock.calls.length - 1][1];
    await act(async () => {
      onState('background');
      await jest.advanceTimersByTimeAsync(8000);
      onState('active');
    });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).not.toHaveBeenCalled();
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(hasText('Servicio de ubicación activo')).toBe(true);
  });

  it('integración: remontar un recorrido activo no duplica GPS y conserva su heartbeat', async () => {
    await active();
    await remount();
    await act(async () => { await jest.advanceTimersByTimeAsync(8000); });
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).not.toHaveBeenCalled();
    expect(Geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('integración: remontar durante stop pendiente mantiene Deteniendo y recibe el cierre local', async () => {
    await active();
    const nativeStop = wait();
    const remote = wait();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    mockUpdate.mockReturnValueOnce(remote.promise);
    const stopping = await stop();
    await remount();
    expect(hasText('Deteniendo…')).toBe(true);
    expect(hasText('Detenido')).toBe(false);
    expect(hasText('INICIAR RECORRIDO')).toBe(false);
    await act(async () => { nativeStop.resolve(); await stopping.operation; });
    expect(hasText('Detenido')).toBe(true);
    await active();
    expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([true, false, true]);
  });

  it.each(['antes', 'después'])(
    'integración: fallo nativo %s de remontar se muestra y puede reintentarse en la pantalla nueva', async when => {
      await active();
      const nativeStop = wait();
      mockNative.stop.mockReturnValueOnce(nativeStop.promise);
      const stopping = await stop();
      if (when === 'después') { await remount(); }
      await act(async () => {
        nativeStop.reject(new Error('fallo de parada durante cambio de pantalla'));
        await stopping.operation;
      });
      if (when === 'antes') { await remount(); }
      expect(hasText('No se pudo completar la detención')).toBe(true);
      expect(hasText('Detenido')).toBe(false);
      expect(hasText('INICIAR RECORRIDO')).toBe(false);
      await (await stop()).operation;
      expect(hasText('Detenido')).toBe(true);
      await active();
      expect(BackgroundJob.isRunning()).toBe(true);
    },
  );

  it('integración: un start nativo pendiente puede terminar después de remontar sin dejar UI Detenido', async () => {
    const nativeStart = wait();
    mockNative.start.mockImplementationOnce(({taskName}: {taskName: string}) => {
      const factory = factories.get(taskName)!;
      factory()();
      return nativeStart.promise;
    });
    const starting = await start();
    await remount();
    expect(hasText('Iniciando…')).toBe(true);
    expect(hasText('Detenido')).toBe(false);
    await act(async () => { nativeStart.resolve(); await starting.operation; });
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).not.toHaveBeenCalled();
  });

  it('integración: una recuperación pendiente termina sobre la pantalla nueva sin duplicarse', async () => {
    await start(); // Sin posición inicial: ausencia de pulsos controlada.
    const recoveryStop = wait();
    mockNative.stop.mockReturnValueOnce(recoveryStop.promise);
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    await remount();
    expect(hasText('Iniciando…')).toBe(true);
    await act(async () => { recoveryStop.resolve(); await flushMicrotasks(); });
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(Geolocation.clearWatch).toHaveBeenCalledWith(1);
    await act(async () => {
      await positions[1](position);
      await jest.advanceTimersByTimeAsync(8000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('integración: una recuperación que falla después de remontar no deja la UI compartiendo', async () => {
    await start();
    const recoveryStop = wait();
    mockNative.stop.mockReturnValueOnce(recoveryStop.promise);
    mockNative.start.mockRejectedValueOnce(new Error('recuperación fallida'));
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    await remount();
    await act(async () => { recoveryStop.resolve(); await flushMicrotasks(); });
    expect(hasText('Servicio de ubicación activo')).toBe(false);
    expect(hasText('Detenido')).toBe(true);
    expect(hasText('El envío de ubicación se detuvo y no pudo recuperarse automáticamente. Presiona INICIAR para reintentar.')).toBe(true);
    await active();
    expect(BackgroundJob.isRunning()).toBe(true);
  });

  it.each(['confirmación', 'fallo'])('integración: parada offline no revive al remontar; B acepta %s remota anterior', async result => {
    await active();
    const oldPosition = positions[0];
    const remoteA = wait();
    mockUpdate.mockReturnValueOnce(remoteA.promise);
    await (await stop()).operation;
    await remount();
    expect(hasText('Detenido')).toBe(true);
    await active();
    await act(async () => {
      if (result === 'fallo') { remoteA.reject(new Error('parada anterior rechazada')); }
      else { remoteA.resolve(); }
      await oldPosition(position);
      await flushMicrotasks();
    });
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([true, false, true]);
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('integración: cancelar recuperación, desmontar y completar las esperas no restaura el recorrido', async () => {
    await start();
    const recoveryStop = wait();
    mockNative.stop.mockReturnValueOnce(recoveryStop.promise);
    await act(async () => { await jest.advanceTimersByTimeAsync(40000); });
    const stopping = await stop();
    await act(async () => { renderer.unmount(); });
    await act(async () => { recoveryStop.resolve(); await stopping.operation; });
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    expect(hasText('Detenido')).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(90000); });
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls.map(([, value]) => value.isActive)).toEqual([false]);
  });

  it('integración: permisos de A cancelados no liberan el inicio B pendiente en otra pantalla', async () => {
    const permissionsA = wait();
    permission.mockReturnValueOnce(permissionsA.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const startingA = await start();
    await (await stop()).operation;
    await remount();
    const permissionsB = wait();
    permission.mockReturnValueOnce(permissionsB.promise.then(() => PermissionsAndroid.RESULTS.GRANTED));
    const startingB = await start();
    await act(async () => { permissionsA.resolve(); await startingA.operation; });
    expect(hasText('Iniciando…')).toBe(true);
    expect(hasText('INICIAR RECORRIDO')).toBe(false);
    expect(mockNative.start).not.toHaveBeenCalled();
    await act(async () => { permissionsB.resolve(); await startingB.operation; });
    expect(hasText('Servicio de ubicación activo')).toBe(true);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });
});
