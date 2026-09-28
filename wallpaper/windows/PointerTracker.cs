using System.Drawing;

namespace Hearthglass;

public class PointerTracker : IDisposable
{
    private readonly Func<IReadOnlyList<WallpaperWindow>> _windowsProvider;
    private System.Windows.Forms.Timer? _timer;
    private Point _lastPoint = new(-10000, -10000);
    private int _currentRate = 0;

    public PointerTracker(Func<IReadOnlyList<WallpaperWindow>> windowsProvider)
    {
        _windowsProvider = windowsProvider;
    }

    public void UpdateRate(int maxAppliedRate)
    {
        int targetRate = Math.Min(30, maxAppliedRate);
        if (targetRate == _currentRate) return;

        _currentRate = targetRate;
        _timer?.Stop();
        _timer?.Dispose();
        _timer = null;

        if (_currentRate > 0)
        {
            _timer = new System.Windows.Forms.Timer
            {
                Interval = Math.Max(16, 1000 / _currentRate)
            };
            _timer.Tick += OnTick;
            _timer.Start();
        }
        else
        {
            // Inform all windows that pointer is out
            var windows = _windowsProvider();
            foreach (var win in windows)
            {
                win.SetPointerPhysical(null);
            }
        }
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (!NativeMethods.GetCursorPos(out var pt)) return;

        if (Math.Abs(pt.X - _lastPoint.X) < 1 && Math.Abs(pt.Y - _lastPoint.Y) < 1)
        {
            return;
        }

        _lastPoint = new Point(pt.X, pt.Y);
        var windows = _windowsProvider();

        foreach (var win in windows)
        {
            var bounds = win.TargetScreen.Bounds;
            if (bounds.Contains(_lastPoint))
            {
                win.SetPointerPhysical(_lastPoint);
            }
            else
            {
                win.SetPointerPhysical(null);
            }
        }
    }

    public void Dispose()
    {
        _timer?.Stop();
        _timer?.Dispose();
        _timer = null;
    }
}
