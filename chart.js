/**
 * EvoSafe Analytics Charting System
 * Renders dual research charts on Canvas 2D:
 * 1. Fitness curves (Best and Average fitness per generation)
 * 2. Safety & Diversity curves (Collision rate and Population genetic diversity)
 */

class AnalyticsCharts {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.history = []; // array of { gen, best, avg, diversity, collisionRate }
    this.maxPoints = 120;
    this.activeTab = "fitness"; // 'fitness' | 'safety'
  }

  push(entry) {
    this.history.push({
      gen: entry.gen ?? this.history.length,
      best: entry.best ?? 0,
      avg: entry.avg ?? 0,
      diversity: entry.diversity ?? 0,
      collisionRate: entry.collisionRate ?? 0,
    });
    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }
  }

  reset() {
    this.history = [];
  }

  setTab(tab) {
    if (tab === "fitness" || tab === "safety") {
      this.activeTab = tab;
    }
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

    const bg = readCssVar("--chart-bg", "#161b22");
    const gridColor = readCssVar("--chart-grid", "rgba(255,255,255,0.06)");
    const textColor = readCssVar("--text-dim", "#8b949e");
    const primaryText = readCssVar("--text", "#e6edf3");

    // Colors
    const bestColor = readCssVar("--accent-emerald", "#10b981");
    const avgColor = readCssVar("--accent-cyan", "#38bdf8");
    const dangerColor = readCssVar("--danger", "#f43f5e");
    const diversityColor = readCssVar("--accent-purple", "#a855f7");

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const padL = 36;
    const padR = 12;
    const padT = 24;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (this.history.length < 2) {
      ctx.fillStyle = textColor;
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Awaiting generational data…",
        w / 2,
        h / 2
      );
      ctx.textAlign = "left";
      return;
    }

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    if (this.activeTab === "fitness") {
      this.#drawFitnessSeries(ctx, padL, padT, plotW, plotH, bestColor, avgColor, textColor, primaryText);
    } else {
      this.#drawSafetySeries(ctx, padL, padT, plotW, plotH, diversityColor, dangerColor, textColor, primaryText);
    }
  }

  #drawFitnessSeries(ctx, padL, padT, plotW, plotH, bestColor, avgColor, textColor, primaryText) {
    const all = this.history.map((d) => d.best).concat(this.history.map((d) => d.avg));
    const maxV = Math.max(...all, 10);
    const minV = Math.min(...all, 0);
    const range = Math.max(1, maxV - minV);

    // Y Axis Labels
    ctx.fillStyle = textColor;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(maxV, 0), padL - 6, padT + 8);
    ctx.fillText(formatNumber((maxV + minV) / 2, 0), padL - 6, padT + plotH / 2 + 4);
    ctx.fillText(formatNumber(minV, 0), padL - 6, padT + plotH);
    ctx.textAlign = "left";

    const drawLine = (key, color, lw, dash = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < this.history.length; i++) {
        const x = padL + (plotW * i) / Math.max(1, this.history.length - 1);
        const y = padT + plotH - ((this.history[i][key] - minV) / range) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawLine("avg", avgColor, 1.5, [4, 4]);
    drawLine("best", bestColor, 2.5);

    // Legend & Last Values
    const last = this.history[this.history.length - 1];
    ctx.font = "11px Inter, system-ui, sans-serif";

    ctx.fillStyle = bestColor;
    ctx.fillText(`● Best: ${formatNumber(last.best, 1)}`, padL + 4, padT - 8);

    ctx.fillStyle = avgColor;
    ctx.fillText(`-- Avg: ${formatNumber(last.avg, 1)}`, padL + 110, padT - 8);
  }

  #drawSafetySeries(ctx, padL, padT, plotW, plotH, diversityColor, dangerColor, textColor, primaryText) {
    // Both Diversity and Collision Rate are normalized in [0, 1]
    ctx.fillStyle = textColor;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("1.0", padL - 6, padT + 8);
    ctx.fillText("0.5", padL - 6, padT + plotH / 2 + 4);
    ctx.fillText("0.0", padL - 6, padT + plotH);
    ctx.textAlign = "left";

    const drawLine = (key, color, lw, dash = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < this.history.length; i++) {
        const x = padL + (plotW * i) / Math.max(1, this.history.length - 1);
        const val = clamp(this.history[i][key] || 0, 0, 1);
        const y = padT + plotH - val * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawLine("collisionRate", dangerColor, 2, [3, 3]);
    drawLine("diversity", diversityColor, 2.5);

    const last = this.history[this.history.length - 1];
    ctx.font = "11px Inter, system-ui, sans-serif";

    ctx.fillStyle = diversityColor;
    ctx.fillText(`● Diversity: ${(last.diversity || 0).toFixed(3)}`, padL + 4, padT - 8);

    ctx.fillStyle = dangerColor;
    ctx.fillText(`-- Crash Rate: ${((last.collisionRate || 0) * 100).toFixed(0)}%`, padL + 130, padT - 8);
  }
}
