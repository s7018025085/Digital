import { createWidget, widget, align, prop } from '@zos/ui'
import { HeartRate, Step, Battery } from '@zos/sensor'
import { setInterval, clearInterval } from '@zos/timer'

// ============================================================
// LAYOUT
// ============================================================
// All positions below are hand-checked against the round display's
// safe-circle radius (R_SAFE) so nothing gets clipped by the bezel.
// If you move anything, keep it inside R_SAFE from CENTER_X/CENTER_Y.

const SCREEN_W = 480
const SCREEN_H = 480
const CENTER_X = 240
const CENTER_Y = 240
const R_SAFE = 228 // usable radius before the round edge starts cutting content

// Top ring widgets (Pulse / Steps / Battery)
const TOP_CY = 118
const TOP_R = 40
const TOP_GLOW_R = 44
const TOP_LINE_W = 7

const HR_CX = 128
const STEPS_CX = 240
const BAT_CX = 352

// Main time - assembled as one centered row: [HH:MM] [:] [S-tens] [S-units]
// HH:MM is right-aligned inside its own box so we never have to guess its
// exact rendered width - the last character always sits flush against
// TIME_HHMM_RIGHT regardless of font metrics. The two seconds digits are
// fixed-width boxes with centered text, so single glyphs are always
// centered too. Only the total reserved width (TIME_HHMM_BOX_W etc.) is a
// rough estimate for centering the whole row - if the row looks shifted
// left/right as a whole, tweak TIME_HHMM_BOX_W below.
const TIME_CY = 236
const TIME_FONT_SIZE = 72
const TIME_SHADOW_OFFSET = 3
const TIME_ROW_H = TIME_FONT_SIZE + 20

const TIME_HHMM_BOX_W = 200 // reserved width for "HH:MM" at TIME_FONT_SIZE
const TIME_COLON_W = 30
const TIME_SEC_DIGIT_W = 54

const TIME_ROW_TOTAL_W = TIME_HHMM_BOX_W + TIME_COLON_W + TIME_SEC_DIGIT_W * 2
const TIME_ROW_LEFT = CENTER_X - TIME_ROW_TOTAL_W / 2

const TIME_HHMM_X = TIME_ROW_LEFT
const TIME_HHMM_RIGHT = TIME_HHMM_X + TIME_HHMM_BOX_W
const TIME_COLON_X = TIME_HHMM_RIGHT
const TIME_SEC_TENS_X = TIME_COLON_X + TIME_COLON_W
const TIME_SEC_UNITS_X = TIME_SEC_TENS_X + TIME_SEC_DIGIT_W

// Rolling-digit "mechanical odometer" animation timing
const ROLL_DURATION_MS = 260
const ROLL_STEP_MS = 26
const ROLL_STEPS = Math.round(ROLL_DURATION_MS / ROLL_STEP_MS)

// Date block
const WEEKDAY_CY = 306
const DATE_CY = 334
const DATE_FONT_SIZE = 20
const WEEKDAY_FONT_SIZE = 22

// Bottom info blocks (kept close together + raised so the round
// edge doesn't clip the labels, which is the tightest row on screen)
const BOTTOM_ICON_CY = 372
const BOTTOM_VALUE_CY = 390
const BOTTOM_LABEL_CY = 410
const BOTTOM_BLOCK_W = 96

const WEATHER_CX = 134
const ACTIVITY_CX = 240
const STEPS2_CX = 346

// Bezel ticks
const TICK_R = 222
const TICK_R_OUTER = 234

// ============================================================
// COLORS
// ============================================================

const COLOR_BG = 0x05070a
const COLOR_WHITE = 0xf5f5f5
const COLOR_CYAN = 0x00d9ff
const COLOR_SEC = 0x00d9ff
const COLOR_RED = 0xff3b30
const COLOR_YELLOW = 0xffd60a
const COLOR_GREEN = 0x30d158
const COLOR_GRAY = 0x8d959d
const COLOR_TRACK = 0x1c1f24
const COLOR_GLOW = 0x14181d
const COLOR_TICK_DIM = 0x30343a
const COLOR_SHADOW = 0x000000

const RING_SEGMENTS = 8
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENTS
const RING_SEGMENT_GAP = 4

// ============================================================
// STATE
// ============================================================

let timeWidget = null
let timeShadowWidget = null
let colonWidget = null

let secTensSlot = null
let secUnitsSlot = null
let rollTimer = null
let weekdayWidget = null
let dateWidget = null

let hrValueWidget = null
let hrRing = null

let stepsValueWidget = null
let stepsRing = null

let batValueWidget = null
let batRing = null

let bottomStepsValueWidget = null

let mainTimer = null

let heartRateSensor = null
let stepSensor = null
let batterySensor = null

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
// HELPERS
// ============================================================

function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
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

// 3-stop gradient helper: colorA -> colorB -> colorC as t goes 0 -> 1
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
  return lerpColor(COLOR_CYAN, COLOR_GREEN, clamp(t, 0, 1))
}

function batteryGradient(t) {
  return triColor(t, COLOR_RED, COLOR_YELLOW, COLOR_GREEN)
}

// ============================================================
// BACKGROUND
// ============================================================

function createBackground() {
  createWidget(widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: SCREEN_W,
    h: SCREEN_H,
    color: COLOR_BG
  })

  // Thin decorative outer ring
  createWidget(widget.ARC, {
    x: CENTER_X - TICK_R_OUTER,
    y: CENTER_Y - TICK_R_OUTER,
    w: TICK_R_OUTER * 2,
    h: TICK_R_OUTER * 2,
    start_angle: -90,
    end_angle: 270,
    color: COLOR_TRACK,
    line_width: 2
  })

  createTicks()
}

// 12 short hour ticks around the bezel; 12/3/6/9 slightly brighter/thicker.
function createTicks() {
  for (let i = 0; i < 12; i++) {
    const angle = -90 + i * 30
    const isCardinal = i % 3 === 0
    const halfWidth = isCardinal ? 2 : 1.2

    createWidget(widget.ARC, {
      x: CENTER_X - TICK_R,
      y: CENTER_Y - TICK_R,
      w: TICK_R * 2,
      h: TICK_R * 2,
      start_angle: angle - halfWidth,
      end_angle: angle + halfWidth,
      color: isCardinal ? COLOR_GRAY : COLOR_TICK_DIM,
      line_width: isCardinal ? 4 : 2
    })
  }
}

// ============================================================
// GRADIENT RING FACTORY
// ============================================================
// Zepp OS ARC widgets only take a single solid color each, so a smooth
// gradient sweep is faked with N short arc segments, each pre-colored
// along the gradient. On update we only flip segments between their
// gradient color (lit) and the track color (unlit) - no re-creation,
// just setProperty, so it's cheap to animate.

function createGradientRing(cx, cy, r, glowR, lineWidth, gradientFn) {
  const startAngle = -90

  // Soft outer halo - a single dim, slightly larger ring behind everything.
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

  // Background track.
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
// TOP WIDGETS (Pulse / Steps / Battery)
// ============================================================

function createTopWidgets() {
  // --- Heart rate ring ---
  hrRing = createGradientRing(HR_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, heartRateGradient)

  hrValueWidget = createWidget(widget.TEXT, {
    x: HR_CX - TOP_R,
    y: TOP_CY - 14,
    w: TOP_R * 2,
    h: 20,
    text: '--',
    text_size: 24,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createWidget(widget.TEXT, {
    x: HR_CX - TOP_R,
    y: TOP_CY + 8,
    w: TOP_R * 2,
    h: 16,
    text: 'BPM',
    text_size: 12,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Steps ring ---
  stepsRing = createGradientRing(STEPS_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, stepsGradient)

  stepsValueWidget = createWidget(widget.TEXT, {
    x: STEPS_CX - TOP_R,
    y: TOP_CY - 14,
    w: TOP_R * 2,
    h: 20,
    text: '0',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createWidget(widget.TEXT, {
    x: STEPS_CX - TOP_R,
    y: TOP_CY + 8,
    w: TOP_R * 2,
    h: 16,
    text: 'STEPS',
    text_size: 12,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Battery ring ---
  batRing = createGradientRing(BAT_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, batteryGradient)

  batValueWidget = createWidget(widget.TEXT, {
    x: BAT_CX - TOP_R,
    y: TOP_CY - 14,
    w: TOP_R * 2,
    h: 20,
    text: '--%',
    text_size: 22,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createWidget(widget.TEXT, {
    x: BAT_CX - TOP_R,
    y: TOP_CY + 8,
    w: TOP_R * 2,
    h: 16,
    text: 'BATTERY',
    text_size: 12,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })
}

// ============================================================
// MAIN TIME
// ============================================================

function createMainTime() {
  const boxY = TIME_CY - TIME_ROW_H / 2

  // Pseudo drop-shadow for the HH:MM block only (kept simple).
  timeShadowWidget = createWidget(widget.TEXT, {
    x: TIME_HHMM_X + TIME_SHADOW_OFFSET,
    y: boxY + TIME_SHADOW_OFFSET,
    w: TIME_HHMM_BOX_W,
    h: TIME_ROW_H,
    text: '00:00',
    text_size: TIME_FONT_SIZE,
    color: COLOR_SHADOW,
    align_h: align.RIGHT,
    align_v: align.CENTER_V
  })

  timeWidget = createWidget(widget.TEXT, {
    x: TIME_HHMM_X,
    y: boxY,
    w: TIME_HHMM_BOX_W,
    h: TIME_ROW_H,
    text: '00:00',
    text_size: TIME_FONT_SIZE,
    color: COLOR_WHITE,
    align_h: align.RIGHT,
    align_v: align.CENTER_V
  })

  colonWidget = createWidget(widget.TEXT, {
    x: TIME_COLON_X,
    y: boxY,
    w: TIME_COLON_W,
    h: TIME_ROW_H,
    text: ':',
    text_size: TIME_FONT_SIZE,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  const now = new Date()
  const ss = now.getSeconds()
  secTensSlot = createRollingDigit(TIME_SEC_TENS_X, boxY, TIME_SEC_DIGIT_W, TIME_ROW_H, Math.floor(ss / 10))
  secUnitsSlot = createRollingDigit(TIME_SEC_UNITS_X, boxY, TIME_SEC_DIGIT_W, TIME_ROW_H, ss % 10)

  // Masks: thin bars in the background color, drawn on top of the digit
  // slots, that hide whatever slides above/below the visible digit window
  // during the roll animation - this is what makes it look like a real
  // odometer drum instead of two texts sliding past each other in the open.
  createWidget(widget.FILL_RECT, {
    x: TIME_SEC_TENS_X,
    y: boxY - TIME_ROW_H,
    w: TIME_SEC_DIGIT_W * 2,
    h: TIME_ROW_H,
    color: COLOR_BG
  })
  createWidget(widget.FILL_RECT, {
    x: TIME_SEC_TENS_X,
    y: boxY + TIME_ROW_H,
    w: TIME_SEC_DIGIT_W * 2,
    h: TIME_ROW_H,
    color: COLOR_BG
  })
}

// ============================================================
// ROLLING "ODOMETER" DIGIT
// ============================================================
// Two stacked TEXT widgets per digit: `current` (visible) and `next`
// (parked one row-height below, hidden behind the bottom mask). On a
// value change both slide upward together over ROLL_STEPS frames; the
// masks created in createMainTime() clip anything that overshoots the
// visible window, so it reads as the old digit rolling away and the new
// one rolling into place - like a mechanical counter drum.

function createRollingDigit(x, y, w, h, initialValue) {
  const current = createWidget(widget.TEXT, {
    x,
    y,
    w,
    h,
    text: String(initialValue),
    text_size: TIME_FONT_SIZE,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  const next = createWidget(widget.TEXT, {
    x,
    y: y + h,
    w,
    h,
    text: String(initialValue),
    text_size: TIME_FONT_SIZE,
    color: COLOR_SEC,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  return {
    current,
    next,
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

  ensureRollTimerRunning()
}

function advanceDigitRoll(slot) {
  if (!slot.animating) return false

  slot.step += 1
  const t = clamp(slot.step / ROLL_STEPS, 0, 1)
  const offset = Math.round(t * slot.h)

  slot.current.setProperty(prop.MORE, { y: slot.baseY - offset })
  slot.next.setProperty(prop.MORE, { y: slot.baseY + slot.h - offset })

  if (slot.step >= ROLL_STEPS) {
    slot.current.setProperty(prop.TEXT, String(slot.pendingValue))
    slot.current.setProperty(prop.MORE, { y: slot.baseY })
    slot.next.setProperty(prop.MORE, { y: slot.baseY + slot.h })
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
// DATE
// ============================================================

function createDate() {
  weekdayWidget = createWidget(widget.TEXT, {
    x: 0,
    y: WEEKDAY_CY - 14,
    w: SCREEN_W,
    h: 26,
    text: 'ПОНЕДЕЛЬНИК',
    text_size: WEEKDAY_FONT_SIZE,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  dateWidget = createWidget(widget.TEXT, {
    x: 0,
    y: DATE_CY - 12,
    w: SCREEN_W,
    h: 22,
    text: '01.01.2026',
    text_size: DATE_FONT_SIZE,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })
}

// ============================================================
// BOTTOM WIDGETS (Weather / Activity / Steps)
// ============================================================

function createBottomWidgets() {
  const halfW = BOTTOM_BLOCK_W / 2

  // --- Weather (left) ---
  createWidget(widget.ARC, {
    x: WEATHER_CX - 10,
    y: BOTTOM_ICON_CY - 10,
    w: 20,
    h: 20,
    start_angle: -90,
    end_angle: 230,
    color: COLOR_GRAY,
    line_width: 3
  })

  createWidget(widget.TEXT, {
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

  createWidget(widget.TEXT, {
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

  // --- Activity (center) ---
  createWidget(widget.ARC, {
    x: ACTIVITY_CX - 10,
    y: BOTTOM_ICON_CY - 10,
    w: 20,
    h: 20,
    start_angle: -90,
    end_angle: 180,
    color: COLOR_CYAN,
    line_width: 3
  })

  createWidget(widget.TEXT, {
    x: ACTIVITY_CX - halfW,
    y: BOTTOM_LABEL_CY - 10,
    w: BOTTOM_BLOCK_W,
    h: 16,
    text: 'ACTIVITY',
    text_size: 11,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  // --- Steps (right) ---
  createWidget(widget.ARC, {
    x: STEPS2_CX - 10,
    y: BOTTOM_ICON_CY - 10,
    w: 20,
    h: 20,
    start_angle: -90,
    end_angle: 300,
    color: COLOR_GREEN,
    line_width: 3
  })

  bottomStepsValueWidget = createWidget(widget.TEXT, {
    x: STEPS2_CX - halfW,
    y: BOTTOM_VALUE_CY - 12,
    w: BOTTOM_BLOCK_W,
    h: 22,
    text: '0',
    text_size: 20,
    color: COLOR_WHITE,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })

  createWidget(widget.TEXT, {
    x: STEPS2_CX - halfW,
    y: BOTTOM_LABEL_CY - 10,
    w: BOTTOM_BLOCK_W,
    h: 16,
    text: 'STEPS',
    text_size: 11,
    color: COLOR_GRAY,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V
  })
}

// ============================================================
// UPDATE: TIME / DATE
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

  weekdayWidget.setProperty(prop.TEXT, WEEKDAYS[weekdayIndex])
  dateWidget.setProperty(prop.TEXT, dd + '.' + mo + '.' + yyyy)
}

// ============================================================
// UPDATE: HEART RATE
// ============================================================

function updateHeartRate(bpm) {
  const value = bpm && bpm > 0 ? bpm : 0
  hrValueWidget.setProperty(prop.TEXT, value > 0 ? String(value) : '--')

  const ratio = clamp(value / 180, 0, 1)
  updateGradientRing(hrRing, value > 0 ? ratio : 0)
}

// ============================================================
// UPDATE: STEPS
// ============================================================

let stepGoal = 10000

function updateSteps(current) {
  const value = current || 0
  stepsValueWidget.setProperty(prop.TEXT, String(value))
  bottomStepsValueWidget.setProperty(prop.TEXT, String(value))

  const ratio = clamp(value / stepGoal, 0, 1)
  updateGradientRing(stepsRing, ratio)
}

// ============================================================
// UPDATE: BATTERY
// ============================================================

function updateBattery(pct) {
  const value = clamp(pct || 0, 0, 100)
  batValueWidget.setProperty(prop.TEXT, value + '%')

  const ratio = value / 100
  updateGradientRing(batRing, ratio)
}

// ============================================================
// SENSORS
// ============================================================

function initSensors() {
  heartRateSensor = new HeartRate()
  stepSensor = new Step()
  batterySensor = new Battery()

  // Initial values
  updateHeartRate(heartRateSensor.getCurrent ? heartRateSensor.getCurrent() : 0)

  const initialSteps = stepSensor.getCurrent ? stepSensor.getCurrent() : 0
  if (stepSensor.getTarget) {
    const target = stepSensor.getTarget()
    stepGoal = target && target > 0 ? target : 10000
  }
  updateSteps(initialSteps)

  updateBattery(batterySensor.getCurrent ? batterySensor.getCurrent() : 0)

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
// TIMER
// ============================================================

function startTimer() {
  updateTime()
  mainTimer = setInterval(() => {
    updateTime()
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
// LIFECYCLE
// ============================================================

WatchFace({
  build() {
    createBackground()
    createTopWidgets()
    createMainTime()
    createDate()
    createBottomWidgets()

    initSensors()
    startTimer()
  },

  onDestroy() {
    stopTimer()
    teardownSensors()
  }
})
