const SIM_KEY_BRAIN = "selfDrivingCar.bestBrain";
const SIM_KEY_BEST_FITNESS = "selfDrivingCar.bestFitness";
const SIM_KEY_GENERATION = "selfDrivingCar.generation";
const SIM_KEY_BRAIN_VERSION = "selfDrivingCar.brainVersion";

// Bump this whenever the network architecture or activation function changes
// in a way that makes old saved brains incompatible / dead.
const CURRENT_BRAIN_VERSION = 2;

class Simulation {
  constructor(road, options = {}) {
    this.road = road;
    this.options = {
      population: 100,
      mutationAmount: 0.18,
      rayCount: 5,
      rayLength: 180,
      maxSpeed: 5,

      // Traffic spawner — continuous & dense
      trafficAheadDistance: 3500, // keep this many px of traffic ahead of leader
      trafficBehindDistance: 1500, // recycle traffic this far behind leader
      trafficRowGap: [160, 230], // [min, max] vertical px between rows (denser)
      trafficStartGap: 180, // gap from start before first row of traffic
      trafficEmptyRowChance: 0.0, // 0 = every row has at least 1 blocked lane

      ...options,
    };

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
    this.bestEverBrain = Storage.get(SIM_KEY_BRAIN, null);
    this._zeroFitnessGens = 0;
    this.bestFitnessThisGen = 0;
    this.avgFitnessThisGen = 0;
    this.plateauStreak = 0;
    this.adaptiveMutation = this.options.mutationAmount;

    this.cars = [];
    this.bestCar = null;
    this.traffic = [];
    this.particles = new ParticleSystem();
    this.crashedFlags = new WeakSet();
    this._trafficFrontierY = 0; // furthest-ahead y where traffic exists
    this.startY = 600;

    this.#spawnPopulation();
    this.#initialTraffic();
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
  }

  #buildAICar(x, y) {
    return new Car(x, y, 30, 50, ControlMode.AI, this.options.maxSpeed, {
      rayCount: this.options.rayCount,
      rayLength: this.options.rayLength,
    });
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
    for (let i = 0; i < this.cars.length; i++) {
      this.cars[i].brain = NeuralNetwork.clone(stored);
      if (i !== 0) NeuralNetwork.mutate(this.cars[i].brain, this.adaptiveMutation);
    }
  }

  // --- Traffic --------------------------------------------------------------
  // Pick which lanes to occupy in a single row, with these guarantees:
  //   1. At least one lane is always clear (`maxBlocked = lanes - 1`)
  //   2. The new clear lane is the previous one or adjacent, so the AI always
  //      has a reachable path between consecutive rows.
  #pickRowBlockedLanes() {
    const lanes = this.road.laneCount;
    const maxBlocked = Math.min(lanes - 1, 2);
    const emptyChance = this.options.trafficEmptyRowChance ?? 0;
    const r = Math.random();
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
    const clearLane = candidates[Math.floor(Math.random() * candidates.length)];
    this._prevClearLane = clearLane;

    const blockable = allLanes.filter((l) => l !== clearLane);
    for (let i = blockable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
      this.traffic.push(
        new Car(
          laneX,
          y,
          30,
          50,
          ControlMode.DUMMY,
          randRange(1.5, 3.5)
        )
      );
    }
  }

  #initialTraffic() {
    this.traffic = [];
    this._prevClearLane = 1;
    const [minGap, maxGap] = this.options.trafficRowGap;
    // Forward (ahead of start): dense rows from just ahead to far ahead.
    const startSpawn = this.startY - this.options.trafficStartGap;
    let y = startSpawn;
    while (y > startSpawn - this.options.trafficAheadDistance) {
      this.#spawnRow(y);
      y -= randRange(minGap, maxGap);
    }
    this._trafficFrontierY = y;

    // Backward (behind start): sparse traffic so cars that drift back still
    // see obstacles. Skip the spawn area immediately behind cars.
    let yb = this.startY + 350;
    const behindLimit = this.startY + this.options.trafficBehindDistance;
    while (yb < behindLimit) {
      this.#spawnRow(yb);
      yb += randRange(minGap, maxGap);
    }
  }

  // Continuously top up traffic ahead of the leader and recycle traffic that
  // has fallen far behind. This is what makes red-car generation feel infinite.
  #maybeSpawnTraffic() {
    const [minGap, maxGap] = this.options.trafficRowGap;
    const aheadTarget = this.bestCar.y - this.options.trafficAheadDistance;
    while (this._trafficFrontierY > aheadTarget) {
      this._trafficFrontierY -= randRange(minGap, maxGap);
      this.#spawnRow(this._trafficFrontierY);
    }
    const behindLimit = this.bestCar.y + this.options.trafficBehindDistance;
    if (this.traffic.length > 0) {
      this.traffic = this.traffic.filter((t) => t.y < behindLimit);
    }
  }

  // --- Step -----------------------------------------------------------------
  step() {
    // Update traffic (each traffic car sees the others so rear-enders are
    // detected and the loser can be culled instead of stacking visually).
    for (let i = 0; i < this.traffic.length; i++) {
      const t = this.traffic[i];
      const others = this.traffic.length > 1
        ? this.traffic.filter((x, j) => j !== i)
        : [];
      t.update(this.road.borders, others);
    }
    // Cull damaged traffic (rear-ends) so they don't pile up forever.
    this.traffic = this.traffic.filter((t) => !t.damaged);

    // Update AI cars
    for (const car of this.cars) {
      const wasDamaged = car.damaged;
      car.update(this.road.borders, this.traffic);
      if (!wasDamaged && car.damaged && !this.crashedFlags.has(car)) {
        this.crashedFlags.add(car);
        this.particles.burst(car.x, car.y, 14, "#ff7676");
      }
    }

    // Pick best (alive cars first, then by fitness)
    let best = this.cars[0];
    for (let i = 1; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.damaged && !best.damaged) continue;
      if (!c.damaged && best.damaged) {
        best = c;
        continue;
      }
      if (c.fitness > best.fitness) best = c;
    }
    this.bestCar = best;

    this.particles.update();
    this.#maybeSpawnTraffic();
  }

  isBatchDone() {
    return this.cars.every((c) => c.damaged);
  }

  nextGeneration() {
    let best = this.cars[0];
    let sum = 0;
    for (const c of this.cars) {
      sum += c.fitness;
      if (c.fitness > best.fitness) best = c;
    }
    this.bestFitnessThisGen = best.fitness;
    this.avgFitnessThisGen = sum / Math.max(1, this.cars.length);

    // Auto-recovery: if 5 generations in a row produce best fitness < 1,
    // the loaded brain is stuck (e.g. legacy / dead). Wipe and start fresh.
    if (best.fitness < 1) {
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

    if (best.fitness > this.allTimeBestFitness) {
      this.allTimeBestFitness = best.fitness;
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

    this.generation++;
    Storage.set(SIM_KEY_GENERATION, this.generation);

    const championBrain = this.bestEverBrain
      ? NeuralNetwork.clone(this.bestEverBrain)
      : NeuralNetwork.clone(best.brain);

    // Build the new generation in a local array, then swap atomically so the
    // draw loop never observes an empty / null-bestCar simulation.
    const nextCars = [];
    for (let i = 0; i < this.options.population; i++) {
      const car = this.#buildAICar(this.road.getLaneCenter(1), this.startY);
      car.brain = NeuralNetwork.clone(championBrain);
      if (i !== 0) NeuralNetwork.mutate(car.brain, this.adaptiveMutation);
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
  }

  loadBrain(brainData) {
    // Validate architecture matches current ray count, else the network would
    // emit NaN/0 outputs and every car would drive straight into walls.
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
  }

  getStats() {
    const alive = this.cars.filter((c) => !c.damaged).length;
    return {
      generation: this.generation,
      population: this.cars.length,
      alive,
      bestFitness: this.bestCar ? this.bestCar.fitness : 0,
      allTimeBest: this.allTimeBestFitness,
      distance: this.bestCar ? this.bestCar.distanceTraveled : 0,
      speed: this.bestCar ? this.bestCar.speed : 0,
      mutation: this.adaptiveMutation,
      trafficCount: this.traffic.length,
    };
  }
}
