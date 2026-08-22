const { PNG } = require('pngjs')
const fs = require('fs')

const width = 350
const height = 80
const radius = 20
const fillR = 0x1A
const fillG = 0x36
const fillB = 0x5D
const fillA = Math.round(255 * 0.1)
const strokeR = 0xD4
const strokeG = 0xAF
const strokeB = 0x37
const strokeA = 255
const strokeWidth = 3

const png = new PNG({ width, height, fillColor: [0, 0, 0, 0] })

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const idx = (y * width + x) * 4
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

function fillRect(x0, y0, x1, y1, r, g, b, a) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(x, y, r, g, b, a)
    }
  }
}

function fillRoundedRect(x0, y0, x1, y1, rad, r, g, b, a) {
  fillRect(x0 + rad, y0, x1 - rad, y1, r, g, b, a)
  fillRect(x0, y0 + rad, x0 + rad, y1 - rad, r, g, b, a)
  fillRect(x1 - rad, y0 + rad, x1, y1 - rad, r, g, b, a)

  for (let y = y0; y < y0 + rad; y++) {
    for (let x = x0; x < x0 + rad; x++) {
      const dx = x - (x0 + rad - 1)
      const dy = y - (y0 + rad - 1)
      if (dx * dx + dy * dy <= rad * rad) {
        setPixel(x, y, r, g, b, a)
      }
    }
    for (let x = x1 - rad; x < x1; x++) {
      const dx = x - (x1 - rad)
      const dy = y - (y0 + rad - 1)
      if (dx * dx + dy * dy <= rad * rad) {
        setPixel(x, y, r, g, b, a)
      }
    }
  }

  for (let y = y1 - rad; y < y1; y++) {
    for (let x = x0; x < x0 + rad; x++) {
      const dx = x - (x0 + rad - 1)
      const dy = y - (y1 - rad)
      if (dx * dx + dy * dy <= rad * rad) {
        setPixel(x, y, r, g, b, a)
      }
    }
    for (let x = x1 - rad; x < x1; x++) {
      const dx = x - (x1 - rad)
      const dy = y - (y1 - rad)
      if (dx * dx + dy * dy <= rad * rad) {
        setPixel(x, y, r, g, b, a)
      }
    }
  }
}

function drawRoundedRectBorder(x0, y0, x1, y1, rad, lineWidth, r, g, b, a) {
  for (let w = 0; w < lineWidth; w++) {
    const innerX0 = x0 + w
    const innerY0 = y0 + w
    const innerX1 = x1 - w
    const innerY1 = y1 - w
    const innerR = Math.max(0, rad - w)

    for (let x = innerX0; x <= innerX1; x++) {
      setPixel(x, innerY0, r, g, b, a)
      setPixel(x, innerY1, r, g, b, a)
    }
    for (let y = innerY0; y <= innerY1; y++) {
      setPixel(innerX0, y, r, g, b, a)
      setPixel(innerX1, y, r, g, b, a)
    }

    for (let y = innerY0; y < innerY0 + innerR; y++) {
      for (let x = innerX0; x < innerX0 + innerR; x++) {
        const dx = x - (innerX0 + innerR - 1)
        const dy = y - (innerY0 + innerR - 1)
        if (dx * dx + dy * dy <= innerR * innerR) {
          setPixel(x, y, r, g, b, a)
        }
      }
      for (let x = innerX1 - innerR; x < innerX1; x++) {
        const dx = x - (innerX1 - innerR)
        const dy = y - (innerY0 + innerR - 1)
        if (dx * dx + dy * dy <= innerR * innerR) {
          setPixel(x, y, r, g, b, a)
        }
      }
    }

    for (let y = innerY1 - innerR; y < innerY1; y++) {
      for (let x = innerX0; x < innerX0 + innerR; x++) {
        const dx = x - (innerX0 + innerR - 1)
        const dy = y - (innerY1 - innerR)
        if (dx * dx + dy * dy <= innerR * innerR) {
          setPixel(x, y, r, g, b, a)
        }
      }
      for (let x = innerX1 - innerR; x < innerX1; x++) {
        const dx = x - (innerX1 - innerR)
        const dy = y - (innerY1 - innerR)
        if (dx * dx + dy * dy <= innerR * innerR) {
          setPixel(x, y, r, g, b, a)
        }
      }
    }
  }
}

fillRoundedRect(0, 0, width - 1, height - 1, radius, fillR, fillG, fillB, fillA)
drawRoundedRectBorder(0, 0, width - 1, height - 1, radius, strokeWidth, strokeR, strokeG, strokeB, strokeA)

const outPath = 'assets/time_bg.png'
fs.mkdirSync('assets', { recursive: true })
fs.writeFileSync(outPath, PNG.sync.write(png))
console.log('Saved', outPath, `${width}x${height}`)
