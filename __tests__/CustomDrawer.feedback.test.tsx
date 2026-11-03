import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { CustomDrawer } from '../src/features/map/components/CustomDrawer';
import { useUserStore } from '../src/store/userStore';
import { useDrawerStore } from '../src/store/drawerStore';
import { useThemeStore } from '../src/store/themeStore';

jest.mock('../src/shared/config/firebase', () => {
  const set = jest.fn();
  const push = jest.fn(() => ({ set }));
  const ref = jest.fn(() => ({ push }));
  const auth = { currentUser: { uid: 'auth-uid' } };
  return {
    firebaseDatabase: { ref },
    firebaseAuth: auth,
    __mock: { auth, ref, push, set },
  };
});
jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: { ServerValue: { TIMESTAMP: 0 } },
}));
jest.mock('@react-native-firebase/analytics', () => jest.fn());
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
}));
jest.mock('../src/features/auth/services/studentLogout', () => ({
  logoutStudent: jest.fn(),
}));
jest.mock('../src/store/userStore', () => ({ useUserStore: jest.fn() }));
jest.mock('../src/store/drawerStore', () => ({ useDrawerStore: jest.fn() }));
jest.mock('../src/store/themeStore', () => ({ useThemeStore: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: { getVersion: () => '1.0.0' },
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-linear-gradient', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const animation = {
    duration: () => animation,
    springify: () => animation,
    delay: () => animation,
  };
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    FadeIn: animation,
    FadeOut: animation,
    Layout: animation,
  };
});

jest.setTimeout(10000);

const firebaseConfig = jest.requireMock('../src/shared/config/firebase') as {
  __mock: {
    auth: { currentUser: { uid: string } | null };
    ref: jest.Mock;
    push: jest.Mock;
    set: jest.Mock;
  };
};
const { auth, ref, push, set } = firebaseConfig.__mock;
const mockUseUserStore = useUserStore as unknown as jest.Mock;
const mockUseDrawerStore = useDrawerStore as unknown as jest.Mock;
const mockUseThemeStore = useThemeStore as unknown as jest.Mock;

const renderDrawer = async () => {
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<CustomDrawer />);
  });
  return renderer!;
};

const findButtonByText = (renderer: TestRenderer.ReactTestRenderer, label: string) =>
  renderer.root
    .findAllByType(TouchableOpacity)
    .find(button =>
      button.findAllByType(Text).some(text => text.props.children === label),
    );

const findStarButtons = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(TouchableOpacity).filter(button =>
    React.Children.toArray(button.props.children).some(child => {
      if (!React.isValidElement(child)) return false;
      const { name } = child.props as { name?: unknown };
      return typeof name === 'string' && name.startsWith('star');
    }),
  );

const openFeedback = async (renderer: TestRenderer.ReactTestRenderer) => {
  const openButton = findButtonByText(renderer, 'Opinar');
  if (!openButton) throw new Error('Feedback button not found');
  await act(async () => {
    openButton.props.onPress();
  });
};

const submitFeedback = async (
  renderer: TestRenderer.ReactTestRenderer,
  rating: number,
  message?: string,
) => {
  await openFeedback(renderer);

  const stars = findStarButtons(renderer);
  if (stars.length !== 5) throw new Error('Star buttons not found');
  await act(async () => {
    stars[rating - 1].props.onPress();
  });

  if (message !== undefined) {
    const input = renderer.root.findAllByType(TextInput)[0];
    await act(async () => {
      input.props.onChangeText(message);
    });
  }

  const sendButton = findButtonByText(renderer, 'Enviar');
  if (!sendButton) throw new Error('Send button not found');
  await act(async () => {
    await sendButton.props.onPress();
  });
};

describe('CustomDrawer feedback I04', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      value: { uid: 'auth-uid' },
    });
    ref.mockClear();
    push.mockClear();
    set.mockReset();
    set.mockResolvedValue(undefined);
    mockUseUserStore.mockReturnValue({
      username: 'Ana',
      avatar: 'ingeniero',
      uuid: 'uid-local-distinto',
      email: 'ana@example.com',
      setAvatar: jest.fn(),
      logout: jest.fn(),
      nickname: 'ana',
    });
    mockUseDrawerStore.mockReturnValue({
      isOpen: true,
      closeDrawer: jest.fn(),
    });
    mockUseThemeStore.mockReturnValue({
      isDarkMode: false,
      toggleTheme: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('T1 - usa exactamente el UID de Authentication', async () => {
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 4, 'Buen servicio');

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      username: 'Ana',
      avatar: 'ingeniero',
      rating: 4,
      mensaje: 'Buen servicio',
      uid: 'auth-uid',
      email: 'ana@example.com',
      timestamp: 0,
    }));
  });

  it('T2 - no atribuye el comentario al UID local diferente', async () => {
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 5);

    const payload = set.mock.calls[0][0];
    expect(payload.uid).toBe('auth-uid');
    expect(payload.uid).not.toBe('uid-local-distinto');
  });

  it('T3 - bloquea el envío sin sesión autenticada', async () => {
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      value: null,
    });
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 3);

    expect(ref).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Sesión no disponible',
      'No se pudo verificar tu sesión. Inicia sesión nuevamente para enviar tu opinión.',
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      '¡Enviado!',
      'Tu opinión ha sido registrada con éxito.',
    );
  });

  it('T4 - conserva las calificaciones válidas de 1 a 5', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      set.mockClear();
      const renderer = await renderDrawer();
      await submitFeedback(renderer, rating);
      expect(set).toHaveBeenCalledWith(expect.objectContaining({ rating }));
      await act(async () => renderer.unmount());
    }
  });

  it('T5 - permite enviar sin texto adicional', async () => {
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 3);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      rating: 3,
      mensaje: '',
    }));
  });

  it('T6 - no muestra éxito cuando Firebase rechaza la escritura', async () => {
    set.mockRejectedValueOnce(new Error('permission_denied'));
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 4, 'Comentario');

    expect(set).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'No se pudo enviar el comentario. Intenta de nuevo.',
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      '¡Enviado!',
      'Tu opinión ha sido registrada con éxito.',
    );
  });

  it('T7 - no atribuye el envío a otra identidad si la sesión cambia', async () => {
    let reads = 0;
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? { uid: 'auth-uid' } : { uid: 'auth-otro' };
      },
    });
    const renderer = await renderDrawer();
    await submitFeedback(renderer, 4);

    expect(reads).toBeGreaterThanOrEqual(2);
    expect(set).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'No se pudo enviar el comentario. Intenta de nuevo.',
    );
    expect(Alert.alert).not.toHaveBeenCalledWith(
      '¡Enviado!',
      'Tu opinión ha sido registrada con éxito.',
    );
  });

  it('T8 - conserva la apertura del feedback y las acciones del drawer', async () => {
    const renderer = await renderDrawer();
    await openFeedback(renderer);

    expect(renderer.root.findAllByType(Text).some(
      text => text.props.children === '¿Cómo puedo mejorar?',
    )).toBe(true);
    expect(findButtonByText(renderer, 'Enviar')).toBeTruthy();
    expect(findButtonByText(renderer, 'Cerrar Sesión')).toBeTruthy();
  });
});
