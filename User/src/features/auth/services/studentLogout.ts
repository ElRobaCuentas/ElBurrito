import analytics from '@react-native-firebase/analytics';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { firebaseAuth } from '../../../shared/config/firebase';

export type StudentLogoutResult =
  | { success: true }
  | { success: false; error: unknown };

export interface StudentLogoutDependencies {
  signOutFirebase: () => Promise<unknown>;
  getCurrentGoogleUser: () => unknown;
  signOutGoogle: () => Promise<unknown>;
  logEvent: (eventName: string) => Promise<unknown>;
}

export type StudentLogout = (
  onConfirmed: () => void,
) => Promise<StudentLogoutResult>;

export const createStudentLogout = (
  dependencies: StudentLogoutDependencies,
): StudentLogout => {
  let logoutInFlight: Promise<StudentLogoutResult> | null = null;

  return onConfirmed => {
    if (logoutInFlight) return logoutInFlight;

    logoutInFlight = (async (): Promise<StudentLogoutResult> => {
      try {
        await dependencies.signOutFirebase();
      } catch (error) {
        return { success: false, error };
      }

      onConfirmed();

      (async () => {
        try {
          const currentGoogleUser = await dependencies.getCurrentGoogleUser();
          if (currentGoogleUser) {
            await dependencies.signOutGoogle();
          }
        } catch {}
      })().catch(() => {});

      (async () => {
        try {
          await dependencies.logEvent('sesion_cerrada');
        } catch {}
      })().catch(() => {});

      return { success: true };
    })().finally(() => {
      logoutInFlight = null;
    });

    return logoutInFlight;
  };
};

export const logoutStudent = createStudentLogout({
  signOutFirebase: () => firebaseAuth.signOut(),
  getCurrentGoogleUser: () => GoogleSignin.getCurrentUser(),
  signOutGoogle: () => GoogleSignin.signOut(),
  logEvent: eventName => analytics().logEvent(eventName),
});
