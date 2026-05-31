import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const canvas = document.querySelector("#bridgeCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
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
  { key: "archive", label: "Stuff", x: 7.1, y: 1.0, z: 0.3, size: 1.0, color: palette.archive }
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

  const coreGeometry = new THREE.IcosahedronGeometry(node.size, 2);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: node.color,
    roughness: 0.36,
    metalness: 0.45,
    emissive: node.color,
    emissiveIntensity: 0.12
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const ringGeometry = new THREE.TorusGeometry(node.size * 1.38, 0.018, 8, 96);
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

  const tubeGeometry = new THREE.TubeGeometry(curve, 90, 0.022, 8, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0x4dd4c2, transparent: true, opacity: 0.32 });
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  root.add(tube);

  for (let j = 0; j < 4; j++) {
    const dotGeometry = new THREE.SphereGeometry(0.085, 16, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: j % 2 ? 0x9eff7a : 0x53e3d4 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    root.add(dot);
    particles.push({ dot, curve, offset: j / 4 + i * 0.11 });
  }
}

const grid = new THREE.GridHelper(34, 34, 0x19352f, 0x10221f);
grid.position.y = -3.2;
grid.material.transparent = true;
grid.material.opacity = 0.38;
root.add(grid);

const starGeometry = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 260; i++) {
  starPositions.push((Math.random() - 0.5) * 46, (Math.random() - 0.5) * 24, -8 - Math.random() * 18);
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xdfffe9, size: 0.035, transparent: true, opacity: 0.42 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

let isPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let activeKey = "claude";
let pointerTarget = { x: 0, y: 0 };

function setActiveNode(key) {
  activeKey = key;
  for (const [nodeKey, group] of nodeMeshes) {
    const isActive = nodeKey === key;
    group.userData.core.material.emissiveIntensity = isActive ? 0.38 : 0.12;
    group.userData.ring.material.opacity = isActive ? 0.95 : 0.5;
    group.scale.setScalar(isActive ? 1.18 : 1);
  }
}

setActiveNode(activeKey);

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

window.addEventListener("pointermove", (event) => {
  pointerTarget.x = (event.clientX / window.innerWidth - 0.5) * 1.4;
  pointerTarget.y = (event.clientY / window.innerHeight - 0.5) * 0.8;
});

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  if (!isPaused) {
    root.rotation.y += ((pointerTarget.x * 0.12) - root.rotation.y) * 0.025;
    root.rotation.x += ((-pointerTarget.y * 0.08) - root.rotation.x) * 0.025;
    stars.rotation.y = elapsed * 0.018;

    for (const [key, group] of nodeMeshes) {
      const activeBoost = key === activeKey ? 0.16 : 0;
      group.position.y = group.userData.baseY + Math.sin(elapsed * group.userData.speed) * (0.15 + activeBoost);
      group.userData.core.rotation.x += 0.006;
      group.userData.core.rotation.y += 0.009;
      group.userData.ring.rotation.z += key === activeKey ? 0.018 : 0.009;
    }

    for (const item of particles) {
      const t = (elapsed * 0.11 + item.offset) % 1;
      item.dot.position.copy(item.curve.getPointAt(t));
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

const stepData = {
  claude: {
    title: "Claude asks for a tool",
    node: "claude",
    copy: "Claude sees named MCP tools like gemini_prompt and gemini_create_image. The bridge guide tells it how to use them carefully."
  },
  mcp: {
    title: "MCP chooses the Gemini mode",
    node: "mcp",
    copy: "The MCP server maps the request to chat, Create image, Create video, Create music, Canvas, Guided Learning, or file upload."
  },
  browser: {
    title: "Browser does the work",
    node: "browser",
    copy: "Chrome or Edge opens with a separate local profile. It can run offscreen so it does not interrupt your normal work."
  },
  archive: {
    title: "Stuff gets saved",
    node: "archive",
    copy: "Each run becomes a dated folder with prompt.txt, response.md, result.json, page.png, and media files when available."
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
  });
});

const toolOutput = document.querySelector("#toolOutput");
document.querySelectorAll(".tool-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tool-chip").forEach((item) => item.classList.toggle("active", item === button));
    toolOutput.querySelector("strong").textContent = button.dataset.tool;
    toolOutput.querySelector("p").textContent = button.dataset.desc;
    setActiveNode(button.dataset.tool.includes("open_stuff") ? "archive" : button.dataset.tool.includes("upload") ? "browser" : "gemini");
  });
});

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
});

syncMotionButton();
