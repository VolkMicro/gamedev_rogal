import { SPELL_LABELS, isModifierSpell, type SpellId } from './projectile';

/**
 * In-run upgrade pick (the Vampire Survivors loop): the game pauses and
 * offers 3 spells; the chosen one is appended to the wand for the rest of
 * the run. DOM overlay like every other UI surface in this game (camp, HUD,
 * touch controls) — nothing text-shaped lives on the pixel-art canvas.
 */
export class UpgradeChoice {
  private root: HTMLDivElement;
  private title: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private onPick: ((spell: SpellId) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      background: 'rgba(5, 5, 8, 0.82)',
      zIndex: '30',
      font: '14px monospace',
      color: '#eee',
    } satisfies Partial<CSSStyleDeclaration>);

    this.title = document.createElement('div');
    this.title.textContent = 'Фитиль разгорается — выбери заклинание';
    this.title.style.marginBottom = '6px';
    this.root.appendChild(this.title);

    for (let i = 0; i < 3; i++) {
      const btn = document.createElement('button');
      btn.className = 'kenney-btn';
      Object.assign(btn.style, {
        minWidth: '220px',
        padding: '10px 16px',
      } satisfies Partial<CSSStyleDeclaration>);
      btn.addEventListener('click', () => {
        const spell = btn.dataset.spell as SpellId | undefined;
        if (!spell || !this.onPick) return;
        const cb = this.onPick;
        this.hide();
        cb(spell);
      });
      this.buttons.push(btn);
      this.root.appendChild(btn);
    }
    document.body.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  show(options: SpellId[], onPick: (spell: SpellId) => void): void {
    this.onPick = onPick;
    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      const spell = options[i];
      if (!spell) {
        btn.style.display = 'none';
        continue;
      }
      btn.style.display = '';
      btn.dataset.spell = spell;
      const kind = isModifierSpell(spell) ? 'модификатор' : 'снаряд';
      btn.textContent = `${SPELL_LABELS[spell]} (${kind})`;
    }
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.onPick = null;
  }
}
