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

        // Dynamic Bi-Directional Overtake & Clear Gap Resolution:
        // Allows the vehicle to flexibly choose to overtake from EITHER direction (left or right)
        // based on real-time spatial clearance, preventing getting stuck on left overtake.
        const r = this.sensor.readings;
        if (r && r.length >= 5) {
          const leftDanger = Math.max(
            r[0] ? (1 - r[0].offset) : 0,
            r[1] ? (1 - r[1].offset) : 0
          );
          const rightDanger = Math.max(
            r[4] ? (1 - r[4].offset) : 0,
            r[3] ? (1 - r[3].offset) : 0
          );
          const centerDanger = r[2] ? (1 - r[2].offset) : 0;

          // 1. Conflict resolution: if network commands both left and right simultaneously, pick the open gap
          if (this.controls.left && this.controls.right) {
            if (leftDanger < rightDanger) {
              this.controls.right = false;
            } else {
              this.controls.left = false;
            }
          }

          // 2. Obstacle ahead avoidance: if center danger is elevated, overtake via the clearer side
          if (centerDanger > 0.35) {
            if (leftDanger > rightDanger + 0.12) {
              // Left is blocked/tight -> dynamically steer RIGHT to overtake
              this.controls.right = true;
              this.controls.left = false;
            } else if (rightDanger > leftDanger + 0.12) {
              // Right is blocked/tight -> dynamically steer LEFT to overtake
              this.controls.left = true;
              this.controls.right = false;
            }
          }

          // 3. Imminent side collision / curb avoidance: if steering into an obstacle while the other side is free, redirect
          if (this.controls.left && leftDanger > 0.65 && rightDanger < 0.45) {
            this.controls.left = false;
            this.controls.right = true; // redirect to clear right lane
          } else if (this.controls.right && rightDanger > 0.65 && leftDanger < 0.45) {
            this.controls.right = false;
            this.controls.left = true; // redirect to clear left lane
          }
        }
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
    // 1. Draw LiDAR Sensor First (underneath car body)
    if (this.sensor && drawSensor) {
      this.sensor.draw(ctx);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);

    const w = this.width;
    const h = this.height;

    // Helper for rounded rectangle with fallback
    function drawRoundedRect(rx, ry, rw, rh, r) {
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, r);
      } else {
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
        ctx.arcTo(rx, ry + rh, rx, ry, r);
        ctx.arcTo(rx, ry, rx + rw, ry, r);
        ctx.closePath();
      }
    }

    // 2. Trajectory Prediction Ribbon (Autonomous Path Projection)
    if (drawSensor && !this.damaged && this.speed > 0.15) {
      ctx.save();
      const lookahead = 85;
      const steerCurve = (this.controls.left ? -16 : (this.controls.right ? 16 : 0));
      const ribbonGrad = ctx.createLinearGradient(0, -h / 2, steerCurve, -h / 2 - lookahead);
      ribbonGrad.addColorStop(0, "rgba(16, 185, 129, 0.45)");
      ribbonGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

      ctx.fillStyle = ribbonGrad;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -h / 2);
      ctx.quadraticCurveTo(steerCurve * 0.4, -h / 2 - lookahead * 0.5, steerCurve - w / 4, -h / 2 - lookahead);
      ctx.lineTo(steerCurve + w / 4, -h / 2 - lookahead);
      ctx.quadraticCurveTo(steerCurve * 0.4, -h / 2 - lookahead * 0.5, w / 2 - 4, -h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 3. Vehicle Drop Shadow
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    drawRoundedRect(-w / 2 + 2, -h / 2 + 3, w - 4, h + 2, 7);
    ctx.fill();
    ctx.restore();

    // 4. Four Rubber Tires
    const tireW = 5;
    const tireH = 11;
    const steerAngle = this.controls.left ? -0.32 : (this.controls.right ? 0.32 : 0);

    function drawTire(tx, ty, rot = 0) {
      ctx.save();
      ctx.translate(tx, ty);
      if (rot !== 0) ctx.rotate(rot);
      ctx.fillStyle = "#0f172a";
      drawRoundedRect(-tireW / 2, -tireH / 2, tireW, tireH, 2.5);
      ctx.fill();
      // Rim line
      ctx.fillStyle = "#64748b";
      ctx.fillRect(-1, -tireH / 2 + 3, 2, tireH - 6);
      ctx.restore();
    }

    // Front Steered Tires
    drawTire(-w / 2 + 1, -h / 2 + 10, steerAngle);
    drawTire(w / 2 - 1, -h / 2 + 10, steerAngle);
    // Rear Fixed Tires
    drawTire(-w / 2 + 1, h / 2 - 10, 0);
    drawTire(w / 2 - 1, h / 2 - 10, 0);

    // 5. Headlight Projector Illumination Beams on Tarmac
    if (!this.damaged) {
      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 - 90);
      beamGrad.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      beamGrad.addColorStop(0.3, "rgba(56, 189, 248, 0.15)");
      beamGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -h / 2);
      ctx.lineTo(-w / 2 - 25, -h / 2 - 90);
      ctx.lineTo(w / 2 + 25, -h / 2 - 90);
      ctx.lineTo(w / 2 - 4, -h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 6. Aerodynamic Vehicle Body with Metallic Paint
    ctx.save();
    if (this.damaged) {
      ctx.fillStyle = "#475569";
    } else {
      const bodyGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      const safeColor = color || "#10b981";
      bodyGrad.addColorStop(0, safeColor);
      bodyGrad.addColorStop(0.45, lightenColor(safeColor, 22));
      bodyGrad.addColorStop(0.55, lightenColor(safeColor, 32));
      bodyGrad.addColorStop(1, darkenColor(safeColor, 18));
      ctx.fillStyle = bodyGrad;
    }
    drawRoundedRect(-w / 2, -h / 2, w, h, 6.5);
    ctx.fill();

    // Chassis edge contour
    ctx.strokeStyle = this.damaged ? "#ef4444" : "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 7. Side Aero Mirrors
    ctx.fillStyle = this.damaged ? "#334155" : (color || "#10b981");
    ctx.fillRect(-w / 2 - 3, -h / 2 + 13, 3, 5);
    ctx.fillRect(w / 2, -h / 2 + 13, 3, 5);

    // 8. Windshield & Panoramic Glass Cockpit
    ctx.save();
    const glassGrad = ctx.createLinearGradient(0, -h / 4, 0, h / 4);
    glassGrad.addColorStop(0, "rgba(15, 23, 42, 0.92)");
    glassGrad.addColorStop(0.5, "rgba(30, 41, 59, 0.8)");
    glassGrad.addColorStop(1, "rgba(15, 23, 42, 0.92)");
    ctx.fillStyle = glassGrad;
    drawRoundedRect(-w / 2 + 3.5, -h / 2 + 11, w - 7, h - 22, 4);
    ctx.fill();

    // Glass glare reflection
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h / 2 + 14);
    ctx.lineTo(w / 2 - 6, -h / 2 + 14);
    ctx.stroke();
    ctx.restore();

    // 9. Roof Panel & Autonomous LiDAR Sensor Puck
    if (this.useBrain && !this.damaged) {
      ctx.fillStyle = color || "#10b981";
      drawRoundedRect(-w / 2 + 6, -h / 2 + 18, w - 12, h - 36, 3);
      ctx.fill();

      // Rotating LiDAR Dome
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Active sensor core
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 10. Front LED Projectors
    if (!this.damaged) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-w / 2 + 2, -h / 2, 5, 2.5);
      ctx.fillRect(w / 2 - 7, -h / 2, 5, 2.5);
    }

    // 11. Rear Active LED Brake Lights
    const isBraking = this.controls.down || this.controls.reverse || (this.speed > 0 && this.speed < 0.2);
    ctx.save();
    if (isBraking && !this.damaged) {
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 8;
      ctx.fillRect(-w / 2 + 2, h / 2 - 2.5, 7, 3);
      ctx.fillRect(w / 2 - 9, h / 2 - 2.5, 7, 3);
    } else {
      ctx.fillStyle = this.damaged ? "#ef4444" : "#991b1b";
      ctx.fillRect(-w / 2 + 2, h / 2 - 2, 5, 2);
      ctx.fillRect(w / 2 - 7, h / 2 - 2, 5, 2);
    }
    ctx.restore();

    // 12. Perception Detection Bounding Box for Traffic Vehicles
    if (this.mode === ControlMode.DUMMY && !this.damaged) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      ctx.restore();
    }

    ctx.restore();
  }

  #move() {
    if (this.controls.up) this.speed += this.acceleration;
    if (this.controls.down) this.speed -= this.acceleration;

    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    // Disallow backward reverse driving for AI cars (highway safety invariant: cars do not reverse into traffic)
    const minSpeed = this.useBrain ? 0 : -this.maxSpeed / 2;
    if (this.speed < minSpeed) this.speed = minSpeed;

    if (this.speed > 0) this.speed -= this.friction;
    if (this.speed < 0) this.speed += this.friction;
    if (Math.abs(this.speed) < this.friction) this.speed = 0;

    if (this.speed !== 0) {
      const flip = this.speed > 0 ? 1 : -1;
      if (this.controls.left) this.angle += 0.035 * flip;
      if (this.controls.right) this.angle -= 0.035 * flip;

      // Natural caster self-aligning torque: vehicle straightens out when not actively steering
      if (!this.controls.left && !this.controls.right) {
        this.angle *= 0.93;
      }
      // Bound steering angle to highway limits (prevent spinning sideways/backwards)
      this.angle = clamp(this.angle, -0.5, 0.5);
    }

    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }
}
