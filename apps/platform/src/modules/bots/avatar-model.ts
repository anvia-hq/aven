import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Texture,
} from "three";

import { createAccessory } from "./avatar-accessories";
import { bodyOf, paintedBody } from "./avatar-body";
import type {
  AvatarAccessory,
  AvatarMaterials,
  AvatarModel,
  AvatarPose,
  EyeRig,
  FamilyShape,
  MouthRig,
} from "./types";

const TARGET = 4;
const MAX_WIDTH = 4.9;
const MAX_HEIGHT = 4.3;
const HOP_LIFT = 0.45;
const FRONT = new Vector3(0, 0, 1);
const TOP_ACCESSORIES = new Set<AvatarAccessory>([
  "beanie",
  "cap",
  "tophat",
  "headphones",
  "sprout",
  "halo",
]);

export function createAvatarMaterials(environment: Texture): AvatarMaterials {
  return {
    environment,
    clock: { value: 0 },
    eye: new SphereGeometry(1, 28, 20),
    white: new MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      envMap: environment,
      envMapIntensity: 0.5,
    }),
    pupil: new MeshPhysicalMaterial({
      color: "#04070f",
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      envMap: environment,
      envMapIntensity: 0.25,
    }),
    glint: new MeshBasicMaterial({ color: "#ffffff" }),
  };
}

function bodyMaterial(shared: AvatarMaterials, wobble: { value: number }) {
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    sheen: 0.15,
    sheenRoughness: 0.55,
    sheenColor: new Color("#ffffff"),
    envMap: shared.environment,
    envMapIntensity: 0.4,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWobble = wobble;
    shader.uniforms.uTime = shared.clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uWobble;\nuniform float uTime;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += normal * uWobble * sin(position.y * 2.6 + position.x * 1.9 + uTime * 17.0) * 0.06;",
      );
  };
  return material;
}

function addEyes(
  tilt: Group,
  shape: FamilyShape,
  base: ReturnType<typeof bodyOf>,
  shared: AvatarMaterials,
): EyeRig[] {
  return base.eyes.map((spot) => {
    const holder = new Group();
    holder.position.set(spot.position.x, spot.position.y, spot.position.z);
    holder.quaternion.setFromUnitVectors(
      FRONT,
      new Vector3(spot.normal.x, spot.normal.y, spot.normal.z),
    );
    holder.scale.setScalar(shape.eye.scale);

    const lid = new Group();
    const white = new Mesh(shared.eye, shared.white);
    white.scale.set(0.3, 0.42, 0.17);
    lid.add(white);

    const pupil = new Group();
    const dark = new Mesh(shared.eye, shared.pupil);
    dark.scale.set(0.17, 0.245, 0.075);
    const glint = new Mesh(shared.eye, shared.glint);
    glint.scale.setScalar(0.042);
    glint.position.set(0.055, 0.095, 0.066);
    const small = new Mesh(shared.eye, shared.glint);
    small.scale.setScalar(0.02);
    small.position.set(-0.05, -0.1, 0.07);
    pupil.add(dark, glint, small);
    pupil.position.z = 0.13;
    lid.add(pupil);

    holder.add(lid);
    tilt.add(holder);
    return { lid, pupil };
  });
}

function addMouth(
  tilt: Group,
  base: ReturnType<typeof bodyOf>,
  shared: AvatarMaterials,
): { rig: MouthRig; dispose(): void } {
  const spot = base.mouth;
  const group = new Group();
  group.position.set(spot.position.x, spot.position.y, spot.position.z);
  group.quaternion.setFromUnitVectors(
    FRONT,
    new Vector3(spot.normal.x, spot.normal.y, spot.normal.z),
  );
  group.scale.setScalar(spot.scale);

  const smileCurve = new QuadraticBezierCurve3(
    new Vector3(-0.22, 0.04, 0.01),
    new Vector3(0, -0.1, 0.03),
    new Vector3(0.22, 0.04, 0.01),
  );
  const smileGeo = new TubeGeometry(smileCurve, 18, 0.036, 10, false);
  const smile = new Mesh(smileGeo, shared.pupil);

  const open = new Group();
  const cavity = new Mesh(shared.eye, shared.pupil);
  cavity.scale.set(0.18, 0.16, 0.075);
  const tongueMat = new MeshPhysicalMaterial({
    color: "#ff6b9d",
    roughness: 0.35,
    clearcoat: 0.5,
    envMap: shared.environment,
    envMapIntensity: 0.3,
  });
  const tongue = new Mesh(shared.eye, tongueMat);
  tongue.scale.set(0.11, 0.075, 0.055);
  tongue.position.set(0, -0.07, 0.04);
  open.add(cavity, tongue);
  open.position.set(0, -0.02, 0.02);
  open.visible = false;

  group.add(smile, open);
  tilt.add(group);
  return {
    rig: { group, smile, open },
    dispose() {
      smileGeo.dispose();
      tongueMat.dispose();
    },
  };
}

export function createAvatarModel(
  shape: FamilyShape,
  color: string,
  shared: AvatarMaterials,
  accessoryKind: AvatarAccessory = "none",
): AvatarModel {
  const base = bodyOf(shape);
  const wobble = { value: 0 };
  const geometry = paintedBody(base, color);
  const material = bodyMaterial(shared, wobble);
  const width = base.maxX - base.minX;
  const height = base.maxY - base.minY;
  const hasTop = TOP_ACCESSORIES.has(accessoryKind);
  const headroom = hasTop ? 0.88 : 1;
  const scale =
    Math.min(TARGET / Math.sqrt(width * height), MAX_WIDTH / width, MAX_HEIGHT / height) * headroom;

  const tilt = new Group();
  tilt.position.y = -base.minY;
  tilt.add(new Mesh(geometry, material));
  const eyes = addEyes(tilt, shape, base, shared);
  const mouth = addMouth(tilt, base, shared);
  const accessory = createAccessory(accessoryKind, base, shared);

  if (accessory) tilt.add(accessory.root);

  const rig = new Group();
  rig.add(tilt);
  const root = new Group();
  root.add(rig);
  root.visible = false;

  return {
    root,
    rig,
    tilt,
    eyes,
    mouth: mouth.rig,
    accessory,
    wobble,
    scale,
    restY: (-height * scale) / 2 - (hasTop ? 0.24 : 0),
    dispose() {
      geometry.dispose();
      material.dispose();
      mouth.dispose();
      accessory?.dispose();
    },
  };
}

export function applyPose(model: AvatarModel, pose: AvatarPose) {
  const { rig, tilt, scale } = model;
  rig.position.y = model.restY + pose.lift * HOP_LIFT;
  rig.scale.set(scale * pose.scaleX, scale * pose.scaleY, scale * pose.scaleZ);
  tilt.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
  model.wobble.value = pose.wobble;

  for (const eye of model.eyes) {
    eye.lid.scale.set(1, Math.max(0.04, pose.eyeOpen), 1);
    eye.pupil.position.x = pose.gazeX * 0.085;
    eye.pupil.position.y = pose.gazeY * 0.1;
  }

  const open = Math.max(0, Math.min(1, pose.mouthOpen));
  model.mouth.smile.visible = open < 0.45;
  model.mouth.smile.scale.set(1 + open * 0.12, 1 - open * 0.4, 1);
  model.mouth.open.visible = open > 0.08;
  model.mouth.open.scale.set(0.65 + open * 0.45, Math.max(0.05, open), 1);

  if (model.accessory?.sway) model.accessory.sway.rotation.z = pose.accessoryTilt;

  if (model.accessory?.float) model.accessory.float.position.y = pose.accessoryBob;
}
