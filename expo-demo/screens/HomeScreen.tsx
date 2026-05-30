import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Unlocked "app" — proves the gate opened entirely offline. */
export const HomeScreen: React.FC<{ onReEnroll: () => void; onLock: () => void }> = ({
  onReEnroll,
  onLock,
}) => (
  <View style={styles.screen}>
    <Text style={styles.badge}>🔓 Unlocked offline</Text>
    <Text style={styles.title}>Datalake 3.0</Text>
    <Text style={styles.muted}>You authenticated with your face — no network, no password.</Text>

    <Pressable style={styles.link} onPress={onLock}>
      <Text style={styles.linkText}>Lock (simulate relaunch)</Text>
    </Pressable>
    <Pressable style={styles.link} onPress={onReEnroll}>
      <Text style={styles.linkText}>Re-enroll my face</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  badge: { color: '#2a9d8f', fontSize: 14, fontWeight: '700', marginBottom: 14 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800' },
  muted: { color: '#9aa', marginTop: 10, textAlign: 'center' },
  link: { marginTop: 22 },
  linkText: { color: '#2a9d8f', fontSize: 16, fontWeight: '600' },
});
