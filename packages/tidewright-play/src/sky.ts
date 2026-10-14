// The sky and the light: a physical sky (three's Preetham Sky) low in the late afternoon, the
// sun with shadows that follow the boat, the sky as the environment every material reflects,
// and the weather: as a storm builds the air thickens, the sun dims and the fog closes in.

import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { lerp } from "./noise.ts";

const SUN_ELEVATION = 13;
const SUN_AZIMUTH = 215;

export class Weather {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffe2bc, 3.0);
  readonly fill = new THREE.HemisphereLight(0xa8c8ff, 0x3a4438, 0.35);
  private readonly envSky = new Sky();
  private readonly envScene = new THREE.Scene();
  private readonly pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  private envStorm = -1;
  private readonly sunDir = new THREE.Vector3();
  private readonly fog = new THREE.FogExp2(0xd8c4a8, 0.00016);
  private readonly calmFog = new THREE.Color(0xd2c2aa);
  private readonly stormFog = new THREE.Color(0x5e666e);
  /** 0 calm .. 1 full storm. */
  storm = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sky.scale.setScalar(40000);
    scene.add(this.sky);
    this.envSky.scale.setScalar(50);
    this.envScene.add(this.envSky);
    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -45;
    cam.right = 45;
    cam.top = 45;
    cam.bottom = -45;
    cam.near = 1;
    cam.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.fill);
    scene.fog = this.fog;
    this.apply(scene, true);
  }

  /** Overcast is darker: the exposure for the storm. */
  get exposure(): number {
    return lerp(0.52, 0.3, this.storm);
  }

  /** The direction toward the sun. */
  get toSun(): THREE.Vector3 {
    return this.sunDir;
  }

  private setSky(sky: Sky, s: number): void {
    const u = sky.material.uniforms as Record<string, { value: unknown }>;
    (u.turbidity as { value: number }).value = lerp(3.2, 14, s);
    (u.rayleigh as { value: number }).value = lerp(1.6, 0.6, s);
    (u.mieCoefficient as { value: number }).value = lerp(0.006, 0.03, s);
    (u.mieDirectionalG as { value: number }).value = lerp(0.82, 0.6, s);
    (u.sunPosition as { value: THREE.Vector3 }).value.copy(this.sunDir);
  }

  /** Update the light for the storm; the environment is re-rendered only when it moved. */
  apply(scene: THREE.Scene, force = false): void {
    const s = this.storm;
    this.setSky(this.sky, s);
    this.sun.intensity = lerp(3.0, 0.5, s);
    this.sun.color.setHSL(0.09, lerp(0.75, 0.15, s), lerp(0.84, 0.7, s));
    this.fill.intensity = lerp(0.35, 0.7, s);
    this.fog.color.copy(this.calmFog).lerp(this.stormFog, s);
    this.fog.density = lerp(0.00016, 0.0011, s * s);
    if (force || Math.abs(s - this.envStorm) > 0.04) {
      this.setSky(this.envSky, s);
      this.env?.dispose();
      this.env = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      scene.environment = this.env.texture;
      scene.environmentIntensity = lerp(1, 0.5, s);
      this.envStorm = s;
    }
  }

  /** Keep the sun's shadow box on the boat. */
  follow(x: number, z: number): void {
    this.sun.position.set(x + this.sunDir.x * 200, this.sunDir.y * 200, z + this.sunDir.z * 200);
    this.sun.target.position.set(x, 0, z);
  }
}
