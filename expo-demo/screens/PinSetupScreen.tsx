import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFaceAuth } from '../faceAuth';
import { validatePinStrength } from '../lib/security/PinService';

/** Set the fallback PIN (real policy + salted hash via PinService). */
export const PinSetupScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { pin: pinService, userId } = useFaceAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    const policy = validatePinStrength(pin);
    if (!policy.ok) return setError(policy.reason ?? 'Invalid PIN');
    if (pin !== confirm) return setError('PINs do not match');
    try {
      await pinService.setPin(userId, pin);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save PIN');
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Set a backup PIN</Text>
      <Text style={styles.muted}>Used only if face login fails 3 times. 4–8 digits, not all-same or a sequence.</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(t) => { setPin(t); setError(''); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="New PIN"
        placeholderTextColor="#777"
      />
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={(t) => { setConfirm(t); setError(''); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Confirm PIN"
        placeholderTextColor="#777"
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save PIN</Text>
      </Pressable>
      <Text style={styles.hint}>Try a weak one (1111 / 1234) to see the policy reject it.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  muted: { color: '#aaa', marginTop: 8, textAlign: 'center', lineHeight: 18 },
  input: {
    marginTop: 16, width: 220, borderWidth: 1, borderColor: '#333', borderRadius: 10,
    color: '#fff', fontSize: 22, textAlign: 'center', letterSpacing: 6, paddingVertical: 12,
  },
  error: { color: '#ef476f', marginTop: 12, textAlign: 'center' },
  button: { marginTop: 20, backgroundColor: '#2a9d8f', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#555', fontSize: 12, marginTop: 22, textAlign: 'center' },
});
