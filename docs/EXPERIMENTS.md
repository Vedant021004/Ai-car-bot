# EvoSafe Empirical Experiments & Benchmarks

## 1. Experimental Methodology
To evaluate the optimization characteristics and robustness of EvoSafe compared to the original baseline hill-climbing implementation, head-to-head empirical trials were executed under strictly controlled, identical pseudorandom seeds using the Mulberry32 PRNG.

### Trial Parameters
- **Generations per Trial:** 4 generations
- **Population Size ($N$):** 40 vehicles
- **Scenario:** Highway Cruise (3 lanes, continuous dynamic traffic)
- **Controlled Seeds:** 101, 202, 303
- **Hardware/Runtime Environment:** Node.js v24.21.0 VM Sandbox & Chrome 2D Canvas runtime.

---

## 2. Empirical Benchmark Results

| Metric | Baseline (Original 1-Parent GA) | EvoSafe (Safety-Aware GA) | Relative Impact |
| :--- | :--- | :--- | :--- |
| **Genetic Diversity ($\mathcal{D}$)** | $0.0727 \pm 0.0006$ | **$0.3785 \pm 0.0023$** | **+420% higher diversity** (prevents premature convergence) |
| **Peak Evaluated Fitness** | $1128.10 \pm 0.00$ | $167.80 \pm 121.37$ | Penalized by collision & near-miss terms |
| **Parent Selection** | Single-parent cloning | Tournament Selection ($k=3$) | Multi-lineage recombination |
| **Crossover Operator** | None | Uniform Synaptic Crossover ($p_c = 0.65$) | Synergistic parameter blending |
| **Elitism** | 1 individual | Configurable (2 individuals) | Pareto/top-performer retention |

*Data Source: Generated deterministically via `npm run bench` and recorded in `test/benchmark-results.json`.*

---

## 3. Findings & Discussion

1. **Premature Convergence in Baseline:**
   - The baseline $(1+\lambda)$ algorithm clones a single individual across the entire population, mutating each copy slightly.
   - As observed empirically, population diversity immediately collapses to $\approx 0.072$. Once a champion falls into a local minimum, the entire generation is locked into the same trajectory, unable to explore orthogonal lane evasions.

2. **Diversity Preservation in EvoSafe:**
   - By combining Tournament Selection ($k=3$) with Uniform Crossover ($p_c = 0.65$), EvoSafe maintains a sustained genetic diversity of $0.3785 \pm 0.0023$ (a **5.2× increase** over baseline).
   - This prevents population homogeneity and preserves exploratory capability across multiple independent seeds.

3. **Fitness Dynamics & Safety Penalization:**
   - Baseline fitness simply maximizes forward distance + speed, masking unsafe driving behavior such as tailgating and clipping lane borders.
   - EvoSafe composite fitness explicitly deducts severe crash penalties ($-120$), near-miss frequency, and lane deviation, actively rewarding vehicles that maintain safe Time-to-Collision (TTC) margins.

---

## 4. How to Reproduce Benchmarks
To run the automated empirical test suite and head-to-head benchmark locally:

```bash
# 1. Run the zero-dependency regression test suite (19 unit/integration tests)
npm test

# 2. Run the statistical head-to-head benchmark across seeds 101, 202, 303
npm run bench

# 3. Launch the interactive visual research dashboard
npm start
# Navigate to http://localhost:3000 in your browser
```
