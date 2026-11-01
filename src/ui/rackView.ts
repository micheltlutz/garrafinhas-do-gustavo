// A estante de garrafinhas: desenho, toque, arrasto e a animação de despejar.
//
// Como jogar: toque numa garrafinha (ela sobe) e depois noutra (ela despeja).
// Também dá para arrastar uma garrafinha até a outra.

import { sfx } from '../audio/sfx.ts';
import { liquidColors, type Level } from '../game/levels.ts';
import { hasSolution, nextHint } from '../game/solver.ts';
import { canPour, isComplete, isSolved, pour, pourAmount, topRun, type Puzzle } from '../game/tubes.ts';
import { ICONS } from './icons.ts';

export interface RackEvents {
  /** Um despejo começou (para reiniciar o tempo da dica automática). */
  onPour(): void;
  /** Todas as garrafinhas prontas (depois das animações). */
  onSolved(): void;
  /** Mudou se dá para desfazer e se a posição ainda tem saída. */
  onState(canUndo: boolean, stuck: boolean): void;
}

// Medidas em "larguras de garrafinha".
const UNIT = 0.9; // altura de uma camada
const HEAD = 0.5; // espaço vazio no gargalo
const BORDER = 0.07; // vidro
const GAP = 0.7; // espaço entre garrafinhas
const ROW_GAP = 1.05; // espaço entre fileiras
const LIFT = 0.6; // quanto a garrafinha escolhida sobe
const CORK = 0.35; // a rolha passa um pouco da boca
const MAX_WIDTH = 140; // px
const DRAG_START = 12; // px de movimento para virar arrasto

// Animação de despejar (ms).
const T_MOVE = 260;
const T_POUR = 440;
const T_BACK = 240;
const TILT = 95; // graus

interface Spot {
  x: number;
  y: number;
}

interface TubeEl {
  root: HTMLElement;
  bottle: HTMLElement;
  liquid: HTMLElement;
}

interface Drag {
  pointerId: number;
  tube: number | null;
  startX: number;
  startY: number;
  active: boolean;
  over: number | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RackView {
  readonly root: HTMLElement;
  private readonly rack: HTMLElement;
  private readonly events: RackEvents;
  private tubes: TubeEl[] = [];
  private spots: Spot[] = [];
  private tw = 80;
  private th = 300;
  private start: Puzzle = { tubes: [], cap: 4 };
  private puzzle: Puzzle = this.start;
  private history: Puzzle[] = [];
  private colors: Record<string, string> = {};
  private selected: number | null = null;
  private readonly busy = new Set<number>();
  private drag: Drag | null = null;
  private hintEls: HTMLElement[] = [];
  private stuck = false;
  private solved = false;
  /** Muda ao carregar/recomeçar, para cancelar animações antigas. */
  private generation = 0;

  constructor(events: RackEvents) {
    this.events = events;
    this.root = document.createElement('div');
    this.root.className = 'rack-wrap';
    this.rack = document.createElement('div');
    this.rack.className = 'rack';
    this.root.append(this.rack);

    this.rack.addEventListener('pointerdown', (e) => this.onDown(e));
    this.rack.addEventListener('pointermove', (e) => this.onMove(e));
    this.rack.addEventListener('pointerup', (e) => this.onUp(e));
    this.rack.addEventListener('pointercancel', (e) => this.onCancel(e));
    this.rack.addEventListener('lostpointercapture', (e) => this.onCancel(e));

    new ResizeObserver(() => this.layout()).observe(this.root);
  }

  load(level: Level, levelIndex: number): void {
    this.start = { tubes: [...level.tubes], cap: level.cap };
    this.colors = liquidColors(levelIndex);
    this.reset();
  }

  restart(): void {
    this.reset();
  }

  /** Desfaz o último despejo (só quando nada está se mexendo). */
  undo(): boolean {
    if (this.history.length === 0 || this.busy.size > 0 || this.solved) return false;
    this.cancelDrag();
    this.clearHint();
    this.deselect(false);
    this.puzzle = this.history.pop()!;
    this.renderAll();
    this.updateState();
    sfx.undo();
    return true;
  }

  showHint(): void {
    if (this.solved) return;
    this.clearHint();
    this.cancelDrag();
    this.deselect(false);
    const hint = nextHint(this.puzzle);
    if (hint.kind === 'stuck') {
      this.stuck = true;
      this.events.onState(this.history.length > 0, true);
      return;
    }
    if (hint.kind !== 'move') return;
    const { from, to } = hint.move;
    this.tubes[from].root.classList.add('hint');
    const arrow = document.createElement('div');
    arrow.className = 'hint-arrow';
    arrow.innerHTML = ICONS.down;
    const s = this.spots[to];
    arrow.style.left = `${s.x + this.tw / 2}px`;
    arrow.style.top = `${s.y - LIFT * this.tw}px`;
    this.rack.append(arrow);
    this.hintEls.push(arrow, this.tubes[from].root);
  }

  clearHint(): void {
    for (const el of this.hintEls) {
      if (el.classList.contains('hint-arrow')) el.remove();
      else el.classList.remove('hint');
    }
    this.hintEls = [];
  }

  /** Solta o que estiver no dedo (app foi para o segundo plano, troca de tela...). */
  cancelDrag(): void {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (d.active && d.tube !== null) {
      this.markOver(null);
      this.tubes[d.tube].root.classList.remove('dragging');
      this.deselect(false);
    }
  }

  // ---------- estado ----------

  private reset(): void {
    this.generation++;
    this.busy.clear();
    this.drag = null;
    this.selected = null;
    this.solved = false;
    this.stuck = false;
    this.history = [];
    this.puzzle = this.start;
    this.clearHint();
    this.build();
    this.updateState();
  }

  private updateState(): void {
    this.stuck = !this.solved && hasSolution(this.puzzle) === false;
    this.events.onState(this.history.length > 0 && !this.solved, this.stuck);
  }

  // ---------- desenho ----------

  private build(): void {
    for (const t of this.tubes) t.root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.rack.replaceChildren();
    this.tubes = this.puzzle.tubes.map(() => {
      const root = document.createElement('div');
      root.className = 'tube';
      root.innerHTML = `<div class="bottle"><div class="glass"><div class="liquid"></div></div><div class="cork"></div></div>`;
      this.rack.append(root);
      return {
        root,
        bottle: root.querySelector<HTMLElement>('.bottle')!,
        liquid: root.querySelector<HTMLElement>('.liquid')!,
      };
    });
    this.rack.style.setProperty('--cap', String(this.puzzle.cap));
    this.layout();
    this.renderAll();
  }

  private renderAll(): void {
    this.puzzle.tubes.forEach((_, i) => this.renderTube(i));
  }

  private renderTube(i: number, tube = this.puzzle.tubes[i]): void {
    const { cap } = this.puzzle;
    const parts: string[] = [];
    for (let k = 0; k < tube.length; ) {
      let n = 1;
      while (tube[k + n] === tube[k]) n++;
      parts.push(`<div class="layer" style="--c:${this.colors[tube[k]]};height:${(n / cap) * 100}%"></div>`);
      k += n;
    }
    this.tubes[i].liquid.innerHTML = parts.join('');
    this.tubes[i].root.classList.toggle('complete', isComplete(tube, cap));
  }

  /** Distribui as garrafinhas em 1 a 3 fileiras, do maior tamanho que couber. */
  private layout(): void {
    const n = this.puzzle.tubes.length;
    if (n === 0) return;
    const { width, height } = this.root.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const ratio = this.puzzle.cap * UNIT + HEAD + BORDER;
    let best = { tw: 0, rows: 1 };
    for (let rows = 1; rows <= 3; rows++) {
      const cols = Math.ceil(n / rows);
      const byWidth = width / (cols + (cols - 1) * GAP);
      const byHeight = height / (CORK + LIFT + rows * ratio + (rows - 1) * ROW_GAP);
      const tw = Math.min(byWidth, byHeight, MAX_WIDTH);
      if (tw > best.tw * 1.04) best = { tw, rows };
    }
    const tw = Math.floor(best.tw);
    const th = Math.round(tw * ratio);
    this.tw = tw;
    this.th = th;
    this.rack.style.setProperty('--tw', `${tw}px`);
    this.rack.style.setProperty('--th', `${th}px`);

    const rows = best.rows;
    const perRow = Math.ceil(n / rows);
    const blockH = (CORK + LIFT) * tw + rows * th + (rows - 1) * ROW_GAP * tw;
    const top0 = (height - blockH) / 2 + (CORK + LIFT) * tw;
    this.spots = [];
    for (let r = 0, i = 0; r < rows; r++) {
      const count = Math.min(perRow, n - i);
      const rowW = count * tw + (count - 1) * GAP * tw;
      const left0 = (width - rowW) / 2;
      for (let c = 0; c < count; c++, i++) {
        this.spots.push({ x: Math.round(left0 + c * (1 + GAP) * tw), y: Math.round(top0 + r * (th + ROW_GAP * tw)) });
      }
    }
    this.tubes.forEach((t, i) => {
      t.root.style.left = `${this.spots[i].x}px`;
      t.root.style.top = `${this.spots[i].y}px`;
    });
  }

  // ---------- toque ----------

  /** Qual garrafinha está sob o dedo (a área inclui o espaço em volta dela). */
  private tubeAt(clientX: number, clientY: number): number | null {
    const box = this.rack.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const pad = (GAP / 2) * this.tw;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (x >= s.x - pad && x <= s.x + this.tw + pad && y >= s.y - (LIFT + CORK) * this.tw && y <= s.y + this.th + pad) {
        return i;
      }
    }
    return null;
  }

  private onDown(e: PointerEvent): void {
    if (this.drag || this.solved) return;
    e.preventDefault();
    this.clearHint();
    const tube = this.tubeAt(e.clientX, e.clientY);
    this.drag = { pointerId: e.pointerId, tube, startX: e.clientX, startY: e.clientY, active: false, over: null };
    try {
      this.rack.setPointerCapture(e.pointerId);
    } catch {
      // segue sem captura
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId || d.tube === null) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_START || !this.canPick(d.tube)) return;
      d.active = true;
      if (this.selected !== d.tube) {
        this.deselect(false);
        this.selected = d.tube;
        sfx.select();
      }
      this.tubes[d.tube].root.classList.add('selected', 'dragging');
    }
    this.tubes[d.tube].root.style.transform = `translate(${dx}px, ${dy - LIFT * this.tw}px)`;
    const over = this.tubeAt(e.clientX, e.clientY);
    this.markOver(over !== d.tube && over !== null && canPour(this.puzzle, d.tube, over) ? over : null);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    this.drag = null;
    this.markOver(null);
    if (d.tube === null) {
      this.deselect(true);
      return;
    }
    if (!d.active) {
      this.tap(d.tube);
      return;
    }
    const from = d.tube;
    this.tubes[from].root.classList.remove('dragging');
    const to = this.tubeAt(e.clientX, e.clientY);
    if (to === null || to === from || this.busy.has(to)) {
      this.deselect(true);
      return;
    }
    this.tryPour(from, to);
  }

  private onCancel(e: PointerEvent): void {
    if (this.drag?.pointerId === e.pointerId) this.cancelDrag();
  }

  private markOver(over: number | null): void {
    if (this.drag) this.drag.over = over;
    this.tubes.forEach((t, i) => t.root.classList.toggle('drop-ok', i === over));
  }

  private canPick(i: number): boolean {
    const tube = this.puzzle.tubes[i];
    return !this.busy.has(i) && tube.length > 0 && !isComplete(tube, this.puzzle.cap);
  }

  private tap(i: number): void {
    if (this.busy.has(i)) return;
    if (this.selected === null) {
      if (this.canPick(i)) {
        this.selected = i;
        this.tubes[i].root.classList.add('selected');
        this.tubes[i].root.style.transform = '';
        sfx.select();
      } else if (isComplete(this.puzzle.tubes[i], this.puzzle.cap)) {
        this.bounce(i);
        sfx.cork();
      }
      return;
    }
    if (this.selected === i) {
      this.deselect(true);
      return;
    }
    this.tryPour(this.selected, i);
  }

  private deselect(sound: boolean): void {
    if (this.selected === null) return;
    const t = this.tubes[this.selected].root;
    t.classList.remove('selected', 'dragging');
    t.style.transform = '';
    this.selected = null;
    if (sound) sfx.putDown();
  }

  private tryPour(from: number, to: number): void {
    if (!canPour(this.puzzle, from, to)) {
      this.deselect(false);
      this.shake(to);
      sfx.nope();
      return;
    }
    void this.doPour(from, to);
  }

  private bounce(i: number): void {
    this.tubes[i].bottle.animate(
      [{ transform: 'none' }, { transform: 'translateY(-12%) scale(1.04)' }, { transform: 'none' }],
      { duration: 380, easing: 'ease-out' },
    );
  }

  private shake(i: number): void {
    this.tubes[i].bottle.animate(
      [
        { transform: 'none' },
        { transform: 'rotate(-6deg)' },
        { transform: 'rotate(6deg)' },
        { transform: 'rotate(-4deg)' },
        { transform: 'none' },
      ],
      { duration: 380, easing: 'ease-in-out' },
    );
  }

  // ---------- despejar ----------

  private async doPour(from: number, to: number): Promise<void> {
    const gen = this.generation;
    const before = this.puzzle;
    const amount = pourAmount(before, from, to);
    const color = this.colors[before.tubes[from].at(-1)!];
    const runFrom = topRun(before.tubes[from]);
    const runTo = before.tubes[to].length === 0 ? 0 : topRun(before.tubes[to]);
    const after = pour(before, from, to);

    // O jogo já muda; a tela acompanha com a animação.
    this.history.push(before);
    this.puzzle = after;
    this.busy.add(from).add(to);
    this.selected = null;
    this.events.onPour();
    this.updateState();

    const src = this.tubes[from].root;
    const { cap } = before;
    const tw = this.tw;
    const s = this.spots[from];
    const t = this.spots[to];
    // Inclina com o corpo para o lado de onde veio, a não ser que ali falte
    // espaço (aí vai para o lado com mais espaço, para não sair da tela).
    const rackW = this.rack.getBoundingClientRect().width;
    const roomLeft = t.x + tw / 2;
    const roomRight = rackW - roomLeft;
    let bodyLeft = s.x !== t.x ? s.x < t.x : roomLeft > roomRight;
    if (bodyLeft && roomLeft < this.th && roomRight > roomLeft) bodyLeft = false;
    if (!bodyLeft && roomRight < this.th && roomLeft > roomRight) bodyLeft = true;
    const tilt = bodyLeft ? TILT : -TILT;
    const pivotY = t.y - 0.75 * tw;
    const pose = `translate(${t.x - s.x}px, ${pivotY - s.y}px) rotate(${tilt}deg)`;
    const current = src.style.transform || 'none';
    src.classList.remove('selected', 'dragging');
    src.classList.add('pouring');
    src.style.transform = '';

    await src.animate([{ transform: current }, { transform: pose }], {
      duration: T_MOVE,
      easing: 'ease-in-out',
      fill: 'forwards',
    }).finished.catch(() => {});
    if (gen !== this.generation) return;

    // Jorro de líquido da boca até o nível novo da garrafinha de baixo.
    const stream = document.createElement('div');
    stream.className = 'stream';
    stream.style.setProperty('--c', color);
    const mouthY = pivotY + 0.5 * tw;
    const surface = t.y + this.th - BORDER * tw - after.tubes[to].length * UNIT * tw;
    stream.style.left = `${t.x + tw / 2}px`;
    stream.style.top = `${mouthY}px`;
    stream.style.height = `${Math.max(0, surface - mouthY)}px`;
    this.rack.append(stream);
    stream.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 110, easing: 'ease-in' });
    sfx.pour(after.tubes[to].length / cap, amount);

    const pct = (n: number) => `${(n / cap) * 100}%`;
    const srcLayer = this.tubes[from].liquid.lastElementChild as HTMLElement | null;
    srcLayer?.animate([{ height: pct(runFrom) }, { height: pct(runFrom - amount) }], {
      duration: T_POUR,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    this.renderTube(to, before.tubes[to]);
    this.tubes[to].root.classList.remove('complete');
    const dstLayer = this.addTopLayer(to, color, runTo);
    dstLayer.animate([{ height: pct(runTo) }, { height: pct(runTo + amount) }], {
      duration: T_POUR,
      delay: 60,
      easing: 'ease-in-out',
      fill: 'forwards',
    });

    await wait(T_POUR + 60);
    if (gen !== this.generation) return;
    stream.style.transformOrigin = 'bottom';
    stream
      .animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 120, easing: 'ease-out' })
      .finished.catch(() => {})
      .then(() => stream.remove());

    this.renderTube(to);
    if (isComplete(after.tubes[to], cap)) this.celebrateTube(to);

    const back = src.animate([{ transform: pose }, { transform: 'none' }], {
      duration: T_BACK,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    src.getAnimations().forEach((a) => a !== back && a.cancel());
    await back.finished.catch(() => {});
    if (gen !== this.generation) return;
    back.cancel();
    src.classList.remove('pouring');
    this.renderTube(from);
    this.busy.delete(from);
    this.busy.delete(to);

    if (this.busy.size === 0 && isSolved(this.puzzle) && !this.solved) {
      this.solved = true;
      this.events.onState(false, false);
      this.events.onSolved();
    }
  }

  /** Coloca (ou reaproveita) a camada de cima da garrafinha de destino para ela crescer. */
  private addTopLayer(i: number, color: string, run: number): HTMLElement {
    const liquid = this.tubes[i].liquid;
    if (run > 0 && liquid.lastElementChild) return liquid.lastElementChild as HTMLElement;
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.style.setProperty('--c', color);
    layer.style.height = '0%';
    liquid.append(layer);
    return layer;
  }

  /** Garrafinha pronta: rolha, brilho e um "plim". */
  private celebrateTube(i: number): void {
    const t = this.tubes[i];
    t.root.classList.add('complete');
    t.root.querySelector('.cork')?.animate(
      [
        { transform: 'translate(-50%, -160%)', opacity: 0 },
        { transform: 'translate(-50%, 10%)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, 0)', opacity: 1 },
      ],
      { duration: 380, easing: 'ease-out' },
    );
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    sparkle.innerHTML = ICONS.star;
    t.root.append(sparkle);
    sparkle
      .animate(
        [
          { transform: 'translate(-50%, 0) scale(0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(-50%, -120%) scale(1.2) rotate(140deg)', opacity: 1, offset: 0.6 },
          { transform: 'translate(-50%, -160%) scale(0.6) rotate(200deg)', opacity: 0 },
        ],
        { duration: 800, easing: 'ease-out' },
      )
      .finished.catch(() => {})
      .then(() => sparkle.remove());
    sfx.cork();
  }
}
