import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

// --- 1. Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);

const container = document.getElementById('canvas-container');
container.appendChild(renderer.domElement);

const sparkRenderer = new SparkRenderer({ renderer });
scene.add(sparkRenderer);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const overlay = document.getElementById('viewer-overlay');

// --- LOADING SCREEN SETUP ---
const loadingScreen = document.createElement('div');
loadingScreen.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: #111111;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 20000;
    font-family: system-ui, -apple-system, sans-serif;
    color: #ffdd00;
    opacity: 0;
    transition: opacity 0.4s ease;
`;
loadingScreen.innerHTML = `
    <div style="width: 50px; height: 50px; border: 4px solid rgba(255, 221, 0, 0.2); border-top-color: #ffdd00; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
    <div style="font-size: 18px; font-weight: 500; letter-spacing: 1px;">LOADING 3D SCENE...</div>
    <style>
        @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
`;
overlay.appendChild(loadingScreen); 

function showLoading() {
    loadingScreen.style.transition = 'none'; 
    loadingScreen.style.display = 'flex';
    loadingScreen.style.opacity = '1';
}

function hideLoading() {
    loadingScreen.style.transition = 'opacity 0.4s ease';
    loadingScreen.style.opacity = '0';
    setTimeout(() => { loadingScreen.style.display = 'none'; }, 400);
}
// ----------------------------

// --- INSTRUCTIONS UI SETUP ---
const instructionsUI = document.createElement('div');
instructionsUI.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: #ccc;
    background: rgba(26, 26, 26, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 14px 18px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    display: none;
    pointer-events: none;
    line-height: 1.6;
`;
instructionsUI.innerHTML = `
    Left click to rotate<br>
    Right click to pan<br>
    Scroll to zoom<br>
    <b>R</b> to reset view
`;
overlay.appendChild(instructionsUI);
// ----------------------------

// --- 2. Global State & Navigation Variables ---
const pois = [];
const labels = [];
let currentSplatMesh = null;

let collisionFrameCounter = 0;
let sceneCollisionEnabled = true;

let activePOI = null;
let isNavigating = false;
let isAutoRotating = false;

let navProgress = 0;
const navStartPos = new THREE.Vector3();
const navStartTarget = new THREE.Vector3();
const NAV_SPEED = 0.02;

const autoRotateBaseOffset = new THREE.Vector3();
let autoRotateTime = 0;
const AUTO_ROTATE_SPEED = 2.0;
const MAX_ROTATION_DEG = 10;

const targetCameraPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();

const SAFE_DISTANCE = 1.5;
const POI_DIST = SAFE_DISTANCE;

const collisionRaycaster = new THREE.Raycaster();
const rayDir = new THREE.Vector3();
const WALL_BUFFER = 0.3;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let controlHeld = false;
let downX = 0, downY = 0;
let startPosition = new THREE.Vector3();
let startTarget = new THREE.Vector3();


// ============================================================================
// ⭐️ 4. SCENE CONFIGURATIONS 
// ============================================================================
const SCENES = {
    ceramic: {
        url: './scene.ply',
        splatPos: [-0.5, 0, 1.5],
        splatRot: [3.14, 0, 0],
        splatScale: 1.0,
        cameraPos: [2, 1.5, 1.5],
        pois: [
            { pos: [-5.78, 0.998, 0.786], title: 'Auxiliary Crafting and Storage Space', body: 'Roomy space in the back of the unit ideal for another crafting area or storage space. Has quick access to tap water as well as a back exit.' },
            { pos: [4.721, 1.849, 2.68], title: 'Large Windows', body: 'Natural light from these beautiful windows makes this space perfect for creative ventures.' },
            { pos: [0.524, 1.038, 1.68], title: 'Main Space', body: 'This is the main space of the unit.', disableCollision: true, hideLabel: true }
        ],
        labels: [
            { pos: [0.524, 1.5, 1.68], text: ['Crafting Studio', 'Down Town'], fontSize: 120, color: '#f5e6c8' }
        ]
    },
    subunit: {
        url: './scene2.ply',
        splatPos: [0, 0, 0],
        splatRot: [1.5708, 1.5708, 1.5708],
        splatScale: 1.0,
        cameraPos: [0, 1.5, 2],
        disableCollision: true,
        pois: [
            { pos: [.327, .738, 1.583], title: 'Large Kitchen', body: 'A spacious and functional kitchen with ample storage space.', cameraPos: [0.723, 1.036, -0.191], cameraTarget: [.327, .738, 1.583] },
            { pos: [-2, 0.75, -1.5], title: 'Spacious Living Room', body: 'A large living space and front entry way. The open floor plan helps to make the space feel large and inviting.' },
            { pos: [1.555, 0.985, 0.296], title: 'Master Bedroom', body: 'Nicely seperated from the living space and kitchen, this Master Bedroom has an ensuite bathroom as well as two entrances.', cameraPos: [0.006, 1.301, 2.103], cameraTarget: [1.555, 0.985, 0.296] },
            { pos: [1.678, 0.88, 2.779], title: 'Recently Renovated Cabinets', body: 'Beautifully renovated cabinets with original hardwood accents. Great for storage and display.', cameraPos: [0.420, 1.270, 1.186], cameraTarget: [1.678, 0.88, 2.779] },
            { pos: [3.095, 1.027, 1.079], title: 'Pantry', body: 'Even more storage space for pantry items and other kitchen essentials.', cameraPos: [2.191, 1.203, 2.441], cameraTarget: [3.095, 1.027, 1.079] },
            { pos: [2.881, 1.023, 2.588], title: 'Bathroom', body: 'Guest bathroom with a walk in shower and a large vanity.', cameraPos: [2.415, 1.341, 1.193], cameraTarget: [2.881, 1.023, 2.588] },
            { pos: [-0.389, 0.793, 2.392], title: 'Wine Storage', body: 'Built in wine storage offers a unique and stylish way to store and serve your favorite wines.', cameraPos: [0.719, 1.361, 1.556], cameraTarget: [-0.389, 0.793, 2.392] }
        ],
        labels: [{ pos: [-2.73, 1.5, -2.461], text: ['Sub Unit', 'Apartment'], fontSize: 100, color: '#f5e6c8' }]
    },
    lichtfeld: {
        url: './scene3.ply',
        splatPos: [-3.5, 0, 3],
        splatRot: [3.15, 0, 0],
        splatScale: 1.0,
        cameraPos: [0, .5, 2],
        lookAtFirstPOI: true,
        disableCollision: true,
        pois: [
            { pos: [-1, .255, -2.5], title: 'Main Meeting Room', body: 'Large and functional space perfect to host your events, with space for a featured exhibit to set the tone.', cameraPos: [-1.293, 0.246, -0.633], cameraTarget: [-1, .5, -2.5] },
            { pos: [-1.9, 0, 3.315], title: 'Front Reception', body: 'Space for an information booth or an informal check in.' },
            { pos: [-10.405, 0, -.575], title: 'Flux Space', body: 'A space for you to cater to the needs of your guests, perfect for food preperation or extra seating room.', cameraPos: [-10.640, .345, 0.859], cameraTarget: [-10.405, 0, -.575] },
            { pos: [-8.2, 0.532, -5.066], title: 'Gallery', body: 'Well lit and spacious gallery perfect for displaying event art or other showcase items.' },
            { pos: [-14.921, .5, -5.579], title: 'Open Floor Plan', body: 'With room to customize, this space can truly be arranged to match any event needs.' }
        ],
        labels: [{ pos: [-1, 1, -2.5], text: ['Event Center'], fontSize: 90, color: '#f5e6c8' }]
    },
    haussmann: { url: null },
    spanish: { url: null }
};
// ============================================================================


// --- 3. Callout & Label Helpers ---
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        if (ctx.measureText(currentLine + " " + word).width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function createCalloutTexture(title, body) {
    const width = 600;
    const padding = 24;
    const maxWidth = width - padding * 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const titleFont = 'bold 32px Arial, sans-serif';
    const bodyFont = '20px Arial, sans-serif';

    ctx.font = titleFont;
    const titleLines = wrapText(ctx, title, maxWidth);

    ctx.font = bodyFont;
    const bodyLines = wrapText(ctx, body, maxWidth);

    const titleLineHeight = 40;
    const bodyLineHeight = 28;
    const titleHeight = titleLines.length * titleLineHeight;
    const bodyHeight = bodyLines.length * bodyLineHeight;

    const totalHeight = padding + titleHeight + 12 + bodyHeight + padding;

    canvas.width = width;
    canvas.height = totalHeight;

    ctx.fillStyle = 'rgba(26, 26, 26, 0.85)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(0, 0, width, totalHeight, 16);
    } else {
        ctx.rect(0, 0, width, totalHeight);
    }
    ctx.fill();

    ctx.font = titleFont;
    ctx.fillStyle = '#ffdd00';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let y = padding;
    titleLines.forEach(line => {
        ctx.fillText(line, padding, y);
        y += titleLineHeight;
    });

    y += 12;
    ctx.font = bodyFont;
    ctx.fillStyle = '#eee';
    bodyLines.forEach(line => {
        ctx.fillText(line, padding, y);
        y += bodyLineHeight;
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

function makePOI(x, y, z, opts = {}) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const color = opts.color || '#ffdd00';

    ctx.beginPath();
    ctx.arc(c, c, size * 0.40, 0, Math.PI * 2);
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false
    }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(opts.scale || 0.3);

    sprite.userData.title = opts.title || 'CALL OUT TEXT';
    sprite.userData.body = opts.body || 'Add text here to explain callout text';
    sprite.userData.disableCollision = opts.disableCollision || false;
    sprite.userData.hideLabel = opts.hideLabel || false;
    sprite.userData.cameraPos = opts.cameraPos || null;
    sprite.userData.cameraTarget = opts.cameraTarget || null;

    const calloutTex = createCalloutTexture(sprite.userData.title, sprite.userData.body);
    const calloutSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: calloutTex, transparent: true, depthTest: false, depthWrite: false
    }));

    calloutSprite.position.set(x, y + 0.15, z);
    calloutSprite.center.set(0.5, 0);
    calloutSprite.renderOrder = 1000;
    calloutSprite.visible = false;
    calloutSprite.userData.aspect = calloutTex.image.width / calloutTex.image.height;

    scene.add(calloutSprite);
    sprite.userData.calloutSprite = calloutSprite;

    pois.push(sprite);
    sprite.renderOrder = 900;
    return sprite;
}

function makeLabel(x, y, z, textLines, opts = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = opts.fontSize || 72;
    const font = `bold ${fontSize}px Georgia, 'Times New Roman', serif`;

    ctx.font = font;
    const lines = Array.isArray(textLines) ? textLines : [textLines];
    let maxWidth = 0;
    lines.forEach(line => {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
    });

    const padding = fontSize * 0.4;
    const lineHeight = fontSize * 1.15;
    canvas.width = Math.ceil(maxWidth + padding * 2);
    canvas.height = Math.ceil(lines.length * lineHeight + padding * 2);

    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.color || '#f5e6c8';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;

    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false
    }));
    sprite.position.set(x, y, z);
    sprite.center.set(0.5, 0.5);
    sprite.renderOrder = 999;
    sprite.userData.aspect = canvas.width / canvas.height;
    labels.push(sprite);
    return sprite;
}

// --- 5. Navigation Logic ---
function navigateToPOI(poi) {
    activePOI = poi;

    labels.forEach(label => { label.visible = !poi.userData.hideLabel; });

    if (poi.userData.cameraPos) {
        targetCameraPos.set(...poi.userData.cameraPos);
        if (poi.userData.cameraTarget) {
            targetLookAt.set(...poi.userData.cameraTarget);
        } else {
            targetLookAt.copy(poi.position);
        }
    } else {
        const poiPos = poi.position;
        const dir = new THREE.Vector3().subVectors(camera.position, poiPos);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        targetCameraPos.copy(poiPos).addScaledVector(dir, POI_DIST);
        targetLookAt.copy(poiPos);
    }

    navStartPos.copy(camera.position);
    navStartTarget.copy(controls.target);
    navProgress = 0;

    isNavigating = true;
    isAutoRotating = false;

    pois.forEach(p => {
        if (p.userData.calloutSprite) p.userData.calloutSprite.visible = false;
    });
    if (poi.userData.calloutSprite) {
        poi.userData.calloutSprite.visible = true;
    }

    pois.forEach(p => {
        if (p.userData.sidebarBtn) {
            if (p === poi) {
                p.userData.sidebarBtn.dataset.active = 'true';
                p.userData.sidebarBtn.style.color = '#ffdd00';
                p.userData.sidebarBtn.style.background = 'linear-gradient(145deg, rgba(60, 50, 20, 0.9), rgba(30, 25, 10, 0.8))';
            } else {
                p.userData.sidebarBtn.dataset.active = 'false';
                p.userData.sidebarBtn.style.color = '#eee';
                p.userData.sidebarBtn.style.background = 'linear-gradient(145deg, rgba(35, 35, 35, 0.85), rgba(15, 15, 15, 0.65))';
            }
        }
    });
}

// --- 6. Scene Loader ---
function load3DScene(sceneId) {
    const config = SCENES[sceneId];
    if (!config || !config.url) return;

    isNavigating = false;
    isAutoRotating = false;
    activePOI = null;

    sceneCollisionEnabled = !config.disableCollision;

    // Hide UI Elements during load
    instructionsUI.style.display = 'none';
    const oldSidebar = document.getElementById('poi-sidebar');
    if (oldSidebar) oldSidebar.remove();

    // CLEANUP previous scene
    if (currentSplatMesh) {
        scene.remove(currentSplatMesh);
        if (currentSplatMesh.dispose) currentSplatMesh.dispose();
        currentSplatMesh = null;
    }
    pois.forEach(p => {
        scene.remove(p);
        if (p.userData.calloutSprite) scene.remove(p.userData.calloutSprite);
    });
    pois.length = 0;
    labels.forEach(l => scene.remove(l));
    labels.length = 0;

    // LOAD new splat with onLoad callback
    currentSplatMesh = new SplatMesh({
        url: config.url,
        onLoad: () => {
            hideLoading();
            // Show UI Elements once loaded
            instructionsUI.style.display = 'block';
            buildSidebar();

            // Show POIs and Labels
            pois.forEach(p => { p.visible = true; });
            labels.forEach(l => { l.visible = true; });
        }
    });
    currentSplatMesh.position.set(...config.splatPos);
    currentSplatMesh.rotation.set(...config.splatRot);
    currentSplatMesh.scale.setScalar(config.splatScale);
    scene.add(currentSplatMesh);

    // BUILD new POIs & Labels (Hidden initially)
    if (config.pois) {
        config.pois.forEach(p => {
            const poi = makePOI(p.pos[0], p.pos[1], p.pos[2], p);
            poi.visible = false; // Hide until loaded
            scene.add(poi);
        });
    }
    if (config.labels) {
        config.labels.forEach(l => {
            const label = makeLabel(l.pos[0], l.pos[1], l.pos[2], l.text, l);
            label.visible = false; // Hide until loaded
            scene.add(label);
        });
    }

    // --- RESET CAMERA ---
    camera.position.set(...config.cameraPos);
    startPosition.copy(camera.position);

    if (config.targetPos) {
        controls.target.set(...config.targetPos);
    } else {
        let facingDir = new THREE.Vector3();

        if (config.lookAtFirstPOI && config.pois && config.pois.length > 0) {
            facingDir.set(...config.pois[0].pos).sub(camera.position);
        } else {
            facingDir.subVectors(new THREE.Vector3(0, 0, 0), camera.position);
        }

        if (Math.abs(facingDir.x) < 0.1 && Math.abs(facingDir.z) < 0.1) {
            facingDir.set(0, 0, -1);
        }

        facingDir.normalize();

        // Set target 1.0 unit in front so Zoom/Pan works
        controls.target.copy(camera.position).addScaledVector(facingDir, 1.0);

        if (!config.lookAtFirstPOI) {
            const turnAngle = THREE.MathUtils.degToRad(5);
            const viewOffset = controls.target.clone().sub(camera.position);
            viewOffset.applyAxisAngle(new THREE.Vector3(5, 9, 0), turnAngle);
            controls.target.copy(camera.position).add(viewOffset);
        }
    }

    startTarget.copy(controls.target);

    if (config.cameraRoll) {
        const rollRad = THREE.MathUtils.degToRad(config.cameraRoll);
        const viewDir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        camera.up.set(0, 1, 0).applyAxisAngle(viewDir, rollRad);
    } else {
        camera.up.set(0, 1, 0);
    }

    controls.update();
}

function buildSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'poi-sidebar';
    sidebar.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        width: 286px;
        z-index: 10001;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 9px;
    `;
    overlay.appendChild(sidebar);

    pois.forEach((poi) => {
        const btn = document.createElement('div');
        btn.textContent = poi.userData.title;
        btn.style.cssText = `
            color: #eee;
            cursor: pointer;
            font-size: 15px;
            padding: 11px 15px;
            border: none;
            border-radius: 10px;
            background: linear-gradient(145deg, rgba(35, 35, 35, 0.85), rgba(15, 15, 15, 0.65));
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            user-select: none;
            transition: color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        `;

        btn.addEventListener('mouseenter', () => {
            if (btn.dataset.active !== 'true') {
                btn.style.background = 'linear-gradient(145deg, rgba(50, 50, 50, 0.9), rgba(25, 25, 25, 0.75))';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.dataset.active !== 'true') {
                btn.style.background = 'linear-gradient(145deg, rgba(35, 35, 35, 0.85), rgba(15, 15, 15, 0.65))';
            }
        });

        btn.addEventListener('click', () => {
            navigateToPOI(poi);
        });

        sidebar.appendChild(btn);
        poi.userData.sidebarBtn = btn;
    });
}

// --- 7. UI & Event Listeners ---

document.querySelectorAll('[data-scene]').forEach(button => {
    button.addEventListener('click', (e) => {
        const sceneId = e.target.getAttribute('data-scene');

        if (!SCENES[sceneId] || !SCENES[sceneId].url) {
            alert("This 3D tour hasn't been uploaded yet.");
            return;
        }

        showLoading();
        overlay.style.display = 'block';
        document.body.classList.add('viewer-open');

        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        // Delay load slightly to let loading screen render
        setTimeout(() => {
            load3DScene(sceneId);
        }, 50);
    });
});

document.getElementById('close-viewer').addEventListener('click', () => {
    overlay.style.display = 'none';
    document.body.classList.remove('viewer-open');

    const oldSidebar = document.getElementById('poi-sidebar');
    if (oldSidebar) oldSidebar.remove();

    if (currentSplatMesh) {
        scene.remove(currentSplatMesh);
        if (currentSplatMesh.dispose) currentSplatMesh.dispose();
        currentSplatMesh = null;
    }
});

// Interaction Listeners
addEventListener('keydown', (e) => {
    if (e.key === 'Control') controlHeld = true;
});
addEventListener('keyup', (e) => {
    if (e.key === 'Control') controlHeld = false;
});
addEventListener('blur', () => { controlHeld = false; });

// Reset Camera Shortcut
addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') {
        camera.position.copy(startPosition);
        controls.target.copy(startTarget);
        isNavigating = false;
        activePOI = null;
        labels.forEach(label => { label.visible = true; });
        killMomentum();
        controls.update();
    }
});

// Print Coordinates Shortcut
addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        console.log(`\n--- WAYPOINT FOR POI ---`);
        console.log(`cameraPos: [${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)}],`);
        console.log(`cameraTarget: [${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)}],`);
        console.log(`------------------------\n`);
    }
});

renderer.domElement.addEventListener('mousedown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
});

renderer.domElement.addEventListener('click', (event) => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const poiHits = raycaster.intersectObjects(pois, false);
    if (poiHits.length > 0) {
        navigateToPOI(poiHits[0].object);
        return;
    }

    if (!controlHeld) return;

    const hits = raycaster.intersectObject(currentSplatMesh, false);
    if (hits.length === 0) return;

    const hitPoint = hits[0].point;

    const dirToCam = new THREE.Vector3().subVectors(camera.position, hitPoint);
    dirToCam.y = 0;
    if (dirToCam.lengthSq() < 1e-6) dirToCam.set(0, 0, 1);
    dirToCam.normalize();

    targetCameraPos.set(hitPoint.x, camera.position.y, hitPoint.z);
    targetCameraPos.addScaledVector(dirToCam, SAFE_DISTANCE);

    targetLookAt.set(hitPoint.x, camera.position.y, hitPoint.z);

    navStartPos.copy(camera.position);
    navStartTarget.copy(controls.target);
    navProgress = 0;

    console.log(`Moving to: x=${targetCameraPos.x.toFixed(3)} y=${targetCameraPos.y.toFixed(3)} z=${targetCameraPos.z.toFixed(3)}`);

    isNavigating = true;
    isAutoRotating = false;
});

controls.addEventListener('start', () => {
    isNavigating = false;
    isAutoRotating = false;
    pois.forEach(p => {
        if (p.userData.calloutSprite) p.userData.calloutSprite.visible = false;
    });
    labels.forEach(label => { label.visible = true; });
});

function killMomentum() {
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
}

// --- 8. Animation Loop & Resize ---
renderer.setAnimationLoop(() => {
    if (overlay.style.display !== 'block') return;

    collisionFrameCounter++;
    const doCollisionCheck = sceneCollisionEnabled && (collisionFrameCounter % 6 === 0);

    if (isNavigating) {
        navProgress += NAV_SPEED;
        if (navProgress > 1) navProgress = 1;

        const t = navProgress * navProgress * (3 - 2 * navProgress);

        camera.position.lerpVectors(navStartPos, targetCameraPos, t);
        controls.target.lerpVectors(navStartTarget, targetLookAt, t);

        if (navProgress >= 1) {
            isNavigating = false;
            isAutoRotating = true;
            autoRotateTime = 0;
            autoRotateBaseOffset.copy(camera.position).sub(controls.target);
        }
    } else if (isAutoRotating) {
        autoRotateTime += 0.016;
        const angle = Math.sin(autoRotateTime * AUTO_ROTATE_SPEED) * THREE.MathUtils.degToRad(MAX_ROTATION_DEG);
        const newOffset = autoRotateBaseOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        const proposedPos = controls.target.clone().add(newOffset);

        const skipCollision = !sceneCollisionEnabled || (activePOI && activePOI.userData.disableCollision);

        if (!skipCollision && currentSplatMesh && doCollisionCheck) {
            rayDir.subVectors(proposedPos, controls.target).normalize();
            collisionRaycaster.set(controls.target, rayDir);
            collisionRaycaster.far = newOffset.length();
            const hits = collisionRaycaster.intersectObject(currentSplatMesh, false);

            if (hits.length > 0 && hits[0].distance > 0.5) {
                const safeDistance = Math.max(0.1, hits[0].distance - WALL_BUFFER);
                camera.position.copy(controls.target).addScaledVector(rayDir, safeDistance);
            } else {
                camera.position.copy(proposedPos);
            }
        } else {
            camera.position.copy(proposedPos);
        }
    }

    controls.update();

    const orbitDistance = camera.position.distanceTo(controls.target);
    const skipManualCollision = !sceneCollisionEnabled || (activePOI && activePOI.userData.disableCollision);

    if (!skipManualCollision && orbitDistance > 0.05 && currentSplatMesh && doCollisionCheck) {
        rayDir.subVectors(camera.position, controls.target).normalize();
        collisionRaycaster.set(controls.target, rayDir);
        collisionRaycaster.far = orbitDistance;
        const hits = collisionRaycaster.intersectObject(currentSplatMesh, false);

        if (hits.length > 0 && hits[0].distance > 0.5) {
            const safeDistance = Math.max(0.1, hits[0].distance - WALL_BUFFER);
            camera.position.copy(controls.target).addScaledVector(rayDir, safeDistance);
        }
    }

    for (const poi of pois) {
        poi.scale.setScalar(camera.position.distanceTo(poi.position) * 0.05);
        if (poi.userData.calloutSprite && poi.userData.calloutSprite.visible) {
            const d = camera.position.distanceTo(poi.userData.calloutSprite.position);
            const h = d * 0.2;
            poi.userData.calloutSprite.scale.set(h * poi.userData.calloutSprite.userData.aspect, h, 1);
        }
    }

    for (const label of labels) {
        const d = camera.position.distanceTo(label.position);
        const h = d * 0.3;
        label.scale.set(h * label.userData.aspect, h, 1);
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    if (overlay.style.display === 'block') {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});