/**
 * EvoSafe Scenario Generator
 * Defines controlled, repeatable driving environments with fixed seeds and difficulty levels.
 */

const ScenarioType = Object.freeze({
  HIGHWAY_CRUISE: "highway_cruise",
  HEAVY_COMMUTE: "heavy_commute",
  CHICANE_OBSTACLES: "chicane_obstacles",
  FOG_LOW_VISIBILITY: "fog_low_visibility",
});

class ScenarioManager {
  constructor(options = {}) {
    this.currentScenarioId = options.scenarioId || ScenarioType.HIGHWAY_CRUISE;
    this.seed = options.seed ?? 1001;
    this.prng = new PRNG(this.seed);
  }

  static getDefinitions() {
    return {
      [ScenarioType.HIGHWAY_CRUISE]: {
        id: ScenarioType.HIGHWAY_CRUISE,
        name: "Highway Cruise (Standard)",
        description: "Consistent 3-lane highway with moderate traffic density. Evaluates baseline cruising speed and overtaking.",
        trafficRowGap: [180, 250],
        maxBlockedLanes: 1,
        emptyRowChance: 0.1,
        rayLength: 180,
        rayCount: 5,
        speedMultiplier: 1.0,
      },
      [ScenarioType.HEAVY_COMMUTE]: {
        id: ScenarioType.HEAVY_COMMUTE,
        name: "Heavy Commute (Dense)",
        description: "Dense rush-hour traffic with tight row spacing and frequent double-lane blockades.",
        trafficRowGap: [120, 170],
        maxBlockedLanes: 2,
        emptyRowChance: 0.0,
        rayLength: 180,
        rayCount: 5,
        speedMultiplier: 1.0,
      },
      [ScenarioType.CHICANE_OBSTACLES]: {
        id: ScenarioType.CHICANE_OBSTACLES,
        name: "Chicane Slalom",
        description: "Alternating outer lane obstacles requiring continuous rhythmic lateral lane changes.",
        trafficRowGap: [140, 190],
        maxBlockedLanes: 1,
        emptyRowChance: 0.05,
        isChicane: true,
        rayLength: 180,
        rayCount: 5,
        speedMultiplier: 1.0,
      },
      [ScenarioType.FOG_LOW_VISIBILITY]: {
        id: ScenarioType.FOG_LOW_VISIBILITY,
        name: "Fog / Low Visibility",
        description: "Reduced sensor perception distance (110px). Tests immediate hazard reaction and safety margin.",
        trafficRowGap: [170, 230],
        maxBlockedLanes: 1,
        emptyRowChance: 0.05,
        rayLength: 110,
        rayCount: 5,
        speedMultiplier: 0.9,
      },
    };
  }

  get activeConfig() {
    const defs = ScenarioManager.getDefinitions();
    return defs[this.currentScenarioId] || defs[ScenarioType.HIGHWAY_CRUISE];
  }

  setScenario(scenarioId, seed = null) {
    this.currentScenarioId = scenarioId;
    if (seed != null) {
      this.seed = seed;
    }
    this.prng.setSeed(this.seed);
  }

  /**
   * Resets PRNG state to start of scenario
   */
  resetPRNG() {
    this.prng.setSeed(this.seed);
  }

  /**
   * Deterministically generate traffic cars for a given road and vertical boundary
   */
  generateTraffic(road, startY, count = 25) {
    this.resetPRNG();
    const config = this.activeConfig;
    const traffic = [];
    const [minGap, maxGap] = config.trafficRowGap;

    let y = startY - 180;
    let lastChicaneLane = 0;

    for (let row = 0; row < count; row++) {
      let blockedLanes = [];

      if (config.isChicane) {
        // Alternate between left and right lanes
        lastChicaneLane = lastChicaneLane === 0 ? road.laneCount - 1 : 0;
        blockedLanes = [lastChicaneLane];
      } else {
        // Standard or dense sampling
        const r = this.prng.random();
        let numBlocked = 1;
        if (r < config.emptyRowChance) {
          numBlocked = 0;
        } else if (config.maxBlockedLanes > 1 && r > 0.6) {
          numBlocked = 2;
        }

        if (numBlocked > 0) {
          const lanes = Array.from({ length: road.laneCount }, (_, i) => i);
          this.prng.shuffle(lanes);
          blockedLanes = lanes.slice(0, Math.min(numBlocked, road.laneCount - 1));
        }
      }

      for (const lane of blockedLanes) {
        const laneX = road.getLaneCenter(lane);
        const speed = this.prng.range(1.6, 3.2);
        traffic.push(new Car(laneX, y, 30, 50, ControlMode.DUMMY, speed));
      }

      y -= this.prng.range(minGap, maxGap);
    }

    return traffic;
  }
}
