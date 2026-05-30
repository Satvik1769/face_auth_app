import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useFaceAuth } from '../faceAuth';

const CHALLENGES = ['blink', 'smile', 'turn your head'];
const challengeLabel = (i: number) => CHALLENGES[i % CHALLENGES.length];

/**
 * Auth: live preview + the REAL state machine. "Scan" walks IDLE → DETECTING_FACE →
 * LIVENESS_CHALLENGE → EMBEDDING → MATCHING and shows the verdict + score. The
 * recognition is mock (labeled); the flow, threshold, retry counter, PIN fallback,
 * and lockout are the production-tested engine.
 */
export const AuthScreen: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const { orchestrator, context, state, pin, userId } = useFaceAuth();
  const [busy, setBusy] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const challengeRef = useRef(Math.floor(Math.random() * CHALLENGES.length));

  useEffect(() => {
    if (state === 'AUTH_SUCCESS') onUnlock();
  }, [state, onUnlock]);

  // Drive the lockout clock so the 30-min timer can release.
  useEffect(() => {
    if (state !== 'LOCKED_OUT') return;
    const tick = () => orchestrator.dispatch({ type: 'NOW', nowMs: Date.now() });
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, orchestrator]);

  const scan = async (identity: string) => {
    setBusy(true);
    try {
      const o = orchestrator;
      if (o.getState() === 'IDLE') o.dispatch({ type: 'APP_FOREGROUND' });
      if (o.getState() === 'CAMERA_STARTING') o.dispatch({ type: 'CAMERA_READY' });
      if (o.getState() === 'AUTH_FAIL') o.dispatch({ type: 'DISMISS_RETRY' });
      if (o.getState() === 'DETECTING_FACE') o.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
      if (o.getState() === 'LIVENESS_CHALLENGE') {
        challengeRef.current = (challengeRef.current + 1) % CHALLENGES.length;
        await o.completeAuth(`${identity}#live`);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    const correct = await pin.verifyPin(userId, pinValue);
    orchestrator.dispatch({ type: 'PIN_SUBMITTED', correct });
    setPinError(correct ? '' : 'Incorrect PIN');
    setPinValue('');
  };

  // --- PIN fallback / lockout UI ------------------------------------------------
  if (state === 'FALLBACK_PIN' || state === 'LOCKED_OUT' || state === 'ERROR') {
    if (state === 'LOCKED_OUT') {
      const mins = Math.max(0, Math.ceil(((context.lockedUntilMs ?? Date.now()) - Date.now()) / 60000));
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Too many attempts</Text>
          <Text style={styles.muted}>Locked. Try again in ~{mins} min.</Text>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Enter PIN</Text>
        <Text style={styles.muted}>Face login failed 3 times. Use your backup PIN.</Text>
        <TextInput
          style={styles.input}
          value={pinValue}
          onChangeText={(t) => { setPinValue(t); setPinError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          placeholder="PIN"
          placeholderTextColor="#777"
        />
        {!!pinError && <Text style={styles.error}>{pinError}</Text>}
        <Pressable style={styles.button} onPress={submitPin}>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
        <Text style={styles.hint}>Wrong PIN 5× → 30-min lockout (real engine).</Text>
      </View>
    );
  }

  // --- Camera + scan UI ---------------------------------------------------------
  const failed = state === 'AUTH_FAIL';
  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="front" />
      <View style={[styles.oval, failed && styles.ovalFail]} pointerEvents="none" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>MOCK RECOGNITION (no model loaded)</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.challenge}>Liveness: please {challengeLabel(challengeRef.current)}</Text>
        {failed && (
          <Text style={styles.fail}>
            No match (score {context.lastScore?.toFixed(3)}). Attempt {context.retryCount}/3.
          </Text>
        )}
        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={() => scan(userId)}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? 'Verifying…' : '✓ I did the gesture — Scan'}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary, busy && styles.disabled]}
          onPress={() => scan('an-impostor')}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Try as a different person (impostor)</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0b0f' },
  oval: {
    position: 'absolute', alignSelf: 'center', top: '15%', width: 230, height: 300,
    borderRadius: 150, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
  },
  ovalFail: { borderColor: '#ef476f' },
  badge: {
    position: 'absolute', top: 44, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  badgeText: { color: '#ffd166', fontSize: 11 },
  panel: { position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center', padding: 16 },
  challenge: { color: '#8ecae6', fontSize: 16, marginBottom: 10, fontWeight: '600' },
  fail: { color: '#ef476f', marginBottom: 10 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  muted: { color: '#aaa', marginTop: 8, textAlign: 'center' },
  input: {
    marginTop: 18, width: 200, borderWidth: 1, borderColor: '#333', borderRadius: 10,
    color: '#fff', fontSize: 24, textAlign: 'center', letterSpacing: 8, paddingVertical: 12,
  },
  error: { color: '#ef476f', marginTop: 12 },
  hint: { color: '#555', fontSize: 12, marginTop: 22, textAlign: 'center' },
  button: { marginTop: 10, backgroundColor: '#2a9d8f', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10, minWidth: 280, alignItems: 'center' },
  secondary: { backgroundColor: '#5a3e5d' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
