/**
 * FaceAuthScreen — the login gate (PRD §2.2, TRD §2.3). Camera opens automatically;
 * on a detected live face it runs the liveness challenge, then embed → match → unlock.
 * Fully offline. After 3 failures it routes to the PIN fallback.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useFaceAuth } from '../../providers/FaceAuthProvider';
import { Liveness } from '../../native';
import { LivenessOverlay } from '../components/LivenessOverlay';
import { PinFallbackScreen } from './PinFallbackScreen';
import { CredentialLoginScreen } from './CredentialLoginScreen';

const CHALLENGE_LABEL: Record<string, string> = {
  blink: 'Please blink',
  smile: 'Please smile',
  head_turn: 'Turn your head slightly',
};

export const FaceAuthScreen: React.FC<{ onUnlock: () => void; userId: string }> = ({
  onUnlock,
  userId,
}) => {
  const { state, orchestrator, usingMock } = useFaceAuth();
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [challenge, setChallenge] = useState<string>('');
  const [status, setStatus] = useState('Look at the camera');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (state === 'AUTH_SUCCESS') onUnlock();
  }, [state, onUnlock]);

  // Begin a liveness challenge as soon as a face is detected.
  useEffect(() => {
    let cancelled = false;
    if (state === 'LIVENESS_CHALLENGE' && !challenge) {
      Liveness.startChallenge('random').then((s) => {
        if (!cancelled) {
          setChallenge(s.challengeType);
          setStatus(CHALLENGE_LABEL[s.challengeType] ?? 'Follow the prompt');
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [state, challenge]);

  // Frame handler (wired to a Vision Camera frame processor on device). Each frame:
  // detect face -> if challenging, evaluate liveness -> on pass, complete auth.
  const onLivenessPassed = useCallback(
    async (croppedFaceFrame: string) => {
      setStatus('Verifying…');
      await orchestrator.completeAuth(croppedFaceFrame);
      setChallenge('');
    },
    [orchestrator],
  );

  if (state === 'CREDENTIAL_LOGIN') {
    return <CredentialLoginScreen mode="fallback" onUnlock={onUnlock} />;
  }

  if (state === 'FALLBACK_PIN' || state === 'LOCKED_OUT' || state === 'ERROR') {
    return <PinFallbackScreen onUnlock={onUnlock} userId={userId} />;
  }

  if (!device || !hasPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Starting camera…</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive />
      <LivenessOverlay challenge={challenge} status={status} state={state} onPassed={onLivenessPassed} />
      {usingMock && <Text style={styles.mockBadge}>MOCK INFERENCE (no model loaded)</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  muted: { color: '#aaa', marginTop: 12 },
  mockBadge: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    color: '#ffd166',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
