import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";

import type { AccessoryRig, AvatarAccessory, AvatarMaterials, BodyBase } from "./types";

const FRONT = new Vector3(0, 0, 1);

function tracker() {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  return {
    geo<T extends BufferGeometry>(item: T): T {
      geometries.push(item);
      return item;
    },
    mat<T extends Material>(item: T): T {
      materials.push(item);
      return item;
    },
    dispose() {
      for (const item of geometries) item.dispose();
      for (const item of materials) item.dispose();
    },
  };
}

function physical(
  shared: AvatarMaterials,
  color: string,
  options: {
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
    emissive?: string;
    emissiveIntensity?: number;
  } = {},
) {
  return new MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.42,
    metalness: options.metalness ?? 0.05,
    clearcoat: options.clearcoat ?? 0.35,
    clearcoatRoughness: 0.35,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0,
    envMap: shared.environment,
    envMapIntensity: 0.45,
  });
}

function buildBeanie(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.top.x, base.top.y - 0.18, -0.04);
  root.rotation.x = -0.14;

  const knit = own.mat(physical(shared, "#e84a5f", { roughness: 0.72, clearcoat: 0.1 }));
  const trim = own.mat(physical(shared, "#ff7582", { roughness: 0.68, clearcoat: 0.12 }));

  const dome = new Mesh(
    own.geo(new SphereGeometry(0.72, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    knit,
  );
  dome.scale.set(1.06, 0.92, 0.95);
  const brim = new Mesh(own.geo(new TorusGeometry(0.72, 0.14, 14, 32)), trim);
  brim.rotation.x = Math.PI / 2;
  brim.scale.set(1.04, 0.94, 1);
  const pom = new Mesh(own.geo(new SphereGeometry(0.22, 20, 16)), trim);
  pom.position.set(0, 0.72, -0.04);

  root.add(dome, brim, pom);
  return { root, dispose: own.dispose };
}

function buildCap(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.top.x, base.top.y - 0.16, 0.04);
  root.rotation.x = -0.1;

  const cloth = own.mat(physical(shared, "#2563eb", { roughness: 0.58, clearcoat: 0.15 }));
  const visorMat = own.mat(physical(shared, "#1d4ed8", { roughness: 0.45, clearcoat: 0.25 }));

  const dome = new Mesh(
    own.geo(new SphereGeometry(0.74, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52)),
    cloth,
  );
  dome.scale.set(1.04, 0.82, 0.96);
  const button = new Mesh(own.geo(new SphereGeometry(0.09, 14, 10)), visorMat);
  button.position.set(0, 0.62, 0);

  const visor = new Mesh(
    own.geo(new CylinderGeometry(0.66, 0.72, 0.09, 28, 1, false, -Math.PI * 0.45, Math.PI * 0.9)),
    visorMat,
  );
  visor.position.set(0, 0.02, 0.46);
  visor.rotation.x = 0.16;
  visor.scale.set(1.02, 1, 0.85);

  root.add(dome, button, visor);
  return { root, dispose: own.dispose };
}

function buildTopHat(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.top.x + 0.08, base.top.y - 0.06, 0.02);
  root.rotation.set(-0.08, 0, -0.12);

  const felt = own.mat(physical(shared, "#1f2430", { roughness: 0.62, clearcoat: 0.18 }));
  const ribbon = own.mat(
    physical(shared, "#f59e0b", { roughness: 0.32, metalness: 0.25, clearcoat: 0.4 }),
  );

  const brim = new Mesh(own.geo(new CylinderGeometry(0.86, 0.88, 0.08, 32)), felt);
  brim.scale.set(1, 1, 0.92);
  const crown = new Mesh(own.geo(new CylinderGeometry(0.56, 0.5, 0.78, 28)), felt);
  crown.position.y = 0.42;
  const band = new Mesh(own.geo(new CylinderGeometry(0.525, 0.51, 0.16, 28)), ribbon);
  band.position.y = 0.13;

  root.add(brim, crown, band);
  return { root, dispose: own.dispose };
}

function buildEyewear(base: BodyBase, shared: AvatarMaterials, shades: boolean): AccessoryRig {
  const own = tracker();
  const root = new Group();
  const [leftEye, rightEye] = base.eyes;

  if (!leftEye || !rightEye) return { root, dispose: own.dispose };

  const frame = own.mat(
    physical(shared, shades ? "#141820" : "#272d3a", {
      roughness: shades ? 0.22 : 0.28,
      metalness: shades ? 0.2 : 0.55,
      clearcoat: 0.65,
    }),
  );
  const lensMat = shades
    ? own.mat(physical(shared, "#0f172a", { roughness: 0.12, metalness: 0.35, clearcoat: 0.95 }))
    : null;

  const radius = 0.42 * leftEye.scale;
  const tube = shades ? 0.06 : 0.045;
  const ringGeo = own.geo(new TorusGeometry(radius, tube, 14, 32));
  const lensGeo = lensMat
    ? own.geo(new CylinderGeometry(radius * 0.94, radius * 0.94, 0.04, 28))
    : null;

  for (const eye of [leftEye, rightEye]) {
    const holder = new Group();
    holder.position.set(eye.position.x, eye.position.y, eye.position.z + 0.22 * eye.scale);
    holder.quaternion.setFromUnitVectors(
      FRONT,
      new Vector3(eye.normal.x, eye.normal.y, eye.normal.z),
    );
    holder.add(new Mesh(ringGeo, frame));

    if (lensGeo && lensMat) {
      const lens = new Mesh(lensGeo, lensMat);
      lens.rotation.x = Math.PI / 2;
      holder.add(lens);
    }

    root.add(holder);
  }

  const gap = Math.max(0.08, rightEye.position.x - leftEye.position.x - radius * 1.85);
  const bridge = new Mesh(own.geo(new CylinderGeometry(tube * 0.72, tube * 0.72, gap, 12)), frame);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(
    (leftEye.position.x + rightEye.position.x) / 2,
    (leftEye.position.y + rightEye.position.y) / 2 + 0.04,
    Math.max(leftEye.position.z, rightEye.position.z) + 0.22 * leftEye.scale,
  );
  root.add(bridge);

  return { root, dispose: own.dispose };
}

function buildHeadphones(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();

  const bandMat = own.mat(
    physical(shared, "#272d3a", { roughness: 0.35, metalness: 0.3, clearcoat: 0.5 }),
  );
  const cupMat = own.mat(
    physical(shared, "#38bdf8", { roughness: 0.28, metalness: 0.15, clearcoat: 0.6 }),
  );
  const padMat = own.mat(physical(shared, "#111622", { roughness: 0.75, clearcoat: 0.08 }));

  const halfSpan = (base.right.x - base.left.x) / 2 + 0.12;
  const centerX = (base.left.x + base.right.x) / 2;
  const earY = base.left.y;
  const archHeight = Math.max(0.8, base.top.y - earY + 0.24);

  const band = new Mesh(own.geo(new TorusGeometry(1, 0.095, 14, 36, Math.PI)), bandMat);
  band.position.set(centerX, earY, 0);
  band.scale.set(halfSpan, archHeight, 1);
  root.add(band);

  const cupGeo = own.geo(new CylinderGeometry(0.32, 0.36, 0.24, 24));
  const padGeo = own.geo(new TorusGeometry(0.3, 0.09, 12, 24));

  for (const side of [-1, 1]) {
    const cupGroup = new Group();
    cupGroup.position.set(centerX + side * (halfSpan + 0.02), earY, 0.04);
    const cup = new Mesh(cupGeo, cupMat);
    cup.rotation.z = (side * Math.PI) / 2;
    const pad = new Mesh(padGeo, padMat);
    pad.rotation.y = Math.PI / 2;
    pad.position.x = -side * 0.11;
    cupGroup.add(cup, pad);
    root.add(cupGroup);
  }

  return { root, dispose: own.dispose };
}

function buildSprout(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.top.x, base.top.y - 0.08, 0);

  const sway = new Group();
  const stemMat = own.mat(physical(shared, "#16a34a", { roughness: 0.45, clearcoat: 0.3 }));
  const leafMat = own.mat(physical(shared, "#4ade80", { roughness: 0.35, clearcoat: 0.45 }));

  const curve = new QuadraticBezierCurve3(
    new Vector3(0, 0, 0),
    new Vector3(0.06, 0.35, 0.02),
    new Vector3(0, 0.64, 0),
  );
  const stem = new Mesh(own.geo(new TubeGeometry(curve, 14, 0.06, 10, false)), stemMat);

  const leafGeo = own.geo(new SphereGeometry(0.28, 18, 14));
  const leftLeaf = new Mesh(leafGeo, leafMat);
  leftLeaf.scale.set(1.25, 0.48, 0.72);
  leftLeaf.position.set(-0.28, 0.66, 0.02);
  leftLeaf.rotation.z = 0.42;

  const rightLeaf = new Mesh(leafGeo, leafMat);
  rightLeaf.scale.set(1.15, 0.44, 0.68);
  rightLeaf.position.set(0.26, 0.62, -0.02);
  rightLeaf.rotation.z = -0.5;

  sway.add(stem, leftLeaf, rightLeaf);
  root.add(sway);
  return { root, sway, dispose: own.dispose };
}

function buildHalo(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.top.x, base.top.y + 0.36, 0);

  const float = new Group();
  const gold = own.mat(
    physical(shared, "#fde047", {
      roughness: 0.18,
      metalness: 0.55,
      clearcoat: 0.8,
      emissive: "#facc15",
      emissiveIntensity: 0.45,
    }),
  );

  const ring = new Mesh(own.geo(new TorusGeometry(0.68, 0.085, 16, 36)), gold);
  ring.rotation.x = Math.PI / 2 - 0.18;
  float.add(ring);
  root.add(float);
  return { root, float, dispose: own.dispose };
}

function buildBowtie(base: BodyBase, shared: AvatarMaterials): AccessoryRig {
  const own = tracker();
  const root = new Group();
  root.position.set(base.chin.position.x, base.chin.position.y, base.chin.position.z + 0.08);
  root.quaternion.setFromUnitVectors(
    FRONT,
    new Vector3(base.chin.normal.x, base.chin.normal.y, base.chin.normal.z),
  );
  root.scale.setScalar(base.chin.scale);

  const silk = own.mat(physical(shared, "#e11d48", { roughness: 0.38, clearcoat: 0.35 }));
  const knotMat = own.mat(physical(shared, "#be123c", { roughness: 0.35, clearcoat: 0.4 }));

  const wingGeo = own.geo(new ConeGeometry(0.22, 0.42, 16));
  const leftWing = new Mesh(wingGeo, silk);
  leftWing.rotation.z = -Math.PI / 2;
  leftWing.scale.set(1, 1, 0.45);
  leftWing.position.x = -0.22;

  const rightWing = new Mesh(wingGeo, silk);
  rightWing.rotation.z = Math.PI / 2;
  rightWing.scale.set(1, 1, 0.45);
  rightWing.position.x = 0.22;

  const knot = new Mesh(own.geo(new SphereGeometry(0.11, 14, 12)), knotMat);
  knot.scale.set(0.95, 1.05, 0.7);

  root.add(leftWing, rightWing, knot);
  return { root, dispose: own.dispose };
}

export function createAccessory(
  kind: AvatarAccessory,
  base: BodyBase,
  shared: AvatarMaterials,
): AccessoryRig | null {
  switch (kind) {
    case "none":
      return null;
    case "beanie":
      return buildBeanie(base, shared);
    case "cap":
      return buildCap(base, shared);
    case "tophat":
      return buildTopHat(base, shared);
    case "glasses":
      return buildEyewear(base, shared, false);
    case "shades":
      return buildEyewear(base, shared, true);
    case "headphones":
      return buildHeadphones(base, shared);
    case "sprout":
      return buildSprout(base, shared);
    case "halo":
      return buildHalo(base, shared);
    case "bowtie":
      return buildBowtie(base, shared);
  }
}
