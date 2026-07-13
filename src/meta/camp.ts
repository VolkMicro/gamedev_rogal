import {
  MAX_WAND_SLOTS,
  nextPerkCost,
  nextSpellUnlocks,
  nextWandSlotCost,
  persistSave,
  PERKS,
  type PerkId,
  type SaveState,
} from './save';
import { SPELL_LABELS } from '../gameplay/projectile';

/**
 * DOM-based camp hub: three vendor sections (per GDD §2 — wands/spells/perks
 * sold by different "previous versions" of the hero), a wand loadout picker,
 * and a start-run button. Real art/portraits for the NPCs land with the
 * Kenney/Ansimuz asset pass in a later stage — this is a functional stand-in.
 */
export class Camp {
  private el: HTMLDivElement;
  private save: SaveState;
  private onStartRun: () => void;

  constructor(save: SaveState, onStartRun: () => void) {
    this.save = save;
    this.onStartRun = onStartRun;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '20',
      background: '#0c0a08',
      color: '#e8d9b0',
      font: '13px monospace',
      overflowY: 'auto',
      padding: '16px',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    this.render();
  }

  show(): void {
    this.el.style.display = 'block';
    this.render();
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.disabled = disabled;
    Object.assign(btn.style, {
      display: 'block',
      width: '100%',
      margin: '4px 0',
      padding: '8px',
      font: '12px monospace',
      textAlign: 'left',
      opacity: disabled ? '0.5' : '1',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private section(title: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '16px';
    const h = document.createElement('h3');
    h.textContent = title;
    h.style.margin = '0 0 6px 0';
    wrap.appendChild(h);
    this.el.appendChild(wrap);
    return wrap;
  }

  private render(): void {
    this.el.innerHTML = '';

    const title = document.createElement('h1');
    title.textContent = '«Фитиль» — лагерь';
    title.style.margin = '0 0 4px 0';
    this.el.appendChild(title);

    const essenceLine = document.createElement('div');
    essenceLine.textContent = `Эссенция: ${this.save.essenceBanked} · забегов: ${this.save.runsCompleted} · смертей: ${this.save.deaths}`;
    essenceLine.style.marginBottom = '16px';
    this.el.appendChild(essenceLine);

    // Версия, взорвавшая себя — продаёт заклинания в общий пул находок.
    const spellSection = this.section('Заклинания (версия, взорвавшая себя)');
    for (const unlock of nextSpellUnlocks(this.save)) {
      const affordable = this.save.essenceBanked >= unlock.cost;
      spellSection.appendChild(
        this.button(`Открыть «${SPELL_LABELS[unlock.spell]}» — ${unlock.cost} эссенции`, !affordable, () => {
          this.save.essenceBanked -= unlock.cost;
          this.save.unlockedSpells.push(unlock.spell);
          persistSave(this.save);
          this.render();
        }),
      );
    }
    if (nextSpellUnlocks(this.save).length === 0) {
      const done = document.createElement('div');
      done.textContent = 'Все заклинания найдены.';
      spellSection.appendChild(done);
    }

    // Версия, утонувшая в кислоте — продаёт слоты палочки.
    const wandSection = this.section('Палочка (версия, утонувшая в кислоте)');
    const slotCost = nextWandSlotCost(this.save);
    if (slotCost !== null) {
      const affordable = this.save.essenceBanked >= slotCost;
      wandSection.appendChild(
        this.button(`+1 слот палочки (сейчас ${this.save.unlockedWandSlots}/${MAX_WAND_SLOTS}) — ${slotCost} эссенции`, !affordable, () => {
          this.save.essenceBanked -= slotCost;
          this.save.unlockedWandSlots += 1;
          if (this.save.wandLoadout.length < this.save.unlockedWandSlots) {
            this.save.wandLoadout.push(this.save.unlockedSpells[0]);
          }
          persistSave(this.save);
          this.render();
        }),
      );
    } else {
      const done = document.createElement('div');
      done.textContent = `Максимум слотов (${MAX_WAND_SLOTS}) уже открыт.`;
      wandSection.appendChild(done);
    }

    // Версия, сгоревшая заживо — продаёт постоянные перки.
    const perkSection = this.section('Перки (версия, сгоревшая заживо)');
    for (const perkId of Object.keys(PERKS) as PerkId[]) {
      const cost = nextPerkCost(this.save, perkId);
      const level = this.save.perkLevels[perkId] ?? 0;
      if (cost === null) {
        const done = document.createElement('div');
        done.textContent = `${PERKS[perkId].label}: максимум (${level})`;
        perkSection.appendChild(done);
        continue;
      }
      const affordable = this.save.essenceBanked >= cost;
      perkSection.appendChild(
        this.button(`${PERKS[perkId].label} (${level}/${PERKS[perkId].maxLevel}) — ${cost} эссенции`, !affordable, () => {
          this.save.essenceBanked -= cost;
          this.save.perkLevels[perkId] = level + 1;
          persistSave(this.save);
          this.render();
        }),
      );
    }

    // Wand loadout picker.
    const loadoutSection = this.section('Снаряжение палочки (тапни слот, чтобы сменить)');
    while (this.save.wandLoadout.length < this.save.unlockedWandSlots) {
      this.save.wandLoadout.push(this.save.unlockedSpells[0]);
    }
    this.save.wandLoadout.length = this.save.unlockedWandSlots;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.flexWrap = 'wrap';
    this.save.wandLoadout.forEach((spell, i) => {
      const slotBtn = document.createElement('button');
      slotBtn.textContent = SPELL_LABELS[spell];
      Object.assign(slotBtn.style, {
        padding: '8px',
        font: '12px monospace',
      } satisfies Partial<CSSStyleDeclaration>);
      slotBtn.addEventListener('click', () => {
        const known = this.save.unlockedSpells;
        const cur = known.indexOf(spell);
        const next = known[(cur + 1) % known.length];
        this.save.wandLoadout[i] = next;
        persistSave(this.save);
        this.render();
      });
      row.appendChild(slotBtn);
    });
    loadoutSection.appendChild(row);

    const startBtn = this.button('Начать забег ▶', false, () => this.onStartRun());
    Object.assign(startBtn.style, { marginTop: '16px', padding: '14px', font: '15px monospace' } satisfies Partial<CSSStyleDeclaration>);
    this.el.appendChild(startBtn);
  }
}
