class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  burst(x, y, count = 14, color = "#ffae42") {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTrails(ctx, cars) {
    const trailColor = readCssVar("--trail", "rgba(255,255,255,0.2)");
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = trailColor;
    for (const car of cars) {
      if (!car.trail || car.trail.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < car.trail.length; i++) {
        const p = car.trail[i];
        const alpha = i / car.trail.length;
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineWidth = 2 + alpha * 2;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }
      }
    }
    ctx.restore();
  }
}
