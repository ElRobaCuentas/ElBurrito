import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

import { SendCoordinates } from './screen/SendCoordinates';
import { LoginDriverScreen } from './screen/LoginDriverScreen';
import { COLORS } from './shared/theme/colors';
import crashlytics from '@react-native-firebase/crashlytics';

const syncCrashlyticsUser = (uid: string | null) => {
  try {
    crashlytics().setUserId(uid ?? '').catch(() => undefined);
  } catch {
    // Un fallo de Crashlytics no debe bloquear autenticación ni navegación.
  }
};

export const DriverApp = () => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setInitializing(false);
      syncCrashlyticsUser(currentUser?.uid ?? null);
    });
    return subscriber;
  }, []);

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <LoginDriverScreen />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <SendCoordinates driverDni={user.email?.split('@')[0] || ''} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F9',
  },
});
