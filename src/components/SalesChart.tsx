import { useRef, useEffect } from 'react';

interface DataPoint {
  label: string;
  sales: number;
  expenses: number;
}

export function SalesChart({ data, height = 256 }: { data: DataPoint[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const allValues = [...data.map(d => d.sales), ...data.map(d => d.expenses)];
    const maxVal = Math.max(...allValues, 10);
    const niceMax = Math.ceil(maxVal / 10) * 10;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#71717a';

    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + (chartH / steps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      const val = niceMax - (niceMax / steps) * i;
      ctx.textAlign = 'right';
      ctx.fillText(`₹${val.toFixed(0)}`, padding.left - 8, y + 3);
    }

    // X labels
    const stepX = chartW / Math.max(data.length - 1, 1);
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      const x = padding.left + stepX * i;
      ctx.fillText(d.label, x, h - padding.bottom + 15);
    });

    // Draw line + fill for sales
    drawSeries(ctx, data.map(d => d.sales), stepX, padding, chartH, niceMax, '#f59e0b', 'rgba(245,158,11,0.15)');
    // Draw line for expenses
    drawSeries(ctx, data.map(d => d.expenses), stepX, padding, chartH, niceMax, '#ef4444', 'rgba(239,68,68,0.08)');
  }, [data]);

  return <canvas ref={canvasRef} style={{ width: '100%', height }} />;
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  values: number[],
  stepX: number,
  padding: { top: number; left: number },
  chartH: number,
  maxVal: number,
  stroke: string,
  fill: string
) {
  if (values.length === 0) return;

  // Fill area
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  values.forEach((v, i) => {
    const x = padding.left + stepX * i;
    const y = padding.top + chartH - (v / maxVal) * chartH;
    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      const prevX = padding.left + stepX * (i - 1);
      const prevY = padding.top + chartH - (values[i - 1] / maxVal) * chartH;
      const cpX = (prevX + x) / 2;
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
    }
  });
  ctx.lineTo(padding.left + stepX * (values.length - 1), padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padding.left + stepX * i;
    const y = padding.top + chartH - (v / maxVal) * chartH;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = padding.left + stepX * (i - 1);
      const prevY = padding.top + chartH - (values[i - 1] / maxVal) * chartH;
      const cpX = (prevX + x) / 2;
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
    }
  });
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Points
  values.forEach((v, i) => {
    const x = padding.left + stepX * i;
    const y = padding.top + chartH - (v / maxVal) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
  });
}
