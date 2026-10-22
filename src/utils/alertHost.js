const observers = new WeakMap()

function trackAlertPositions(host) {
  const positions = new Map()
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  function updateHostHeight() {
    const moving = [...positions.values()].some(({ animation }) => animation)
    // Keep room for the old visual positions until all moves finish. The
    // existing max-height still allows scrolling when the stack is truly tall.
    host.style.height = moving ? `${host.scrollHeight}px` : ''
  }
  const observer = new MutationObserver(records => {
    if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) return
    for (const [element, previous] of positions) {
      if (element.parentElement !== host) {
        previous.animation?.cancel()
        positions.delete(element)
      }
    }
    for (const element of host.children) {
      const previous = positions.get(element)
      const top = element.offsetTop
      // Preserve an ongoing move's visual position when another alert leaves.
      const offset = previous?.animation
        ? parseFloat(getComputedStyle(element).translate.split(' ').at(-1)) || 0 : 0
      const distance = previous ? previous.top + offset - top : 0
      previous?.animation?.cancel()
      const current = { top, animation: null }
      positions.set(element, current)
      if (distance && !motion.matches) {
        // Independent translate keeps the horizontal enter/leave transform intact.
        current.animation = element.animate(
          [{ translate: `0 ${distance}px` }, { translate: '0 0' }],
          { duration: 240, easing: 'ease-out' },
        )
        current.animation.onfinish = () => {
          current.animation = null
          updateHostHeight()
        }
      }
    }
    updateHostHeight()
  })
  observer.observe(host, { childList: true })
  observers.set(host, () => {
    observer.disconnect()
    for (const { animation } of positions.values()) animation?.cancel()
    positions.clear()
  })
}

export function alertHost() {
  let host = document.getElementById('app-alert-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'app-alert-host'
    host.className = 'pointer-events-none fixed right-4 top-20 z-[1000] flex max-h-[calc(100dvh-6rem)] w-[calc(100vw-2rem)] flex-col items-end gap-2 overflow-x-hidden overflow-y-auto sm:w-72'
    document.body.appendChild(host)
    trackAlertPositions(host)
  }
  return host
}

export function releaseAlertHost(host) {
  if (!host.childElementCount) {
    observers.get(host)?.()
    observers.delete(host)
    host.remove()
  }
}
