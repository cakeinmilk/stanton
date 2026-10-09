/**
 * Windows "AppBar" docking.
 *
 * Registers the Stanton window as a shell AppBar (like the taskbar) so it
 * reserves a strip at the left or right of the screen and maximised windows
 * fit around it. Implemented with koffi calling shell32!SHAppBarMessage, so no
 * native compilation is required. On non-Windows platforms we fall back to
 * snapping the window to the edge of the work area.
 */
import { BrowserWindow, Rectangle, screen } from 'electron';
import { log } from './log';

export type DockEdge = 'left' | 'right';

const ABM_NEW = 0x0;
const ABM_REMOVE = 0x1;
const ABM_QUERYPOS = 0x2;
const ABM_SETPOS = 0x3;
const ABM_ACTIVATE = 0x6;
const ABM_WINDOWPOSCHANGED = 0x9;
const ABE_LEFT = 0;
const ABE_RIGHT = 2;
const ABN_POSCHANGED = 0x1;
const ABN_FULLSCREENAPP = 0x2;
const WM_APP = 0x8000;
const CALLBACK_MSG = WM_APP + 0x51;

interface Native {
  koffi: any;
  SHAppBarMessage: (msg: number, data: any) => number;
}

let native: Native | null | undefined;

function loadNative(): Native | null {
  if (native !== undefined) return native;
  native = null;
  if (process.platform !== 'win32') return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi');
    koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    koffi.struct('APPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'intptr',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: 'RECT',
      lParam: 'intptr',
    });
    const shell32 = koffi.load('shell32.dll');
    const SHAppBarMessage = shell32.func('uintptr __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA *pData)');
    native = { koffi, SHAppBarMessage: (m, d) => Number(SHAppBarMessage(m, d)) };
    log('AppBar native bindings loaded');
  } catch (err) {
    log('AppBar unavailable, falling back to edge snapping', err);
    native = null;
  }
  return native;
}

function hwndOf(win: BrowserWindow): bigint | number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigInt64LE(0) : buf.readInt32LE(0);
}

export class DockController {
  private edge: DockEdge | null = null;
  private registered = false;
  private width = 380;
  private settingBounds = false;
  private hooked = false;

  constructor(private win: BrowserWindow) {
    win.on('resized', () => this.onUserResize());
    win.on('moved', () => {
      if (this.edge && !this.settingBounds) this.reposition();
    });
    win.on('closed', () => this.unregister());
  }

  get dockedEdge(): DockEdge | null {
    return this.edge;
  }

  /** 'appbar' when Windows reserves screen space for us, 'snap' when we only sit at the edge. */
  get mode(): 'appbar' | 'snap' | null {
    if (!this.edge) return null;
    return this.registered ? 'appbar' : 'snap';
  }

  get dockedWidth(): number {
    return this.width;
  }

  dock(edge: DockEdge, width?: number) {
    if (width) this.width = Math.max(260, Math.round(width));
    this.edge = edge;
    const n = loadNative();
    if (n && !this.registered) {
      // cbSize must be set or the shell silently rejects the request.
      const data = this.withSize(this.baseData());
      this.registered = n.SHAppBarMessage(ABM_NEW, data) !== 0;
      log(`AppBar ABM_NEW edge=${edge} cbSize=${data.cbSize} registered=${this.registered}`);
      this.hookMessages();
    }
    this.win.setAlwaysOnTop(true, 'normal');
    this.reposition();
  }

  undock(restore?: Rectangle) {
    this.edge = null;
    this.unregister();
    this.win.setAlwaysOnTop(false);
    if (restore) this.setBounds(restore);
  }

  dispose() {
    this.unregister();
  }

  private baseData(): any {
    return {
      cbSize: 0,
      hWnd: hwndOf(this.win),
      uCallbackMessage: CALLBACK_MSG,
      uEdge: this.edge === 'left' ? ABE_LEFT : ABE_RIGHT,
      rc: { left: 0, top: 0, right: 0, bottom: 0 },
      lParam: 0,
    };
  }

  private withSize(data: any) {
    const n = loadNative()!;
    data.cbSize = n.koffi.sizeof('APPBARDATA');
    return data;
  }

  private hookMessages() {
    if (this.hooked || process.platform !== 'win32') return;
    this.hooked = true;
    const readPtr = (b: Buffer) => (b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0));
    this.win.hookWindowMessage(CALLBACK_MSG, (wParam: Buffer, lParam: Buffer) => {
      const code = readPtr(wParam);
      if (code === ABN_POSCHANGED && this.edge) this.reposition();
      if (code === ABN_FULLSCREENAPP && this.edge) {
        // Let full-screen apps (videos, presentations) cover the dock while
        // they are open; lParam is TRUE when one opens and FALSE when it closes.
        const opening = readPtr(lParam) !== 0;
        this.win.setAlwaysOnTop(!opening, 'normal');
      }
    });
    // Tell the shell when we are activated / moved so it can keep z-order sane.
    this.win.on('focus', () => {
      const n = loadNative();
      if (n && this.registered) n.SHAppBarMessage(ABM_ACTIVATE, this.withSize(this.baseData()));
    });
  }

  private unregister() {
    const n = loadNative();
    if (n && this.registered) {
      try {
        n.SHAppBarMessage(ABM_REMOVE, this.withSize(this.baseData()));
      } catch {
        /* window may already be gone */
      }
    }
    this.registered = false;
  }

  private onUserResize() {
    if (!this.edge || this.settingBounds) return;
    const b = this.win.getBounds();
    this.width = Math.max(260, b.width);
    this.reposition();
  }

  /** Ask the shell for space on our edge and move the window into it. */
  private reposition() {
    if (!this.edge) return;
    const wb = this.win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: Math.round(wb.x + wb.width / 2), y: Math.round(wb.y + wb.height / 2) });
    log(`Docking ${this.edge} on display ${display.id}`, display.bounds, `scale=${display.scaleFactor}`, 'window', wb);
    const n = loadNative();

    if (n && this.registered) {
      // AppBar rectangles are in physical screen pixels. Convert using the *target* display
      // (null = nearest to the rect), not the window's current one: with mixed-DPI monitors
      // the window may still be on a different screen when we dock.
      const phys = screen.dipToScreenRect(null, display.bounds);
      const scale = display.scaleFactor;
      const physWidth = Math.round(this.width * scale);
      const data = this.withSize(this.baseData());
      data.rc = { left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height };
      if (this.edge === 'left') data.rc.right = data.rc.left + physWidth;
      else data.rc.left = data.rc.right - physWidth;

      n.SHAppBarMessage(ABM_QUERYPOS, data);
      // The shell may have moved one edge to avoid other bars (e.g. taskbar);
      // restore our requested width from the anchored side.
      if (this.edge === 'left') data.rc.right = data.rc.left + physWidth;
      else data.rc.left = data.rc.right - physWidth;
      n.SHAppBarMessage(ABM_SETPOS, data);
      log('AppBar SETPOS', data.rc);

      const r = data.rc;
      const dip = screen.screenToDipRect(null, {
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
      });
      this.setBounds(dip);
      n.SHAppBarMessage(ABM_WINDOWPOSCHANGED, this.withSize(this.baseData()));
      return;
    }

    // Fallback: snap to the work area edge.
    const wa = display.workArea;
    const width = Math.min(this.width, wa.width);
    this.setBounds({
      x: this.edge === 'left' ? wa.x : wa.x + wa.width - width,
      y: wa.y,
      width,
      height: wa.height,
    });
  }

  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Move the window and make sure it actually got there. On some setups (seen on an
   * ultrawide monitor) Windows only partly applies a large move, leaving the window
   * short of the edge, so we check and re-apply a few times.
   */
  private setBounds(b: Rectangle, attempt = 0) {
    this.settingBounds = true;
    clearTimeout(this.settleTimer);
    try {
      if (this.win.isMaximized()) this.win.unmaximize();
      if (attempt > 0) {
        // Second try: move and size separately, which Windows applies more reliably.
        this.win.setPosition(b.x, b.y);
        this.win.setSize(b.width, b.height);
      }
      this.win.setBounds(b);
    } catch (err) {
      log('setBounds failed', err);
    }
    this.settleTimer = setTimeout(() => {
      if (this.win.isDestroyed()) return;
      const got = this.win.getBounds();
      const off = Math.abs(got.x - b.x) > 2 || Math.abs(got.y - b.y) > 2 || Math.abs(got.width - b.width) > 2 || Math.abs(got.height - b.height) > 2;
      if (off && attempt < 3) {
        log(`Dock position mismatch (attempt ${attempt + 1}): wanted`, b, 'got', got);
        this.setBounds(b, attempt + 1);
        return;
      }
      if (off) log('Dock position still wrong after retries: wanted', b, 'got', got);
      // 'moved'/'resized' events fire asynchronously; only listen to the user again once settled.
      this.settingBounds = false;
    }, 120);
  }
}
