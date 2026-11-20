import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {DriverApp} from '../src/DriverApp';
import {SendCoordinates} from '../src/screen/SendCoordinates';
import {LoginDriverScreen} from '../src/screen/LoginDriverScreen';

const mockSetUserId = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({onAuthStateChanged: mockOnAuthStateChanged}),
}));
jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  default: () => ({setUserId: mockSetUserId}),
}));
jest.mock('../src/screen/SendCoordinates', () => ({
  SendCoordinates: () => null,
}));
jest.mock('../src/screen/LoginDriverScreen', () => ({
  LoginDriverScreen: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

type AuthUser = {uid: string; email: string} | null;
const user = (uid: string) => ({uid, email: '11112222@ficticio.invalid'});

describe('I11: identidad de Crashlytics sin bloquear el auth gate', () => {
  let renderer: ReturnType<typeof TestRenderer.create>;
  let notify: (currentUser: AuthUser) => void;

  const emitAuth = async (currentUser: AuthUser) => {
    await act(async () => {
      notify(currentUser);
    });
  };
  const expectScreen = (authenticated: boolean) => {
    expect(renderer.root.findAllByType(SendCoordinates)).toHaveLength(authenticated ? 1 : 0);
    expect(renderer.root.findAllByType(LoginDriverScreen)).toHaveLength(authenticated ? 0 : 1);
  };

  beforeEach(async () => {
    mockSetUserId.mockReset().mockResolvedValue(null);
    mockUnsubscribe.mockReset();
    mockOnAuthStateChanged.mockReset().mockImplementation(callback => {
      notify = callback;
      return mockUnsubscribe;
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      renderer = TestRenderer.create(<DriverApp />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer.unmount());
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it('configura el UID autenticado y presenta la pantalla del conductor', async () => {
    await emitAuth(user('uid-ficticio-1'));
    expect(mockSetUserId).toHaveBeenCalledWith('uid-ficticio-1');
    expectScreen(true);
  });

  it('limpia al arrancar sin sesión y presenta el login', async () => {
    expect(mockSetUserId).not.toHaveBeenCalled();
    await emitAuth(null);
    expect(mockSetUserId).toHaveBeenCalledWith('');
    expectScreen(false);
  });

  it('solicita UID, limpieza y nuevo UID en orden aunque las promesas sigan pendientes', async () => {
    const resolvers: Array<() => void> = [];
    mockSetUserId.mockImplementation(() => new Promise<void>(resolve => resolvers.push(resolve)));
    await emitAuth(user('uid-ficticio-1'));
    expectScreen(true);
    await emitAuth(null);
    expectScreen(false);
    await emitAuth(user('uid-ficticio-2'));
    expectScreen(true);
    expect(mockSetUserId.mock.calls).toEqual([['uid-ficticio-1'], [''], ['uid-ficticio-2']]);
    // Solo prueba el orden de solicitudes: no simula la aplicación nativa del UID.
    await act(async () => resolvers.reverse().forEach(resolve => resolve()));
    expectScreen(true);
    expect(renderer.root.findByType(SendCoordinates).props.driverDni).toBe('11112222');
  });

  it('contiene el rechazo asíncrono sin impedir login ni autenticación posterior', async () => {
    let reject!: (error: Error) => void;
    mockSetUserId.mockReturnValueOnce(new Promise<null>((_, fail) => { reject = fail; }));
    await emitAuth(null);
    expectScreen(false);
    await act(async () => reject(new Error('SDK sintético no disponible')));
    expectScreen(false);
    await emitAuth(user('uid-ficticio-2'));
    expectScreen(true);
    expect(mockSetUserId).toHaveBeenLastCalledWith('uid-ficticio-2');
  });

  it('contiene fallos síncronos del SDK en login y logout sin bloquear las pantallas', async () => {
    mockSetUserId.mockImplementation(() => { throw new Error('Fallo sintético'); });
    await emitAuth(user('uid-ficticio-1'));
    expectScreen(true);
    await emitAuth(null);
    expectScreen(false);
    expect(mockSetUserId.mock.calls).toEqual([['uid-ficticio-1'], ['']]);
  });
});
