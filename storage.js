const Storage = {
  available: (() => {
    try {
      const k = "__probe__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })(),

  get(key, fallback = null) {
    if (!this.available) return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    if (!this.available) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    if (!this.available) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },

  exportBrain(brain, filename = "evosafe-champion-brain.json", metadata = {}) {
    const rawLevels = brain.levels || (Array.isArray(brain) ? brain : null);
    if (!rawLevels) {
      throw new Error("Cannot export brain: missing levels structure");
    }

    const payload = {
      format: "evosafe-brain",
      version: 2,
      exportedAt: new Date().toISOString(),
      rayCount: metadata.rayCount || (rawLevels[0]?.weights?.length ?? rawLevels[0]?.inputs?.length ?? 5),
      rayLength: metadata.rayLength || 180,
      generation: metadata.generation ?? 0,
      bestFitness: metadata.bestFitness ?? 0,
      levels: rawLevels,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },

  importBrainFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const levels = data.levels || (Array.isArray(data) ? data : null);
          if (!levels || !Array.isArray(levels) || levels.length === 0) {
            reject(new Error("Invalid brain JSON: missing levels array"));
            return;
          }

          // Validate level structure
          for (const lvl of levels) {
            if (!lvl.weights || !lvl.biases) {
              reject(new Error("Invalid brain JSON: level missing weights or biases"));
              return;
            }
          }

          const parsed = {
            format: data.format || "evosafe-brain",
            version: data.version || 2,
            rayCount: data.rayCount || levels[0].weights.length || 5,
            rayLength: data.rayLength || 180,
            generation: data.generation || 0,
            bestFitness: data.bestFitness || 0,
            levels,
            filename: file.name,
          };
          resolve(parsed);
        } catch (e) {
          reject(new Error("Failed to parse brain JSON: " + e.message));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },
};
