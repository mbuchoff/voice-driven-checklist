import { createElement } from 'react';
import { render, screen } from '@testing-library/react-native';

import {
  getFarthestCornerCircle,
  getRunBackground,
  ScreenBackground,
} from './ScreenBackground';

describe('run screen background', () => {
  it('translates a CSS farthest-corner circle into user-space geometry', () => {
    const circle = getFarthestCornerCircle(400, 800, 0.75, 0.12);

    expect(circle.cx).toBe(300);
    expect(circle.cy).toBe(96);
    expect(circle.r).toBeCloseTo(Math.hypot(300, 704));
  });

  it('applies the approved light geometry to the rendered gradients', () => {
    render(createElement(ScreenBackground, { variant: 'run' }));

    expect(
      screen.UNSAFE_getByType('RNSVGLinearGradient' as never).props,
    ).toMatchObject({
      x1: '37%',
      y1: '0%',
      x2: '63%',
      y2: '100%',
    });
    const glow = screen.UNSAFE_getAllByType(
      'RNSVGRadialGradient' as never,
    )[0].props;
    expect(glow.gradientUnits).toBe(1);
    expect(typeof glow.cx).toBe('number');
    expect(glow.rx).toBe(glow.ry);
    expect(glow.gradient[2]).toBe(0.35);
  });

  it('matches the approved dark gradient geometry', () => {
    expect(getRunBackground('dark')).toMatchObject({
      gradient: {
        x1: '37%',
        y1: '0%',
        x2: '63%',
        y2: '100%',
        middleOffset: '60%',
      },
      glow: {
        cx: 0.75,
        cy: 0.12,
        fadeStop: '34%',
        color: '#6a9981',
        opacity: 0.24,
      },
    });
  });

  it('matches the approved light gradient geometry', () => {
    expect(getRunBackground('light')).toMatchObject({
      gradient: {
        x1: '37%',
        y1: '0%',
        x2: '63%',
        y2: '100%',
        middleOffset: '58%',
      },
      glow: {
        cx: 0.76,
        cy: 0.12,
        fadeStop: '35%',
        color: '#a3beab',
        opacity: 0.34,
      },
      warmth: {
        cx: 0.12,
        cy: 0.72,
        fadeStop: '32%',
        opacity: 0.1,
      },
    });
  });
});
