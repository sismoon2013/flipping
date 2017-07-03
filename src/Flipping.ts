interface ITransform {
  rotate: { x: number, y: number, z: number };
  translate: { x: number, y: number, z: number };
  scale: { x: number, y: number, z: number };  
  matrix: number[];
};

interface IBounds {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  transform?: string;
};

export interface IFlippingOptions {
  getDelta?: (Bounds) => IBounds;
  getBounds?: (node: Element) => IBounds;
  selector?: <T>() => T;
  onFlip?: (state: IFlipState, done?: Function) => any;
  onRead?: (state: IReadState) => void;
  getKey?: () => string;
};

export interface IFlipNodeMode {
  height?: number;
  width?: number;
  from: {
    x?: number;
    y?: number;
    [key: string]: string | number;
  };
  to: {
    x?: number;
    y?: number;
    [key: string]: string | number;
  };
};

export interface IFlipNodesMode {
  node: IFlipNodeMode;
  container?: IFlipNodeMode;
}

const identity: <T>(arg: T) => T = a => a;

const rect = (node: Element): IBounds => {
  const {
    top,
    left,
    width,
    height,
  } = node.getBoundingClientRect();
  
  return {
    top,
    left,
    width,
    height,
    transform: getComputedStyle(node).transform
  };
}

const debugRect = (rect: IBounds, message?: string, color: string = 'red'): void => {
  const overlay = document.getElementById('flip-overlay');
  if (!overlay) return;

  const r = document.createElement('div');
  r.setAttribute('data-rect', message || '');

  r.style.left = `${rect.left}px`;
  r.style.top = `${rect.top}px`;
  r.style.width = `${rect.width}px`;
  r.style.height = `${rect.height}px`;
  r.style.outline = `1px solid ${color}`;

  overlay.appendChild(r);

  setTimeout(() => overlay.removeChild(r), 10000);

  console.log(rect, message);
}

function isHidden(node: Element) {
  const { width, height } = rect(node);

  return width === 0 && height === 0;
}

function forEach(array: ArrayLike<any>, callback: Function): void {
  for (let i = 0; i < array.length; i++) {
    callback(array[i], i, array);
  }
}

export interface IFlipState {
  key: string;
  node: Element;
  first: IBounds;
  last: IBounds;
  delta: IBounds;
  type: 'ENTER' | 'MOVE' | 'LEAVE';
  animation: any;
  previous?: IFlipState;
  start: number;
};

interface IReadState {
  key: string;
  node: Element;
  bounds: IBounds;
  animation: any;
};

interface IListenerDict<T> {
  [key: string]: (state: T) => void;
};

function getDelta(a: IBounds, b: IBounds): IBounds {
  if (!a) return { top: 0, left: 0, width: 1, height: 1 };
  if (!a.height) { return a };
  if (!b.height) { return b };
  return {
    top: a.top - b.top,
    left: a.left - b.left,
    width: a.width / b.width,
    height: a.height / b.height,
  };
}

const selector = (parentNode: Element): Element[] => {
  const nodes = parentNode.querySelectorAll('[data-key]');
  const visibleNodes = {}

  forEach(nodes, node => {
    if (isHidden(node)) return;
    const key = node.getAttribute('data-key');
    visibleNodes[key] = node;
  })

  return Object.keys(visibleNodes).map(key => visibleNodes[key]);
}
const getKey = (node: Element): string =>
  node.getAttribute('data-key');
const deltaChanged = (delta: IBounds): boolean => {
  return !!delta.top
    || !!delta.left
    || (delta.width !== 1)
    || (delta.height !== 1);
};
const boundsChanged = (a: IBounds, b: IBounds): boolean => {
  return !!((a.top - b.top)
    || (a.left - b.left)
    || (a.width - b.width)
    || (a.height - b.height));
};

class Flipping {
  selector: (Element) => Element[];
  getBounds: (Element) => IBounds;
  getKey: (Element) => string;
  getDelta: (first: IBounds, last: IBounds) => IBounds;
  flipListeners: IListenerDict<IFlipState>;
  readListeners: IListenerDict<IReadState>;
  bounds: { [key: string]: IBounds };
  onFlip?: (state: IFlipState, done: Function) => any;
  onRead?: (state: IReadState) => void;
  animations: { [key: string]: any };
  states: {[key: string]: IFlipState};
  listeners: {[type: string]: Function[]};

  constructor(options: IFlippingOptions = {}) {
    this.selector = options.selector || selector;
    this.getBounds = options.getBounds || rect;
    this.getDelta = options.getDelta || getDelta;
    this.getKey = options.getKey || getKey;
    this.onFlip = options.onFlip || identity;
    this.onRead = options.onRead || identity;

    this.flipListeners = {};
    this.readListeners = {};

    this.bounds = {};
    this.animations = {};
    this.states = {};
    this.listeners = {};
  }
  private getRelativeBounds(parentBounds: IBounds, childBounds: IBounds): IBounds {
    return {
      ...childBounds,
      top: childBounds.top - parentBounds.top,
      left: childBounds.left - parentBounds.left
    };
  }
  public on(type: string, handler: Function): void {
    (this.listeners[type] || (this.listeners[type] = [])).push(handler);
  }
  public off(type: string, handler: Function): void {
    const listenersOfType = this.listeners[type];
    let index;
    if (!listenersOfType || (index = listenersOfType.indexOf(handler)) === -1) {
      return;
    }

    listenersOfType.splice(index, 1);
  }
  private emit(type: string, event: any) {
    const listenersOfType = this.listeners[type];
    if (!listenersOfType || !listenersOfType.length) return;

    listenersOfType.forEach(handler => handler(event));
  }
  public read(parentNode: Element = document.documentElement) {
    const nodes = this.selector(parentNode);
    const fullState: {[key: string]: IReadState} = {};
    const parentBounds = this.getBounds(parentNode);

    forEach(nodes, (node) => {
      const key = <string>this.getKey(node);
      const bounds = this.bounds[key] = this.getRelativeBounds(parentBounds, this.getBounds(node));
      const animation = this.animations[key];

      debugRect(bounds, key);

      const state: IReadState = {
        key,
        node,
        bounds,
        animation,
      };

      fullState[key] = state;

      this.onRead(state);
    });

    this.emit('read', fullState);
  }
  public flip(parentNode: Element = document.documentElement) {
    const nodes = this.selector(parentNode);
    const fullState: {[key: string]: IFlipState} = {};
    const parentBounds = this.getBounds(parentNode);
    let flipped = false;

    forEach(nodes, (node) => {
      const key = this.getKey(node);
      const first = this.bounds[key];
      const last = this.getRelativeBounds(parentBounds, this.getBounds(node));
      const animation = this.animations[key];

      debugRect(this.getBounds(node), key, 'green');

      console.log(key, first, last);

      // if (!deltaChanged(delta)) return;

      flipped = true;

      const state: IFlipState = {
        key,
        node,
        first,
        last,
        delta: this.getDelta(first, last),
        type: !first ? 'ENTER' : !last ? 'LEAVE' : 'MOVE',
        start: Date.now(),
        animation,
        previous: this.states[key],
      };

      const nextAnimation = this.onFlip(state, () => this.read(parentNode));

      this.states[key] = state;
      fullState[key] = {...state, animation: nextAnimation};
      this.animations[key] = nextAnimation;
    });

    if (flipped) this.emit('flip', fullState);
  }
  public wrap(fn: Function): Function {
    return (...args) => {
      this.read();
      const result = fn(...args);
      this.flip();
      return result;
    }
  }
  static debug = debugRect;
  static rect = rect;
}

export default Flipping;
