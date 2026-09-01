import { createWidget, widget, align, prop } from '@zos/ui'
import { HeartRate, Step, Battery, Pai, Weather } from '@zos/sensor'
import { setInterval, clearInterval } from '@zos/timer'
import {
  launchApp,
  SYSTEM_APP_HR,
  SYSTEM_APP_STATUS,
  SYSTEM_APP_WEATHER,
  SYSTEM_APP_ALARM,
  SYSTEM_APP_STOPWATCH,
  SYSTEM_APP_SLEEP,
  SYSTEM_APP_PAI,
  SYSTEM_APP_SETTING
} from '@zos/router'

// ============================================================
// МАКЕТ
// ============================================================
// Все позиции ниже проверены вручную относительно радиуса
// безопасной зоны круглого экрана (R_SAFE), чтобы ничего не
// обрезалось корпусом. Если двигаете элементы, держите их
// внутри R_SAFE от CENTER_X/CENTER_Y.

const SCREEN_W = 480                  // ширина экрана, px
const SCREEN_H = 480                  // высота экрана, px
const CENTER_X = 240                  // X центра экрана (экран/2)
const CENTER_Y = 240                  // Y центра экрана (экран/2)
const R_SAFE = 228                    // полезный радиус: ближе к краю контент обрезается корпусом

// Компактная верхняя статистика, вдохновлённая тремя маленькими
// циферблатами из образца. Подъём вверх оставляет чистый визуальный
// зазор перед увеличенным отображением времени.
const TOP_CY = 95                     // Y-центр трёх верхних колец (пульс/шаги/батарея)
const TOP_R = 29                      // радиус верхних колец
const TOP_GLOW_R = 29 + 3             // радиус зоны свечения вокруг верхних колец (R + свечение)
const TOP_LINE_W = 5                  // толщина линии верхних колец

// Иконки остаются внутри своих циферблатов; значения и подписи
// образуют две чёткие строки прямо под ними, как в образце.
const TOP_ICON_CY = TOP_CY + 1                        // Y-центр иконок внутри верхних колец
const TOP_VALUE_CY = TOP_CY + TOP_R + 16              // Y-центр строки значений под верхними кольцами
const TOP_LABEL_CY = TOP_VALUE_CY + 21                // Y-центр строки подписей (HR/STEPS/BATT)

const HR_CX = 134                     // X-центр верхней колонки «Пульс» — выровнен с нижней колонкой «Погода» (WEATHER_CX)
const STEPS_CX = 240                  // X-центр верхней колонки «Шаги» (центр экрана)
const BAT_CX = 346                    // X-центр верхней колонки «Калории» — выровнен с нижней колонкой «PAI» (PAI_CX)

// Основное время строится как набор фиксированных слотов: H H : M M : S S.
// Это убирает визуальное "плавание" строки, которое появляется у
// пропорционального шрифта, когда часы/минуты/секунды имеют разную ширину.
const TIME_CY = 214                   // Y-центр строки основного времени HH:MM:SS
// У Rostex широкие глифы, поэтому эти размеры резервируют достаточно места
// для полной строки HH:MM:SS на экране 480 px без обрезки первой цифры.
const TIME_FONT_SIZE = 58             // размер шрифта основного времени
const TIME_SHADOW_OFFSET = 2          // смещение тени времени вниз/вправо, px
const TIME_ROW_H = TIME_FONT_SIZE + 20  // высота строки времени (шрифт + запас для масок прокрутки)

// Мягкое свечение за временем: несколько тусклых копий со смещением 1-2px
// в каждую сторону, нарисованных под тенью/основным текстом. Дешёвая
// имитация свечения — у виджетов текста Zepp OS нет альфа-смешивания,
// поэтому настоящее размытие невозможно.
const TIME_GLOW_COLOR = 0x0b5b6d      // цвет свечения вокруг цифр времени
const TIME_GLOW_OFFSETS = [           // смещения копий-«лучей» свечения относительно основного текста
  [-2, 0], [2, 0], [0, -2], [0, 2],
  [-1, -1], [1, -1], [-1, 1], [1, 1]
]

// Оставляем большой запас для широких глифов HH:MM в Rostex; иначе Zepp OS
// посчитает текст выходящим за пределы и запустит бегущую строку.
const TIME_HHMM_BOX_W = 260           // ширина зоны HH:MM (для центрирования фиксированных слотов и клика)
const TIME_COLON_W = 24               // ширина блока под двоеточие между HH:MM и секундами
const TIME_SEC_DIGIT_W = 56           // ширина блока одной цифры секунд (десятки/единицы)
const TIME_ROLL_MASK_PADDING = 16     // запас маски прокрутки цифр, чтобы глиф не вылезал при анимации

const TIME_HHMM_DIGIT_W = 56          // фиксированная ширина одной цифры HH:MM
const TIME_HHMM_VISUAL_W = TIME_HHMM_DIGIT_W * 4 + TIME_COLON_W  // визуальная ширина блока HH:MM

const TIME_ROW_TOTAL_W = TIME_HHMM_VISUAL_W + TIME_COLON_W + TIME_SEC_DIGIT_W * 2  // общая ширина строки времени
// Глифы HH:MM в Rostex визуально тяжелее справа, поэтому небольшая
// оптическая поправка держит отображаемое время по центру круглого экрана.
const TIME_ROW_LEFT = CENTER_X - TIME_ROW_TOTAL_W / 2 - 10  // левый край строки времени (-10 = оптическая поправка)

const TIME_HHMM_X = TIME_ROW_LEFT                       // X левого края блока HH:MM
const TIME_HHMM_VISUAL_X = TIME_HHMM_X + Math.round((TIME_HHMM_BOX_W - TIME_HHMM_VISUAL_W) / 2)  // визуальный старт слотов HH:MM внутри зоны
const TIME_HH_TENS_X = TIME_HHMM_VISUAL_X               // X левого края цифры часов (десятки)
const TIME_HH_UNITS_X = TIME_HH_TENS_X + TIME_HHMM_DIGIT_W  // X левого края цифры часов (единицы)
const TIME_HHMM_COLON_X = TIME_HH_UNITS_X + TIME_HHMM_DIGIT_W  // X левого края двоеточия между HH и MM
const TIME_MM_TENS_X = TIME_HHMM_COLON_X + TIME_COLON_W      // X левого края цифры минут (десятки)
const TIME_MM_UNITS_X = TIME_MM_TENS_X + TIME_HHMM_DIGIT_W    // X левого края цифры минут (единицы)
const TIME_COLON_X = TIME_MM_UNITS_X + TIME_HHMM_DIGIT_W  // X левого края двоеточия перед секундами
const TIME_SEC_TENS_X = TIME_COLON_X + TIME_COLON_W     // X левого края цифры «десятки» секунд
const TIME_SEC_UNITS_X = TIME_SEC_TENS_X + TIME_SEC_DIGIT_W  // X левого края цифры «единицы» секунд

// Тайминги анимации «механического счётчика» с прокруткой цифр
const ROLL_DURATION_MS = 260          // полная длительность прокрутки одной цифры, мс
const ROLL_STEP_MS = 26               // длительность одного кадра анимации, мс
const ROLL_STEPS = Math.round(ROLL_DURATION_MS / ROLL_STEP_MS)  // число кадров анимации

// Блок даты — день недели и дата теперь рисуются одной центрированной строкой
const DATE_LINE_CY = 274              // Y-центр строки даты
const DATE_LINE_FONT_SIZE = 24        // размер шрифта строки даты

// Незаметные горизонтальные разделители визуально отделяют компактную
// верхнюю статистику, время и дату. Рисуются через FILL_RECT: widget.LINE
// на многих устройствах Zepp OS просто не отрисовывается.
const SECTION_LINE_X = 20             // отступ разделителя от левого края (справа симметрично)
const SECTION_LINE_W = SCREEN_W - SECTION_LINE_X * 2    // длина разделителя
const DIVIDER_H = 2                   // толщина разделителя, px
const TOP_TIME_LINE_Y = 172           // Y разделителя №1: между верхней статистикой и временем
const TIME_DATE_LINE_Y = 255          // Y разделителя №2: между временем и датой
const DATE_BOTTOM_LINE_Y = 290        // Y разделителя №3: между датой и нижними виджетами

// Нижние информационные блоки (Погода / Батарея / PAI). Все три колонки
// выровнены по высоте в один ряд: иконка и кольца центрированы на BOTTOM_RING_CY,
// значения — в BOTTOM_VALUE_BOX, подписи — в BOTTOM_LABEL_BOX.
const BOTTOM_RING_CY = 348            // Y-центр нижних колец и иконки погоды (весь ряд двигается им)
const BOTTOM_RING_R = 34              // радиус нижних колец (батарея, PAI)
const BOTTOM_RING_GLOW_R = 34 + 3     // радиус зоны свечения нижних колец (R + свечение)
const BOTTOM_RING_LINE_W = 5          // толщина линии нижних колец
const BOTTOM_ICON_SIZE = 60           // размер квадратной иконки погоды, px
const BOTTOM_VALUE_BOX_Y = 390        // Y верхней границы строки значений (--° / -- / --)
const BOTTOM_VALUE_BOX_H = 26         // высота бокса строки значений
const BOTTOM_LABEL_BOX_Y = 420        // Y верхней границы строки подписей (WEATHER/BATTERY/PAI)
const BOTTOM_LABEL_BOX_H = 18         // высота бокса строки подписей
const BOTTOM_BLOCK_W = 120            // ширина бокса текста одной нижней колонки (для центрирования)
const BOTTOM_VALUE_FONT = 24          // размер шрифта значений нижних виджетов
const BOTTOM_LABEL_FONT = 14          // размер шрифта подписей нижних виджетов

const WEATHER_CX = 134                // X-центр нижней колонки «Погода» (слева)
const BAT2_CX = 240                   // X-центр нижней колонки «Батарея» (центр экрана)
const PAI_CX = 346                    // X-центр нижней колонки «PAI» (справа)

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
const COLOR_DIVIDER = 0x4a5058
const FONT_LABEL = 'fonts/Onest-VariableFont_wght.ttf'
const FONT_REGULAR = 'fonts/rostex.regular.ttf'

const RING_SEGMENTS = 8
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENTS
const RING_SEGMENT_GAP = 4

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let timeDigitCells = []
let timeColonCells = []
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

let bottomPaiValueWidget = null
let bottomPaiRing = null

let weatherSensor = null
let weatherNewSensor = null
let weatherValueWidget = null
let weatherIconWidget = null
let weatherCode = -1

let mainTimer = null

let heartRateSensor = null
let stepSensor = null
let batterySensor = null
let paiSensor = null

let onHrChange = null
let onStepChange = null
let onBatteryChange = null

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

function createFixedTextCell(options) {
  const cell = {
    glowWidgets: [],
    shadow: null,
    main: null
  }

  if (options.glowColor) {
    for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
      const [dx, dy] = TIME_GLOW_OFFSETS[i]
      cell.glowWidgets.push(createText({
        x: options.x + dx,
        y: options.y + dy,
        w: options.w,
        h: options.h,
        text: options.text,
        text_size: options.text_size,
        font: options.font,
        color: options.glowColor,
        align_h: options.align_h,
        align_v: options.align_v
      }))
    }
  }

  cell.shadow = createText({
    x: options.x + TIME_SHADOW_OFFSET,
    y: options.y + TIME_SHADOW_OFFSET,
    w: options.w,
    h: options.h,
    text: options.text,
    text_size: options.text_size,
    font: options.font,
    color: COLOR_SHADOW,
    align_h: options.align_h,
    align_v: options.align_v
  })

  cell.main = createText({
    x: options.x,
    y: options.y,
    w: options.w,
    h: options.h,
    text: options.text,
    text_size: options.text_size,
    font: options.font,
    color: options.color,
    align_h: options.align_h,
    align_v: options.align_v
  })

  return cell
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

function paiGradient(t) {
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
  // Ширина текстовых боксов выровнена с нижним рядом (BOTTOM_BLOCK_W = 120),
  // чтобы обе строки виджетов выглядели единообразно.
  const halfW = 60
  const labelW = 120

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
    x: HR_CX - halfW,
    y: TOP_VALUE_CY - 13,
    w: halfW * 2,
    h: 26,
    text: '--',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: HR_CX - labelW / 2,
    y: TOP_LABEL_CY - 9,
    w: labelW,
    h: 18,
    text: 'BPM',
    text_size: 12,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Кольцо шагов ---
  stepsRing = createGradientRing(STEPS_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, stepsGradient)
  drawTopSpriteIcon(STEPS_CX, TOP_ICON_CY, 'icons/steps.png')

  distanceValueWidget = createText({
    x: STEPS_CX - halfW,
    y: TOP_VALUE_CY - 13,
    w: halfW * 2,
    h: 26,
    text: '0.00',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: STEPS_CX - labelW / 2,
    y: TOP_LABEL_CY - 9,
    w: labelW,
    h: 18,
    text: 'KM',
    text_size: 12,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Кольцо калорий ---
  caloriesRing = createGradientRing(BAT_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, batteryGradient)
  drawTopSpriteIcon(BAT_CX, TOP_ICON_CY, 'icons/calories.png')

  caloriesValueWidget = createText({
    x: BAT_CX - halfW,
    y: TOP_VALUE_CY - 13,
    w: halfW * 2,
    h: 26,
    text: '0',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: BAT_CX - labelW / 2,
    y: TOP_LABEL_CY - 9,
    w: labelW,
    h: 18,
    text: 'KCAL',
    text_size: 12,
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

  const now = new Date()
  const hh = twoDigits(now.getHours())
  const mm = twoDigits(now.getMinutes())

  timeDigitCells = [
    createFixedTextCell({
      x: TIME_HH_TENS_X,
      y: boxY,
      w: TIME_HHMM_DIGIT_W,
      h: TIME_ROW_H,
      text: hh[0],
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_WHITE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }),
    createFixedTextCell({
      x: TIME_HH_UNITS_X,
      y: boxY,
      w: TIME_HHMM_DIGIT_W,
      h: TIME_ROW_H,
      text: hh[1],
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_WHITE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }),
    createFixedTextCell({
      x: TIME_MM_TENS_X,
      y: boxY,
      w: TIME_HHMM_DIGIT_W,
      h: TIME_ROW_H,
      text: mm[0],
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_WHITE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }),
    createFixedTextCell({
      x: TIME_MM_UNITS_X,
      y: boxY,
      w: TIME_HHMM_DIGIT_W,
      h: TIME_ROW_H,
      text: mm[1],
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_WHITE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    })
  ]

  timeColonCells = [
    createFixedTextCell({
      x: TIME_HHMM_COLON_X,
      y: boxY,
      w: TIME_COLON_W,
      h: TIME_ROW_H,
      text: ':',
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_SEC,
      glowColor: TIME_GLOW_COLOR,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }),
    createFixedTextCell({
      x: TIME_COLON_X,
      y: boxY,
      w: TIME_COLON_W,
      h: TIME_ROW_H,
      text: ':',
      text_size: TIME_FONT_SIZE,
      font: FONT_REGULAR,
      color: COLOR_SEC,
      glowColor: TIME_GLOW_COLOR,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    })
  ]

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
    // FILL_RECT вместо LINE: widget.LINE не отрисовывается на части устройств
    createWidget(widget.FILL_RECT, {
      x: SECTION_LINE_X,
      y: yPositions[i],
      w: SECTION_LINE_W,
      h: DIVIDER_H,
      color: COLOR_DIVIDER
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
    // Файлы иконок названы с ведущим нулём: Weather_01.png … Weather_29.png,
    // поэтому номер файла формируется через twoDigits (Weather_1.png не существует).
    weatherIconWidget.setProperty(prop.SRC, WEATHER_ICON_BASE + twoDigits(idx + 1) + '.png')
  }
}

function createBottomWidgets() {
  const halfW = BOTTOM_BLOCK_W / 2

  // --- Погода (слева): иконка центрирована на одной оси с кольцами ---
  weatherIconWidget = createWidget(widget.IMG, {
    x: WEATHER_CX - BOTTOM_ICON_SIZE / 2,
    y: BOTTOM_RING_CY - BOTTOM_ICON_SIZE / 2,
    w: BOTTOM_ICON_SIZE,
    h: BOTTOM_ICON_SIZE,
    src: WEATHER_ICON_BASE + '26.png',
    auto_scale: true
  })

  weatherValueWidget = createText({
    x: WEATHER_CX - halfW,
    y: BOTTOM_VALUE_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_VALUE_BOX_H,
    text: '--°',
    text_size: BOTTOM_VALUE_FONT,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: WEATHER_CX - halfW,
    y: BOTTOM_LABEL_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_LABEL_BOX_H,
    text: 'WEATHER',
    text_size: BOTTOM_LABEL_FONT,
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
    text_size: BOTTOM_VALUE_FONT,
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
    text_size: BOTTOM_LABEL_FONT,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- PAI (справа): кольцо в стиле верхних виджетов ---
  bottomPaiRing = createGradientRing(
    PAI_CX, BOTTOM_RING_CY, BOTTOM_RING_R, BOTTOM_RING_GLOW_R,
    BOTTOM_RING_LINE_W, paiGradient
  )
  createText({
    x: PAI_CX - 40,
    y: BOTTOM_RING_CY - 11,
    w: 80,
    h: 22,
    text: 'PAI',
    text_size: 16,
    color: COLOR_PURPLE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  bottomPaiValueWidget = createText({
    x: PAI_CX - halfW,
    y: BOTTOM_VALUE_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_VALUE_BOX_H,
    text: '--',
    text_size: BOTTOM_VALUE_FONT,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createText({
    x: PAI_CX - halfW,
    y: BOTTOM_LABEL_BOX_Y,
    w: BOTTOM_BLOCK_W,
    h: BOTTOM_LABEL_BOX_H,
    text: 'PAI',
    text_size: BOTTOM_LABEL_FONT,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })
}

// ============================================================
// КЛИКАБЕЛЬНЫЕ ЗОНЫ («КНОПКИ»)
// ============================================================
// Невидимые BUTTON-кнопки поверх виджетов (новый API, работает и на
// устройстве, и в симуляторе): по тапу открывается системное приложение
// через launchApp(). Состояния кнопки заданы парой PNG точного размера
// зоны (генерируются скриптом scripts/make-click-highlight.js):
// normal_src — полностью прозрачный, press_src — мягкая подсветка,
// видимая в момент нажатия.
//
// Шаги и калории открывают системную «Активность» (SYSTEM_APP_STATUS),
// батарея — «Настройки» (отдельного системного приложения батареи нет).

const CLICK_ZONE_W = 120                        // ширина кликабельной зоны колонки (= BOTTOM_BLOCK_W)

// Геометрия зон времени и даты (зазоры вокруг разделителей)
const TIME_ZONE_Y = TOP_TIME_LINE_Y + 3               // верх зоны строки времени
const TIME_ZONE_H = 78                                // высота зоны времени (до разделителя с запасом)
const TIME_SEC_ZONE_W = TIME_COLON_W + TIME_SEC_DIGIT_W * 2  // ширина зоны «:SS»
const DATE_ZONE_Y = TIME_DATE_LINE_Y + 1              // верх зоны строки даты
const DATE_ZONE_H = DATE_BOTTOM_LINE_Y - TIME_DATE_LINE_Y - 1 // высота зоны даты
const DATE_ZONE_W = 280                               // ширина зоны даты (по центру)

// Пары [нажатие, покой] PNG-подложек для каждой зоны
const CLICK_IMG = {
  top: ['icons/click_top.png', 'icons/click_top_n.png'],
  steps: ['icons/click_steps.png', 'icons/click_steps_n.png'],
  timeHhmm: ['icons/click_time_hhmm.png', 'icons/click_time_hhmm_n.png'],
  timeSec: ['icons/click_time_sec.png', 'icons/click_time_sec_n.png'],
  date: ['icons/click_date.png', 'icons/click_date_n.png'],
  bottom: ['icons/click_bottom.png', 'icons/click_bottom_n.png']
}

function createZoneButton(x, y, w, h, images, systemAppId) {
  createWidget(widget.BUTTON, {
    x,
    y,
    w,
    h,
    normal_src: images[1],
    press_src: images[0],
    click_func: () => {
      try {
        launchApp({ appId: systemAppId, native: true })
      } catch (e) {
        console.log('zone launch error:', systemAppId, e)
      }
    }
  })
}

function createClickZones() {
  const topTop = TOP_CY - TOP_R - 6
  const topBottom = TOP_LABEL_CY + 12
  const bottomTop = BOTTOM_RING_CY - BOTTOM_RING_R - 6
  const bottomBottom = BOTTOM_LABEL_BOX_Y + BOTTOM_LABEL_BOX_H

  // Верхний ряд: пульс / шаги (зона шире — включает счётчик шагов сверху) / калории
  createZoneButton(HR_CX - CLICK_ZONE_W / 2, topTop, CLICK_ZONE_W, topBottom - topTop, CLICK_IMG.top, SYSTEM_APP_HR)
  createZoneButton(STEPS_CX - CLICK_ZONE_W / 2, 24, CLICK_ZONE_W, topBottom - 24, CLICK_IMG.steps, SYSTEM_APP_STATUS)
  createZoneButton(BAT_CX - CLICK_ZONE_W / 2, topTop, CLICK_ZONE_W, topBottom - topTop, CLICK_IMG.top, SYSTEM_APP_STATUS)

  // Строка времени: HH:MM → будильник, «:SS» → секундомер
  createZoneButton(TIME_HHMM_X, TIME_ZONE_Y, TIME_HHMM_BOX_W, TIME_ZONE_H, CLICK_IMG.timeHhmm, SYSTEM_APP_ALARM)
  createZoneButton(TIME_COLON_X, TIME_ZONE_Y, TIME_SEC_ZONE_W, TIME_ZONE_H, CLICK_IMG.timeSec, SYSTEM_APP_STOPWATCH)

  // Строка даты → экран сна
  createZoneButton(CENTER_X - DATE_ZONE_W / 2, DATE_ZONE_Y, DATE_ZONE_W, DATE_ZONE_H, CLICK_IMG.date, SYSTEM_APP_SLEEP)

  // Нижний ряд: погода / батарея / PAI
  createZoneButton(WEATHER_CX - CLICK_ZONE_W / 2, bottomTop, CLICK_ZONE_W, bottomBottom - bottomTop, CLICK_IMG.bottom, SYSTEM_APP_WEATHER)
  createZoneButton(BAT2_CX - CLICK_ZONE_W / 2, bottomTop, CLICK_ZONE_W, bottomBottom - bottomTop, CLICK_IMG.bottom, SYSTEM_APP_SETTING)
  createZoneButton(PAI_CX - CLICK_ZONE_W / 2, bottomTop, CLICK_ZONE_W, bottomBottom - bottomTop, CLICK_IMG.bottom, SYSTEM_APP_PAI)
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

  const timeDigits = [hh[0], hh[1], mm[0], mm[1]]
  for (let i = 0; i < timeDigitCells.length; i++) {
    timeDigitCells[i].main.setProperty(prop.TEXT, timeDigits[i])
    timeDigitCells[i].shadow.setProperty(prop.TEXT, timeDigits[i])
  }
  for (let i = 0; i < timeColonCells.length; i++) {
    timeColonCells[i].main.setProperty(prop.TEXT, ':')
    timeColonCells[i].shadow.setProperty(prop.TEXT, ':')
    for (let j = 0; j < timeColonCells[i].glowWidgets.length; j++) {
      timeColonCells[i].glowWidgets[j].setProperty(prop.TEXT, ':')
    }
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
// ОБНОВЛЕНИЕ: PAI (нижний виджет)
// ============================================================

// У Pai из @zos/sensor нет событий изменения — значение читаем принудительно
// (в initSensors и в общем таймере, как погоду). Возвращает число — причём 0
// является валидным значением («активности сегодня ещё нет») — или null,
// если сенсор недоступен/не вернул число.
function readPaiValue(sensor) {
  if (!sensor) return null
  try {
    let v = null
    if (typeof sensor.getToday === 'function') v = sensor.getToday()
    else if (typeof sensor.getTotal === 'function') v = sensor.getTotal()
    return typeof v === 'number' && isFinite(v) ? v : null
  } catch (e) {
    console.log('[Digital] pai read error:', e)
    return null
  }
}

let lastPaiLogged = null

function updatePai(raw) {
  const value = typeof raw === 'number' && isFinite(raw) ? Math.max(0, Math.round(raw)) : null
  bottomPaiValueWidget.setProperty(prop.TEXT, value !== null ? String(value) : '--')
  // Ориентир — 100 PAI (рекомендованная недельная норма WHO/Zepp):
  // кольцо полностью загорается при 100 PAI.
  updateGradientRing(bottomPaiRing, clamp((value || 0) / 100, 0, 1))
  // Диагностика в консоль dev-сервера: только при изменении значения.
  if (value !== lastPaiLogged) {
    lastPaiLogged = value
    console.log('[Digital] pai:', raw, '->', value !== null ? value : "'--'")
  }
}

let lastWeatherTemp = null

function updateWeatherFromSensor() {
  try {
    if (weatherSensor) {
      // Основной путь (устройство): легаси-сенсор с текущей температурой.
      const curTemp = weatherSensor.current
      if (curTemp !== undefined && curTemp !== null) {
        weatherValueWidget.setProperty(prop.TEXT, Math.round(curTemp) + '°')
        // Диагностика в консоль dev-сервера: только при изменении температуры.
        if (curTemp !== lastWeatherTemp) {
          lastWeatherTemp = curTemp
          console.log('[Digital] weather: temp=', curTemp, 'airIconIndex=', weatherSensor.curAirIconIndex)
        }
      }
      const curIdx = weatherSensor.curAirIconIndex
      if (curIdx !== undefined && curIdx !== null && curIdx >= 0 && curIdx <= 28) {
        updateWeatherIcon(Number(curIdx))
      }
    } else if (weatherNewSensor) {
      // Фолбэк (симулятор): прогноз нового API, данные за сегодня — data[0].
      const read = typeof weatherNewSensor.getForecastWeather === 'function'
        ? weatherNewSensor.getForecastWeather()
        : (typeof weatherNewSensor.getForecast === 'function' ? weatherNewSensor.getForecast() : null)
      const today = read && read.forecastData && read.forecastData.data && read.forecastData.data[0]
      // В симуляторе без данных о городе Weather возвращает нулевую заглушку
      // (high=0, low=0, index=0) — считаем это отсутствием данных и оставляем
      // '--°', чтобы не показывать ложные «0°». На устройстве работает легаси-
      // сенсор, эта ветка до него не доходит.
      const hasData = today && (today.high !== 0 || today.low !== 0 || today.index !== 0)
      if (hasData && typeof today.high === 'number' && isFinite(today.high)) {
        weatherValueWidget.setProperty(prop.TEXT, Math.round(today.high) + '°')
        if (today.high !== lastWeatherTemp) {
          lastWeatherTemp = today.high
          console.log('[Digital] weather(new): high=', today.high, 'low=', today.low, 'index=', today.index)
        }
      }
      if (hasData && typeof today.index === 'number' && today.index >= 0 && today.index <= 28) {
        updateWeatherIcon(today.index)
      }
    }
  } catch (e) {
    console.log('[Digital] weather read error:', e)
  }
}

// ============================================================
// ДАТЧИКИ
// ============================================================

function initSensors() {
  heartRateSensor = new HeartRate()
  stepSensor = new Step()
  batterySensor = new Battery()

  // Pai доступен только в новом API (@zos/sensor), легаси-фолбэка hmSensor нет.
  try { paiSensor = new Pai(); } catch(e) { paiSensor = null; }

  // Погода: легаси hmSensor.WEATHER официально не затронут deprecation'ом для
  // циферблатов и работает на устройстве, но в симуляторе недоступен — поэтому
  // как фолбэк пробуем также новый API Weather(@zos/sensor).
  try { weatherSensor = hmSensor.createSensor(hmSensor.id.WEATHER); } catch(e) { weatherSensor = null; }
  if (!weatherSensor) {
    try { weatherNewSensor = new Weather(); } catch(e) { weatherNewSensor = null; }
  }

  console.log('[Digital] sensors:', paiSensor ? 'pai ok' : 'pai unavailable', '|',
    weatherSensor ? 'weather legacy ok' : (weatherNewSensor ? 'weather new-api' : 'weather unavailable'))

  updateHeartRate(heartRateSensor.getCurrent ? heartRateSensor.getCurrent() : 0)

  const initialSteps = stepSensor.getCurrent ? stepSensor.getCurrent() : 0
  if (stepSensor.getTarget) {
    const target = stepSensor.getTarget()
    stepGoal = target && target > 0 ? target : 10000
  }
  updateSteps(initialSteps)

  updateBattery(batterySensor.getCurrent ? batterySensor.getCurrent() : 0)

  updatePai(readPaiValue(paiSensor))

  updateWeatherFromSensor()

  console.log('[Digital] init values: pai=', readPaiValue(paiSensor),
    '| weather.current=', weatherSensor ? weatherSensor.current : (weatherNewSensor ? 'new-api' : 'no sensor'),
    '| weather.curAirIconIndex=', weatherSensor ? weatherSensor.curAirIconIndex : (weatherNewSensor ? 'new-api' : 'no sensor'))

  onHrChange = () => {
    updateHeartRate(heartRateSensor.getCurrent())
  }
  onStepChange = () => {
    updateSteps(stepSensor.getCurrent())
  }
  onBatteryChange = () => {
    updateBattery(batterySensor.getCurrent())
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
}

// ============================================================
// ТАЙМЕР
// ============================================================

function startTimer() {
  updateTime()
  mainTimer = setInterval(() => {
    updateTime()
    updateWeatherFromSensor()
    updatePai(readPaiValue(paiSensor))
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
    // Кликабельные зоны создаются последними, чтобы лежать поверх всех виджетов.
    createClickZones()

    initSensors()
    startTimer()
  },

  onDestroy() {
    stopTimer()
    teardownSensors()
  }
})
