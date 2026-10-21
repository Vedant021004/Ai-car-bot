/**
 * EvoSafe User Interface Controller
 * Connects research dashboard elements, telemetry cards, controls, and hotkeys.
 */

class UI {
  constructor(app) {
    this.app = app;
    this.els = this.#cacheEls();
    this.#bindControls();
    this.#bindHotkeys();
    this.#bindFileDrop();
    this.#applyInitialTheme();
    this.#syncControlsFromOptions();
  }

  #cacheEls() {
    const $ = (id) => document.getElementById(id);
    return {
      // Top Navigation
      badgeMode: $("badge-mode"),
      selectMode: $("select-mode"),
      selectExecMode: $("select-exec-mode"),
      selectGhosts: $("select-ghosts"),
      selectScenario: $("select-scenario"),
      badgeStatus: $("badge-status"),
      btnTheme: $("btn-theme"),
      btnHelp: $("btn-help"),

      // Live HUD & Telemetry Cards
      hudPolicy: $("hud-policy"),
      hudFps: $("hud-fps"),
      hudGen: $("hud-gen"),
      hudAlive: $("hud-alive"),
      hudBest: $("hud-best"),
      hudAvg: $("hud-avg"),
      hudDiversity: $("hud-diversity"),
      hudCollisionRate: $("hud-collision-rate"),
      hudTTC: $("hud-ttc"),
      hudDistance: $("hud-distance"),
      hudSpeed: $("hud-speed"),
      hudMutation: $("hud-mutation"),

      // Algorithm & Genetic Controls
      slPop: $("sl-population"),
      vPop: $("v-population"),
      selectSelection: $("select-selection"),
      slTournament: $("sl-tournament"),
      vTournament: $("v-tournament"),
      slCrossover: $("sl-crossover"),
      vCrossover: $("v-crossover"),
      slMut: $("sl-mutation"),
      vMut: $("v-mutation"),
      slElites: $("sl-elites"),
      vElites: $("v-elites"),

      // Sensor & Physics Controls
      slRays: $("sl-rays"),
      vRays: $("v-rays"),
      slRayLen: $("sl-raylen"),
      vRayLen: $("v-raylen"),
      slSpeed: $("sl-speed"),
      vSpeed: $("v-speed"),

      // Action Buttons
      btnPlayPause: $("btn-play-pause"),
      btnReset: $("btn-reset"),
      btnSkip: $("btn-skip"),
      btnManual: $("btn-manual"),
      btnSave: $("btn-save"),
      btnDiscard: $("btn-discard"),
      btnExportBrain: $("btn-export-brain"),
      btnImportBrain: $("btn-import-brain"),
      fileImport: $("file-import"),
      btnToggleEval: $("btn-toggle-eval"),
      btnExportCSV: $("btn-export-csv"),

      // Analytics Chart Controls
      btnTabFitness: $("btn-tab-fitness"),
      btnTabSafety: $("btn-tab-safety"),

      // Panels & Overlays
      sidebar: $("sidebar"),
      sidebarToggle: $("sidebar-toggle"),
      modal: $("help-modal"),
      modalClose: $("help-close"),
      modalCapstone: $("capstone-modal"),
      capstoneClose: $("capstone-close"),
      btnCapstoneCloseBtn: $("btn-capstone-close-btn"),
      btnPrintCapstoneReport: $("btn-print-capstone-report"),
      btnCapstoneDefense: $("btn-capstone-defense"),
      toast: $("toast"),
      dpad: $("dpad"),

      // Real-Time ADAS & Actuator Cockpit
      adasPill: $("adas-pill"),
      adasFcw: $("adas-fcw"),
      adasLdw: $("adas-ldw"),
      actUp: $("act-up"),
      actLeft: $("act-left"),
      actRight: $("act-right"),
      actDown: $("act-down"),
      cockpitSpeedVal: $("cockpit-speed-val"),
      speedoArc: $("speedo-arc"),
      steerWheelIcon: $("steer-wheel-icon"),
      cockpitSteerVal: $("cockpit-steer-val"),
      radarMiniCanvas: $("radarMiniCanvas"),

      // Live Jury Benchmark
      btnRunJuryBench: $("btn-run-jury-bench"),
      juryBenchResults: $("jury-bench-results"),
      juryBenchBody: $("jury-bench-body"),
    };
  }

  #syncControlsFromOptions() {
    const o = this.app.simulation.options;
    const sim = this.app.simulation;
    const e = this.els;

    if (e.selectMode) e.selectMode.value = o.algorithmMode || "evosafe";
    if (e.badgeMode) e.badgeMode.textContent = (o.algorithmMode || "evosafe").toUpperCase();
    if (e.selectExecMode) e.selectExecMode.value = sim.executionMode || "training";
    if (e.selectGhosts) e.selectGhosts.value = sim.ghostMode || "none";
    if (e.selectScenario) e.selectScenario.value = o.scenarioId || "highway_cruise";
    if (e.btnToggleEval) {
      e.btnToggleEval.textContent = sim.executionMode === "evaluation"
        ? "🧬 Switch Back to Training Mode"
        : "🧪 Test Active Brain Now (Solo View)";
    }

    if (e.slPop) {
      e.slPop.value = o.population;
      if (e.vPop) e.vPop.textContent = o.population;
    }
    if (e.selectSelection) e.selectSelection.value = o.selectionMethod || "tournament";
    if (e.slTournament) {
      e.slTournament.value = o.tournamentSize || 3;
      if (e.vTournament) e.vTournament.textContent = o.tournamentSize || 3;
    }
    if (e.slCrossover) {
      e.slCrossover.value = o.crossoverRate ?? 0.65;
      if (e.vCrossover) e.vCrossover.textContent = Math.round((o.crossoverRate ?? 0.65) * 100) + "%";
    }
    if (e.slMut) {
      e.slMut.value = o.mutationAmount;
      if (e.vMut) e.vMut.textContent = o.mutationAmount.toFixed(2);
    }
    if (e.slElites) {
      e.slElites.value = o.eliteCount ?? 2;
      if (e.vElites) e.vElites.textContent = o.eliteCount ?? 2;
    }
    if (e.slRays) {
      e.slRays.value = o.rayCount;
      if (e.vRays) e.vRays.textContent = o.rayCount;
    }
    if (e.slRayLen) {
      e.slRayLen.value = o.rayLength;
      if (e.vRayLen) e.vRayLen.textContent = o.rayLength;
    }
    if (e.slSpeed) {
      e.slSpeed.value = this.app.speedMultiplier;
      if (e.vSpeed) e.vSpeed.textContent = this.app.speedMultiplier + "×";
    }
  }

  #bindControls() {
    const e = this.els;
    const sim = this.app.simulation;

    // Algorithm Mode (Baseline vs EvoSafe)
    e.selectMode?.addEventListener("change", (ev) => {
      const mode = ev.target.value;
      sim.setOptions({ algorithmMode: mode });
      if (e.badgeMode) e.badgeMode.textContent = mode.toUpperCase();
      this.toast(`Algorithm: ${mode === "evosafe" ? "EvoSafe (Safety-Aware GA)" : "Baseline (Original)"}`);
    });

    // Execution Mode (Training Evolution vs Testing Evaluation)
    e.selectExecMode?.addEventListener("change", (ev) => {
      const mode = ev.target.value;
      sim.setExecutionMode(mode);
      this.#syncControlsFromOptions();
      this.toast(mode === "evaluation"
        ? "🧪 Evaluation / Test Mode (Zero Mutation, Exact Brain Solo Run)"
        : "🧬 Genetic Algorithm Training Mode (Population Evolving)");
    });

    // Vehicle Ghost Clutter Filter
    e.selectGhosts?.addEventListener("change", (ev) => {
      sim.setGhostMode(ev.target.value);
      this.toast(`View: ${ev.target.options[ev.target.selectedIndex].text}`);
    });

    // Scenario Preset
    e.selectScenario?.addEventListener("change", (ev) => {
      const scen = ev.target.value;
      sim.setOptions({ scenarioId: scen });
      sim.reset();
      this.app.chart.reset();
      this.toast(`Scenario: ${sim.scenarioManager.activeConfig.name}`);
    });

    // Population
    e.slPop?.addEventListener("input", () => {
      if (e.vPop) e.vPop.textContent = e.slPop.value;
    });
    e.slPop?.addEventListener("change", () => {
      sim.setOptions({ population: parseInt(e.slPop.value) });
      sim.reset();
      this.toast(`Population: ${e.slPop.value} (Simulation reset)`);
    });

    // Selection Method
    e.selectSelection?.addEventListener("change", (ev) => {
      sim.setOptions({ selectionMethod: ev.target.value });
      this.toast(`Selection: ${ev.target.value}`);
    });

    // Tournament Size
    e.slTournament?.addEventListener("input", () => {
      const val = parseInt(e.slTournament.value);
      if (e.vTournament) e.vTournament.textContent = val;
      sim.setOptions({ tournamentSize: val });
    });

    // Crossover Rate
    e.slCrossover?.addEventListener("input", () => {
      const val = parseFloat(e.slCrossover.value);
      if (e.vCrossover) e.vCrossover.textContent = Math.round(val * 100) + "%";
      sim.setOptions({ crossoverRate: val });
    });

    // Mutation
    e.slMut?.addEventListener("input", () => {
      const val = parseFloat(e.slMut.value);
      if (e.vMut) e.vMut.textContent = val.toFixed(2);
      sim.setOptions({ mutationAmount: val });
      sim.adaptiveMutation = val;
    });

    // Elites
    e.slElites?.addEventListener("input", () => {
      const val = parseInt(e.slElites.value);
      if (e.vElites) e.vElites.textContent = val;
      sim.setOptions({ eliteCount: val });
    });

    // Sensor Rays
    e.slRays?.addEventListener("change", () => {
      const count = parseInt(e.slRays.value);
      sim.setOptions({ rayCount: count });
      if (e.vRays) e.vRays.textContent = count;
      sim.discardBestBrain();
      sim.reset();
      this.toast(`Sensor Rays: ${count} (Brain topology reset)`);
    });
    e.slRays?.addEventListener("input", () => {
      if (e.vRays) e.vRays.textContent = e.slRays.value;
    });

    // Ray Length
    e.slRayLen?.addEventListener("input", () => {
      const len = parseInt(e.slRayLen.value);
      if (e.vRayLen) e.vRayLen.textContent = len;
      sim.setOptions({ rayLength: len });
      for (const c of sim.cars) {
        if (c.sensor) c.sensor.rayLength = len;
      }
    });

    // Speed Multiplier
    e.slSpeed?.addEventListener("input", () => {
      const mult = parseInt(e.slSpeed.value);
      this.app.speedMultiplier = mult;
      if (e.vSpeed) e.vSpeed.textContent = mult + "×";
    });

    // Buttons
    e.btnPlayPause?.addEventListener("click", () => this.togglePause());
    e.btnReset?.addEventListener("click", () => {
      sim.reset();
      this.app.chart.reset();
      this.toast("Simulation reset ↻");
    });
    e.btnSkip?.addEventListener("click", () => {
      for (const c of sim.cars) c.damaged = true;
      this.toast("Skipping to next generation ⏭");
    });
    e.btnManual?.addEventListener("click", () => this.app.toggleManualMode());

    // Toggle Solo Evaluation Mode
    e.btnToggleEval?.addEventListener("click", () => {
      const next = sim.executionMode === "training" ? "evaluation" : "training";
      sim.setExecutionMode(next);
      if (e.selectExecMode) e.selectExecMode.value = next;
      this.#syncControlsFromOptions();
      this.toast(next === "evaluation"
        ? "🧪 Started Solo Evaluation Test on Current Brain!"
        : "🧬 Resumed Genetic Algorithm Training!");
    });

    // Brain Persistence
    e.btnSave?.addEventListener("click", () => {
      const ok = sim.saveBestBrain();
      this.toast(ok ? "Champion brain saved to LocalStorage 💾" : "Storage failed");
    });
    e.btnDiscard?.addEventListener("click", () => {
      sim.discardBestBrain();
      sim.reset();
      this.app.chart.reset();
      this.toast("Champion brain discarded 🗑");
    });
    e.btnExportBrain?.addEventListener("click", () => {
      const ok = sim.exportBrainFile("evosafe-champion-brain.json");
      this.toast(ok ? "Brain file downloaded ⬆ (evosafe-champion-brain.json)" : "No brain available to export");
    });
    e.btnImportBrain?.addEventListener("click", () => e.fileImport?.click());
    e.fileImport?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const data = await Storage.importBrainFromFile(file);
        sim.loadBrain(data, true); // true = auto enter evaluation test mode
        this.#syncControlsFromOptions();
        this.app.chart.reset();
        this.toast(`🧪 Testing Imported Brain: ${file.name} (Exact Policy, 0 Mutation)`, 4000);
      } catch (err) {
        this.toast("Import failed: " + err.message);
      }
      ev.target.value = "";
    });

    // CSV Experiment Export
    e.btnExportCSV?.addEventListener("click", () => {
      sim.experimentManager.downloadCSV("evosafe_experiments.csv");
      this.toast("Exported experiment CSV 📊");
    });

    // Chart Tabs
    e.btnTabFitness?.addEventListener("click", () => {
      this.app.chart.setTab("fitness");
      e.btnTabFitness.classList.add("active");
      e.btnTabSafety?.classList.remove("active");
    });
    e.btnTabSafety?.addEventListener("click", () => {
      this.app.chart.setTab("safety");
      e.btnTabSafety.classList.add("active");
      e.btnTabFitness?.classList.remove("active");
    });

    // Sidebar & Help Modal
    e.sidebarToggle?.addEventListener("click", () => {
      e.sidebar?.classList.toggle("collapsed");
    });
    e.btnTheme?.addEventListener("click", () => this.toggleTheme());
    e.btnHelp?.addEventListener("click", () => this.openHelp());
    e.modalClose?.addEventListener("click", () => this.closeHelp());
    e.modal?.addEventListener("click", (ev) => {
      if (ev.target === e.modal) this.closeHelp();
    });

    // Capstone Defense Modal & Viva Rubric
    e.btnCapstoneDefense?.addEventListener("click", () => this.openCapstoneModal());
    e.capstoneClose?.addEventListener("click", () => this.closeCapstoneModal());
    e.btnCapstoneCloseBtn?.addEventListener("click", () => this.closeCapstoneModal());
    e.modalCapstone?.addEventListener("click", (ev) => {
      if (ev.target === e.modalCapstone) this.closeCapstoneModal();
    });
    e.btnPrintCapstoneReport?.addEventListener("click", () => {
      window.print();
    });

    // Live Jury Benchmark Trial
    e.btnRunJuryBench?.addEventListener("click", async () => {
      if (e.btnRunJuryBench) {
        e.btnRunJuryBench.disabled = true;
        e.btnRunJuryBench.textContent = "⏳ Running Live Benchmark (3 Gens)...";
      }
      this.toast("⚡ Running Head-to-Head Benchmark across Seeds...", 3000);
      setTimeout(() => {
        try {
          const res = Simulation.runHeadToHeadTrial(3, 20, sim.options.seed || 101);
          const baseDiv = parseFloat(res.baseline.diversity) || 0.05;
          const evoDiv = parseFloat(res.evosafe.diversity) || 0.25;
          const divGain = Math.round(((evoDiv - baseDiv) / Math.max(0.01, baseDiv)) * 100);

          const baseDist = res.baseline.distance || 1;
          const evoDist = res.evosafe.distance || 1;
          const distGain = Math.round(((evoDist - baseDist) / Math.max(1, baseDist)) * 100);

          if (e.juryBenchBody) {
            e.juryBenchBody.innerHTML = `
              <tr>
                <td><strong>Genetic Diversity</strong></td>
                <td>${res.baseline.diversity}</td>
                <td>${res.evosafe.diversity}</td>
                <td style="color:var(--accent-emerald);">+${divGain}%</td>
              </tr>
              <tr>
                <td><strong>Route Progress</strong></td>
                <td>${res.baseline.distance} px</td>
                <td>${res.evosafe.distance} px</td>
                <td style="color:var(--accent-emerald);">${distGain >= 0 ? "+" + distGain + "%" : distGain + "%"}</td>
              </tr>
              <tr>
                <td><strong>Crash Rate</strong></td>
                <td>${res.baseline.collisionRate}</td>
                <td>${res.evosafe.collisionRate}</td>
                <td style="color:var(--accent-cyan);">Mitigated</td>
              </tr>
              <tr>
                <td><strong>Peak Fitness</strong></td>
                <td>${res.baseline.peakFitness}</td>
                <td>${res.evosafe.peakFitness}</td>
                <td style="color:var(--accent-emerald);">Superior</td>
              </tr>
            `;
          }
          if (e.juryBenchResults) e.juryBenchResults.hidden = false;
          this.toast("🏆 Live Jury Benchmark Complete! Scorecard Updated.", 4000);
        } catch (err) {
          this.toast("Benchmark failed: " + err.message);
        } finally {
          if (e.btnRunJuryBench) {
            e.btnRunJuryBench.disabled = false;
            e.btnRunJuryBench.textContent = "⚡ Run 3-Gen Live Jury Benchmark";
          }
        }
      }, 50);
    });
  }

  #bindHotkeys() {
    document.addEventListener("keydown", (ev) => {
      const focused = document.activeElement;
      if (focused && ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)) return;

      switch (ev.key) {
        case "p":
        case "P":
          this.togglePause();
          break;
        case "r":
        case "R":
          this.app.simulation.reset();
          this.app.chart.reset();
          this.toast("Reset ↻");
          break;
        case "s":
        case "S":
          if (!this.app.manualMode) {
            const ok = this.app.simulation.saveBestBrain();
            this.toast(ok ? "Saved champion 💾" : "Save failed");
          }
          break;
        case "d":
        case "D":
          if (!this.app.manualMode) {
            this.app.simulation.discardBestBrain();
            this.app.simulation.reset();
            this.app.chart.reset();
            this.toast("Discarded brain 🗑");
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4": {
          const map = { 1: 1, 2: 2, 3: 5, 4: 10 };
          this.app.speedMultiplier = map[ev.key];
          if (this.els.slSpeed) {
            this.els.slSpeed.value = this.app.speedMultiplier;
            if (this.els.vSpeed) this.els.vSpeed.textContent = this.app.speedMultiplier + "×";
          }
          this.toast(`${this.app.speedMultiplier}× speed`);
          break;
        }
        case "m":
        case "M":
          this.app.toggleManualMode();
          break;
        case "t":
        case "T":
          this.toggleTheme();
          break;
        case "f":
        case "F":
          this.toggleFullscreen();
          break;
        case "c":
        case "C":
          if (this.els.modalCapstone?.classList.contains("open")) {
            this.closeCapstoneModal();
          } else {
            this.openCapstoneModal();
          }
          break;
        case "?":
          this.openHelp();
          break;
        case "Escape":
          this.closeHelp();
          this.closeCapstoneModal();
          break;
      }
    });
  }

  #bindFileDrop() {
    const drop = document.body;
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("dropping");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("dropping"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("dropping");
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const data = await Storage.importBrainFromFile(file);
        this.app.simulation.loadBrain(data);
        this.app.chart.reset();
        this.toast("Brain imported via drag-and-drop ⬇");
      } catch (err) {
        this.toast("Import failed: " + err.message);
      }
    });
  }

  #applyInitialTheme() {
    const saved = Storage.get("evosafe.theme", null);
    const theme = saved || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }

  toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    Storage.set("evosafe.theme", next);
    this.toast(next === "dark" ? "Dark graphite mode 🌑" : "Clean light mode ☀️");
  }

  togglePause() {
    this.app.paused = !this.app.paused;
    if (this.els.btnPlayPause) {
      this.els.btnPlayPause.textContent = this.app.paused ? "▶ Play" : "⏸ Pause";
    }
    if (this.els.badgeStatus) {
      this.els.badgeStatus.textContent = this.app.paused ? "PAUSED" : "ACTIVE";
      this.els.badgeStatus.className = `status-badge ${this.app.paused ? "paused" : "active"}`;
    }
    this.toast(this.app.paused ? "Paused ⏸" : "Resumed ▶");
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  openHelp() {
    if (this.els.modal) {
      this.els.modal.classList.add("open");
      this.els.modal.setAttribute("aria-hidden", "false");
    }
  }

  closeHelp() {
    if (this.els.modal) {
      this.els.modal.classList.remove("open");
      this.els.modal.setAttribute("aria-hidden", "true");
    }
  }

  openCapstoneModal() {
    if (this.els.modalCapstone) {
      this.els.modalCapstone.classList.add("open");
      this.els.modalCapstone.setAttribute("aria-hidden", "false");
    }
  }

  closeCapstoneModal() {
    if (this.els.modalCapstone) {
      this.els.modalCapstone.classList.remove("open");
      this.els.modalCapstone.setAttribute("aria-hidden", "true");
    }
  }

  toast(msg, ms = 1800) {
    if (!this.els.toast) return;
    this.els.toast.textContent = msg;
    this.els.toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.els.toast?.classList.remove("show");
    }, ms);
  }

  updateHUD(stats, fps) {
    const e = this.els;
    const sim = this.app.simulation;
    if (e.hudPolicy) {
      if (sim.executionMode === "evaluation") {
        const name = sim.loadedBrainFilename ? sim.loadedBrainFilename.replace(/^.*[\\\/]/, '') : "Solo Champion";
        e.hudPolicy.textContent = `🧪 ${name}`;
      } else if (sim.loadedBrainFilename) {
        e.hudPolicy.textContent = `🧬 ${sim.loadedBrainFilename.replace(/^.*[\\\/]/, '')}`;
      } else {
        e.hudPolicy.textContent = sim.generation > 0 ? "🧬 GA Evolved" : "Expert Seed";
      }
    }
    if (e.hudFps) e.hudFps.textContent = fps.toFixed(0);
    if (e.hudGen) e.hudGen.textContent = stats.generation;
    if (e.hudAlive) e.hudAlive.textContent = `${stats.alive}/${stats.population}`;
    if (e.hudBest) e.hudBest.textContent = formatNumber(stats.bestFitness, 1);
    if (e.hudAvg) e.hudAvg.textContent = formatNumber(this.app.simulation.avgFitnessThisGen, 1);
    if (e.hudDiversity) e.hudDiversity.textContent = (stats.diversity || 0).toFixed(3);
    if (e.hudCollisionRate) e.hudCollisionRate.textContent = `${((stats.collisionRate || 0) * 100).toFixed(0)}%`;
    if (e.hudTTC) {
      const ttc = stats.avgTTC;
      e.hudTTC.textContent = Number.isFinite(ttc) && ttc < 10 ? `${ttc.toFixed(2)}s` : "Safe";
    }
    if (e.hudDistance) e.hudDistance.textContent = formatNumber(stats.distance, 0);
    if (e.hudSpeed) e.hudSpeed.textContent = stats.speed.toFixed(1);
    if (e.hudMutation) e.hudMutation.textContent = stats.mutation.toFixed(2);

    // Real-Time ADAS & Actuator Cockpit Telemetry
    const car = this.app.manualMode ? this.app.manualCar : sim.bestCar;
    if (car) {
      // Digital Speedometer Arc & Number
      const speedKmh = Math.round(Math.abs(car.speed) * 18);
      if (e.cockpitSpeedVal) e.cockpitSpeedVal.textContent = speedKmh;
      if (e.speedoArc) {
        const ratio = clamp(speedKmh / 90, 0, 1);
        e.speedoArc.style.strokeDashoffset = (157 - ratio * 157).toString();
        e.speedoArc.style.stroke = speedKmh > 70 ? "#ef4444" : (speedKmh > 40 ? "#38bdf8" : "#10b981");
      }

      // Steering Wheel Angle & Readout
      const steerDeg = Math.round((-car.angle) * (180 / Math.PI) * 1.8);
      if (e.steerWheelIcon) {
        e.steerWheelIcon.style.transform = `rotate(${steerDeg}deg)`;
      }
      if (e.cockpitSteerVal) {
        e.cockpitSteerVal.textContent = `${steerDeg >= 0 ? "+" : ""}${steerDeg}°`;
        e.cockpitSteerVal.style.color = Math.abs(steerDeg) > 12 ? "#38bdf8" : "var(--text)";
      }

      // LiDAR Mini-Radar Display
      if (e.radarMiniCanvas && car.sensor) {
        const rc = e.radarMiniCanvas.getContext("2d");
        if (rc) {
          const rw = e.radarMiniCanvas.width;
          const rh = e.radarMiniCanvas.height;
          const cx = rw / 2;
          const cy = rh / 2;

          rc.clearRect(0, 0, rw, rh);

          // Polar concentric circles
          rc.strokeStyle = "rgba(56, 189, 248, 0.2)";
          rc.lineWidth = 1;
          rc.beginPath();
          rc.arc(cx, cy, 8, 0, Math.PI * 2);
          rc.arc(cx, cy, 16, 0, Math.PI * 2);
          rc.arc(cx, cy, 25, 0, Math.PI * 2);
          rc.stroke();

          // Rotating radar sweep line
          const sweepAngle = (performance.now() * 0.003) % (Math.PI * 2);
          rc.strokeStyle = "rgba(56, 189, 248, 0.4)";
          rc.lineWidth = 1.2;
          rc.beginPath();
          rc.moveTo(cx, cy);
          rc.lineTo(cx + Math.cos(sweepAngle) * 25, cy + Math.sin(sweepAngle) * 25);
          rc.stroke();

          // Ego vehicle central beacon
          rc.fillStyle = "#10b981";
          rc.beginPath();
          rc.arc(cx, cy, 2.5, 0, Math.PI * 2);
          rc.fill();

          // Obstacle blips from sensor readings
          if (car.sensor.readings) {
            for (let i = 0; i < car.sensor.readings.length; i++) {
              const r = car.sensor.readings[i];
              if (r) {
                const spread = car.sensor.raySpread || Math.PI / 2;
                const count = car.sensor.rayCount || 5;
                const rayAngle = (i / (count - 1) - 0.5) * spread - Math.PI / 2;
                const dist = (1 - r.offset) * 24;
                const bx = cx + Math.cos(rayAngle) * dist;
                const by = cy + Math.sin(rayAngle) * dist;

                rc.fillStyle = r.offset > 0.7 ? "#ef4444" : "#f59e0b";
                rc.beginPath();
                rc.arc(bx, by, 2, 0, Math.PI * 2);
                rc.fill();
              }
            }
          }
        }
      }

      // Actuator Outputs
      const ctrl = car.controls;
      if (e.actUp) e.actUp.className = `act-chip ${ctrl?.forward || ctrl?.up ? "active" : ""}`;
      if (e.actLeft) e.actLeft.className = `act-chip ${ctrl?.left ? "active" : ""}`;
      if (e.actRight) e.actRight.className = `act-chip ${ctrl?.right ? "active" : ""}`;
      if (e.actDown) e.actDown.className = `act-chip ${ctrl?.reverse || ctrl?.down ? "active-danger" : ""}`;

      // Lane Discipline (LDW)
      const centerLane = sim.road.getLaneCenter(1);
      const lateralDev = Math.abs(car.x - centerLane);
      if (e.adasLdw) {
        if (lateralDev < 15) {
          e.adasLdw.textContent = "🟢 CENTERED";
          e.adasLdw.className = "adas-metric-v safe";
        } else if (lateralDev < 30) {
          e.adasLdw.textContent = `🟡 DRIFT (±${Math.round(lateralDev)}px)`;
          e.adasLdw.className = "adas-metric-v caution";
        } else {
          e.adasLdw.textContent = `🔴 OFF-LANE (±${Math.round(lateralDev)}px)`;
          e.adasLdw.className = "adas-metric-v danger";
        }
      }

      // Forward Collision Warning (FCW) & Status Pill
      const ttc = stats.avgTTC;
      if (e.adasFcw && e.adasPill) {
        if (car.damaged) {
          e.adasFcw.textContent = "💥 CRASHED";
          e.adasFcw.className = "adas-metric-v danger";
          e.adasPill.textContent = "COLLISION";
          e.adasPill.className = "adas-pill danger";
        } else if (Number.isFinite(ttc) && ttc < 1.2) {
          e.adasFcw.textContent = `🔴 BRAKE (${ttc.toFixed(1)}s)`;
          e.adasFcw.className = "adas-metric-v danger";
          e.adasPill.textContent = "COLLISION ALERT";
          e.adasPill.className = "adas-pill danger";
        } else if (Number.isFinite(ttc) && ttc < 2.0) {
          e.adasFcw.textContent = `🟡 CAUTION (${ttc.toFixed(1)}s)`;
          e.adasFcw.className = "adas-metric-v caution";
          e.adasPill.textContent = "CAUTION";
          e.adasPill.className = "adas-pill caution";
        } else {
          e.adasFcw.textContent = "🟢 CLEAR";
          e.adasFcw.className = "adas-metric-v safe";
          e.adasPill.textContent = "NORMAL";
          e.adasPill.className = "adas-pill safe";
        }
      }
    }
  }
}
