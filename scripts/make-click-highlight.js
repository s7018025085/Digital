// Генератор полупрозрачных PNG-подсветок для IMG_CLICK-зон циферблата.
// IMG_CLICK показывает src в момент нажатия (см. docs: "Image to be displayed
// when clicked"), поэтому каждой зоне нужен PNG её точного размера.
// Запуск: node scripts/make-click-highlight.js
//
// Размеры повторяют константы из watchface/index.js:
//   верхние колонки   120x113  (y 60..173)
//   нижние колонки    120x130  (y 308..438)
//   блок HH:MM        260x78   (y 175..253)
//   блок секунд       136x78   (y 175..253)
//   строка даты       280x34   (y 256..290)

const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const OUT_DIR = path.join(__dirname, '..', 'assets', '480x480-amazfit-balance-2', 'icons')

const MAX_ALPHA = 45 // пиковая непрозрачность подсветки (0-255), едва заметная вспышка

function makeGlow(w, h, file) {
  const png = new PNG({ width: w, height: h })
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const rx = w / 2
  const ry = h / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Нормированное расстояние до границы эллипса (0 в центре, 1 на краю)
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      const alpha = d >= 1 ? 0 : Math.round(MAX_ALPHA * (1 - d * d))

      const idx = (y * w + x) * 4
      png.data[idx + 0] = 0x66 // мягкий бело-голубой оттенок
      png.data[idx + 1] = 0xd9
      png.data[idx + 2] = 0xff
      png.data[idx + 3] = alpha
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, file), PNG.sync.write(png))
  console.log('created', file, w + 'x' + h)
}

const IMAGES = [
  [120, 113, 'click_top.png'],
  [120, 130, 'click_bottom.png'],
  [260, 78, 'click_time_hhmm.png'],
  [136, 78, 'click_time_sec.png'],
  [280, 34, 'click_date.png']
]

IMAGES.forEach(([w, h, file]) => makeGlow(w, h, file))
console.log('done:', OUT_DIR)
