class Visualizer {
  static drawNetwork(ctx, network) {
    if (!network || !network.levels || network.levels.length === 0) return;

    // Use CSS-pixel dimensions because main.js applies a DPR transform on the
    // context — `canvas.width / canvas.height` are the buffer (DPR-multiplied)
    // size and would draw outside the visible region on Hi-DPI displays.
    const margin = 30;
    const cssW = ctx.canvas.clientWidth || ctx.canvas.width;
    const cssH = ctx.canvas.clientHeight || ctx.canvas.height;
    const left = margin;
    const top = margin;
    const width = cssW - margin * 2;
    const height = cssH - margin * 2;
    if (width <= 0 || height <= 0) return;

    const levelHeight = height / network.levels.length;

    for (let i = network.levels.length - 1; i >= 0; i--) {
      const levelTop =
        top +
        lerp(
          height - levelHeight,
          0,
          network.levels.length === 1 ? 0.5 : i / (network.levels.length - 1)
        );

      ctx.setLineDash([7, 3]);
      Visualizer.drawLevel(
        ctx,
        network.levels[i],
        left,
        levelTop,
        width,
        levelHeight,
        i === network.levels.length - 1 ? ["🠉", "🠈", "🠊", "🠋"] : []
      );
    }
  }

  static drawLevel(ctx, level, left, top, width, height, outputLabels) {
    const right = left + width;
    const bottom = top + height;
    const { inputs, outputs, weights, biases } = level;

    // Connections
    for (let i = 0; i < inputs.length; i++) {
      for (let j = 0; j < outputs.length; j++) {
        ctx.beginPath();
        ctx.moveTo(Visualizer.#getNodeX(inputs, i, left, right), bottom);
        ctx.lineTo(Visualizer.#getNodeX(outputs, j, left, right), top);
        ctx.lineWidth = 1 + 3 * Math.abs(weights[i][j]);
        ctx.strokeStyle = getRGBA(weights[i][j]);
        ctx.stroke();
      }
    }

    const baseRadius = 18;
    const nodeBg = readCssVar("--node-bg", "#000000");

    // Input nodes — pulse with activation
    for (let i = 0; i < inputs.length; i++) {
      const x = Visualizer.#getNodeX(inputs, i, left, right);
      const r = baseRadius * (0.85 + 0.25 * Math.abs(inputs[i] || 0));
      ctx.beginPath();
      ctx.arc(x, bottom, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeBg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, bottom, r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = getRGBA(inputs[i] || 0);
      ctx.fill();
    }

    // Output nodes
    for (let i = 0; i < outputs.length; i++) {
      const x = Visualizer.#getNodeX(outputs, i, left, right);
      const r = baseRadius * (0.85 + 0.25 * Math.abs(outputs[i] || 0));
      ctx.beginPath();
      ctx.arc(x, top, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeBg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, top, r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = getRGBA(outputs[i] || 0);
      ctx.fill();

      // Bias ring
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.arc(x, top, r * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = getRGBA(biases[i]);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (outputLabels[i]) {
        ctx.beginPath();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = readCssVar("--node-label", "#ffffff");
        ctx.strokeStyle = nodeBg;
        ctx.font = baseRadius * 1.3 + "px Arial";
        ctx.fillText(outputLabels[i], x, top + baseRadius * 0.1);
        ctx.lineWidth = 0.5;
        ctx.strokeText(outputLabels[i], x, top + baseRadius * 0.1);
      }
    }
  }

  static #getNodeX(nodes, index, left, right) {
    return lerp(
      left,
      right,
      nodes.length === 1 ? 0.5 : index / (nodes.length - 1)
    );
  }
}
