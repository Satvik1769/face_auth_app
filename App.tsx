import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FaceAuthProvider } from './src/providers/FaceAuthProvider';
import { FaceAuthScreen } from './src/ui/screens/FaceAuthScreen';
import { EnrollmentScreen } from './src/ui/screens/EnrollmentScreen';
import { PinSetupScreen } from './src/ui/screens/PinSetupScreen';
import { RegisterScreen } from './src/ui/screens/RegisterScreen';
import { CredentialLoginScreen } from './src/ui/screens/CredentialLoginScreen';
import { WelcomeScreen } from './src/ui/screens/WelcomeScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { InMemorySecureStorage } from './src/storage/SecureStorageService';
import { HttpSyncApi } from './src/sync/api';
import { loadConfig } from './src/config/env';
import { Pbkdf2PinHasher } from './src/security/PinHasher';

// On a real device swap InMemorySecureStorage for NativeSecureStorage (src/native).
// NativeSecureStorage wraps SQLCipher so data survives app restarts.

const USER_ID_KEY = 'face_auth_user_id';

type Route =
  | 'loading'
  | 'welcome'            // no account: choose Register or Sign In
  | 'register'           // create new account
  | 'credential-first'   // sign in to restore cloud data (reinstall / no local enrollment)
  | 'pin-setup'          // set fallback PIN (first-time or after cloud restore)
  | 'enroll'             // capture face for the first time (or re-enroll)
  | 'auth'               // face → PIN → credential auth gate
  | 'home'
  | 'settings';

export default function App(): React.JSX.Element {
  const storage = useMemo(() => new InMemorySecureStorage(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>('loading');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(USER_ID_KEY);
      if (!stored) {
        // First launch or app data cleared — let user choose Register or Sign In.
        setRoute('welcome');
        return;
      }
      setUserId(stored);
      const enrollment = await storage.getEnrollment(stored);
      if (enrollment) {
        setRoute('auth');
      } else {
        // userId exists but enrollment is gone (reinstall / data cleared).
        // User must sign in to pull enrollment from cloud.
        setRoute('credential-first');
      }
    })();
  }, []);

  const handleRegistered = async (newUserId: string) => {
    await AsyncStorage.setItem(USER_ID_KEY, newUserId);
    setUserId(newUserId);
    setRoute('pin-setup');
  };

  /**
   * First-time sign-in: verify against backend, pull enrollment from cloud,
   * save credential + enrollment locally, then route to PIN setup.
   * Falls back to local credential check for the in-memory demo environment.
   */
  const handleFirstTimeSignIn = async (username: string, password: string): Promise<void> => {
    // 1. Local check first (works in demo / simulator with InMemorySecureStorage).
    const localUser = await storage.getUserByUsername(username.toLowerCase().trim());
    if (localUser) {
      const hasher = new Pbkdf2PinHasher();
      const valid = await hasher.verify(password, localUser.passwordHash);
      if (valid) {
        await AsyncStorage.setItem(USER_ID_KEY, localUser.userId);
        setUserId(localUser.userId);
        const enrollment = await storage.getEnrollment(localUser.userId);
        setRoute(enrollment ? 'auth' : 'enroll');
        return;
      }
    }

    // 2. Backend verification + cloud enrollment pull (production path).
    try {
      const cfg = loadConfig();
      const api = new HttpSyncApi({ baseUrl: cfg.apiBaseUrl, getToken: async () => '' });
      const auth = await api.verifyCredentials(username, password);
      if (auth) {
        // Pull face templates from cloud — no re-enrollment needed.
        const remote = await api.pullEnrollment(auth.userId, auth.token);
        if (remote) {
          await storage.saveEnrollment(auth.userId, remote.templates, new Date().toISOString());
        }
        // Cache credential locally for offline fallback on next login.
        const hasher = new Pbkdf2PinHasher();
        const hash = await hasher.hash(password);
        try {
          await storage.saveUserCredential(
            auth.userId,
            username.toLowerCase().trim(),
            hash,
            new Date().toISOString(),
          );
        } catch {
          // Username already stored locally — no action needed.
        }
        await AsyncStorage.setItem(USER_ID_KEY, auth.userId);
        setUserId(auth.userId);
        // If enrollment was pulled from cloud, just set PIN and go home.
        // If not (cloud also empty), go through enrollment.
        setRoute(remote ? 'pin-setup' : 'enroll');
        return;
      }
    } catch {
      // Network unavailable or backend not configured — continue to error below.
    }

    throw new Error('Invalid username or password');
  };

  if (route === 'loading') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#2a9d8f" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <FaceAuthProvider storage={storage}>
      <SafeAreaView style={styles.root}>
        {route === 'welcome' && (
          <WelcomeScreen
            onRegister={() => setRoute('register')}
            onSignIn={() => setRoute('credential-first')}
          />
        )}
        {route === 'register' && (
          <RegisterScreen onDone={handleRegistered} />
        )}
        {route === 'credential-first' && (
          <CredentialLoginScreen mode="first-time" onSignIn={handleFirstTimeSignIn} />
        )}
        {route === 'pin-setup' && userId && (
          <PinSetupScreen userId={userId} onDone={() => setRoute('enroll')} />
        )}
        {route === 'enroll' && userId && (
          <EnrollmentScreen userId={userId} onDone={() => setRoute('home')} />
        )}
        {route === 'auth' && userId && (
          <FaceAuthScreen onUnlock={() => setRoute('home')} userId={userId} />
        )}
        {route === 'home' && (
          <View style={styles.home}>
            <Text style={styles.title}>Datalake 3.0</Text>
            <Text style={styles.muted}>Unlocked. You are authenticated.</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  home: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  muted: { color: '#9aa', marginTop: 8 },
  link: { marginTop: 22 },
  linkText: { color: '#2a9d8f', fontSize: 16, fontWeight: '600' },
});
