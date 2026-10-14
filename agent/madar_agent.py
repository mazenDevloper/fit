"""
Madar Agent — lets Madar on the phone (inside the headset) operate this computer while its screen
is shared from Madar in Chrome/Edge: mouse moves and clicks, scrolling, typing and a few keys.

It listens only on this computer (127.0.0.1:8788) and only accepts the Madar web page
(https://mazendevloper.github.io). Close this window to stop it.
"""
import asyncio
import json
import platform
import sys

SYSTEM = platform.system()
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
if SYSTEM == "Windows":
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    except Exception:
        pass
    # Physical pixels, so positions match what Chrome captures on scaled (125%/150%) screens.
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

import mss
from pynput.keyboard import Controller as Keyboard, Key
from pynput.mouse import Button, Controller as Mouse
from websockets.asyncio.server import serve

PORT = 8788
ORIGINS = ["https://mazendevloper.github.io"]
mouse = Mouse()
keyboard = Keyboard()


def monitors():
    with mss.mss() as s:
        return [dict(m) for m in s.monitors[1:]] or [dict(s.monitors[0])]


class Session:
    def __init__(self):
        self.mons = monitors()
        self.mon = self.mons[0]
        self.frame = (0, 0)
        self.scroll_acc = [0.0, 0.0]

    def pick(self, fw, fh):
        """Choose the monitor whose shape matches the shared picture."""
        if not fw or not fh or (fw, fh) == self.frame:
            return
        self.frame = (fw, fh)
        self.mons = monitors()
        ar = fw / fh

        def score(m):
            mar = m["width"] / m["height"]
            size = abs(m["width"] - fw) / max(fw, 1)
            return abs(mar - ar) * 10 + min(size, abs(m["width"] * 2 - fw) / max(fw, 1))

        self.mon = min(self.mons, key=score)
        print(f"  الشاشة المشارَكة: {self.mon['width']}x{self.mon['height']} عند ({self.mon['left']},{self.mon['top']})")

    def at(self, x, y):
        m = self.mon
        x = min(max(float(x), 0.0), 0.999)
        y = min(max(float(y), 0.0), 0.999)
        return (m["left"] + x * m["width"], m["top"] + y * m["height"])

    def handle(self, d):
        self.pick(d.get("fw"), d.get("fh"))
        a = d.get("a")
        if a in ("move", "tap", "down", "up", "right", "double"):
            mouse.position = self.at(d.get("x", 0.5), d.get("y", 0.5))
        if a == "tap":
            mouse.click(Button.left, 1)
        elif a == "double":
            mouse.click(Button.left, 2)
        elif a == "right":
            mouse.click(Button.right, 1)
        elif a == "down":
            mouse.press(Button.left)
        elif a == "up":
            mouse.release(Button.left)
        elif a == "scroll":
            mouse.position = self.at(d.get("x", 0.5), d.get("y", 0.5))
            # Picture fraction -> pixels -> wheel notches (about 100 px each).
            self.scroll_acc[0] += float(d.get("dx", 0)) * self.mon["width"] / 100.0
            self.scroll_acc[1] += float(d.get("dy", 0)) * self.mon["height"] / 100.0
            sx, sy = int(self.scroll_acc[0]), int(self.scroll_acc[1])
            if sx or sy:
                self.scroll_acc[0] -= sx
                self.scroll_acc[1] -= sy
                mouse.scroll(sx, -sy)
        elif a == "text":
            keyboard.type(str(d.get("value", "")))
        elif a == "key":
            self.key(d.get("key"))

    def key(self, k):
        if k == "back":
            if SYSTEM == "Darwin":
                with keyboard.pressed(Key.cmd):
                    keyboard.tap("[")
            else:
                with keyboard.pressed(Key.alt):
                    keyboard.tap(Key.left)
        elif k == "home":
            if SYSTEM == "Darwin":
                with keyboard.pressed(Key.ctrl):   # Mission Control
                    keyboard.tap(Key.up)
            else:
                keyboard.tap(Key.cmd)  # Windows key: Start menu
        elif k in ("enter", "backspace", "esc", "tab", "space"):
            keyboard.tap({"enter": Key.enter, "backspace": Key.backspace, "esc": Key.esc, "tab": Key.tab, "space": Key.space}[k])


async def handler(ws):
    s = Session()
    print("✓ مدار متصل — يمكن التحكم بهذا الجهاز الآن")
    try:
        async for msg in ws:
            try:
                s.handle(json.loads(msg))
            except Exception as e:  # keep going on bad input
                print("  خطأ:", e)
    finally:
        print("— انقطع مدار")


async def main():
    print("Madar Agent يعمل. اترك هذه النافذة مفتوحة، ثم شارك الشاشة كاملة من مدار في Chrome أو Edge.")
    if SYSTEM == "Darwin":
        print("على Mac: اسمح للبرنامج من الإعدادات ← الخصوصية والأمان ← تسهيلات الاستخدام.")
    async with serve(handler, "127.0.0.1", PORT, origins=ORIGINS) as server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except OSError:
        print("المنفذ 8788 مستخدم — ربما Madar Agent يعمل بالفعل.")
        input("اضغط Enter للإغلاق")
    except KeyboardInterrupt:
        sys.exit(0)
