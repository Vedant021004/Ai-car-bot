(() => {
  const carCanvas = document.getElementById("carCanvas");
  const networkCanvas = document.getElementById("networkCanvas");
  const chartCanvas = document.getElementById("chartCanvas");
  const carCtx = carCanvas.getContext("2d");
  const networkCtx = networkCanvas.getContext("2d");

  const road = new Road(0, 220, 3); // x=0 — translated to canvas center on draw
  const simulation = new Simulation(road, {
    population: 100,
    mutationAmount: 0.18,
    rayCount: 5,
    rayLength: 180,
    maxSpeed: 5,
    algorithmMode: "evosafe",
  });
  const chart = new AnalyticsCharts(chartCanvas);

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
      // Clear traffic in spawn vicinity to prevent insta-kill
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
      this.manualCar._spawnGrace = 60;
      if (showToast && ui) ui.toast("Manual Driving Mode 🎮 (WASD / Arrows / D-pad)");
    },

    toggleManualMode() {
      this.manualMode = !this.manualMode;
      if (this.manualMode) {
        this.spawnManualCar(true);
        document.body.classList.add("manual-mode");
      } else {
        this.manualCar = null;
        document.body.classList.remove("manual-mode");
        if (ui) ui.toast("AI Autonomous Mode Resumed 🤖");
      }
    },
  };

  const ui = new UI(app);

  // ---------- Canvas sizing (Hi-DPI Retina-aware) ----------
  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const carCssWidth = carCanvas.clientWidth;
    const carCssHeight = carCanvas.clientHeight;
    if (carCssWidth > 0 && carCssHeight > 0) {
      carCanvas.width = carCssWidth * dpr;
      carCanvas.height = carCssHeight * dpr;
      carCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const netCssWidth = networkCanvas.clientWidth;
    const netCssHeight = networkCanvas.clientHeight;
    if (netCssWidth > 0 && netCssHeight > 0) {
      networkCanvas.width = netCssWidth * dpr;
      networkCanvas.height = netCssHeight * dpr;
      networkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

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
  requestAnimationFrame(resizeCanvases);

  // ---------- Animation & Simulation Loop ----------
  function animate(time) {
    app._frames++;
    const now = performance.now();
    if (now - app._lastFpsTime >= 500) {
      app.fps = (app._frames * 1000) / (now - app._lastFpsTime);
      app._frames = 0;
      app._lastFpsTime = now;
    }

    if (!app.paused) {
      for (let s = 0; s < app.speedMultiplier; s++) {
        if (app.manualMode && app.manualCar) {
          const mc = app.manualCar;
          const wasDamaged = mc.damaged;
          mc.update(road.borders, simulation.traffic);
          if (mc._spawnGrace > 0) {
            mc.damaged = false;
            mc._spawnGrace--;
          }
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

    // Auto-advance generation when all cars crashed
    if (
      !app.paused &&
      !app.manualMode &&
      simulation.cars.length > 0 &&
      simulation.isBatchDone()
    ) {
      simulation.nextGeneration();
      const stats = simulation.getStats();
      chart.push({
        gen: simulation.generation,
        best: simulation.bestFitnessThisGen,
        avg: simulation.avgFitnessThisGen,
        diversity: stats.diversity,
        collisionRate: stats.collisionRate,
      });
      ui.toast(
        `Gen ${simulation.generation} | Best ${formatNumber(simulation.bestFitnessThisGen, 1)} | Div ${(stats.diversity || 0).toFixed(2)}`
      );
    }

    // ---------- Draw Road & Cars ----------
    const w = carCanvas.clientWidth;
    const h = carCanvas.clientHeight;
    const bgColor = readCssVar("--road", "#1c2128");
    carCtx.fillStyle = bgColor;
    carCtx.fillRect(0, 0, w, h);

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
      if (Math.abs(t.y - camY) > h + 200) continue;
      t.draw(carCtx, readCssVar("--car-traffic", "#f43f5e"));
    }

    // Trails behind surviving cars
    const nearAlive = simulation.cars.filter(
      (c) => !c.damaged && Math.abs(c.y - camY) < h
    );
    simulation.particles.drawTrails(carCtx, nearAlive);

    // AI population (respects ghostMode: 'none' for clean solo champion, 'top3', or 'all')
    if (!app.manualMode && simulation.bestCar) {
      const gMode = simulation.ghostMode || "none";
      if (gMode !== "none" && simulation.executionMode !== "evaluation") {
        const contenders = gMode === "top3"
          ? simulation.cars.filter((c) => !c.damaged && c !== simulation.bestCar).slice(0, 2)
          : simulation.cars.filter((c) => !c.damaged && c !== simulation.bestCar);

        carCtx.globalAlpha = 0.22;
        for (const c of contenders) {
          if (Math.abs(c.y - simulation.bestCar.y) > h + 200) continue;
          c.draw(carCtx, readCssVar("--car-ai", "#38bdf8"));
        }
      }
      carCtx.globalAlpha = 1;
      simulation.bestCar.draw(
        carCtx,
        readCssVar("--car-best", "#10b981"),
        true
      );
    } else if (app.manualCar) {
      app.manualCar.draw(carCtx, readCssVar("--car-best", "#10b981"), true);
    }

    simulation.particles.draw(carCtx);
    carCtx.restore();

    // ---------- Draw Neural Visualizer ----------
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

    // ---------- Draw Analytics Chart ----------
    chart.draw();

    // ---------- Update Dashboard HUD ----------
    ui.updateHUD(simulation.getStats(), app.fps);

    requestAnimationFrame(animate);
  }

  // Seed chart with initial zero-state
  chart.push({ gen: 0, best: 0, avg: 0, diversity: 0, collisionRate: 1 });
  requestAnimationFrame(animate);
})();
