import { createElement } from 'react';
import { render, screen } from '@testing-library/react-native';

import { getRunBackground, ScreenBackground } from './ScreenBackground';

describe('run screen background', () => {
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
    expect(
      screen.UNSAFE_getAllByType('RNSVGRadialGradient' as never)[0].props,
    ).toMatchObject({
      cx: '76%',
      cy: '12%',
      rx: '35%',
      ry: '35%',
    });
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
        cx: '75%',
        cy: '12%',
        r: '34%',
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
        cx: '76%',
        cy: '12%',
        r: '35%',
        color: '#a3beab',
        opacity: 0.34,
      },
      warmth: {
        cx: '12%',
        cy: '72%',
        r: '32%',
        opacity: 0.1,
      },
    });
  });
});
