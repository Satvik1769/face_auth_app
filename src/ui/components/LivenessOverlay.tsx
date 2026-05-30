/**
 * LivenessOverlay — animated guidance + the framing oval (PRD §4.4 usability).
 * Presentation-only; it surfaces the active challenge and a status line and
 * exposes onPassed() which the screen's frame processor invokes with the cropped
 * 112×112 face once the native LivenessModule reports the gesture complete.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthState } from '../../core/AuthStateMachine';

export const LivenessOverlay: React.FC<{
  challenge: string;
  status: string;
  state: AuthState;
  onPassed: (croppedFaceFrame: string) => void;
}> = ({ challenge, status, state }) => {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.oval} />
      <View style={styles.banner}>
        <Text style={styles.status}>{status}</Text>
        {!!challenge && <Text style={styles.challenge}>{challenge.replace('_', ' ')}</Text>}
        <Text style={styles.state}>{state}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  oval: {
    width: 240,
    height: 320,
    borderRadius: 160,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  banner: { position: 'absolute', bottom: 80, alignItems: 'center' },
  status: { color: '#fff', fontSize: 20, fontWeight: '600' },
  challenge: { color: '#8ecae6', fontSize: 16, marginTop: 6, textTransform: 'capitalize' },
  state: { color: '#666', fontSize: 11, marginTop: 10 },
});
