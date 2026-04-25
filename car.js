class Car {
  constructor(x, y, width, height, mode, maxSpeed = 5, sensorOptions = {}) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.maxSpeed = maxSpeed;
    this.speed = 0;
    this.friction = 0.05;
    this.acceleration = 0.2;
    this.angle = 0;
    this.mode = mode;
    this.useBrain = mode === ControlMode.AI;
    this.damaged = false;

    this.distanceTraveled = 0;
    this.topSpeed = 0;
    this.aliveFrames = 0;

    this.trail = []; // ring buffer of recent rear-axle points

    if (mode !== ControlMode.DUMMY) {
      this.sensor = new Sensor(
        this,
        sensorOptions.rayCount,
        sensorOptions.rayLength,
        sensorOptions.raySpread
      );
      const inputCount = this.sensor.rayCount;
      this.brain = new NeuralNetwork([inputCount, 6, 4]);
    }
    this.controls = new Controls(mode);
    this.polygon = this.#createPolygon();
  }

  reset(x, y) {
    this.x = x ?? this.startX;
    this.y = y ?? this.startY;
    this.speed = 0;
    this.angle = 0;
    this.damaged = false;
    this.distanceTraveled = 0;
    this.topSpeed = 0;
    this.aliveFrames = 0;
    this.trail = [];
    this.polygon = this.#createPolygon();
  }

  get fitness() {
    // Higher = better. Distance is the dominant signal; small bonus for top speed;
    // penalty for crashing prevents reward-hacking by crashing fast.
    const crashPenalty = this.damaged ? 50 : 0;
    return Math.max(0, this.distanceTraveled) + this.topSpeed * 5 - crashPenalty;
  }

  update(roadBorders, traffic) {
    if (this.damaged) return; // freeze damaged cars completely (no phantom inputs, no sensor work)

    const prevY = this.y;
    this.#move();
    this.polygon = this.#createPolygon();
    this.damaged = this.#assessDamage(roadBorders, traffic);
    const forward = prevY - this.y;
    if (forward > 0) this.distanceTraveled += forward;
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    this.aliveFrames++;

    // Tire trail: car moves in direction (-sin(angle), -cos(angle)).
    // The REAR is opposite that — i.e. (+sin, +cos) … wait, signs cancel:
    // since `y -= cos*speed` means forward is -y when speed>0 and angle=0,
    // the rear axle is at +y in world space. So `+ sin/cos * height/2` IS
    // behind the car when moving forward. Verified visually: trail lags.
    const rearX = this.x + Math.sin(this.angle) * (this.height / 2);
    const rearY = this.y + Math.cos(this.angle) * (this.height / 2);
    this.trail.push({ x: rearX, y: rearY, age: 0 });
    if (this.trail.length > 30) this.trail.shift();
    for (const p of this.trail) p.age++;

    if (this.sensor) {
      this.sensor.update(roadBorders, traffic);
      const offsets = this.sensor.readings.map((e) =>
        e == null ? 0 : 1 - e.offset
      );
      const outputs = NeuralNetwork.feedForward(offsets, this.brain);
      if (this.useBrain) {
        // Step activation outputs 0/1; treat 1 as "pressed".
        this.controls.up = outputs[0] === 1;
        this.controls.left = outputs[1] === 1;
        this.controls.right = outputs[2] === 1;
        this.controls.down = outputs[3] === 1;
      }
    }
  }

  #assessDamage(roadBorders, traffic) {
    for (let i = 0; i < roadBorders.length; i++) {
      if (polysIntersect(this.polygon, roadBorders[i])) return true;
    }
    for (let i = 0; i < traffic.length; i++) {
      if (traffic[i] === this) continue;
      if (!traffic[i].polygon) continue;
      if (polysIntersect(this.polygon, traffic[i].polygon)) return true;
    }
    return false;
  }

  #createPolygon() {
    const points = [];
    const rad = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);
    points.push({
      x: this.x - Math.sin(this.angle - alpha) * rad,
      y: this.y - Math.cos(this.angle - alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * rad,
      y: this.y - Math.cos(this.angle + alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad,
    });
    return points;
  }

  draw(ctx, color, drawSensor = false) {
    const damagedColor = readCssVar("--car-damaged", "#FFF000");
    ctx.fillStyle = this.damaged ? damagedColor : color;

    // Car body
    ctx.beginPath();
    ctx.moveTo(this.polygon[0].x, this.polygon[0].y);
    for (let i = 1; i < this.polygon.length; i++) {
      ctx.lineTo(this.polygon[i].x, this.polygon[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Windshield strip
    if (!this.damaged) {
      ctx.save();
      ctx.fillStyle = readCssVar("--car-windshield", "rgba(255,255,255,0.18)");
      const fx = this.x - Math.sin(this.angle) * (this.height * 0.1);
      const fy = this.y - Math.cos(this.angle) * (this.height * 0.1);
      ctx.translate(fx, fy);
      ctx.rotate(-this.angle);
      ctx.fillRect(-this.width / 2 + 4, -this.height / 8, this.width - 8, 6);
      ctx.restore();
    }

    if (this.sensor && drawSensor) {
      this.sensor.draw(ctx);
    }
  }

  #move() {
    if (this.controls.up) this.speed += this.acceleration;
    if (this.controls.down) this.speed -= this.acceleration;

    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    if (this.speed < -this.maxSpeed / 2) this.speed = -this.maxSpeed / 2;

    if (this.speed > 0) this.speed -= this.friction;
    if (this.speed < 0) this.speed += this.friction;
    if (Math.abs(this.speed) < this.friction) this.speed = 0;

    if (this.speed !== 0) {
      const flip = this.speed > 0 ? 1 : -1;
      if (this.controls.left) this.angle += 0.03 * flip;
      if (this.controls.right) this.angle -= 0.03 * flip;
    }

    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }
}
