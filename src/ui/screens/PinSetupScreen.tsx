/**
 * PinSetupScreen — set the fallback PIN right after face enrollment (PRD §2.1).
 * Enforces the PIN policy (PinService.validatePinStrength) with live feedback and
 * a confirm step, then stores only the hash.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFaceAuth } from '../../providers/FaceAuthProvider';
import { validatePinStrength } from '../../security/PinService';

export const PinSetupScreen: React.FC<{ userId: string; onDone: () => void }> = ({ userId, onDone }) => {
  const { pin: pinService } = useFaceAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const policy = validatePinStrength(pin);
    if (!policy.ok) return setError(policy.reason ?? 'Invalid PIN');
    if (pin !== confirm) return setError('PINs do not match');
    setBusy(true);
    try {
      await pinService.setPin(userId, pin);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Set a backup PIN</Text>
      <Text style={styles.muted}>
        Used only if face login fails 3 times. 4–8 digits, not all-same or a simple sequence.
      </Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(t) => { setPin(t); setError(''); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="New PIN"
        placeholderTextColor="#888"
      />
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={(t) => { setConfirm(t); setError(''); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Confirm PIN"
        placeholderTextColor="#888"
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, busy && styles.disabled]} onPress={save} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save PIN'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  muted: { color: '#aaa', marginTop: 8, textAlign: 'center', lineHeight: 18 },
  input: {
    marginTop: 18, width: 220, borderWidth: 1, borderColor: '#333', borderRadius: 10,
    color: '#fff', fontSize: 24, textAlign: 'center', letterSpacing: 6, paddingVertical: 12,
  },
  error: { color: '#ef476f', marginTop: 12, textAlign: 'center' },
  button: { marginTop: 22, backgroundColor: '#2a9d8f', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 10 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
