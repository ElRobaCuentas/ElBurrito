import React from 'react';
import {DeviceEventEmitter, PermissionsAndroid} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';

const mockRef = jest.fn();
const mockUpdate = jest.fn();
const mockRecordError = jest.fn();

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

const driverDni = '11112222';
const name = {nombre: 'Persona Ficticia', apellidos: 'Apellido Inventado'};
const position = {coords: {latitude: -12.058, longitude: -77.084, heading: null, speed: null}};
type PositionCallback = (value: typeof position) => Promise<void>;

describe('I11: privacidad del panel sin alterar los diagnósticos operativos', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let emit: jest.SpyInstance;
  let profileExists: boolean;
  let assignmentExists: boolean;

  const messages = () => emit.mock.calls
    .filter(([event]) => event === 'PRO_DEBUG_LOG')
    .map(([, payload]) => payload.t as string);
  const assertNoPersonalData = () => {
    const text = messages().join('\n');
    for (const personal of [driverDni, driverDni.substring(0, 6), name.nombre, name.apellidos]) {
      expect(text).not.toContain(personal);
    }
  };
  const action = (label: string): (() => Promise<void>) => {
    let node = renderer.root.findByProps({children: label});
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) throw new Error(`Acción no encontrada: ${label}`);
      node = node.parent;
    }
    return node.props.onPress;
  };
  const mount = async () => {
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni={driverDni} />);
    });
  };
  const start = async () => {
    await act(async () => { await action('INICIAR RECORRIDO')(); });
    const [task, options] = jest.mocked(BackgroundJob.start).mock.calls[0];
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(true);
    await act(async () => { task(options.parameters); });
    return jest.mocked(Geolocation.watchPosition).mock.calls[0][0] as unknown as PositionCallback;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T09:00:00-05:00'));
    profileExists = true;
    assignmentExists = true;
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockRecordError.mockReset();
    mockRef.mockReset().mockImplementation((path: string) => {
      if (path === `/choferes/${driverDni}`) {
        return {once: async () => ({exists: () => profileExists, val: () => name})};
      }
      if (path === '/asignaciones') {
        return {orderByChild: () => ({equalTo: () => ({once: async () => ({
          exists: () => assignmentExists,
          forEach: (callback: (child: unknown) => void) => {
            if (assignmentExists) callback({
              key: 'asignacion-ficticia',
              val: () => ({fecha: '2026-10-30', activo: true, busId: 'AHK-459'}),
            });
          },
        })})})};
      }
      return {update: mockUpdate};
    });
    jest.mocked(BackgroundJob.start).mockReset().mockResolvedValue(undefined);
    jest.mocked(BackgroundJob.stop).mockReset().mockResolvedValue(undefined);
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(false);
    jest.mocked(Geolocation.watchPosition).mockReset().mockReturnValue(7);
    jest.mocked(Geolocation.clearWatch).mockReset();
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emit = jest.spyOn(DeviceEventEmitter, 'emit');
  });

  afterEach(async () => {
    if (renderer) {
      if (renderer.root.findAllByProps({children: 'DETENER RECORRIDO'}).length) {
        await act(async () => { await action('DETENER RECORRIDO')(); });
      }
      await act(async () => renderer.unmount());
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('identifica al conductor sin imprimir su nombre y conserva el bus asignado', async () => {
    await mount();
    expect(messages()).toContainEqual(expect.stringMatching(/\] Conductor identificado$/));
    expect(messages()).toContainEqual(expect.stringContaining('Bus asignado: AHK-459'));
    assertNoPersonalData();
  });

  it('registra perfil no disponible sin imprimir DNI y conserva la consulta de asignación', async () => {
    profileExists = false;
    await mount();
    expect(messages()).toContainEqual(expect.stringMatching(/\] Perfil del conductor no disponible$/));
    expect(messages()).toContainEqual(expect.stringContaining('Bus asignado: AHK-459'));
    expect(mockRef).toHaveBeenCalledWith(`/choferes/${driverDni}`);
    assertNoPersonalData();
  });

  it('inicia sin imprimir el prefijo del DNI y conserva la identidad interna del servicio', async () => {
    await mount();
    await start();
    expect(messages()).toContainEqual(expect.stringMatching(/\] Preparando seguimiento GPS$/));
    expect(jest.mocked(BackgroundJob.start).mock.calls[0][1].parameters).toEqual(
      expect.objectContaining({uidChofer: driverDni, busId: 'AHK-459'}),
    );
    expect(messages()).toContainEqual(expect.stringContaining('Servicio Android iniciado · bus AHK-459'));
    assertNoPersonalData();
  });

  it('conserva coordenadas, confirmación Firebase, heartbeat y fallo de publicación', async () => {
    await mount();
    const onPosition = await start();
    await act(async () => { await onPosition(position); });
    expect(messages()).toContainEqual(expect.stringContaining('GPS recibido: -12.05800, -77.08400'));
    expect(messages()).toContainEqual(expect.stringContaining('Publicación de ubicación solicitada'));
    expect(messages()).toContainEqual(expect.stringContaining('Publicación de ubicación confirmada'));
    await act(async () => { await jest.advanceTimersByTimeAsync(8000); });
    expect(messages()).toContainEqual(expect.stringContaining('HEARTBEAT: -12.05800, -77.08400'));
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenCalledWith('/ubicacion_buses/AHK-459');
    const error = new Error('FALLO_SINTETICO');
    mockUpdate.mockRejectedValueOnce(error);
    await act(async () => { await onPosition(position); });
    expect(messages()).toContainEqual(expect.stringContaining('FALLO FIREBASE'));
    expect(mockRecordError).toHaveBeenCalledWith(error, 'updateBusLocation');
    assertNoPersonalData();
  });

  it('conserva el diagnóstico de asignación ausente', async () => {
    assignmentExists = false;
    await mount();
    expect(messages()).toContainEqual(expect.stringContaining('No tienes un bus asignado'));
    expect(BackgroundJob.start).not.toHaveBeenCalled();
    assertNoPersonalData();
  });
});
