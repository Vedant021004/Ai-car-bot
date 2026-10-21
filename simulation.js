const SIM_KEY_BRAIN = "selfDrivingCar.bestBrain";
const SIM_KEY_BEST_FITNESS = "selfDrivingCar.bestFitness";
const SIM_KEY_GENERATION = "selfDrivingCar.generation";
const SIM_KEY_BRAIN_VERSION = "selfDrivingCar.brainVersion";

// Bump this whenever the network architecture or activation function changes
// in a way that makes old saved brains incompatible / dead.
const CURRENT_BRAIN_VERSION = 2;

const DEFAULT_CHAMPION_BRAIN = {
  levels: [
    {
      inputs: [0, 0, 0, 0, 0],
      outputs: [0, 0, 0, 0, 0, 0],
      biases: [-0.15, 0.25, 0.25, 0.35, 0.35, 0.65],
      weights: [
        [-0.5, 0.9, -0.8, -0.7, 0.2, 0.2],
        [-0.8, 1.2, -0.9, -0.9, 0.3, 0.5],
        [-1.2, -0.3, -0.3, 0.8, 0.8, 1.1],
        [-0.8, -0.9, 1.2, 0.3, -0.9, 0.5],
        [-0.5, -0.8, 0.9, 0.2, -0.7, 0.2],
      ],
    },
    {
      inputs: [0, 0, 0, 0, 0, 0],
      outputs: [1, 0, 0, 0],
      biases: [-0.05, 0.45, 0.45, 0.55],
      weights: [
        [1.2, -0.6, -0.6, -0.8],
        [-0.2, -0.9, 1.4, -0.1],
        [-0.2, 1.4, -0.9, -0.1],
        [-0.3, -0.9, 1.3, 0.2],
        [-0.3, 1.3, -0.9, 0.2],
        [-1.4, 0, 0, 1.2],
      ],
    },
  ],
};

class Simulation {
  constructor(road, options = {}) {
    this.road = road;
    this.options = {
      population: 100,
      mutationAmount: 0.18,
      rayCount: 5,
      rayLength: 180,
      maxSpeed: 5,

      // Algorithm & Safety Options
      algorithmMode: "evosafe", // 'baseline' | 'evosafe'
      selectionMethod: "tournament", // 'tournament' | 'roulette'
      tournamentSize: 3,
      crossoverRate: 0.65,
      crossoverType: "uniform",
      eliteCount: 2,
      scenarioId: "highway_cruise",
      seed: 1001,

      // Traffic spawner — continuous & dense
      trafficAheadDistance: 3500, // keep this many px of traffic ahead of leader
      trafficBehindDistance: 1500, // recycle traffic this far behind leader
      trafficRowGap: [160, 230], // [min, max] vertical px between rows (denser)
      trafficStartGap: 180, // gap from start before first row of traffic
      trafficEmptyRowChance: 0.0, // 0 = every row has at least 1 blocked lane

      ...options,
    };

    // Subsystems
    this.prng = new PRNG(this.options.seed);
    this.evolutionEngine = new EvolutionEngine({
      mode: this.options.algorithmMode,
      selectionMethod: this.options.selectionMethod,
      tournamentSize: this.options.tournamentSize,
      crossoverRate: this.options.crossoverRate,
      crossoverType: this.options.crossoverType,
      mutationAmount: this.options.mutationAmount,
      eliteCount: this.options.eliteCount,
      prng: this.prng,
    });
    this.safetyEvaluator = new SafetyEvaluator();
    this.scenarioManager = new ScenarioManager({
      scenarioId: this.options.scenarioId,
      seed: this.options.seed,
    });
    this.experimentManager = new ExperimentManager();

    // Auto-discard brains saved under an older activation/architecture so we
    // don't load a brain that no longer responds (e.g. tanh-era brains under
    // the current step-activated network).
    const savedVersion = Storage.get(SIM_KEY_BRAIN_VERSION, 0) || 0;
    if (savedVersion !== CURRENT_BRAIN_VERSION) {
      Storage.remove(SIM_KEY_BRAIN);
      Storage.remove(SIM_KEY_BEST_FITNESS);
      Storage.remove(SIM_KEY_GENERATION);
      Storage.set(SIM_KEY_BRAIN_VERSION, CURRENT_BRAIN_VERSION);
    }

    this.generation = Storage.get(SIM_KEY_GENERATION, 0) || 0;
    this.allTimeBestFitness = Storage.get(SIM_KEY_BEST_FITNESS, 0) || 0;
    this.bestEverBrain = Storage.get(SIM_KEY_BRAIN, null) || NeuralNetwork.clone(DEFAULT_CHAMPION_BRAIN);
    this._zeroFitnessGens = 0;
    this.bestFitnessThisGen = 0;
    this.avgFitnessThisGen = 0;
    this.plateauStreak = 0;
    this.adaptiveMutation = this.options.mutationAmount;
    this.currentDiversity = 0;
    this.lastEvaluationReport = null;

    this.cars = [];
    this.carMetricsMap = new WeakMap();
    this.bestCar = null;
    this.traffic = [];
    this.particles = new ParticleSystem();
    this.crashedFlags = new WeakSet();
    this._trafficFrontierY = 0; // furthest-ahead y where traffic exists
    this.startY = 600;

    // Start experiment logging run
    this.experimentManager.startRun({
      algorithm: this.options.algorithmMode,
      scenario: this.options.scenarioId,
      seed: this.options.seed,
      population: this.options.population,
    });

    this.#spawnPopulation();
    this.#initialTraffic();
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
    if (partial.algorithmMode) {
      this.evolutionEngine.setOptions({ mode: partial.algorithmMode });
    }
    if (partial.selectionMethod || partial.crossoverRate || partial.crossoverType || partial.eliteCount || partial.tournamentSize) {
      this.evolutionEngine.setOptions({
        selectionMethod: this.options.selectionMethod,
        crossoverRate: this.options.crossoverRate,
        crossoverType: this.options.crossoverType,
        eliteCount: this.options.eliteCount,
        tournamentSize: this.options.tournamentSize,
      });
    }
    if (partial.scenarioId) {
      this.scenarioManager.setScenario(partial.scenarioId, this.options.seed);
    }
  }

  #buildAICar(x, y) {
    const car = new Car(x, y, 30, 50, ControlMode.AI, this.options.maxSpeed, {
      rayCount: this.options.rayCount,
      rayLength: this.options.rayLength,
    });
    this.carMetricsMap.set(car, this.safetyEvaluator.initCarMetrics(car, this.road));
    return car;
  }

  #spawnPopulation() {
    const nextCars = [];
    for (let i = 0; i < this.options.population; i++) {
      const car = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
      nextCars.push(car);
    }
    this.cars = nextCars;
    this.bestCar = nextCars[0];
    this.#applyBestBrainToPopulation();
  }

  #applyBestBrainToPopulation() {
    const stored = this.bestEverBrain || Storage.get(SIM_KEY_BRAIN);
    if (!stored) return;
    this.bestEverBrain = stored;

    if (this.options.algorithmMode === "baseline") {
      for (let i = 0; i < this.cars.length; i++) {
        this.cars[i].brain = NeuralNetwork.clone(stored);
        if (i !== 0) NeuralNetwork.mutate(this.cars[i].brain, this.adaptiveMutation);
      }
    } else {
      // In EvoSafe mode, seed the population with champion mutations and diversity
      for (let i = 0; i < this.cars.length; i++) {
        this.cars[i].brain = NeuralNetwork.clone(stored);
        if (i !== 0) {
          this.evolutionEngine.mutate(this.cars[i].brain, 0.25, this.options.mutationAmount);
        }
      }
    }
    this.currentDiversity = this.evolutionEngine.calculateDiversity(this.cars.map((c) => c.brain));
  }

  // --- Traffic --------------------------------------------------------------
  #pickRowBlockedLanes() {
    const lanes = this.road.laneCount;
    const maxBlocked = Math.min(lanes - 1, 2);
    const emptyChance = this.options.trafficEmptyRowChance ?? 0;
    const r = this.options.seed != null ? this.prng.random() : Math.random();
    let count;
    if (r < emptyChance) count = 0;
    else if (r < emptyChance + 0.6) count = 1;
    else count = 2;
    const numBlocked = Math.min(count, maxBlocked);
    if (numBlocked === 0) return [];

    const allLanes = [];
    for (let i = 0; i < lanes; i++) allLanes.push(i);

    const prev = this._prevClearLane ?? Math.floor(lanes / 2);
    const candidates = allLanes.filter((l) => Math.abs(l - prev) <= 1);
    const clearLane = candidates[Math.floor((this.options.seed != null ? this.prng.random() : Math.random()) * candidates.length)];
    this._prevClearLane = clearLane;

    const blockable = allLanes.filter((l) => l !== clearLane);
    for (let i = blockable.length - 1; i > 0; i--) {
      const j = Math.floor((this.options.seed != null ? this.prng.random() : Math.random()) * (i + 1));
      [blockable[i], blockable[j]] = [blockable[j], blockable[i]];
    }
    return blockable.slice(0, numBlocked);
  }

  #spawnRow(y) {
    const blocked = this.#pickRowBlockedLanes();
    const minVerticalSpacing = 80; // never stack two traffic cars in same lane closer than this
    for (const lane of blocked) {
      const laneX = this.road.getLaneCenter(lane);
      // Skip if there's already a traffic car too close in this lane
      const collides = this.traffic.some(
        (t) =>
          Math.abs(t.x - laneX) < this.road.laneWidth / 3 &&
          Math.abs(t.y - y) < minVerticalSpacing
      );
      if (collides) continue;
      const speed = this.options.seed != null
        ? this.prng.range(1.5, 3.5)
        : randRange(1.5, 3.5);
      this.traffic.push(
        new Car(
          laneX,
          y,
          30,
          50,
          ControlMode.DUMMY,
          speed
        )
      );
    }
  }

  #initialTraffic() {
    this.traffic = [];
    this._prevClearLane = 1;
    const [minGap, maxGap] = this.options.trafficRowGap;
    const randG = () => (this.options.seed != null ? this.prng.range(minGap, maxGap) : randRange(minGap, maxGap));

    // Forward (ahead of start): dense rows from just ahead to far ahead.
    const startSpawn = this.startY - this.options.trafficStartGap;
    let y = startSpawn;
    while (y > startSpawn - this.options.trafficAheadDistance) {
      this.#spawnRow(y);
      y -= randG();
    }
    this._trafficFrontierY = y;

    // Backward (behind start): sparse traffic so cars that drift back still see obstacles.
    let yb = this.startY + 350;
    const behindLimit = this.startY + this.options.trafficBehindDistance;
    while (yb < behindLimit) {
      this.#spawnRow(yb);
      yb += randG();
    }
  }

  #maybeSpawnTraffic() {
    const [minGap, maxGap] = this.options.trafficRowGap;
    const randG = () => (this.options.seed != null ? this.prng.range(minGap, maxGap) : randRange(minGap, maxGap));
    const aheadTarget = this.bestCar.y - this.options.trafficAheadDistance;
    while (this._trafficFrontierY > aheadTarget) {
      this._trafficFrontierY -= randG();
      this.#spawnRow(this._trafficFrontierY);
    }
    const behindLimit = this.bestCar.y + this.options.trafficBehindDistance;
    if (this.traffic.length > 0) {
      this.traffic = this.traffic.filter((t) => t.y < behindLimit);
    }
  }

  // --- Step -----------------------------------------------------------------
  step() {
    // Update traffic
    for (let i = 0; i < this.traffic.length; i++) {
      const t = this.traffic[i];
      const others = this.traffic.length > 1
        ? this.traffic.filter((x, j) => j !== i)
        : [];
      t.update(this.road.borders, others);
    }
    // Cull damaged traffic (rear-ends)
    this.traffic = this.traffic.filter((t) => !t.damaged);

    // Update AI cars & safety telemetry
    for (const car of this.cars) {
      const wasDamaged = car.damaged;
      car.update(this.road.borders, this.traffic);

      let m = this.carMetricsMap.get(car);
      if (!m) {
        m = this.safetyEvaluator.initCarMetrics(car, this.road);
        this.carMetricsMap.set(car, m);
      }
      this.safetyEvaluator.updateCarMetrics(m, car, this.road, this.traffic);

      // Compute dynamic fitness
      if (this.options.algorithmMode === "evosafe") {
        car._computedFitness = this.safetyEvaluator.computeSafetyFitness(car, m);
      } else {
        car._computedFitness = this.safetyEvaluator.computeBaselineFitness(car);
      }

      if (!wasDamaged && car.damaged && !this.crashedFlags.has(car)) {
        this.crashedFlags.add(car);
        this.particles.burst(car.x, car.y, 14, "#ff7676");
      }
    }

    // Pick best (alive cars first, then by computed fitness)
    let best = this.cars[0];
    for (let i = 1; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.damaged && !best.damaged) continue;
      if (!c.damaged && best.damaged) {
        best = c;
        continue;
      }
      const cFit = c._computedFitness ?? c.fitness;
      const bFit = best._computedFitness ?? best.fitness;
      if (cFit > bFit) best = c;
    }
    this.bestCar = best;

    this.particles.update();
    this.#maybeSpawnTraffic();
  }

  isBatchDone() {
    return this.cars.every((c) => c.damaged);
  }

  nextGeneration() {
    // Assign effective fitness property for sorting
    for (const car of this.cars) {
      const m = this.carMetricsMap.get(car);
      if (this.options.algorithmMode === "evosafe" && m) {
        car._evalFitness = this.safetyEvaluator.computeSafetyFitness(car, m);
      } else {
        car._evalFitness = this.safetyEvaluator.computeBaselineFitness(car);
      }
    }

    let best = this.cars[0];
    let sum = 0;
    for (const c of this.cars) {
      const f = c._evalFitness;
      sum += f;
      if (f > best._evalFitness) best = c;
    }
    this.bestFitnessThisGen = best._evalFitness;
    this.avgFitnessThisGen = sum / Math.max(1, this.cars.length);

    // Extract genuine evaluation report
    this.lastEvaluationReport = this.safetyEvaluator.extractEvaluationReport(
      this.cars,
      this.carMetricsMap
    );

    // Auto-recovery check
    if (this.options.algorithmMode === "baseline") {
      if (best._evalFitness < 1) {
        this._zeroFitnessGens++;
        if (this._zeroFitnessGens >= 5) {
          this._zeroFitnessGens = 0;
          Storage.remove(SIM_KEY_BRAIN);
          Storage.remove(SIM_KEY_BEST_FITNESS);
          this.bestEverBrain = null;
          this.allTimeBestFitness = 0;
          this.adaptiveMutation = this.options.mutationAmount;
          this.plateauStreak = 0;
        }
      } else {
        this._zeroFitnessGens = 0;
      }
    }

    if (best._evalFitness > this.allTimeBestFitness) {
      this.allTimeBestFitness = best._evalFitness;
      this.bestEverBrain = NeuralNetwork.clone(best.brain);
      this.plateauStreak = 0;
      this.adaptiveMutation = this.options.mutationAmount;
      Storage.set(SIM_KEY_BRAIN, this.bestEverBrain);
      Storage.set(SIM_KEY_BEST_FITNESS, this.allTimeBestFitness);
      Storage.set(SIM_KEY_BRAIN_VERSION, CURRENT_BRAIN_VERSION);
    } else {
      this.plateauStreak++;
      if (this.plateauStreak >= 3) {
        this.adaptiveMutation = Math.min(
          this.options.mutationAmount * 1.5,
          0.6
        );
      }
    }

    // Evolution step using configured EvolutionEngine
    const evolutionResult = this.evolutionEngine.evolve(
      this.cars.map((c) => ({
        brain: c.brain,
        fitness: c._evalFitness,
        damaged: c.damaged,
      })),
      this.options.population,
      this.bestEverBrain
    );

    this.currentDiversity = evolutionResult.diversity;

    // Record generation in experiment tracker
    this.experimentManager.recordGeneration({
      generation: this.generation,
      bestFitness: this.bestFitnessThisGen,
      avgFitness: this.avgFitnessThisGen,
      maxDistance: this.lastEvaluationReport.maxDistance,
      avgDistance: this.lastEvaluationReport.avgDistance,
      collisionRate: this.lastEvaluationReport.collisionRate,
      avgSpeed: this.lastEvaluationReport.avgSpeed,
      avgTTC: this.lastEvaluationReport.avgMinTTC,
      nearMisses: this.lastEvaluationReport.avgNearMisses,
      diversity: this.currentDiversity,
    });

    this.generation++;
    Storage.set(SIM_KEY_GENERATION, this.generation);

    // Build the new generation cars
    const nextCars = [];
    for (let i = 0; i < this.options.population; i++) {
      const car = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
      car.brain = evolutionResult.brains[i] || NeuralNetwork.clone(best.brain);
      nextCars.push(car);
    }

    this.cars = nextCars;
    this.bestCar = nextCars[0];
    this.crashedFlags = new WeakSet();
    this.#initialTraffic();
  }

  // --- API ------------------------------------------------------------------
  saveBestBrain() {
    const brain = this.bestEverBrain || this.bestCar?.brain;
    if (!brain) return false;
    return Storage.set(SIM_KEY_BRAIN, brain);
  }

  discardBestBrain() {
    Storage.remove(SIM_KEY_BRAIN);
    Storage.remove(SIM_KEY_BEST_FITNESS);
    Storage.remove(SIM_KEY_GENERATION);
    this.allTimeBestFitness = 0;
    this.generation = 0;
    this.bestEverBrain = null;
    this.adaptiveMutation = this.options.mutationAmount;
    this.plateauStreak = 0;
    this.currentDiversity = 0;
  }

  loadBrain(brainData) {
    const requiredInputs = this.options.rayCount;
    const firstLevel = brainData?.levels?.[0];
    const brainInputs =
      firstLevel?.weights?.length ?? firstLevel?.inputs?.length;
    if (brainInputs !== requiredInputs) {
      throw new Error(
        `Brain has ${brainInputs} inputs, but the current sensor uses ${requiredInputs} rays. ` +
          `Match the slider to the brain (or change rays to ${brainInputs}) before importing.`
      );
    }
    this.bestEverBrain = brainData;
    Storage.set(SIM_KEY_BRAIN, brainData);
    Storage.set(SIM_KEY_BRAIN_VERSION, CURRENT_BRAIN_VERSION);
    this.reset();
  }

  reset() {
    this.#spawnPopulation();
    this.#initialTraffic();
    this.particles = new ParticleSystem();
    this.crashedFlags = new WeakSet();
    this.experimentManager.startRun({
      algorithm: this.options.algorithmMode,
      scenario: this.options.scenarioId,
      seed: this.options.seed,
      population: this.options.population,
    });
  }

  getStats() {
    const alive = this.cars.filter((c) => !c.damaged).length;
    const rep = this.lastEvaluationReport;
    return {
      generation: this.generation,
      population: this.cars.length,
      alive,
      bestFitness: this.bestCar ? (this.bestCar._computedFitness ?? this.bestCar.fitness) : 0,
      allTimeBest: this.allTimeBestFitness,
      distance: this.bestCar ? this.bestCar.distanceTraveled : 0,
      speed: this.bestCar ? this.bestCar.speed : 0,
      mutation: this.adaptiveMutation,
      trafficCount: this.traffic.length,
      algorithmMode: this.options.algorithmMode,
      diversity: this.currentDiversity,
      collisionRate: rep ? rep.collisionRate : (this.cars.length > 0 ? (this.cars.length - alive) / this.cars.length : 0),
      avgTTC: rep ? rep.avgMinTTC : 0,
      nearMisses: rep ? rep.avgNearMisses : 0,
      scenarioName: this.scenarioManager.activeConfig.name,
    };
  }
}
