/**
 * PinFallbackScreen — shown after 3 failed face attempts (PRD §2.2, TRD §7).
 * Verifies the PIN against the bcrypt hash via the native SecureStorage module.
 * 5 wrong PINs trigger LOCKED_OUT for 30 minutes (handled by the state machine).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFaceAuth } from '../../providers/FaceAuthProvider';

export const PinFallbackScreen: React.FC<{ onUnlock: () => void; userId: string }> = ({
  onUnlock,
  userId,
}) => {
  const { state, context, orchestrator, pin: pinService } = useFaceAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (state === 'AUTH_SUCCESS') onUnlock();
  }, [state, onUnlock]);

  // While locked out, tick the clock so the machine can release at the deadline.
  useEffect(() => {
    if (state !== 'LOCKED_OUT') return;
    const id = setInterval(() => orchestrator.dispatch({ type: 'NOW', nowMs: Date.now() }), 1000);
    orchestrator.dispatch({ type: 'NOW', nowMs: Date.now() });
    return () => clearInterval(id);
  }, [state, orchestrator]);

  const submit = async () => {
    setChecking(true);
    try {
      const correct = await pinService.verifyPin(userId, pin);
      orchestrator.dispatch({ type: 'PIN_SUBMITTED', correct });
      setError(correct ? '' : 'Incorrect PIN');
    } finally {
      setChecking(false);
      setPin('');
    }
  };

  if (state === 'LOCKED_OUT') {
    const remainingMs = (context.lockedUntilMs ?? Date.now()) - Date.now();
    const mins = Math.max(0, Math.ceil(remainingMs / 60000));
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Too many attempts</Text>
        <Text style={styles.muted}>Try again in about {mins} min</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Enter PIN</Text>
      <Text style={styles.muted}>Face login failed. Use your PIN to continue.</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="••••"
        placeholderTextColor="#888"
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, checking && styles.buttonDisabled]} onPress={submit} disabled={checking}>
        <Text style={styles.buttonText}>{checking ? 'Checking…' : 'Unlock'}</Text>
      </Pressable>
      <Text style={styles.attempts}>Failed PIN attempts: {context.pinFailCount ?? 0} / 5</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  muted: { color: '#aaa', marginTop: 8, textAlign: 'center' },
  input: {
    marginTop: 24,
    width: 200,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    color: '#fff',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: 12,
  },
  error: { color: '#ef476f', marginTop: 12 },
  button: { marginTop: 20, backgroundColor: '#2a9d8f', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 10 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  attempts: { color: '#555', marginTop: 24, fontSize: 12 },
});
