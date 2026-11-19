import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
} from "three";

import { bodyOf, paintedBody } from "./avatar-body";
import type { AvatarMaterials, AvatarModel, AvatarPose, EyeRig, FamilyShape } from "./types";

const TARGET = 4;
const MAX_WIDTH = 4.9;
const MAX_HEIGHT = 4.3;
const HOP_LIFT = 0.45;
const FRONT = new Vector3(0, 0, 1);

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

export function createAvatarModel(
  shape: FamilyShape,
  color: string,
  shared: AvatarMaterials,
): AvatarModel {
  const base = bodyOf(shape);
  const wobble = { value: 0 };
  const geometry = paintedBody(base, color);
  const material = bodyMaterial(shared, wobble);
  const width = base.maxX - base.minX;
  const height = base.maxY - base.minY;
  const scale = Math.min(
    TARGET / Math.sqrt(width * height),
    MAX_WIDTH / width,
    MAX_HEIGHT / height,
  );

  const tilt = new Group();
  tilt.position.y = -base.minY;
  tilt.add(new Mesh(geometry, material));
  const eyes = addEyes(tilt, shape, base, shared);

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
    wobble,
    scale,
    restY: (-height * scale) / 2,
    dispose() {
      geometry.dispose();
      material.dispose();
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
}
