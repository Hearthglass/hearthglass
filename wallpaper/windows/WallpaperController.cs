using System.Drawing;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace DesktopHabitats;

public class WallpaperController : ApplicationContext
{
    private readonly AppSettings _settings;
    private readonly WorkerWManager _workerWManager;
    private readonly List<WallpaperWindow> _windows = [];
    private readonly PointerTracker _pointerTracker;
    private readonly System.Windows.Forms.Timer _exposureTimer;
    private readonly NotifyIcon _trayIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _riverscapeItem;
    private readonly ToolStripMenuItem _reefscapeItem;
    private readonly ToolStripMenuItem _feedItem;
    private readonly ToolStripMenuItem _addFishItem;
    private readonly Dictionary<string, ToolStripMenuItem> _populationItems = new();
    private readonly Dictionary<string, ToolStripMenuItem> _qualityItems = new();
    private readonly ToolStripMenuItem _clickToFeedItem;
    private readonly ToolStripMenuItem _selectFishItem;
    private readonly ToolStripMenuItem _playModeItem;
    private readonly ToolStripMenuItem _shyItem;
    private readonly ToolStripMenuItem _curiousItem;
    private readonly ToolStripMenuItem _pauseItem;
    private readonly ToolStripMenuItem _startupItem;
    private readonly string _assetsRoot;
    private readonly MessageWindow _messageWindow;
    private readonly EventWaitHandle _activateEvent;
    private readonly RegisteredWaitHandle _activateWait;
    private readonly MouseHookManager _mouseHookManager;
    private readonly PlayOverlayManager _playOverlayManager;
    private readonly DragGesture _desktopDrag;

    private const int PLAY_MODE_HOTKEY_ID = 9001;
    private const int ESC_HOTKEY_ID = 9002;

    private bool _awake = true;
    private int _maxAppliedRate = 0;
    private bool _isRebuilding = false;
    // While on, a click on the desktop (or in play mode) puts a fish there instead of food.
    private bool _addFishMode = false;

    public WallpaperController()
    {
        _settings = SettingsManager.Load();
        _assetsRoot = ResolveAssetsRoot();
        _workerWManager = new WorkerWManager();
        _pointerTracker = new PointerTracker(() => _windows);
        _mouseHookManager = new MouseHookManager(() => _workerWManager.DefView);
        _mouseHookManager.OnEmptyDesktopClick += OnEmptyDesktopClick;
        _mouseHookManager.OnDragMove += OnEmptyDesktopDragMove;
        _mouseHookManager.OnDragEnd += OnEmptyDesktopDragEnd;
        _playOverlayManager = new PlayOverlayManager(() => _windows, OnPlayModeStateChanged, () => _addFishMode);
        _desktopDrag = new DragGesture(() => _windows);

        // System Tray Menu
        var contextMenu = new ContextMenuStrip();

        _statusItem = new ToolStripMenuItem("Starting...") { Enabled = false };
        contextMenu.Items.Add(_statusItem);
        contextMenu.Items.Add(new ToolStripSeparator());

        var envMenu = new ToolStripMenuItem("Environment");
        _riverscapeItem = new ToolStripMenuItem("Riverscape", null, (_, _) => SelectHabitat("riverscape"));
        _reefscapeItem = new ToolStripMenuItem("Reefscape", null, (_, _) => SelectHabitat("reefscape"));
        envMenu.DropDownItems.Add(_riverscapeItem);
        envMenu.DropDownItems.Add(_reefscapeItem);
        contextMenu.Items.Add(envMenu);

        var behaviourMenu = new ToolStripMenuItem("Fish behaviour");
        _shyItem = new ToolStripMenuItem("Shy", null, (_, _) => SelectBehaviour("shy"));
        _curiousItem = new ToolStripMenuItem("Curious", null, (_, _) => SelectBehaviour("curious"));
        behaviourMenu.DropDownItems.Add(_shyItem);
        behaviourMenu.DropDownItems.Add(_curiousItem);
        contextMenu.Items.Add(behaviourMenu);

        var populationMenu = new ToolStripMenuItem("Population");
        foreach (var (level, label) in new[] { ("few", "Few"), ("normal", "Normal"), ("lots", "Lots"), ("crowded", "Crowded") })
        {
            var item = new ToolStripMenuItem(label, null, (_, _) => SelectPopulation(level));
            _populationItems[level] = item;
            populationMenu.DropDownItems.Add(item);
        }
        contextMenu.Items.Add(populationMenu);

        var qualityMenu = new ToolStripMenuItem("Quality");
        foreach (var (level, label) in new[] { ("eco", "Eco (20 fps, lightest)"), ("balanced", "Balanced (30 fps)"), ("detail", "Detail (60 fps, sharpest)") })
        {
            var item = new ToolStripMenuItem(label, null, (_, _) => SelectQuality(level));
            _qualityItems[level] = item;
            qualityMenu.DropDownItems.Add(item);
        }
        contextMenu.Items.Add(qualityMenu);
        contextMenu.Items.Add(new ToolStripSeparator());

        _feedItem = new ToolStripMenuItem("Feed", null, (_, _) => FeedFish());
        contextMenu.Items.Add(_feedItem);

        _addFishItem = new ToolStripMenuItem("Click to add fish", null, (_, _) => ToggleAddFish())
        {
            CheckOnClick = true,
            Checked = false,
            ToolTipText = "Each click on the desktop adds a fish where you click, up to 200 extra"
        };
        contextMenu.Items.Add(_addFishItem);

        _clickToFeedItem = new ToolStripMenuItem("Click to feed", null, (_, _) => ToggleClickToFeed())
        {
            CheckOnClick = true,
            Checked = _settings.ClickToFeed
        };
        contextMenu.Items.Add(_clickToFeedItem);

        _selectFishItem = new ToolStripMenuItem("Drag to select and move fish", null, (_, _) => ToggleSelectFish())
        {
            CheckOnClick = true,
            Checked = _settings.SelectFish
        };
        contextMenu.Items.Add(_selectFishItem);

        _playModeItem = new ToolStripMenuItem("Play mode", null, (_, _) => TogglePlayMode())
        {
            CheckOnClick = true,
            Checked = false
        };
        contextMenu.Items.Add(_playModeItem);

        _pauseItem = new ToolStripMenuItem("Pause", null, (_, _) => TogglePause());
        contextMenu.Items.Add(_pauseItem);
        contextMenu.Items.Add(new ToolStripSeparator());

        _startupItem = new ToolStripMenuItem("Start with Windows", null, (_, _) => ToggleStartup())
        {
            CheckOnClick = true,
            Checked = _settings.StartWithWindows
        };
        contextMenu.Items.Add(_startupItem);
        contextMenu.Items.Add(new ToolStripSeparator());

        var quitItem = new ToolStripMenuItem("Quit", null, (_, _) => Quit());
        contextMenu.Items.Add(quitItem);

        contextMenu.Opening += (_, _) => UpdateMenuState();

        _trayIcon = new NotifyIcon
        {
            Icon = IconHelper.CreateFishIcon(),
            Text = $"Desktop Habitats · {FormatTitle(_settings.Habitat)}",
            ContextMenuStrip = contextMenu,
            Visible = true
        };

        // Exposure check timer (1 second)
        _exposureTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _exposureTimer.Tick += (_, _) => ApplyRate();
        _exposureTimer.Start();

        // Listen for system events
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.PowerModeChanged += OnPowerModeChanged;

        // Hidden window for Explorer restart broadcast and global hotkeys
        _messageWindow = new MessageWindow(OnExplorerRestarted, OnHotkey);

        // A second launch sets this event; the wait runs on the thread pool and hands over
        // to the UI thread.
        _activateEvent = new EventWaitHandle(false, EventResetMode.AutoReset, Program.ActivateEventName);
        var ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        _activateWait = ThreadPool.RegisterWaitForSingleObject(_activateEvent,
            (_, _) => ui.Post(_ => OnActivateRequested(), null), null, Timeout.Infinite, false);

        // Global hotkey: Ctrl+Alt+F for Play Mode
        bool hotkeyOk = NativeMethods.RegisterHotKey(_messageWindow.Handle, PLAY_MODE_HOTKEY_ID, NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_F);
        if (!hotkeyOk)
        {
            Logger.Error($"[PlayMode] Failed to register global hotkey Ctrl+Alt+F: error {Marshal.GetLastWin32Error()}");
        }
        else
        {
            Logger.Info("[PlayMode] Registered global hotkey Ctrl+Alt+F.");
        }

        // Initial build
        _ = BuildWindowsAsync();
    }

    private static string FormatTitle(string habitat) =>
        char.ToUpperInvariant(habitat[0]) + habitat[1..];

    private static string ResolveAssetsRoot()
    {
        var candidates = new List<string>
        {
            AppDomain.CurrentDomain.BaseDirectory,
            Directory.GetCurrentDirectory(),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "DesktopHabitats")
        };

        // Also check upwards from BaseDirectory
        var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (dir != null)
        {
            candidates.Add(dir.FullName);
            dir = dir.Parent;
        }

        foreach (var path in candidates)
        {
            if (File.Exists(Path.Combine(path, "scenes", "riverscape", "wallpaper.html")))
            {
                return path;
            }
        }

        throw new DirectoryNotFoundException("Could not locate Desktop Habitats scene assets folder.");
    }

    private async Task BuildWindowsAsync()
    {
        if (_isRebuilding) return;
        _isRebuilding = true;

        try
        {
            Logger.Info($"[Controller] Building wallpaper windows for {Screen.AllScreens.Length} screen(s)...");
            foreach (var win in _windows)
            {
                win.Close();
                win.Dispose();
            }
            _windows.Clear();
            _workerWManager.Reset();

            foreach (var screen in Screen.AllScreens)
            {
                Logger.Info($"[Controller] Setting up screen: {screen.DeviceName} ({screen.Bounds})");
                var win = new WallpaperWindow(screen, _assetsRoot, _settings.Habitat, _settings.Population, _settings.Quality);
                _windows.Add(win);

                // Show window, then attach to WorkerW behind icons
                win.Show();
                _workerWManager.AttachWindow(win.Handle, screen.Bounds);
                await win.InitializeAsync();
                win.SetFishBehaviour(_settings.FishBehaviour);
            }

            ApplyRate();
            Logger.Info("[Controller] All screens initialized successfully.");
        }
        catch (Exception ex)
        {
            Logger.Error($"[Controller] Failed to build windows: {ex.Message}\n{ex.StackTrace}");
        }
        finally
        {
            _isRebuilding = false;
        }
    }

    private void ApplyRate()
    {
        if (_isRebuilding || _windows.Count == 0) return;

        bool onBattery = SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;
        int full = onBattery ? 30 : 60;
        bool still = _settings.Paused || !_awake;

        var blockers = still ? [] : OcclusionDetector.GetWindowBlockers();
        int maxRate = 0;

        foreach (var win in _windows)
        {
            double exposure = still ? 0 : OcclusionDetector.CalculateExposure(win.TargetScreen.Bounds, blockers);
            int rate = still || exposure < 0.15 ? 0 : exposure < 0.40 ? 20 : full;

            win.SetPower(onBattery);
            if (win.SetRate(rate))
            {
                Logger.Info($"[Controller] Rate updated: {rate} fps on {win.TargetScreen.DeviceName} (exposure: {exposure:P0})");
            }
            maxRate = Math.Max(maxRate, rate);
        }

        _maxAppliedRate = maxRate;
        _pointerTracker.UpdateRate(maxRate);
        UpdateHookState();
    }

    private void UpdateMenuState()
    {
        _riverscapeItem.Checked = _settings.Habitat == "riverscape";
        _reefscapeItem.Checked = _settings.Habitat == "reefscape";
        _shyItem.Checked = _settings.FishBehaviour != "curious";
        _curiousItem.Checked = _settings.FishBehaviour == "curious";
        _clickToFeedItem.Checked = _settings.ClickToFeed;
        _selectFishItem.Checked = _settings.SelectFish;

        bool onBattery = SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;

        if (_settings.Paused)
        {
            _statusItem.Text = "Paused";
        }
        else if (!_awake)
        {
            _statusItem.Text = "Still, screen locked / asleep";
        }
        else if (_maxAppliedRate == 0)
        {
            _statusItem.Text = "Resting behind your windows";
        }
        else
        {
            _statusItem.Text = $"Running at {_maxAppliedRate} fps{(onBattery ? " (Battery)" : "")}";
        }

        _pauseItem.Text = _settings.Paused ? "Resume" : "Pause";
        _feedItem.Enabled = _maxAppliedRate > 0;
        _addFishItem.Checked = _addFishMode;
        foreach (var (level, item) in _populationItems) item.Checked = _settings.Population == level;
        foreach (var (level, item) in _qualityItems) item.Checked = _settings.Quality == level;
        _playModeItem.Enabled = !_settings.Paused && _maxAppliedRate > 0 && _awake;
        _playModeItem.Checked = _playOverlayManager.IsActive;
        _trayIcon.Text = $"Desktop Habitats · {FormatTitle(_settings.Habitat)}";
    }

    private void SelectHabitat(string habitat)
    {
        if (_settings.Habitat == habitat) return;
        _settings.Habitat = habitat;
        SettingsManager.Save(_settings);

        foreach (var win in _windows)
        {
            win.SetHabitat(habitat);
        }

        UpdateMenuState();
    }

    private void SelectBehaviour(string behaviour)
    {
        if (_settings.FishBehaviour == behaviour) return;
        _settings.FishBehaviour = behaviour;
        SettingsManager.Save(_settings);

        foreach (var win in _windows)
        {
            win.SetFishBehaviour(behaviour);
        }

        UpdateMenuState();
    }

    // Changing the population rebuilds each tank; fish added by hand are not kept.
    private void SelectPopulation(string level)
    {
        if (_settings.Population == level) return;
        _settings.Population = level;
        SettingsManager.Save(_settings);
        _playOverlayManager.Exit();
        foreach (var win in _windows)
        {
            win.SetPopulation(level);
        }
        UpdateMenuState();
    }

    private void SelectQuality(string level)
    {
        if (_settings.Quality == level) return;
        _settings.Quality = level;
        SettingsManager.Save(_settings);
        _playOverlayManager.Exit();
        foreach (var win in _windows)
        {
            win.SetQuality(level);
        }
        UpdateMenuState();
    }

    private void ToggleAddFish()
    {
        _addFishMode = _addFishItem.Checked;
        _mouseHookManager.RapidClicks = _addFishMode;
        UpdateHookState();
        UpdateMenuState();
    }

    private void FeedFish()
    {
        foreach (var win in _windows)
        {
            win.Feed();
        }
    }

    private void ToggleClickToFeed()
    {
        _settings.ClickToFeed = _clickToFeedItem.Checked;
        SettingsManager.Save(_settings);
        UpdateHookState();
        UpdateMenuState();
    }

    private void ToggleSelectFish()
    {
        _settings.SelectFish = _selectFishItem.Checked;
        SettingsManager.Save(_settings);
        UpdateHookState();
        UpdateMenuState();
    }

    // A click on empty desktop adds a fish there in add mode, otherwise feeds there.
    private void OnEmptyDesktopClick(Point physPoint)
    {
        if (_settings.Paused || !_awake || _maxAppliedRate <= 0) return;
        if (!_addFishMode && !_settings.ClickToFeed) return;

        var win = _windows.FirstOrDefault(w => w.TargetScreen.Bounds.Contains(physPoint));
        if (win == null) return;
        if (_addFishMode) win.AddFishPhysical(physPoint);
        else win.ClickPhysical(physPoint);
    }

    // A drag on empty desktop: begun on the held selection it moves the fish, anywhere
    // else it selects them. Explorer draws its own rubber band over the desktop meanwhile.
    private void OnEmptyDesktopDragMove(Point start, Point current)
    {
        if (!_settings.SelectFish || _settings.Paused || !_awake || _maxAppliedRate <= 0) return;

        if (!_desktopDrag.IsActive) _desktopDrag.Begin(start, current);
        else _desktopDrag.Move(current);
    }

    private void OnEmptyDesktopDragEnd(Point start, Point current)
    {
        _desktopDrag.End(current);
    }

    private void UpdateHookState()
    {
        bool needsHook = (_settings.ClickToFeed || _settings.SelectFish || _addFishMode) && _maxAppliedRate > 0 && !_settings.Paused && _awake
            && !_playOverlayManager.IsActive;
        if (needsHook && !_mouseHookManager.IsInstalled)
        {
            _mouseHookManager.Install();
        }
        else if (!needsHook && _mouseHookManager.IsInstalled)
        {
            _mouseHookManager.Uninstall();
            _desktopDrag.Cancel();
        }
    }

    private void TogglePlayMode()
    {
        if (_settings.Paused || !_awake || _maxAppliedRate <= 0)
        {
            _playOverlayManager.Exit();
            return;
        }
        _playOverlayManager.Toggle();
        UpdateMenuState();
    }

    private void OnPlayModeStateChanged(bool active)
    {
        _playModeItem.Checked = active;
        if (active)
        {
            NativeMethods.RegisterHotKey(_messageWindow.Handle, ESC_HOTKEY_ID, 0, NativeMethods.VK_ESCAPE);
            if (_mouseHookManager.IsInstalled)
            {
                _mouseHookManager.Uninstall();
            }
        }
        else
        {
            NativeMethods.UnregisterHotKey(_messageWindow.Handle, ESC_HOTKEY_ID);
            UpdateHookState();
        }
        UpdateMenuState();
    }

    private void OnHotkey(int id)
    {
        if (id == PLAY_MODE_HOTKEY_ID)
        {
            TogglePlayMode();
        }
        else if (id == ESC_HOTKEY_ID)
        {
            _playOverlayManager.Exit();
        }
    }

    private void TogglePause()
    {
        _settings.Paused = !_settings.Paused;
        if (_settings.Paused)
        {
            _playOverlayManager.Exit();
        }
        SettingsManager.Save(_settings);
        ApplyRate();
        UpdateMenuState();
    }

    private void ToggleStartup()
    {
        _settings.StartWithWindows = _startupItem.Checked;
        SettingsManager.Save(_settings);
        SettingsManager.SetStartWithWindows(_settings.StartWithWindows);
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        _playOverlayManager.Exit();
        _ = BuildWindowsAsync();
    }

    private void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        if (e.Reason == SessionSwitchReason.SessionLock)
        {
            _awake = false;
            _playOverlayManager.Exit();
            _mouseHookManager.Uninstall();
            ApplyRate();
        }
        else if (e.Reason == SessionSwitchReason.SessionUnlock)
        {
            _awake = true;
            ApplyRate();
        }
    }

    private void OnPowerModeChanged(object? sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode == PowerModes.Suspend)
        {
            _awake = false;
            _playOverlayManager.Exit();
            _mouseHookManager.Uninstall();
            ApplyRate();
        }
        else if (e.Mode == PowerModes.Resume)
        {
            _awake = true;
            ApplyRate();
        }
        else if (e.Mode == PowerModes.StatusChange)
        {
            ApplyRate();
        }
    }

    // The desktop icon was clicked while already running: resume if paused and say where
    // the controls are.
    private void OnActivateRequested()
    {
        Logger.Info("[Controller] Launched again while running; showing the tray notice.");
        if (_settings.Paused) TogglePause();
        _trayIcon.ShowBalloonTip(4000, "Desktop Habitats is running",
            "Click the fish icon in the system tray to change the tank, feed the fish or pause.", ToolTipIcon.Info);
    }

    private void OnExplorerRestarted()
    {
        Logger.Info("[Controller] Windows Explorer restarted, rebuilding wallpaper attachment...");
        _playOverlayManager.Exit();
        _ = BuildWindowsAsync();
    }

    private void Quit()
    {
        _playOverlayManager.Exit();
        NativeMethods.UnregisterHotKey(_messageWindow.Handle, PLAY_MODE_HOTKEY_ID);
        _playOverlayManager.Dispose();
        _mouseHookManager.Dispose();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _exposureTimer.Stop();
        _exposureTimer.Dispose();
        _pointerTracker.Dispose();
        _messageWindow.Dispose();
        _activateWait.Unregister(null);
        _activateEvent.Dispose();

        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;

        foreach (var win in _windows)
        {
            win.Close();
            win.Dispose();
        }
        _windows.Clear();

        ExitThread();
    }

    private sealed class MessageWindow : Form
    {
        private readonly Action _onTaskbarCreated;
        private readonly Action<int> _onHotkey;
        private readonly uint _taskbarCreatedMsg;

        public MessageWindow(Action onTaskbarCreated, Action<int> onHotkey)
        {
            _onTaskbarCreated = onTaskbarCreated;
            _onHotkey = onHotkey;
            _taskbarCreatedMsg = NativeMethods.RegisterWindowMessage("TaskbarCreated");
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Minimized;
            ShowInTaskbar = false;
            Width = 0;
            Height = 0;
            _ = Handle; // Force HWND creation
        }

        protected override void WndProc(ref Message m)
        {
            if (_taskbarCreatedMsg != 0 && (uint)m.Msg == _taskbarCreatedMsg)
            {
                _onTaskbarCreated();
            }
            else if (m.Msg == NativeMethods.WM_HOTKEY)
            {
                _onHotkey((int)m.WParam);
            }
            base.WndProc(ref m);
        }
    }
}
