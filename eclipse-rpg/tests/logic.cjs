// Deterministic simulation checks, without a browser or third-party dependency.
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const elements = new Map(),
  storage = new Map();
function element(id) {
  if (!elements.has(id))
    elements.set(id, {
      style: {},
      hidden: false,
      textContent: "",
      innerHTML: "",
      listeners: {},
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
      getContext() {
        return { setTransform() {} };
      },
      getBoundingClientRect() {
        return {
          left: 15,
          top: 688,
          width: 126,
          height: 126,
          right: 141,
          bottom: 814,
        };
      },
      focus() {},
      replaceChildren() {},
      appendChild() {},
      append() {},
      setPointerCapture() {},
    });
  return elements.get(id);
}
const sandbox = {
  console,
  Math,
  Date,
  JSON,
  Number,
  performance: { now: () => 1000 },
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  confirm: () => true,
  requestAnimationFrame: () => {},
  setInterval: () => {},
  addEventListener: () => {},
  URL,
  location: { href: "http://localhost/eclipse-rpg/" },
  fetch: async () => ({ ok: true, json: async () => ({ version: 16 }) }),
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  },
  document: {
    hidden: false,
    getElementById: element,
    createElement: element,
    addEventListener: () => {},
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../game.js"), "utf8"),
  sandbox,
);
// Share behavior assertions with the full browser suite.
const verifyGame = require("./scenarios.cjs");
const results = vm.runInContext("(" + verifyGame.toString() + ")()", sandbox);
console.log(results.map((x) => "PASS " + x).join("\n"));
