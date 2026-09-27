export function getEdgeAutoscrollDelta(
  distanceIntoEdge: number,
  elapsedMs: number,
  rampDistance: number,
  maxSpeed: number,
): number {
  'worklet';
  const intensity = Math.min(1, Math.max(0, distanceIntoEdge) / rampDistance);
  return maxSpeed * intensity * Math.max(0, elapsedMs) / 1000;
}
