/**
 * Scrolls a horizontal scroller (tab bar, mobile account menu) so its `.active` child sits in the
 * middle. Only `scrollLeft` changes, so the page itself never jumps vertically.
 */
export function centerActive(scroller: HTMLElement | null | undefined): void {
  const active = scroller?.querySelector<HTMLElement>('.active');
  if (!scroller || !active || scroller.scrollWidth <= scroller.clientWidth) return;
  const offset =
    active.getBoundingClientRect().left -
    scroller.getBoundingClientRect().left +
    scroller.scrollLeft;
  scroller.scrollLeft = offset - (scroller.clientWidth - active.offsetWidth) / 2;
}
