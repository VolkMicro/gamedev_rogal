import { isMuted, setMuted } from '../audio/sfx';

/** DOM-based HUD: HP bar + essence counter + (while fighting it) a boss HP bar. Real art/UI arrives with Kenney assets in a later stage. */
export class Hud {
  private hpFill: HTMLDivElement;
  private essenceEl: HTMLDivElement;
  private bossContainer: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private damageFlash: HTMLDivElement;

  constructor() {
    // Top-center cluster: HP bar + essence side by side. Center placement
    // (per UI review with the user): always visible, thumbs never cover it,
    // and Telegram's overlay buttons hug the corners/edges so the middle is
    // safe in both real and fake landscape. The old bottom-left spot sat
    // directly under the move stick.
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      zIndex: '10',
      font: 'bold 13px monospace',
      color: '#eee',
      // Display-only: without this the cluster silently steals pointerdown
      // from the canvas underneath — an aim drag starting on/near the HP
      // bar never reached the input handler at all.
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const heart = document.createElement('div');
    heart.textContent = '❤';
    heart.style.color = '#e05252';

    const hpTrack = document.createElement('div');
    Object.assign(hpTrack.style, {
      width: '170px',
      height: '13px',
      background: 'rgba(0,0,0,0.55)',
      border: '1px solid #6b5a3a',
    } satisfies Partial<CSSStyleDeclaration>);
    this.hpFill = document.createElement('div');
    Object.assign(this.hpFill.style, {
      height: '100%',
      background: 'linear-gradient(#d96a5a, #b23a2e)',
      width: '100%',
      transition: 'width 120ms linear',
    } satisfies Partial<CSSStyleDeclaration>);
    hpTrack.appendChild(this.hpFill);

    this.essenceEl = document.createElement('div');
    this.essenceEl.style.color = '#ffd15c';
    this.essenceEl.textContent = '✦ 0';

    container.append(heart, hpTrack, this.essenceEl);
    document.body.appendChild(container);

    // Boss HP bar: right below the player's top-center cluster, only shown
    // near the boss — without any visible feedback on its health, a
    // slow-but-working fight reads as an "unkillable" boss even when damage
    // is landing.
    this.bossContainer = document.createElement('div');
    Object.assign(this.bossContainer.style, {
      position: 'fixed',
      top: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10',
      display: 'none',
      pointerEvents: 'none',
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

    // Mute toggle — the one interactive HUD element, so it keeps
    // pointer-events. Parked at the game's top-left past the safe inset
    // (portrait: right edge, below Telegram's ••• pill), small enough that
    // aim drags practically never start on it.
    const muteBtn = document.createElement('button');
    Object.assign(muteBtn.style, {
      position: 'fixed',
      top: '6px',
      left: 'calc(var(--game-safe-left, 0px) + 6px)',
      zIndex: '11',
      width: '30px',
      height: '30px',
      background: 'rgba(0,0,0,0.4)',
      border: '1px solid #555',
      color: '#ccc',
      font: '14px monospace',
      padding: '0',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      setMuted(!isMuted());
      muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    });
    document.body.appendChild(muteBtn);

    // Full-screen damage flash — plain DOM overlay (not Pixi) since it must
    // cover the exact screen regardless of camera zoom/shake/letterbox, and
    // everything else UI-facing in this game is already DOM, not canvas.
    this.damageFlash = document.createElement('div');
    Object.assign(this.damageFlash.style, {
      position: 'fixed',
      inset: '0',
      background: '#c92020',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '9',
      transition: 'opacity 220ms ease-out',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.damageFlash);
  }

  showNote(text: string): void {
    const note = document.createElement('div');
    Object.assign(note.style, {
      position: 'fixed',
      top: '15%',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(420px, 80vw)',
      padding: '12px 16px',
      background: 'rgba(24, 20, 14, 0.94)',
      border: '1px solid #6e5a34',
      color: '#e8dcc0',
      font: '13px monospace',
      lineHeight: '1.5',
      zIndex: '25',
      opacity: '0',
      transition: 'opacity 400ms ease',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    note.textContent = text;
    document.body.appendChild(note);
    requestAnimationFrame(() => {
      note.style.opacity = '1';
    });
    setTimeout(() => {
      note.style.opacity = '0';
      setTimeout(() => note.remove(), 500);
    }, 6000);
  }

  flashDamage(): void {
    this.damageFlash.style.transition = 'none';
    this.damageFlash.style.opacity = '0.32';
    // Force layout so the next transition doesn't get coalesced with this set.
    void this.damageFlash.offsetHeight;
    this.damageFlash.style.transition = 'opacity 220ms ease-out';
    this.damageFlash.style.opacity = '0';
  }

  update(hp: number, maxHp: number, essence: number, boss: { hp: number; maxHp: number } | null = null): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.essenceEl.textContent = `✦ ${essence}`;
    if (boss) {
      this.bossContainer.style.display = '';
      this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else {
      this.bossContainer.style.display = 'none';
    }
  }
}
