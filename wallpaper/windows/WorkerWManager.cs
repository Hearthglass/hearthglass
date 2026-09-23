using System.Drawing;

namespace DesktopHabitats;

// Places wallpaper windows between the desktop picture and the desktop icons.
//
// Two shell layouts exist:
//  - Windows 11 24H2 and later ("raised desktop"): Progman hosts SHELLDLL_DefView
//    (the icons) and, after message 0x052C, a WorkerW child that paints the picture.
//    Our window becomes a layered child of Progman, ordered below the icons and
//    above that WorkerW.
//  - Earlier Windows 10/11: 0x052C splits the desktop into a top-level WorkerW
//    holding the icons and a second top-level WorkerW behind it. Our window
//    becomes a child of that second WorkerW.
public class WorkerWManager
{
    private IntPtr _progman = IntPtr.Zero;
    private IntPtr _defView = IntPtr.Zero;
    private IntPtr _workerW = IntPtr.Zero;
    private bool _raised;
    private bool _found;

    public bool IsAttached => _found;
    public IntPtr Progman => _progman;
    public IntPtr DefView => _defView;
    public IntPtr WorkerW => _workerW;

    private bool Find()
    {
        if (_found && NativeMethods.IsWindow(_progman) && NativeMethods.IsWindow(_workerW)) return true;
        _found = false;

        _progman = NativeMethods.FindWindow("Progman", null);
        if (_progman == IntPtr.Zero)
        {
            Logger.Error("[WorkerWManager] Progman window not found.");
            return false;
        }

        // 0xD/0x1 asks newer shells for the raised layout; (0,0) is the classic form.
        NativeMethods.SendMessageTimeout(_progman, NativeMethods.WM_SPAWN_WORKER, new UIntPtr(0xD), new IntPtr(1),
            NativeMethods.SMTO_NORMAL, 1000, out _);
        NativeMethods.SendMessageTimeout(_progman, NativeMethods.WM_SPAWN_WORKER, UIntPtr.Zero, IntPtr.Zero,
            NativeMethods.SMTO_NORMAL, 1000, out _);

        _defView = NativeMethods.FindWindowEx(_progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (_defView != IntPtr.Zero)
        {
            _raised = true;
            _workerW = NativeMethods.FindWindowEx(_progman, IntPtr.Zero, "WorkerW", null);
        }
        else
        {
            _raised = false;
            _workerW = IntPtr.Zero;
            NativeMethods.EnumWindows((top, _) =>
            {
                var view = NativeMethods.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (view == IntPtr.Zero) return true;
                _defView = view;
                _workerW = NativeMethods.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return false;
            }, IntPtr.Zero);
        }

        _found = _raised || _workerW != IntPtr.Zero;
        Logger.Info($"[WorkerWManager] Layout: {(_raised ? "raised (24H2+)" : "classic")}, Progman 0x{_progman:X}, " +
                    $"DefView 0x{_defView:X}, WorkerW 0x{_workerW:X}, attached: {_found}");
        return _found;
    }

    public void AttachWindow(IntPtr child, Rectangle screenBounds)
    {
        if (!Find()) return;

        IntPtr parent = _raised ? _progman : _workerW;

        // Child style so the window is clipped and positioned in the parent's client space.
        long style = NativeMethods.GetWindowLongPtr(child, NativeMethods.GWL_STYLE).ToInt64();
        style = (style & ~(NativeMethods.WS_POPUP | NativeMethods.WS_CAPTION | NativeMethods.WS_THICKFRAME)) | NativeMethods.WS_CHILD;
        NativeMethods.SetWindowLongPtr(child, NativeMethods.GWL_STYLE, new IntPtr(style));

        if (_raised)
        {
            // Progman is composited without a redirection bitmap; a plain child would not
            // show up. A fully opaque layered child does.
            long ex = NativeMethods.GetWindowLongPtr(child, NativeMethods.GWL_EXSTYLE).ToInt64();
            NativeMethods.SetWindowLongPtr(child, NativeMethods.GWL_EXSTYLE, new IntPtr(ex | NativeMethods.WS_EX_LAYERED));
            NativeMethods.SetLayeredWindowAttributes(child, 0, 255, NativeMethods.LWA_ALPHA);
        }

        NativeMethods.SetParent(child, parent);

        // Screen coordinates to parent client coordinates.
        var origin = new NativeMethods.POINT { X = 0, Y = 0 };
        NativeMethods.ClientToScreen(parent, ref origin);
        int x = screenBounds.Left - origin.X;
        int y = screenBounds.Top - origin.Y;

        // In the raised layout insert directly after DefView, so icons stay on top.
        IntPtr after = _raised ? _defView : NativeMethods.HWND_TOP;
        NativeMethods.SetWindowPos(child, after, x, y, screenBounds.Width, screenBounds.Height,
            NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW | NativeMethods.SWP_FRAMECHANGED);

        if (_raised && _workerW != IntPtr.Zero)
        {
            // Keep the picture-painting WorkerW underneath us.
            NativeMethods.SetWindowPos(_workerW, NativeMethods.HWND_BOTTOM, 0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE);
        }

        Logger.Info($"[WorkerWManager] Attached 0x{child:X} to 0x{parent:X} at [{x},{y} {screenBounds.Width}x{screenBounds.Height}]");
    }

    public void Reset()
    {
        _progman = _defView = _workerW = IntPtr.Zero;
        _raised = false;
        _found = false;
    }
}
