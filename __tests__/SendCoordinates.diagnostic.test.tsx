import React from 'react';
import {
  DeviceEventEmitter,
  PermissionsAndroid,
  StyleSheet,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import { SendCoordinates } from '../src/screen/SendCoordinates';

const mockRef = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: () => ({ ref: mockRef }),
}));
jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  default: () => ({ recordError: jest.fn() }),
}));
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ signOut: jest.fn() }),
}));
jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: { start: jest.fn(), stop: jest.fn(), isRunning: jest.fn() },
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: { watchPosition: jest.fn(), clearWatch: jest.fn() },
}));

const driverDni = '11112222';
const profile = { nombre: 'Persona Ficticia', apellidos: 'Apellido Inventado' };
const assignment = { fecha: '2026-10-30', activo: true, busId: 'AHK-459' };

describe('ETAPA 3: diagnóstico técnico contraído y accesible', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;

  const mount = async () => {
    await act(async () => {
      renderer = TestRenderer.create(<SendCoordinates driverDni={driverDni} />);
    });
  };

  const renderedTexts = () =>
    Array.from(
      new Set(
        renderer.root
          .findAll(node => typeof node.props?.children === 'string')
          .map(node => node.props.children as string),
      ),
    );

  const hasText = (text: string) => renderedTexts().includes(text);
  const countContaining = (text: string) =>
    renderedTexts().filter(value => value.includes(text)).length;

  const press = async (text: string) => {
    let node = renderer.root.findByProps({ children: text });
    while (typeof node.props.onPress !== 'function') {
      if (!node.parent) throw new Error(`Acción no encontrada: ${text}`);
      node = node.parent;
    }
    await act(async () => {
      node.props.onPress();
    });
  };

  const emitDebug = async (text: string, id: number) => {
    await act(async () => {
      DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
        id,
        t: `[12:00:00] ${text}`,
        type: 'info',
      });
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T09:00:00-05:00'));
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockRef.mockReset().mockImplementation((path: string) => {
      if (path === `/choferes/${driverDni}`) {
        return {
          once: async () => ({ exists: () => true, val: () => profile }),
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
      return { update: mockUpdate };
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
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('inicia contraído y no muestra los eventos existentes', async () => {
    await mount();

    expect(hasText('Mostrar diagnóstico técnico')).toBe(true);
    expect(hasText('Ocultar diagnóstico técnico')).toBe(false);
    expect(renderer.root.findAllByProps({name: 'chevron-down'}).length).toBeGreaterThan(0);
    expect(countContaining('Conductor identificado')).toBe(0);
  });

  it('expande el diagnóstico y muestra el historial existente', async () => {
    await mount();
    expect(countContaining('Conductor identificado')).toBe(0);

    await press('Mostrar diagnóstico técnico');

    expect(hasText('Ocultar diagnóstico técnico')).toBe(true);
    expect(renderer.root.findAllByProps({name: 'chevron-up'}).length).toBeGreaterThan(0);
    expect(countContaining('Conductor identificado')).toBeGreaterThan(0);
    expect(countContaining('Bus asignado: AHK-459')).toBeGreaterThan(0);
  });

  it('contrae el panel visualmente sin eliminar el historial almacenado', async () => {
    await mount();
    await press('Mostrar diagnóstico técnico');
    await emitDebug('EVENTO_PERSISTENTE', 1);
    expect(countContaining('EVENTO_PERSISTENTE')).toBeGreaterThan(0);

    await press('Ocultar diagnóstico técnico');
    expect(countContaining('EVENTO_PERSISTENTE')).toBe(0);

    await press('Mostrar diagnóstico técnico');
    expect(countContaining('EVENTO_PERSISTENTE')).toBeGreaterThan(0);
  });

  it('recibe eventos mientras el panel está oculto y los muestra al expandir', async () => {
    await mount();
    expect(hasText('Mostrar diagnóstico técnico')).toBe(true);

    await emitDebug('EVENTO_RECIBIDO_OCULTO', 2);

    expect(countContaining('EVENTO_RECIBIDO_OCULTO')).toBe(0);
    expect(hasText('Mostrar diagnóstico técnico')).toBe(true);

    await press('Mostrar diagnóstico técnico');
    expect(countContaining('EVENTO_RECIBIDO_OCULTO')).toBeGreaterThan(0);
  });

  it('muestra un estado vacío neutro y lo reemplaza al recibir un evento', async () => {
    const originalEmit = DeviceEventEmitter.emit.bind(DeviceEventEmitter);
    let suppressDebugLogs = true;
    jest
      .spyOn(DeviceEventEmitter, 'emit')
      .mockImplementation((event, ...args) => {
        if (event === 'PRO_DEBUG_LOG' && suppressDebugLogs) {
          return false;
        }
        return originalEmit(event, ...args);
      });

    await mount();
    await press('Mostrar diagnóstico técnico');

    expect(hasText('Últimos 30 eventos · Historial temporal')).toBe(true);
    expect(hasText('Todavía no hay eventos registrados.')).toBe(true);

    suppressDebugLogs = false;
    await emitDebug('EVENTO_DESPUES_DEL_VACIO', 3);

    expect(hasText('Todavía no hay eventos registrados.')).toBe(false);
    expect(countContaining('EVENTO_DESPUES_DEL_VACIO')).toBeGreaterThan(0);
  });

  it('conserva solo los últimos 30 eventos y comunica el límite', async () => {
    await mount();
    await press('Mostrar diagnóstico técnico');
    expect(hasText('Últimos 30 eventos · Historial temporal')).toBe(true);

    await act(async () => {
      for (let index = 0; index < 35; index += 1) {
        DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
          id: index,
          t: `[12:00:00] EVENTO_${index}`,
          type: 'info',
        });
      }
    });

    const events = renderedTexts().filter(value => value.includes('EVENTO_'));
    expect(events).toHaveLength(30);
    expect(events[0]).toContain('EVENTO_34');
    expect(events[29]).toContain('EVENTO_5');
    expect(events.some(value => value.includes('EVENTO_4'))).toBe(false);
  });

  it('ordena por recepción y no por la hora incluida en el texto, incluso estando oculto', async () => {
    await mount();
    await act(async () => {
      DeviceEventEmitter.emit('PRO_DEBUG_LOG', {id: 101, t: '[23:59:59] PRIMERO', type: 'info'});
      DeviceEventEmitter.emit('PRO_DEBUG_LOG', {id: 102, t: '[00:00:01] SEGUNDO', type: 'info'});
    });
    await press('Mostrar diagnóstico técnico');
    const events = renderedTexts().filter(text => text.includes('PRIMERO') || text.includes('SEGUNDO'));
    expect(events).toEqual(['[00:00:01] SEGUNDO', '[23:59:59] PRIMERO']);
    await press('Ocultar diagnóstico técnico');
    await press('Mostrar diagnóstico técnico');
    expect(renderedTexts().filter(text => text.includes('PRIMERO') || text.includes('SEGUNDO'))).toEqual(events);
  });

  it('pausa la vista mientras llegan eventos y vuelve a los 30 vigentes al reanudar', async () => {
    await mount();
    await press('Mostrar diagnóstico técnico');
    await emitDebug('LECTURA_ANTERIOR', 100);
    await press('Pausar para leer');
    expect(hasText('Vista pausada; los eventos siguen llegando.')).toBe(true);
    await act(async () => {
      for (let index = 0; index < 35; index += 1) {
        DeviceEventEmitter.emit('PRO_DEBUG_LOG', {id: 200 + index, t: `NUEVO_${index}`, type: 'info'});
      }
    });
    expect(countContaining('LECTURA_ANTERIOR')).toBe(1);
    expect(countContaining('NUEVO_')).toBe(0);
    await press('Ver mensajes recientes');
    const events = renderedTexts().filter(text => text.startsWith('NUEVO_'));
    expect(events).toHaveLength(30);
    expect(events[0]).toBe('NUEVO_34');
    expect(events[29]).toBe('NUEVO_5');
    expect(countContaining('LECTURA_ANTERIOR')).toBe(0);
  });

  it('reanuda la vista actual al cerrar y volver a abrir el panel pausado', async () => {
    await mount();
    await press('Mostrar diagnóstico técnico');
    await press('Pausar para leer');
    await emitDebug('MIENTRAS_PAUSADO', 400);
    await press('Ocultar diagnóstico técnico');
    await emitDebug('MIENTRAS_OCULTO', 401);
    await press('Mostrar diagnóstico técnico');
    const events = renderedTexts().filter(text => text.includes('MIENTRAS_'));
    expect(events).toEqual(['[12:00:00] MIENTRAS_OCULTO', '[12:00:00] MIENTRAS_PAUSADO']);
    expect(hasText('Pausar para leer')).toBe(true);
  });

  it('presenta advertencias con estilo distinto al error conservando el texto', async () => {
    await mount();
    await press('Mostrar diagnóstico técnico');
    await act(async () => {
      DeviceEventEmitter.emit('PRO_DEBUG_LOG', {id: 91, t: '⚠️ Reintento pendiente', type: 'warning'});
      DeviceEventEmitter.emit('PRO_DEBUG_LOG', {id: 92, t: '❌ Fallo definitivo', type: 'error'});
    });
    const warning = renderer.root.findByProps({children: '⚠️ Reintento pendiente'});
    const error = renderer.root.findByProps({children: '❌ Fallo definitivo'});
    expect(StyleSheet.flatten(warning.props.style).color).toBe('#795400');
    expect(StyleSheet.flatten(error.props.style).color).toBe('#C62828');
  });

  it('expone el control como botón con estado expandido y área táctil suficiente', async () => {
    await mount();

    const findToggle = (label: string) =>
      renderer.root.findAll(
        node =>
          node.props?.accessibilityLabel === label &&
          node.props?.accessibilityRole === 'button',
      );

    let toggles = findToggle('Mostrar diagnóstico técnico');
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0].props.accessibilityState).toEqual({ expanded: false });
    const toggleStyles = toggles
      .map(node => StyleSheet.flatten(node.props?.style))
      .filter(Boolean);
    expect(toggleStyles.some(style => style?.minHeight === 48)).toBe(true);

    await press('Mostrar diagnóstico técnico');
    toggles = findToggle('Ocultar diagnóstico técnico');
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0].props.accessibilityState).toEqual({ expanded: true });

    await press('Ocultar diagnóstico técnico');
    toggles = findToggle('Mostrar diagnóstico técnico');
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0].props.accessibilityState).toEqual({ expanded: false });
  });
});
