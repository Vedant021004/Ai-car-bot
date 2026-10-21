class Sensor {
  constructor(car, rayCount = 5, rayLength = 180, raySpread = Math.PI / 2) {
    this.car = car;
    this.rayCount = rayCount;
    this.rayLength = rayLength;
    this.raySpread = raySpread;
    this.noise = 0;
    this.readings = [];
    this.rays = [];
  }

  update(roadBorders, traffic) {
    this.#castRays();
    this.readings = [];
    for (let i = 0; i < this.rays.length; i++) {
      this.readings.push(this.#getReading(this.rays[i], roadBorders, traffic));
    }
  }

  #getReading(ray, roadBorders, traffic) {
    let touches = [];
    for (let i = 0; i < roadBorders.length; i++) {
      const touch = getIntersection(
        ray[0],
        ray[1],
        roadBorders[i][0],
        roadBorders[i][1]
      );
      if (touch) touches.push(touch);
    }
    for (let i = 0; i < traffic.length; i++) {
      const poly = traffic[i].polygon;
      if (!poly) continue;
      for (let j = 0; j < poly.length; j++) {
        const value = getIntersection(
          ray[0],
          ray[1],
          poly[j],
          poly[(j + 1) % poly.length]
        );
        if (value) touches.push(value);
      }
    }
    if (touches.length === 0) return null;
    let best = touches[0];
    for (let i = 1; i < touches.length; i++) {
      if (touches[i].offset < best.offset) best = touches[i];
    }

    // Gaussian-like Sim-to-Real sensor measurement noise injection
    if (best && this.noise > 0) {
      const noisyOffset = clamp(best.offset + (Math.random() - 0.5) * this.noise, 0, 1);
      return {
        x: lerp(ray[0].x, ray[1].x, noisyOffset),
        y: lerp(ray[0].y, ray[1].y, noisyOffset),
        offset: noisyOffset,
      };
    }
    return best;
  }

  draw(ctx) {
    if (!this.rays || this.rays.length === 0) return;

    ctx.save();

    // 1. LiDAR Perception Sector Field (soft radar scan cone)
    if (this.rays.length >= 2) {
      const origin = this.rays[0][0];
      const leftTip = this.rays[0][1];
      const rightTip = this.rays[this.rays.length - 1][1];

      ctx.save();
      const coneGrad = ctx.createRadialGradient(origin.x, origin.y, 10, origin.x, origin.y, this.rayLength);
      coneGrad.addColorStop(0, "rgba(56, 189, 248, 0.12)");
      coneGrad.addColorStop(0.7, "rgba(56, 189, 248, 0.03)");
      coneGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(leftTip.x, leftTip.y);
      ctx.lineTo(rightTip.x, rightTip.y);
      ctx.closePath();
      ctx.fillStyle = coneGrad;
      ctx.fill();
      ctx.restore();
    }

    // 2. Individual Laser Rays with Dynamic Safety Color Transition
    for (let i = 0; i < this.rays.length; i++) {
      let end = this.rays[i][1];
      const reading = this.readings[i];
      if (reading) end = reading;

      const start = this.rays[i][0];
      const naturalEnd = this.rays[i][1];

      // Proximity ratio: 0 (far) to 1 (immediate impact)
      const proximity = reading ? (1 - reading.offset) : 0;
      let rayColor = "#10b981"; // Safe Green
      if (reading) {
        if (proximity > 0.75) rayColor = "#ef4444"; // Critical Red (<25% distance)
        else if (proximity > 0.45) rayColor = "#f59e0b"; // Caution Amber
        else rayColor = "#38bdf8"; // Tracked Cyan
      }

      ctx.save();
      ctx.lineCap = "round";

      // Active Laser Beam
      ctx.beginPath();
      ctx.lineWidth = reading ? 2.5 : 1.8;
      ctx.strokeStyle = rayColor;
      ctx.globalAlpha = reading ? 0.95 : 0.6;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Laser Beam Extension (Ghosted beyond hit obstacle)
      if (reading) {
        ctx.beginPath();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.setLineDash([4, 4]);
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(naturalEnd.x, naturalEnd.y);
        ctx.stroke();
      }

      // Detection Target Crosshair & Proximity Badge
      if (reading) {
        // Outer Radar Ping Ring
        ctx.beginPath();
        ctx.strokeStyle = rayColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
        ctx.stroke();

        // Inner solid core
        ctx.beginPath();
        ctx.fillStyle = rayColor;
        ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Micro Distance Tag in Meters (when dangerously close)
        if (proximity > 0.5) {
          const distM = Math.max(1, Math.round((1 - reading.offset) * this.rayLength / 5));
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.fillStyle = rayColor;
          ctx.textAlign = "center";
          ctx.fillText(`${distM}m`, end.x, end.y - 9);
        }
      }

      ctx.restore();
    }

    ctx.restore();
  }

  #castRays() {
    this.rays = [];
    for (let i = 0; i < this.rayCount; i++) {
      const rayAngle =
        lerp(
          this.raySpread / 2,
          -this.raySpread / 2,
          this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1)
        ) + this.car.angle;

      const start = { x: this.car.x, y: this.car.y };
      const end = {
        x: this.car.x - Math.sin(rayAngle) * this.rayLength,
        y: this.car.y - Math.cos(rayAngle) * this.rayLength,
      };
      this.rays.push([start, end]);
    }
  }
}
