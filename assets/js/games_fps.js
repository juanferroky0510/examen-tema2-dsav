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

let playerLives = 3;
let gameOver = false;

// para evitar daño continuo instantáneo
let lastHitTime = 0;
const hitCooldown = 1000; // 1 segundo

let isAttacking = false;
let attackStartTime = 0;
const attackDuration = 800; // duración del ataque (ms)
const attackHitTime = 400; // momento donde golpea

let hasDealtDamage = false;

const enemies = [];

let score = 0;
let baseEnemySpeed = 5;




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

for (let i = 0; i < 6; i++) {

    const x = (Math.random() - 0.5) * 20;
    const z = (Math.random() - 0.5) * 20;

    createEnemy(x, z);

}

// CARGAR MODELO FBX
/* fbxLoader.load('./models/fbx/Peasant Girl.fbx', (fbx) => {

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

}); */

function createEnemy(x, z) {

    fbxLoader.load('./models/fbx/Peasant Girl.fbx', (fbx) => {

        const enemy = {};

        enemy.group = new THREE.Group();
        enemy.model = fbx;

        enemy.model.scale.setScalar(0.01);
        enemy.group.add(enemy.model);
        scene.add(enemy.group);

        enemy.group.position.set(x, 0, z);

        // ajustar al suelo
        enemy.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(enemy.group);
        enemy.group.position.y -= box.min.y;

        // collider
        enemy.collider = new Capsule(
            new THREE.Vector3(x, 0.35, z),
            new THREE.Vector3(x, 1.7, z),
            0.35
        );

        enemy.velocity = new THREE.Vector3();

        // vida
        enemy.life = 5;
        enemy.dead = false;

        // animaciones
        /* enemy.mixer = new THREE.AnimationMixer(enemy.model); */
        enemy.mixer = new THREE.AnimationMixer(enemy.model);
        enemy.actions = {};
        enemy.currentAction = null;

        // estado ataque
        enemy.isAttacking = false;
        enemy.attackStartTime = 0;
        enemy.hasDealtDamage = false;

        // sombras
        enemy.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // cargar animaciones
        loadEnemyAnimations(enemy);

        enemies.push(enemy);

    });

}

function loadEnemyAnimations(enemy) {

    // correr
    fbxLoader.load('./models/fbx/Petting Animal.fbx', (anim) => {
        const action = enemy.mixer.clipAction(anim.animations[0]);
        action.timeScale = 3;
        enemy.actions.run = action;

        enemy.currentAction = action;
        action.play();
    });

    // ataque
    fbxLoader.load('./models/fbx/Mutant Punch.fbx', (anim) => {
        const action = enemy.mixer.clipAction(anim.animations[0]);
        action.timeScale = 5;
        enemy.actions.attack = action;
    });

    // muerte
    /* fbxLoader.load('./models/fbx/Dying.fbx', (anim) => {
        const action = enemy.mixer.clipAction(anim.animations[0]);
        action.timeScale = 10;
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
        enemy.actions.die = action;
    }); */

    fbxLoader.load('./models/fbx/Dying.fbx', (anim) => {

        const clip = anim.animations[0];

        const action = enemy.mixer.clipAction(clip);

        action.reset();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        action.enabled = true;

        action.timeScale = 5; // prueba con 1.5 primero

        enemy.actions.die = action;

    });
}

/* function switchEnemyAction(enemy, newAction) {

    if (!newAction || enemy.currentAction === newAction) return;

    enemy.currentAction.fadeOut(0.3);

    newAction.reset().fadeIn(0.3).play();

    enemy.currentAction = newAction;

} */

/* function switchEnemyAction(enemy, newAction) {

    if (!newAction || enemy.currentAction === newAction) return;

    // 💀 si está muerto → no permitir cambiar
    if (enemy.dead && newAction !== enemy.actions.die) return;

    if (enemy.currentAction) {
        enemy.currentAction.fadeOut(0.2);
    }

    newAction.reset();

    // saltar ligeramente el inicio (evita T-pose)
    newAction.time = 0.05;

    newAction
        .fadeIn(0.2)
        .play();

    enemy.currentAction = newAction;

} */

function switchEnemyAction(enemy, newAction) {

    if (!newAction || enemy.currentAction === newAction) return;

    if (enemy.dead && newAction !== enemy.actions.die) return;

    if (enemy.currentAction) {
        enemy.currentAction.fadeOut(0.15); // un poco más suave
    }

    newAction.reset();

    // 🔥 evitar T-pose
    newAction.time = 0.05;

    newAction
        .fadeIn(0.2)
        .play();

    enemy.currentAction = newAction;
}


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

    if (gameOver) {
        renderer.render(scene, camera);
        return;
    }

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
    updateEnemies(deltaTime);

    stats.update();

}

/* function updateZombie(deltaTime) {

    if (zombieDead) return;

    if (!zombie || !zombieCollider) return;

    const playerPos = playerCollider.end;

    const direction = new THREE.Vector3()
        .subVectors(playerPos, zombieCollider.end);

    direction.y = 0;
    direction.normalize();

    const distance = zombie.position.distanceTo(playerPos);

    // 🎯 RANGO DE ATAQUE (corto)
    const attackRange = 2;

    const speed = 12;

    // 🏃 SI ESTÁ LEJOS → CORRER
    if (distance > attackRange && !zombieDead) {

        zombieVelocity.x = direction.x * speed;
        zombieVelocity.z = direction.z * speed;

        switchAction(runAction);

        isAttacking = false;

    }
    // 👊 SI ESTÁ CERCA → ATACAR
    else if (!zombieDead) {

        zombieVelocity.set(0, 0, 0);

        if (!isAttacking) {

            isAttacking = true;
            attackStartTime = performance.now();
            hasDealtDamage = false;

            switchAction(attackAction);

        }

    }

    if (isAttacking) {

        const now = performance.now();
        const elapsed = now - attackStartTime;

        // 💥 momento exacto del golpe
        if (elapsed > attackHitTime && !hasDealtDamage) {

            const hitRange = 1.8; // rango corto (mano)

            if (distance < hitRange) {

                playerLives--;

                document.getElementById("lives").innerText = "❤️ Vidas: " + playerLives;

                console.log("💥 Golpe!", playerLives);

                if (playerLives <= 0) {
                    endGame();
                }

            }

            hasDealtDamage = true;

        }

        // ⏱ terminar ataque
        if (elapsed > attackDuration) {

            isAttacking = false;

        }

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

} */


function updateEnemies(deltaTime) {

    enemies.forEach((enemy) => {

        if (!enemy || !enemy.collider) return;

        enemy.mixer.update(deltaTime);
        if (enemy.dead) return;

        const playerPos = playerCollider.end;

        const direction = new THREE.Vector3()
            .subVectors(playerPos, enemy.collider.end);

        direction.y = 0;
        direction.normalize();

        const distance = enemy.group.position.distanceTo(playerPos);

        const speed = baseEnemySpeed;

        // correr
        if (distance > 2) {

            enemy.velocity.x = direction.x * speed;
            enemy.velocity.z = direction.z * speed;

            switchEnemyAction(enemy, enemy.actions.run);

            enemy.isAttacking = false;

        } else {

            enemy.velocity.set(0, 0, 0);

            if (!enemy.isAttacking) {

                enemy.isAttacking = true;
                enemy.attackStartTime = performance.now();
                enemy.hasDealtDamage = false;

                switchEnemyAction(enemy, enemy.actions.attack);
            }

        }

        // daño
        if (enemy.isAttacking) {

            const elapsed = performance.now() - enemy.attackStartTime;

            if (elapsed > 400 && !enemy.hasDealtDamage) {

                if (distance < 1.8) {

                    playerLives--;
                    document.getElementById("lives").innerText = "❤️ Vidas: " + playerLives;

                    if (playerLives <= 0) endGame();

                }

                enemy.hasDealtDamage = true;
            }

            if (elapsed > 800) {
                enemy.isAttacking = false;
            }

        }

        // movimiento + colisión
        const deltaPosition = enemy.velocity.clone().multiplyScalar(deltaTime);
        enemy.collider.translate(deltaPosition);

        const result = worldOctree.capsuleIntersect(enemy.collider);

        if (result) {
            enemy.collider.translate(result.normal.multiplyScalar(result.depth));
        }

        enemy.group.position.copy(enemy.collider.start);

        // rotación sin inclinarse
        const target = new THREE.Vector3(playerPos.x, enemy.group.position.y, playerPos.z);
        enemy.group.lookAt(target);

    });

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

    bullets.forEach((b, bIndex) => {

        enemies.forEach((enemy) => {

            if (!enemy || enemy.dead) return;

            const dist = b.sphere.collider.center.distanceTo(enemy.group.position);

            if (dist < 1.2) {

                // 💥 eliminar bala
                b.sphere.collider.center.set(0, -100, 0);
                b.sphere.velocity.set(0, 0, 0);
                bullets.splice(bIndex, 1);

                // ❤️ quitar vida al enemigo
                enemy.life--;

                console.log("Vida enemigo:", enemy.life);

                // 💀 si muere
                if (enemy.life <= 0 && !enemy.dead) {

                    enemy.dead = true;

                    // detener otras animaciones
                    for (const key in enemy.actions) {
                        if (enemy.actions[key] !== enemy.actions.die) {
                            enemy.actions[key].stop();
                        }
                    }

                    switchEnemyAction(enemy, enemy.actions.die);

                    // 📊 puntaje
                    score++;
                    document.getElementById("score").innerText = "Puntaje: " + score;

                    // 🚀 aumentar dificultad
                    if (score % 5 === 0) {
                        baseEnemySpeed += 2;
                    }

                    // 🔄 respawn
                    setTimeout(() => {
                        respawnEnemy(enemy);
                    }, 3000);
                }

            }

        });

    });

}

function killZombie() {

    zombieDead = true;

    switchAction(dieAction);

    setTimeout(() => {
        respawnZombie();
    }, 3000);

}

function respawnEnemy(enemy) {

    enemy.life = 5;
    enemy.dead = false;

    const x = (Math.random() - 0.5) * 20;
    const z = (Math.random() - 0.5) * 20;

    enemy.collider.start.set(x, 0.35, z);
    enemy.collider.end.set(x, 1.7, z);

    enemy.group.position.set(x, 0, z);

    // 🛑 DETENER TODAS LAS ANIMACIONES
    for (const key in enemy.actions) {
        enemy.actions[key].stop();
    }

    // ▶️ volver a correr desde cero
    const run = enemy.actions.run;
    run.reset().fadeIn(0.3).play();

    enemy.currentAction = run;

}

function endGame() {

    gameOver = true;

    console.log("💀 GAME OVER");

    document.getElementById("lives").innerText = "💀 GAME OVER";

    // detener movimiento del jugador
    playerVelocity.set(0, 0, 0);

}