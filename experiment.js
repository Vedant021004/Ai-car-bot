/**
 * EvoSafe Experiment Manager
 * Records, analyzes, compares, and exports training sessions and empirical benchmarks.
 */

const STORAGE_KEY_EXPERIMENTS = "evosafe.experiments.v1";

class ExperimentManager {
  constructor() {
    this.history = this.#loadHistory();
    this.currentRun = null;
  }

  #loadHistory() {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EXPERIMENTS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveHistory() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_EXPERIMENTS, JSON.stringify(this.history));
    } catch {
      /* ignore storage exhaustion */
    }
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  startRun(config = {}) {
    this.currentRun = {
      id: "run_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      algorithm: config.algorithm || "evosafe", // 'baseline' | 'evosafe'
      scenario: config.scenario || "highway_cruise",
      seed: config.seed ?? 1001,
      population: config.population || 100,
      generations: [],
      summary: null,
      notes: config.notes || "",
    };
    return this.currentRun;
  }

  recordGeneration(genData) {
    if (!this.currentRun) return;
    this.currentRun.generations.push({
      generation: genData.generation,
      bestFitness: genData.bestFitness,
      avgFitness: genData.avgFitness,
      maxDistance: genData.maxDistance,
      avgDistance: genData.avgDistance,
      collisionRate: genData.collisionRate,
      avgSpeed: genData.avgSpeed,
      avgTTC: genData.avgTTC,
      nearMisses: genData.nearMisses,
      diversity: genData.diversity,
      timestamp: Date.now(),
    });
  }

  finishRun() {
    if (!this.currentRun) return null;
    const gens = this.currentRun.generations;
    if (gens.length > 0) {
      const last = gens[gens.length - 1];
      const bestEver = Math.max(...gens.map((g) => g.bestFitness));
      const finalCollRate = last.collisionRate;
      const finalMaxDist = last.maxDistance;
      const avgDiversity = gens.reduce((s, g) => s + (g.diversity || 0), 0) / gens.length;

      this.currentRun.summary = {
        totalGenerations: gens.length,
        peakFitness: bestEver,
        finalMaxDistance: finalMaxDist,
        finalCollisionRate: finalCollRate,
        meanDiversity: avgDiversity,
      };
    }
    this.history.unshift(this.currentRun);
    if (this.history.length > 30) this.history.pop(); // keep last 30 runs
    this.saveHistory();
    const finished = this.currentRun;
    this.currentRun = null;
    return finished;
  }

  /**
   * Compare multiple runs statistically (e.g. Baseline vs EvoSafe)
   */
  static compareRuns(baselineRuns, evoSafeRuns) {
    const calcStats = (runs, field) => {
      const values = runs
        .map((r) => r.summary?.[field])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (values.length === 0) return { mean: 0, std: 0, count: 0 };
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      return { mean, std: Math.sqrt(variance), count: values.length };
    };

    return {
      peakFitness: {
        baseline: calcStats(baselineRuns, "peakFitness"),
        evosafe: calcStats(evoSafeRuns, "peakFitness"),
      },
      finalMaxDistance: {
        baseline: calcStats(baselineRuns, "finalMaxDistance"),
        evosafe: calcStats(evoSafeRuns, "finalMaxDistance"),
      },
      finalCollisionRate: {
        baseline: calcStats(baselineRuns, "finalCollisionRate"),
        evosafe: calcStats(evoSafeRuns, "finalCollisionRate"),
      },
      meanDiversity: {
        baseline: calcStats(baselineRuns, "meanDiversity"),
        evosafe: calcStats(evoSafeRuns, "meanDiversity"),
      },
    };
  }

  /**
   * Export all runs as a CSV formatted string
   */
  exportCSV() {
    const rows = [
      [
        "Run ID",
        "Timestamp",
        "Algorithm",
        "Scenario",
        "Seed",
        "Population",
        "Generations",
        "Peak Fitness",
        "Final Max Dist",
        "Final Collision Rate",
        "Mean Diversity",
      ],
    ];

    for (const r of this.history) {
      const s = r.summary || {};
      rows.push([
        r.id,
        r.timestamp,
        r.algorithm,
        r.scenario,
        r.seed,
        r.population,
        s.totalGenerations || 0,
        (s.peakFitness || 0).toFixed(2),
        (s.finalMaxDistance || 0).toFixed(2),
        (s.finalCollisionRate || 0).toFixed(4),
        (s.meanDiversity || 0).toFixed(4),
      ]);
    }

    return rows.map((cols) => cols.join(",")).join("\n");
  }

  /**
   * Download CSV directly in browser
   */
  downloadCSV(filename = "evosafe_experiments.csv") {
    const csvContent = this.exportCSV();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
