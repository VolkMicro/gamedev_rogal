/** DOM-based HUD: HP bar + essence counter. Real art/UI arrives with Kenney assets in a later stage. */
export class Hud {
  private hpFill: HTMLDivElement;
  private essenceEl: HTMLDivElement;

  constructor() {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '8px',
      left: '8px',
      zIndex: '10',
      font: '12px monospace',
      color: '#eee',
    } satisfies Partial<CSSStyleDeclaration>);

    const hpTrack = document.createElement('div');
    Object.assign(hpTrack.style, {
      width: '120px',
      height: '10px',
      background: 'rgba(255,255,255,0.15)',
      border: '1px solid #444',
    } satisfies Partial<CSSStyleDeclaration>);
    this.hpFill = document.createElement('div');
    Object.assign(this.hpFill.style, {
      height: '100%',
      background: '#c94f4f',
      width: '100%',
    } satisfies Partial<CSSStyleDeclaration>);
    hpTrack.appendChild(this.hpFill);

    this.essenceEl = document.createElement('div');
    this.essenceEl.style.marginTop = '4px';
    this.essenceEl.textContent = 'Эссенция: 0';

    container.appendChild(hpTrack);
    container.appendChild(this.essenceEl);
    document.body.appendChild(container);
  }

  update(hp: number, maxHp: number, essence: number): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.essenceEl.textContent = `Эссенция: ${essence}`;
  }
}
