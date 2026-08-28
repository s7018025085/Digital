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

// Compact top statistics, inspired by the three small dials in the reference.
// Moving them up leaves a clear visual gap before the enlarged time display.
const TOP_CY = 95
const TOP_R = 29
const TOP_GLOW_R = 32
const TOP_LINE_W = 5

// Icons stay inside their dials; values and captions form two clear rows
// directly underneath, as in the reference layout.
const TOP_ICON_CY = TOP_CY - 9
const TOP_VALUE_CY = TOP_CY + TOP_R + 16
const TOP_LABEL_CY = TOP_VALUE_CY + 21

const HR_CX = 160
const STEPS_CX = 240
const BAT_CX = 320

// Main time - assembled as one centered row: [HH:MM] [:] [S-tens] [S-units]
// HH:MM is right-aligned inside its own box so we never have to guess its
// exact rendered width - the last character always sits flush against
// TIME_HHMM_RIGHT regardless of font metrics. The two seconds digits are
// fixed-width boxes with centered text, so single glyphs are always
// centered too. Only the total reserved width (TIME_HHMM_BOX_W etc.) is a
// rough estimate for centering the whole row - if the row looks shifted
// left/right as a whole, tweak TIME_HHMM_BOX_W below.
const TIME_CY = 214
// Rostex has wide glyphs, so these dimensions reserve enough room for the
// complete HH:MM:SS row on a 480 px screen without clipping its first digit.
const TIME_FONT_SIZE = 58
const TIME_SHADOW_OFFSET = 2
const TIME_ROW_H = TIME_FONT_SIZE + 20

// Soft glow behind the time: a handful of dim copies offset by 1-2px in
// each direction, drawn under the shadow/main text. Cheap fake bloom -
// Zepp OS text widgets have no alpha blending, so we can't do a real blur.
const TIME_GLOW_COLOR = 0x0b5b6d
const TIME_GLOW_OFFSETS = [
  [-2, 0], [2, 0], [0, -2], [0, 2],
  [-1, -1], [1, -1], [-1, 1], [1, 1]
]

// Leave generous room for Rostex's wide HH:MM glyphs; otherwise Zepp OS
// treats the text as overflowing and starts its marquee animation.
const TIME_HHMM_BOX_W = 260
const TIME_COLON_W = 24
const TIME_SEC_DIGIT_W = 56
const TIME_ROLL_MASK_PADDING = 16

const TIME_ROW_TOTAL_W = TIME_HHMM_BOX_W + TIME_COLON_W + TIME_SEC_DIGIT_W * 2
// Rostex's HH:MM glyphs carry more visual weight on the right, so a small
// optical correction keeps the rendered time centered on the round display.
const TIME_ROW_LEFT = CENTER_X - TIME_ROW_TOTAL_W / 2 - 10

const TIME_HHMM_X = TIME_ROW_LEFT
const TIME_HHMM_RIGHT = TIME_HHMM_X + TIME_HHMM_BOX_W
const TIME_COLON_X = TIME_HHMM_RIGHT
const TIME_SEC_TENS_X = TIME_COLON_X + TIME_COLON_W
const TIME_SEC_UNITS_X = TIME_SEC_TENS_X + TIME_SEC_DIGIT_W

// Rolling-digit "mechanical odometer" animation timing
const ROLL_DURATION_MS = 260
const ROLL_STEP_MS = 26
const ROLL_STEPS = Math.round(ROLL_DURATION_MS / ROLL_STEP_MS)

// Date block - weekday + date now render as a single centered line
const DATE_LINE_CY = 290
const DATE_LINE_FONT_SIZE = 16

// Subtle horizontal dividers keep the compact upper statistics, time and
// date visually separated without competing with the bezel tick marks.
const SECTION_LINE_X = 78
const SECTION_LINE_W = SCREEN_W - SECTION_LINE_X * 2
const TOP_TIME_LINE_Y = 168
const TIME_DATE_LINE_Y = 264
const DATE_BOTTOM_LINE_Y = 318

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
const COLOR_PURPLE = 0xa970ff
const COLOR_YELLOW = 0xffd60a
const COLOR_GREEN = 0x30d158
const COLOR_GRAY = 0x8d959d
const COLOR_TRACK = 0x1c1f24
const COLOR_GLOW = 0x14181d
const COLOR_TICK_DIM = 0x30343a
const COLOR_SHADOW = 0x000000
const FONT_REGULAR = 'fonts/rostex.regular.ttf'

const RING_SEGMENTS = 8
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENTS
const RING_SEGMENT_GAP = 4

// ============================================================
// STATE
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

function createText(options) {
  options.font = FONT_REGULAR
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
  return lerpColor(COLOR_PURPLE, COLOR_CYAN, clamp(t, 0, 1))
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
// TOP ICONS
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

// Heartbeat / pulse glyph: a small ECG-style zigzag line.
function drawPulseIcon(cx, cy, color) {
  const pts = [
    [cx - 11, cy], [cx - 5, cy], [cx - 2, cy - 7],
    [cx + 2, cy + 7], [cx + 5, cy], [cx + 11, cy]
  ]
  for (let i = 0; i < pts.length - 1; i++) {
    createWidget(widget.LINE, {
      x1: pts[i][0], y1: pts[i][1],
      x2: pts[i + 1][0], y2: pts[i + 1][1],
      color,
      line_width: 2
    })
  }
}

// Walking-figure glyph for steps: head + torso + legs + arms.
function drawStepsIcon(cx, cy, color) {
  createWidget(widget.CIRCLE, {
    center_x: cx + 2,
    center_y: cy - 8,
    radius: 3,
    color
  })
  createWidget(widget.LINE, { x1: cx + 1, y1: cy - 5, x2: cx - 2, y2: cy + 3, color, line_width: 2 })
  createWidget(widget.LINE, { x1: cx - 2, y1: cy + 3, x2: cx - 7, y2: cy + 7, color, line_width: 2 })
  createWidget(widget.LINE, { x1: cx - 2, y1: cy + 3, x2: cx + 4, y2: cy + 6, color, line_width: 2 })
  createWidget(widget.LINE, { x1: cx + 1, y1: cy - 3, x2: cx + 8, y2: cy - 1, color, line_width: 2 })
  createWidget(widget.LINE, { x1: cx + 1, y1: cy - 3, x2: cx - 5, y2: cy - 6, color, line_width: 2 })
}

// Battery-cell glyph: outline body + terminal cap.
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

// Flame glyph for calories: a simple filled ember with a pointed flame tip.
function drawCalorieIcon(cx, cy, color) {
  createWidget(widget.CIRCLE, {
    center_x: cx,
    center_y: cy + 3,
    radius: 6,
    color
  })
  createWidget(widget.LINE, {
    x1: cx - 4, y1: cy + 1,
    x2: cx + 3, y2: cy - 9,
    color, line_width: 3
  })
  createWidget(widget.LINE, {
    x1: cx + 3, y1: cy - 9,
    x2: cx + 6, y2: cy + 1,
    color, line_width: 3
  })
}

// ============================================================
// TOP WIDGETS (Pulse / Steps / Battery)
// ============================================================
// Each indicator: compact ring -> [icon][value] stacked inside, caption below.

function createTopWidgets() {
  const halfW = TOP_R * 2
  const labelW = 78

  // Steps sit above the three dials, as requested.
  createText({
    x: 0, y: 28, w: SCREEN_W, h: 14,
    text: 'STEPS', text_size: 10, color: COLOR_GRAY,
    align_h: align.CENTER_H, align_v: align.CENTER_V
  })
  topStepsWidget = createText({
    x: 0, y: 42, w: SCREEN_W, h: 18,
    text: '0', text_size: 14, color: COLOR_WHITE,
    align_h: align.CENTER_H, align_v: align.CENTER_V
  })

  // --- Heart rate ring ---
  hrRing = createGradientRing(HR_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, heartRateGradient)
  drawTopSpriteIcon(HR_CX, TOP_ICON_CY, 'icons/heart-rate.png')

  hrValueWidget = createText({
    x: HR_CX - TOP_R,
    y: TOP_VALUE_CY - 11,
    w: halfW,
    h: 22,
    text: '--',
    text_size: 18,
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

  // --- Steps ring ---
  stepsRing = createGradientRing(STEPS_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, stepsGradient)
  drawTopSpriteIcon(STEPS_CX, TOP_ICON_CY, 'icons/steps.png')

  distanceValueWidget = createText({
    x: STEPS_CX - TOP_R,
    y: TOP_VALUE_CY - 11,
    w: halfW,
    h: 22,
    text: '0.00',
    text_size: 17,
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

  // --- Battery ring ---
  caloriesRing = createGradientRing(BAT_CX, TOP_CY, TOP_R, TOP_GLOW_R, TOP_LINE_W, batteryGradient)
  drawTopSpriteIcon(BAT_CX, TOP_ICON_CY, 'icons/calories.png')

  caloriesValueWidget = createText({
    x: BAT_CX - TOP_R,
    y: TOP_VALUE_CY - 11,
    w: halfW,
    h: 22,
    text: '0',
    text_size: 17,
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
// MAIN TIME
// ============================================================

function createMainTime() {
  const boxY = TIME_CY - TIME_ROW_H / 2

  // Soft glow behind the HH:MM block - several dim offset copies, drawn
  // first so the shadow/main text layers land cleanly on top.
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
      color: TIME_GLOW_COLOR,
      align_h: align.RIGHT,
      align_v: align.CENTER_V
    })
    timeGlowWidgets.push(glow)
  }

  // Pseudo drop-shadow for the HH:MM block only (kept simple).
  timeShadowWidget = createText({
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

  timeWidget = createText({
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

  // The separator belongs visually to the seconds, so it gets the same
  // small cyan halo as the rolling digits.
  for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
    const [dx, dy] = TIME_GLOW_OFFSETS[i]
    createText({
      x: TIME_COLON_X + dx,
      y: boxY + dy,
      w: TIME_COLON_W,
      h: TIME_ROW_H,
      text: ':',
      text_size: TIME_FONT_SIZE,
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
// ROLLING "ODOMETER" DIGIT
// ============================================================
// Two stacked TEXT widgets per digit: `current` (visible) and `next`
// (parked one row-height below, hidden behind the bottom mask). On a
// value change both slide upward together over ROLL_STEPS frames; the
// masks created in createMainTime() clip anything that overshoots the
// visible window, so it reads as the old digit rolling away and the new
// one rolling into place - like a mechanical counter drum.

function createRollingDigit(x, y, w, h, initialValue) {
  const glowCurrent = []
  const glowNext = []

  // These copies must have their own animation positions, otherwise the
  // neon bloom would stay behind while the digit rolls.
  for (let i = 0; i < TIME_GLOW_OFFSETS.length; i++) {
    const [dx, dy] = TIME_GLOW_OFFSETS[i]
    glowCurrent.push(createText({
      x: x + dx,
      y: y + dy,
      w,
      h,
      text: String(initialValue),
      text_size: TIME_FONT_SIZE,
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
// DATE
// ============================================================

function createSectionDividers() {
  const yPositions = [TOP_TIME_LINE_Y, TIME_DATE_LINE_Y, DATE_BOTTOM_LINE_Y]
  for (let i = 0; i < yPositions.length; i++) {
    createWidget(widget.LINE, {
      x1: SECTION_LINE_X,
      y1: yPositions[i],
      x2: SECTION_LINE_X + SECTION_LINE_W,
      y2: yPositions[i],
      color: COLOR_TRACK,
      line_width: 2
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

  createText({
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

  createText({
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

  bottomStepsValueWidget = createText({
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

  createText({
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
  const distanceKm = value * 0.00075
  const calories = Math.round(value * 0.04)

  if (topStepsWidget) topStepsWidget.setProperty(prop.TEXT, String(value))
  distanceValueWidget.setProperty(prop.TEXT, distanceKm.toFixed(2))
  caloriesValueWidget.setProperty(prop.TEXT, String(calories))
  bottomStepsValueWidget.setProperty(prop.TEXT, String(value))

  const ratio = clamp(value / stepGoal, 0, 1)
  updateGradientRing(stepsRing, ratio)
  updateGradientRing(caloriesRing, clamp(calories / 600, 0, 1))
}

// ============================================================
// UPDATE: BATTERY
// ============================================================

function updateBattery(pct) {
  // Battery is no longer shown in the top row; calories are derived from
  // steps there. The sensor remains subscribed for future use.
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
    createMainTime()
    // The rolling-seconds masks sit behind the top indicators, so they
    // cannot cover the battery dial while the seconds animate.
    createTopWidgets()
    createDate()
    createSectionDividers()
    createBottomWidgets()

    initSensors()
    startTimer()
  },

  onDestroy() {
    stopTimer()
    teardownSensors()
  }
})
