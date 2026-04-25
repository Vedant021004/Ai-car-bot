const ControlMode = Object.freeze({
  AI: "AI",
  KEYS: "KEYS",
  DUMMY: "DUMMY",
});

// Module-level singleton: only the *currently active* KEYS car receives input.
// New KEYS cars register themselves via `Controls.setActive(controls)`.
// This prevents listener-leak bugs on every manual respawn.
const _Active = { ref: null };

function _isInputFocused() {
  const a = document.activeElement;
  return a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName);
}

function _onKeyEvent(event, pressed) {
  if (_isInputFocused()) return;
  const c = _Active.ref;
  if (!c) return;
  switch (event.key) {
    case "ArrowLeft":
    case "a":
    case "A":
      c.left = pressed;
      event.preventDefault();
      break;
    case "ArrowRight":
    case "d":
    case "D":
      c.right = pressed;
      event.preventDefault();
      break;
    case "ArrowUp":
    case "w":
    case "W":
      c.up = pressed;
      event.preventDefault();
      break;
    case "ArrowDown":
    case "s":
    case "S":
      c.down = pressed;
      event.preventDefault();
      break;
  }
}

document.addEventListener("keydown", (e) => _onKeyEvent(e, true));
document.addEventListener("keyup", (e) => _onKeyEvent(e, false));

// One-time D-pad binding: forward to whichever Controls is currently active.
function _bindDpadOnce() {
  const dpad = document.getElementById("dpad");
  if (!dpad || dpad._sdcBound) return;
  dpad._sdcBound = true;
  const buttons = dpad.querySelectorAll("button[data-dir]");
  buttons.forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => {
      e.preventDefault();
      if (_Active.ref) _Active.ref[dir] = true;
    };
    const release = (e) => {
      e.preventDefault();
      if (_Active.ref) _Active.ref[dir] = false;
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("pointercancel", release);
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _bindDpadOnce);
} else {
  _bindDpadOnce();
}

class Controls {
  constructor(mode) {
    this.mode = mode;
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;

    if (mode === ControlMode.KEYS) {
      // Become the sole receiver of keyboard / D-pad input.
      Controls.setActive(this);
    } else if (mode === ControlMode.DUMMY) {
      this.up = true;
    }
  }

  static setActive(controls) {
    _Active.ref = controls;
  }

  static clearActive(controls) {
    if (_Active.ref === controls) _Active.ref = null;
  }
}
