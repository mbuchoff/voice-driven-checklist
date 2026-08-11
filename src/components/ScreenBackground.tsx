import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '@/src/theme/useTheme';

type RunBackground = {
  gradient: {
    x1: string;
    y1: string;
    x2: string;
    y2: string;
    start: string;
    middle: string;
    end: string;
    middleOffset: string;
  };
  glow: {
    cx: number;
    cy: number;
    fadeStop: string;
    color: string;
    opacity: number;
  };
  warmth: {
    cx: number;
    cy: number;
    fadeStop: string;
    opacity: number;
  };
};

export function getFarthestCornerCircle(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
) {
  const cx = width * centerX;
  const cy = height * centerY;
  const farthestX = Math.max(cx, width - cx);
  const farthestY = Math.max(cy, height - cy);
  return { cx, cy, r: Math.hypot(farthestX, farthestY) };
}

export function getRunBackground(mode: 'light' | 'dark'): RunBackground {
  const light = mode === 'light';
  return {
    gradient: {
      x1: '37%',
      y1: '0%',
      x2: '63%',
      y2: '100%',
      start: light ? '#f7f1e7' : '#214d3e',
      middle: light ? '#edf1e9' : '#15352c',
      end: light ? '#dfeae2' : '#102a23',
      middleOffset: light ? '58%' : '60%',
    },
    glow: {
      cx: light ? 0.76 : 0.75,
      cy: 0.12,
      fadeStop: light ? '35%' : '34%',
      color: light ? '#a3beab' : '#6a9981',
      opacity: light ? 0.34 : 0.24,
    },
    warmth: {
      cx: 0.12,
      cy: 0.72,
      fadeStop: '32%',
      opacity: light ? 0.1 : 0,
    },
  };
}

export function ScreenBackground({
  variant,
}: {
  variant: 'editor' | 'settings' | 'run' | 'completion';
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();

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
    const background = getRunBackground(theme.mode);
    const glow = getFarthestCornerCircle(
      width,
      height,
      background.glow.cx,
      background.glow.cy,
    );
    const warmth = getFarthestCornerCircle(
      width,
      height,
      background.warmth.cx,
      background.warmth.cy,
    );
    return (
      <Svg pointerEvents="none" style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient
            id="run-base"
            x1={background.gradient.x1}
            y1={background.gradient.y1}
            x2={background.gradient.x2}
            y2={background.gradient.y2}
          >
            <Stop offset="0%" stopColor={background.gradient.start} />
            <Stop offset={background.gradient.middleOffset} stopColor={background.gradient.middle} />
            <Stop offset="100%" stopColor={background.gradient.end} />
          </LinearGradient>
          <RadialGradient
            id="run-glow"
            gradientUnits="userSpaceOnUse"
            cx={glow.cx}
            cy={glow.cy}
            r={glow.r}
          >
            <Stop
              offset="0%"
              stopColor={background.glow.color}
              stopOpacity={background.glow.opacity}
            />
            <Stop
              offset={background.glow.fadeStop}
              stopColor={background.glow.color}
              stopOpacity={0}
            />
          </RadialGradient>
          <RadialGradient
            id="run-warmth"
            gradientUnits="userSpaceOnUse"
            cx={warmth.cx}
            cy={warmth.cy}
            r={warmth.r}
          >
            <Stop offset="0%" stopColor="#ef916f" stopOpacity={background.warmth.opacity} />
            <Stop
              offset={background.warmth.fadeStop}
              stopColor="#ef916f"
              stopOpacity={0}
            />
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
