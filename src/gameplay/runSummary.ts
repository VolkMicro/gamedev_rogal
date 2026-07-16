export interface RunStats {
  essence: number;
  kills: number;
  /** Deepest point reached, in world px below spawn. */
  depthPx: number;
  seconds: number;
}

/**
 * End-of-run summary — death used to hard-cut straight to the camp menu,
 * which read as "punished, back to the shop" (flagged in the design
 * council's death/camp feel pass). One screen: what you earned and how far
 * you got, then a single tap to camp (which itself is one tap from the
 * next descent — 2 taps death-to-descend total).
 */
export class RunSummary {
  private root: HTMLDivElement;
  private title: HTMLDivElement;
  private rows: HTMLDivElement;
  private onContinue: (() => void) | null = null;

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
      background: 'rgba(5, 4, 3, 0.9)',
      zIndex: '28',
      font: '15px monospace',
      color: '#e8d9b0',
    } satisfies Partial<CSSStyleDeclaration>);

    this.title = document.createElement('div');
    Object.assign(this.title.style, { font: 'bold 22px monospace', marginBottom: '4px' } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.title);

    this.rows = document.createElement('div');
    Object.assign(this.rows.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.rows);

    const btn = document.createElement('button');
    btn.textContent = 'В лагерь ▸';
    btn.className = 'kenney-btn kenney-btn-primary';
    Object.assign(btn.style, { marginTop: '10px', font: 'bold 15px monospace', padding: '10px 22px' } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', () => {
      const cb = this.onContinue;
      this.hide();
      cb?.();
    });
    this.root.appendChild(btn);
    document.body.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  show(outcome: 'death' | 'victory', stats: RunStats, onContinue: () => void): void {
    this.onContinue = onContinue;
    this.title.textContent = outcome === 'victory' ? 'Страж повержен!' : 'Фитиль погас…';
    this.title.style.color = outcome === 'victory' ? '#ffd15c' : '#c96a5a';
    const mm = Math.floor(stats.seconds / 60);
    const ss = Math.floor(stats.seconds % 60);
    this.rows.innerHTML = '';
    const line = (text: string): void => {
      const el = document.createElement('div');
      el.textContent = text;
      this.rows.appendChild(el);
    };
    line(`✦ Эссенция: ${stats.essence}`);
    line(`Глубина: ${Math.max(0, Math.round(stats.depthPx / 10))} м`);
    line(`Убито: ${stats.kills}`);
    line(`Время: ${mm}:${String(ss).padStart(2, '0')}`);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.onContinue = null;
  }
}
