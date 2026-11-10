export type ChristmasRole = 'snowflake' | 'star' | 'sparkle'
export type HalloweenRole = 'spider' | 'eyes' | 'ghost' | 'bat'

export interface SceneParticle {
  x: number
  y: number
  size: number
  opacity: number
  rotation: number
  baseX: number
  baseY: number
  phase: number
  role: ChristmasRole | HalloweenRole
  threadLength?: number
  lookAngle?: number
}

export interface SnowPile {
  x: number
  y: number
  size: number
  opacity: number
  createdAt: number
}

export function initAvatarFrameScene(frameType: string, canvasWidth: number, canvasHeight: number): SceneParticle[] {
  if (frameType === 'christmas') {
    return createChristmasScene(canvasWidth, canvasHeight)
  }
  if (frameType === 'halloween') {
    return createHalloweenScene(canvasWidth, canvasHeight)
  }
  return []
}

function createChristmasScene(canvasWidth: number, canvasHeight: number): SceneParticle[] {
  const particles: SceneParticle[] = []
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2
  const radius = canvasWidth * 0.35

  for (let index = 0; index < 8; index += 1) {
    particles.push({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      baseX: Math.random() * canvasWidth,
      baseY: -20 - Math.random() * 50,
      size: 6 + Math.random() * 6,
      opacity: 0.7 + Math.random() * 0.3,
      rotation: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      role: 'snowflake',
    })
  }

  const starPositions = [
    { angle: -Math.PI / 4, dist: 0.9 },
    { angle: -3 * Math.PI / 4, dist: 0.85 },
    { angle: Math.PI / 6, dist: 0.95 },
    { angle: 5 * Math.PI / 6, dist: 0.9 },
  ]

  starPositions.forEach((position, index) => {
    const x = centerX + Math.cos(position.angle) * radius * position.dist
    const y = centerY + Math.sin(position.angle) * radius * position.dist
    particles.push({
      x,
      y,
      baseX: x,
      baseY: y,
      size: 4 + Math.random() * 3,
      opacity: 0.8,
      rotation: 0,
      phase: index * (Math.PI / 2),
      role: 'star',
    })
  })

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2
    const x = centerX + Math.cos(angle) * radius * 0.75
    const y = centerY + Math.sin(angle) * radius * 0.75
    particles.push({
      x,
      y,
      baseX: x,
      baseY: y,
      size: 2 + Math.random() * 2,
      opacity: 0.6,
      rotation: 0,
      phase: Math.random() * Math.PI * 2,
      role: 'sparkle',
    })
  }

  return particles
}

function createHalloweenScene(canvasWidth: number, canvasHeight: number): SceneParticle[] {
  const particles: SceneParticle[] = []
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2

  const spiderPositions = [
    { x: canvasWidth * 0.15, threadLength: 40 + Math.random() * 30 },
    { x: canvasWidth * 0.85, threadLength: 30 + Math.random() * 25 },
  ]

  spiderPositions.forEach((position, index) => {
    particles.push({
      x: position.x,
      y: 10,
      baseX: position.x,
      baseY: 5,
      size: 10 + Math.random() * 4,
      opacity: 0.9,
      rotation: 0,
      phase: index * Math.PI,
      role: 'spider',
      threadLength: position.threadLength,
    })
  })

  const eyePositions = [
    { x: canvasWidth * 0.1, y: canvasHeight * 0.6 },
    { x: canvasWidth * 0.9, y: canvasHeight * 0.5 },
    { x: canvasWidth * 0.2, y: canvasHeight * 0.8 },
  ]

  eyePositions.forEach((position, index) => {
    particles.push({
      x: position.x,
      y: position.y,
      baseX: position.x,
      baseY: position.y,
      size: 5 + Math.random() * 3,
      opacity: 0.8,
      rotation: 0,
      phase: index * (Math.PI / 1.5),
      role: 'eyes',
      lookAngle: Math.random() * Math.PI * 2,
    })
  })

  for (let index = 0; index < 2; index += 1) {
    particles.push({
      x: centerX,
      y: centerY,
      baseX: centerX,
      baseY: centerY,
      size: 12 + Math.random() * 4,
      opacity: 0.85,
      rotation: 0,
      phase: index * Math.PI,
      role: 'bat',
    })
  }

  particles.push({
    x: canvasWidth * 0.8,
    y: canvasHeight * 0.3,
    baseX: canvasWidth * 0.8,
    baseY: canvasHeight * 0.3,
    size: 15,
    opacity: 0,
    rotation: 0,
    phase: 0,
    role: 'ghost',
  })

  return particles
}

export function animateAvatarFrameScene({
  canvas,
  frameType,
  particles,
  snowPiles,
  time,
}: {
  canvas: HTMLCanvasElement
  frameType: string
  particles: SceneParticle[]
  snowPiles: SnowPile[]
  time: number
}) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return snowPiles

  const width = canvas.width
  const height = canvas.height
  const seconds = time * 0.001
  const centerX = width / 2
  const centerY = height / 2
  const orbitRadius = width * 0.4

  ctx.clearRect(0, 0, width, height)

  for (const particle of particles) {
    switch (particle.role) {
      case 'snowflake': {
        particle.y += 0.5 + Math.sin(seconds + particle.phase) * 0.2
        particle.x = particle.baseX + Math.sin(seconds * 0.5 + particle.phase) * 8
        particle.rotation += 0.01

        const groundLevel = height * 0.85
        if (particle.y > groundLevel) {
          snowPiles.push({
            x: particle.x,
            y: groundLevel + Math.random() * 10,
            size: particle.size * 0.8,
            opacity: 0.9,
            createdAt: seconds,
          })
          particle.y = -20 - Math.random() * 30
          particle.baseX = Math.random() * width
          particle.x = particle.baseX
        }

        drawSnowflake(ctx, particle.x, particle.y, particle.size, particle.rotation, particle.opacity)
        break
      }
      case 'star':
        drawStar(ctx, particle.baseX, particle.baseY, particle.size, particle.phase, seconds)
        break
      case 'sparkle':
        drawSparkle(ctx, particle.baseX, particle.baseY, particle.size, particle.phase, seconds)
        break
      case 'spider': {
        const spiderY = particle.baseY + (particle.threadLength || 40) * (0.5 + Math.sin(seconds * 0.8 + particle.phase) * 0.4)
        drawSpider(ctx, particle.baseX, particle.baseY, spiderY, particle.size, seconds, particle.opacity)
        break
      }
      case 'eyes':
        drawEyes(ctx, particle.baseX, particle.baseY, particle.size, particle.phase, seconds, particle.lookAngle || 0)
        break
      case 'bat': {
        const batAngle = seconds * 0.8 + particle.phase
        const batX = centerX + Math.cos(batAngle) * orbitRadius
        const batY = centerY + Math.sin(batAngle) * orbitRadius * 0.6
        drawBat(ctx, batX, batY, particle.size, seconds, particle.opacity)
        break
      }
      case 'ghost':
        drawGhost(ctx, particle.baseX, particle.baseY, particle.size, seconds, particle.phase)
        break
    }
  }

  if (frameType !== 'christmas') {
    return snowPiles
  }

  let nextSnowPiles = snowPiles.filter((pile) => seconds - pile.createdAt < 3)
  nextSnowPiles.forEach((pile) => {
    const age = seconds - pile.createdAt
    const currentOpacity = pile.opacity * (1 - age / 3)
    drawSnowPile(ctx, pile.x, pile.y, pile.size, currentOpacity)
  })

  if (nextSnowPiles.length > 20) {
    nextSnowPiles = nextSnowPiles.slice(-15)
  }

  return nextSnowPiles
}

function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, opacity: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.globalAlpha = opacity

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.5, 'rgba(220, 240, 255, 0.9)')
  gradient.addColorStop(1, 'rgba(180, 220, 255, 0.3)')

  ctx.strokeStyle = gradient
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'

  for (let index = 0; index < 6; index += 1) {
    ctx.save()
    ctx.rotate((index * Math.PI) / 3)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -size)
    ctx.stroke()

    const branches = [0.35, 0.55, 0.75]
    branches.forEach((position, branchIndex) => {
      const branchSize = size * (0.35 - branchIndex * 0.08)
      ctx.beginPath()
      ctx.moveTo(0, -size * position)
      ctx.lineTo(branchSize, -size * position - branchSize * 0.5)
      ctx.moveTo(0, -size * position)
      ctx.lineTo(-branchSize, -size * position - branchSize * 0.5)
      ctx.stroke()
    })
    ctx.restore()
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, time: number) {
  const brightness = 0.4 + Math.sin(time * 3 + phase) * 0.4
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = brightness

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2)
  gradient.addColorStop(0, 'rgba(255, 255, 200, 1)')
  gradient.addColorStop(0.3, 'rgba(255, 230, 150, 0.6)')
  gradient.addColorStop(0.6, 'rgba(255, 200, 100, 0.2)')
  gradient.addColorStop(1, 'rgba(255, 180, 50, 0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 255, 220, 0.9)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  const rayLength = size * (1.5 + Math.sin(time * 5 + phase) * 0.3)
  ctx.beginPath()
  ctx.moveTo(-rayLength, 0)
  ctx.lineTo(rayLength, 0)
  ctx.moveTo(0, -rayLength)
  ctx.lineTo(0, rayLength)
  ctx.stroke()

  ctx.globalAlpha = brightness * 0.6
  const diagLength = rayLength * 0.6
  ctx.beginPath()
  ctx.moveTo(-diagLength, -diagLength)
  ctx.lineTo(diagLength, diagLength)
  ctx.moveTo(diagLength, -diagLength)
  ctx.lineTo(-diagLength, diagLength)
  ctx.stroke()
  ctx.restore()
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, time: number) {
  const brightness = 0.3 + Math.sin(time * 6 + phase) * 0.5
  if (brightness < 0.2) return

  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = brightness
  ctx.fillStyle = 'rgba(255, 255, 255, 1)'
  ctx.beginPath()
  ctx.arc(0, 0, size, 0, Math.PI * 2)
  ctx.fill()

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, size * 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSpider(ctx: CanvasRenderingContext2D, x: number, _y: number, bodyY: number, size: number, time: number, opacity: number) {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = 'rgba(180, 180, 180, 0.7)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, bodyY - size * 0.5)
  ctx.stroke()

  ctx.translate(x, bodyY)
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.ellipse(0, size * 0.3, size * 0.5, size * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -size * 0.2, size * 0.35, size * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, -size * 0.5, size * 0.25, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  for (let side = -1; side <= 1; side += 2) {
    for (let leg = 0; leg < 4; leg += 1) {
      const legPhase = time * 4 + leg * 0.5
      const legWobble = Math.sin(legPhase) * 0.15
      const startY = -size * 0.1 + leg * size * 0.15
      const midX = side * size * 0.6
      const midY = startY + size * 0.1 + legWobble * size
      const endX = side * size * 1.1
      const endY = startY + size * 0.4 + Math.sin(legPhase + 1) * size * 0.1
      ctx.beginPath()
      ctx.moveTo(0, startY)
      ctx.quadraticCurveTo(midX, midY, endX, endY)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#ff0000'
  ctx.beginPath()
  ctx.arc(-size * 0.08, -size * 0.55, size * 0.06, 0, Math.PI * 2)
  ctx.arc(size * 0.08, -size * 0.55, size * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(-size * 0.15, -size * 0.48, size * 0.04, 0, Math.PI * 2)
  ctx.arc(size * 0.15, -size * 0.48, size * 0.04, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, time: number, lookAngle: number) {
  const blinkCycle = (time + phase) % 4
  if (blinkCycle > 3.5) return

  const brightness = 0.5 + Math.sin(time * 2 + phase) * 0.3
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = brightness

  const eyeSpacing = size * 1.2
  const pupilOffset = Math.sin(time * 0.5 + lookAngle) * size * 0.2

  let gradient = ctx.createRadialGradient(-eyeSpacing / 2, 0, 0, -eyeSpacing / 2, 0, size * 1.5)
  gradient.addColorStop(0, 'rgba(255, 50, 0, 0.9)')
  gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)')
  gradient.addColorStop(1, 'rgba(200, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(-eyeSpacing / 2, 0, size * 1.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ff3300'
  ctx.beginPath()
  ctx.arc(-eyeSpacing / 2, 0, size * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(-eyeSpacing / 2 + pupilOffset, 0, size * 0.2, 0, Math.PI * 2)
  ctx.fill()

  gradient = ctx.createRadialGradient(eyeSpacing / 2, 0, 0, eyeSpacing / 2, 0, size * 1.5)
  gradient.addColorStop(0, 'rgba(255, 50, 0, 0.9)')
  gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)')
  gradient.addColorStop(1, 'rgba(200, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(eyeSpacing / 2, 0, size * 1.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ff3300'
  ctx.beginPath()
  ctx.arc(eyeSpacing / 2, 0, size * 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(eyeSpacing / 2 + pupilOffset, 0, size * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, opacity: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = opacity
  const wingAngle = Math.sin(time * 15) * 0.5
  ctx.fillStyle = '#0a0a0a'

  ctx.save()
  ctx.rotate(-wingAngle - 0.3)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-size * 0.3, -size * 0.4, -size * 0.8, -size * 0.2, -size * 1.3, 0)
  ctx.bezierCurveTo(-size * 1.1, size * 0.15, -size * 0.7, size * 0.2, -size * 0.4, size * 0.1)
  ctx.bezierCurveTo(-size * 0.6, size * 0.25, -size * 0.9, size * 0.2, -size * 1.1, size * 0.15)
  ctx.lineTo(0, 0)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.rotate(wingAngle + 0.3)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(size * 0.3, -size * 0.4, size * 0.8, -size * 0.2, size * 1.3, 0)
  ctx.bezierCurveTo(size * 1.1, size * 0.15, size * 0.7, size * 0.2, size * 0.4, size * 0.1)
  ctx.bezierCurveTo(size * 0.6, size * 0.25, size * 0.9, size * 0.2, size * 1.1, size * 0.15)
  ctx.lineTo(0, 0)
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.25, size * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-size * 0.12, -size * 0.3)
  ctx.lineTo(-size * 0.2, -size * 0.55)
  ctx.lineTo(-size * 0.05, -size * 0.35)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(size * 0.12, -size * 0.3)
  ctx.lineTo(size * 0.2, -size * 0.55)
  ctx.lineTo(size * 0.05, -size * 0.35)
  ctx.fill()

  ctx.fillStyle = '#ff6600'
  ctx.beginPath()
  ctx.arc(-size * 0.08, -size * 0.15, size * 0.06, 0, Math.PI * 2)
  ctx.arc(size * 0.08, -size * 0.15, size * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, phase: number) {
  const cycle = (time + phase) % 6
  let opacity = 0
  if (cycle < 1) opacity = cycle
  else if (cycle < 3) opacity = 1
  else if (cycle < 4) opacity = 1 - (cycle - 3)
  if (opacity < 0.05) return

  const wobble = Math.sin(time * 3) * 3
  ctx.save()
  ctx.translate(x + wobble, y)
  ctx.globalAlpha = opacity * 0.7

  const gradient = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 1.2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.6, 'rgba(200, 220, 255, 0.6)')
  gradient.addColorStop(1, 'rgba(150, 180, 255, 0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(-size * 0.6, size * 0.5)
  for (let index = 0; index < 4; index += 1) {
    const waveX = -size * 0.6 + (index + 1) * size * 0.3
    const waveY = size * 0.5 + Math.sin(time * 5 + index) * size * 0.1
    ctx.quadraticCurveTo(waveX - size * 0.15, waveY + size * 0.15, waveX, waveY)
  }
  ctx.lineTo(size * 0.6, -size * 0.1)
  ctx.quadraticCurveTo(size * 0.4, -size * 0.7, 0, -size * 0.6)
  ctx.quadraticCurveTo(-size * 0.4, -size * 0.7, -size * 0.6, -size * 0.1)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.beginPath()
  ctx.ellipse(-size * 0.2, -size * 0.15, size * 0.1, size * 0.15, 0, 0, Math.PI * 2)
  ctx.ellipse(size * 0.2, -size * 0.15, size * 0.1, size * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, size * 0.1, size * 0.08, size * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSnowPile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number) {
  if (opacity < 0.05) return
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = opacity

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.5, 'rgba(220, 240, 255, 0.7)')
  gradient.addColorStop(1, 'rgba(200, 220, 255, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 1.2, size * 0.6, 0, Math.PI, 0)
  ctx.fill()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.arc(-size * 0.3, -size * 0.2, size * 0.15, 0, Math.PI * 2)
  ctx.arc(size * 0.2, -size * 0.15, size * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
