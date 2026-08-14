import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';

export function CompletionView({
  totalItems,
  checklistTitle,
  onRestart,
  onExit,
}: {
  totalItems: number;
  checklistTitle?: string;
  onRestart: () => void;
  onExit: () => void | Promise<void>;
}) {
  return (
    <View
      testID="completion-screen"
      style={{ flex: 1, overflow: 'hidden', backgroundColor: '#173d31' }}
    >
      <ScreenBackground variant="completion" />
      <CompletionConfetti />
      <SafeAreaView style={{ flex: 1 }}>
        <View
          testID="completion-content"
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingVertical: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 96,
              height: 96,
              borderTopLeftRadius: 34,
              borderTopRightRadius: 34,
              borderBottomRightRadius: 34,
              borderBottomLeftRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.25)',
              backgroundColor: '#f3a284',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 30,
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
            }}
          >
            <Icon name="check" color="#183d31" size={47} strokeWidth={2.5} />
          </View>
          <Text
            style={{
              color: '#f4bca6',
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 1.56,
              marginBottom: 8,
            }}
          >
            CHECKLIST COMPLETE
          </Text>
          <Text
            style={{
              color: '#fffaf1',
              fontSize: 40,
              lineHeight: 39,
              fontWeight: '700',
              letterSpacing: -2.2,
              marginBottom: 12,
            }}
          >
            Nicely done.
          </Text>
          <Text
            style={{
              color: 'rgba(255, 250, 241, 0.66)',
              fontSize: 16,
              lineHeight: 25,
              textAlign: 'center',
              marginBottom: 36,
            }}
          >
            All {totalItems} steps in “{checklistTitle}” are checked off.
          </Text>
          <View style={{ width: '100%', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              testID="completion-restart"
              onPress={onRestart}
              style={{
                minHeight: 52,
                backgroundColor: '#f3a284',
                borderRadius: 15,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="repeat" color="#173d31" size={18} />
              <Text style={{ color: '#173d31', fontWeight: '700', fontSize: 16 }}>
                Run it again
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="completion-return"
              onPress={onExit}
              style={{
                minHeight: 50,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.16)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fffaf1', fontWeight: '700', fontSize: 16 }}>
                Back to my checklists
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function CompletionConfetti() {
  const pieces = [
    { top: 60, left: 28, color: '#d7ad7e', rotate: '28deg' },
    { top: 104, right: 26, color: '#94bba8', rotate: '72deg' },
    { bottom: 116, left: 21, color: '#79a999', rotate: '38deg' },
    { bottom: 78, right: 33, color: '#d8bb73', rotate: '54deg' },
  ] as const;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {pieces.map((piece, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            width: 8,
            height: 20,
            borderRadius: 4,
            ...piece,
            backgroundColor: piece.color,
            transform: [{ rotate: piece.rotate }],
          }}
        />
      ))}
    </View>
  );
}
