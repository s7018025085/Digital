const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const sourcePath = path.join(__dirname, '..', 'assets', '480x480-amazfit-balance-2', 'Nabor.png')
const outputDir = path.join(__dirname, '..', 'assets', '480x480-amazfit-balance-2', 'icons')

// Nabor.png is an 8 x 5 sprite sheet (192 x 204 px cells).  These are the
// three glyphs used by the upper health rings.
const icons = [
  { name: 'heart-rate.png', cx: 1440, cy: 128 },
  { name: 'steps.png', cx: 288, cy: 128 },
  { name: 'calories.png', cx: 480, cy: 128 }
]

const SIZE = 144
const RADIUS = 16

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function pixelOffset(x, y) {
  return (y * SIZE + x) * 4
}

function boxBlur(input) {
  const horizontal = new Float32Array(SIZE * SIZE * 3)
  const output = new Float32Array(SIZE * SIZE * 3)

  for (let y = 0; y < SIZE; y++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        sum += input[pixelOffset(clamp(dx, 0, SIZE - 1), y) + channel]
      }
      for (let x = 0; x < SIZE; x++) {
        horizontal[(y * SIZE + x) * 3 + channel] = sum / (RADIUS * 2 + 1)
        const removeX = clamp(x - RADIUS, 0, SIZE - 1)
        const addX = clamp(x + RADIUS + 1, 0, SIZE - 1)
        sum += input[pixelOffset(addX, y) + channel] - input[pixelOffset(removeX, y) + channel]
      }
    }
  }

  for (let x = 0; x < SIZE; x++) {
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        sum += horizontal[(clamp(dy, 0, SIZE - 1) * SIZE + x) * 3 + channel]
      }
      for (let y = 0; y < SIZE; y++) {
        output[(y * SIZE + x) * 3 + channel] = sum / (RADIUS * 2 + 1)
        const removeY = clamp(y - RADIUS, 0, SIZE - 1)
        const addY = clamp(y + RADIUS + 1, 0, SIZE - 1)
        sum += horizontal[(addY * SIZE + x) * 3 + channel] - horizontal[(removeY * SIZE + x) * 3 + channel]
      }
    }
  }

  return output
}

function extractIcon(source, icon) {
  const result = new PNG({ width: SIZE, height: SIZE })
  const cropped = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sourceX = icon.cx - SIZE / 2 + x
      const sourceY = icon.cy - SIZE / 2 + y
      const from = (sourceY * source.width + sourceX) * 4
      const to = pixelOffset(x, y)
      cropped[to] = source.data[from]
      cropped[to + 1] = source.data[from + 1]
      cropped[to + 2] = source.data[from + 2]
      cropped[to + 3] = 255
    }
  }

  const background = boxBlur(cropped)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = pixelOffset(x, y)
      const difference = Math.abs(cropped[offset] - background[(y * SIZE + x) * 3])
        + Math.abs(cropped[offset + 1] - background[(y * SIZE + x) * 3 + 1])
        + Math.abs(cropped[offset + 2] - background[(y * SIZE + x) * 3 + 2])
      const alpha = clamp(Math.round((difference - 28) * 3.2), 0, 255)

      result.data[offset] = cropped[offset]
      result.data[offset + 1] = cropped[offset + 1]
      result.data[offset + 2] = cropped[offset + 2]
      result.data[offset + 3] = alpha
    }
  }

  return result
}

fs.mkdirSync(outputDir, { recursive: true })
const source = PNG.sync.read(fs.readFileSync(sourcePath))
for (const icon of icons) {
  fs.writeFileSync(path.join(outputDir, icon.name), PNG.sync.write(extractIcon(source, icon)))
}
