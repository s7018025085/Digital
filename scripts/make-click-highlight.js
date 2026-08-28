// Генератор PNG для кнопок-зон циферблата (виджет BUTTON, новый API).
// Для BUTTON нужна пара изображений: normal_src (прозрачное) и press_src
// (мягкая подсветка, показывается при нажатии). Размер каждой пары равен
// размеру зоны нажатия. Запуск: node scripts/make-click-highlight.js
//
// Размеры повторяют константы из watchface/index.js.

const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')

const OUT_DIR = path.join(__dirname, '..', 'assets', '480x480-amazfit-balance-2', 'icons')

const MAX_ALPHA = 45 // пиковая непрозрачность подсветки (0-255)

// [имя, ширина, высота] — по одной паре на каждую зону нажатия
const ZONES = [
  ['click_top', 120, 113],        // верхние колонки: пульс / калории
  ['click_steps', 120, 149],      // колонка шагов (зона выше — включает счётчик)
  ['click_time_hhmm', 260, 78],   // блок HH:MM → будильник
  ['click_time_sec', 136, 78],    // блок секунд → секундомер
  ['click_date', 280, 34],        // строка даты → сон
  ['click_bottom', 120, 130]      // нижние колонки: погода / батарея / SpO2
]

function writePng(w, h, file, alphaFn) {
  const png = new PNG({ width: w, height: h })
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const rx = w / 2
  const ry = h / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      const d = Math.sqrt(dx * dx + dy * dy)
      const alpha = alphaFn(d)

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

ZONES.forEach(([name, w, h]) => {
  // press-изображение: эллиптическое свечение
  writePng(w, h, name + '.png', (d) => (d >= 1 ? 0 : Math.round(MAX_ALPHA * (1 - d * d))))
  // normal-изображение: полностью прозрачное
  writePng(w, h, name + '_n.png', () => 0)
})

console.log('done:', OUT_DIR)

