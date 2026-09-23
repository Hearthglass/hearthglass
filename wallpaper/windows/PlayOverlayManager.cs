using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DesktopHabitats;

public sealed class PlayOverlayManager : IDisposable
{
    private readonly Func<IReadOnlyList<WallpaperWindow>> _windowsProvider;
    private readonly Action<bool> _onStateChanged;
    private readonly List<PlayOverlayForm> _overlays = new();
    private readonly System.Windows.Forms.Timer _idleTimer;
    private readonly Func<bool> _addFishMode;
    private int _idleSeconds = 0;
    private bool _isActive = false;

    public bool IsActive => _isActive;
    public bool AddFishMode => _addFishMode();
    public DragGesture Drag { get; }

    public PlayOverlayManager(Func<IReadOnlyList<WallpaperWindow>> windowsProvider, Action<bool> onStateChanged, Func<bool> addFishMode)
    {
        _windowsProvider = windowsProvider;
        _onStateChanged = onStateChanged;
        _addFishMode = addFishMode;
        Drag = new DragGesture(windowsProvider);

        _idleTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _idleTimer.Tick += OnIdleTick;
    }

    public void Toggle()
    {
        if (_isActive)
        {
            Exit();
        }
        else
        {
            Enter();
        }
    }

    public void Enter()
    {
        if (_isActive) return;
        _isActive = true;
        _idleSeconds = 0;

        var windows = _windowsProvider();
        foreach (var win in windows)
        {
            win.SetPlayMode(true);
            var overlay = new PlayOverlayForm(this, win);
            _overlays.Add(overlay);
            overlay.Show();
        }

        _idleTimer.Start();
        _onStateChanged(true);
        Logger.Info("[PlayMode] Entered Play Mode.");
    }

    public void Exit()
    {
        if (!_isActive) return;
        _isActive = false;
        _idleTimer.Stop();
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
        Logger.Info("[PlayMode] Exited Play Mode.");
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
            Logger.Info("[PlayMode] Exited due to 60s idle timeout.");
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
    }
}

internal sealed class PlayOverlayForm : Form
{
    private readonly PlayOverlayManager _manager;
    private readonly WallpaperWindow _window;
    private readonly PlayHintBannerForm _hintBanner;
    private readonly PlaySelectionBoxForm _selectionBox;

    private bool _isMouseDown = false;
    private bool _hasDragged = false;
    private Point _dragStart = Point.Empty;

    public PlayOverlayForm(PlayOverlayManager manager, WallpaperWindow window)
    {
        _manager = manager;
        _window = window;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = window.TargetScreen.Bounds;
        BackColor = Color.Black;

        _hintBanner = new PlayHintBannerForm(window.TargetScreen, () => manager.AddFishMode);
        _selectionBox = new PlaySelectionBoxForm();
        // The marquee is only drawn once the tank has said the drag is a selection.
        _manager.Drag.ModeResolved += OnDragModeResolved;
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
        _hintBanner.Show();
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
            _isMouseDown = false;
            var currentPoint = Cursor.Position;
            var targetWin = _manager.FindWindowForPoint(currentPoint) ?? _window;

            if (_hasDragged)
            {
                // Finished selecting fish, or put down the group being moved.
                _selectionBox.HideMarquee();
                _manager.Drag.End(currentPoint);
            }
            else if (_manager.AddFishMode)
            {
                targetWin.AddFishPhysical(currentPoint);
            }
            else
            {
                // Click on empty water without dragging clears selection
                foreach (var win in _manager.Windows) win.ClearSelection();
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
            _manager.Drag.ModeResolved -= OnDragModeResolved;
            _hintBanner.Close();
            _hintBanner.Dispose();
            _selectionBox.Close();
            _selectionBox.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal sealed class PlayHintBannerForm : Form
{
    private readonly Func<bool> _addFishMode;
    private string HintText => _addFishMode()
        ? "Play mode — click to add a fish, drag to select, drag a selected fish to move them all, right-click to feed, Esc to exit"
        : "Play mode — drag to select fish, then drag one of them to move them all, right-click to feed, Esc to exit";

    public PlayHintBannerForm(Screen screen, Func<bool> addFishMode)
    {
        _addFishMode = addFishMode;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;

        int width = 820;
        int height = 36;
        int x = screen.Bounds.Left + (screen.Bounds.Width - width) / 2;
        int y = screen.Bounds.Top + 24;
        Bounds = new Rectangle(x, y, width, height);

        BackColor = Color.FromArgb(20, 24, 30);
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
        // Alpha 230: sleek translucent pill
        NativeMethods.SetLayeredWindowAttributes(Handle, 0, 230, NativeMethods.LWA_ALPHA);
        NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
            NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = GetRoundedRectanglePath(rect, 16);
        using var fillBrush = new SolidBrush(Color.FromArgb(28, 34, 44));
        e.Graphics.FillPath(fillBrush, path);

        using var borderPen = new Pen(Color.FromArgb(80, 255, 255, 255), 1);
        e.Graphics.DrawPath(borderPen, path);

        using var font = new Font("Segoe UI", 9.5f, FontStyle.Regular, GraphicsUnit.Point);
        using var textBrush = new SolidBrush(Color.FromArgb(235, 240, 245));
        using var sf = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };

        e.Graphics.DrawString(HintText, font, textBrush, rect, sf);
    }

    private static GraphicsPath GetRoundedRectanglePath(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
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
