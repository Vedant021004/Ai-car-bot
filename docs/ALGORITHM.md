# EvoSafe Algorithm & Mathematical Formulations

## 1. Problem Formulation
Autonomous vehicle path navigation under dense obstacle fields is framed as a policy search problem optimized via neuroevolution. A policy $\pi_\theta(s)$ parameterized by neural network weights $\theta$ maps LiDAR sensor readings $s \in [0, 1]^K$ to discrete longitudinal and lateral actuator commands $a \in \{0, 1\}^4$.

---

## 2. Neural Network Topology & Activation

- **Topology:** Multi-Layer Perceptron (MLP) with layer structure $[K, H, M] = [5, 6, 4]$.
  - Input Layer ($K=5$): LiDAR distance sensors distributed across $\pi/2$ frontal arc.
  - Hidden Layer ($H=6$): Dense fully-connected layer with synaptic weights $W_1 \in \mathbb{R}^{5 \times 6}$ and biases $b_1 \in \mathbb{R}^6$.
  - Output Layer ($M=4$): Actuator commands corresponding to `[0: Up, 1: Left, 2: Right, 3: Down]`.
- **Activation Function:** Step Activation Function (Heaviside):
  $$y_i = \begin{cases} 1 & \text{if } \sum_{j} x_j W_{ji} > b_i \\ 0 & \text{otherwise} \end{cases}$$
  *Rationale:* Step activations generate discrete binary decision signals ideal for vehicle control states without requiring threshold tuning.

---

## 3. Evolutionary Optimization Operators

### A. Parent Selection: Tournament Selection
Rather than relying on single-champion elitism or fitness-proportional roulette selection (which can suffer from premature convergence or scaling issues with negative fitness values), EvoSafe utilizes **Tournament Selection**:
1. Randomly sample $k$ individuals (default $k=3$) from the population with replacement:
   $$\mathcal{T} = \{i_1, i_2, \dots, i_k\} \sim \mathcal{U}(1, N)$$
2. Select the candidate with the highest evaluated fitness:
   $$parent = \arg\max_{i \in \mathcal{T}} F(i)$$
*Advantage:* Selection pressure is tuned strictly by parameter $k$ independently of raw fitness scale.

### B. Crossover: Uniform & Arithmetic Operators
Sexual reproduction allows advantageous genetic traits discovered in disparate lineages to recombine.

1. **Uniform Crossover (Default):**
   For each synapse weight $W_{ij}$ and bias $b_i$:
   $$W_{ij}^{child} = \begin{cases} W_{ij}^{parentA} & \text{with probability } 0.5 \\ W_{ij}^{parentB} & \text{with probability } 0.5 \end{cases}$$

2. **Arithmetic Crossover:**
   $$W_{ij}^{child} = \alpha W_{ij}^{parentA} + (1 - \alpha) W_{ij}^{parentB}, \quad \alpha \sim \mathcal{U}(0, 1)$$

### C. Mutation Operator
Synaptic weights are perturbed via Gaussian exploration while strictly enforcing parameter bounds to prevent gradient explosion:
$$W_{ij}^{new} = \text{clamp}\left(W_{ij}^{old} + \mathcal{N}(0, \sigma^2), \ -2, \ 2\right)$$
where mutation rate $p_{mut} = 0.15$ and standard deviation $\sigma = 0.18$.

### D. Population Diversity Metric
To quantify and detect premature genetic convergence across generations, EvoSafe computes the mean pairwise Euclidean distance normalized by vector dimensionality:
$$\mathcal{D} = \frac{1}{\binom{S}{2}} \sum_{i=1}^{S-1} \sum_{j=i+1}^{S} \frac{\|\theta_i - \theta_j\|_2}{2\sqrt{D}}$$
where $S = \min(20, N)$ is a representative sample and $D = \sum |W| + |b|$ is total genome dimensionality.

---

## 4. Multi-Objective Safety Fitness Formulation

### Baseline Fitness (Original Implementation)
$$F_{baseline} = \max(0, d_{traveled}) + 5 \cdot v_{top} - 50 \cdot \mathbb{I}_{damaged}$$
*Limitations:* Heavily rewards forward speed; treats collision as a negligible one-time fixed penalty $(-50)$ regardless of following distance or near-misses.

### EvoSafe Safety-Aware Composite Fitness
$$F_{safe} = w_d \cdot d_{progress} + w_v \cdot \bar{v} - w_c \cdot \mathbb{I}_{crash} - w_{near} \cdot N_{near} - w_{lane} \cdot \bar{E}_{lane} - w_{idle} \cdot T_{idle}$$

Where:
- $d_{progress} = \max(0, y_{start} - y)$: Total distance traveled forward.
- $\bar{v} = \frac{1}{T} \sum_{t=1}^T v_t$: Mean vehicle velocity.
- $\mathbb{I}_{crash} \in \{0, 1\}$: Severe collision indicator ($w_c = 120.0$).
- $N_{near}$: Frequency of sensor proximity warnings within critical boundary ($d_{sensor} < 0.2 \cdot L_{ray}$).
- $\bar{E}_{lane} = \frac{1}{T} \sum_{t=1}^T |x_t - x_{lane\_center}|$: Mean lateral deviation from lane centerlines ($w_{lane} = 0.15$).
- $T_{idle}$: Frame count where vehicle was stagnant ($v < 0.2$) to discourage stopping.
- $\text{Time-to-Collision (TTC)} \approx \frac{d_{obstacle}}{\max(0.5, v_{vehicle})}$ monitored as an empirical safety observable.
