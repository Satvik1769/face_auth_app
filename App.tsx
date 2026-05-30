/**
 * App.tsx — demonstrates the FaceAuth module gating the Datalake 3.0 app.
 *
 * Routing is intentionally minimal (no navigation lib) to keep the prototype's
 * dependency surface small. In Datalake 3.0 you replace the existing LoginScreen
 * with <FaceAuthScreen> in the real navigator (see docs/INTEGRATION.md).
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';
import { FaceAuthProvider } from './src/providers/FaceAuthProvider';
import { FaceAuthScreen } from './src/ui/screens/FaceAuthScreen';
import { EnrollmentScreen } from './src/ui/screens/EnrollmentScreen';
import { PinSetupScreen } from './src/ui/screens/PinSetupScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { InMemorySecureStorage } from './src/storage/SecureStorageService';

// In Datalake 3.0 this is the logged-in user id; the encrypted store is the
// native SecureStorage. The in-memory store here lets the prototype run anywhere.
const USER_ID = 'datalake-field-user';

type Route = 'enroll' | 'pin-setup' | 'auth' | 'home' | 'settings';

export default function App(): React.JSX.Element {
  const storage = useMemo(() => new InMemorySecureStorage(), []);
  const [route, setRoute] = useState<Route>('enroll');

  return (
    <FaceAuthProvider userId={USER_ID} storage={storage}>
      <SafeAreaView style={styles.root}>
        {route === 'enroll' && (
          <EnrollmentScreen userId={USER_ID} onDone={() => setRoute('pin-setup')} />
        )}
        {route === 'pin-setup' && (
          <PinSetupScreen userId={USER_ID} onDone={() => setRoute('home')} />
        )}
        {route === 'auth' && <FaceAuthScreen onUnlock={() => setRoute('home')} userId={USER_ID} />}
        {route === 'home' && (
          <View style={styles.home}>
            <Text style={styles.title}>Datalake 3.0</Text>
            <Text style={styles.muted}>Unlocked. You are authenticated offline.</Text>
            <Pressable style={styles.link} onPress={() => setRoute('settings')}>
              <Text style={styles.linkText}>Face login settings</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => setRoute('auth')}>
              <Text style={styles.linkText}>Lock (simulate relaunch)</Text>
            </Pressable>
          </View>
        )}
        {route === 'settings' && (
          <SettingsScreen
            storage={storage}
            onReEnroll={() => setRoute('enroll')}
            onSyncNow={() => {}}
          />
        )}
      </SafeAreaView>
    </FaceAuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  home: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  muted: { color: '#9aa', marginTop: 8 },
  link: { marginTop: 22 },
  linkText: { color: '#2a9d8f', fontSize: 16, fontWeight: '600' },
});
