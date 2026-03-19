import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';

import { Capsule } from 'three/addons/math/Capsule.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';


let zombieModel;
const fbxLoader = new FBXLoader();

let zombie;
let mixer;
let runAction;

let zombieCollider;
let zombieVelocity = new THREE.Vector3();

let attackAction;
let currentAction;


let dieAction;
let zombieLife = 5;
let zombieDead = false;

const bullets = [];




const timer = new THREE.Timer();
timer.connect(document);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(- 5, 25, - 1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);

const container = document.getElementById('container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const stats = new Stats();
stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
container.appendChild(stats.domElement);

const GRAVITY = 30;

const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;

const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, - 100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3()
    });

}

const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1.7, 0), 0.35);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

document.addEventListener('keydown', (event) => {

    keyStates[event.code] = true;

});

document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

container.addEventListener('mousedown', () => {

    document.body.requestPointerLock();

    mouseTime = performance.now();

});

document.addEventListener('mouseup', () => {

    if (document.pointerLockElement !== null) throwBall();

});

document.body.addEventListener('mousemove', (event) => {

    if (document.pointerLockElement === document.body) {

        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall() {

    const sphere = spheres[sphereIdx];

    camera.getWorldDirection(playerDirection);

    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);

    // throw the ball with more force if we hold the button longer, and if we move forward

    const impulse = 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    bullets.push({
        sphere: sphere,
        time: performance.now()
    });

    sphereIdx = (sphereIdx + 1) % spheres.length;

}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {

            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        if (result.depth >= 1e-10) {

            playerCollider.translate(result.normal.multiplyScalar(result.depth));

        }

    }

}

function updatePlayer(deltaTime) {

    let damping = Math.exp(- 4 * deltaTime) - 1;

    if (!playerOnFloor) {

        playerVelocity.y -= GRAVITY * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    camera.position.copy(playerCollider.end);

}

function playerSphereCollision(sphere) {

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    const sphere_center = sphere.collider.center;

    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    // approximation: player = 3 spheres

    for (const point of [playerCollider.start, playerCollider.end, center]) {

        const d2 = point.distanceToSquared(sphere_center);

        if (d2 < r2) {

            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, - d);

        }

    }

}

function spheresCollisions() {

    for (let i = 0, length = spheres.length; i < length; i++) {

        const s1 = spheres[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = spheres[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

function updateSpheres(deltaTime) {

    spheres.forEach(sphere => {

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {

            sphere.velocity.addScaledVector(result.normal, - result.normal.dot(sphere.velocity) * 1.5);
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));

        } else {

            sphere.velocity.y -= GRAVITY * deltaTime;

        }

        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        playerSphereCollision(sphere);

    });

    spheresCollisions();

    for (const sphere of spheres) {

        sphere.mesh.position.copy(sphere.collider.center);

    }

    const now = performance.now();

    bullets.forEach((b, index) => {

        if (now - b.time > 1000) {

            // desaparecer bala
            b.sphere.collider.center.set(0, -100, 0);
            b.sphere.velocity.set(0, 0, 0);

            bullets.splice(index, 1);

        }

    });

}

function getForwardVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);

    return playerDirection;

}

function controls(deltaTime) {

    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {

        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));

    }

    if (keyStates['KeyS']) {

        playerVelocity.add(getForwardVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyA']) {

        playerVelocity.add(getSideVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyD']) {

        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    }

    if (playerOnFloor) {

        if (keyStates['Space']) {

            playerVelocity.y = 15;

        }

    }

}

const loader = new GLTFLoader().setPath('./models/gltf/');

loader.load('scene.gltf', (gltf) => {

    scene.add(gltf.scene);

    worldOctree.fromGraphNode(gltf.scene);

    gltf.scene.traverse(child => {

        if (child.isMesh) {

            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material.map) {

                child.material.map.anisotropy = 4;

            }

        }

    });

    const helper = new OctreeHelper(worldOctree);
    helper.visible = false;
    scene.add(helper);

    const gui = new GUI({ width: 200 });
    gui.add({ debug: false }, 'debug')
        .onChange(function (value) {

            helper.visible = value;

        });

});

// CARGAR MODELO FBX
fbxLoader.load('./models/fbx/Peasant Girl.fbx', (fbx) => {

    zombie = new THREE.Group();
    zombieModel = fbx;

    zombieModel.scale.setScalar(0.01);

    zombie.add(zombieModel);
    scene.add(zombie);

    // Posición inicial
    zombie.position.set(5, 0, 5);

    // Ajustar al suelo
    zombie.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(zombie);
    zombie.position.y -= box.min.y;

    zombieCollider = new Capsule(
        new THREE.Vector3(0, 0.35, 0),
        new THREE.Vector3(0, 1.7, 0),
        0.35
    );

    // colocar collider en misma posición que zombie
    zombieCollider.start.copy(zombie.position);
    zombieCollider.end.copy(zombie.position).add(new THREE.Vector3(0, 1.35, 0));




    zombieModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });



    mixer = new THREE.AnimationMixer(zombieModel);

    // 🏃 CORRER
    fbxLoader.load('./models/fbx/Petting Animal.fbx', (anim) => {

        const clip = anim.animations[0];
        runAction = mixer.clipAction(clip);
        runAction.timeScale = 3;

        // ▶️ iniciar como acción actual
        currentAction = runAction;
        currentAction.play();

    });

    // 👊 ATAQUE
    fbxLoader.load('./models/fbx/Mutant Punch.fbx', (anim) => {

        const clip = anim.animations[0];
        attackAction = mixer.clipAction(clip);
        attackAction.timeScale = 5;

    });

    // 💀 MORIR
    fbxLoader.load('./models/fbx/Dying.fbx', (anim) => {

        const clip = anim.animations[0];
        dieAction = mixer.clipAction(clip);
        dieAction.timeScale = 10;
        dieAction.clampWhenFinished = true;
        dieAction.loop = THREE.LoopOnce;

    });

});




function teleportPlayerIfOob() {

    if (camera.position.y <= - 25) {

        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1.7, 0);
        playerCollider.radius = 0.35;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);

    }

}


function animate() {

    checkBulletZombieCollision();

    timer.update();


    const deltaTime = Math.min(0.05, timer.getDelta()) / STEPS_PER_FRAME;



    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

    if (mixer) mixer.update(deltaTime);

    for (let i = 0; i < STEPS_PER_FRAME; i++) {

        controls(deltaTime);

        updatePlayer(deltaTime);

        updateSpheres(deltaTime);

        teleportPlayerIfOob();

    }

    renderer.render(scene, camera);
    updateZombie(deltaTime);

    stats.update();

}

function updateZombie(deltaTime) {

    if (zombieDead) return;

    if (!zombie || !zombieCollider) return;

    const playerPos = playerCollider.end;

    const direction = new THREE.Vector3()
        .subVectors(playerPos, zombieCollider.end);

    direction.y = 0;
    direction.normalize();

    const distance = zombie.position.distanceTo(playerPos);

    const speed = 12;

    // 🧠 SI ESTÁ LEJOS → CORRER
    if (distance > 2) {

        zombieVelocity.x = direction.x * speed;
        zombieVelocity.z = direction.z * speed;

        switchAction(runAction);

    }
    // 🧠 SI ESTÁ CERCA → ATACAR
    else {

        zombieVelocity.set(0, 0, 0);

        switchAction(attackAction);

    }

    const deltaPosition = zombieVelocity.clone().multiplyScalar(deltaTime);
    zombieCollider.translate(deltaPosition);

    const result = worldOctree.capsuleIntersect(zombieCollider);

    if (result) {
        zombieCollider.translate(result.normal.multiplyScalar(result.depth));
    }

    zombie.position.copy(zombieCollider.start);

    // 🔥 ROTACIÓN CORREGIDA (IMPORTANTE)
    const target = new THREE.Vector3(playerPos.x, zombie.position.y, playerPos.z);
    zombie.lookAt(target);

}


function switchAction(newAction) {

    if (!newAction || currentAction === newAction) return;

    currentAction.fadeOut(0.3);

    newAction
        .reset()
        .fadeIn(0.3)
        .play();

    currentAction = newAction;

}

function checkBulletZombieCollision() {

    if (!zombie || zombieDead) return;

    const zombiePos = zombie.position;

    spheres.forEach((sphere) => {

        const dist = sphere.collider.center.distanceTo(zombiePos);

        if (dist < 1.5) {

            // 💥 impacto
            sphere.collider.center.set(0, -100, 0);
            sphere.velocity.set(0, 0, 0);

            zombieLife--;

            console.log("Vida enemigo:", zombieLife);

            if (zombieLife <= 0) {
                killZombie();
            }

        }

    });

}

function killZombie() {

    zombieDead = true;

    switchAction(dieAction);

    setTimeout(() => {
        respawnZombie();
    }, 3000);

}

function respawnZombie() {

    zombieLife = 5;
    zombieDead = false;

    const x = (Math.random() - 0.5) * 20;
    const z = (Math.random() - 0.5) * 20;

    zombieCollider.start.set(x, 0.35, z);
    zombieCollider.end.set(x, 1.7, z);

    zombie.position.set(x, 0, z);

    switchAction(runAction);

}