import React from 'react';
import {Alert, PermissionsAndroid} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import {SendCoordinates} from '../src/screen/SendCoordinates';

const mockRef = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: () => ({ref: mockRef}),
}));
jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  default: () => ({recordError: jest.fn()}),
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
const assignment = {fecha: '2026-10-30', activo: true, busId: 'AHK-459'};
const roster = {
  '33334444': {nombre: 'Carla', apellidos: 'Ríos'},
  '22223333': {nombre: 'Bruno', apellidos: 'Díaz'},
};

describe('UI simplificada del PILOTO con lista visual de conductores', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let rosterCallback: ((snapshot: unknown) => void) | undefined;
  let rosterError: (() => void) | undefined;
  let alert: jest.SpyInstance;

  const renderedTexts = () =>
    Array.from(
      new Set(
        renderer.root
          .findAll(node => typeof node.props?.children === 'string')
          .map(node => node.props.children as string),
      ),
    );

  const hasText = (text: string) => renderedTexts().includes(text);

  const press = async (label: string) => {
    const node = renderer.root.findByProps({accessibilityLabel: label});
    await act(async () => {
      node.props.onPress();
    });
  };

  const startButton = () => {
    let node = renderer.root.findByProps({children: 'INICIAR RECORRIDO'});
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) throw new Error('Acción no encontrada: INICIAR RECORRIDO');
      node = node.parent;
    }
    return node;
  };

  const mount = async () => {
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni={driverDni} />);
    });
  };

  const emitRoster = async (value: unknown) => {
    await act(async () => {
      rosterCallback?.({val: () => value});
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T09:00:00-05:00'));
    rosterCallback = undefined;
    rosterError = undefined;
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockRef.mockReset().mockImplementation((path: string) => {
      if (path === '/directorio_choferes/2026-10-30') {
        return {
          on: (_event: string, callback: (snapshot: unknown) => void, onError: () => void) => {
            rosterCallback = callback;
            rosterError = onError;
            callback({val: () => roster});
          },
          off: () => {
            rosterCallback = undefined;
            rosterError = undefined;
          },
        };
      }
      if (path === '/asignaciones') {
        return {
          orderByChild: () => ({
            equalTo: () => ({
              once: async () => ({
                exists: () => true,
                forEach: (callback: (child: unknown) => void) =>
                  callback({
                    key: 'asignacion-ficticia',
                    val: () => assignment,
                  }),
              }),
            }),
          }),
        };
      }
      return {update: mockUpdate};
    });
    jest.mocked(BackgroundJob.start).mockReset().mockResolvedValue(undefined);
    jest.mocked(BackgroundJob.stop).mockReset().mockResolvedValue(undefined);
    jest.mocked(BackgroundJob.isRunning).mockReturnValue(false);
    jest.mocked(Geolocation.watchPosition).mockReset().mockReturnValue(7);
    jest.mocked(Geolocation.clearWatch).mockReset();
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('muestra el directorio del día sin panel de diagnóstico ni datos del viaje', async () => {
    await mount();

    expect(hasText('Selecciona tu nombre')).toBe(true);
    expect(hasText('Bruno Díaz')).toBe(true);
    expect(hasText('Carla Ríos')).toBe(true);
    expect(hasText('Mostrar registros')).toBe(false);
    expect(hasText('Información del viaje')).toBe(false);
    expect(renderedTexts().some(text => text.includes(driverDni))).toBe(false);
  });

  it('no inicia el recorrido hasta que se selecciona un nombre', async () => {
    await mount();

    expect(startButton().props.accessibilityState).toEqual({disabled: true});
    await press('INICIAR RECORRIDO');

    expect(alert).toHaveBeenCalledWith(
      'Selecciona tu nombre',
      'Toca tu nombre en la lista antes de iniciar el recorrido.',
    );
    expect(jest.mocked(BackgroundJob.start)).not.toHaveBeenCalled();
  });

  it('selecciona visualmente a otro chofer sin alterar la identidad del recorrido', async () => {
    await mount();
    await press('Seleccionar a Carla Ríos');

    const seleccionado = renderer.root.findByProps({accessibilityLabel: 'Seleccionar a Carla Ríos'});
    const noSeleccionado = renderer.root.findByProps({accessibilityLabel: 'Seleccionar a Bruno Díaz'});
    expect(seleccionado.props.accessibilityState).toEqual({selected: true});
    expect(noSeleccionado.props.accessibilityState).toEqual({selected: false});

    const start = startButton();
    expect(start.props.accessibilityState).toEqual({disabled: false});
    await act(async () => {
      await start.props.onPress();
    });
    expect(jest.mocked(BackgroundJob.start).mock.calls[0][1].parameters).toEqual(
      expect.objectContaining({uidChofer: driverDni, busId: 'AHK-459'}),
    );

    let detener = renderer.root.findByProps({children: 'DETENER RECORRIDO'});
    while (typeof detener.props.onPress !== 'function') {
      if (!detener.parent) throw new Error('Acción no encontrada: DETENER RECORRIDO');
      detener = detener.parent;
    }
    await act(async () => {
      await detener.props.onPress();
    });
  });

  it('muestra estado vacío y lo reemplaza cuando llega el directorio', async () => {
    const refOriginal = mockRef.getMockImplementation()!;
    mockRef.mockImplementation((path: string) =>
      path === '/directorio_choferes/2026-10-30'
        ? {on: () => {}, off: () => {}}
        : refOriginal(path),
    );
    await mount();
    expect(hasText('No hay conductores asignados para hoy.')).toBe(true);
  });

  it('limpia la lista cuando falla la suscripción al directorio', async () => {
    await mount();
    expect(hasText('Bruno Díaz')).toBe(true);

    await act(async () => {
      rosterError?.();
    });
    expect(hasText('No hay conductores asignados para hoy.')).toBe(true);
  });

  it('ignora entradas incompletas del directorio', async () => {
    await mount();
    await emitRoster({
      ...roster,
      '44445555': {nombre: 'Sin Apellido'},
    });
    expect(hasText('Bruno Díaz')).toBe(true);
    expect(hasText('Carla Ríos')).toBe(true);
    expect(hasText('Sin Apellido')).toBe(false);
  });
});
