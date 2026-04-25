(() => {
  const carCanvas = document.getElementById("carCanvas");
  const networkCanvas = document.getElementById("networkCanvas");
  const chartCanvas = document.getElementById("chartCanvas");
  const carCtx = carCanvas.getContext("2d");
  const networkCtx = networkCanvas.getContext("2d");

  const road = new Road(0, 220, 3); // x=0 — we'll translate to canvas center on draw
  const simulation = new Simulation(road, {
    population: 100,
    mutationAmount: 0.18,
    rayCount: 5,
    rayLength: 180,
    maxSpeed: 5,
  });
  const chart = new FitnessChart(chartCanvas);

  const app = {
    simulation,
    chart,
    paused: false,
    speedMultiplier: 1,
    manualMode: false,
    manualCar: null,
    cameraY: 0,
    fps: 60,
    _frames: 0,
    _lastFpsTime: performance.now(),
    spawnManualCar(showToast = true) {
      const spawnY = simulation.bestCar?.y ?? simulation.startY;
      // Force-clear ALL traffic across ALL lanes within ±200px of spawn so the
      // car can never spawn into an obstacle.
      simulation.traffic = simulation.traffic.filter(
        (t) => Math.abs(t.y - spawnY) > 200
      );
      this.manualCar = new Car(
        road.getLaneCenter(1),
        spawnY,
        30,
        50,
        ControlMode.KEYS,
        5,
        {
          rayCount: simulation.options.rayCount,
          rayLength: simulation.options.rayLength,
        }
      );
      // 60-frame invulnerability so a near-miss spawn can't insta-kill us.
      this.manualCar._spawnGrace = 60;
      if (showToast) ui.toast("Manual mode 🎮 — arrows / WASD / D-pad");
    },
    toggleManualMode() {
      this.manualMode = !this.manualMode;
      if (this.manualMode) {
        this.spawnManualCar(true);
        document.body.classList.add("manual-mode");
      } else {
        this.manualCar = null;
        document.body.classList.remove("manual-mode");
        ui.toast("AI mode resumed 🤖");
      }
    },
  };

  const ui = new UI(app);

  // ---------- Canvas sizing (Retina-aware) ----------
  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const carCssWidth = carCanvas.clientWidth;
    const carCssHeight = carCanvas.clientHeight;
    carCanvas.width = carCssWidth * dpr;
    carCanvas.height = carCssHeight * dpr;
    carCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const netCssWidth = networkCanvas.clientWidth;
    const netCssHeight = networkCanvas.clientHeight;
    networkCanvas.width = netCssWidth * dpr;
    networkCanvas.height = netCssHeight * dpr;
    networkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    chart.resize(chartCanvas.clientWidth, chartCanvas.clientHeight, dpr);
  }

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(resizeCanvases);
    ro.observe(carCanvas);
    ro.observe(networkCanvas);
    ro.observe(chartCanvas);
  } else {
    window.addEventListener("resize", resizeCanvases);
  }
  // Run once after layout settles
  requestAnimationFrame(resizeCanvases);

  // ---------- Animation loop ----------
  function animate(time) {
    // FPS counter
    app._frames++;
    const now = performance.now();
    if (now - app._lastFpsTime >= 500) {
      app.fps = (app._frames * 1000) / (now - app._lastFpsTime);
      app._frames = 0;
      app._lastFpsTime = now;
    }

    if (!app.paused) {
      // Speed multiplier: run N physics ticks per render
      for (let s = 0; s < app.speedMultiplier; s++) {
        if (app.manualMode && app.manualCar) {
          const mc = app.manualCar;
          const wasDamaged = mc.damaged;
          mc.update(road.borders, simulation.traffic);
          // Spawn-grace invulnerability: undamaged for the first N frames
          if (mc._spawnGrace > 0) {
            mc.damaged = false;
            mc._spawnGrace--;
          }
          // Auto-respawn on crash so manual mode is forgiving
          if (!wasDamaged && mc.damaged) {
            simulation.particles.burst(mc.x, mc.y, 14, "#ff7676");
            setTimeout(() => {
              if (app.manualMode) app.spawnManualCar(false);
            }, 600);
          }
        } else {
          simulation.step();
        }
      }
    }

    // Auto-advance generation when all cars dead
    if (
      !app.paused &&
      !app.manualMode &&
      simulation.cars.length > 0 &&
      simulation.isBatchDone()
    ) {
      chart.push(simulation.bestCar.fitness, computeAvg(simulation.cars));
      simulation.nextGeneration();
      ui.toast(
        `Gen ${simulation.generation} → mut ${simulation.adaptiveMutation.toFixed(2)}`
      );
    }

    // ---------- Draw car canvas ----------
    const w = carCanvas.clientWidth;
    const h = carCanvas.clientHeight;
    const bgColor = readCssVar("--road", "#404040");
    carCtx.fillStyle = bgColor;
    carCtx.fillRect(0, 0, w, h);

    // Camera target — keep last manual y during the brief crash→respawn window
    // so the camera doesn't jump to the AI best car and back.
    let camY;
    if (app.manualMode) {
      if (app.manualCar) {
        app._lastManualY = app.manualCar.y;
        camY = app.manualCar.y;
      } else {
        camY = app._lastManualY ?? simulation.startY;
      }
    } else {
      camY = simulation.bestCar?.y ?? simulation.startY;
    }
    const cameraTarget = -camY + h * 0.7;
    app.cameraY = lerp(app.cameraY, cameraTarget, 0.12);

    carCtx.save();
    carCtx.translate(w / 2, app.cameraY);

    road.draw(carCtx);

    for (const t of simulation.traffic) {
      // Cull off-screen traffic for cheap perf win
      if (Math.abs(t.y - camY) > h + 200) continue;
      t.draw(carCtx, readCssVar("--car-traffic", "#d62828"));
    }

    // Trails behind AI cars (only the ones near the camera)
    const nearAlive = simulation.cars.filter(
      (c) => !c.damaged && Math.abs(c.y - camY) < h
    );
    simulation.particles.drawTrails(carCtx, nearAlive);

    // AI population (faded)
    if (!app.manualMode && simulation.bestCar) {
      carCtx.globalAlpha = 0.22;
      for (const c of simulation.cars) {
        if (c === simulation.bestCar) continue;
        if (Math.abs(c.y - simulation.bestCar.y) > h + 200) continue;
        c.draw(carCtx, readCssVar("--car-ai", "#3a86ff"));
      }
      carCtx.globalAlpha = 1;
      simulation.bestCar.draw(
        carCtx,
        readCssVar("--car-best", "#3a86ff"),
        true
      );
    } else if (app.manualCar) {
      app.manualCar.draw(carCtx, readCssVar("--car-best", "#3a86ff"), true);
    }

    simulation.particles.draw(carCtx);
    carCtx.restore();

    // ---------- Network visualizer ----------
    const netW = networkCanvas.clientWidth;
    const netH = networkCanvas.clientHeight;
    networkCtx.clearRect(0, 0, netW, netH);
    const visualizedBrain = app.manualMode
      ? app.manualCar?.brain
      : simulation.bestCar?.brain;
    if (visualizedBrain) {
      networkCtx.lineDashOffset = -((time || 0) / 50);
      Visualizer.drawNetwork(networkCtx, visualizedBrain);
    }

    // ---------- Chart ----------
    chart.draw();

    // ---------- HUD ----------
    ui.updateHUD(simulation.getStats(), app.fps);

    requestAnimationFrame(animate);
  }

  function computeAvg(cars) {
    if (cars.length === 0) return 0;
    let s = 0;
    for (const c of cars) s += c.fitness;
    return s / cars.length;
  }

  // Hook: every time bestFitness improves vs the previous gen we push to chart.
  // We only push at generation boundary (handled above), but also seed point 0
  // so the chart draws something earlier.
  chart.push(0, 0);

  requestAnimationFrame(animate);
})();
