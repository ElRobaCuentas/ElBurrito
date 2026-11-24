import React from 'react';
import {DeviceEventEmitter, PermissionsAndroid} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';
import * as firebaseService from '../src/services/firebase_service';

const mockUpdate = jest.fn();
const mockRecordError = jest.fn();
const mockRef = jest.fn();
const mockOnce = jest.fn();

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
jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: {start: jest.fn(), stop: jest.fn(), isRunning: jest.fn()},
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {watchPosition: jest.fn(), clearWatch: jest.fn()},
}));

type PositionCallback = (position: {
  coords: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
  };
}) => Promise<void>;

const position = {
  coords: {latitude: -12.058, longitude: -77.084, heading: null, speed: null},
};
const rosterData = {'12345678': {nombre: 'Chofer', apellidos: 'De Prueba'}};
const epoch = new Date(2026, 9, 30, 9).getTime();

describe('I01: tarea real GPS → servicio Firebase → diagnóstico', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let onPosition: PositionCallback;
  let emit: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  let attempts: number[];

  const messages = () =>
    emit.mock.calls
      .filter(([event]) => event === 'PRO_DEBUG_LOG')
      .map(([, payload]) => payload.t as string);
  const successes = () => messages().filter(text => text.includes('Publicación de ubicación confirmada'));
  const failures = () => messages().filter(text => text.includes('FALLO FIREBASE'));
  const selectChofer = async () => {
    const opcion = renderer.root.findAll(node =>
      typeof node.props?.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Seleccionar a '),
    )[0];
    if (!opcion) throw new Error('No hay chofer seleccionable');
    await act(async () => { opcion.props.onPress(); });
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(epoch);
    attempts = [];
    mockUpdate.mockReset().mockImplementation(() => {
      attempts.push(Date.now() - epoch);
      return Promise.resolve();
    });
    mockRecordError.mockReset();
    mockOnce.mockReset().mockImplementation(() =>
      Promise.resolve({
        exists: () => true,
        val: () => ({nombre: 'Prueba', apellidos: 'Sintética'}),
        forEach: (callback: (child: unknown) => void) => callback({
          key: 'asignacion-prueba',
          val: () => ({fecha: '2026-10-30', activo: true, busId: 'EAP-439'}),
        }),
      }),
    );
    mockRef.mockReset().mockImplementation((path: string) => {
      if (path.startsWith('/directorio_choferes/')) {
        return {
          on: (_event: string, callback: (snapshot: unknown) => void) => callback({val: () => rosterData}),
          off: () => {},
        };
      }
      return {
        once: mockOnce,
        update: mockUpdate,
        orderByChild: () => ({equalTo: () => ({once: mockOnce})}),
      };
    });
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(false);
    jest.mocked(BackgroundJob.start).mockReset().mockImplementation(async () => {});
    jest.mocked(Geolocation.watchPosition).mockReset().mockReturnValue(7);
    const emitState = DeviceEventEmitter.emit.bind(DeviceEventEmitter);
    emit = jest.spyOn(DeviceEventEmitter, 'emit').mockImplementation((event, ...args) => {
      // El diagnóstico se observa sin renderizarlo, pero el estado compartido
      // debe llegar a la pantalla como en producción.
      if (event === 'PRO_TRACKING_STATE') emitState(event, ...args);
    });
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni="12345678" />);
    });
    await selectChofer();
    let start = renderer.root.findByProps({children: 'INICIAR RECORRIDO'});
    while (typeof start.props.onPress !== 'function') {
      if (!start.parent) throw new Error('Botón INICIAR RECORRIDO no encontrado');
      start = start.parent;
    }
    await act(async () => {
      await start.props.onPress();
    });
    const [locationTask, options] = jest.mocked(BackgroundJob.start).mock.calls[0];
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(true);
    locationTask(options.parameters);
    onPosition = jest.mocked(Geolocation.watchPosition).mock.calls[0][0] as unknown as PositionCallback;
  });

  afterEach(async () => {
    let stop = renderer.root.findByProps({children: 'DETENER RECORRIDO'});
    while (typeof stop.props.onPress !== 'function') {
      if (!stop.parent) throw new Error('Botón DETENER RECORRIDO no encontrado');
      stop = stop.parent;
    }
    await act(async () => { await stop.props.onPress(); });
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(false);
    await jest.advanceTimersByTimeAsync(1000);
    // Cierre por la API de la pantalla: también libera el estado compartido.
    await act(async () => renderer.unmount());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('confirma únicamente después del update real y conserva ruta, payload y opciones GPS', async () => {
    await onPosition(position);
    expect(successes()).toHaveLength(1);
    expect(failures()).toHaveLength(0);
    expect(mockRef).toHaveBeenCalledWith('/ubicacion_buses/EAP-439');
    expect(mockUpdate).toHaveBeenCalledWith({
      latitude: -12.058, longitude: -77.084, heading: 0, speed: 0,
      timestamp: epoch, isActive: true,
    });
    expect(Geolocation.watchPosition).toHaveBeenCalledWith(
      expect.any(Function), expect.any(Function),
      {enableHighAccuracy: true, distanceFilter: 2, interval: 3000, fastestInterval: 2000},
    );
  });

  it('respeta false del servicio real cuando RTDB rechaza y conserva el error técnico', async () => {
    const error = new Error('PERMISSION_DENIED');
    mockUpdate.mockRejectedValueOnce(error);
    const service = jest.spyOn(firebaseService, 'updateBusLocation');
    await onPosition(position);
    await expect(service.mock.results[0].value).resolves.toBe(false);
    expect(successes()).toHaveLength(0);
    expect(failures()).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith('Error actualizando ubicación del bus:', error);
    expect(mockRecordError).toHaveBeenCalledWith(error, 'updateBusLocation');
  });

  it('espera una escritura pendiente sin inventar éxito ni fallo', async () => {
    let resolve!: () => void;
    mockUpdate.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const pending = onPosition(position);
    await Promise.resolve();
    expect(messages()).toContainEqual(expect.stringContaining('GPS recibido: -12.05800, -77.08400'));
    expect(messages()).toContainEqual(expect.stringContaining('Publicación de ubicación solicitada'));
    expect(successes()).toHaveLength(0);
    expect(failures()).toHaveLength(0);
    resolve();
    await pending;
    expect(successes()).toHaveLength(1);
  });

  it('conserva el catch cuando una excepción escapa del servicio y resetea el reloj como antes', async () => {
    await jest.advanceTimersByTimeAsync(7000);
    mockUpdate.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    mockRecordError.mockImplementationOnce(() => { throw new Error('diagnóstico no disponible'); });
    await onPosition(position);
    expect(successes()).toHaveLength(0);
    expect(failures()[0]).toContain('diagnóstico no disponible');
    // El catch original resetea lastWriteAt: el heartbeat de t=8000 sí escribe.
    await jest.advanceTimersByTimeAsync(1000);
    expect(attempts).toEqual([8000]);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('informa false del heartbeat por la misma ruta sin agregar confirmaciones de heartbeat', async () => {
    await onPosition(position);
    mockUpdate.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await jest.advanceTimersByTimeAsync(8000);
    expect(messages().some(text => text.includes('HEARTBEAT'))).toBe(true);
    expect(failures()).toHaveLength(1);
    expect(successes()).toHaveLength(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it.each(['éxito', 'false', 'pendiente'])(
    'conserva lastWriteAt y heartbeat con resultado %s: intentos en 7000, 16000 y 24000 ms',
    async outcome => {
      let resolve: (() => void) | undefined;
      mockUpdate.mockImplementationOnce(() => {
        attempts.push(Date.now() - epoch);
        if (outcome === 'false') return Promise.reject(new Error('PERMISSION_DENIED'));
        if (outcome === 'pendiente') return new Promise<void>(done => { resolve = done; });
        return Promise.resolve();
      });
      await jest.advanceTimersByTimeAsync(7000);
      const first = onPosition(position);
      await Promise.resolve();
      if (outcome !== 'pendiente') await first;
      await jest.advanceTimersByTimeAsync(1000);
      expect(attempts).toEqual([7000]);
      await jest.advanceTimersByTimeAsync(16000);
      expect(attempts).toEqual([7000, 16000, 24000]);
      expect(emit.mock.calls.filter(([event]) => event === 'PRO_LOCATION_PULSE')).toHaveLength(3);
      resolve?.();
      await first;
    },
  );

  it('permite un nuevo callback GPS mientras una escritura anterior sigue pendiente', async () => {
    let resolve!: () => void;
    mockUpdate.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const first = onPosition(position);
    await jest.advanceTimersByTimeAsync(3000);
    await onPosition(position);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(successes()).toHaveLength(1);
    resolve();
    await first;
    expect(successes()).toHaveLength(2);
  });
});
