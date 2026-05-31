import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const canvas = document.querySelector("#bridgeCanvas");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPowerDevice = window.matchMedia("(max-width: 720px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: "low-power"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPowerDevice ? 0.85 : 1.1));
renderer.setClearColor(0x070a09, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
camera.position.set(0, 4.2, 16);

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.AmbientLight(0x8af2d4, 0.8);
scene.add(ambient);

const keyLight = new THREE.PointLight(0x9eff7a, 62, 42);
keyLight.position.set(-6, 5, 8);
scene.add(keyLight);

const cyanLight = new THREE.PointLight(0x53e3d4, 36, 38);
cyanLight.position.set(7, -3, 6);
scene.add(cyanLight);

const amberLight = new THREE.PointLight(0xf0b85a, 22, 28);
amberLight.position.set(0, 7, -5);
scene.add(amberLight);

const palette = {
  claude: 0xf0b85a,
  mcp: 0x9eff7a,
  browser: 0x53e3d4,
  gemini: 0x8ebcff,
  archive: 0xff6b5f
};

const nodes = [
  { key: "claude", label: "Claude", x: -6.8, y: 1.0, z: 0, size: 1.0, color: palette.claude },
  { key: "mcp", label: "MCP", x: -3.4, y: -0.5, z: -1, size: 1.05, color: palette.mcp },
  { key: "browser", label: "Browser", x: 0.2, y: 1.0, z: 0.7, size: 1.15, color: palette.browser },
  { key: "gemini", label: "Gemini", x: 3.9, y: -0.4, z: -0.8, size: 1.05, color: palette.gemini },
  { key: "archive", label: "Archive", x: 7.1, y: 1.0, z: 0.3, size: 1.0, color: palette.archive }
];

const nodeMeshes = new Map();
const labelSprites = new Map();
const particles = [];

function makeTextSprite(text, color) {
  const localCanvas = document.createElement("canvas");
  localCanvas.width = 384;
  localCanvas.height = 128;
  const ctx = localCanvas.getContext("2d");
  ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
  ctx.font = "700 42px Sora, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.fillText(text, localCanvas.width / 2, localCanvas.height / 2);
  const texture = new THREE.CanvasTexture(localCanvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 1.05, 1);
  return sprite;
}

function createNode(node) {
  const group = new THREE.Group();
  group.position.set(node.x, node.y, node.z);

  const coreGeometry = new THREE.IcosahedronGeometry(node.size, 1);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: node.color,
    roughness: 0.36,
    metalness: 0.45,
    emissive: node.color,
    emissiveIntensity: 0.12
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const ringGeometry = new THREE.TorusGeometry(node.size * 1.38, 0.018, 6, 48);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.62 });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2.4;
  group.add(ring);

  const label = makeTextSprite(node.label, "#f4f1e8");
  label.position.set(0, -1.75, 0);
  group.add(label);

  group.userData = { key: node.key, core, ring, baseY: node.y, speed: 0.7 + Math.random() * 0.5 };
  nodeMeshes.set(node.key, group);
  labelSprites.set(node.key, label);
  root.add(group);
}

nodes.forEach(createNode);

for (let i = 0; i < nodes.length - 1; i++) {
  const a = nodes[i];
  const b = nodes[i + 1];
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(a.x, a.y, a.z),
    new THREE.Vector3((a.x + b.x) / 2, a.y + 1.6, -2.2),
    new THREE.Vector3(b.x, b.y, b.z)
  ]);

  const tubeGeometry = new THREE.TubeGeometry(curve, 36, 0.022, 6, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0x4dd4c2, transparent: true, opacity: 0.32 });
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  root.add(tube);

  for (let j = 0; j < 2; j++) {
    const dotGeometry = new THREE.SphereGeometry(0.085, 8, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: j % 2 ? 0x9eff7a : 0x53e3d4 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    root.add(dot);
    particles.push({ dot, curve, offset: j / 4 + i * 0.11 });
  }
}

const grid = new THREE.GridHelper(30, 18, 0x19352f, 0x10221f);
grid.position.y = -3.2;
grid.material.transparent = true;
grid.material.opacity = 0.38;
root.add(grid);

const starGeometry = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < (lowPowerDevice ? 70 : 120); i++) {
  starPositions.push((Math.random() - 0.5) * 46, (Math.random() - 0.5) * 24, -8 - Math.random() * 18);
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xdfffe9, size: 0.035, transparent: true, opacity: 0.42 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

let isPaused = prefersReducedMotion || lowPowerDevice;
let activeKey = "claude";
let pointerTarget = { x: 0, y: 0 };
let isHeroVisible = true;
let documentHidden = document.hidden;
let frameId = 0;

function setActiveNode(key) {
  activeKey = key;
  for (const [nodeKey, group] of nodeMeshes) {
    const isActive = nodeKey === key;
    group.userData.core.material.emissiveIntensity = isActive ? 0.38 : 0.12;
    group.userData.ring.material.opacity = isActive ? 0.95 : 0.5;
    group.scale.setScalar(isActive ? 1.28 : 1);
  }
  requestRender();
}

setActiveNode(activeKey);

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  requestRender();
}

window.addEventListener("resize", resize);
resize();

window.addEventListener("pointermove", (event) => {
  pointerTarget.x = (event.clientX / window.innerWidth - 0.5) * 1.4;
  pointerTarget.y = (event.clientY / window.innerHeight - 0.5) * 0.8;
  if (isHeroVisible) requestRender();
});

const clock = new THREE.Clock();

function shouldAnimate() {
  return !isPaused && isHeroVisible && !documentHidden;
}

function renderFrame(animateScene) {
  const elapsed = clock.getElapsedTime();
  if (animateScene) {
    root.rotation.y += ((pointerTarget.x * 0.12) - root.rotation.y) * 0.025;
    root.rotation.x += ((-pointerTarget.y * 0.08) - root.rotation.x) * 0.025;
    stars.rotation.y = elapsed * 0.018;

    for (const [key, group] of nodeMeshes) {
      const activeBoost = key === activeKey ? 0.16 : 0;
      group.position.y = group.userData.baseY + Math.sin(elapsed * group.userData.speed) * (0.2 + activeBoost);
      group.userData.core.rotation.x += key === activeKey ? 0.012 : 0.007;
      group.userData.core.rotation.y += key === activeKey ? 0.016 : 0.009;
      group.userData.ring.rotation.z += key === activeKey ? 0.026 : 0.012;
    }

    for (const item of particles) {
      const t = (elapsed * 0.18 + item.offset) % 1;
      item.dot.position.copy(item.curve.getPointAt(t));
    }
  }

  renderer.render(scene, camera);
}

function tick() {
  frameId = 0;
  const animateScene = shouldAnimate();
  renderFrame(animateScene);
  if (animateScene) requestRender();
}

function requestRender() {
  if (!frameId) frameId = requestAnimationFrame(tick);
}

const hero = document.querySelector(".hero");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    isHeroVisible = entries.some((entry) => entry.isIntersecting);
    requestRender();
  }, { threshold: 0.04 });
  observer.observe(hero);
}

document.addEventListener("visibilitychange", () => {
  documentHidden = document.hidden;
  requestRender();
});

requestRender();

const stepData = {
  claude: {
    title: "Claude asks the bridge",
    node: "claude",
    copy: "Claude sees tools like gemini_prompt and gemini_create_image. It reads the guide first so it does not waste your Gemini runs."
  },
  mcp: {
    title: "MCP picks the mode",
    node: "mcp",
    copy: "The MCP server maps the request to chat, image, video, music, Canvas, Guided Learning, or file upload."
  },
  browser: {
    title: "Browser handles the UI",
    node: "browser",
    copy: "Chrome or Edge opens with a separate local profile. It can run offscreen so it does not jump in front of your work."
  },
  archive: {
    title: "Outputs are saved",
    node: "archive",
    copy: "Each run becomes a dated folder with prompt.txt, response.md, result.json, page.png, and media files when Gemini exposes them."
  }
};

const stageTitle = document.querySelector("#stageTitle");
const stageCopy = document.querySelector("#stageCopy");
const stageNodes = document.querySelectorAll(".stage-diagram .node");

document.querySelectorAll(".flow-step").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.step;
    const data = stepData[key];
    document.querySelectorAll(".flow-step").forEach((item) => item.classList.toggle("active", item === button));
    stageTitle.textContent = data.title;
    stageCopy.textContent = data.copy;
    stageNodes.forEach((node) => node.classList.toggle("active", node.dataset.node === data.node));
    setActiveNode(data.node);
    requestRender();
  });
});

const toolOutput = document.querySelector("#toolOutput");
document.querySelectorAll(".tool-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tool-chip").forEach((item) => item.classList.toggle("active", item === button));
    toolOutput.querySelector("strong").textContent = button.dataset.tool;
    toolOutput.querySelector("p").textContent = button.dataset.desc;
    setActiveNode(button.dataset.tool.includes("open_stuff") ? "archive" : button.dataset.tool.includes("upload") ? "browser" : "gemini");
    requestRender();
  });
});

const modeToTool = {
  chat: "gemini_prompt",
  image: "gemini_create_image",
  video: "gemini_create_video",
  music: "gemini_create_music"
};

let selectedMode = "chat";
const simPrompt = document.querySelector("#simPrompt");
const fakeOutput = document.querySelector("#fakeOutput");
const runButton = document.querySelector("#runSimulation");
const runHops = Array.from(document.querySelectorAll(".run-hop"));

document.querySelectorAll(".mode-pill").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    document.querySelectorAll(".mode-pill").forEach((item) => item.classList.toggle("active", item === button));
    fakeOutput.querySelector("span").textContent = "mode picked";
    fakeOutput.querySelector("strong").textContent = modeToTool[selectedMode];
    fakeOutput.querySelector("p").textContent = "Press run to see how the request moves through the bridge.";
  });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSimulation() {
  runButton.disabled = true;
  runButton.textContent = "running...";
  runHops.forEach((hop) => hop.classList.remove("active", "done"));

  const path = ["claude", "mcp", "browser", "gemini", "archive"];
  const prompt = simPrompt.value.trim() || "make something useful";
  fakeOutput.querySelector("span").textContent = "starting";
  fakeOutput.querySelector("strong").textContent = modeToTool[selectedMode];
  fakeOutput.querySelector("p").textContent = "Claude is sending the clean prompt through MCP.";

  for (let index = 0; index < path.length; index++) {
    const key = path[index];
    runHops.forEach((hop) => hop.classList.toggle("active", hop.dataset.hop === key));
    setActiveNode(key);
    if (index > 0) runHops[index - 1].classList.add("done");
    requestRender();
    await wait(lowPowerDevice ? 260 : 380);
  }

  runHops.at(-1).classList.add("done");
  runHops.forEach((hop) => hop.classList.remove("active"));
  fakeOutput.querySelector("span").textContent = "saved";
  fakeOutput.querySelector("strong").textContent = `stuff/${new Date().toISOString().slice(0, 10)}_${selectedMode}/`;
  fakeOutput.querySelector("p").textContent = `Prompt saved: "${prompt.slice(0, 86)}${prompt.length > 86 ? "..." : ""}"`;
  setActiveNode("archive");
  runButton.disabled = false;
  runButton.textContent = "run again";
}

runButton.addEventListener("click", runSimulation);

const toast = document.querySelector("#toast");
let toastTimer;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast.textContent = "Copied";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1300);
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copy));
});

const motionToggle = document.querySelector("#motionToggle");
function syncMotionButton() {
  motionToggle.classList.toggle("is-paused", isPaused);
  motionToggle.setAttribute("aria-label", isPaused ? "Resume 3D motion" : "Pause 3D motion");
  motionToggle.title = isPaused ? "Resume 3D motion" : "Pause 3D motion";
}

motionToggle.addEventListener("click", () => {
  isPaused = !isPaused;
  syncMotionButton();
  requestRender();
});

syncMotionButton();
