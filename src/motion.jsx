import { useEffect, useLayoutEffect, useRef } from 'react'

const allowsMotion = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches
let entranceObserver

export function Reveal({ as: Element = 'div', order = 0, style, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    if (!element || !allowsMotion() || !('IntersectionObserver' in window) || element.dataset.entrance === 'arrived') return

    entranceObserver ??= new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.dataset.entrance = 'arrived'
        observer.unobserve(entry.target)
      }
    })

    const { top, bottom } = element.getBoundingClientRect()
    if (top < window.innerHeight) {
      if (bottom > 0) element.dataset.entrance = 'arrived'
      return
    }
    element.dataset.entrance = 'waiting'
    entranceObserver.observe(element)
    return () => entranceObserver.unobserve(element)
  }, [])

  return <Element ref={ref} style={{ ...style, '--entrance-delay': Math.min(order, 3) * 55 + 'ms' }} {...props} />
}

const dust = [
  [70, 21, 1, 16, -19, 10], [76, 34, 2, -17, -35, 13], [67, 44, 2, 24, -40, 12],
  [81, 57, 1, -22, -20, 14], [73, 59, 2, 37, -30, 15], [77, 18, 1, 10, -19, 9],
  [65, 52, 1, 26, -29, 12], [83, 46, 2, -38, -36, 15], [71, 37, 1, 17, -34, 13],
  [78, 48, 2, 12, -44, 11], [79, 27, 1, -16, -27, 12], [74, 50, 1, -26, -33, 17],
]

export function GalleryAtmosphere({ gallery }) {
  const lens = useRef(null)
  useEffect(() => {
    const section = gallery.current
    if (!section) return
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
    const pointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
    let frame
    let x = 0
    let y = 0

    const paint = () => {
      section.style.setProperty('--lens-x', x.toFixed(2) + 'px')
      section.style.setProperty('--lens-y', y.toFixed(2) + 'px')
      frame = undefined
    }
    const schedule = () => { frame ??= requestAnimationFrame(paint) }
    const track = (event) => {
      if (!motion.matches || !pointer.matches || event.pointerType === 'touch') return
      const rect = section.getBoundingClientRect()
      x = ((event.clientX - rect.left) / rect.width - 0.5) * 46
      y = ((event.clientY - rect.top) / rect.height - 0.5) * 30
      schedule()
    }
    const reset = () => {
      x = 0
      y = 0
      schedule()
    }
    section.addEventListener('pointermove', track, { passive: true })
    section.addEventListener('pointerleave', reset)
    motion.addEventListener('change', reset)
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      lens.current?.toggleAttribute('data-in-view', entry.isIntersecting)
    }) : null
    observer?.observe(section)

    return () => {
      section.removeEventListener('pointermove', track)
      section.removeEventListener('pointerleave', reset)
      motion.removeEventListener('change', reset)
      if (frame !== undefined) cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [gallery])

  return (
    <div ref={lens} className="gallery-atmosphere" aria-hidden="true">
      <div className="gallery-glow" />
      {dust.map(([left, top, size, dx, dy, time], index) => (
        <i key={index} className="gallery-dust" style={{
          left: left + '%', top: top + '%', width: size, height: size,
          '--dust-x': dx + 'px', '--dust-y': dy + 'px',
          '--dust-time': time + 's', '--dust-delay': -index * 1.3 + 's',
        }} />
      ))}
    </div>
  )
}

export function useAnimatedGrid(items) {
  const grid = useRef(null)
  const previous = useRef(null)
  const running = useRef(new Map())

  const capture = () => {
    if (!allowsMotion() || !grid.current || !Element.prototype.animate) return
    previous.current = new Map()
    for (const card of grid.current.children) {
      const rect = card.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        previous.current.set(card, rect)
      }
    }
  }

  useLayoutEffect(() => {
    const positions = previous.current
    previous.current = null
    if (!positions || !allowsMotion() || !grid.current) return
    const active = running.current
    for (const animation of active.values()) animation.cancel()
    active.clear()

    for (const card of grid.current.children) {
      const before = positions.get(card)
      if (!before) continue
      const after = card.getBoundingClientRect()
      const x = before.left - after.left
      const y = before.top - after.top
      if (Math.abs(x) < 2 && Math.abs(y) < 2) continue
      const animation = card.animate([
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 380, easing: 'cubic-bezier(.2, .75, .23, 1)' })
      active.set(card, animation)
      animation.onfinish = () => {
        if (active.get(card) === animation) active.delete(card)
      }
    }
  }, [items])

  useEffect(() => {
    const active = running.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => {
      for (const animation of active.values()) animation.cancel()
      active.clear()
    }
    preference.addEventListener('change', stop)
    return () => {
      preference.removeEventListener('change', stop)
      stop()
    }
  }, [])

  return [grid, capture]
}
