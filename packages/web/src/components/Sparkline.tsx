/** A dependency-free inline SVG sparkline for a numeric series. */
export function Sparkline({ values, width = 160, height = 36 }: { values: number[]; width?: number; height?: number }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) {
    return <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = width / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}
