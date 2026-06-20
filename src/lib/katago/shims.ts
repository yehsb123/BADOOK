// 외부 의존성 shim
export type Player = 'black' | 'white';
export type Intersection = Player | null;
export type BoardState = Intersection[][];
export type GameRules = 'japanese' | 'chinese' | 'korean';
export type KataGoBackendPreference = 'wasm' | 'webgpu' | 'cpu';
export type FloatArray = Float32Array | number[];

export interface Move {
  x: number;
  y: number;
  player: Player;
}

export type RegionOfInterest = { xMin: number; xMax: number; yMin: number; yMax: number };

export const getOpponent = (player: Player): Player => player === 'black' ? 'white' : 'black';

export function publicUrl(path: string): string {
  return '/' + (path.startsWith('/') ? path.slice(1) : path);
}

export function getAnimationNow(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

export function getWorkerConstructor(): typeof Worker | null {
  try {
    return typeof globalThis.Worker === 'function' ? globalThis.Worker : null;
  } catch {
    return null;
  }
}
