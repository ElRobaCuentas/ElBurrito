jest.mock('@react-native-firebase/analytics', () => jest.fn());
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {},
}));
jest.mock('../src/shared/config/firebase', () => ({ firebaseAuth: {} }));

import {
  createStudentLogout,
  StudentLogoutDependencies,
} from '../src/features/auth/services/studentLogout';

const flushAsyncWork = () => new Promise(resolve => setTimeout(resolve, 0));

const createDependencies = (): jest.Mocked<StudentLogoutDependencies> => ({
  signOutFirebase: jest.fn().mockResolvedValue(undefined),
  getCurrentGoogleUser: jest.fn().mockReturnValue({ id: 'google-user' }),
  signOutGoogle: jest.fn().mockResolvedValue(undefined),
  logEvent: jest.fn().mockResolvedValue(undefined),
});

describe('studentLogout', () => {
  it('confirma el cierre local solo después de que Firebase cierra la sesión', async () => {
    const dependencies = createDependencies();
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const result = await logout(onConfirmed);

    expect(result).toEqual({ success: true });
    expect(dependencies.signOutFirebase).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('no cierra la sesión local ni ejecuta auxiliares si Firebase falla', async () => {
    const dependencies = createDependencies();
    const firebaseError = new Error('firebase failure');
    dependencies.signOutFirebase.mockRejectedValue(firebaseError);
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const result = await logout(onConfirmed);
    await flushAsyncWork();

    expect(result).toEqual({ success: false, error: firebaseError });
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(dependencies.getCurrentGoogleUser).not.toHaveBeenCalled();
    expect(dependencies.signOutGoogle).not.toHaveBeenCalled();
    expect(dependencies.logEvent).not.toHaveBeenCalled();
  });

  it('mantiene el cierre confirmado si Google falla', async () => {
    const dependencies = createDependencies();
    dependencies.signOutGoogle.mockRejectedValue(new Error('google failure'));
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const result = await logout(onConfirmed);
    await flushAsyncWork();

    expect(result).toEqual({ success: true });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(dependencies.logEvent).toHaveBeenCalledWith('sesion_cerrada');
  });

  it('mantiene el cierre confirmado si Analytics falla', async () => {
    const dependencies = createDependencies();
    dependencies.logEvent.mockRejectedValue(new Error('analytics failure'));
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const result = await logout(onConfirmed);
    await flushAsyncWork();

    expect(result).toEqual({ success: true });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(dependencies.signOutGoogle).toHaveBeenCalledTimes(1);
  });

  it('no bloquea el cierre si Google queda pendiente', async () => {
    const dependencies = createDependencies();
    dependencies.signOutGoogle.mockReturnValue(new Promise(() => {}));
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const result = await logout(onConfirmed);
    await flushAsyncWork();

    expect(result).toEqual({ success: true });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(dependencies.logEvent).toHaveBeenCalledWith('sesion_cerrada');
  });

  it('comparte una única operación entre llamadas concurrentes', async () => {
    const dependencies = createDependencies();
    let resolveFirebaseSignOut: () => void = () => {};
    dependencies.signOutFirebase.mockReturnValue(
      new Promise<void>(resolve => {
        resolveFirebaseSignOut = resolve;
      }),
    );
    const onConfirmed = jest.fn();
    const logout = createStudentLogout(dependencies);

    const firstLogout = logout(onConfirmed);
    const secondLogout = logout(onConfirmed);

    expect(dependencies.signOutFirebase).toHaveBeenCalledTimes(1);

    resolveFirebaseSignOut();
    const [firstResult, secondResult] = await Promise.all([
      firstLogout,
      secondLogout,
    ]);

    expect(firstResult).toEqual({ success: true });
    expect(secondResult).toEqual({ success: true });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
