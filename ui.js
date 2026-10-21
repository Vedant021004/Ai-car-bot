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
      selectScenario: $("select-scenario"),
      badgeStatus: $("badge-status"),
      btnTheme: $("btn-theme"),
      btnHelp: $("btn-help"),

      // Live HUD & Telemetry Cards
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
      btnExportCSV: $("btn-export-csv"),

      // Analytics Chart Controls
      btnTabFitness: $("btn-tab-fitness"),
      btnTabSafety: $("btn-tab-safety"),

      // Panels & Overlays
      sidebar: $("sidebar"),
      sidebarToggle: $("sidebar-toggle"),
      modal: $("help-modal"),
      modalClose: $("help-close"),
      toast: $("toast"),
      dpad: $("dpad"),
    };
  }

  #syncControlsFromOptions() {
    const o = this.app.simulation.options;
    const e = this.els;

    if (e.selectMode) e.selectMode.value = o.algorithmMode || "evosafe";
    if (e.badgeMode) e.badgeMode.textContent = (o.algorithmMode || "evosafe").toUpperCase();
    if (e.selectScenario) e.selectScenario.value = o.scenarioId || "highway_cruise";

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

    // Algorithm Mode
    e.selectMode?.addEventListener("change", (ev) => {
      const mode = ev.target.value;
      sim.setOptions({ algorithmMode: mode });
      if (e.badgeMode) e.badgeMode.textContent = mode.toUpperCase();
      this.toast(`Mode switched to: ${mode === "evosafe" ? "EvoSafe (Safety-Aware GA)" : "Baseline (Original)"}`);
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

    // Brain Persistence
    e.btnSave?.addEventListener("click", () => {
      const ok = sim.saveBestBrain();
      this.toast(ok ? "Champion brain saved 💾" : "Storage failed");
    });
    e.btnDiscard?.addEventListener("click", () => {
      sim.discardBestBrain();
      sim.reset();
      this.app.chart.reset();
      this.toast("Champion brain discarded 🗑");
    });
    e.btnExportBrain?.addEventListener("click", () => {
      if (!sim.bestCar?.brain) {
        this.toast("No brain to export");
        return;
      }
      Storage.exportBrain(sim.bestCar.brain, `evosafe-brain-gen${sim.generation}.json`);
      this.toast("Exported brain JSON ⬆");
    });
    e.btnImportBrain?.addEventListener("click", () => e.fileImport?.click());
    e.fileImport?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const data = await Storage.importBrainFromFile(file);
        sim.loadBrain(data);
        this.app.chart.reset();
        this.toast("Brain imported successfully ⬇");
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

    // Sidebar & Modal
    e.sidebarToggle?.addEventListener("click", () => {
      e.sidebar?.classList.toggle("collapsed");
    });
    e.btnTheme?.addEventListener("click", () => this.toggleTheme());
    e.btnHelp?.addEventListener("click", () => this.openHelp());
    e.modalClose?.addEventListener("click", () => this.closeHelp());
    e.modal?.addEventListener("click", (ev) => {
      if (ev.target === e.modal) this.closeHelp();
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
        case "?":
          this.openHelp();
          break;
        case "Escape":
          this.closeHelp();
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
  }
}
