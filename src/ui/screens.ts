// As três telas do jogo: inicial, mapa de fases e a fase em si.

import { sfx } from '../audio/sfx.ts';
import { LEVELS, WORLD_SIZE, worldOf } from '../game/levels.ts';
import { store } from '../storage.ts';
import { clearConfetti, confetti } from './confetti.ts';
import { ICONS, iconButton } from './icons.ts';
import { RackView } from './rackView.ts';

export interface Nav {
  home(): void;
  map(): void;
  play(level: number): void;
}

/** Tempo parado até a dica aparecer sozinha. */
const IDLE_HINT_MS = 40_000;

function makeScreen(className: string): HTMLElement {
  const el = document.createElement('section');
  el.className = `screen ${className}`;
  el.hidden = true;
  return el;
}

function onTap(button: HTMLButtonElement, action: () => void, sound = true): HTMLButtonElement {
  button.addEventListener('click', () => {
    if (sound) sfx.pop();
    action();
  });
  return button;
}

// Três garrafinhas com bolhas (tela inicial).
function heroTube(id: string, x: number, layers: string[], cork = false): string {
  const w = 84;
  const top = 60;
  const h = 210;
  const r = 30;
  const shape = `M${x} ${top} H${x + w} V${top + h - r} Q${x + w} ${top + h} ${x + w - r} ${top + h} H${x + r} Q${x} ${top + h} ${x} ${top + h - r} Z`;
  const unit = 46;
  const rects = layers
    .map((c, i) => `<rect x="${x}" y="${top + h - unit * (i + 1)}" width="${w}" height="${unit + 1}" fill="${c}"/>`)
    .join('');
  const bubbles = [0, 1, 2]
    .map(
      (k) =>
        `<circle class="bubble" style="animation-delay:${(k * 0.7 + x / 300).toFixed(2)}s" cx="${x + 22 + k * 20}" cy="${top + h - 14}" r="${5 + (k % 2) * 3}" fill="#fff" opacity=".7"/>`,
    )
    .join('');
  return `
    <clipPath id="${id}"><path d="${shape}"/></clipPath>
    <g class="hero-tube">
      <path d="${shape}" fill="rgba(255,255,255,.4)"/>
      <g clip-path="url(#${id})">${rects}${bubbles}</g>
      <path d="${shape}" fill="none" stroke="#fff" stroke-width="7"/>
      <rect x="${x + 14}" y="${top + 20}" width="10" height="${h - 70}" rx="5" fill="#fff" opacity=".45"/>
      <rect x="${x - 8}" y="${top - 8}" width="${w + 16}" height="16" rx="8" fill="#fff"/>
      ${cork ? `<rect x="${x + 12}" y="${top - 40}" width="${w - 24}" height="40" rx="10" fill="#A1887F" stroke="#6D4C41" stroke-width="5"/>` : ''}
    </g>`;
}

const HERO_SVG = `
<svg viewBox="0 0 440 290" aria-hidden="true">
  ${heroTube('h1', 40, ['#E53935', '#1E88E5', '#FDD835', '#E53935'])}
  ${heroTube('h2', 178, ['#43A047', '#43A047', '#43A047', '#43A047'], true)}
  ${heroTube('h3', 316, ['#1E88E5', '#FDD835'])}
</svg>`;

export class HomeScreen {
  readonly el = makeScreen('home');
  private readonly soundBtn: HTMLButtonElement;

  constructor(nav: Nav) {
    this.el.innerHTML = `
      <h1 class="title">Garrafinhas <span>do Gustavo</span></h1>
      <div class="hero"><button type="button" class="hero-btn" aria-label="Glub glub">${HERO_SVG}</button></div>
      <div class="home-actions"></div>`;
    const hero = this.el.querySelector<HTMLButtonElement>('.hero-btn')!;
    hero.addEventListener('click', () => {
      sfx.pour(0.6, 2);
      hero.animate(
        [{ transform: 'none' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' }, { transform: 'none' }],
        { duration: 500, easing: 'ease-in-out' },
      );
    });

    const actions = this.el.querySelector('.home-actions')!;
    this.soundBtn = onTap(iconButton('soundOn', 'Som'), () => {
      store.sound = !store.sound;
      this.render();
    });
    actions.append(
      onTap(iconButton('grid', 'Fases'), () => nav.map()),
      onTap(iconButton('play', 'Jogar', 'big play'), () => nav.play(store.nextLevel(LEVELS.length))),
      this.soundBtn,
    );
  }

  show(): void {
    this.render();
  }

  private render(): void {
    this.soundBtn.innerHTML = store.sound ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.classList.toggle('off', !store.sound);
  }
}

export class MapScreen {
  readonly el = makeScreen('map');
  private readonly tiles: HTMLButtonElement[] = [];

  constructor(nav: Nav) {
    this.el.innerHTML = `<div class="topbar"></div><div class="map-body"><div class="map-grid"></div></div>`;
    this.el.querySelector('.topbar')!.append(onTap(iconButton('home', 'Início'), () => nav.home()));
    const grid = this.el.querySelector('.map-grid')!;
    LEVELS.forEach((_, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.world = String(worldOf(i));
      tile.setAttribute('aria-label', `Fase ${i + 1}`);
      tile.innerHTML = `<span class="num">${i + 1}</span><span class="sticker">${ICONS.check}</span>`;
      onTap(tile, () => nav.play(i));
      grid.appendChild(tile);
      this.tiles.push(tile);
    });
  }

  show(): void {
    const next = store.nextLevel(LEVELS.length);
    const allDone = LEVELS.every((_, i) => store.isDone(i));
    this.tiles.forEach((tile, i) => {
      tile.classList.toggle('done', store.isDone(i));
      tile.classList.toggle('next', !allDone && i === next);
    });
  }
}

export class GameScreen {
  readonly el = makeScreen('game');
  private readonly rack: RackView;
  private readonly badge: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly win: HTMLElement;
  private readonly nav: Nav;
  private level = 0;
  private idleTimer = 0;
  /** Muda a cada fase aberta, para cancelar comemorações antigas. */
  private session = 0;

  constructor(nav: Nav) {
    this.nav = nav;
    this.rack = new RackView({
      onPour: () => this.resetIdle(),
      onSolved: () => void this.celebrate(),
      onState: (canUndo, stuck) => {
        this.undoBtn.disabled = !canUndo;
        // Sem saída: o desfazer pisca, convidando a voltar.
        this.undoBtn.classList.toggle('pulse', stuck && canUndo);
      },
    });

    const controls = document.createElement('div');
    controls.className = 'controls';
    this.badge = document.createElement('div');
    this.badge.className = 'badge';
    this.undoBtn = onTap(
      iconButton('undo', 'Desfazer', 'undo'),
      () => {
        this.rack.undo();
        this.resetIdle();
      },
      false,
    );
    controls.append(
      onTap(iconButton('grid', 'Fases'), () => nav.map()),
      this.badge,
      this.undoBtn,
      onTap(iconButton('restart', 'Recomeçar'), () => {
        this.rack.restart();
        this.resetIdle();
      }),
      onTap(iconButton('bulb', 'Dica', 'hint'), () => {
        this.rack.showHint();
        this.resetIdle();
      }),
    );

    this.win = document.createElement('div');
    this.win.className = 'win';
    this.win.hidden = true;

    this.el.append(controls, this.rack.root, this.win);
  }

  open(level: number): void {
    this.session++;
    this.level = level;
    this.el.dataset.world = String(worldOf(level));
    this.badge.textContent = String(level + 1);
    this.win.hidden = true;
    clearConfetti(this.el);
    this.rack.load(LEVELS[level], level);
    this.resetIdle();
  }

  close(): void {
    this.session++;
    clearTimeout(this.idleTimer);
    clearConfetti(this.el);
    this.rack.cancelDrag();
    this.rack.clearHint();
  }

  /** App foi para o segundo plano. */
  pause(): void {
    this.rack.cancelDrag();
  }

  private resetIdle(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.rack.showHint();
      this.resetIdle();
    }, IDLE_HINT_MS);
  }

  private async celebrate(): Promise<void> {
    const session = this.session;
    clearTimeout(this.idleTimer);
    store.markDone(this.level);
    await new Promise((r) => setTimeout(r, 350));
    if (session !== this.session) return;
    sfx.win();
    confetti(this.el);
    this.showWin();
  }

  private showWin(): void {
    const last = this.level === LEVELS.length - 1;
    const endOfWorld = (this.level + 1) % WORLD_SIZE === 0;
    this.win.innerHTML = `<div class="win-card"><div class="medal ${endOfWorld ? 'trophy' : ''}">${
      endOfWorld ? ICONS.trophy : ICONS.check
    }</div></div>`;
    const card = this.win.querySelector('.win-card')!;
    card.append(
      onTap(iconButton(last ? 'grid' : 'next', last ? 'Fases' : 'Próxima fase', 'big next'), () =>
        last ? this.nav.map() : this.nav.play(this.level + 1),
      ),
    );
    if (!last) card.append(onTap(iconButton('grid', 'Fases', 'small'), () => this.nav.map()));
    this.win.hidden = false;
  }
}
