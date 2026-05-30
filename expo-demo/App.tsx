import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import { FaceAuthProvider } from './faceAuth';
import { EnrollScreen } from './screens/EnrollScreen';
import { PinSetupScreen } from './screens/PinSetupScreen';
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';

const USER_ID = 'datalake-field-user';
type Route = 'enroll' | 'pin-setup' | 'auth' | 'home';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [route, setRoute] = useState<Route>('enroll');

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2a9d8f" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.title}>Datalake 3.0</Text>
        <Text style={styles.body}>Offline face login needs camera access.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <FaceAuthProvider userId={USER_ID}>
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        {route === 'enroll' && <EnrollScreen onDone={() => setRoute('pin-setup')} />}
        {route === 'pin-setup' && <PinSetupScreen onDone={() => setRoute('auth')} />}
        {route === 'auth' && <AuthScreen onUnlock={() => setRoute('home')} />}
        {route === 'home' && (
          <HomeScreen onReEnroll={() => setRoute('enroll')} onLock={() => setRoute('auth')} />
        )}
      </SafeAreaView>
    </FaceAuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0f', padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  body: { color: '#aaa', marginTop: 10, textAlign: 'center' },
  button: { marginTop: 20, backgroundColor: '#2a9d8f', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
