/**
 * EvoSafe Empirical Head-to-Head Benchmark
 * Runs repeatable simulation trials comparing Baseline vs EvoSafe across fixed seeds.
 * Never invents numbers: outputs genuine simulated measurements.
 */

import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function createBenchmarkSandbox() {
  const store = {};
  const mockLocalStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    WeakSet,
    WeakMap,
    Set,
    Map,
    performance: { now: () => Date.now() },
    localStorage: mockLocalStorage,
    document: {
      documentElement: { getAttribute: () => "dark", setAttribute: () => {}, style: {} },
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => []
    },
    window: {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  const files = [
    "utils.js",
    "prng.js",
    "storage.js",
    "controls.js",
    "network.js",
    "road.js",
    "sensor.js",
    "car.js",
    "particles.js",
    "evolution.js",
    "safety.js",
    "scenarios.js",
    "experiment.js",
    "simulation.js"
  ];

  for (const f of files) {
    const code = fs.readFileSync(path.join(rootDir, f), "utf-8");
    const exportGlue = `
      if (typeof PRNG !== "undefined") globalThis.PRNG = PRNG;
      if (typeof Road !== "undefined") globalThis.Road = Road;
      if (typeof Simulation !== "undefined") globalThis.Simulation = Simulation;
      if (typeof ExperimentManager !== "undefined") globalThis.ExperimentManager = ExperimentManager;
    `;
    vm.runInContext(code + "\n" + exportGlue, context, { filename: f });
  }

  return context;
}

function runTrial(algorithmMode, seed, generations = 4, population = 40, maxStepsPerGen = 250) {
  const ctx = createBenchmarkSandbox();
  const road = new ctx.Road(0, 220, 3);
  const sim = new ctx.Simulation(road, {
    population,
    algorithmMode,
    seed,
  });

  const genLogs = [];

  for (let g = 0; g < generations; g++) {
    // Step simulation until all cars crashed or maxSteps reached
    let steps = 0;
    while (!sim.isBatchDone() && steps < maxStepsPerGen) {
      sim.step();
      steps++;
    }

    // Force end of batch if timed out
    if (!sim.isBatchDone()) {
      sim.cars.forEach((c) => { c.damaged = true; });
    }

    sim.nextGeneration();
    const stats = sim.getStats();
    genLogs.push({
      generation: g,
      bestFitness: sim.bestFitnessThisGen,
      avgFitness: sim.avgFitnessThisGen,
      distance: stats.distance,
      collisionRate: stats.collisionRate,
      diversity: stats.diversity,
    });
  }

  return {
    algorithm: algorithmMode,
    seed,
    generations: genLogs,
    peakFitness: Math.max(...genLogs.map((l) => l.bestFitness)),
    finalDistance: genLogs[genLogs.length - 1].distance,
    finalCollisionRate: genLogs[genLogs.length - 1].collisionRate,
    meanDiversity: genLogs.reduce((s, l) => s + l.diversity, 0) / genLogs.length,
  };
}

console.log("================================================================================");
console.log("  EvoSafe Head-to-Head Empirical Benchmark (Baseline vs EvoSafe)");
console.log("================================================================================");

const seeds = [101, 202, 303];
const generations = 4;
const population = 40;

const baselineTrials = [];
const evoSafeTrials = [];

console.log("\n[1/2] Running Baseline Trials (Hill Climber, Single-Champion Mutation)...");
for (const seed of seeds) {
  process.stdout.write(`  Running Seed ${seed}... `);
  const res = runTrial("baseline", seed, generations, population);
  baselineTrials.push(res);
  console.log(`Peak Fitness: ${res.peakFitness.toFixed(1)}, Final Dist: ${res.finalDistance.toFixed(1)}, Diversity: ${res.meanDiversity.toFixed(3)}`);
}

console.log("\n[2/2] Running EvoSafe Trials (Tournament Selection + Crossover + Multi-Elite + Safety)...");
for (const seed of seeds) {
  process.stdout.write(`  Running Seed ${seed}... `);
  const res = runTrial("evosafe", seed, generations, population);
  evoSafeTrials.push(res);
  console.log(`Peak Fitness: ${res.peakFitness.toFixed(1)}, Final Dist: ${res.finalDistance.toFixed(1)}, Diversity: ${res.meanDiversity.toFixed(3)}`);
}

function meanStd(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length;
  return { mean: m, std: Math.sqrt(variance) };
}

const bPeak = meanStd(baselineTrials.map((t) => t.peakFitness));
const ePeak = meanStd(evoSafeTrials.map((t) => t.peakFitness));

const bDist = meanStd(baselineTrials.map((t) => t.finalDistance));
const eDist = meanStd(evoSafeTrials.map((t) => t.finalDistance));

const bDiv = meanStd(baselineTrials.map((t) => t.meanDiversity));
const eDiv = meanStd(evoSafeTrials.map((t) => t.meanDiversity));

console.log("\n================================================================================");
console.log("  BENCHMARK SUMMARY RESULTS (Mean ± Std Dev across 3 seeds)");
console.log("================================================================================");
console.log(`Metric                     | Baseline (Original)     | EvoSafe (Proposed)      `);
console.log(`---------------------------+-------------------------+-------------------------`);
console.log(`Peak Fitness               | ${bPeak.mean.toFixed(2).padStart(8)} ± ${bPeak.std.toFixed(2).padEnd(8)} | ${ePeak.mean.toFixed(2).padStart(8)} ± ${ePeak.std.toFixed(2).padEnd(8)}`);
console.log(`Final Max Distance (px)    | ${bDist.mean.toFixed(2).padStart(8)} ± ${bDist.std.toFixed(2).padEnd(8)} | ${eDist.mean.toFixed(2).padStart(8)} ± ${eDist.std.toFixed(2).padEnd(8)}`);
console.log(`Population Diversity (0-1) | ${bDiv.mean.toFixed(4).padStart(8)} ± ${bDiv.std.toFixed(4).padEnd(8)} | ${eDiv.mean.toFixed(4).padStart(8)} ± ${eDiv.std.toFixed(4).padEnd(8)}`);
console.log("================================================================================\n");

// Export results to artifact
const resultsData = {
  timestamp: new Date().toISOString(),
  seeds,
  generations,
  population,
  baseline: { peakFitness: bPeak, finalDistance: bDist, diversity: bDiv, trials: baselineTrials },
  evoSafe: { peakFitness: ePeak, finalDistance: eDist, diversity: eDiv, trials: evoSafeTrials },
};

fs.writeFileSync(path.join(rootDir, "test", "benchmark-results.json"), JSON.stringify(resultsData, null, 2));
console.log("Benchmark results saved to test/benchmark-results.json");
