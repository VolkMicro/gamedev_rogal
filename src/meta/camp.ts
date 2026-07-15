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
import { SPELL_LABELS, type SpellId } from '../gameplay/projectile';

/**
 * DOM-based camp hub, redesigned after on-device feedback ("уебанский
 * список который надо дохуя скроллить"): a single NO-SCROLL screen with
 * three vendor stalls (GDD §2's "previous versions" of the hero), each
 * showing only its NEXT 1-3 purchases instead of the full 20+ item
 * catalogue — the Hades/Dead Cells progressive-disclosure pattern. The full
 * spell catalogue is still reachable behind an explicit "ещё N ▸" tap, as a
 * compact grid. Everything respects the fake-landscape safe insets
 * (--game-safe-left/right CSS vars) so nothing hides under Telegram's
 * «Закрыть»/status-bar overlay.
 */
export class Camp {
  private el: HTMLDivElement;
  private save: SaveState;
  private onStartRun: () => void;
  private showCatalogue = false;

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
      font: '15px monospace',
      overflow: 'hidden',
      padding: '10px',
      paddingLeft: 'calc(10px + var(--game-safe-left, 0px))',
      paddingRight: 'calc(10px + var(--game-safe-right, 0px))',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
    this.render();
  }

  show(): void {
    this.el.style.display = 'flex';
    this.showCatalogue = false;
    this.render();
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.disabled = disabled;
    btn.className = 'kenney-btn';
    Object.assign(btn.style, {
      display: 'block',
      width: '100%',
      margin: '4px 0',
      textAlign: 'left',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private buySpell(spell: SpellId, cost: number): void {
    this.save.essenceBanked -= cost;
    this.save.unlockedSpells.push(spell);
    persistSave(this.save);
    this.render();
  }

  private render(): void {
    this.el.innerHTML = '';
    if (this.showCatalogue) {
      this.renderCatalogue();
      return;
    }

    // Header row: essence + title left, start button right — always visible,
    // never scrolls away.
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '8px',
      flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);
    const essenceEl = document.createElement('div');
    essenceEl.textContent = `✦ ${this.save.essenceBanked}`;
    Object.assign(essenceEl.style, { color: '#ffd15c', font: 'bold 18px monospace' } satisfies Partial<CSSStyleDeclaration>);
    const titleEl = document.createElement('div');
    titleEl.textContent = '«Фитиль» — лагерь';
    Object.assign(titleEl.style, { font: 'bold 16px monospace', flex: '1' } satisfies Partial<CSSStyleDeclaration>);
    const statsEl = document.createElement('div');
    statsEl.textContent = `забегов ${this.save.runsCompleted} · смертей ${this.save.deaths}`;
    Object.assign(statsEl.style, { color: '#8a7d5e', font: '12px monospace' } satisfies Partial<CSSStyleDeclaration>);
    const startBtn = document.createElement('button');
    startBtn.textContent = '▶ ЗАБЕГ';
    startBtn.className = 'kenney-btn kenney-btn-primary';
    Object.assign(startBtn.style, { font: 'bold 16px monospace', padding: '8px 18px' } satisfies Partial<CSSStyleDeclaration>);
    startBtn.addEventListener('click', () => this.onStartRun());
    header.append(essenceEl, titleEl, statsEl, startBtn);
    this.el.appendChild(header);

    // Three vendor stalls side by side, each capped to its next few offers.
    const stalls = document.createElement('div');
    Object.assign(stalls.style, {
      display: 'flex',
      gap: '8px',
      flex: '1 1 auto',
      minHeight: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    this.el.appendChild(stalls);

    const stall = (name: string): HTMLDivElement => {
      const box = document.createElement('div');
      Object.assign(box.style, {
        flex: '1 1 0',
        border: '1px solid #4a3f2a',
        background: 'rgba(255, 224, 160, 0.04)',
        padding: '8px',
        minWidth: '0',
        overflow: 'hidden',
      } satisfies Partial<CSSStyleDeclaration>);
      const h = document.createElement('div');
      h.textContent = name;
      Object.assign(h.style, { color: '#c9b78a', font: 'bold 13px monospace', marginBottom: '6px' } satisfies Partial<CSSStyleDeclaration>);
      box.appendChild(h);
      stalls.appendChild(box);
      return box;
    };

    // Stall 1: spells — next 2 unlocks + catalogue expander.
    const spellStall = stall('Взорвавшая себя · заклинания');
    const unlocks = nextSpellUnlocks(this.save);
    for (const unlock of unlocks.slice(0, 2)) {
      const affordable = this.save.essenceBanked >= unlock.cost;
      spellStall.appendChild(
        this.button(`${SPELL_LABELS[unlock.spell]} — ${unlock.cost}✦`, !affordable, () => this.buySpell(unlock.spell, unlock.cost)),
      );
    }
    if (unlocks.length > 2) {
      const more = this.button(`ещё ${unlocks.length - 2} ▸`, false, () => {
        this.showCatalogue = true;
        this.render();
      });
      more.style.textAlign = 'center';
      spellStall.appendChild(more);
    }
    if (unlocks.length === 0) {
      const done = document.createElement('div');
      done.textContent = 'Все заклинания найдены.';
      spellStall.appendChild(done);
    }

    // Stall 2: wand slots.
    const wandStall = stall('Утонувшая в кислоте · палочка');
    const slotCost = nextWandSlotCost(this.save);
    if (slotCost !== null) {
      const affordable = this.save.essenceBanked >= slotCost;
      wandStall.appendChild(
        this.button(`+1 слот (${this.save.unlockedWandSlots}/${MAX_WAND_SLOTS}) — ${slotCost}✦`, !affordable, () => {
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
      done.textContent = `Максимум слотов (${MAX_WAND_SLOTS}).`;
      wandStall.appendChild(done);
    }

    // Stall 3: perks.
    const perkStall = stall('Сгоревшая заживо · перки');
    for (const perkId of Object.keys(PERKS) as PerkId[]) {
      const cost = nextPerkCost(this.save, perkId);
      const level = this.save.perkLevels[perkId] ?? 0;
      if (cost === null) {
        const done = document.createElement('div');
        done.textContent = `${PERKS[perkId].label}: макс.`;
        perkStall.appendChild(done);
        continue;
      }
      const affordable = this.save.essenceBanked >= cost;
      perkStall.appendChild(
        this.button(`${PERKS[perkId].label} (${level}/${PERKS[perkId].maxLevel}) — ${cost}✦`, !affordable, () => {
          this.save.essenceBanked -= cost;
          this.save.perkLevels[perkId] = level + 1;
          persistSave(this.save);
          this.render();
        }),
      );
    }

    // Wand loadout row, pinned at the bottom.
    const loadoutRow = document.createElement('div');
    Object.assign(loadoutRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginTop: '8px',
      flex: '0 0 auto',
      flexWrap: 'wrap',
    } satisfies Partial<CSSStyleDeclaration>);
    const loadoutLabel = document.createElement('div');
    loadoutLabel.textContent = 'Палочка:';
    loadoutLabel.style.color = '#c9b78a';
    loadoutRow.appendChild(loadoutLabel);
    while (this.save.wandLoadout.length < this.save.unlockedWandSlots) {
      this.save.wandLoadout.push(this.save.unlockedSpells[0]);
    }
    this.save.wandLoadout.length = this.save.unlockedWandSlots;
    this.save.wandLoadout.forEach((spell, i) => {
      const slotBtn = document.createElement('button');
      slotBtn.textContent = SPELL_LABELS[spell];
      slotBtn.className = 'kenney-btn';
      slotBtn.addEventListener('click', () => {
        const known = this.save.unlockedSpells;
        const cur = known.indexOf(spell);
        const next = known[(cur + 1) % known.length];
        this.save.wandLoadout[i] = next;
        persistSave(this.save);
        this.render();
      });
      loadoutRow.appendChild(slotBtn);
    });
    this.el.appendChild(loadoutRow);
  }

  /** Full spell catalogue as a compact grid — reached only via the explicit "ещё N ▸" tap, never forced on the main screen. */
  private renderCatalogue(): void {
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '8px',
      flex: '0 0 auto',
    } satisfies Partial<CSSStyleDeclaration>);
    const essenceEl = document.createElement('div');
    essenceEl.textContent = `✦ ${this.save.essenceBanked}`;
    Object.assign(essenceEl.style, { color: '#ffd15c', font: 'bold 18px monospace' } satisfies Partial<CSSStyleDeclaration>);
    const titleEl = document.createElement('div');
    titleEl.textContent = 'Все заклинания';
    Object.assign(titleEl.style, { font: 'bold 16px monospace', flex: '1' } satisfies Partial<CSSStyleDeclaration>);
    const backBtn = document.createElement('button');
    backBtn.textContent = '◂ Назад';
    backBtn.className = 'kenney-btn';
    backBtn.addEventListener('click', () => {
      this.showCatalogue = false;
      this.render();
    });
    header.append(essenceEl, titleEl, backBtn);
    this.el.appendChild(header);

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: '6px',
      overflowY: 'auto',
      flex: '1 1 auto',
      minHeight: '0',
      paddingBottom: '8px',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const unlock of nextSpellUnlocks(this.save)) {
      const affordable = this.save.essenceBanked >= unlock.cost;
      const card = document.createElement('button');
      card.className = 'kenney-btn';
      card.disabled = !affordable;
      card.textContent = `${SPELL_LABELS[unlock.spell]} · ${unlock.cost}✦`;
      Object.assign(card.style, { textAlign: 'center', whiteSpace: 'normal' } satisfies Partial<CSSStyleDeclaration>);
      card.addEventListener('click', () => this.buySpell(unlock.spell, unlock.cost));
      grid.appendChild(card);
    }
    this.el.appendChild(grid);
  }
}
