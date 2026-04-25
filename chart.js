class FitnessChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bestSeries = []; // best fitness per generation
    this.avgSeries = []; // avg fitness per generation
    this.maxPoints = 200;
  }

  push(best, avg) {
    this.bestSeries.push(best);
    this.avgSeries.push(avg);
    if (this.bestSeries.length > this.maxPoints) {
      this.bestSeries.shift();
      this.avgSeries.shift();
    }
  }

  reset() {
    this.bestSeries = [];
    this.avgSeries = [];
  }

  resize(cssWidth, cssHeight, dpr) {
    if (cssWidth <= 0 || cssHeight <= 0) return;
    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const bg = readCssVar("--chart-bg", "rgba(0,0,0,0.55)");
    const gridColor = readCssVar("--chart-grid", "rgba(255,255,255,0.08)");
    const bestColor = readCssVar("--chart-best", "#39d98a");
    const avgColor = readCssVar("--chart-avg", "rgba(255,255,255,0.5)");
    const textColor = readCssVar("--chart-text", "rgba(255,255,255,0.85)");

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = textColor;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("Fitness over generations", 8, 6);

    if (this.bestSeries.length < 2) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("(waiting for first generation…)", 8, h - 16);
      return;
    }

    const padL = 6;
    const padR = 6;
    const padT = 22;
    const padB = 14;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const all = this.bestSeries.concat(this.avgSeries);
    const maxV = Math.max(...all, 1);
    const minV = Math.min(...all, 0);
    const range = Math.max(1, maxV - minV);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    const drawSeries = (series, color, lw) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const x = padL + (plotW * i) / Math.max(1, series.length - 1);
        const y = padT + plotH - ((series[i] - minV) / range) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawSeries(this.avgSeries, avgColor, 1.5);
    drawSeries(this.bestSeries, bestColor, 2);

    // Last value label
    const lastBest = this.bestSeries[this.bestSeries.length - 1];
    ctx.fillStyle = bestColor;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`best ${formatNumber(lastBest)}`, w - 6, padT - 2);
    ctx.textAlign = "left";
  }
}
