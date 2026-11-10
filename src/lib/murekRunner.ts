import { RUNNER_MAX_SPEED, RUNNER_POINTS_PER_PX } from './gameClock'

/*
 * Mürek Run engine: pure, frame-independent (dt) simulation. Drawing and input are on the page; here only
 * physics, obstacle generation, collision and score. Score = distance covered * RUNNER_POINTS_PER_PX; at top
 * speed ~9.75 points per second (server cap 12 points/s).
 */

export const RUNNER_WORLD = { width: 720, height: 220, groundY: 184, murekX: 72, murekSize: 64 } as const

const GRAVITY = 2600
const JUMP_VELOCITY = -900
const START_SPEED = 360
const SPEED_RAMP = 9

export type RunnerObstacleKind = 'blot' | 'bottle' | 'double'

export interface RunnerObstacle { x: number, w: number, h: number, kind: RunnerObstacleKind }

export interface RunnerState {
  time: number
  speed: number
  distance: number
  y: number
  vy: number
  obstacles: RunnerObstacle[]
  nextSpawn: number
  over: boolean
}

const SHAPES: Record<RunnerObstacleKind, { w: number, h: number }> = {
  blot: { w: 30, h: 26 },
  bottle: { w: 26, h: 50 },
  double: { w: 62, h: 26 },
}

export function createRunnerState(): RunnerState {
  return { time: 0, speed: START_SPEED, distance: 0, y: 0, vy: 0, obstacles: [], nextSpawn: 420, over: false }
}

export function runnerScore(state: RunnerState): number {
  return Math.floor(state.distance * RUNNER_POINTS_PER_PX)
}

export function jump(state: RunnerState) {
  if (state.over || state.y < 0) return
  state.vy = JUMP_VELOCITY
}

function pickKind(random: () => number, time: number): RunnerObstacleKind {
  const roll = random()
  if (time > 20 && roll > 0.72) return 'double'
  if (roll > 0.45) return 'bottle'
  return 'blot'
}

/** Advances one step; on collision state.over = true. dt is in seconds, capped at 0.05. */
export function stepRunner(state: RunnerState, rawDt: number, random: () => number = Math.random) {
  if (state.over) return
  const dt = Math.min(Math.max(rawDt, 0), 0.05)
  state.time += dt
  state.speed = Math.min(RUNNER_MAX_SPEED, START_SPEED + SPEED_RAMP * state.time)
  const dx = state.speed * dt
  state.distance += dx

  // Dikey hareket: y <= 0 havada (yukari negatif).
  state.vy += GRAVITY * dt
  state.y = Math.min(0, state.y + state.vy * dt)
  if (state.y === 0 && state.vy > 0) state.vy = 0

  for (const obstacle of state.obstacles) obstacle.x -= dx
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10)

  state.nextSpawn -= dx
  if (state.nextSpawn <= 0) {
    const kind = pickKind(random, state.time)
    state.obstacles.push({ x: RUNNER_WORLD.width + 10, kind, ...SHAPES[kind] })
    // Ziplanabilir bosluk: hiz arttikca aralik da buyur (en az ~0.75 sn'lik yol).
    state.nextSpawn = state.speed * (0.75 + random() * 0.9) + SHAPES[kind].w
  }

  // Carpisma: Murek'in govde kutusu (kenarlardan biraz iceride, affedici).
  const left = RUNNER_WORLD.murekX + 14
  const right = RUNNER_WORLD.murekX + RUNNER_WORLD.murekSize - 14
  const bottom = RUNNER_WORLD.groundY + state.y - 4
  for (const obstacle of state.obstacles) {
    const top = RUNNER_WORLD.groundY - obstacle.h + 4
    if (obstacle.x < right && obstacle.x + obstacle.w > left && bottom > top) {
      state.over = true
      break
    }
  }
}

/** Concrete color mix for the canvas (we do not rely on canvas color-mix). */
export function mixHex(a: string, b: string, weightA: number): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '')
    const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
    return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16))
  }
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  const mix = (x: number, y: number) => Math.round(x * weightA + y * (1 - weightA))
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
