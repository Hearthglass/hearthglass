using System.Drawing;

namespace DesktopHabitats;

// One drag over the tanks. The tank under the press decides what the drag is for: begun on
// the fish it is holding selected it picks them up and carries them ("herd"), anywhere else
// it draws a marquee ("select"). A marquee may span monitors, so every other tank is told
// about it too; a carried group belongs to the tank it was picked up in.
public sealed class DragGesture
{
    private readonly Func<IReadOnlyList<WallpaperWindow>> _windowsProvider;
    private WallpaperWindow? _owner;
    private Point _start;
    private int _token;
    private long _lastMove;

    public bool IsActive { get; private set; }
    // "pending" until the tank has answered, then "herd" or "select".
    public string Mode { get; private set; } = "pending";
    public event Action<string>? ModeResolved;

    public DragGesture(Func<IReadOnlyList<WallpaperWindow>> windowsProvider)
    {
        _windowsProvider = windowsProvider;
    }

    public async void Begin(Point start, Point current)
    {
        Cancel();
        IsActive = true;
        Mode = "pending";
        _start = start;
        int token = ++_token;
        var windows = _windowsProvider();
        _owner = windows.FirstOrDefault(w => w.TargetScreen.Bounds.Contains(start));
        var answer = _owner == null ? "none" : await _owner.BeginDragPhysical(start, current);
        // A drag that ended or was replaced while the tank was answering is already over.
        if (token != _token || !IsActive) return;
        if (answer == "herd")
        {
            Mode = "herd";
        }
        else
        {
            Mode = "select";
            foreach (var win in windows)
                if (win != _owner) _ = win.BeginDragPhysical(start, current);
        }
        ModeResolved?.Invoke(Mode);
    }

    // Throttled to about 30 Hz.
    public void Move(Point current)
    {
        if (!IsActive) return;
        long now = Environment.TickCount64;
        if (now - _lastMove < 33) return;
        _lastMove = now;
        if (Mode == "select")
        {
            foreach (var win in _windowsProvider()) win.DragPhysical("move", _start, current);
        }
        else
        {
            _owner?.DragPhysical("move", _start, current);
        }
    }

    public void End(Point current) => Finish("end", current);

    public void Cancel() => Finish("cancel", _start);

    private void Finish(string phase, Point current)
    {
        if (!IsActive) return;
        IsActive = false;
        _token++;
        // A tank that never started this drag ignores the ending.
        foreach (var win in _windowsProvider()) win.DragPhysical(phase, _start, current);
        _owner = null;
    }
}
