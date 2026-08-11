import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'arrowLeft'
  | 'arrowRight'
  | 'check'
  | 'checkCircle'
  | 'close'
  | 'download'
  | 'edit'
  | 'mic'
  | 'moon'
  | 'monitor'
  | 'plus'
  | 'play'
  | 'repeat'
  | 'settings'
  | 'sound'
  | 'sun'
  | 'trash'
  | 'upload';

export function Icon({
  name,
  color,
  size = 24,
  strokeWidth = 2,
  testID,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}) {
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {pathFor(name, color)}
    </Svg>
  );
}

function pathFor(name: IconName, color: string): ReactNode {
  switch (name) {
    case 'arrowLeft':
      return <Path d="m15 18-6-6 6-6" />;
    case 'arrowRight':
      return <Path d="m9 18 6-6-6-6" />;
    case 'check':
      return <Path d="m5 12 4 4L19 6" />;
    case 'checkCircle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="m8 12 2.5 2.5L16 9" />
        </>
      );
    case 'close':
      return <Path d="m18 6-12 12M6 6l12 12" />;
    case 'download':
      return (
        <>
          <Path d="M12 3v13m0 0-5-5m5 5 5-5" />
          <Path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </>
      );
    case 'edit':
      return (
        <>
          <Path d="M12 20h9" />
          <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </>
      );
    case 'mic':
      return (
        <>
          <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <Path d="M19 10v2a7 7 0 0 1-14 0v-2m7 9v3" />
        </>
      );
    case 'moon':
      return <Path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />;
    case 'monitor':
      return (
        <>
          <Rect x="3" y="4" width="18" height="13" rx="2" />
          <Path d="M8 21h8m-4-4v4" />
        </>
      );
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'play':
      return <Path d="m8 5 11 7-11 7Z" />;
    case 'repeat':
      return (
        <>
          <Path d="m17 2 4 4-4 4" />
          <Path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" />
          <Path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case 'sound':
      return (
        <>
          <Path d="M11 5 6 9H3v6h3l5 4Z" />
          <Path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle cx="12" cy="12" r="4" />
          <Path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case 'trash':
      return <Path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />;
    case 'upload':
      return (
        <>
          <Path d="M12 16V3m0 0L7 8m5-5 5 5" />
          <Path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </>
      );
  }
}
