import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const WelcomeScreen: React.FC<{
  onRegister: () => void;
  onSignIn: () => void;
}> = ({ onRegister, onSignIn }) => (
  <View style={styles.screen}>
    <Text style={styles.title}>Datalake 3.0</Text>
    <Text style={styles.muted}>Secure offline face login for your account.</Text>
    <Pressable style={styles.primary} onPress={onRegister}>
      <Text style={styles.primaryText}>Create account</Text>
    </Pressable>
    <Pressable style={styles.secondary} onPress={onSignIn}>
      <Text style={styles.secondaryText}>Sign in</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  muted: { color: '#9aa', marginTop: 10, textAlign: 'center', lineHeight: 20 },
  primary: {
    marginTop: 40,
    width: '100%',
    backgroundColor: '#2a9d8f',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    marginTop: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a9d8f',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#2a9d8f', fontSize: 16, fontWeight: '600' },
});
