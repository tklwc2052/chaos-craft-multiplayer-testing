const socket = io();
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let forkMovingUp = false, forkMovingDown = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}; 

// GAME VARIABLES
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

// FORKLIFT VARIABLES
let forklift = null;       
let forksPart = null;      
let isDriving = false;
let currentDriverId = null;

// --- LOGIN & START ---
document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    init3D();
    socket.emit('join', { username: name });
});

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    scene.fog = new THREE.Fog(0x87ceeb, 10, 80);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(5, 5, 10);
    camera.lookAt(0, 0, 0);
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(12, 20, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- BUILD THE V11 FORKLIFT ---
    buildForklift();

    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && !isDriving && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
        if(e.code === 'KeyE') attemptToggleDrive();
        if(e.code === 'KeyR') forkMovingUp = true;
        if(e.code === 'KeyF') forkMovingDown = true;
    });

    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; 
        if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; 
        if(e.code==='KeyD') moveRight=false;
        if(!e.shiftKey) isShifting = false;
        if(e.code === 'KeyR') forkMovingUp = false;
        if(e.code === 'KeyF') forkMovingDown = false;
    });

    animate();
}

// --- 🏗️ THE BUILDER (V11) ---
function buildForklift() {
    forklift = new THREE.Group();
    
    // -- COLORS --
    const COLOR_BODY = 0xE6B800; 
    const COLOR_DARK = 0x222222; 
    const COLOR_IRON = 0x333333; 
    const COLOR_STEEL = 0xAAAAAA; 
    const COLOR_CAGE = 0x1a1a1a; 
    const COLOR_CHAIN = 0x111111;
    const COLOR_SEAT = 0x111111; 
    const COLOR_TANK_GREY = 0x999999; 

    const matBody = new THREE.MeshStandardMaterial({ color: COLOR_BODY, roughness: 0.3, side: THREE.DoubleSide });
    const matDark = new THREE.MeshStandardMaterial({ color: COLOR_DARK, roughness: 0.8 });
    const matIron = new THREE.MeshStandardMaterial({ color: COLOR_IRON, roughness: 0.7, metalness: 0.4 });
    const matSteel = new THREE.MeshStandardMaterial({ color: COLOR_STEEL, roughness: 0.3, metalness: 0.6 });
    const matCage = new THREE.MeshStandardMaterial({ color: COLOR_CAGE, roughness: 0.5 });
    const matChain = new THREE.MeshStandardMaterial({ color: COLOR_CHAIN, roughness: 0.9 });
    const matSeat = new THREE.MeshStandardMaterial({ color: COLOR_SEAT, roughness: 0.9 });
    const matTank = new THREE.MeshStandardMaterial({ color: COLOR_TANK_GREY, roughness: 0.4 });

    const chassisGroup = new THREE.Group();
    
    // --- 1. REAR SECTION (High Engine) ---
    // Shortened Length (Z=0.8) and moved closer to center
    const rearBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.8), matBody);
    rearBlock.position.set(0, 1.0, 0.8); // Z moved from 1.0 to 0.8
    rearBlock.castShadow = true;
    chassisGroup.add(rearBlock);

    // Rounded Back Corners (Adjusted Position)
    const cwBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), matBody); cwBox.position.set(0, 1.0, 1.35); chassisGroup.add(cwBox);
    const cornerGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.0, 16);
    const cL = new THREE.Mesh(cornerGeo, matBody); cL.position.set(-0.4, 1.0, 1.35); chassisGroup.add(cL);
    const cR = new THREE.Mesh(cornerGeo, matBody); cR.position.set(0.4, 1.0, 1.35); chassisGroup.add(cR);

    // --- 2. FRONT SECTION (High Dash) ---
    // Shortened Length (Z=0.5) and moved closer
    const frontCowling = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.5), matBody);
    frontCowling.position.set(0, 0.8, -0.6); // Z moved from -0.2 to -0.6
    frontCowling.castShadow = true;
    chassisGroup.add(frontCowling);

    // --- 3. MIDDLE SECTION (Super Low Floor) ---
    // This fills the gap between Front (-0.35) and Rear (0.4)
    const floorGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
    const floor = new THREE.Mesh(floorGeo, matBody);
    floor.position.set(0, 0.45, 0.1); // Low Y, Center Z
    chassisGroup.add(floor);

    // --- 4. FENDERS ---
    // Front Arches (Moved with Front Section)
    const archGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 32, 1, true, 0, Math.PI);
    const fFL = new THREE.Mesh(archGeo, matBody); fFL.rotation.z = Math.PI/2; fFL.position.set(-0.55, 0.4, -0.6); chassisGroup.add(fFL);
    const fFR = new THREE.Mesh(archGeo, matBody); fFR.rotation.z = Math.PI/2; fFR.position.set(0.55, 0.4, -0.6); chassisGroup.add(fFR);

    // Rear Boxes (Moved with Rear Section)
    const boxFenderGeo = new THREE.BoxGeometry(0.3, 0.1, 0.8);
    const fRL = new THREE.Mesh(boxFenderGeo, matBody); fRL.position.set(-0.55, 0.8, 0.8); chassisGroup.add(fRL);
    const fRR = new THREE.Mesh(boxFenderGeo, matBody); fRR.position.set(0.55, 0.8, 0.8); chassisGroup.add(fRR);

    // --- 5. UNDERCARRIAGE ---
    // Shortened total length to ~2.0
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 2.0), matDark); 
    base.position.set(0, 0.4, 0.3); // Centered under new mass
    chassisGroup.add(base);
    forklift.add(chassisGroup);

    // --- 6. PROPANE TANK (Moved Forward with Rear Block) ---
    const tankGroup = new THREE.Group();
    tankGroup.position.set(0, 1.6, 1.2); // Z moved from 1.4 to 1.2
    const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), matTank);
    tBody.rotation.z = Math.PI / 2; tankGroup.add(tBody);
    const strapGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16); 
    const strap1 = new THREE.Mesh(strapGeo, matDark); strap1.rotation.z = Math.PI / 2; strap1.position.x = -0.25; tankGroup.add(strap1);
    const strap2 = new THREE.Mesh(strapGeo, matDark); strap2.rotation.z = Math.PI / 2; strap2.position.x = 0.25; tankGroup.add(strap2);
    forklift.add(tankGroup);

    // --- 7. WHEELS (Moved Closer Together) ---
    const wheelGeoFront = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 24); wheelGeoFront.rotateZ(Math.PI / 2);
    const wheelGeoRear = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 24); wheelGeoRear.rotateZ(Math.PI / 2);
    
    // Front Z: -0.6
    const wFL = new THREE.Mesh(wheelGeoFront, matDark); wFL.position.set(-0.55, 0.4, -0.6); forklift.add(wFL);
    const wFR = new THREE.Mesh(wheelGeoFront, matDark); wFR.position.set(0.55, 0.4, -0.6); forklift.add(wFR);
    
    // Rear Z: 0.8 (Moved forward)
    const wRL = new THREE.Mesh(wheelGeoRear, matDark); wRL.position.set(-0.55, 0.28, 0.8); forklift.add(wRL);
    const wRR = new THREE.Mesh(wheelGeoRear, matDark); wRR.position.set(0.55, 0.28, 0.8); forklift.add(wRR);

    // --- 8. CAGE (Adjusted to new length) ---
    const cageGroup = new THREE.Group();
    const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 12);
    const pipeSideGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12); // Shorter side bars
    const POST_Y = 1.9; const ROOF_Y = 2.8;

    // Front Posts (Z = -0.5)
    const pFL = new THREE.Mesh(pipeGeo, matCage); pFL.position.set(-0.50, POST_Y, -0.5); cageGroup.add(pFL);
    const pFR = new THREE.Mesh(pipeGeo, matCage); pFR.position.set(0.50, POST_Y, -0.5); cageGroup.add(pFR);
    // Rear Posts (Z = 0.6) - Moved forward
    const pRL = new THREE.Mesh(pipeGeo, matCage); pRL.position.set(-0.50, POST_Y, 0.6); pRL.rotation.x = -0.1; cageGroup.add(pRL);
    const pRR = new THREE.Mesh(pipeGeo, matCage); pRR.position.set(0.50, POST_Y, 0.6); pRR.rotation.x = -0.1; cageGroup.add(pRR);
    
    // Roof Frame
    const rL = new THREE.Mesh(pipeSideGeo, matCage); rL.rotation.x = Math.PI/2; rL.position.set(-0.50, ROOF_Y, 0.05); cageGroup.add(rL);
    const rR = new THREE.Mesh(pipeSideGeo, matCage); rR.rotation.x = Math.PI/2; rR.position.set(0.50, ROOF_Y, 0.05); cageGroup.add(rR);
    
    const slatGeo = new THREE.BoxGeometry(1.0, 0.02, 0.15);
    for(let i=0; i<4; i++) { // Fewer slats
        const slat = new THREE.Mesh(slatGeo, matCage); slat.position.set(0, ROOF_Y + 0.02, -0.3 + (i * 0.25)); slat.rotation.x = 0.2; cageGroup.add(slat);
    }
    const braceGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8);
    const b1 = new THREE.Mesh(braceGeo
