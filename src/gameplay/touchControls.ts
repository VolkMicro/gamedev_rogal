export const STICK_BASE_RADIUS = 42;
const BASE_RADIUS = STICK_BASE_RADIUS;
const KNOB_RADIUS = 17;
export const STICK_MARGIN = 22;
const MARGIN = STICK_MARGIN;

interface Point {
  x: number;
  y: number;
}

function makeCircle(diameter: number, extraStyle: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: '5',
    boxSizing: 'border-box',
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(el.style, extraStyle);
  document.body.appendChild(el);
  return el;
}

function makeLabel(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    transform: 'translate(-50%, 0)',
    font: '11px monospace',
    color: 'rgba(255,255,255,0.6)',
    pointerEvents: 'none',
    zIndex: '5',
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  return el;
}

/**
 * Always-visible on-screen joystick graphics for the left (move) and right
 * (aim/fire) touch zones. Idles at a fixed corner so a first-time player can
 * immediately see where to put their thumbs (this project's InputController
 * previously had matching *logic* — dynamic touch-origin stick zones — but
 * rendered nothing, which read as "no idea how to control this" per user
 * feedback). On touch, the base "floats" to the actual touch point (common
 * mobile-game pattern — keeps the existing forgiving anywhere-in-half
 * touch logic intact while still giving live positional feedback), then
 * springs back to the idle corner on release.
 */
export class TouchControls {
  private moveBase: HTMLDivElement;
  private moveKnob: HTMLDivElement;
  private moveLabel: HTMLDivElement;
  private aimBase: HTMLDivElement;
  private aimKnob: HTMLDivElement;
  private aimLabel: HTMLDivElement;
  private moveIdle: Point = { x: 0, y: 0 };
  private aimIdle: Point = { x: 0, y: 0 };
  private moveCenter: Point = { x: 0, y: 0 };
  private aimCenter: Point = { x: 0, y: 0 };

  constructor() {
    this.moveBase = makeCircle(BASE_RADIUS * 2, {
      border: '2px solid rgba(255,255,255,0.32)',
      background: 'rgba(255,255,255,0.07)',
    });
    this.moveKnob = makeCircle(KNOB_RADIUS * 2, {
      background: 'rgba(255,255,255,0.55)',
      border: '1px solid rgba(255,255,255,0.8)',
    });
    this.moveLabel = makeLabel('движение');

    this.aimBase = makeCircle(BASE_RADIUS * 2, {
      border: '2px solid rgba(138,214,255,0.32)',
      background: 'rgba(138,214,255,0.07)',
    });
    this.aimKnob = makeCircle(KNOB_RADIUS * 2, {
      background: 'rgba(138,214,255,0.6)',
      border: '1px solid rgba(138,214,255,0.85)',
    });
    this.aimLabel = makeLabel('прицел / огонь');

    this.resetIdlePositions();
    this.moveRelease();
    this.aimRelease();
    window.addEventListener('resize', () => this.resetIdlePositions());
  }

  private resetIdlePositions(): void {
    const h = window.innerHeight;
    this.moveIdle = { x: MARGIN + BASE_RADIUS, y: h - MARGIN - BASE_RADIUS };
    this.aimIdle = { x: window.innerWidth - MARGIN - BASE_RADIUS, y: h - MARGIN - BASE_RADIUS };
    if (this.moveCenter.x === 0 && this.moveCenter.y === 0) this.moveCenter = { ...this.moveIdle };
    if (this.aimCenter.x === 0 && this.aimCenter.y === 0) this.aimCenter = { ...this.aimIdle };
  }

  private placeBase(base: HTMLDivElement, label: HTMLDivElement, pos: Point): void {
    base.style.left = `${pos.x}px`;
    base.style.top = `${pos.y}px`;
    label.style.left = `${pos.x}px`;
    label.style.top = `${pos.y + BASE_RADIUS + 6}px`;
  }

  private placeKnob(knob: HTMLDivElement, center: Point, normX: number, normY: number): void {
    const range = BASE_RADIUS - KNOB_RADIUS;
    knob.style.left = `${center.x + normX * range}px`;
    knob.style.top = `${center.y + normY * range}px`;
  }

  moveActivate(x: number, y: number): void {
    this.moveCenter = { x, y };
    this.placeBase(this.moveBase, this.moveLabel, this.moveCenter);
    this.placeKnob(this.moveKnob, this.moveCenter, 0, 0);
    this.moveBase.style.opacity = '1';
    this.moveLabel.style.opacity = '0';
  }

  /** normX: -1..1, horizontal only — the move stick has no vertical gameplay effect yet. */
  moveUpdate(normX: number): void {
    this.placeKnob(this.moveKnob, this.moveCenter, normX, 0);
  }

  moveRelease(): void {
    this.moveCenter = { ...this.moveIdle };
    this.placeBase(this.moveBase, this.moveLabel, this.moveIdle);
    this.placeKnob(this.moveKnob, this.moveIdle, 0, 0);
    this.moveBase.style.opacity = '0.6';
    this.moveLabel.style.opacity = '1';
  }

  aimActivate(x: number, y: number): void {
    this.aimCenter = { x, y };
    this.placeBase(this.aimBase, this.aimLabel, this.aimCenter);
    this.placeKnob(this.aimKnob, this.aimCenter, 0, 0);
    this.aimBase.style.opacity = '1';
    this.aimLabel.style.opacity = '0';
  }

  /** normX/normY: -1..1 each, magnitude should already be pre-clamped by the caller. */
  aimUpdate(normX: number, normY: number): void {
    this.placeKnob(this.aimKnob, this.aimCenter, normX, normY);
  }

  aimRelease(): void {
    this.aimCenter = { ...this.aimIdle };
    this.placeBase(this.aimBase, this.aimLabel, this.aimIdle);
    this.placeKnob(this.aimKnob, this.aimIdle, 0, 0);
    this.aimBase.style.opacity = '0.6';
    this.aimLabel.style.opacity = '1';
  }
}
