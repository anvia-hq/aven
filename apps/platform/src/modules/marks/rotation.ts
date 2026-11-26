import type { Mat3, Vec3 } from "./types";

export const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function multiply(left: Mat3, right: Mat3): Mat3 {
  const cell = (row: number, column: number) =>
    left[row]![0]! * right[0]![column]! +
    left[row]![1]! * right[1]![column]! +
    left[row]![2]! * right[2]![column]!;
  return [
    [cell(0, 0), cell(0, 1), cell(0, 2)],
    [cell(1, 0), cell(1, 1), cell(1, 2)],
    [cell(2, 0), cell(2, 1), cell(2, 2)],
  ];
}

export function turnAbout(axis: "x" | "y" | "z", angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  if (axis === "x") {
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];
  }

  if (axis === "y") {
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];
  }

  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

export function apply(matrix: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
    matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
    matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
  ];
}

export const TAU = Math.PI * 2;

export function viewAt(turn: number): Mat3 {
  return multiply(turnAbout("x", 0.6155), turnAbout("y", Math.PI / 4 + TAU * turn));
}
