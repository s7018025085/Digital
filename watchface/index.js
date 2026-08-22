import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { Time } from '@zos/sensor'

const SCREEN_SIZE = 480
const TIME_HEIGHT = 120

// Decorative line under the time digits
const LINE_WIDTH = 200
const LINE_HEIGHT = 6
const LINE_Y = 300 // vertical center of the line (tweak to taste)

// Thin green ring on the screen border
const BORDER_COLOR = 0x00ff00 // green
const BORDER_WIDTH = 3 // thin ring thickness
const BORDER_RADIUS = 236 // slightly inset from 240 to stay fully visible

function twoDigits(value) {
  return value < 10 ? `0${value}` : `${value}`
}

WatchFace({
  build() {
    const time = new Time()

    // Canvas layer (bottom) for custom drawing (ZeppOS API 3.0 canvas)
    const canvas = createWidget(widget.CANVAS, {
      x: 0,
      y: 0,
      w: SCREEN_SIZE,
      h: SCREEN_SIZE,
    })
    canvas.setPaint({ color: BORDER_COLOR, line_width: BORDER_WIDTH })
    canvas.strokeCircle({
      center_x: SCREEN_SIZE / 2,
      center_y: SCREEN_SIZE / 2,
      radius: BORDER_RADIUS,
      color: BORDER_COLOR,
    })
    canvas.setPaint({ color: 0xffffff, line_width: LINE_HEIGHT })
    canvas.drawLine({
      x1: (SCREEN_SIZE - LINE_WIDTH) / 2,
      y1: LINE_Y,
      x2: (SCREEN_SIZE + LINE_WIDTH) / 2,
      y2: LINE_Y,
      color: 0xffffff,
    })

    const timeWidget = createWidget(widget.TEXT, {
      x: 0,
      y: (SCREEN_SIZE - TIME_HEIGHT) / 2,
      w: SCREEN_SIZE,
      h: TIME_HEIGHT,
      color: 0xffffff,
      text_size: 96,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '00:00',
    })

    const updateTime = () => {
      const value = `${twoDigits(time.getHours())}:${twoDigits(time.getMinutes())}`
      timeWidget.setProperty(prop.MORE, { text: value })
      console.log(`[balance2-basic] time updated: ${value}`)
    }

    updateTime()
    time.onPerMinute(updateTime)
    console.log('[balance2-basic] watch face started')
  },
})
