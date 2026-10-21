/**
 * EvoSafe Complete Test Suite
 * Tests baseline regression protection, PRNG determinism,
 * EvolutionEngine (Selection, Crossover, Mutation, Elitism, Diversity),
 * SafetyEvaluator, ScenarioManager, and ExperimentManager.
 */

import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { describe, test, assert, assertEqual, assertAlmostEqual, summarize } from "./runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function createSandbox() {
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
      documentElement: {
        getAttribute: () => "dark",
        setAttribute: () => {},
        style: {}
      },
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => []
    },
    window: {},
    getComputedStyle: () => ({
      getPropertyValue: () => ""
    }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
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
      if (typeof lerp !== "undefined") globalThis.lerp = lerp;
      if (typeof clamp !== "undefined") globalThis.clamp = clamp;
      if (typeof randRange !== "undefined") globalThis.randRange = randRange;
      if (typeof formatNumber !== "undefined") globalThis.formatNumber = formatNumber;
      if (typeof getIntersection !== "undefined") globalThis.getIntersection = getIntersection;
      if (typeof polysIntersect !== "undefined") globalThis.polysIntersect = polysIntersect;
      if (typeof getRGBA !== "undefined") globalThis.getRGBA = getRGBA;
      if (typeof readCssVar !== "undefined") globalThis.readCssVar = readCssVar;
      if (typeof Storage !== "undefined") globalThis.Storage = Storage;
      if (typeof ControlMode !== "undefined") globalThis.ControlMode = ControlMode;
      if (typeof Controls !== "undefined") globalThis.Controls = Controls;
      if (typeof NeuralNetwork !== "undefined") globalThis.NeuralNetwork = NeuralNetwork;
      if (typeof Level !== "undefined") globalThis.Level = Level;
      if (typeof Road !== "undefined") globalThis.Road = Road;
      if (typeof Sensor !== "undefined") globalThis.Sensor = Sensor;
      if (typeof Car !== "undefined") globalThis.Car = Car;
      if (typeof ParticleSystem !== "undefined") globalThis.ParticleSystem = ParticleSystem;
      if (typeof PRNG !== "undefined") globalThis.PRNG = PRNG;
      if (typeof DefaultPRNG !== "undefined") globalThis.DefaultPRNG = DefaultPRNG;
      if (typeof EvolutionEngine !== "undefined") globalThis.EvolutionEngine = EvolutionEngine;
      if (typeof SafetyEvaluator !== "undefined") globalThis.SafetyEvaluator = SafetyEvaluator;
      if (typeof ScenarioType !== "undefined") globalThis.ScenarioType = ScenarioType;
      if (typeof ScenarioManager !== "undefined") globalThis.ScenarioManager = ScenarioManager;
      if (typeof ExperimentManager !== "undefined") globalThis.ExperimentManager = ExperimentManager;
      if (typeof Simulation !== "undefined") globalThis.Simulation = Simulation;
    `;
    vm.runInContext(code + "\n" + exportGlue, context, { filename: f });
  }

  return context;
}

const ctx = createSandbox();

describe("PRNG and Determinism Tests", () => {
  test("Identical seeds produce identical random sequences", () => {
    const prng1 = new ctx.PRNG(42);
    const prng2 = new ctx.PRNG(42);
    const seq1 = Array.from({ length: 10 }, () => prng1.random());
    const seq2 = Array.from({ length: 10 }, () => prng2.random());
    for (let i = 0; i < seq1.length; i++) {
      assertEqual(seq1[i], seq2[i], `Item ${i} must match under seed 42`);
    }
  });

  test("Different seeds produce distinct sequences", () => {
    const prng1 = new ctx.PRNG(42);
    const prng2 = new ctx.PRNG(9999);
    assert(prng1.random() !== prng2.random(), "Different seeds should yield different random outputs");
  });

  test("PRNG range and rangeInt bounds checking", () => {
    const prng = new ctx.PRNG(12345);
    for (let i = 0; i < 50; i++) {
      const f = prng.range(5, 10);
      assert(f >= 5 && f < 10, `range(5,10) got ${f}`);
      const intVal = prng.rangeInt(1, 3);
      assert(Number.isInteger(intVal) && intVal >= 1 && intVal <= 3, `rangeInt(1,3) got ${intVal}`);
    }
  });
});

describe("Baseline Neural Network Tests", () => {
  test("Topology and level initialization", () => {
    const net = new ctx.NeuralNetwork([5, 6, 4]);
    assertEqual(net.levels.length, 2);
    assertEqual(net.levels[0].inputs.length, 5);
    assertEqual(net.levels[0].outputs.length, 6);
    assertEqual(net.levels[1].inputs.length, 6);
    assertEqual(net.levels[1].outputs.length, 4);
  });

  test("Forward-pass produces valid step-activation binary outputs [0, 1]", () => {
    const net = new ctx.NeuralNetwork([5, 6, 4]);
    const inputs = [0.1, 0.5, 0.9, 0.0, 0.3];
    const outputs = ctx.NeuralNetwork.feedForward(inputs, net);
    assertEqual(outputs.length, 4);
    outputs.forEach((val) => assert(val === 0 || val === 1));
  });

  test("Network cloning produces independent deep copy", () => {
    const net = new ctx.NeuralNetwork([5, 6, 4]);
    const cloned = ctx.NeuralNetwork.clone(net);
    net.levels[0].weights[0][0] = 999;
    assert(cloned.levels[0].weights[0][0] !== 999);
  });

  test("Champion brain JSON schema compatibility", () => {
    const raw = fs.readFileSync(path.join(rootDir, "champion-brain.json"), "utf-8");
    const champion = JSON.parse(raw);
    assert(Array.isArray(champion.levels));
    assertEqual(champion.levels.length, 2);
    assertEqual(champion.levels[0].inputs.length, 5);
    assertEqual(champion.levels[1].outputs.length, 4);

    const outputs = ctx.NeuralNetwork.feedForward([0.5, 0.2, 0.8, 0.1, 0.0], champion);
    assertEqual(outputs.length, 4);
    outputs.forEach((o) => assert(o === 0 || o === 1));
  });
});

describe("Evolution Engine (Selection, Crossover, Mutation, Elitism, Diversity)", () => {
  test("Topology compatibility validation", () => {
    const netA = new ctx.NeuralNetwork([5, 6, 4]);
    const netB = new ctx.NeuralNetwork([5, 6, 4]);
    const netIncompatible = new ctx.NeuralNetwork([7, 6, 4]);

    assert(ctx.EvolutionEngine.areCompatible(netA, netB), "Matching topologies must be compatible");
    assert(!ctx.EvolutionEngine.areCompatible(netA, netIncompatible), "Mismatched topologies must be rejected");
  });

  test("Uniform Crossover creates valid offspring combining parent parameters", () => {
    const engine = new ctx.EvolutionEngine({ prng: new ctx.PRNG(555) });
    const p1 = new ctx.NeuralNetwork([5, 6, 4]);
    const p2 = new ctx.NeuralNetwork([5, 6, 4]);

    const child = engine.crossover(p1, p2, "uniform");
    assertEqual(child.levels.length, 2);
    assertEqual(child.levels[0].weights.length, 5);
    assertEqual(child.levels[1].outputs.length, 4);

    // Child must have valid finite weights
    for (const l of child.levels) {
      for (const b of l.biases) assert(Number.isFinite(b));
      for (const row of l.weights) {
        for (const w of row) assert(Number.isFinite(w));
      }
    }
  });

  test("Arithmetic Crossover blends parent weights smoothly", () => {
    const engine = new ctx.EvolutionEngine({ prng: new ctx.PRNG(777) });
    const p1 = new ctx.NeuralNetwork([5, 6, 4]);
    const p2 = new ctx.NeuralNetwork([5, 6, 4]);

    const child = engine.crossover(p1, p2, "arithmetic");
    assertEqual(child.levels.length, 2);
    for (const l of child.levels) {
      for (const b of l.biases) assert(Number.isFinite(b));
    }
  });

  test("Elitism preserves the validated champion intact", () => {
    const engine = new ctx.EvolutionEngine({
      mode: "evosafe",
      eliteCount: 2,
      prng: new ctx.PRNG(101),
    });

    const net1 = new ctx.NeuralNetwork([5, 6, 4]);
    const net2 = new ctx.NeuralNetwork([5, 6, 4]);
    const net3 = new ctx.NeuralNetwork([5, 6, 4]);

    // Give net1 highest fitness
    const cars = [
      { brain: net1, fitness: 500, damaged: false },
      { brain: net2, fitness: 200, damaged: false },
      { brain: net3, fitness: 50, damaged: true },
    ];

    const result = engine.evolve(cars, 10);
    assertEqual(result.brains.length, 10);

    // The first brain in next generation must be an exact copy of net1
    const elite = result.brains[0];
    assertEqual(elite.levels[0].biases[0], net1.levels[0].biases[0]);
    assertEqual(elite.levels[0].weights[0][0], net1.levels[0].weights[0][0]);
  });

  test("Genetic diversity metric calculates valid normalized dispersion [0, 1]", () => {
    const engine = new ctx.EvolutionEngine();
    const identicalBrains = Array.from({ length: 5 }, () => new ctx.NeuralNetwork([5, 6, 4]));
    // Clone first brain to all to make identical
    const root = identicalBrains[0];
    const clones = identicalBrains.map(() => ctx.NeuralNetwork.clone(root));
    const divZero = engine.calculateDiversity(clones);
    assertEqual(divZero, 0, "Identical brains should have 0 diversity");

    // Random diverse population
    const diverse = Array.from({ length: 10 }, () => new ctx.NeuralNetwork([5, 6, 4]));
    const divDiverse = engine.calculateDiversity(diverse);
    assert(divDiverse > 0 && divDiverse <= 1, `Diversity must be in (0, 1], got ${divDiverse}`);
  });
});

describe("Safety Evaluation and Composite Metrics", () => {
  test("Near-miss and TTC estimation calculation", () => {
    const evaluator = new ctx.SafetyEvaluator();
    const road = new ctx.Road(0, 220, 3);
    const car = new ctx.Car(0, 600, 30, 50, ctx.ControlMode.KEYS, 5);
    const metrics = evaluator.initCarMetrics(car, road);

    car.speed = 3.0;
    car.distanceTraveled = 150;
    // Mock sensor readings with a close hit (offset 0.85 = within 15% ray distance)
    car.sensor = {
      rayLength: 180,
      readings: [{ offset: 0.88 }],
    };

    evaluator.updateCarMetrics(metrics, car, road, []);
    assert(metrics.nearMissCount > 0, "Near-miss should be logged for close sensor hit");
    assert(metrics.minObservedDistance < 50, "Minimum observed distance must reflect sensor hit");
    assert(metrics.minObservedTTC < 5.0, "Time-to-Collision should be computed");

    const safeFit = evaluator.computeSafetyFitness(car, metrics);
    assert(Number.isFinite(safeFit) && safeFit >= 0, "Safety fitness must be finite non-negative");
  });

  test("Crash penalty significantly reduces safety score compared to baseline", () => {
    const evaluator = new ctx.SafetyEvaluator();
    const road = new ctx.Road(0, 220, 3);
    const car = new ctx.Car(0, 600, 30, 50, ctx.ControlMode.KEYS, 5);
    car.distanceTraveled = 300;
    car.speed = 4;
    const metrics = evaluator.initCarMetrics(car, road);
    metrics.framesAlive = 50;
    metrics.speedSum = 200;

    const uninjured = evaluator.computeSafetyFitness(car, metrics);

    car.damaged = true;
    metrics.crashed = true;
    const damaged = evaluator.computeSafetyFitness(car, metrics);

    assert(damaged < uninjured, "Damaged car must receive substantial safety fitness penalty");
    assertEqual(uninjured - damaged, evaluator.options.weightCollision, "Difference equals weightCollision");
  });
});

describe("Repeatable Scenarios and Seeding", () => {
  test("Scenario definitions integrity", () => {
    const defs = ctx.ScenarioManager.getDefinitions();
    assert(defs[ctx.ScenarioType.HIGHWAY_CRUISE], "Highway Cruise scenario must exist");
    assert(defs[ctx.ScenarioType.HEAVY_COMMUTE], "Heavy Commute scenario must exist");
    assert(defs[ctx.ScenarioType.CHICANE_OBSTACLES], "Chicane scenario must exist");
    assert(defs[ctx.ScenarioType.FOG_LOW_VISIBILITY], "Fog scenario must exist");
  });

  test("Seeded traffic generation reproducibility", () => {
    const road = new ctx.Road(0, 220, 3);
    const mgr1 = new ctx.ScenarioManager({ scenarioId: ctx.ScenarioType.HIGHWAY_CRUISE, seed: 999 });
    const mgr2 = new ctx.ScenarioManager({ scenarioId: ctx.ScenarioType.HIGHWAY_CRUISE, seed: 999 });

    const traffic1 = mgr1.generateTraffic(road, 600, 15);
    const traffic2 = mgr2.generateTraffic(road, 600, 15);

    assertEqual(traffic1.length, traffic2.length);
    for (let i = 0; i < traffic1.length; i++) {
      assertAlmostEqual(traffic1[i].x, traffic2[i].x, 1e-4, `Traffic ${i} X must match`);
      assertAlmostEqual(traffic1[i].y, traffic2[i].y, 1e-4, `Traffic ${i} Y must match`);
    }
  });
});

describe("Experiment Manager and Analytics", () => {
  test("Run lifecycle and CSV export", () => {
    const exp = new ctx.ExperimentManager();
    exp.startRun({ algorithm: "evosafe", scenario: "highway_cruise", seed: 42, population: 50 });

    exp.recordGeneration({
      generation: 0,
      bestFitness: 120,
      avgFitness: 45,
      maxDistance: 110,
      avgDistance: 40,
      collisionRate: 0.9,
      avgSpeed: 2.5,
      avgTTC: 1.2,
      nearMisses: 3,
      diversity: 0.42,
    });

    exp.recordGeneration({
      generation: 1,
      bestFitness: 280,
      avgFitness: 110,
      maxDistance: 270,
      avgDistance: 95,
      collisionRate: 0.7,
      avgSpeed: 3.1,
      avgTTC: 1.8,
      nearMisses: 2,
      diversity: 0.38,
    });

    const finished = exp.finishRun();
    assert(finished != null);
    assertEqual(finished.summary.totalGenerations, 2);
    assertEqual(finished.summary.peakFitness, 280);

    const csv = exp.exportCSV();
    assert(csv.includes("evosafe"), "CSV must include algorithm name");
    assert(csv.includes("280.00"), "CSV must include peak fitness");
  });
});

describe("Integrated Simulation & Mode Isolation", () => {
  test("Baseline mode maintains original (1+λ) elitist behavior", () => {
    ctx.localStorage.clear();
    const road = new ctx.Road(0, 220, 3);
    const sim = new ctx.Simulation(road, {
      population: 10,
      algorithmMode: "baseline",
      seed: 123,
    });
    assertEqual(sim.options.algorithmMode, "baseline");
    assertEqual(sim.cars.length, 10);

    // Run step
    sim.step();
    assert(sim.bestCar != null);

    // Finish batch and advance
    sim.cars.forEach((c) => { c.damaged = true; });
    sim.nextGeneration();
    assertEqual(sim.generation, 1);
  });

  test("EvoSafe mode integrates crossover, multi-elite, and diversity metrics", () => {
    ctx.localStorage.clear();
    const road = new ctx.Road(0, 220, 3);
    const sim = new ctx.Simulation(road, {
      population: 15,
      algorithmMode: "evosafe",
      seed: 456,
      crossoverRate: 0.7,
      eliteCount: 2,
    });
    assertEqual(sim.options.algorithmMode, "evosafe");

    sim.step();
    sim.cars.forEach((c) => { c.damaged = true; });
    sim.nextGeneration();

    assertEqual(sim.generation, 1);
    const stats = sim.getStats();
    assertEqual(stats.algorithmMode, "evosafe");
    assert(Number.isFinite(stats.diversity), "Diversity metric must be available");
    assert(Number.isFinite(stats.collisionRate), "Collision rate must be computed");
  });

  test("Head-to-head live benchmark trial generates empirical comparison scorecard", () => {
    ctx.localStorage.clear();
    const result = ctx.Simulation.runHeadToHeadTrial(2, 10, 101);
    assert(result.baseline != null, "Baseline result must exist");
    assert(result.evosafe != null, "EvoSafe result must exist");
    assert(result.baseline.diversity != null, "Baseline diversity must be present");
    assert(result.evosafe.diversity != null, "EvoSafe diversity must be present");
    assert(result.baseline.collisionRate != null, "Baseline collision rate must be present");
    assert(result.evosafe.collisionRate != null, "EvoSafe collision rate must be present");
  });
});

summarize();
