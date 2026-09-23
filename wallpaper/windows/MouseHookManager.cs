using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Automation;

namespace DesktopHabitats;

public class MouseHookManager : IDisposable
{
    private readonly Func<IntPtr> _defViewProvider;
    private SynchronizationContext? _syncContext;
    private readonly NativeMethods.HookProc _hookProc;
    private IntPtr _hookHandle = IntPtr.Zero;
    private Thread? _hookThread;
    private uint _hookThreadId;

    // Written by the UI thread, read by the hook thread: moves are only worth posting
    // while a left button gesture is in progress.
    private volatile bool _tracking;

    // Rate limiting: 400ms cooldown, max 5 feeds per 5 seconds
    private readonly Queue<long> _feedTimestamps = new();
    private long _lastFeedTime = 0;

    // Double-click rejection
    private long _lastClickTime = 0;
    private Point _lastClickPoint = new(-10000, -10000);

    // Gesture tracking
    private bool _isButtonDown = false;
    private Point _downPoint = Point.Empty;
    private long _downTime = 0;
    private Task<bool>? _downIsEmptyDesktop;
    private bool _isDragging = false;

    // Callbacks
    public event Action<Point>? OnEmptyDesktopClick;
    public event Action<Point, Point>? OnDragMove; // startPoint, currentPoint
    public event Action<Point, Point>? OnDragEnd;  // startPoint, endPoint

    public bool IsInstalled => _hookThread != null;

    // Adding fish by clicking: every click counts, quickly, double clicks included. Feeding
    // keeps its cooldown so a burst of clicks does not flood the tank with pellets.
    public bool RapidClicks { get; set; }

    public MouseHookManager(Func<IntPtr> defViewProvider)
    {
        _defViewProvider = defViewProvider;
        _hookProc = HookCallback;
    }

    // The hook lives on its own thread with its own message loop. Windows calls a low-level
    // hook on the installing thread, and if that thread is busy (WebView2 work, UI Automation
    // calls into Explorer) every mouse movement on the system waits for it, or the hook is
    // silently dropped after LowLevelHooksTimeout.
    public void Install()
    {
        if (_hookThread != null) return;

        // Events are handed back to the UI thread. Captured here rather than in the
        // constructor, which runs before WinForms has installed its context.
        _syncContext = SynchronizationContext.Current;
        if (_syncContext == null)
        {
            Logger.Error("[Hook] No UI synchronization context; mouse hook not installed.");
            return;
        }

        using var ready = new ManualResetEventSlim();
        _hookThread = new Thread(() =>
        {
            _hookThreadId = NativeMethods.GetCurrentThreadId();
            _hookHandle = NativeMethods.SetWindowsHookEx(NativeMethods.WH_MOUSE_LL, _hookProc,
                NativeMethods.GetModuleHandle(null), 0);
            if (_hookHandle == IntPtr.Zero)
                Logger.Error($"[Hook] Failed to install mouse hook: error {Marshal.GetLastWin32Error()}");
            ready.Set();
            if (_hookHandle == IntPtr.Zero) return;

            while (NativeMethods.GetMessage(out _, IntPtr.Zero, 0, 0) > 0) { }

            NativeMethods.UnhookWindowsHookEx(_hookHandle);
            _hookHandle = IntPtr.Zero;
        })
        {
            IsBackground = true,
            Name = "DesktopHabitats mouse hook"
        };
        _hookThread.Start();
        ready.Wait();

        if (_hookHandle != IntPtr.Zero)
        {
            Logger.Info("[Hook] Mouse hook installed.");
        }
        else
        {
            _hookThread = null;
        }
    }

    public void Uninstall()
    {
        if (_hookThread == null) return;

        NativeMethods.PostThreadMessage(_hookThreadId, NativeMethods.WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
        _hookThread.Join(1000);
        _hookThread = null;
        _isButtonDown = false;
        _isDragging = false;
        _tracking = false;
        _downIsEmptyDesktop = null;
        Logger.Info("[Hook] Mouse hook uninstalled.");
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            // Injected input (remote desktop, KVM and input-sharing tools, automation) is
            // kept: the hook only watches, and those are real users too.
            var hookStruct = Marshal.PtrToStructure<NativeMethods.MSLLHOOKSTRUCT>(lParam);
            int msg = wParam.ToInt32();
            if (msg is NativeMethods.WM_LBUTTONDOWN or NativeMethods.WM_LBUTTONUP ||
                (msg == NativeMethods.WM_MOUSEMOVE && _tracking))
            {
                var pt = new Point(hookStruct.pt.X, hookStruct.pt.Y);
                if (msg == NativeMethods.WM_LBUTTONDOWN) _tracking = true;
                _syncContext?.Post(_ => ProcessMouseEvent(msg, pt), null);
            }
        }

        return NativeMethods.CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    private void ProcessMouseEvent(int msg, Point pt)
    {
        long now = Environment.TickCount64;

        if (msg == NativeMethods.WM_LBUTTONDOWN)
        {
            _isButtonDown = true;
            _downPoint = pt;
            _downTime = now;
            _isDragging = false;

            // The window test is cheap; the icon test asks Explorer through UI Automation and
            // runs off the UI thread. The gesture uses the answer once it has arrived.
            bool desktop = IsDesktopWindow(pt);
            _downIsEmptyDesktop = desktop
                ? Task.Run(() => HasNoIconAt(pt))
                : Task.FromResult(false);
            if (desktop) Logger.Info($"[Hook] Press on the desktop at {pt}");
        }
        else if (msg == NativeMethods.WM_MOUSEMOVE)
        {
            if (_isButtonDown && IsResolvedEmpty())
            {
                int dx = pt.X - _downPoint.X;
                int dy = pt.Y - _downPoint.Y;
                if (!_isDragging && (dx * dx + dy * dy >= 25 || now - _downTime >= 350))
                {
                    _isDragging = true;
                }

                if (_isDragging)
                {
                    OnDragMove?.Invoke(_downPoint, pt);
                }
            }
        }
        else if (msg == NativeMethods.WM_LBUTTONUP)
        {
            _tracking = false;
            if (_isButtonDown)
            {
                _isButtonDown = false;

                int dx = pt.X - _downPoint.X;
                int dy = pt.Y - _downPoint.Y;
                bool isClick = !_isDragging && now - _downTime < 350 && dx * dx + dy * dy < 25;
                var emptyCheck = _downIsEmptyDesktop;

                if (isClick && emptyCheck is { IsCompleted: false })
                {
                    // A quick click can beat Explorer's answer; the click waits for it.
                    emptyCheck.ContinueWith(t =>
                    {
                        if (t.IsCompletedSuccessfully && t.Result) HandleClick(pt, Environment.TickCount64);
                    }, TaskScheduler.FromCurrentSynchronizationContext());
                }
                else if (IsResolvedEmpty())
                {
                    if (isClick)
                    {
                        HandleClick(pt, now);
                    }
                    else if (_isDragging)
                    {
                        Logger.Info($"[Hook] Desktop drag {_downPoint} -> {pt}");
                        OnDragEnd?.Invoke(_downPoint, pt);
                    }
                }
                _isDragging = false;
                _downIsEmptyDesktop = null;
            }
        }
    }

    private void HandleClick(Point pt, long now)
    {
        if (RapidClicks)
        {
            if (now - _lastFeedTime < 60) return;
            _lastFeedTime = now;
            OnEmptyDesktopClick?.Invoke(pt);
            return;
        }

        // Check for double click: within double click time and double click bounding box
        int ddx = pt.X - _lastClickPoint.X;
        int ddy = pt.Y - _lastClickPoint.Y;
        if (now - _lastClickTime <= SystemInformation.DoubleClickTime &&
            Math.Abs(ddx) <= SystemInformation.DoubleClickSize.Width &&
            Math.Abs(ddy) <= SystemInformation.DoubleClickSize.Height)
        {
            // Double click: do not feed!
            _lastClickTime = 0;
            return;
        }

        _lastClickTime = now;
        _lastClickPoint = pt;

        // Rate limit: 400ms cooldown and max 5 feeds per 5000ms
        if (!CheckRateLimit(now))
        {
            return;
        }

        OnEmptyDesktopClick?.Invoke(pt);
    }

    private bool CheckRateLimit(long now)
    {
        if (now - _lastFeedTime < 400) return false;

        while (_feedTimestamps.Count > 0 && now - _feedTimestamps.Peek() > 5000)
        {
            _feedTimestamps.Dequeue();
        }

        if (_feedTimestamps.Count >= 5) return false;

        _lastFeedTime = now;
        _feedTimestamps.Enqueue(now);
        return true;
    }

    // A click that lands before Explorer has answered (it normally takes a few ms) is not
    // counted rather than held up.
    private bool IsResolvedEmpty() =>
        _downIsEmptyDesktop is { IsCompletedSuccessfully: true, Result: true };

    private bool IsDesktopWindow(Point physPoint)
    {
        IntPtr defView = _defViewProvider();
        if (defView == IntPtr.Zero) return false;

        IntPtr wnd = NativeMethods.WindowFromPoint(new NativeMethods.POINT { X = physPoint.X, Y = physPoint.Y });
        if (wnd == IntPtr.Zero) return false;
        if (wnd == defView) return true;
        if (NativeMethods.GetParent(wnd) != defView) return false;

        var sb = new System.Text.StringBuilder(64);
        NativeMethods.GetClassName(wnd, sb, sb.Capacity);
        return sb.ToString().Equals("SysListView32", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasNoIconAt(Point physPoint)
    {
        try
        {
            var element = AutomationElement.FromPoint(new System.Windows.Point(physPoint.X, physPoint.Y));
            for (int depth = 0; element != null && element != AutomationElement.RootElement && depth < 5; depth++)
            {
                if (element.Current.ControlType == ControlType.ListItem) return false;
                element = TreeWalker.ControlViewWalker.GetParent(element);
            }
        }
        catch (Exception ex)
        {
            Logger.Warn($"[Hook] UI Automation failed: {ex.Message}");
            return false;
        }

        return true;
    }

    public void Dispose()
    {
        Uninstall();
    }
}
