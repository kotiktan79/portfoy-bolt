import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  colorPositive?: string;
  colorNegative?: string;
  fillOpacity?: number;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  strokeWidth = 1.5,
  colorPositive = '#10b981',
  colorNegative = '#ef4444',
  fillOpacity = 0.15,
}: SparklineProps) {
  const { path, areaPath, color } = useMemo(() => {
    if (data.length < 2) {
      return { path: '', areaPath: '', color: colorPositive };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return [x, y];
    });

    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const areaD = `${lineD} L${width},${height} L0,${height} Z`;

    const direction = data[data.length - 1] - data[0];
    const c = direction >= 0 ? colorPositive : colorNegative;

    return { path: lineD, areaPath: areaD, color: c };
  }, [data, width, height, colorPositive, colorNegative]);

  if (!path) {
    return <div style={{ width, height }} className="bg-slate-100 dark:bg-gray-800 rounded" />;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={areaPath} fill={color} fillOpacity={fillOpacity} />
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
