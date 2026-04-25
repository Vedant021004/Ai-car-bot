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
      hudFps: $("hud-fps"),
      hudGen: $("hud-gen"),
      hudAlive: $("hud-alive"),
      hudBest: $("hud-best"),
      hudAllTime: $("hud-alltime"),
      hudDistance: $("hud-distance"),
      hudSpeed: $("hud-speed"),
      hudMutation: $("hud-mutation"),
      slPop: $("sl-population"),
      slMut: $("sl-mutation"),
      slRays: $("sl-rays"),
      slRayLen: $("sl-raylen"),
      slSpeed: $("sl-speed"),
      vPop: $("v-population"),
      vMut: $("v-mutation"),
      vRays: $("v-rays"),
      vRayLen: $("v-raylen"),
      vSpeed: $("v-speed"),
      btnSave: $("btn-save"),
      btnDiscard: $("btn-discard"),
      btnPause: $("btn-pause"),
      btnReset: $("btn-reset"),
      btnSkip: $("btn-skip"),
      btnExport: $("btn-export"),
      btnImport: $("btn-import"),
      fileImport: $("file-import"),
      btnTheme: $("btn-theme"),
      btnManual: $("btn-manual"),
      btnHelp: $("btn-help"),
      modal: $("help-modal"),
      modalClose: $("help-close"),
      toast: $("toast"),
      sidebar: $("sidebar"),
      sidebarToggle: $("sidebar-toggle"),
      dpad: $("dpad"),
    };
  }

  #syncControlsFromOptions() {
    const o = this.app.simulation.options;
    if (this.els.slPop) {
      this.els.slPop.value = o.population;
      this.els.vPop.textContent = o.population;
    }
    if (this.els.slMut) {
      this.els.slMut.value = o.mutationAmount;
      this.els.vMut.textContent = o.mutationAmount.toFixed(2);
    }
    if (this.els.slRays) {
      this.els.slRays.value = o.rayCount;
      this.els.vRays.textContent = o.rayCount;
    }
    if (this.els.slRayLen) {
      this.els.slRayLen.value = o.rayLength;
      this.els.vRayLen.textContent = o.rayLength;
    }
    if (this.els.slSpeed) {
      this.els.slSpeed.value = this.app.speedMultiplier;
      this.els.vSpeed.textContent = this.app.speedMultiplier + "×";
    }
  }

  #bindControls() {
    const e = this.els;
    e.slPop?.addEventListener("input", () => {
      e.vPop.textContent = e.slPop.value;
    });
    e.slPop?.addEventListener("change", () => {
      this.app.simulation.setOptions({ population: parseInt(e.slPop.value) });
      this.app.simulation.reset();
      this.toast("Population set to " + e.slPop.value + " (reset)");
    });
    e.slMut?.addEventListener("input", () => {
      const v = parseFloat(e.slMut.value);
      e.vMut.textContent = v.toFixed(2);
      this.app.simulation.setOptions({ mutationAmount: v });
      this.app.simulation.adaptiveMutation = v;
    });
    e.slRays?.addEventListener("change", () => {
      this.app.simulation.setOptions({ rayCount: parseInt(e.slRays.value) });
      e.vRays.textContent = e.slRays.value;
      this.app.simulation.discardBestBrain(); // architecture changed, brain incompatible
      this.app.simulation.reset();
      this.toast("Ray count → " + e.slRays.value + " (brain reset)");
    });
    e.slRays?.addEventListener("input", () => {
      e.vRays.textContent = e.slRays.value;
    });
    e.slRayLen?.addEventListener("input", () => {
      const v = parseInt(e.slRayLen.value);
      e.vRayLen.textContent = v;
      this.app.simulation.setOptions({ rayLength: v });
      // apply live to existing sensors
      for (const c of this.app.simulation.cars) {
        if (c.sensor) c.sensor.rayLength = v;
      }
    });
    e.slSpeed?.addEventListener("input", () => {
      const v = parseInt(e.slSpeed.value);
      this.app.speedMultiplier = v;
      e.vSpeed.textContent = v + "×";
    });

    e.btnSave?.addEventListener("click", () => {
      const ok = this.app.simulation.saveBestBrain();
      this.toast(ok ? "Brain saved 💾" : "Save failed (storage off)");
    });
    e.btnDiscard?.addEventListener("click", () => {
      this.app.simulation.discardBestBrain();
      this.app.simulation.reset();
      this.app.chart.reset();
      this.toast("Brain discarded 🗑");
    });
    e.btnPause?.addEventListener("click", () => this.togglePause());
    e.btnReset?.addEventListener("click", () => {
      this.app.simulation.reset();
      this.app.chart.reset();
      this.toast("Simulation reset ↻");
    });
    e.btnSkip?.addEventListener("click", () => {
      // damage all cars to force generation advance
      for (const c of this.app.simulation.cars) c.damaged = true;
      this.toast("Skipping generation ⏭");
    });
    e.btnExport?.addEventListener("click", () => {
      const sim = this.app.simulation;
      if (!sim.bestCar?.brain) {
        this.toast("No brain to export");
        return;
      }
      Storage.exportBrain(
        sim.bestCar.brain,
        `brain-gen${sim.generation}.json`
      );
      this.toast("Exported brain JSON ⬆");
    });
    e.btnImport?.addEventListener("click", () => e.fileImport?.click());
    e.fileImport?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const data = await Storage.importBrainFromFile(file);
        this.app.simulation.loadBrain(data);
        this.app.chart.reset();
        this.toast("Brain imported ⬇");
      } catch (err) {
        this.toast("Import failed: " + err.message);
      }
      ev.target.value = "";
    });
    e.btnTheme?.addEventListener("click", () => this.toggleTheme());
    e.btnManual?.addEventListener("click", () => this.app.toggleManualMode());
    e.btnHelp?.addEventListener("click", () => this.openHelp());
    e.modalClose?.addEventListener("click", () => this.closeHelp());
    e.modal?.addEventListener("click", (ev) => {
      if (ev.target === e.modal) this.closeHelp();
    });
    e.sidebarToggle?.addEventListener("click", () => {
      e.sidebar?.classList.toggle("collapsed");
    });
  }

  #bindHotkeys() {
    document.addEventListener("keydown", (ev) => {
      const focused = document.activeElement;
      if (
        focused &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)
      ) {
        return;
      }
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
          // S key conflict with manual driving — only save when AI mode
          if (!this.app.manualMode) {
            const ok = this.app.simulation.saveBestBrain();
            this.toast(ok ? "Saved 💾" : "Save failed");
          }
          break;
        case "d":
        case "D":
          if (!this.app.manualMode) {
            this.app.simulation.discardBestBrain();
            this.app.simulation.reset();
            this.app.chart.reset();
            this.toast("Discarded 🗑");
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
            this.els.vSpeed.textContent = this.app.speedMultiplier + "×";
          }
          this.toast(this.app.speedMultiplier + "× speed");
          break;
        }
        case "f":
        case "F":
          this.toggleFullscreen();
          break;
        case "m":
        case "M":
          this.app.toggleManualMode();
          break;
        case "t":
        case "T":
          this.toggleTheme();
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
        this.toast("Brain imported via drop ⬇");
      } catch (err) {
        this.toast("Import failed: " + err.message);
      }
    });
  }

  #applyInitialTheme() {
    const saved = Storage.get("selfDrivingCar.theme", null);
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  }

  toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    Storage.set("selfDrivingCar.theme", next);
    this.toast(next === "dark" ? "Dark mode 🌑" : "Light mode ☀️");
  }

  togglePause() {
    this.app.paused = !this.app.paused;
    if (this.els.btnPause) {
      this.els.btnPause.textContent = this.app.paused ? "▶" : "⏸";
      this.els.btnPause.setAttribute(
        "aria-label",
        this.app.paused ? "Play" : "Pause"
      );
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
      this.els.toast.classList.remove("show");
    }, ms);
  }

  updateHUD(stats, fps) {
    if (this.els.hudFps) this.els.hudFps.textContent = fps.toFixed(0);
    if (this.els.hudGen) this.els.hudGen.textContent = stats.generation;
    if (this.els.hudAlive)
      this.els.hudAlive.textContent = `${stats.alive}/${stats.population}`;
    if (this.els.hudBest)
      this.els.hudBest.textContent = formatNumber(stats.bestFitness);
    if (this.els.hudAllTime)
      this.els.hudAllTime.textContent = formatNumber(stats.allTimeBest);
    if (this.els.hudDistance)
      this.els.hudDistance.textContent = formatNumber(stats.distance);
    if (this.els.hudSpeed)
      this.els.hudSpeed.textContent = stats.speed.toFixed(1);
    if (this.els.hudMutation)
      this.els.hudMutation.textContent = stats.mutation.toFixed(2);
  }
}
