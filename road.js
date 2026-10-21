class Road {
  constructor(x, width, laneCount = 3, options = {}) {
    this.x = x;
    this.width = width;
    this.laneCount = laneCount;
    this.curveIntensity = options.curveIntensity ?? 0.85;
    this.hasCurves = options.hasCurves ?? (this.curveIntensity > 0.05);

    this.left = x - width / 2;
    this.right = x + width / 2;
    const infinity = 1_000_000;
    this.top = -infinity;
    this.bottom = infinity;
    this.laneWidth = width / laneCount;

    // Initial borders fallback
    const topLeft = { x: this.left, y: this.top };
    const bottomLeft = { x: this.left, y: this.bottom };
    const topRight = { x: this.right, y: this.top };
    const bottomRight = { x: this.right, y: this.bottom };
    this.borders = [
      [topLeft, bottomLeft],
      [topRight, bottomRight],
    ];

    this._borderCacheCamY = null;
    this.#rebuildBorders(600);
  }

  setCurvature(intensity) {
    this.curveIntensity = clamp(intensity, 0, 2.0);
    this.hasCurves = this.curveIntensity > 0.05;
    this._borderCacheCamY = null;
    this.#rebuildBorders(600);
  }

  getRoadCenterX(y) {
    if (!this.hasCurves || this.curveIntensity <= 0.02) return this.x;
    // Perfect straight grid at start area so cars depart cleanly
    if (y > 450) return this.x;

    const dist = 450 - y;
    const ramp = Math.min(1, dist / 250);

    // Layered harmonic curves simulating realistic highway curves and S-bends:
    // 1. Long sweeping highway turns (~1400px period, amplitude ~110px)
    const turn1 = Math.sin(dist * 0.0014) * 110 * this.curveIntensity;
    // 2. Mountain S-curves & chicane bends (~550px period, amplitude ~48px)
    const turn2 = Math.sin(dist * 0.0035) * 48 * this.curveIntensity;
    // 3. Highway lateral drift
    const turn3 = (Math.cos(dist * 0.0008) - 1) * 35 * this.curveIntensity;

    return this.x + (turn1 + turn2 + turn3) * ramp;
  }

  getLeft(y) {
    return this.getRoadCenterX(y) - this.width / 2;
  }

  getRight(y) {
    return this.getRoadCenterX(y) + this.width / 2;
  }

  getLaneCenter(laneIndex, y = 600) {
    const leftAtY = this.getLeft(y);
    return (
      leftAtY +
      this.laneWidth / 2 +
      Math.min(laneIndex, this.laneCount - 1) * this.laneWidth
    );
  }

  #rebuildBorders(centerY) {
    if (!this.hasCurves || this.curveIntensity <= 0.02) {
      const topLeft = { x: this.left, y: this.top };
      const bottomLeft = { x: this.left, y: this.bottom };
      const topRight = { x: this.right, y: this.top };
      const bottomRight = { x: this.right, y: this.bottom };
      this.borders = [
        [topLeft, bottomLeft],
        [topRight, bottomRight],
      ];
      return;
    }

    // Build piecewise line segments for left and right curved borders around centerY
    const step = 45; // 45px resolution for smooth curvature & fast collision math
    const radius = 2500;
    const startY = centerY - radius;
    const endY = centerY + radius;

    const newBorders = [];
    let prevL = { x: this.getLeft(startY), y: startY };
    let prevR = { x: this.getRight(startY), y: startY };

    for (let cy = startY + step; cy <= endY; cy += step) {
      const curL = { x: this.getLeft(cy), y: cy };
      const curR = { x: this.getRight(cy), y: cy };

      newBorders.push([prevL, curL]);
      newBorders.push([prevR, curR]);

      prevL = curL;
      prevR = curR;
    }

    this.borders = newBorders;
    this._borderCacheCamY = centerY;
  }

  updateBordersForView(centerY) {
    if (!this.hasCurves || this.curveIntensity <= 0.02) return;
    if (this._borderCacheCamY == null || Math.abs(centerY - this._borderCacheCamY) > 500) {
      this.#rebuildBorders(centerY);
    }
  }

  draw(ctx) {
    const laneColor = readCssVar("--lane", "rgba(255, 255, 255, 0.85)");
    const borderColor = readCssVar("--border", "#f8fafc");

    let topY = -10000;
    let bottomY = 10000;
    try {
      const transform = ctx.getTransform();
      if (transform && transform.d) {
        const viewH = ctx.canvas?.height ? ctx.canvas.height / transform.d : 1000;
        const camY = -transform.f / transform.d;
        topY = camY - 250;
        bottomY = camY + viewH + 250;
      }
    } catch (_) {}

    ctx.save();

    if (!this.hasCurves || this.curveIntensity <= 0.02) {
      // Straight road rendering (clean fallback)
      const roadGrad = ctx.createLinearGradient(this.left, 0, this.right, 0);
      roadGrad.addColorStop(0, "#131720");
      roadGrad.addColorStop(0.08, "#181d26");
      roadGrad.addColorStop(0.5, "#1c222c");
      roadGrad.addColorStop(0.92, "#181d26");
      roadGrad.addColorStop(1, "#131720");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(this.left, topY, this.width, bottomY - topY);

      // Rumble strips
      const kerbWidth = 8;
      const segH = 26;
      const startSeg = Math.floor(topY / segH) * segH;
      for (let y = startSeg; y < bottomY; y += segH) {
        const isRed = Math.floor(y / segH) % 2 === 0;
        ctx.fillStyle = isRed ? "#dc2626" : "#f1f5f9";
        ctx.fillRect(this.left - kerbWidth, y, kerbWidth, segH);
        ctx.fillRect(this.right, y, kerbWidth, segH);
      }
    } else {
      // Curved & Turning Road Rendering via Quad Strip Slices
      const segH = 22;
      const kerbWidth = 9;
      const startSeg = Math.floor(topY / segH) * segH;

      for (let y = startSeg; y < bottomY; y += segH) {
        const y0 = y;
        const y1 = y + segH;
        const L0 = this.getLeft(y0);
        const R0 = this.getRight(y0);
        const L1 = this.getLeft(y1);
        const R1 = this.getRight(y1);

        // Asphalt Tarmac Surface Quad
        ctx.beginPath();
        ctx.moveTo(L0, y0);
        ctx.lineTo(R0, y0);
        ctx.lineTo(R1, y1);
        ctx.lineTo(L1, y1);
        ctx.closePath();
        ctx.fillStyle = "#161b24";
        ctx.fill();

        // Inner asphalt shading
        ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
        ctx.fill();

        // Red & White FIA Rumble Strips (Kerbs) on outer curve borders
        const isRed = Math.floor(y / segH) % 2 === 0;
        ctx.fillStyle = isRed ? "#dc2626" : "#f1f5f9";

        // Left Kerb
        ctx.beginPath();
        ctx.moveTo(L0 - kerbWidth, y0);
        ctx.lineTo(L0, y0);
        ctx.lineTo(L1, y1);
        ctx.lineTo(L1 - kerbWidth, y1);
        ctx.closePath();
        ctx.fill();

        // Right Kerb
        ctx.beginPath();
        ctx.moveTo(R0, y0);
        ctx.lineTo(R0 + kerbWidth, y0);
        ctx.lineTo(R1 + kerbWidth, y1);
        ctx.lineTo(R1, y1);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Start Grid & Origin Markings
    const startY = 600;
    if (startY >= topY - 100 && startY <= bottomY + 100) {
      const sLeft = this.getLeft(startY);
      const sRight = this.getRight(startY);
      const checkW = 12;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let x = sLeft + 8; x < sRight - 8; x += checkW) {
          const isWhite = (Math.floor((x - sLeft) / checkW) + r) % 2 === 0;
          ctx.fillStyle = isWhite ? "rgba(255,255,255,0.85)" : "rgba(20,20,20,0.85)";
          ctx.fillRect(x, startY + r * checkW, checkW, checkW);
        }
      }
      ctx.fillStyle = "rgba(16, 185, 129, 0.85)";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("◀ START / ORIGIN 0m ▶", this.getRoadCenterX(startY), startY + 40);
    }

    // Distance Markers along road center every 400px
    const markerInterval = 400;
    const startMarker = Math.floor(topY / markerInterval) * markerInterval;
    for (let my = startMarker; my < bottomY; my += markerInterval) {
      if (my >= 600) continue;
      const meters = Math.round((600 - my) / 4);
      const mCenterX = this.getRoadCenterX(my);
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
      ctx.font = "bold 13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`— ${meters}m —`, mCenterX, my);

      // Curve Direction Warning Chevrons on sharp turns
      if (this.hasCurves && this.curveIntensity > 0.2) {
        const nextX = this.getRoadCenterX(my - 100);
        const deltaX = nextX - mCenterX;
        if (Math.abs(deltaX) > 12) {
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.fillStyle = "#38bdf8";
          ctx.fillText(deltaX < 0 ? "◀ SHARP LEFT TURN" : "SHARP RIGHT TURN ▶", mCenterX, my + 20);
        }
      }
      ctx.restore();
    }

    // Dashed Lane Dividers with Cat's-Eye Reflective Studs
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = laneColor;

    for (let i = 1; i <= this.laneCount - 1; i++) {
      const ratio = i / this.laneCount;
      const segH = 24;
      const dashStart = Math.floor(topY / segH) * segH;

      ctx.save();
      for (let dy = dashStart; dy < bottomY; dy += segH) {
        // Dash pattern: draw 1 segment on, 1 segment off
        const isDashOn = Math.floor(dy / segH) % 2 === 0;
        if (isDashOn) {
          const dy0 = dy;
          const dy1 = dy + segH;
          const dx0 = this.getLeft(dy0) + this.width * ratio;
          const dx1 = this.getLeft(dy1) + this.width * ratio;

          ctx.beginPath();
          ctx.moveTo(dx0, dy0);
          ctx.lineTo(dx1, dy1);
          ctx.stroke();

          // Reflective Cyan Stud
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.arc(dx0, dy0, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Solid Highway Fog Line Borders (Left & Right)
    ctx.setLineDash([]);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3.5;

    if (!this.hasCurves || this.curveIntensity <= 0.02) {
      this.borders.forEach((border) => {
        ctx.beginPath();
        ctx.moveTo(border[0].x, topY);
        ctx.lineTo(border[1].x, bottomY);
        ctx.stroke();
      });
    } else {
      // Draw smooth continuous border curves
      const segH = 24;
      const bStart = Math.floor(topY / segH) * segH;

      ctx.beginPath();
      ctx.moveTo(this.getLeft(bStart), bStart);
      for (let by = bStart + segH; by < bottomY; by += segH) {
        ctx.lineTo(this.getLeft(by), by);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.getRight(bStart), bStart);
      for (let by = bStart + segH; by < bottomY; by += segH) {
        ctx.lineTo(this.getRight(by), by);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
}
