import { createWidget, widget, align, prop } from '@zos/ui'
import { HeartRate, Step, Battery, SpO2 } from '@zos/sensor'
import { setInterval, clearInterval } from '@zos/timer'

// ============================================================
// МАКЕТ
// ============================================================
// Все позиции ниже проверены вручную относительно радиуса
// безопасной зоны круглого экрана (R_SAFE), чтобы ничего не
// обрезалось корпусом. Если двигаете элементы, держите их
// внутри R_SAFE от CENTER_X/CENTER_Y.

const SCREEN_W = 480
const SCREEN_H = 480
const CENTER_X = 240
const CENTER_Y = 240  
const R_SAFE = 228 // полезный радиус до того, как край экрана начнёт обрезать контент

// Компактная верхняя статистика, вдохновлённая тремя маленькими
// циферблатами из образца. Подъём вверх оставляет чистый визуальный
// зазор перед увеличенным отображением времени.
const TOP_CY = 95
const TOP_R = 29
const TOP_GLOW_R = 32
const TOP_LINE_W = 5

// Иконки остаются внутри своих циферблатов; значения и подписи
// образуют две чёткие строки прямо под ними, как в образце.
const TOP_ICON_CY = TOP_CY + 1
const TOP_VALUE_CY = TOP_CY + TOP_R + 16
const TOP_LABEL_CY = TOP_VALUE_CY + 21

const HR_CX = 160
const STEPS_CX = 240
const BAT_CX = 320

// Основное время — собрано как одна центрированная строка: [HH:MM] [:] [S-десятки] [S-единицы]
// HH:MM выровнено по правому краю внутри своего блока, поэтому не нужно
// угадывать его точную отрисованную ширину — последний символ всегда
// прижат к TIME_HHMM_RIGHT независимо от метрик шрифта. Две цифры секунд —
// блоки фиксированной ширины с центрированным текстом, поэтому одиночные
// глифы тоже всегда центрированы. Только общая зарезервированная ширина
// (TIME_HHMM_BOX_W и т.д.) — примерная оценка для центрирования всей строки;
// если строка сдвинута влево/вправо целиком, подправьте TIME_HHMM_BOX_W ниже.
const TIME_CY = 214
// У Rostex широкие глифы, поэтому эти размеры резервируют достаточно места
// для полной строки HH:MM:SS на экране 480 px без обрезки первой цифры.
const TIME_FONT_SIZE = 58
const TIME_SHADOW_OFFSET = 2
const TIME_ROW_H = TIME_FONT_SIZE + 20

// Мягкое свечение за временем: несколько тусклых копий со смещением 1-2px
// в каждую сторону, нарисованных под тенью/основным текстом. Дешёвая
// имитация свечения — у виджетов текста Zepp OS нет альфа-смешивания,
// поэтому настоящее размытие невозможно.
const TIME_GLOW_COLOR = 0x0b5b6d
const TIME_GLOW_OFFSETS = [
  [-2, 0], [2, 0], [0, -2], [0, 2],
  [-1, -1], [1, -1], [-1, 1], [1, 1]
]

// Оставляем большой запас для широких глифов HH:MM в Rostex; иначе Zepp OS
// посчитает текст выходящим за пределы и запустит бегущую строку.
const TIME_HHMM_BOX_W = 260
const TIME_COLON_W = 24
const TIME_SEC_DIGIT_W = 56
const TIME_ROLL_MASK_PADDING = 16

const TIME_ROW_TOTAL_W = TIME_HHMM_BOX_W + TIME_COLON_W + TIME_SEC_DIGIT_W * 2
// Глифы HH:MM в Rostex визуально тяжелее справа, поэтому небольшая
// оптическая поправка держит отображаемое время по центру круглого экрана.
const TIME_ROW_LEFT = CENTER_X - TIME_ROW_TOTAL_W / 2 - 10

const TIME_HHMM_X = TIME_ROW_LEFT
const TIME_HHMM_RIGHT = TIME_HHMM_X + TIME_HHMM_BOX_W
const TIME_COLON_X = TIME_HHMM_RIGHT
const TIME_SEC_TENS_X = TIME_COLON_X + TIME_COLON_W
const TIME_SEC_UNITS_X = TIME_SEC_TENS_X + TIME_SEC_DIGIT_W

// Тайминги анимации «механического счётчика» с прокруткой цифр
const ROLL_DURATION_MS = 260
const ROLL_STEP_MS = 26
const ROLL_STEPS = Math.round(ROLL_DURATION_MS / ROLL_STEP_MS)

// Блок даты — день недели и дата теперь рисуются одной центрированной строкой
const DATE_LINE_CY = 270
const DATE_LINE_FONT_SIZE = 24

// Незаметные горизонтальные разделители визуально отделяют компактную
// верхнюю статистику, время и дату, не конкурируя с метками на корпусе.
const SECTION_LINE_X = 78
const SECTION_LINE_W = SCREEN_W - SECTION_LINE_X * 2
const TOP_TIME_LINE_Y = 168
const TIME_DATE_LINE_Y = 264
const DATE_BOTTOM_LINE_Y = 318

// Нижние информационные блоки (Погода / Батарея / Кислород). Кольца ниже
// повторяют стиль верхних, но компактнее и приподняты, чтобы круглый край
// не обрезал значения и подписи — это самый плотный ряд на экране.
const BOTTOM_ICON_CY = 382
const BOTTOM_VALUE_CY = 390
const BOTTOM_LABEL_CY = 410
const BOTTOM_BLOCK_W = 96

const BOTTOM_RING_CY = 356
const BOTTOM_RING_R = 26
const BOTTOM_RING_GLOW_R = 29
const BOTTOM_RING_LINE_W = 4
const BOTTOM_VALUE_BOX_Y = 386
const BOTTOM_VALUE_BOX_H = 22
const BOTTOM_LABEL_BOX_Y = 410
const BOTTOM_LABEL_BOX_H = 16

const WEATHER_CX = 134
const BAT2_CX = 240
const OXY_CX = 346

// Метки на корпусе
const TICK_R = 222
const TICK_R_OUTER = 234

// ============================================================
// ЦВЕТА
// ============================================================

const COLOR_BG = 0x05070a
const COLOR_WHITE = 0xf5f5f5
const COLOR_CYAN = 0x00d9ff
const COLOR_SEC = 0x00d9ff
const COLOR_RED = 0xff3b30
const COLOR_PURPLE = 0xa970ff
const COLOR_YELLOW = 0xffd60a
const COLOR_GREEN = 0x30d158
const COLOR_GRAY = 0x8d959d
const COLOR_TRACK = 0x1c1f24
const COLOR_GLOW = 0x14181d
const COLOR_TICK_DIM = 0x30343a
const COLOR_SHADOW = 0x000000
const COLOR_DIVIDER = 0x2a2d34
const FONT_LABEL = 'fonts/Onest-VariableFont_wght.ttf'
const FONT_REGULAR = 'fonts/rostex.regular.ttf'

const RING_SEGMENTS = 8
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENTS
const RING_SEGMENT_GAP = 4

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let timeWidget = null
let timeShadowWidget = null
let timeGlowWidgets = []
let colonWidget = null
let topStepsWidget = null

let secTensSlot = null
let secUnitsSlot = null
let rollTimer = null
let dateLineWidget = null

let hrValueWidget = null
let hrRing = null

let distanceValueWidget = null
let stepsRing = null

let caloriesValueWidget = null
let caloriesRing = null

let bottomBatteryValueWidget = null
let bottomBatteryRing = null

let bottomOxygenValueWidget = null
let bottomOxygenRing = null

let weatherSensor = null
let weatherValueWidget = null
let weatherIconWidget = null
let weatherCode = -1

let mainTimer = null

let heartRateSensor = null
let stepSensor = null
let batterySensor = null
let spo2Sensor = null

let onHrChange = null
let onStepChange = null
let onBatteryChange = null
let onSpo2Change = null

const WEEKDAYS = [
  'ВОСКРЕСЕНЬЕ',
  'ПОНЕДЕЛЬНИК',
  'ВТОРНИК',
  'СРЕДА',
  'ЧЕТВЕРГ',
  'ПЯТНИЦА',
  'СУББОТА'
]

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function createText(options) {
  options.font = options.font || FONT_LABEL
  return createWidget(widget.TEXT, options)
}

function twoDigits(n) {
  return n < 10 ? '0' + n : '' + n
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpColor(colorA, colorB, t) {
  const ar = (colorA >> 16) & 0xff
  const ag = (colorA >> 8) & 0xff
  const ab = colorA & 0xff

  const br = (colorB >> 16) & 0xff
  const bg = (colorB >> 8) & 0xff
  const bb = colorB & 0xff

  const r = Math.round(lerp(ar, br, t))
  const g = Math.round(lerp(ag, bg, t))
  const b = Math.round(lerp(ab, bb, t))

  return (r << 16) | (g << 8) | b
}

// Помощник градиента с 3 остановками: colorA -> colorB -> colorC при t от 0 до 1
function triColor(t, colorA, colorB, colorC) {
  const clamped = clamp(t, 0, 1)
  if (clamped < 0.5) {
    return lerpColor(colorA, colorB, clamped * 2)
  }
  return lerpColor(colorB, colorC, (clamped - 0.5) * 2)
}

function heartRateGradient(t) {
  return triColor(t, COLOR_GREEN, COLOR_YELLOW, COLOR_RED)
}

function stepsGradient(t) {
  return lerpColor(COLOR_PURPLE, COLOR_CYAN, clamp(t, 0, 1))
}

function batteryGradient(t) {
  return triColor(t, COLOR_RED, COLOR_YELLOW, COLOR_GREEN)
}

function oxygenGradient(t) {
  return lerpColor(COLOR_PURPLE, COLOR_CYAN, clamp(t, 0, 1))
}

// ============================================================
// ФОН
// ============================================================

function createBackground() {
  createWidget(widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: SCREEN_W,
    h: SCREEN_H,
    color: COLOR_BG
  })

}

// ============================================================
// ФАБРИКА ГРАДИЕНТНЫХ КОЛЕЦ
// ============================================================
// Виджеты ARC в Zepp OS принимают только один сплошной цвет, поэтому
// плавный градиент имитируется N короткими дугами, каждая заранее
// окрашена вдоль градиента. При обновлении мы лишь переключаем сегменты
// между цветом градиента (горит) и цветом дорожки (не горит) — без
// пересоздания, только setProperty, поэтому анимация дёшева.

function createGradientRing(cx, cy, r, glowR, lineWidth, gradientFn) {
  const startAngle = -90

  // Мягкое внешнее свечение — один тусклый, чуть больший круг за всем.
  createWidget(widget.ARC, {
    x: cx - glowR,
    y: cy - glowR,
    w: glowR * 2,
    h: glowR * 2,
    start_angle: startAngle,
    end_angle: startAngle + 360,
    color: COLOR_GLOW,
    line_width: 3
  })

  // Фоновая дорожка.
  createWidget(widget.ARC, {
    x: cx - r,
    y: cy - r,
    w: r * 2,
    h: r * 2,
    start_angle: startAngle,
    end_angle: startAngle + 360,
    color: COLOR_TRACK,
    line_width: lineWidth
  })

  const segments = []
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const segStart = startAngle + i * RING_SEGMENT_ANGLE
    const segEnd = segStart + RING_SEGMENT_ANGLE - RING_SEGMENT_GAP
    const t = i / (RING_SEGMENTS - 1)
    const color = gradientFn(t)

    const seg = createWidget(widget.ARC, {
      x: cx - r,
      y: cy - r,
      w: r * 2,
      h: r * 2,
      start_angle: segStart,
      end_angle: segEnd,
      color: COLOR_TRACK,
      line_width: lineWidth
    })

    segments.push({ widget: seg, color })
  }

  return { segments }
}

function updateGradientRing(ring, ratio) {
  const litCount = Math.round(clamp(ratio, 0, 1) * RING_SEGMENTS)
  for (let i = 0; i < ring.segments.length; i++) {
    const seg = ring.segments[i]
    const targetColor = i < litCount ? seg.color : COLOR_TRACK
    seg.widget.setProperty(prop.MORE, { color: targetColor })
  }
}

// ============================================================
// ВЕРХНИЕ ИКОНКИ
// ============================================================

const TOP_SPRITE_ICON_SIZE = 40

function drawTopSpriteIcon(cx, cy, src) {
  createWidget(widget.IMG, {
    x: cx - TOP_SPRITE_ICON_SIZE / 2,
    y: cy - TOP_SPRITE_ICON_SIZE / 2,
    w: TOP_SPRITE_ICON_SIZE,
    h: TOP_SPRITE_ICON_SIZE,
    src,
    auto_scale: true
  })
}

// Глиф пульса: маленькая зигзагообразная линия в стиле ЭКГ.
function drawPulseIcon(cx, cy, color) {
  const pts = [
    [cx - 11, cy], [cx - 5, cy], [cx - 2, cy - 7],
    [cx + 2, cy + 7], [cx + 5, cy], [cx + 11, cy]
  ]
  for (let i = 0; i < pts.length - 1; i++) {
  }
}

// Глиф идущего человечка для шагов: голова + туловище + ноги + руки.
function drawStepsIcon(cx, cy, color) {
  createWidget(widget.CIRCLE, {
    center_x: cx + 2,
    center_y: cy - 8,
    radius: 3,
    color
  })
}

// Глиф батарейки: контур корпуса + клемма-выступ.
function drawBatteryIcon(cx, cy, color) {
  createWidget(widget.STROKE_RECT, {
    x: cx - 12, y: cy - 6, w: 22, h: 12,
    color, line_width: 2
  })
  createWidget(widget.FILL_RECT, {
    x: cx + 11, y: cy - 3, w: 3, h: 6, color
  })
  createWidget(widget.FILL_RECT, {
    x: cx - 9, y: cy - 3, w: 6, h: 6, color
  })
}

// Глиф пламени для калорий: простая залитая фигурка с острым язычком огня.
function drawCalorieIcon(cx, cy, color) {
  createWidget(widget.CIRCLE, {
    center_x: cx,
    center_y: cy + 3,
    radius: 6,
    color
  })
}

// ============================================================
// ВЕРХНИЕ ВИДЖЕТЫ (Пульс / Шаги / Батарея)
// ============================================================
// Каждый индикатор: компактное кольцо -> внутри стек [иконка][значение], подпись снизу.

function createTopWidgets() {
  const halfW = TOP_R * 2
  const labelW = 78

  // Шаги расположены над тремя циферблатами, как просили.
  createText({
    x: 0, y: 28, w: SCREEN_W, h: 14,
    text: 'ШАГИ', text_size: 12, color: COLOR_GRAY,
    align_h: align.CENTER_H, align_v: align.CENTER_V
  })
  topStepsWidget = createText({
    x: 0, y: 40, w: SCREEN_W, h: 20,
    text: '0', text_size: 20, color: COLOR_WHITE,
    align_h: align.CENTER_H, align_v: align.CENTER_V
  })

  // --- Кольцо пульса ---
  hrRing = createGradientRing(HR_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, heartRateGradient)
  drawTopSpriteIcon(HR_CX, TOP_ICON_CY, 'icons/heart-rate.png')

  hrValueWidget = createText({
    x: HR_CX - TOP_R,
    y: TOP_VALUE_CY - 13,
    w: halfW,
    h: 26,
    text: '--',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: HR_CX - labelW / 2,
    y: TOP_LABEL_CY - 10,
    w: labelW,
    h: 14,
    text: 'BPM',
    text_size: 10,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Кольцо шагов ---
  stepsRing = createGradientRing(STEPS_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, stepsGradient)
  drawTopSpriteIcon(STEPS_CX, TOP_ICON_CY, 'icons/steps.png')

  distanceValueWidget = createText({
    x: STEPS_CX - TOP_R,
    y: TOP_VALUE_CY - 13,
    w: halfW,
    h: 26,
    text: '0.00',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: STEPS_CX - labelW / 2,
    y: TOP_LABEL_CY - 10,
    w: labelW,
    h: 14,
    text: 'KM',
    text_size: 10,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Кольцо батареи ---
  caloriesRing = createGradientRing(BAT_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, batteryGradient)
  drawTopSpriteIcon(BAT_CX, TOP_ICON_CY, 'icons/calories.png')

  caloriesValueWidget = createText({
    x: BAT_CX - TOP_R,
    y: TOP_VALUE_CY - 13,
    w: halfW,
    h: 26,
    text: '0',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: BAT_CX - labelW / 2,
    y: TOP_LABEL_CY - 10,
    w: labelW,
    h: 14,
    text: 'KCAL',
    text_size: 10,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

}

// ============================================================
// ОСНОВНОЕ ВРЕМЯ
// ============================================================

function createMainTime() {
  const boxY = TIME_CY - TIME_ROW_H / 2

// Мягкое свечение за блоком HH:MM — несколько тусклых смещённых копий,
// нарисованных первыми, чтобы слои тени/основного текста легли сверху чисто.
  timeGlowWidgets = []
  for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
    const [dx, dy] = TIME_GLOW_OFFSETS[i]
    const glow = createText({
      x: TIME_HHMM_X + dx,
      y: boxY + dy,
      w: TIME_HHMM_BOX_W,
      h: TIME_ROW_H,
      text: '00:00',
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: TIME_GLOW_COLOR,
      align_h: align.RIGHT,
      align_v: align.CENTER_V
    })
    timeGlowWidgets.push(glow)
  }

  // Псевдо-тень для блока HH:MM только (упрощённо).
  timeShadowWidget = createText({
    x: TIME_HHMM_X + TIME_SHADOW_OFFSET,
    y: boxY + TIME_SHADOW_OFFSET,
    w: TIME_HHMM_BOX_W,
    h: TIME_ROW_H,
    text: '00:00',
    text_size: TIME_FONT_SIZE,
    font: FONT_REGULAR,
    color: COLOR_SHADOW,
    align_h: align.RIGHT,
    align_v: align.CENTER_V
  })

  timeWidget = createText({
    x: TIME_HHMM_X,
    y: boxY,
    w: TIME_HHMM_BOX_W,
    h: TIME_ROW_H,
    text: '00:00',
    text_size: TIME_FONT_SIZE,
    font: FONT_REGULAR,
    color: COLOR_WHITE,
    align_h: align.RIGHT,
    align_v: align.CENTER_V
  })

// Разделитель визуально относится к секундам, поэтому получает то же
// маленькое голубое свечение, что и прокручивающиеся цифры.
  for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
    const [dx, dy] = TIME_GLOW_OFFSETS[i]
    createText({
      x: TIME_COLON_X + dx,
      y: boxY + dy,
      w: TIME_COLON_W,
      h: TIME_ROW_H,
      text: ':',
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: TIME_GLOW_COLOR,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    })
  }

  colonWidget = createText({
    x: TIME_COLON_X,
    y: boxY,
    w: TIME_COLON_W,
    h: TIME_ROW_H,
    text: ':',
    text_size: TIME_FONT_SIZE,
    font: FONT_REGULAR,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  const now = new Date()
  const ss = now.getSeconds()
  secTensSlot = createRollingDigit(TIME_SEC_TENS_X, boxY, TIME_SEC_DIGIT_W, TIME_ROW_H, Math.floor(ss / 10))
  secUnitsSlot = createRollingDigit(TIME_SEC_UNITS_X, boxY, TIME_SEC_DIGIT_W, TIME_ROW_H, ss % 10)

// Маски: тонкие полосы цвета фона, нарисованные поверх слотов цифр,
// скрывают всё, что выезжает выше/ниже видимого окна цифры во время
// анимации прокрутки — благодаря этому получается настоящий барабан
// счётчика, а не две переползающие друг через друга надписи.
  createWidget(widget.FILL_RECT, {
    x: TIME_SEC_TENS_X - TIME_ROLL_MASK_PADDING,
    y: boxY - TIME_ROW_H,
    w: TIME_SEC_DIGIT_W * 2 + TIME_ROLL_MASK_PADDING * 2,
    h: TIME_ROW_H,
    color: COLOR_BG
  })
  createWidget(widget.FILL_RECT, {
    x: TIME_SEC_TENS_X - TIME_ROLL_MASK_PADDING,
    y: boxY + TIME_ROW_H,
    w: TIME_SEC_DIGIT_W * 2 + TIME_ROLL_MASK_PADDING * 2,
    h: TIME_ROW_H,
    color: COLOR_BG
  })
}

// ============================================================
// ПРОКРУЧИВАЮЩАЯСЯ ЦИФРА «СЧЁТЧИК»
// ============================================================
// По два наложенных виджета TEXT на цифру: `current` (видимая) и `next`
// (припаркована на высоту строки ниже, спрятана за нижней маской). При
// смене значения обе сдвигаются вверх вместе за ROLL_STEPS кадров; маски,
// созданные в createMainTime(), обрезают всё, что выходит за видимое окно,
// поэтому читается как уходящая старая цифра и встающая на место новая —
// как барабан механического счётчика.

function createRollingDigit(x, y, w, h, initialValue) {
  const glowCurrent = []
  const glowNext = []

// Эти копии должны иметь собственные позиции анимации, иначе неоновое
// свечение останется позади, пока цифра прокручивается.
  for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
    const [dx, dy] = TIME_GLOW_OFFSETS[i]
    glowCurrent.push(createText({
      x: x + dx,
      y: y + dy,
      w,
      h,
      text: String(initialValue),
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: TIME_GLOW_COLOR,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }))
    glowNext.push(createText({
      x: x + dx,
      y: y + h + dy,
      w,
      h,
      text: String(initialValue),
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: TIME_GLOW_COLOR,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }))
  }

  const current = createText({
    x,
    y,
    w,
    h,
    text: String(initialValue),
    text_size: TIME_FONT_SIZE,
    font: FONT_REGULAR,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  const next = createText({
    x,
    y: y + h,
    w,
    h,
    text: String(initialValue),
    text_size: TIME_FONT_SIZE,
    font: FONT_REGULAR,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  return {
    current,
    next,
    glowCurrent,
    glowNext,
    baseY: y,
    h,
    value: initialValue,
    pendingValue: initialValue,
    step: 0,
    animating: false
  }
}

function startDigitRoll(slot, newValue) {
  if (slot.value === newValue || slot.animating) return

  slot.pendingValue = newValue
  slot.step = 0
  slot.animating = true

  slot.next.setProperty(prop.TEXT, String(newValue))
  slot.next.setProperty(prop.MORE, { y: slot.baseY + slot.h })
  slot.current.setProperty(prop.MORE, { y: slot.baseY })
  for (let i = 0; i < slot.glowNext.length; i++) {
    slot.glowNext[i].setProperty(prop.TEXT, String(newValue))
    slot.glowNext[i].setProperty(prop.MORE, { y: slot.baseY + slot.h + TIME_GLOW_OFFSETS[i][1] })
    slot.glowCurrent[i].setProperty(prop.MORE, { y: slot.baseY + TIME_GLOW_OFFSETS[i][1] })
  }

  ensureRollTimerRunning()
}

function advanceDigitRoll(slot) {
  if (!slot.animating) return false

  slot.step += 1
  const t = clamp(slot.step / ROLL_STEPS, 0, 1)
  const offset = Math.round(t * slot.h)

  slot.current.setProperty(prop.MORE, { y: slot.baseY - offset })
  slot.next.setProperty(prop.MORE, { y: slot.baseY + slot.h - offset })
  for (let i = 0; i < slot.glowCurrent.length; i++) {
    const glowY = TIME_GLOW_OFFSETS[i][1]
    slot.glowCurrent[i].setProperty(prop.MORE, { y: slot.baseY + glowY - offset })
    slot.glowNext[i].setProperty(prop.MORE, { y: slot.baseY + slot.h + glowY - offset })
  }

  if (slot.step >= ROLL_STEPS) {
    slot.current.setProperty(prop.TEXT, String(slot.pendingValue))
    slot.current.setProperty(prop.MORE, { y: slot.baseY })
    slot.next.setProperty(prop.MORE, { y: slot.baseY + slot.h })
    for (let i = 0; i < slot.glowCurrent.length; i++) {
      const glowY = TIME_GLOW_OFFSETS[i][1]
      slot.glowCurrent[i].setProperty(prop.TEXT, String(slot.pendingValue))
      slot.glowCurrent[i].setProperty(prop.MORE, { y: slot.baseY + glowY })
      slot.glowNext[i].setProperty(prop.MORE, { y: slot.baseY + slot.h + glowY })
    }
    slot.value = slot.pendingValue
    slot.animating = false
    return false
  }
  return true
}

function ensureRollTimerRunning() {
  if (rollTimer !== null) return
  rollTimer = setInterval(() => {
    const tensActive = advanceDigitRoll(secTensSlot)
    const unitsActive = advanceDigitRoll(secUnitsSlot)
    if (!tensActive && !unitsActive) {
      clearInterval(rollTimer)
      rollTimer = null
    }
  }, ROLL_STEP_MS)
}

// ============================================================
// ДАТА
// ============================================================

function createSectionDividers() {
  const yPositions = [TOP_TIME_LINE_Y, TIME_DATE_LINE_Y, DATE_BOTTOM_LINE_Y]
  for (let i = 0; i < yPositions.length; i++) {
    createWidget(widget.LINE, {
      x1: SECTION_LINE_X,
      y1: yPositions[i],
      x2: SECTION_LINE_X + SECTION_LINE_W,
      y2: yPositions[i],
      color: COLOR_DIVIDER,
      line_width: 3
    })
  }
}

function createDate() {
  dateLineWidget = createText({
    x: 0,
    y: DATE_LINE_CY - 14,
    w: SCREEN_W,
    h: 28,
    text: 'ПОНЕДЕЛЬНИК, 01.01.2026',
    text_size: DATE_LINE_FONT_SIZE,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

}

// ============================================================
// НИЖНИЕ ВИДЖЕТЫ (Погода / Активность / Шаги)
// ============================================================

const WEATHER_ICON_BASE = 'icons/weather/Weather_'

function updateWeatherIcon(index) {
  const idx = clamp(index, 0, 28)
  if (weatherIconWidget && idx !== weatherCode) {
    weatherCode = idx
    weatherIconWidget.setProperty(prop.SRC, WEATHER_ICON_BASE + (idx + 1) + '.png')
  }
}

function createBottomWidgets() {
  const halfW = BOTTOM_BLOCK_W / 2

  // --- Погода (слева) ---
  weatherIconWidget = createWidget(widget.IMG, {
    x: 105,
    y: 320,
    w: 48,
    h: 48,
    src: WEATHER_ICON_BASE + '26.png',
    auto_scale: true
  })

  weatherValueWidget = createText({
    x: WEATHER_CX - halfW,
    y: BOTTOM_VALUE_CY - 12,
    w: BOTTOM_BLOCK_W,
    h: 22,
    text: '--°',
    text_size: 20,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: WEATHER_CX - halfW,
    y: BOTTOM_LABEL_CY - 10,
    w: BOTTOM_BLOCK_W,
    h: 16,
    text: 'WEATHER',
    text_size: 11,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Батарея (центр): кольцо в стиле верхних виджетов ---
  bottomBatteryRing = createGradientRing(
    BAT2_CX, BOTTOM_RING_CY, BOTTOM_RING_R, BOTTOM_RING_GLOW_R,
    BOTTOM_RING_LINE_W, batteryGradient
  )
  drawBatteryIcon(BAT2_CX, BOTTOM_RING_CY, COLOR_GREEN)

  bottomBatteryValueWidget = createText({
    x: BAT2_CX - halfW,
    y: BOTTOM_VALUE_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_VALUE_BOX_H,
    text: '--',
    text_size: 18,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: BAT2_CX - halfW,
    y: BOTTOM_LABEL_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_LABEL_BOX_H,
    text: 'BATTERY',
    text_size: 11,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Кислород SpO2 (справа): кольцо в стиле верхних виджетов ---
  bottomOxygenRing = createGradientRing(
    OXY_CX, BOTTOM_RING_CY, BOTTOM_RING_R, BOTTOM_RING_GLOW_R,
    BOTTOM_RING_LINE_W, oxygenGradient
  )
  createText({
    x: OXY_CX - 32,
    y: BOTTOM_RING_CY - 10,
    w: 64,
    h: 20,
    text: 'SpO2',
    text_size: 14,
    color: COLOR_PURPLE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  bottomOxygenValueWidget = createText({
    x: OXY_CX - halfW,
    y: BOTTOM_VALUE_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_VALUE_BOX_H,
    text: '--',
    text_size: 18,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: OXY_CX - halfW,
    y: BOTTOM_LABEL_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_LABEL_BOX_H,
    text: 'OXYGEN',
    text_size: 11,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })
}

// ============================================================
// ОБНОВЛЕНИЕ: ВРЕМЯ / ДАТА
// ============================================================

let lastRenderedDay = -1

function updateTime() {
  const now = new Date()
  const hh = twoDigits(now.getHours())
  const mm = twoDigits(now.getMinutes())  
  const ss = now.getSeconds()

  const timeStr = hh + ':' + mm
  timeWidget.setProperty(prop.TEXT, timeStr)
  timeShadowWidget.setProperty(prop.TEXT, timeStr)
  for (let i = 0; i < timeGlowWidgets.length; i++) {
    timeGlowWidgets[i].setProperty(prop.TEXT, timeStr)
  }

  startDigitRoll(secTensSlot, Math.floor(ss / 10))
  startDigitRoll(secUnitsSlot, ss % 10)

  const day = now.getDate()
  if (day !== lastRenderedDay) {
    lastRenderedDay = day
    updateDate(now)
  }
}

function updateDate(now) {
  const date = now || new Date()
  const weekdayIndex = date.getDay()
  const dd = twoDigits(date.getDate())
  const mo = twoDigits(date.getMonth() + 1)
  const yyyy = date.getFullYear()

  dateLineWidget.setProperty(prop.TEXT, WEEKDAYS[weekdayIndex] + ' ' + dd + '.' + mo + '.' + yyyy)
}

// ============================================================
// ОБНОВЛЕНИЕ: ПУЛЬС
// ============================================================

function updateHeartRate(bpm) {
  const value = bpm && bpm > 0 ? bpm : 0
  hrValueWidget.setProperty(prop.TEXT, value > 0 ? String(value) : '--')

  const ratio = clamp(value / 180, 0, 1)
  updateGradientRing(hrRing, value > 0 ? ratio : 0)
}

// ============================================================
// ОБНОВЛЕНИЕ: ШАГИ
// ============================================================

let stepGoal = 10000

function updateSteps(current) {
  const value = current || 0
  const distanceKm = value * 0.00075
  const calories = Math.round(value * 0.04)

  if (topStepsWidget) topStepsWidget.setProperty(prop.TEXT, String(value))
  distanceValueWidget.setProperty(prop.TEXT, distanceKm.toFixed(2))
  caloriesValueWidget.setProperty(prop.TEXT, String(calories))

  const ratio = clamp(value / stepGoal, 0, 1)
  updateGradientRing(stepsRing, ratio)
  updateGradientRing(caloriesRing, clamp(calories / 600, 0, 1))
}

// ============================================================
// ОБНОВЛЕНИЕ: БАТАРЕЯ (нижний виджет)
// ============================================================

function updateBattery(pct) {
  const value = pct && pct > 0 ? pct : 0
  bottomBatteryValueWidget.setProperty(prop.TEXT, value > 0 ? value + '%' : '--')
  updateGradientRing(bottomBatteryRing, clamp(value / 100, 0, 1))
}

// ============================================================
// ОБНОВЛЕНИЕ: КИСЛОРОД SpO2 (нижний виджет)
// ============================================================

// Значение SpO2 приходит по-разному в зависимости от API/версии прошивки:
// число, объект { value, time } или sensor.current — нормализуем все варианты.
function readSpo2Value(sensor) {
  if (!sensor) return 0
  try {
    let v
    if (typeof sensor.getCurrent === 'function') {
      v = sensor.getCurrent()
    } else if (sensor.current !== undefined) {
      v = sensor.current
    }
    if (v && typeof v === 'object') return v.value || 0
    return v || 0
  } catch (e) {
    return 0
  }
}

function updateOxygen(raw) {
  const value = raw && raw > 0 && raw <= 100 ? Math.round(raw) : 0
  bottomOxygenValueWidget.setProperty(prop.TEXT, value > 0 ? value + '%' : '--')
  // Норма 95-100%: кольцо полностью загорается при 100%, начинает
  // реагировать от 80% и ниже, чтобы просадка была заметна визуально.
  updateGradientRing(bottomOxygenRing, clamp((value - 80) / 20, 0, 1))
}

function updateWeatherFromSensor() {
  if (!weatherSensor) return
  try {
    const curTemp = weatherSensor.current
    if (curTemp !== undefined && curTemp !== null) {
      weatherValueWidget.setProperty(prop.TEXT, Math.round(curTemp) + '°')
    }
    const curIdx = weatherSensor.curAirIconIndex
    if (curIdx !== undefined && curIdx !== null && curIdx >= 0 && curIdx <= 28) {
      updateWeatherIcon(Number(curIdx))
    }
  } catch (e) {
  }
}

// ============================================================
// ДАТЧИКИ
// ============================================================

function initSensors() {
  heartRateSensor = new HeartRate()
  stepSensor = new Step()
  batterySensor = new Battery()

  try { spo2Sensor = new SpO2(); } catch(e) { spo2Sensor = null; }
  if (!spo2Sensor) {
    // Фолбэк на легаси-API hmSensor для старых прошивок.
    try { spo2Sensor = hmSensor.createSensor(hmSensor.id.SENSOR_SPO2); } catch(e) { spo2Sensor = null; }
  }

  try { weatherSensor = hmSensor.createSensor(hmSensor.id.WEATHER); } catch(e) { weatherSensor = null; }

  updateHeartRate(heartRateSensor.getCurrent ? heartRateSensor.getCurrent() : 0)

  const initialSteps = stepSensor.getCurrent ? stepSensor.getCurrent() : 0
  if (stepSensor.getTarget) {
    const target = stepSensor.getTarget()
    stepGoal = target && target > 0 ? target : 10000
  }
  updateSteps(initialSteps)

  updateBattery(batterySensor.getCurrent ? batterySensor.getCurrent() : 0)

  updateOxygen(readSpo2Value(spo2Sensor))

  updateWeatherFromSensor()

  onHrChange = () => {
    updateHeartRate(heartRateSensor.getCurrent())
  }
  onStepChange = () => {
    updateSteps(stepSensor.getCurrent())
  }
  onBatteryChange = () => {
    updateBattery(batterySensor.getCurrent())
  }
  onSpo2Change = () => {
    updateOxygen(readSpo2Value(spo2Sensor))
  }

  if (heartRateSensor.onCurrentChange) {
    heartRateSensor.onCurrentChange(onHrChange)
  }
  if (stepSensor.onChange) {
    stepSensor.onChange(onStepChange)
  }
  if (batterySensor.onChange) {
    batterySensor.onChange(onBatteryChange)
  }
  if (spo2Sensor && spo2Sensor.onCurrentChange) {
    try { spo2Sensor.onCurrentChange(onSpo2Change); } catch(e) {}
  }
}

function teardownSensors() {
  if (heartRateSensor && onHrChange && heartRateSensor.offCurrentChange) {
    heartRateSensor.offCurrentChange(onHrChange)
  }
  if (stepSensor && onStepChange && stepSensor.offChange) {
    stepSensor.offChange(onStepChange)
  }
  if (batterySensor && onBatteryChange && batterySensor.offChange) {
    batterySensor.offChange(onBatteryChange)
  }
  if (spo2Sensor && onSpo2Change && spo2Sensor.offCurrentChange) {
    try { spo2Sensor.offCurrentChange(onSpo2Change); } catch(e) {}
  }
}

// ============================================================
// ТАЙМЕР
// ============================================================

function startTimer() {
  updateTime()
  mainTimer = setInterval(() => {
    updateTime()
    updateWeatherFromSensor()
  }, 500)
}

function stopTimer() {
  if (mainTimer !== null) {
    clearInterval(mainTimer)
    mainTimer = null
  }
  if (rollTimer !== null) {
    clearInterval(rollTimer)
    rollTimer = null
  }
}

// ============================================================
// ЖИЗНЕННЫЙ ЦИКЛ
// ============================================================

WatchFace({
  build() {
    createBackground()
    createMainTime()
// Маски прокручивающихся секунд находятся за верхними индикаторами, поэтому
// они не могут перекрыть циферблат батареи во время анимации секунд.
    createTopWidgets()
    createDate()
    createBottomWidgets()
    createSectionDividers()

    createWidget(widget.LINE, {
      x1: 56,
      y1: 230,
      x2: 422,
      y2: 230,
      color: 0xffffff,
      line_width: 2
    })

    initSensors()
    startTimer()
  },

  onDestroy() {
    stopTimer()
    teardownSensors()
  }
})
