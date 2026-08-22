import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { Time, HeartRate, Step, Battery } from '@zos/sensor'
import { setInterval, clearInterval } from '@zos/timer'

const SCREEN_SIZE = 480

const GOLD = 0xD4AF37
const GOLD_DIM = 0x8A6A24

// ============================================
// ДУГА ПУЛЬСА
// Центр: (PULSE_CX, PULSE_CY)
// Радиус: PULSE_R
// Начальный угол: PULSE_START
// Дугой: PULSE_SWEEP
// Мин/макс значения: PULSE_MIN / PULSE_MAX
// ============================================
const PULSE_CX = 123
const PULSE_CY = 235
const PULSE_R = 53
const PULSE_MIN = 40
const PULSE_MAX = 180
const PULSE_START = 135
const PULSE_SWEEP = 270

// ============================================
// ДУГА ШАГОВ
// Центр: (STEP_CX, STEP_CY)
// Радиус: STEP_R
// Начальный угол: STEP_START
// Дугой: STEP_SWEEP
// Цель шагов: STEP_GOAL_FALLBACK
// ============================================
const STEP_CX = 361
const STEP_CY = 235
const STEP_R = 53
const STEP_GOAL_FALLBACK = 10000
const STEP_START = 135
const STEP_SWEEP = 270

// ============================================
// ДУГА БАТАРЕИ
// Центр: (BAT_CX, BAT_CY)
// Радиус: BAT_R
// Начальный угол: BAT_START
// Дугой: BAT_SWEEP
// ============================================
const BAT_CX = 240
const BAT_CY = 370
const BAT_R = 53
const BAT_START = 135
const BAT_SWEEP = 270

let mainCanvas
let timeWidget
let pulseValueWidget
let stepValueWidget
let batValueWidget

let heartRate
let step
let battery
let timer
let hrCallback
let stepCallback
let batCallback

function twoDigits(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function degToRad(deg) {
  return deg * Math.PI / 180
}

function drawArcCap(canvas, cx, cy, radius, angle, color, lineWidth) {
  const rad = degToRad(angle)
  const x = cx + Math.cos(rad) * radius
  const y = cy + Math.sin(rad) * radius
  canvas.setPaint({ color: color })
  canvas.drawCircle({
    center_x: x,
    center_y: y,
    radius: lineWidth / 2,
    color: color,
  })
}

// Фоновая дуга (серый контур)
function drawScaleBackground(canvas, cx, cy, radius, startAngle, sweepAngle) {
  canvas.setPaint({ color: GOLD_DIM, line_width: 6 })
  canvas.strokeArc({
    center_x: cx,
    center_y: cy,
    radius_x: radius,
    radius_y: radius,
    start_angle: startAngle,
    end_angle: (startAngle + sweepAngle) % 360,
    color: GOLD_DIM,
  })
  drawArcCap(canvas, cx, cy, radius, startAngle, GOLD_DIM, 6)
}

// Шкала делений (метки на дуге)
function drawCircularScale(canvas, cx, cy, radius, startAngle, sweepAngle, divisions) {
  const innerR = radius - 10
  for (let i = 0; i <= divisions; i++) {
    const angle = startAngle + (i / divisions) * sweepAngle
    const rad = degToRad(angle)
    const x2 = cx + Math.cos(rad) * radius
    const y2 = cy + Math.sin(rad) * radius
    const isMajor = i % 5 === 0
    const len = isMajor ? 10 : 5
    const x3 = cx + Math.cos(rad) * (radius - len)
    const y3 = cy + Math.sin(rad) * (radius - len)

    canvas.setPaint({ color: GOLD_DIM, line_width: isMajor ? 2 : 1, line_cap: 'round' })
    canvas.drawLine({
      x1: x3,
      y1: y3,
      x2: x2,
      y2: y2,
      color: GOLD_DIM,
    })
  }
}

// Прогресс-дуга (основная заливка)
function drawProgressArc(canvas, cx, cy, radius, startAngle, sweepAngle, progress, color) {
  if (progress <= 0.001) return
  const endAngle = (startAngle + progress * sweepAngle) % 360
  canvas.setPaint({ color: color, line_width: 6 })
  canvas.strokeArc({
    center_x: cx,
    center_y: cy,
    radius_x: radius,
    radius_y: radius,
    start_angle: startAngle,
    end_angle: endAngle,
    color: color,
  })
  drawArcCap(canvas, cx, cy, radius, startAngle, color, 6)
}
}

WatchFace({
  build() {
    heartRate = new HeartRate()
    step = new Step()
    battery = new Battery()
    const time = new Time()

    mainCanvas = createWidget(widget.CANVAS, {
      x: 0,
      y: 0,
      w: SCREEN_SIZE,
      h: SCREEN_SIZE,
    })

    const bgPaths = [
      'assets/fon/fon.png',
      'fon/fon.png',
      'fon.png',
      '../assets/fon/fon.png',
      '480x480-amazfit-balance-2/Fon.png',
    ]
    let bgDrawn = false
    bgPaths.forEach(p => {
      try {
        mainCanvas.drawImage({
          x: 0,
          y: 0,
          w: SCREEN_SIZE,
          h: SCREEN_SIZE,
          image: p,
        })
        bgDrawn = true
      } catch (e) {}
    })

    if (!bgDrawn) {
      mainCanvas.setPaint({ color: GOLD_DIM, line_width: 1 })
      mainCanvas.drawCircle({
        center_x: 240,
        center_y: 240,
        radius: 200,
        color: GOLD_DIM,
      })
    }

    // ========== ВРЕМЯ ==========
    // x, y — положение на экране
    // text_size — размер шрифта
    // align_h / align_v — выравнивание
    // =============================
    timeWidget = createWidget(widget.TEXT, {
      x: 0,
      y: 250,
      w: SCREEN_SIZE,
      h: 60,
      color: GOLD,
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '00:00:00',
    })


    pulseValueWidget = createWidget(widget.TEXT, {
      x: 70,
      y: 224,
      w: 100,
      h: 36,
      color: GOLD,
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '--',
    })

    stepValueWidget = createWidget(widget.TEXT, {
      x: 310,
      y: 224,
      w: 100,
      h: 36,
      color: GOLD,
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '--',
    })

    batValueWidget = createWidget(widget.TEXT, {
      x: 170,
      y: 364,
      w: 140,
      h: 36,
      color: GOLD,
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '--%',
    })

    function updateTime() {
      const h = twoDigits(time.getHours())
      const m = twoDigits(time.getMinutes())
      const s = twoDigits(time.getSeconds())
      timeWidget.setProperty(prop.MORE, { text: `${h}:${m}:${s}` })
    }

    function updatePulse() {
      let pulse = 0
      try {
        pulse = heartRate.getLast()
        if (!pulse || pulse < 0) pulse = 0
      } catch (e) {
        pulse = 0
      }
      const clamped = clamp(pulse, PULSE_MIN, PULSE_MAX)
      pulseValueWidget.setProperty(prop.MORE, { text: `${clamped}` })

      drawScaleBackground(mainCanvas, PULSE_CX, PULSE_CY, PULSE_R, PULSE_START, PULSE_SWEEP)
      drawCircularScale(mainCanvas, PULSE_CX, PULSE_CY, PULSE_R, PULSE_START, PULSE_SWEEP, 30)
      const progress = (clamped - PULSE_MIN) / (PULSE_MAX - PULSE_MIN)
      drawProgressArc(mainCanvas, PULSE_CX, PULSE_CY, PULSE_R, PULSE_START, PULSE_SWEEP, clamp(progress, 0, 1), GOLD)
    }

    function updateSteps() {
      let steps = 0
      let goal = STEP_GOAL_FALLBACK
      try {
        steps = step.getCurrent() || 0
        const rawGoal = step.getTarget()
        goal = Number(rawGoal)
        if (!Number.isFinite(goal) || goal <= 0) goal = STEP_GOAL_FALLBACK
      } catch (e) {
        goal = STEP_GOAL_FALLBACK
      }
      stepValueWidget.setProperty(prop.MORE, { text: `${steps}` })

      drawScaleBackground(mainCanvas, STEP_CX, STEP_CY, STEP_R, STEP_START, STEP_SWEEP)
      drawCircularScale(mainCanvas, STEP_CX, STEP_CY, STEP_R, STEP_START, STEP_SWEEP, 30)
      const progress = clamp(steps / goal, 0, 1)
      drawProgressArc(mainCanvas, STEP_CX, STEP_CY, STEP_R, STEP_START, STEP_SWEEP, progress, GOLD)
    }

    function updateBattery() {
      let bat = 0
      try {
        bat = battery.getCurrent()
        if (bat < 0) bat = 0
        if (bat > 100) bat = 100
      } catch (e) {
        bat = 0
      }
      batValueWidget.setProperty(prop.MORE, { text: `${bat}%` })

      drawScaleBackground(mainCanvas, BAT_CX, BAT_CY, BAT_R, BAT_START, BAT_SWEEP)
      drawCircularScale(mainCanvas, BAT_CX, BAT_CY, BAT_R, BAT_START, BAT_SWEEP, 30)
      const progress = bat / 100
      drawProgressArc(mainCanvas, BAT_CX, BAT_CY, BAT_R, BAT_START, BAT_SWEEP, clamp(progress, 0, 1), GOLD)
    }

    function drawAllComplications() {
      updatePulse()
      updateSteps()
      updateBattery()
    }

    hrCallback = () => {
      try { updatePulse() } catch (e) {}
    }
    stepCallback = () => {
      try { updateSteps() } catch (e) {}
    }
    batCallback = () => {
      try { updateBattery() } catch (e) {}
    }

    try { heartRate.onCurrentChange(hrCallback) } catch (e) {}
    try { step.onChange(stepCallback) } catch (e) {}
    try { battery.onChange(batCallback) } catch (e) {}

    updateTime()
    drawAllComplications()

    timer = setInterval(updateTime, 1000)
  },

  onDestroy() {
    try { heartRate.offCurrentChange(hrCallback) } catch (e) {}
    try { step.offChange(stepCallback) } catch (e) {}
    try { battery.offChange(batCallback) } catch (e) {}
    clearInterval(timer)
  },
})
