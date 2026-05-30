/**
 * SettingsScreen — re-enrollment + sync status (PRD §2.3, TRD §2.2 SettingsModule).
 * Re-enrollment requires existing face auth or PIN (enforced before navigating here).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFaceAuth } from '../../providers/FaceAuthProvider';
import { SYNC_META_LAST_SYNC } from '../../sync/SyncService';
import { ISecureStorage } from '../../storage/SecureStorageService';

export const SettingsScreen: React.FC<{
  storage: ISecureStorage;
  onReEnroll: () => void;
  onSyncNow: () => void;
}> = ({ storage, onReEnroll, onSyncNow }) => {
  const { usingMock } = useFaceAuth();
  const [lastSync, setLastSync] = useState<string>('never');

  useEffect(() => {
    storage.getMeta(SYNC_META_LAST_SYNC).then((v) => setLastSync(v ?? 'never'));
  }, [storage]);

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>Face Login Settings</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Inference</Text>
        <Text style={styles.value}>{usingMock ? 'Mock (no model)' : 'On-device TFLite'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Last sync</Text>
        <Text style={styles.value}>{lastSync}</Text>
      </View>

      <Pressable style={styles.button} onPress={onReEnroll}>
        <Text style={styles.buttonText}>Re-enroll my face</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondary]} onPress={onSyncNow}>
        <Text style={styles.buttonText}>Sync now</Text>
      </Pressable>

      <Text style={styles.note}>
        Re-enrollment overwrites your stored face and re-syncs to the server. Your face is
        stored only as a mathematical embedding — never as an image.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, backgroundColor: '#0b0b0f' },
  h1: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f1f27' },
  label: { color: '#aaa', fontSize: 15 },
  value: { color: '#fff', fontSize: 15, fontWeight: '600' },
  button: { marginTop: 20, backgroundColor: '#2a9d8f', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  secondary: { backgroundColor: '#264653' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  note: { color: '#666', fontSize: 12, marginTop: 28, lineHeight: 18 },
});
