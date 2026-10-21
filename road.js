class Road {
  constructor(x, width, laneCount = 3) {
    this.x = x;
    this.width = width;
    this.laneCount = laneCount;
    this.left = x - width / 2;
    this.right = x + width / 2;
    const infinity = 1_000_000;
    this.top = -infinity;
    this.bottom = infinity;
    this.laneWidth = width / laneCount;
    const topLeft = { x: this.left, y: this.top };
    const bottomLeft = { x: this.left, y: this.bottom };
    const topRight = { x: this.right, y: this.top };
    const bottomRight = { x: this.right, y: this.bottom };
    this.borders = [
      [topLeft, bottomLeft],
      [topRight, bottomRight],
    ];
  }

  getLaneCenter(laneIndex) {
    return (
      this.left +
      this.laneWidth / 2 +
      Math.min(laneIndex, this.laneCount - 1) * this.laneWidth
    );
  }

  draw(ctx) {
    const laneColor = readCssVar("--lane", "rgba(255, 255, 255, 0.85)");
    const borderColor = readCssVar("--border", "#f8fafc");

    // Determine visible world bounds from current canvas transform
    let topY = -10000;
    let bottomY = 10000;
    try {
      const transform = ctx.getTransform();
      if (transform && transform.d) {
        const viewH = ctx.canvas?.height ? ctx.canvas.height / transform.d : 1000;
        const camY = -transform.f / transform.d;
        topY = camY - 200;
        bottomY = camY + viewH + 200;
      }
    } catch (_) {}

    ctx.save();

    // 1. Road Tarmac Surface
    const roadGrad = ctx.createLinearGradient(this.left, 0, this.right, 0);
    roadGrad.addColorStop(0, "#131720");
    roadGrad.addColorStop(0.08, "#181d26");
    roadGrad.addColorStop(0.5, "#1c222c");
    roadGrad.addColorStop(0.92, "#181d26");
    roadGrad.addColorStop(1, "#131720");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(this.left, topY, this.width, bottomY - topY);

    // 2. Highway Rumble Strips (Red & White Kerbs) on outer borders
    const kerbWidth = 8;
    const segH = 26;
    const startSeg = Math.floor(topY / segH) * segH;
    for (let y = startSeg; y < bottomY; y += segH) {
      const isRed = Math.floor(y / segH) % 2 === 0;
      ctx.fillStyle = isRed ? "#dc2626" : "#f1f5f9";

      // Left rumble strip
      ctx.fillRect(this.left - kerbWidth, y, kerbWidth, segH);
      // Right rumble strip
      ctx.fillRect(this.right, y, kerbWidth, segH);
    }

    // 3. Highway Surface Markings: Start Grid & Distance Markers
    const startY = 600;
    if (startY >= topY - 100 && startY <= bottomY + 100) {
      // Checkered Start Line
      const checkW = 12;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let x = this.left + 8; x < this.right - 8; x += checkW) {
          const isWhite = (Math.floor((x - this.left) / checkW) + r) % 2 === 0;
          ctx.fillStyle = isWhite ? "rgba(255,255,255,0.85)" : "rgba(20,20,20,0.85)";
          ctx.fillRect(x, startY + r * checkW, checkW, checkW);
        }
      }
      ctx.fillStyle = "rgba(16, 185, 129, 0.75)";
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("◀ START / ORIGIN 0m ▶", this.x, startY + 40);
    }

    // Highway Mile Distance Markers every 400px forward (-y direction)
    const markerInterval = 400;
    const startMarker = Math.floor(topY / markerInterval) * markerInterval;
    for (let my = startMarker; my < bottomY; my += markerInterval) {
      if (my >= 600) continue;
      const meters = Math.round((600 - my) / 4);
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.font = "bold 13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`— ${meters}m —`, this.x, my);

      // Lane direction chevrons
      for (let l = 0; l < this.laneCount; l++) {
        const lx = this.getLaneCenter(l);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx - 6, my + 45);
        ctx.lineTo(lx, my + 35);
        ctx.lineTo(lx + 6, my + 45);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Dashed Lane Dividers with Cat's-Eye Reflective Studs
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = laneColor;

    for (let i = 1; i <= this.laneCount - 1; i++) {
      const x = lerp(this.left, this.right, i / this.laneCount);

      ctx.save();
      ctx.setLineDash([26, 26]);
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.stroke();
      ctx.restore();

      // Reflective Cat's-Eye Studs at dash points
      const studInterval = 52;
      const studStart = Math.floor(topY / studInterval) * studInterval;
      ctx.fillStyle = "#38bdf8";
      for (let sy = studStart; sy < bottomY; sy += studInterval) {
        ctx.beginPath();
        ctx.arc(x, sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Solid Highway Fog Line Borders (Left & Right)
    ctx.setLineDash([]);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    this.borders.forEach((border) => {
      ctx.beginPath();
      ctx.moveTo(border[0].x, topY);
      ctx.lineTo(border[1].x, bottomY);
      ctx.stroke();
    });

    ctx.restore();
  }
}
