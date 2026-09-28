using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Hearthglass;

// A dock tool that takes the whole screen (herding fish, the wand, the hand): an invisible
// layer over every screen's working area catches the mouse and hands it to the tool, until
// Esc, the tool is put down in the dock, or a minute goes by untouched.
public sealed class PlayOverlayManager : IDisposable
{
    private readonly Func<IReadOnlyList<WallpaperWindow>> _windowsProvider;
    private readonly Action<bool> _onStateChanged;
    private readonly List<PlayOverlayForm> _overlays = new();
    private readonly System.Windows.Forms.Timer _idleTimer;
    private int _idleSeconds = 0;
    private bool _isActive = false;

    public bool IsActive => _isActive;
    // The tool in hand while active.
    public string Tool { get; private set; } = "";
    public DragGesture Drag { get; }

    public PlayOverlayManager(Func<IReadOnlyList<WallpaperWindow>> windowsProvider, Action<bool> onStateChanged)
    {
        _windowsProvider = windowsProvider;
        _onStateChanged = onStateChanged;
        Drag = new DragGesture(windowsProvider);

        _idleTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _idleTimer.Tick += OnIdleTick;

        // The overlays never take focus, so Esc is watched directly as well as through the
        // global hotkey, which can fail if another app already owns a bare Esc.
        _escTimer = new System.Windows.Forms.Timer { Interval = 50 };
        _escTimer.Tick += (_, _) =>
        {
            if ((NativeMethods.GetAsyncKeyState((int)NativeMethods.VK_ESCAPE) & 0x8000) != 0) Exit();
        };
    }

    private readonly System.Windows.Forms.Timer _escTimer;

    public void Enter(string tool)
    {
        if (_isActive && Tool == tool) return;
        if (_isActive) Exit();
        _isActive = true;
        _idleSeconds = 0;
        Tool = tool;
        Drag.Tool = tool;

        var windows = _windowsProvider();
        foreach (var win in windows)
        {
            win.SetPlayMode(true);
            var overlay = new PlayOverlayForm(this, win);
            _overlays.Add(overlay);
            overlay.Show();
        }

        _idleTimer.Start();
        _escTimer.Start();
        _onStateChanged(true);
        Logger.Info($"[Overlay] Took the screen for the {tool} tool.");
    }

    public void Exit()
    {
        if (!_isActive) return;
        _isActive = false;
        _idleTimer.Stop();
        _escTimer.Stop();
        Drag.Cancel();

        foreach (var overlay in _overlays)
        {
            overlay.Close();
            overlay.Dispose();
        }
        _overlays.Clear();

        var windows = _windowsProvider();
        foreach (var win in windows)
        {
            win.SetPlayMode(false);
            win.ClearSelection();
        }

        _onStateChanged(false);
        Logger.Info("[Overlay] Gave the screen back.");
    }

    public void ResetIdle()
    {
        _idleSeconds = 0;
    }

    private void OnIdleTick(object? sender, EventArgs e)
    {
        if (!_isActive) return;
        _idleSeconds++;
        if (_idleSeconds >= 60)
        {
            Logger.Info("[Overlay] Put the tool down after a minute untouched.");
            Exit();
        }
    }

    public IReadOnlyList<WallpaperWindow> Windows => _windowsProvider();

    public WallpaperWindow? FindWindowForPoint(Point pt)
    {
        var windows = _windowsProvider();
        foreach (var win in windows)
        {
            if (win.TargetScreen.Bounds.Contains(pt))
            {
                return win;
            }
        }
        return null;
    }

    public void Dispose()
    {
        Exit();
        _idleTimer.Dispose();
        _escTimer.Dispose();
    }
}

internal sealed class PlayOverlayForm : Form
{
    private readonly PlayOverlayManager _manager;
    private readonly WallpaperWindow _window;
    private readonly PlaySelectionBoxForm _selectionBox;

    private bool _isMouseDown = false;
    private bool _hasDragged = false;
    private Point _dragStart = Point.Empty;
    // A press held still becomes a drag where it is, so a scene can take a long press
    // (the wizard charging a spell, hand-feeding the reef) without the pointer moving.
    private readonly System.Windows.Forms.Timer _holdTimer = new() { Interval = 240 };

    public PlayOverlayForm(PlayOverlayManager manager, WallpaperWindow window)
    {
        _manager = manager;
        _window = window;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        // The working area, not the whole screen: the taskbar and tray stay usable, so there
        // is always a way out with the mouse.
        Bounds = window.TargetScreen.WorkingArea;
        BackColor = Color.Black;

        _selectionBox = new PlaySelectionBoxForm();
        // The marquee is only drawn once the tank has said the drag is a selection.
        _manager.Drag.ModeResolved += OnDragModeResolved;
        _holdTimer.Tick += OnHoldTimer;
    }

    private void OnHoldTimer(object? sender, EventArgs e)
    {
        _holdTimer.Stop();
        if (!_isMouseDown || _hasDragged) return;
        _hasDragged = true;
        _manager.Drag.Begin(_dragStart, Cursor.Position);
    }

    private void OnDragModeResolved(string mode)
    {
        if (mode == "select" && _isMouseDown && _hasDragged &&
            _window.TargetScreen.Bounds.Contains(_dragStart))
            _selectionBox.UpdateMarquee(_dragStart, Cursor.Position);
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= NativeMethods.WS_EX_LAYERED
                        | NativeMethods.WS_EX_TOOLWINDOW
                        | NativeMethods.WS_EX_NOACTIVATE
                        | NativeMethods.WS_EX_TOPMOST;
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Alpha = 1: invisible, but captures all mouse events over the desktop
        NativeMethods.SetLayeredWindowAttributes(Handle, 0, 1, NativeMethods.LWA_ALPHA);
        NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
            NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        _selectionBox.Show();
        _selectionBox.Hide();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        _manager.ResetIdle();

        if (e.Button == MouseButtons.Right)
        {
            var targetWin = _manager.FindWindowForPoint(Cursor.Position) ?? _window;
            targetWin.ClickPhysical(Cursor.Position);
            return;
        }

        if (e.Button == MouseButtons.Left)
        {
            _isMouseDown = true;
            _hasDragged = false;
            _dragStart = Cursor.Position;
            _holdTimer.Stop();
            _holdTimer.Start();
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        _manager.ResetIdle();

        var currentPoint = Cursor.Position;
        var targetWin = _manager.FindWindowForPoint(currentPoint) ?? _window;
        targetWin.SetPointerPhysical(currentPoint);

        if (_isMouseDown)
        {
            int dx = Math.Abs(currentPoint.X - _dragStart.X);
            int dy = Math.Abs(currentPoint.Y - _dragStart.Y);
            if (!_hasDragged && (dx > 4 || dy > 4))
            {
                _holdTimer.Stop();
                _hasDragged = true;
                _manager.Drag.Begin(_dragStart, currentPoint);
            }
            else if (_hasDragged)
            {
                if (_manager.Drag.Mode == "select") _selectionBox.UpdateMarquee(_dragStart, currentPoint);
                _manager.Drag.Move(currentPoint);
            }
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        _manager.ResetIdle();

        if (e.Button == MouseButtons.Left && _isMouseDown)
        {
            _holdTimer.Stop();
            _isMouseDown = false;
            var currentPoint = Cursor.Position;
            var targetWin = _manager.FindWindowForPoint(currentPoint) ?? _window;

            if (_hasDragged)
            {
                // Finished selecting fish, or put down the group being moved.
                _selectionBox.HideMarquee();
                _manager.Drag.End(currentPoint);
            }
            else
            {
                // A click: the tool decides (herding fish, it lets go of the ones selected).
                targetWin.UseTap(_manager.Tool, currentPoint);
            }
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Escape)
        {
            _manager.Exit();
            return;
        }
        base.OnKeyDown(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _holdTimer.Stop();
            _holdTimer.Dispose();
            _manager.Drag.ModeResolved -= OnDragModeResolved;
            _selectionBox.Close();
            _selectionBox.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal sealed class PlaySelectionBoxForm : Form
{
    public PlaySelectionBoxForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = new Rectangle(0, 0, 1, 1);
        BackColor = Color.FromArgb(40, 120, 220);
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= NativeMethods.WS_EX_LAYERED
                        | NativeMethods.WS_EX_TRANSPARENT
                        | NativeMethods.WS_EX_TOOLWINDOW
                        | NativeMethods.WS_EX_NOACTIVATE
                        | NativeMethods.WS_EX_TOPMOST;
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        NativeMethods.SetLayeredWindowAttributes(Handle, 0, 180, NativeMethods.LWA_ALPHA);
    }

    public void UpdateMarquee(Point start, Point current)
    {
        int minX = Math.Min(start.X, current.X);
        int maxX = Math.Max(start.X, current.X);
        int minY = Math.Min(start.Y, current.Y);
        int maxY = Math.Max(start.Y, current.Y);

        int width = Math.Max(2, maxX - minX);
        int height = Math.Max(2, maxY - minY);

        SetBounds(minX, minY, width, height);

        if (!Visible)
        {
            NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, minX, minY, width, height,
                NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
            Visible = true;
        }
        Invalidate();
    }

    public void HideMarquee()
    {
        Visible = false;
        NativeMethods.ShowWindow(Handle, 0); // SW_HIDE
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.None;
        using var pen = new Pen(Color.FromArgb(120, 190, 255), 1.5f);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
    }
}
