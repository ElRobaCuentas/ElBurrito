import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { CustomDrawer } from '../src/features/map/components/CustomDrawer';
import { logoutStudent } from '../src/features/auth/services/studentLogout';
import { useUserStore } from '../src/store/userStore';
import { useDrawerStore } from '../src/store/drawerStore';
import { useThemeStore } from '../src/store/themeStore';

jest.mock('@react-native-firebase/analytics', () => jest.fn());
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
}));
jest.mock('../src/shared/config/firebase', () => ({ firebaseAuth: {} }));
jest.mock('../src/features/auth/services/studentLogout', () => ({
  logoutStudent: jest.fn(),
}));
jest.mock('../src/store/userStore', () => ({ useUserStore: jest.fn() }));
jest.mock('../src/store/drawerStore', () => ({ useDrawerStore: jest.fn() }));
jest.mock('../src/store/themeStore', () => ({ useThemeStore: jest.fn() }));
jest.mock('../src/features/map/services/map_service', () => ({
  MapService: { sendFeedback: jest.fn() },
}));
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

const mockLogout = jest.fn();
const mockCloseDrawer = jest.fn();
const mockLogoutStudent = logoutStudent as jest.Mock;
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

const pressLogout = async (renderer: TestRenderer.ReactTestRenderer) => {
  const logoutButton = renderer.root
    .findAllByType(TouchableOpacity)
    .find(button =>
      button
        .findAllByType(Text)
        .some(text => text.props.children === 'Cerrar Sesión'),
    );

  if (!logoutButton) throw new Error('Logout button not found');

  await act(async () => {
    logoutButton.props.onPress();
    await new Promise(resolve => setTimeout(resolve, 250));
  });
};

describe('CustomDrawer logout', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLogout.mockClear();
    mockCloseDrawer.mockClear();
    mockLogoutStudent.mockReset();
    mockUseUserStore.mockReturnValue({
      username: 'Ana',
      avatar: 'ingeniero',
      uuid: 'uid',
      email: 'ana@example.com',
      setAvatar: jest.fn(),
      logout: mockLogout,
      nickname: 'ana',
    });
    mockUseDrawerStore.mockReturnValue({
      isOpen: true,
      closeDrawer: mockCloseDrawer,
    });
    mockUseThemeStore.mockReturnValue({
      isDarkMode: false,
      toggleTheme: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cierra la sesión local cuando el cierre está confirmado', async () => {
    mockLogoutStudent.mockImplementation(async (onConfirmed: () => void) => {
      onConfirmed();
      return { success: true };
    });
    const renderer = await renderDrawer();

    await pressLogout(renderer);

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockLogoutStudent).toHaveBeenCalledWith(mockLogout);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('muestra error y conserva la sesión local si Firebase falla', async () => {
    const error = new Error('firebase failure');
    mockLogoutStudent.mockResolvedValue({ success: false, error });
    const renderer = await renderDrawer();

    await pressLogout(renderer);

    expect(mockLogoutStudent).toHaveBeenCalledWith(mockLogout);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'No se pudo cerrar sesión',
      'Firebase no confirmó el cierre. Inténtalo de nuevo.',
    );
  });

  it('ignora un segundo toque mientras el cierre está en curso', async () => {
    mockLogoutStudent.mockResolvedValue({ success: true });
    const renderer = await renderDrawer();
    const logoutButton = renderer.root
      .findAllByType(TouchableOpacity)
      .find(button =>
        button
          .findAllByType(Text)
          .some(text => text.props.children === 'Cerrar Sesión'),
      );

    if (!logoutButton) throw new Error('Logout button not found');

    await act(async () => {
      logoutButton.props.onPress();
      logoutButton.props.onPress();
      await new Promise(resolve => setTimeout(resolve, 250));
    });

    expect(mockLogoutStudent).toHaveBeenCalledTimes(1);
    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
  });
});
