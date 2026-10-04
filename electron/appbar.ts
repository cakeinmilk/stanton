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
  } catch (err) {
    console.error('[stanton] AppBar unavailable, falling back to edge snapping', err);
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

  get dockedWidth(): number {
    return this.width;
  }

  dock(edge: DockEdge, width?: number) {
    if (width) this.width = Math.max(260, Math.round(width));
    this.edge = edge;
    const n = loadNative();
    if (n && !this.registered) {
      const data = this.baseData();
      this.registered = n.SHAppBarMessage(ABM_NEW, data) !== 0;
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
    const display = screen.getDisplayMatching(this.win.getBounds());
    const n = loadNative();

    if (n && this.registered) {
      // AppBar rectangles are in physical screen pixels.
      const phys = screen.dipToScreenRect(this.win, display.bounds);
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

      const r = data.rc;
      const dip = screen.screenToDipRect(this.win, {
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

  private setBounds(b: Rectangle) {
    this.settingBounds = true;
    try {
      this.win.setBounds(b);
    } finally {
      // 'moved'/'resized' events fire asynchronously on some platforms.
      setTimeout(() => (this.settingBounds = false), 150);
    }
  }
}
