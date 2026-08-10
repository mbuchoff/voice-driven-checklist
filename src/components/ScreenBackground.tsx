import { StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '@/src/theme/useTheme';

export function ScreenBackground({
  variant,
}: {
  variant: 'editor' | 'settings' | 'run' | 'completion';
}) {
  const theme = useTheme();

  if (variant === 'completion') {
    return (
      <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient id="completion-base" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2b664f" />
            <Stop offset="1" stopColor="#173d31" />
          </LinearGradient>
          <RadialGradient id="completion-glow" cx="50%" cy="35%" r="35%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#completion-base)" />
        <Rect width="100%" height="100%" fill="url(#completion-glow)" />
      </Svg>
    );
  }

  if (variant === 'run') {
    const light = theme.mode === 'light';
    return (
      <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient id="run-base" x1="0" y1="0" x2="0.45" y2="1">
            <Stop offset="0" stopColor={light ? '#f7f1e7' : '#214d3e'} />
            <Stop offset="0.58" stopColor={light ? '#edf1e9' : '#15352c'} />
            <Stop offset="1" stopColor={light ? '#dfeae2' : '#102a23'} />
          </LinearGradient>
          <RadialGradient id="run-glow" cx="76%" cy="12%" r="42%">
            <Stop
              offset="0"
              stopColor={light ? '#a3beab' : '#6a9981'}
              stopOpacity={light ? 0.34 : 0.24}
            />
            <Stop offset="1" stopColor={light ? '#a3beab' : '#6a9981'} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="run-warmth" cx="12%" cy="72%" r="36%">
            <Stop offset="0" stopColor="#ef916f" stopOpacity={light ? 0.1 : 0} />
            <Stop offset="1" stopColor="#ef916f" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#run-base)" />
        <Rect width="100%" height="100%" fill="url(#run-glow)" />
        <Rect width="100%" height="100%" fill="url(#run-warmth)" />
      </Svg>
    );
  }

  const start = variant === 'editor'
    ? theme.mode === 'light' ? '#f9f5ee' : '#14231e'
    : theme.surfaceSoft;

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%">
      <Defs>
        <LinearGradient id="screen-base" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={start} />
          <Stop offset="0.42" stopColor={theme.surface} />
          <Stop offset="1" stopColor={theme.surface} />
        </LinearGradient>
        <RadialGradient id="settings-glow" cx="88%" cy="8%" r="35%">
          <Stop offset="0" stopColor="#a9c4b3" stopOpacity={variant === 'settings' ? 0.24 : 0} />
          <Stop offset="1" stopColor="#a9c4b3" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#screen-base)" />
      <Rect width="100%" height="100%" fill="url(#settings-glow)" />
    </Svg>
  );
}
