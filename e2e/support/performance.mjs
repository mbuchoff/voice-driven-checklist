export function parseGfxInfo(output) {
  const totalMatch = output.match(/Total frames rendered:\s*(\d+)/i);
  const jankyMatch = output.match(/Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/i);

  if (!totalMatch || !jankyMatch) {
    throw new Error('Android frame summary was not present in gfxinfo output');
  }

  return {
    totalFrames: Number(totalMatch[1]),
    jankyFrames: Number(jankyMatch[1]),
    jankyPercent: Number(jankyMatch[2]),
  };
}
