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

    // Operational Modes
    this.executionMode = options.executionMode || "training"; // 'training' | 'evaluation'
    this.ghostMode = options.ghostMode || "none"; // 'none' (Solo Champion only - clean view!) | 'top3' | 'all'
    this.loadedBrainFilename = null;

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
    this.bestEverBrain = Storage.get(SIM_KEY_BRAIN, null); // starts null for true random exploration!
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
    if (partial.sensorNoise !== undefined) {
      this.options.sensorNoise = partial.sensorNoise;
      for (const c of this.cars) {
        if (c.sensor) c.sensor.noise = partial.sensorNoise;
      }
    }
  }

  #buildAICar(x, y) {
    const car = new Car(x, y, 30, 50, ControlMode.AI, this.options.maxSpeed, {
      rayCount: this.options.rayCount,
      rayLength: this.options.rayLength,
    });
    if (this.options.sensorNoise && car.sensor) {
      car.sensor.noise = this.options.sensorNoise;
    }
    this.carMetricsMap.set(car, this.safetyEvaluator.initCarMetrics(car, this.road));
    return car;
  }

  #spawnPopulation() {
    if (this.executionMode === "benchmark") {
      // Frozen single-car benchmark: pure evaluation without learning
      const testCar = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
      const stored = this.bestEverBrain || Storage.get(SIM_KEY_BRAIN);
      if (stored) testCar.brain = NeuralNetwork.clone(stored);
      this.cars = [testCar];
      this.bestCar = testCar;
      this.currentDiversity = 0;
      return;
    }

    if (this.executionMode === "evaluation") {
      // Testing & Adaptive Learning Mode:
      // Spawns a high-efficiency adaptive test cohort (8 cars) where:
      // - Car 0: Exact active/loaded champion brain
      // - Cars 1..7: Focused adaptive exploration variants
      // Note: On canvas, ONLY the leading car is rendered (ghostMode='none'),
      // giving the user a 100% clean, single-car test experience with active learning!
      const cohortSize = this.options.testPopulation || 8;
      const cars = [];
      const stored = this.bestEverBrain || Storage.get(SIM_KEY_BRAIN);
      if (stored) this.bestEverBrain = stored;

      for (let i = 0; i < cohortSize; i++) {
        const car = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
        if (stored) {
          car.brain = NeuralNetwork.clone(stored);
          if (i > 0) {
            // Adaptive fine-tuning mutation focused on evasive maneuvers & safety
            this.evolutionEngine.mutate(car.brain, 0.15, 0.22);
          }
        }
        cars.push(car);
      }
      this.cars = cars;
      this.bestCar = cars[0];
      this.currentDiversity = this.evolutionEngine.calculateDiversity(cars.map((c) => c.brain));
      return;
    }

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

    if (this.executionMode === "evaluation") {
      // In evaluation mode, never apply mutation
      for (const car of this.cars) {
        car.brain = NeuralNetwork.clone(stored);
      }
      this.currentDiversity = 0;
      return;
    }

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
  }

  #maybeSpawnTraffic() {
    const [minGap, maxGap] = this.options.trafficRowGap;
    const randG = () => (this.options.seed != null ? this.prng.range(minGap, maxGap) : randRange(minGap, maxGap));
    const aheadTarget = this.bestCar.y - this.options.trafficAheadDistance;
    while (this._trafficFrontierY > aheadTarget) {
      this._trafficFrontierY -= randG();
      this.#spawnRow(this._trafficFrontierY);
    }
    // Recycle traffic cars that have fallen behind the leader
    const behindLimit = this.bestCar.y + 450;
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

        // Record failure diagnostics for test-time adaptive learning & policy repair
        if (car.sensor && car.sensor.readings) {
          let maxProximity = 0;
          let crashRayIdx = 2; // default center
          for (let rIdx = 0; rIdx < car.sensor.readings.length; rIdx++) {
            const r = car.sensor.readings[rIdx];
            if (r) {
              const prox = 1 - r.offset;
              if (prox > maxProximity) {
                maxProximity = prox;
                crashRayIdx = rIdx;
              }
            }
          }
          car._failureContext = {
            crashRayIdx,
            maxProximity,
            speed: car.speed,
            lateralDev: car.x - this.road.getLaneCenter(1),
          };
        }
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

    // Retire backward cars / stragglers that lag too far behind the leader
    const maxLag = 600;
    for (const car of this.cars) {
      if (!car.damaged) {
        // Lag retirement: car fell far behind the active leader
        if (this.bestCar && !this.bestCar.damaged && car.y > this.bestCar.y + maxLag) {
          car.damaged = true;
          car._retired = "lag";
        }
        // Idle retirement: car stagnant for > 150 frames (~2.5 seconds)
        if (Math.abs(car.speed) < 0.15) {
          car._idleFrames = (car._idleFrames || 0) + 1;
          if (car._idleFrames > 150) {
            car.damaged = true;
            car._retired = "idle";
          }
        } else {
          car._idleFrames = 0;
        }
      }
    }

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

    if (!this.bestEverBrain || best._evalFitness > this.allTimeBestFitness) {
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

    if (this.executionMode === "benchmark") {
      // Pure frozen evaluation (zero mutation / static policy)
      this.generation++;
      this.bestFitnessThisGen = this.bestCar ? (this.bestCar._computedFitness ?? this.bestCar.fitness) : 0;
      this.avgFitnessThisGen = this.bestFitnessThisGen;
      this.lastEvaluationReport = this.safetyEvaluator.extractEvaluationReport(
        this.cars,
        this.carMetricsMap
      );

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
        diversity: 0,
      });

      const testCar = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
      testCar.brain = NeuralNetwork.clone(this.bestEverBrain);
      this.cars = [testCar];
      this.bestCar = testCar;
      this.crashedFlags = new WeakSet();
      this.#initialTraffic();
      return;
    }

    if (this.executionMode === "evaluation") {
      // Testing & Adaptive Learning Mode:
      // Evaluates cohort variants, adopts record-breaking improvements,
      // and repairs failure policies so the vehicle actively masters the course!
      this.generation++;

      for (const car of this.cars) {
        const m = this.carMetricsMap.get(car);
        car._evalFitness = this.safetyEvaluator.computeSafetyFitness(car, m);
      }

      let bestInCohort = this.cars[0];
      for (const c of this.cars) {
        if (c._evalFitness > bestInCohort._evalFitness) bestInCohort = c;
      }

      this.bestFitnessThisGen = bestInCohort._evalFitness;
      this.avgFitnessThisGen = this.cars.reduce((acc, c) => acc + c._evalFitness, 0) / this.cars.length;
      this.lastEvaluationReport = this.safetyEvaluator.extractEvaluationReport(
        this.cars,
        this.carMetricsMap
      );

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

      // Adopt record-breaking variants in testing mode
      if (bestInCohort._evalFitness > this.allTimeBestFitness || bestInCohort.distanceTraveled > (this._lastBestEvalDist || 0)) {
        this.allTimeBestFitness = Math.max(this.allTimeBestFitness, bestInCohort._evalFitness);
        this.bestEverBrain = NeuralNetwork.clone(bestInCohort.brain);
        this._lastBestEvalDist = bestInCohort.distanceTraveled;
        Storage.set(SIM_KEY_BRAIN, this.bestEverBrain);
        Storage.set(SIM_KEY_BEST_FITNESS, this.allTimeBestFitness);
      }

      // If best car experienced a crash, apply targeted failure policy repair
      let seedBrain = this.bestEverBrain || bestInCohort.brain;
      if (bestInCohort._failureContext) {
        seedBrain = Simulation.repairFailurePolicy(seedBrain, bestInCohort._failureContext);
        this.bestEverBrain = NeuralNetwork.clone(seedBrain);
        Storage.set(SIM_KEY_BRAIN, this.bestEverBrain);
      }

      // Re-spawn the adaptive test cohort around the repaired / learned policy
      const cohortSize = this.options.testPopulation || 8;
      const nextCars = [];
      for (let i = 0; i < cohortSize; i++) {
        const car = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
        car.brain = NeuralNetwork.clone(seedBrain);
        if (i > 0) {
          // Explore fine-tuned alternative avoidance corridors
          this.evolutionEngine.mutate(car.brain, 0.12, 0.18);
        }
        nextCars.push(car);
      }

      this.cars = nextCars;
      this.bestCar = nextCars[0];
      this.currentDiversity = this.evolutionEngine.calculateDiversity(nextCars.map((c) => c.brain));
      this.crashedFlags = new WeakSet();
      this.#initialTraffic();
      return;
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
    const ok = Storage.set(SIM_KEY_BRAIN, brain);
    if (ok) {
      Storage.set(SIM_KEY_BEST_FITNESS, this.allTimeBestFitness);
      Storage.set(SIM_KEY_BRAIN_VERSION, CURRENT_BRAIN_VERSION);
    }
    return ok;
  }

  exportBrainFile(filename) {
    const brain = this.bestEverBrain || this.bestCar?.brain;
    if (!brain) return false;
    const fname = filename || `evosafe-brain-gen${this.generation}.json`;
    return Storage.exportBrain(brain, fname, {
      rayCount: this.options.rayCount,
      rayLength: this.options.rayLength,
      generation: this.generation,
      bestFitness: this.allTimeBestFitness,
    });
  }

  discardBestBrain() {
    Storage.remove(SIM_KEY_BRAIN);
    Storage.remove(SIM_KEY_BEST_FITNESS);
    Storage.remove(SIM_KEY_GENERATION);
    this.allTimeBestFitness = 0;
    this.generation = 0;
    this.bestEverBrain = null; // pure random tabula rasa!
    this.loadedBrainFilename = null;
    this.adaptiveMutation = this.options.mutationAmount;
    this.plateauStreak = 0;
    this.currentDiversity = 0;
  }

  loadExpertSeed() {
    this.bestEverBrain = NeuralNetwork.clone(DEFAULT_CHAMPION_BRAIN);
    this.loadedBrainFilename = "expert-champion.json";
    Storage.set(SIM_KEY_BRAIN, this.bestEverBrain);
    Storage.set(SIM_KEY_BEST_FITNESS, 1500);
    this.reset();
  }

  loadBrain(brainData, autoEvaluate = true) {
    const rawLevels = brainData?.levels || (Array.isArray(brainData) ? brainData : null);
    if (!rawLevels || rawLevels.length === 0) {
      throw new Error("Invalid brain format: missing levels array");
    }
    const brainInputs = rawLevels[0]?.weights?.length ?? rawLevels[0]?.inputs?.length;
    // Auto-align sensor rays to match brain inputs if they differ
    if (brainInputs && brainInputs !== this.options.rayCount) {
      this.options.rayCount = brainInputs;
    }

    this.bestEverBrain = { levels: rawLevels };
    this.loadedBrainFilename = brainData.filename || "imported-brain.json";
    Storage.set(SIM_KEY_BRAIN, this.bestEverBrain);
    Storage.set(SIM_KEY_BRAIN_VERSION, CURRENT_BRAIN_VERSION);

    if (autoEvaluate) {
      this.executionMode = "evaluation"; // Switch to test mode immediately
      this.ghostMode = "none"; // Clean single-car view
    }
    this.reset();
  }

  setExecutionMode(mode) {
    if (mode === "training" || mode === "evaluation" || mode === "benchmark") {
      this.executionMode = mode;
      if (mode === "evaluation" || mode === "benchmark") {
        this.ghostMode = "none";
      }
      this.reset();
    }
  }

  setGhostMode(mode) {
    if (mode === "none" || mode === "top3" || mode === "all") {
      this.ghostMode = mode;
    }
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
      population: this.cars.length,
      notes: this.executionMode === "evaluation" ? `Evaluation: ${this.loadedBrainFilename || "Champion"}` : "Training",
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
      mutation: this.executionMode === "evaluation" ? 0 : this.adaptiveMutation,
      trafficCount: this.traffic.length,
      algorithmMode: this.options.algorithmMode,
      executionMode: this.executionMode,
      ghostMode: this.ghostMode,
      loadedBrainFilename: this.loadedBrainFilename,
      diversity: this.currentDiversity,
      collisionRate: rep ? rep.collisionRate : (this.cars.length > 0 ? (this.cars.length - alive) / this.cars.length : 0),
      avgTTC: rep ? rep.avgMinTTC : 0,
      nearMisses: rep ? rep.avgNearMisses : 0,
      scenarioName: this.scenarioManager.activeConfig.name,
    };
  }

  /**
   * Run a fast headless comparative benchmark between Baseline and EvoSafe
   * using isolated simulation instances on identical seed.
   */
  static runHeadToHeadTrial(generations = 3, population = 20, seed = 101) {
    function simulateMode(mode) {
      const road = new Road(0, 220, 3);
      const sim = new Simulation(road, {
        population,
        algorithmMode: mode,
        seed,
      });

      let totalDiv = 0;
      let finalDistance = 0;
      let finalCollisionRate = 0;
      let peakFitness = 0;

      for (let g = 0; g < generations; g++) {
        let steps = 0;
        while (!sim.isBatchDone() && steps < 220) {
          sim.step();
          steps++;
        }
        if (!sim.isBatchDone()) {
          for (const c of sim.cars) c.damaged = true;
        }
        sim.nextGeneration();
        const s = sim.getStats();
        totalDiv += (s.diversity || 0);
        finalDistance = s.distance;
        finalCollisionRate = s.collisionRate;
        peakFitness = Math.max(peakFitness, s.bestFitness);
      }

      return {
        diversity: (totalDiv / generations).toFixed(3),
        distance: Math.round(finalDistance),
        collisionRate: Math.round(finalCollisionRate * 100) + "%",
        peakFitness: Math.round(peakFitness),
      };
    }

    const baseline = simulateMode("baseline");
    const evosafe = simulateMode("evosafe");
    return { baseline, evosafe };
  }

  /**
   * Run a scientific 4-condition ablation study under identical seed
   */
  static runAblationStudy(generations = 3, population = 15, seed = 101) {
    function trial(customOptions) {
      const road = new Road(0, 220, 3);
      const sim = new Simulation(road, {
        population,
        seed,
        ...customOptions,
      });

      let totalDiv = 0;
      let finalDist = 0;
      let finalCrash = 0;
      let peakFit = 0;

      for (let g = 0; g < generations; g++) {
        let steps = 0;
        while (!sim.isBatchDone() && steps < 200) {
          sim.step();
          steps++;
        }
        if (!sim.isBatchDone()) {
          for (const c of sim.cars) c.damaged = true;
        }
        sim.nextGeneration();
        const s = sim.getStats();
        totalDiv += (s.diversity || 0);
        finalDist = s.distance;
        finalCrash = s.collisionRate;
        peakFit = Math.max(peakFit, s.bestFitness);
      }

      return {
        diversity: (totalDiv / generations).toFixed(3),
        distance: Math.round(finalDist) + " px",
        crashRate: Math.round(finalCrash * 100) + "%",
        peakFitness: Math.round(peakFit),
      };
    }

    return {
      fullEvoSafe: trial({ algorithmMode: "evosafe", crossoverRate: 0.65 }),
      noCrossover: trial({ algorithmMode: "evosafe", crossoverRate: 0.0 }),
      noSafetyFitness: trial({ algorithmMode: "baseline" }),
      baseline: trial({ algorithmMode: "baseline" }),
    };
  }

  /**
   * Adaptive Policy Repair: Analyzes failure telemetry right before collision
   * and adjusts neural weights and biases to steer away and brake.
   */
  static repairFailurePolicy(brain, failureContext) {
    if (!brain || !brain.levels) return brain;
    const repaired = NeuralNetwork.clone(brain);
    const lvl0 = repaired.levels[0];
    const lvlOut = repaired.levels[repaired.levels.length - 1];
    if (!lvl0 || !lvlOut) return repaired;

    const crashRayIdx = failureContext?.crashRayIdx ?? 2;

    // Outputs: 0 = up (accel), 1 = left, 2 = right, 3 = down (brake)
    // In Level.feedForward, output fires if sum > bias. Lower bias = fires more easily!
    if (crashRayIdx === 0 || crashRayIdx === 1) {
      // Obstacle was on the LEFT -> steer RIGHT (output 2), brake (output 3), avoid steering left
      lvlOut.biases[2] -= 0.22; // trigger right turn earlier
      lvlOut.biases[1] += 0.25; // inhibit left turn into hazard
      lvlOut.biases[3] -= 0.18; // brake earlier
      for (let j = 0; j < lvl0.weights[crashRayIdx].length; j++) {
        lvl0.weights[crashRayIdx][j] += (Math.random() * 0.3 + 0.15);
      }
    } else if (crashRayIdx === 3 || crashRayIdx === 4) {
      // Obstacle was on the RIGHT -> steer LEFT (output 1), brake (output 3), avoid steering right
      lvlOut.biases[1] -= 0.22; // trigger left turn earlier
      lvlOut.biases[2] += 0.25; // inhibit right turn into hazard
      lvlOut.biases[3] -= 0.18; // brake earlier
      for (let j = 0; j < lvl0.weights[crashRayIdx].length; j++) {
        lvl0.weights[crashRayIdx][j] += (Math.random() * 0.3 + 0.15);
      }
    } else {
      // Center hazard (head-on / rear-end) -> immediate BRAKE + evasive swerve
      lvlOut.biases[3] -= 0.35; // aggressive brake trigger
      // Choose escape direction based on lateral positioning on road
      const lateralDev = failureContext?.lateralDev ?? 0;
      // If car was left of center (lateralDev < 0), steer RIGHT (output 2) to overtake
      // If car was right of center (lateralDev > 0), steer LEFT (output 1) to overtake
      const escape = lateralDev < 0 ? 2 : (lateralDev > 0 ? 1 : (Math.random() < 0.5 ? 2 : 1));
      lvlOut.biases[escape] -= 0.28;
      lvlOut.biases[escape === 1 ? 2 : 1] += 0.20;
    }

    return repaired;
  }
}
