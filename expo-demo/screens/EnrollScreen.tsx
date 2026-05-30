import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { useFaceAuth } from '../faceAuth';

/**
 * Enroll: live front-camera preview + a capture button that runs the REAL
 * multi-template enrollment (10 simulated frames, one a deliberate outlier).
 */
export const EnrollScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { enrollment, userId } = useFaceAuth();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('Position your face in the oval.');

  const capture = async () => {
    setBusy(true);
    setInfo('Capturing 10 frames…');
    try {
      // Frame 8 is a deliberate bad capture (different identity) to show outlier rejection.
      const frames = Array.from({ length: 10 }, (_, i) =>
        i === 7 ? 'someone-else#1#0.5' : `${userId}#${i + 1}#0.5`,
      );
      const result = await enrollment.enroll(userId, frames);
      setInfo(
        `Enrolled ✓  kept ${result.templates.length} templates, ` +
          `rejected ${result.rejectedFrames} outlier frame(s).`,
      );
      setTimeout(onDone, 900);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : 'Enrollment failed');
      setBusy(false);
    }
  };

  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="front" />
      <View style={styles.oval} pointerEvents="none" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>MOCK RECOGNITION (no model loaded)</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.title}>Set up face login</Text>
        <Text style={styles.body}>{info}</Text>
        {busy ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
        ) : (
          <Pressable style={styles.button} onPress={capture}>
            <Text style={styles.buttonText}>Capture my face</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  oval: {
    position: 'absolute',
    alignSelf: 'center',
    top: '18%',
    width: 230,
    height: 300,
    borderRadius: 150,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  badge: {
    position: 'absolute',
    top: 44,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: '#ffd166', fontSize: 11 },
  panel: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  body: { color: '#d6d6d6', textAlign: 'center', marginVertical: 6, minHeight: 38 },
  button: { marginTop: 12, backgroundColor: '#2a9d8f', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
