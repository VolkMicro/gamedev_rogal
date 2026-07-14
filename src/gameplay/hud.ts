/** DOM-based HUD: HP bar + essence counter + (while fighting it) a boss HP bar. Real art/UI arrives with Kenney assets in a later stage. */
export class Hud {
  private hpFill: HTMLDivElement;
  private essenceEl: HTMLDivElement;
  private bossContainer: HTMLDivElement;
  private bossFill: HTMLDivElement;

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

    // Boss HP bar: top-center, only shown once the boss exists — without any
    // visible feedback on its health, a slow-but-working fight reads as an
    // "unkillable" boss even when damage is landing.
    this.bossContainer = document.createElement('div');
    Object.assign(this.bossContainer.style, {
      position: 'fixed',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    const bossTrack = document.createElement('div');
    Object.assign(bossTrack.style, {
      width: '200px',
      height: '10px',
      background: 'rgba(255,255,255,0.15)',
      border: '1px solid #444',
    } satisfies Partial<CSSStyleDeclaration>);
    this.bossFill = document.createElement('div');
    Object.assign(this.bossFill.style, {
      height: '100%',
      background: '#9c3ad1',
      width: '100%',
    } satisfies Partial<CSSStyleDeclaration>);
    bossTrack.appendChild(this.bossFill);
    this.bossContainer.appendChild(bossTrack);
    document.body.appendChild(this.bossContainer);
  }

  update(hp: number, maxHp: number, essence: number, boss: { hp: number; maxHp: number } | null = null): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.essenceEl.textContent = `Эссенция: ${essence}`;
    if (boss) {
      this.bossContainer.style.display = '';
      this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else {
      this.bossContainer.style.display = 'none';
    }
  }
}
