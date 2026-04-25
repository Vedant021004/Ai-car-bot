class Sensor {
  constructor(car, rayCount = 5, rayLength = 180, raySpread = Math.PI / 2) {
    this.car = car;
    this.rayCount = rayCount;
    this.rayLength = rayLength;
    this.raySpread = raySpread;
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
    return best;
  }

  draw(ctx) {
    if (!this.rays || this.rays.length === 0) return;
    for (let i = 0; i < this.rays.length; i++) {
      let end = this.rays[i][1];
      const reading = this.readings[i];
      if (reading) end = reading;

      const start = this.rays[i][0];
      const hitColor = readCssVar("--sensor-hit", "#ffd76a");
      const beamColor = readCssVar("--sensor-beam", "#ffd76a");
      const danger = readCssVar("--sensor-danger", "#ff4d4f");

      ctx.save();
      ctx.lineCap = "round";

      // Beam from car to (end) — green→yellow gradient by proximity
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = beamColor;
      ctx.globalAlpha = 0.85;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Tail from end to ray's natural end (faded)
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = hitColor;
      ctx.globalAlpha = 0.18;
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(this.rays[i][1].x, this.rays[i][1].y);
      ctx.stroke();

      // Glow dot at hit point
      if (reading) {
        ctx.beginPath();
        ctx.fillStyle = danger;
        ctx.globalAlpha = 0.9;
        ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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
