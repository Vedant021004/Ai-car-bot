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
    const laneColor = readCssVar("--lane", "#ffffff");
    const borderColor = readCssVar("--border", "#ffffff");

    ctx.lineWidth = 4;
    ctx.strokeStyle = laneColor;

    for (let i = 1; i <= this.laneCount - 1; i++) {
      const x = lerp(this.left, this.right, i / this.laneCount);
      ctx.setLineDash([24, 24]);
      ctx.beginPath();
      ctx.moveTo(x, this.top);
      ctx.lineTo(x, this.bottom);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 5;
    this.borders.forEach((border) => {
      ctx.beginPath();
      ctx.moveTo(border[0].x, border[0].y);
      ctx.lineTo(border[1].x, border[1].y);
      ctx.stroke();
    });
  }
}
