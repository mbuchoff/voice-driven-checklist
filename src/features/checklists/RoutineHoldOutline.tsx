import { View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function RoutineHoldOutline({
  width,
  height,
  color,
  progress,
}: {
  width: number;
  height: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const inset = 4;
  const radius = 18;
  const right = width - inset;
  const bottom = height - inset;
  const pathWidth = right - inset;
  const pathHeight = bottom - inset;
  const perimeter =
    2 * (pathWidth + pathHeight - 4 * radius) + 2 * Math.PI * radius;
  const outline = [
    `M ${width / 2} ${inset}`,
    `H ${right - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${inset + radius}`,
    `V ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${inset + radius}`,
    `A ${radius} ${radius} 0 0 1 ${inset} ${bottom - radius}`,
    `V ${inset + radius}`,
    `A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset}`,
    `H ${width / 2}`,
    'Z',
  ].join(' ');
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - progress.value),
  }));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, zIndex: 4 }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: 20,
          backgroundColor: color,
          opacity: 0.12,
        }}
      />
      <Svg testID="routine-hold-progress-outline" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={5}
        />
        <AnimatedPath
          testID="routine-hold-progress-stroke"
          animatedProps={animatedProps}
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.82}
          strokeWidth={5}
          strokeDasharray={`${perimeter} ${perimeter}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
