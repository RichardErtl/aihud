// Example tile, landscape twin of example-number.js: one number, the context fill of the main agent.
// Shipped as the landscape probe of the layout check (a landscape layout takes landscape tiles only).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'example-number-landscape',
  contentBlock: 'context',
  style: 'standard',
  orientation: 'landscape',
  sizes: [{ cols: 8, rows: 7 }],
  contractVersion: '1.1',
};

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const instance = data && data.live && data.live.instances && data.live.instances[0];
  const fill = instance && typeof instance.context_percent === 'number' ? instance.context_percent : null;
  const windowSize = instance && typeof instance.context_window === 'number' ? instance.context_window : null;

  const box = doc.createElement('div');
  box.style.cssText = [
    `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'background:var(--aihud-panel)', 'color:var(--aihud-text)', 'font-family:var(--aihud-font)',
    'border-radius:var(--aihud-radius)', 'overflow:hidden',
  ].join(';');

  const label = doc.createElement('div');
  label.textContent = 'context';
  label.style.cssText = `color:var(--aihud-dim);font-size:${Math.round(size.unit * 0.6)}px`;

  const number = doc.createElement('div');
  number.textContent = fill == null ? '–' : `${fill.toFixed(1)} %`;
  if (fill != null) number.setAttribute('data-field', 'live.instances[].context_percent');
  number.style.cssText = `font-size:${Math.round(size.unit * 1.8)}px;font-weight:600;line-height:1.1`
    + (fill == null ? ';color:var(--aihud-faint)' : '');

  const note = doc.createElement('div');
  note.textContent = windowSize == null ? '' : `of ${Math.round(windowSize / 1000)}k`;
  if (windowSize != null) note.setAttribute('data-field', 'live.instances[].context_window');
  note.style.cssText = `color:var(--aihud-faint);font-size:${Math.round(size.unit * 0.55)}px`;

  box.append(label, number, note);
  el.replaceChildren(box);
}
