import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFaceAuth } from '../../providers/FaceAuthProvider';
import { MAX_CREDENTIAL_FAILURES } from '../../core/AuthStateMachine';

type Props =
  | { mode?: 'fallback'; onUnlock: () => void }
  | { mode: 'first-time'; onSignIn: (username: string, password: string) => Promise<void> };

export const CredentialLoginScreen: React.FC<Props> = (props) => {
  const { state, context, orchestrator, credentials } = useFaceAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isFirstTime = props.mode === 'first-time';

  useEffect(() => {
    if (!isFirstTime && state === 'AUTH_SUCCESS') (props as { onUnlock: () => void }).onUnlock();
  }, [state, isFirstTime, props]);

  const submit = async () => {
    if (!username.trim() || !password) return setError('Enter your username and password');
    setBusy(true);
    try {
      if (isFirstTime) {
        await (props as { onSignIn: (u: string, p: string) => Promise<void> }).onSignIn(
          username.trim(),
          password,
        );
      } else {
        const result = await credentials.login(username.trim(), password);
        if (result) {
          await orchestrator.loginWithCredentials(result.userId);
        } else {
          orchestrator.failCredentials();
          setError('Incorrect username or password');
          setPassword('');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remaining = MAX_CREDENTIAL_FAILURES - (context.credentialFailCount ?? 0);
  const subtitle = isFirstTime
    ? 'Enter your username and password to restore your account.'
    : 'Face and PIN login failed. Use your username and password.';

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.muted}>{subtitle}</Text>

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

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Verifying…' : 'Sign in'}</Text>
      </Pressable>

      {!isFirstTime && context.credentialFailCount > 0 && (
        <Text style={styles.attempts}>
          {remaining} attempt{remaining !== 1 ? 's' : ''} remaining before lockout
        </Text>
      )}
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
  attempts: { color: '#e76f51', marginTop: 20, fontSize: 13 },
});