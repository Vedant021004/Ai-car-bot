# EvoSafe — Safety-Aware Neuroevolution for Autonomous Driving
### College Capstone Research Suite · Multi-Objective Evolutionary Optimization

[![Tests](https://img.shields.io/badge/Tests-19%2F19%20Passing-emerald?style=flat-square)](file:///d:/CAP/test/suite.js)
[![Diversity Impact](https://img.shields.io/badge/Genetic%20Diversity-+420%25-blue?style=flat-square)](file:///d:/CAP/docs/EXPERIMENTS.md)
[![Pure Vanilla JS](https://img.shields.io/badge/Tech-Vanilla%20JS%20%7C%20Canvas%202D-amber?style=flat-square)](file:///d:/CAP/index.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](file:///d:/CAP/LICENSE)

EvoSafe transforms baseline self-driving car simulations into a research-oriented neuroevolution laboratory. It introduces multi-parent **Tournament Selection**, **Uniform Crossover**, **Multi-Objective Safety Fitness**, **Deterministic Scenario Benchmarking**, and **Genetic Diversity Tracking** to study collision avoidance and trajectory planning in autonomous vehicles.

---

## 🚗 Key Technical Contributions

1. **Multi-Parent Genetic Algorithm Engine:**
   - Replaces naive $(1+\lambda)$ single-champion hill climbing with **Tournament Selection** ($k \in [2, 7]$) and **Uniform/Arithmetic Crossover**.
   - Maintains sustained genetic diversity ($\mathcal{D} = 0.3785$ vs. $0.0727$ in baseline), combating premature convergence.
2. **Safety-Aware Multi-Objective Fitness:**
   - Incorporates forward distance, velocity smoothness, Time-to-Collision (TTC), near-miss frequency, and lane-centering error into optimization criteria.
3. **ADAS Level 2 Telemetry & Neural Actuator Cockpit:**
   - Live **Forward Collision Warning (FCW)**, **Lane Departure Warning (LDW)**, and real-time neural actuator state monitors (`[ACCEL]`, `[STEER L]`, `[STEER R]`, `[BRAKE]`).
4. **Repeatable Scenario Generator:**
   - Deterministic PRNG seeding (Mulberry32) for reproducible evaluation across difficulty presets: *Highway Cruise*, *Heavy Commute*, *Chicane Slalom*, and *Fog/Low Visibility*.
5. **Interactive Academic Capstone Defense Suite (`🎓`):**
   - Built-in university jury evaluation modal featuring problem formulation, empirical benchmark scorecards, ablation analysis, examiner viva questions, and printable reports.
6. **Live In-Browser Head-to-Head Jury Benchmark:**
   - 1-click comparative benchmarking between Baseline and EvoSafe executing directly in the client under identical PRNG seeds with zero terminal dependency.
7. **Standalone Model Evaluation & Transfer:**
   - Rich JSON export/import of trained champion brains with automatic parameter alignment and zero-mutation deterministic testing.
8. **Zero-Dependency Automated Test Harness:**
   - Complete 19-test suite and headless benchmark runner executing in standard Node.js without external frameworks.

---

## 📊 Empirical Benchmark Results

Measured across 3 independent random seeds (101, 202, 303) over identical traffic environments:

| Metric | Baseline Mode (Original GA) | EvoSafe Mode (Proposed) | Improvement |
| :--- | :--- | :--- | :--- |
| **Genetic Diversity ($\mathcal{D}$)** | $0.0727 \pm 0.0006$ | **$0.3785 \pm 0.0023$** | **+420% Diversity (Prevents Stagnation)** |
| **Optimization Strategy** | $(1+\lambda)$ Hill Climber | Tournament + Crossover + Multi-Elite | Multi-lineage exploration |
| **Fitness Formulation** | Naive Distance + Speed | Multi-Objective Safety Penalties | Explicit collision & lane penalties |
| **Reproducibility** | Non-deterministic | Seeded PRNG (Mulberry32) | 100% Deterministic |

---

## ⚡ Quick Start

### 1. Run Automated Unit & Regression Tests
```bash
npm test
```
*Executes all 19 unit and regression tests verifying neural network shapes, crossover mechanics, elitism, collision geometry, and simulation lifecycles.*

### 2. Run Empirical Head-to-Head Benchmark
```bash
npm run bench
```
*Runs head-to-head trials of Baseline vs. EvoSafe across seeds 101, 202, 303 and computes statistical Mean $\pm$ Std Dev.*

### 3. Launch the Interactive Research Dashboard
```bash
npm start
```
*Starts the local server on `http://localhost:3000`. Open in any modern web browser.*

---

## 🕹️ Controls & Hotkeys

| Key | Action | Key | Action |
| :--- | :--- | :--- | :--- |
| **`P`** | Pause / Resume simulation | **`1 / 2 / 3 / 4`** | Speed multipliers (1× / 2× / 5× / 10×) |
| **`R`** | Reset simulation and charts | **`M`** | Toggle Manual Driving Mode |
| **`S`** | Save current champion brain | **`T`** | Toggle Dark Graphite / Light Theme |
| **`D`** | Discard saved brain | **`F`** | Toggle Fullscreen |
| **`C`** | Open Capstone Defense & Viva Modal | **`?`** | Open Help & Research Guide Modal |
| **`WASD / Arrows`** | Drive vehicle in manual mode | **`Esc`** | Close open modals |

---

## 🎓 College Capstone Viva Defense Guide

### Q1: What is the primary problem with the baseline self-driving car simulation?
> **Answer:** The baseline uses a $(1+\lambda)$ evolutionary strategy where a single best car is cloned across the entire population and slightly mutated. This leads to severe premature convergence (diversity collapses to $\sim 0.072$), meaning the population gets trapped in local minima. Additionally, its fitness function solely rewards forward progress and speed, encouraging risky driving behaviors without penalizing near-misses or tailgating.

### Q2: How does EvoSafe solve premature convergence?
> **Answer:** EvoSafe implements **Tournament Selection** ($k=3$) and **Uniform Synaptic Crossover** ($p_c = 0.65$), allowing advantageous sub-behaviors (such as left-lane overtaking and right-lane deceleration) discovered by different lineages to recombine. As empirically proven in our benchmarks, EvoSafe sustains a genetic diversity of $\sim 0.378$ (a $5.2\times$ increase), maintaining healthy exploration throughout training.

### Q3: How is safety mathematically quantified in EvoSafe?
> **Answer:** We formulate a composite multi-objective fitness function:
> $$F_{safe} = w_d d_{progress} + w_v \bar{v} - w_c \mathbb{I}_{crash} - w_{near} N_{near} - w_{lane} \bar{E}_{lane} - w_{idle} T_{idle}$$
> where $N_{near}$ captures LiDAR proximity alarms ($d < 0.2 \cdot L_{ray}$), $\bar{E}_{lane}$ measures lateral deviation from lane centers, and $w_c = 120$ heavily penalizes collisions while preserving relative ranking gradients.

### Q4: Why use a Step Activation Function instead of Tanh or ReLU?
> **Answer:** Step activation ($output = \sum w_i x_i > bias \ ? \ 1 : 0$) produces crisp, discrete binary actuator decisions (`[Up, Left, Right, Down]`). While non-differentiable (making it unsuitable for backpropagation), it is well-suited for genetic algorithms and derivative-free neuroevolution.

---

## 🔬 Project Documentation
- [System Architecture](file:///d:/CAP/docs/ARCHITECTURE.md)
- [Algorithm & Mathematics](file:///d:/CAP/docs/ALGORITHM.md)
- [Empirical Experiments & Data](file:///d:/CAP/docs/EXPERIMENTS.md)

---

## ⚠️ Known Limitations & Future Work
- **Perception Constraints:** The current LiDAR raycasting model uses 2D planar line intersections. Future extensions could introduce 3D raytracing or bird's-eye occupancy grids.
- **Dynamic Speed Modulation:** Vehicle speed is discrete step-based. Incorporating continuous torque and steering angle outputs via PPO or NEAT would provide smoother cornering trajectories.

---

## 📄 License
MIT License · Built for academic research and college capstone demonstration.
