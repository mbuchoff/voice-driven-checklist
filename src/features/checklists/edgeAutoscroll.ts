export function getEdgeAutoscrollDelta(
  distanceIntoEdge: number,
  elapsedMs: number,
  edgeSize: number,
  maxSpeed: number,
): number {
  'worklet';
  const intensity = Math.min(1, Math.max(0, distanceIntoEdge) / edgeSize);
  return maxSpeed * intensity * Math.max(0, elapsedMs) / 1000;
}
