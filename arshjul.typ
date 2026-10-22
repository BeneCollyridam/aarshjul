// A self-contained A4 year planner. No Typst packages or network access needed.
#let inline-data = sys.inputs.at("data", default: none)
#let data = if inline-data != none {
  json(bytes(inline-data))
} else {
  json(sys.inputs.at("data-file", default: "example.json"))
}

#assert(type(data) == dictionary, message: "The JSON input must be an object.")
#let year = str(data.at("year", default: datetime.today().year()))
#let title = data.at("title", default: "Årshjul")
#let footer = datetime.today().display("[day].[month].[year]")
#let months = data.at("months", default: (
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
))
#assert(months.len() == 12, message: "months must contain exactly 12 names.")
#for name in months {
  assert(type(name) == str and name.len() > 0, message: "Month names must be non-empty strings.")
}
#let events = data.at("events", default: ())
#assert(type(events) == array, message: "events must be an array.")
#for event in events {
  assert(type(event) == dictionary, message: "Each event must be an object.")
  assert(type(event.at("month", default: none)) == int,
    message: "Every event needs an integer month (1–12).")
  assert(event.month >= 1 and event.month <= 12, message: "Event months must be between 1 and 12.")
  assert(type(event.at("title", default: none)) == str,
    message: "Every event needs a title string.")
  assert(event.title.len() > 0, message: "Event titles must not be empty.")
  for key in ("description", "date") {
    assert(type(event.at(key, default: "")) == str, message: key + " must be a string.")
  }
}
#let palette = data.at("colors", default: ("#527C96", "#588570", "#B78743", "#966476"))
#assert(palette.len() == 4, message: "colors must contain four quarter colors.")
#let colors = palette.map(color => rgb(color))
#let ink = rgb("#243340")
#let muted = rgb("#667681")
#let month-events(index) = events.filter(event => event.month == index + 1)
#let quarter-color(index) = colors.at(calc.floor(index / 3))

// Shrink only when necessary; fail rather than silently clip or spill to page 2.
#let fitted(body, width, height, max-size: 8.5, min-size: 6, label: "Content", words: ()) = context {
  let chosen = none
  for step in range(int((max-size - min-size) * 4) + 1) {
    let size = (max-size - step / 4) * 1pt
    let candidate = text(size: size, body)
    let words-fit = words.all(word => measure(text(size: size * 1.08, word)).width <= width)
    if words-fit and measure(block(width: width, candidate)).height <= height {
      chosen = candidate
      break
    }
  }
  assert(chosen != none, message: label + " is too long for A4. Shorten it or use fewer events.")
  chosen
}

#set page(paper: "a4", flipped: true, margin: 10mm)
#set text(font: "DejaVu Sans", size: 8.5pt, fill: ink, lang: "da")
#set par(leading: 0.45em, spacing: 0pt)
#set document(title: title + " " + year)

#let month-card(index) = {
  let color = quarter-color(index)
  let entries = month-events(index)
  block(width: 86mm, height: 25.5mm, inset: (x: 3mm, y: 2mm),
    radius: 2mm, fill: color.lighten(94%), stroke: 0.4pt + color.lighten(72%),
  )[
    #text(size: 9pt, weight: "bold", fill: color)[#months.at(index)]
    #h(1fr)#text(size: 7pt, fill: muted)[#if index < 9 { "0" }#(index + 1)]
    #v(1.1mm)
    #if entries.len() == 0 {
      text(fill: muted.lighten(35%), size: 7.5pt)[—]
    } else {
      fitted(
        entries.map(event => [
          #text(weight: "bold")[#event.title]
          #if event.at("date", default: "") != "" { text(fill: muted)[ · #event.date] }
          #if event.at("description", default: "") != "" { [ — #event.description] }
        ]).join(parbreak()),
        80mm, 16mm, label: months.at(index) + " descriptions",
        words: entries.map(event => event.title + " " + event.at("description", default: "")
          + " " + event.at("date", default: "")).join(" ").split(regex("\\s+")),
      )
    }
  ]
}

// The wheel uses native vector polygons and text, so the PDF stays sharp.
#let wheel = {
  let origin = 47.5mm
  let outer = 47mm
  let month-inner = 41mm
  let inner = 16mm
  let point(radius, angle) = (
    origin + radius * calc.cos(angle),
    origin + radius * calc.sin(angle),
  )
  let sector(start, finish, radius-in, radius-out, fill) = {
    let angles = range(13).map(i => start + (finish - start) * i / 12)
    polygon(
      ..angles.map(a => point(radius-out, a)),
      ..angles.rev().map(a => point(radius-in, a)),
      fill: fill, stroke: 0.5pt + white,
    )
  }
  let centered-at(radius, angle, body) = {
    let (x, y) = point(radius, angle)
    place(top + left, dx: x, dy: y, align(center + horizon, box(width: 0pt, height: 0pt, body)))
  }
  block(width: 95mm, height: 95mm)[
    #for index in range(12) {
      let start = -90deg + index * 30deg
      let angle = start + 15deg
      let color = quarter-color(index)
      place(top + left, sector(start, start + 30deg, inner, month-inner, color.lighten(88%)))
      place(top + left, sector(start, start + 30deg, month-inner, outer, color))
      // Tangential month names, kept upright on the bottom half.
      let month-rotation = if index >= 3 and index <= 8 { angle - 90deg } else { angle + 90deg }
      centered-at(44mm, angle, rotate(month-rotation, reflow: false,
        box(width: 19mm, align(center, text(size: 6.8pt, weight: "bold", fill: white)[#months.at(index)])),
      ))
      let entries = month-events(index)
      let titles = if entries.len() == 0 { [#text(fill: muted)[—]] } else {
        entries.map(event => [#event.title]).join(linebreak())
      }
      let rotation = if index >= 6 { angle + 180deg } else { angle }
      centered-at(29mm, angle, rotate(rotation, reflow: false,
        box(width: 22mm, height: 9mm, align(center + horizon,
          fitted(titles, 22mm, 9mm, max-size: 7.5, min-size: 5.5,
            label: months.at(index) + " wheel titles",
            words: entries.fold("", (words, event) => words + " " + event.title).split(regex("\\s+"))),
        )),
      ))
    }
    #centered-at(0mm, 0deg, box(width: 28mm, align(center)[
      #text(size: 17pt, weight: "bold")[#year]
      #linebreak()
      #text(size: 7pt, fill: muted)[ÅRSHJUL]
    ]))
  ]
}

#block(width: 100%, height: 20mm)[
  #text(size: 23pt, weight: "bold")[#title]
  #h(1fr)#text(size: 19pt, fill: muted)[#year]
]
#grid(
  columns: (86mm, 95mm, 86mm),
  column-gutter: 5mm,
  stack(dir: ttb, spacing: 2mm, ..range(6).map(month-card)),
  align(center + horizon, wheel),
  stack(dir: ttb, spacing: 2mm, ..range(6, 12).map(month-card)),
)
#v(3mm)
#text(size: 7pt, fill: muted)[#footer]
