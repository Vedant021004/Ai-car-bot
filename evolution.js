/**
 * EvoSafe Evolution Engine
 * Advanced Genetic Algorithm module supporting:
 * - Tournament Selection, Roulette Wheel Selection, and Elitism
 * - Uniform & Arithmetic Crossover with topological validation
 * - Gaussian and Adaptive Mutation with NaN/Infinity defense
 * - Population Genetic Diversity tracking
 * - Strict toggle between Baseline (original (1+λ) hill climber) and EvoSafe modes
 */

class EvolutionEngine {
  constructor(options = {}) {
    this.options = {
      mode: "evosafe", // 'baseline' | 'evosafe'
      selectionMethod: "tournament", // 'tournament' | 'roulette' | 'rank'
      tournamentSize: 3,
      crossoverRate: 0.65,
      crossoverType: "uniform", // 'uniform' | 'arithmetic'
      mutationRate: 0.15, // probability per weight in EvoSafe mode
      mutationAmount: 0.18, // mutation strength (sigma or lerp factor)
      eliteCount: 2, // preserved champions
      diversityPreservation: true,
      ...options,
    };
    this.prng = options.prng || DefaultPRNG;
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
  }

  /**
   * Produce the next generation of neural network brains from an evaluated population.
   * @param {Array<Car>} cars - Evaluated cars from the previous generation
   * @param {number} targetPopulation - Target count for the new generation
   * @param {NeuralNetwork|null} allTimeBestBrain - Global best brain if available
   * @returns {{ brains: Array<NeuralNetwork>, diversity: number }}
   */
  evolve(cars, targetPopulation, allTimeBestBrain = null) {
    if (!cars || cars.length === 0) {
      throw new Error("Cannot evolve an empty population");
    }

    if (this.options.mode === "baseline") {
      return this.#evolveBaseline(cars, targetPopulation, allTimeBestBrain);
    }
    return this.#evolveEvoSafe(cars, targetPopulation, allTimeBestBrain);
  }

  /**
   * Original baseline evolution:
   * Car with max fitness is chosen.
   * Car[0] is an exact clone of the champion.
   * Cars[1..N-1] are mutated copies of that single champion.
   */
  #evolveBaseline(cars, targetPopulation, allTimeBestBrain) {
    let best = cars[0];
    for (let i = 1; i < cars.length; i++) {
      if (cars[i].fitness > best.fitness) {
        best = cars[i];
      }
    }

    const championBrain = allTimeBestBrain
      ? NeuralNetwork.clone(allTimeBestBrain)
      : NeuralNetwork.clone(best.brain);

    const nextBrains = [];
    for (let i = 0; i < targetPopulation; i++) {
      const brain = NeuralNetwork.clone(championBrain);
      if (i !== 0) {
        NeuralNetwork.mutate(brain, this.options.mutationAmount);
      }
      nextBrains.push(brain);
    }

    const diversity = this.calculateDiversity(nextBrains);
    return { brains: nextBrains, diversity, championBrain };
  }

  /**
   * EvoSafe multi-parent evolutionary algorithm:
   * 1. Rank & sort population by fitness.
   * 2. Preserve `eliteCount` elite champions unaltered.
   * 3. Select parents via Tournament or Roulette selection.
   * 4. Perform Crossover with probability `crossoverRate`.
   * 5. Apply Mutation with NaN/Inf protection.
   * 6. Compute genetic diversity.
   */
  #evolveEvoSafe(cars, targetPopulation, allTimeBestBrain) {
    // Sort descending by fitness
    const sorted = [...cars].sort((a, b) => b.fitness - a.fitness);
    const champion = sorted[0];

    const nextBrains = [];

    // 1. Elitism: preserve best validated individuals
    const eliteCount = Math.max(1, Math.min(this.options.eliteCount, targetPopulation));

    // Ensure all-time best is included if provided and superior
    if (allTimeBestBrain && (!champion || allTimeBestBrain.fitness > champion.fitness)) {
      nextBrains.push(NeuralNetwork.clone(allTimeBestBrain));
    } else if (champion && champion.brain) {
      nextBrains.push(NeuralNetwork.clone(champion.brain));
    }

    // Fill remaining elites from current generation
    let sortedIdx = 0;
    while (nextBrains.length < eliteCount && sortedIdx < sorted.length) {
      const candidate = sorted[sortedIdx].brain;
      if (candidate && !nextBrains.some((b) => this.#areGenomesIdentical(b, candidate))) {
        nextBrains.push(NeuralNetwork.clone(candidate));
      }
      sortedIdx++;
    }

    // 2. Offspring generation via Selection + Crossover + Mutation
    while (nextBrains.length < targetPopulation) {
      const parentA = this.#selectParent(sorted);
      let childBrain;

      if (this.prng.random() < this.options.crossoverRate) {
        const parentB = this.#selectParent(sorted);
        childBrain = this.crossover(parentA.brain, parentB.brain, this.options.crossoverType);
      } else {
        childBrain = NeuralNetwork.clone(parentA.brain);
      }

      // 3. Mutate child
      this.mutate(childBrain, this.options.mutationRate, this.options.mutationAmount);
      nextBrains.push(childBrain);
    }

    const diversity = this.calculateDiversity(nextBrains);
    return {
      brains: nextBrains,
      diversity,
      championBrain: NeuralNetwork.clone(champion.brain),
    };
  }

  /**
   * Select a parent using configured selection method
   */
  #selectParent(sortedCars) {
    if (sortedCars.length === 1) return sortedCars[0];

    if (this.options.selectionMethod === "roulette") {
      return this.#rouletteSelect(sortedCars);
    }
    // Default to Tournament Selection
    return this.#tournamentSelect(sortedCars, this.options.tournamentSize);
  }

  /**
   * Tournament Selection: sample k individuals at random, return the one with highest fitness.
   */
  #tournamentSelect(cars, k = 3) {
    const tournamentSize = Math.max(2, Math.min(k, cars.length));
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
      const idx = this.prng.rangeInt(0, cars.length - 1);
      const contender = cars[idx];
      if (!best || contender.fitness > best.fitness) {
        best = contender;
      }
    }
    return best || cars[0];
  }

  /**
   * Fitness-Proportional Roulette Selection with non-negative shift
   */
  #rouletteSelect(cars) {
    const minFit = Math.min(...cars.map((c) => c.fitness));
    const offset = minFit < 0 ? Math.abs(minFit) + 1 : 1;
    const adjusted = cars.map((c) => c.fitness + offset);
    const total = adjusted.reduce((acc, v) => acc + v, 0);

    let pick = this.prng.random() * total;
    for (let i = 0; i < cars.length; i++) {
      pick -= adjusted[i];
      if (pick <= 0) return cars[i];
    }
    return cars[0];
  }

  /**
   * Check topological compatibility between two parent networks
   */
  static areCompatible(netA, netB) {
    if (!netA || !netB || !netA.levels || !netB.levels) return false;
    if (netA.levels.length !== netB.levels.length) return false;
    for (let i = 0; i < netA.levels.length; i++) {
      const la = netA.levels[i];
      const lb = netB.levels[i];
      if (la.inputs.length !== lb.inputs.length) return false;
      if (la.outputs.length !== lb.outputs.length) return false;
      if (la.weights.length !== lb.weights.length) return false;
      if (la.biases.length !== lb.biases.length) return false;
    }
    return true;
  }

  /**
   * Perform genetic crossover (Uniform or Arithmetic)
   */
  crossover(parentA, parentB, type = "uniform") {
    if (!EvolutionEngine.areCompatible(parentA, parentB)) {
      return NeuralNetwork.clone(parentA);
    }

    const child = NeuralNetwork.clone(parentA);

    for (let l = 0; l < child.levels.length; l++) {
      const lChild = child.levels[l];
      const lB = parentB.levels[l];

      // Crossover biases
      for (let i = 0; i < lChild.biases.length; i++) {
        if (type === "arithmetic") {
          const alpha = this.prng.random();
          lChild.biases[i] = alpha * lChild.biases[i] + (1 - alpha) * lB.biases[i];
        } else {
          // Uniform
          if (this.prng.random() < 0.5) {
            lChild.biases[i] = lB.biases[i];
          }
        }
      }

      // Crossover weights
      for (let i = 0; i < lChild.weights.length; i++) {
        for (let j = 0; j < lChild.weights[i].length; j++) {
          if (type === "arithmetic") {
            const alpha = this.prng.random();
            lChild.weights[i][j] = alpha * lChild.weights[i][j] + (1 - alpha) * lB.weights[i][j];
          } else {
            // Uniform
            if (this.prng.random() < 0.5) {
              lChild.weights[i][j] = lB.weights[i][j];
            }
          }
        }
      }
    }

    return child;
  }

  /**
   * EvoSafe Mutation:
   * Mutates each gene with probability `mutationRate`, applying perturbation `mutationAmount`.
   * Defends against NaN, Infinity, and enforces parameter clamp in [-2, 2].
   */
  mutate(network, rate = 0.15, amount = 0.2) {
    network.levels.forEach((level) => {
      // Mutate biases
      for (let i = 0; i < level.biases.length; i++) {
        if (this.prng.random() < rate) {
          const delta = this.prng.gaussian(0, amount);
          let val = level.biases[i] + delta;
          if (!Number.isFinite(val)) val = this.prng.range(-1, 1);
          level.biases[i] = clamp(val, -2, 2);
        }
      }

      // Mutate weights
      for (let i = 0; i < level.weights.length; i++) {
        for (let j = 0; j < level.weights[i].length; j++) {
          if (this.prng.random() < rate) {
            const delta = this.prng.gaussian(0, amount);
            let val = level.weights[i][j] + delta;
            if (!Number.isFinite(val)) val = this.prng.range(-1, 1);
            level.weights[i][j] = clamp(val, -2, 2);
          }
        }
      }
    });
  }

  /**
   * Check if two networks have identical weights and biases
   */
  #areGenomesIdentical(netA, netB, epsilon = 1e-6) {
    if (!EvolutionEngine.areCompatible(netA, netB)) return false;
    for (let l = 0; l < netA.levels.length; l++) {
      const la = netA.levels[l];
      const lb = netB.levels[l];
      for (let i = 0; i < la.biases.length; i++) {
        if (Math.abs(la.biases[i] - lb.biases[i]) > epsilon) return false;
      }
      for (let i = 0; i < la.weights.length; i++) {
        for (let j = 0; j < la.weights[i].length; j++) {
          if (Math.abs(la.weights[i][j] - lb.weights[i][j]) > epsilon) return false;
        }
      }
    }
    return true;
  }

  /**
   * Calculate genetic diversity of a population (mean pairwise Euclidean parameter distance).
   * Range [0, 1] normalized.
   */
  calculateDiversity(brains, sampleLimit = 20) {
    if (!brains || brains.length <= 1) return 0;

    // Subsample if population is large to maintain 60 FPS
    const sample = brains.length > sampleLimit
      ? brains.slice(0, sampleLimit)
      : brains;

    const vectors = sample.map((b) => this.#flattenGenome(b));
    let totalDist = 0;
    let pairs = 0;

    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        totalDist += this.#euclideanDistance(vectors[i], vectors[j]);
        pairs++;
      }
    }

    if (pairs === 0) return 0;
    const avgDist = totalDist / pairs;
    // Normalize based on vector dimensionality (max expected distance ~ 2 * sqrt(D))
    const D = vectors[0].length;
    const maxExpected = 2 * Math.sqrt(D || 1);
    return Math.min(1, avgDist / maxExpected);
  }

  #flattenGenome(network) {
    const vector = [];
    if (!network || !network.levels) return vector;
    network.levels.forEach((l) => {
      for (let i = 0; i < l.biases.length; i++) vector.push(l.biases[i]);
      for (let i = 0; i < l.weights.length; i++) {
        for (let j = 0; j < l.weights[i].length; j++) {
          vector.push(l.weights[i][j]);
        }
      }
    });
    return vector;
  }

  #euclideanDistance(v1, v2) {
    let sum = 0;
    const len = Math.min(v1.length, v2.length);
    for (let i = 0; i < len; i++) {
      const d = v1[i] - v2[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
}
