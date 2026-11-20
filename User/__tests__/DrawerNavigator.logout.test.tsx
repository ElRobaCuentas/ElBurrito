import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { CustomDrawerContent } from '../src/app/navigations/DrawerNavigator';
import { logoutStudent } from '../src/features/auth/services/studentLogout';
import { useUserStore } from '../src/store/userStore';
import { useThemeStore } from '../src/store/themeStore';

jest.mock('@react-navigation/drawer', () => {
  const { Text: NativeText } = require('react-native');
  return {
    createDrawerNavigator: () => ({
      Navigator: ({ children }: { children: unknown }) => children,
      Screen: () => null,
    }),
    DrawerContentScrollView: ({ children }: { children: unknown }) => children,
    DrawerItemList: () => null,
    DrawerItem: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) => <NativeText onPress={onPress}>{label}</NativeText>,
  };
});
jest.mock('../src/features/map/screen/MapScreen', () => ({
  MapScreen: () => null,
}));
jest.mock('../src/features/auth/services/studentLogout', () => ({
  logoutStudent: jest.fn(),
}));
jest.mock('../src/store/userStore', () => ({ useUserStore: jest.fn() }));
jest.mock('../src/store/themeStore', () => ({ useThemeStore: jest.fn() }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('react-native-linear-gradient', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));

jest.setTimeout(10000);

const mockLogout = jest.fn();
const mockLogoutStudent = logoutStudent as jest.Mock;
const mockUseUserStore = useUserStore as unknown as jest.Mock;
const mockUseThemeStore = useThemeStore as unknown as jest.Mock;

const renderDrawerContent = async () => {
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<CustomDrawerContent />);
  });
  return renderer!;
};

const findLogoutItem = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(Text)
    .find(text => text.props.children === 'Cerrar Sesión');

describe('DrawerNavigator logout', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLogout.mockClear();
    mockLogoutStudent.mockReset();
    mockUseUserStore.mockReturnValue({
      username: 'Ana',
      avatar: 'ingeniero',
      logout: mockLogout,
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
    const renderer = await renderDrawerContent();
    const logoutItem = findLogoutItem(renderer);

    if (!logoutItem) throw new Error('Logout item not found');

    await act(async () => {
      await logoutItem.props.onPress();
    });

    expect(mockLogoutStudent).toHaveBeenCalledWith(mockLogout);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('muestra error y conserva la sesión local si Firebase falla', async () => {
    const error = new Error('firebase failure');
    mockLogoutStudent.mockResolvedValue({ success: false, error });
    const renderer = await renderDrawerContent();
    const logoutItem = findLogoutItem(renderer);

    if (!logoutItem) throw new Error('Logout item not found');

    await act(async () => {
      await logoutItem.props.onPress();
    });

    expect(mockLogoutStudent).toHaveBeenCalledWith(mockLogout);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'No se pudo cerrar sesión',
      'Firebase no confirmó el cierre. Inténtalo de nuevo.',
    );
  });

  it('ignora un segundo toque mientras el cierre está en curso', async () => {
    let resolveLogout: () => void = () => {};
    mockLogoutStudent.mockImplementation(
      (onConfirmed: () => void) =>
        new Promise(resolve => {
          resolveLogout = () => {
            onConfirmed();
            resolve({ success: true });
          };
        }),
    );
    const renderer = await renderDrawerContent();
    const logoutItem = findLogoutItem(renderer);

    if (!logoutItem) throw new Error('Logout item not found');

    await act(async () => {
      const firstLogout = logoutItem.props.onPress();
      const secondLogout = logoutItem.props.onPress();
      resolveLogout();
      await Promise.all([firstLogout, secondLogout]);
    });

    expect(mockLogoutStudent).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
