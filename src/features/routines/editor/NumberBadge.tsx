import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { BADGE_SIZE } from './stepRowMetrics';

/** A step's number in its badge, rounded but for the bottom-left corner. */
export function NumberBadge({
  number,
  color,
  background,
  style,
}: {
  number: number;
  color: string;
  background: string;
  style?: ComponentProps<typeof Animated.View>['style'];
}) {
  return (
    <Animated.View
      style={[
        {
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomRightRadius: 10,
          borderBottomLeftRadius: 4,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color, fontSize: 15, fontWeight: '800' }}>{number}</Text>
    </Animated.View>
  );
}
