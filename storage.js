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

  exportBrain(brain, filename = "best-brain.json") {
    const blob = new Blob([JSON.stringify(brain, null, 2)], {
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
  },

  importBrainFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.levels || !Array.isArray(data.levels)) {
            reject(new Error("Invalid brain file: missing levels"));
            return;
          }
          resolve(data);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  },
};
