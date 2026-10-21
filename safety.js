/**
 * EvoSafe Safety Evaluation Module
 * Computes safety-oriented telemetry, observable safety metrics,
 * and composite multi-objective fitness scores for autonomous driving.
 */

class SafetyEvaluator {
  constructor(options = {}) {
    this.options = {
      // Metric weights for composite fitness
      weightProgress: 1.0,
      weightSpeed: 3.0,
      weightCollision: 120.0,
      weightNearMiss: 5.0,
      weightLaneCentering: 0.15,
      weightIdle: 0.2,

      // Safety thresholds
      nearMissThreshold: 0.2, // Sensor reading offset > 0.8 (i.e. distance < 20% of rayLength)
      minSafeDistance: 50, // pixels
      stagnationVelocity: 0.2, // considered idling if speed below this

      ...options,
    };
  }

  setOptions(partial) {
    Object.assign(this.options, partial);
  }

  /**
   * Initialize per-car safety tracking state
   */
  initCarMetrics(car, road) {
    return {
      distanceTraveled: 0,
      topSpeed: 0,
      speedSum: 0,
      framesAlive: 0,
      idleFrames: 0,
      nearMissCount: 0,
      laneOffsetSum: 0,
      minObservedDistance: Infinity,
      minObservedTTC: Infinity, // Time To Collision in seconds
      crashed: false,
      crashType: null, // 'traffic' | 'border' | null
      boundaryDepartureCount: 0,
    };
  }

  /**
   * Per-frame telemetry update for an active car
   */
  updateCarMetrics(metrics, car, road, traffic) {
    if (car.damaged) {
      metrics.crashed = true;
      return;
    }

    metrics.framesAlive++;
    metrics.topSpeed = Math.max(metrics.topSpeed, car.speed);
    metrics.speedSum += Math.max(0, car.speed);

    // Stagnation / Idling check
    if (car.speed < this.options.stagnationVelocity) {
      metrics.idleFrames++;
    }

    // Lane centering error: distance to nearest lane center
    let minLaneDist = Infinity;
    for (let i = 0; i < road.laneCount; i++) {
      const center = road.getLaneCenter(i);
      const dist = Math.abs(car.x - center);
      if (dist < minLaneDist) minLaneDist = dist;
    }
    metrics.laneOffsetSum += minLaneDist;

    // Road boundary proximity / departure
    if (car.x - car.width / 2 < road.left + 5 || car.x + car.width / 2 > road.right - 5) {
      metrics.boundaryDepartureCount++;
    }

    // Sensor-based near-miss detection & following distance
    if (car.sensor && car.sensor.readings) {
      for (const reading of car.sensor.readings) {
        if (reading != null) {
          // Reading offset: 0 is at ray tip, 1 is at car origin
          // Actual distance in pixels: (1 - reading.offset) * rayLength
          const distPx = (1 - reading.offset) * car.sensor.rayLength;
          if (distPx < metrics.minObservedDistance) {
            metrics.minObservedDistance = distPx;
          }

          // Near-miss trigger
          if (reading.offset > (1 - this.options.nearMissThreshold)) {
            metrics.nearMissCount++;
          }

          // Time To Collision (TTC) approximation
          const closingSpeed = Math.max(0.5, car.speed);
          const ttc = distPx / (closingSpeed * 60); // approx seconds at 60 fps
          if (ttc < metrics.minObservedTTC) {
            metrics.minObservedTTC = ttc;
          }
        }
      }
    }
  }

  /**
   * Compute baseline fitness score (original formula)
   */
  computeBaselineFitness(car) {
    const crashPenalty = car.damaged ? 50 : 0;
    return Math.max(0, car.distanceTraveled) + car.topSpeed * 5 - crashPenalty;
  }

  /**
   * Compute safety-aware composite fitness score
   */
  computeSafetyFitness(car, metrics) {
    const o = this.options;
    const progress = Math.max(0, car.distanceTraveled);
    const avgSpeed = metrics.framesAlive > 0 ? metrics.speedSum / metrics.framesAlive : 0;
    const avgLaneOffset = metrics.framesAlive > 0 ? metrics.laneOffsetSum / metrics.framesAlive : 0;

    const crashPenalty = (car.damaged || metrics.crashed) ? o.weightCollision : 0;
    const nearMissPenalty = metrics.nearMissCount * o.weightNearMiss;
    const laneOffsetPenalty = avgLaneOffset * o.weightLaneCentering;
    const idlePenalty = metrics.idleFrames * o.weightIdle;

    // Preserves relative ranking: cars traveling further and driving safer
    // maintain strictly higher fitness even during early learning generations.
    const rawFitness =
      progress * o.weightProgress +
      avgSpeed * o.weightSpeed -
      crashPenalty -
      nearMissPenalty -
      laneOffsetPenalty -
      idlePenalty;

    return rawFitness;
  }

  /**
   * Distinguish true evaluation performance metrics from optimization score
   */
  extractEvaluationReport(cars, metricsMap) {
    if (!cars || cars.length === 0) {
      return {
        totalCars: 0,
        collisionRate: 0,
        avgDistance: 0,
        maxDistance: 0,
        avgSpeed: 0,
        avgNearMisses: 0,
        avgMinTTC: 0,
        avgLaneCenteringError: 0,
      };
    }

    const n = cars.length;
    let collisions = 0;
    let totalDist = 0;
    let maxDist = 0;
    let totalSpeed = 0;
    let totalNearMisses = 0;
    let totalTTC = 0;
    let totalLaneErr = 0;

    for (const car of cars) {
      const m = metricsMap.get(car) || {};
      if (car.damaged || m.crashed) collisions++;
      totalDist += car.distanceTraveled;
      maxDist = Math.max(maxDist, car.distanceTraveled);
      totalSpeed += car.speed;
      totalNearMisses += m.nearMissCount || 0;
      totalTTC += Number.isFinite(m.minObservedTTC) ? m.minObservedTTC : 5.0;
      const avgLane = (m.framesAlive > 0) ? (m.laneOffsetSum / m.framesAlive) : 0;
      totalLaneErr += avgLane;
    }

    return {
      totalCars: n,
      collisionRate: collisions / n,
      avgDistance: totalDist / n,
      maxDistance: maxDist,
      avgSpeed: totalSpeed / n,
      avgNearMisses: totalNearMisses / n,
      avgMinTTC: totalTTC / n,
      avgLaneCenteringError: totalLaneErr / n,
    };
  }
}
