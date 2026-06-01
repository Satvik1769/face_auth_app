import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFaceAuth } from '../../providers/FaceAuthProvider';
import { validatePasswordStrength } from '../../security/CredentialService';

function generateUserId(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

export const RegisterScreen: React.FC<{ onDone: (userId: string) => void }> = ({ onDone }) => {
  const { credentials } = useFaceAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = username.trim();
    if (!trimmed) return setError('Username is required');
    if (trimmed.length < 3) return setError('Username must be at least 3 characters');
    const policy = validatePasswordStrength(password);
    if (!policy.ok) return setError(policy.reason ?? 'Invalid password');
    if (password !== confirm) return setError('Passwords do not match');

    setBusy(true);
    try {
      const userId = generateUserId();
      await credentials.register(userId, trimmed, password, new Date().toISOString());
      onDone(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.muted}>Set up your username and password to get started.</Text>

      <TextInput
        style={styles.input}
        value={username}
        onChangeText={(t) => { setUsername(t); setError(''); }}
        placeholder="Username"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={(t) => { setPassword(t); setError(''); }}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        autoCapitalize="none"
      />
      <Text style={styles.hint}>Min 8 chars, one uppercase letter, one digit</Text>
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={(t) => { setConfirm(t); setError(''); }}
        placeholder="Confirm password"
        placeholderTextColor="#888"
        secureTextEntry
        autoCapitalize="none"
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Creating account…' : 'Create account'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  muted: { color: '#aaa', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  input: {
    marginTop: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  hint: { color: '#555', fontSize: 11, marginTop: 4, alignSelf: 'flex-start' },
  error: { color: '#ef476f', marginTop: 12, textAlign: 'center' },
  button: {
    marginTop: 24,
    width: '100%',
    backgroundColor: '#2a9d8f',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});