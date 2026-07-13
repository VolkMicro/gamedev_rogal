/** Minimal on-screen FPS + active-chunk readout for verifying the stage-1 perf gate on device. */
export class StatsOverlay {
  private el: HTMLDivElement;
  private frameTimes: number[] = [];

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '4px',
      left: '4px',
      padding: '4px 8px',
      font: '12px monospace',
      color: '#9f9',
      background: 'rgba(0,0,0,0.5)',
      pointerEvents: 'none',
      zIndex: '10',
      whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  frame(dtMs: number, activeChunks: number, totalChunks: number): void {
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = avg > 0 ? 1000 / avg : 0;
    this.el.textContent = `FPS ${fps.toFixed(0)}\nchunks ${activeChunks}/${totalChunks}`;
  }
}
