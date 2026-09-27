using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    private readonly Dictionary<string, ToolStripMenuItem> _habitatItems = new();
    private readonly Dictionary<string, ToolStripMenuItem> _qualityItems = new();
    private readonly ToolStripMenuItem _dockItem;
    private readonly ToolStripMenuItem _pauseItem;
    private readonly ToolStripMenuItem _startupItem;
    private readonly string _assetsRoot;
    private readonly MessageWindow _messageWindow;
    private readonly EventWaitHandle _activateEvent;
    private readonly RegisteredWaitHandle _activateWait;
    private readonly MouseHookManager _mouseHookManager;
    private readonly PlayOverlayManager _playOverlayManager;
    private readonly DragGesture _desktopDrag;
    private readonly DockWindow _dock;
    private readonly System.Windows.Forms.Timer _dockTimer;

    private const int DOCK_HOTKEY_ID = 9001;
    private const int ESC_HOTKEY_ID = 9002;

    private bool _awake = true;
    private int _maxAppliedRate = 0;
    private bool _isRebuilding = false;

    // What the scene on screen offers the dock, and the dock tool in hand, if any.
    private SceneControls _controls = SceneControls.Empty;
    private SceneControls.Control? _activeTool;

    // The dock: open (hovered, pinned, or peeking once at first run), and whether an app
    // window covers the spot where it sits, which tucks it away until it is summoned.
    private bool _dockExpanded = false;
    private bool _dockPinned = false;
    private bool _dockCovered = false;
    private long _hoverSince = 0, _leftSince = 0, _peekUntil = 0;

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
        _playOverlayManager = new PlayOverlayManager(() => _windows, OnOverlayStateChanged);
        _desktopDrag = new DragGesture(() => _windows);

        // System tray menu: the scene, quality, the dock and pause. Everything the scene
        // itself can do lives in the dock.
        var contextMenu = new ContextMenuStrip();

        _statusItem = new ToolStripMenuItem("Starting...") { Enabled = false };
        contextMenu.Items.Add(_statusItem);
        contextMenu.Items.Add(new ToolStripSeparator());

        var envMenu = new ToolStripMenuItem("Scene");
        foreach (var habitat in Habitats.All)
        {
            var id = habitat.Id;
            var item = new ToolStripMenuItem(habitat.Title, null, (_, _) => SelectHabitat(id));
            envMenu.DropDownItems.Add(item);
            _habitatItems[id] = item;
        }
        contextMenu.Items.Add(envMenu);

        var qualityMenu = new ToolStripMenuItem("Quality");
        foreach (var (level, label) in new[] { ("eco", "Eco (20 fps, lightest)"), ("balanced", "Balanced (30 fps)"), ("detail", "Detail (60 fps, sharpest)") })
        {
            var item = new ToolStripMenuItem(label, null, (_, _) => SelectQuality(level));
            _qualityItems[level] = item;
            qualityMenu.DropDownItems.Add(item);
        }
        contextMenu.Items.Add(qualityMenu);
        contextMenu.Items.Add(new ToolStripSeparator());

        _dockItem = new ToolStripMenuItem("Show the control dock", null, (_, _) => SetDockEnabled(!_settings.DockEnabled))
        {
            ShortcutKeyDisplayString = "Ctrl+Alt+F",
            ToolTipText = "The bar at the edge of the screen with the scene's own buttons. Clicking the tray icon opens it too."
        };
        contextMenu.Items.Add(_dockItem);

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
        _trayIcon.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ToggleDockPinned(); };

        _dock = new DockWindow(_assetsRoot) { Edge = _settings.DockEdge };
        _dock.DockMessage += OnDockMessage;
        _ = InitializeDockAsync();
        _dockTimer = new System.Windows.Forms.Timer { Interval = 50 };
        _dockTimer.Tick += (_, _) => OnDockTick();
        _dockTimer.Start();

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

        // Global hotkey: Ctrl+Alt+F opens the dock and keeps it open (again to let it go).
        bool hotkeyOk = NativeMethods.RegisterHotKey(_messageWindow.Handle, DOCK_HOTKEY_ID, NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_F);
        if (!hotkeyOk)
        {
            Logger.Error($"[Dock] Failed to register global hotkey Ctrl+Alt+F: error {Marshal.GetLastWin32Error()}");
        }
        else
        {
            Logger.Info("[Dock] Registered global hotkey Ctrl+Alt+F.");
        }

        // Initial build
        _ = BuildWindowsAsync();
    }

    private static string FormatTitle(string habitat) => Habitats.Find(habitat).Title;

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
            SetTool(null);
            foreach (var win in _windows)
            {
                win.ControlsChanged -= OnSceneControlsChanged;
                win.Close();
                win.Dispose();
            }
            _windows.Clear();
            _controls = SceneControls.Empty;
            _workerWManager.Reset();

            foreach (var screen in Screen.AllScreens)
            {
                Logger.Info($"[Controller] Setting up screen: {screen.DeviceName} ({screen.Bounds})");
                var win = new WallpaperWindow(screen, _assetsRoot, _settings.Habitat, _settings.Population, _settings.Quality);
                win.ControlsChanged += OnSceneControlsChanged;
                _windows.Add(win);

                // Show window, then attach to WorkerW behind icons
                win.Show();
                _workerWManager.AttachWindow(win.Handle, screen.Bounds);
                await win.InitializeAsync();
            }

            ApplyRate();
            Logger.Info("[Controller] All screens initialized successfully.");

            // The first time, the dock opens for a few seconds so it is noticed.
            if (!_settings.DockIntroShown && _settings.DockEnabled)
            {
                _settings.DockIntroShown = true;
                SettingsManager.Save(_settings);
                _peekUntil = Environment.TickCount64 + 6000;
                _dockExpanded = true;
            }
        }
        catch (Exception ex)
        {
            Logger.Error($"[Controller] Failed to build windows: {ex.Message}\n{ex.StackTrace}");
        }
        finally
        {
            _isRebuilding = false;
            _dock.Reposition();
            UpdateDockVisibility();
            PushDockState();
        }
    }

    private void ApplyRate()
    {
        if (_isRebuilding || _windows.Count == 0) return;

        bool onBattery = SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;
        int full = onBattery ? 30 : 60;
        bool still = _settings.Paused || !_awake;

        var blockers = OcclusionDetector.GetWindowBlockers();
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

        bool rateChanged = maxRate != _maxAppliedRate;
        _maxAppliedRate = maxRate;
        _pointerTracker.UpdateRate(maxRate);
        UpdateHookState();

        // The dock only sits over open desktop: an app over its spot sends it away.
        var dockArea = _dock.Bounds;
        bool covered = blockers.Any(b => b.IntersectsWith(dockArea));
        if (covered != _dockCovered)
        {
            _dockCovered = covered;
            UpdateDockVisibility();
        }
        if (rateChanged) PushDockState();
    }

    private string StatusText()
    {
        bool onBattery = SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;
        if (_settings.Paused) return "Paused";
        if (!_awake) return "Still, screen locked / asleep";
        if (_maxAppliedRate == 0) return "Resting behind your windows";
        return $"Running at {_maxAppliedRate} fps{(onBattery ? " (Battery)" : "")}";
    }

    private void UpdateMenuState()
    {
        foreach (var (id, item) in _habitatItems) item.Checked = _settings.Habitat == id;
        _statusItem.Text = StatusText();
        _pauseItem.Text = _settings.Paused ? "Resume" : "Pause";
        _dockItem.Checked = _settings.DockEnabled;
        foreach (var (level, item) in _qualityItems) item.Checked = _settings.Quality == level;
        _trayIcon.Text = $"Desktop Habitats · {FormatTitle(_settings.Habitat)}";
    }

    private void SelectHabitat(string habitat)
    {
        if (_settings.Habitat == habitat || Habitats.All.All(h => h.Id != habitat)) return;
        _settings.Habitat = habitat;
        SettingsManager.Save(_settings);
        SetTool(null);
        _controls = SceneControls.Empty;

        foreach (var win in _windows)
        {
            win.SetHabitat(habitat);
        }

        UpdateMenuState();
        PushDockState();
    }

    // Changing the population rebuilds each tank; fish added by hand are not kept.
    private void SelectPopulation(string level)
    {
        if (_settings.Population == level || level is not ("few" or "normal" or "lots" or "crowded")) return;
        _settings.Population = level;
        SettingsManager.Save(_settings);
        SetTool(null);
        foreach (var win in _windows)
        {
            win.SetPopulation(level);
        }
        UpdateMenuState();
        PushDockState();
    }

    private void SelectQuality(string level)
    {
        if (_settings.Quality == level || level is not ("eco" or "balanced" or "detail")) return;
        _settings.Quality = level;
        SettingsManager.Save(_settings);
        SetTool(null);
        foreach (var win in _windows)
        {
            win.SetQuality(level);
        }
        UpdateMenuState();
        PushDockState();
    }

    // ---- the scene's controls ---------------------------------------------------------------

    // A screen's scene has installed its controls (first) or changed a value. A freshly
    // loaded scene gets its remembered toggles and choices back; the main screen's scene
    // is the one the dock shows.
    private void OnSceneControlsChanged(WallpaperWindow win, bool first)
    {
        if (first && _settings.SceneValues.TryGetValue(win.CurrentHabitat, out var values))
        {
            foreach (var (id, json) in values) win.RunControl(id, json);
        }
        if (win == _windows.FirstOrDefault()) _ = RefreshControlsAsync();
    }

    private async Task RefreshControlsAsync()
    {
        var primary = _windows.FirstOrDefault();
        if (primary == null) return;
        var json = await primary.GetControlsJsonAsync();
        if (json == null) return;
        _controls = SceneControls.Parse(json);
        // A tool this scene does not have (or no longer takes the mouse the same way) is put down.
        if (_activeTool != null)
        {
            var same = _controls.Find(_activeTool.Id);
            if (same is not { Kind: "tool" } || same.Capture != _activeTool.Capture) SetTool(null);
        }
        PushDockState();
    }

    private void RunControl(string id, string? valueJson)
    {
        var control = _controls.Find(id);
        if (control == null) return;
        if (control.Kind == "action" && (_settings.Paused || !_awake || _maxAppliedRate <= 0)) return;
        foreach (var win in _windows) win.RunControl(id, valueJson);

        if (control.Kind is "toggle" or "choice" && control.Persist && valueJson != null)
        {
            if (!_settings.SceneValues.TryGetValue(_settings.Habitat, out var values))
                _settings.SceneValues[_settings.Habitat] = values = new();
            values[id] = valueJson;
            SettingsManager.Save(_settings);
        }
    }

    // Picks up a dock tool (or puts it down with null). A desktop tool listens for clicks and
    // drags on empty desktop; an overlay tool takes the whole screen until Esc.
    private void SetTool(SceneControls.Control? tool)
    {
        if (tool != null && (tool.Kind != "tool" || _settings.Paused || !_awake)) tool = null;
        if (tool?.Id == _activeTool?.Id && tool?.Capture == _activeTool?.Capture) return;

        // Put the old one down first: leaving the overlay would otherwise drop the new tool.
        if (_playOverlayManager.IsActive) _playOverlayManager.Exit();
        _desktopDrag.Cancel();
        _activeTool = tool;
        _mouseHookManager.RapidClicks = tool?.Rapid ?? false;
        _desktopDrag.Tool = tool?.Id ?? "";
        if (tool?.Capture == "overlay")
        {
            _playOverlayManager.Enter(tool.Id);
            _dock.BringToTop();
        }
        Logger.Info(tool == null ? "[Dock] Tool put down." : $"[Dock] Picked up {tool.Id} ({tool.Capture}).");
        UpdateHookState();
        PushDockState();
    }

    // A click on empty desktop with a desktop tool in hand.
    private void OnEmptyDesktopClick(Point physPoint)
    {
        if (_settings.Paused || !_awake || _maxAppliedRate <= 0) return;
        if (_activeTool is not { Capture: "desktop" } tool) return;

        var win = _windows.FirstOrDefault(w => w.TargetScreen.Bounds.Contains(physPoint));
        win?.UseTap(tool.Id, physPoint);
    }

    // A drag on empty desktop with a desktop tool in hand. Explorer draws its own rubber band
    // over the desktop meanwhile.
    private void OnEmptyDesktopDragMove(Point start, Point current)
    {
        if (_activeTool is not { Capture: "desktop" } || _settings.Paused || !_awake || _maxAppliedRate <= 0) return;

        if (!_desktopDrag.IsActive) _desktopDrag.Begin(start, current);
        else _desktopDrag.Move(current);
    }

    private void OnEmptyDesktopDragEnd(Point start, Point current)
    {
        _desktopDrag.End(current);
    }

    private void UpdateHookState()
    {
        bool needsHook = _activeTool is { Capture: "desktop" } && _maxAppliedRate > 0 && !_settings.Paused && _awake
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

    private void OnOverlayStateChanged(bool active)
    {
        if (active)
        {
            // Another app may already own a bare Esc hotkey; the overlay also watches the key
            // itself, so this only keeps Esc from reaching the app underneath.
            if (!NativeMethods.RegisterHotKey(_messageWindow.Handle, ESC_HOTKEY_ID, 0, NativeMethods.VK_ESCAPE))
                Logger.Warn($"[Overlay] Could not register Esc hotkey: error {Marshal.GetLastWin32Error()}");
            if (_mouseHookManager.IsInstalled)
            {
                _mouseHookManager.Uninstall();
            }
        }
        else
        {
            NativeMethods.UnregisterHotKey(_messageWindow.Handle, ESC_HOTKEY_ID);
            // Esc or the idle timeout ended it: the tool is put down.
            if (_activeTool?.Capture == "overlay") _activeTool = null;
            UpdateHookState();
            PushDockState();
        }
    }

    // ---- the dock --------------------------------------------------------------------------------

    private async Task InitializeDockAsync()
    {
        try
        {
            await _dock.InitializeAsync();
        }
        catch (Exception ex)
        {
            Logger.Error($"[Dock] Could not start the dock: {ex.Message}");
        }
    }

    private bool DockOpen => _dockExpanded || _dockPinned;

    private void UpdateDockVisibility()
    {
        bool shown = _settings.DockEnabled && _windows.Count > 0 && (DockOpen || !_dockCovered);
        if (shown != _dock.Visible)
            Logger.Info($"[Dock] {(shown ? "Shown" : "Hidden")} (enabled {_settings.DockEnabled}, open {DockOpen}, covered {_dockCovered}).");
        _dock.SetShown(shown);
        if (!shown)
        {
            _dockExpanded = false;
            _hoverSince = _leftSince = _peekUntil = 0;
        }
    }

    // Hover opens the dock after a short rest on it (the taskbar is right next to it, and a
    // pointer passing on its way there should not open it); leaving closes it after a moment.
    private void OnDockTick()
    {
        if (!_dock.Visible) return;
        long now = Environment.TickCount64;
        bool inside = _dock.ContainsCursor();
        if (inside)
        {
            _leftSince = 0;
            _peekUntil = 0;
            if (!_dockExpanded)
            {
                if (_hoverSince == 0) _hoverSince = now;
                else if (now - _hoverSince >= 220) SetDockExpanded(true);
            }
            return;
        }
        _hoverSince = 0;
        if (!_dockExpanded || _dockPinned) return;
        if (_peekUntil > 0)
        {
            if (now < _peekUntil) return;
            _peekUntil = 0;
            SetDockExpanded(false);
            return;
        }
        if (_leftSince == 0) _leftSince = now;
        else if (now - _leftSince >= 650) SetDockExpanded(false);
    }

    private void SetDockExpanded(bool expanded)
    {
        if (_dockExpanded == expanded) return;
        _dockExpanded = expanded;
        _leftSince = 0;
        // Values can change behind the dock's back (the reef's light follows the clock).
        if (expanded) _ = RefreshControlsAsync();
        UpdateDockVisibility();
        PushDockState();
    }

    // The tray icon and Ctrl+Alt+F: open the dock and keep it open, or let it go again.
    private void ToggleDockPinned()
    {
        if (!_settings.DockEnabled)
        {
            _settings.DockEnabled = true;
            SettingsManager.Save(_settings);
            _dockPinned = false;
        }
        _dockPinned = !_dockPinned;
        _dockExpanded = _dockPinned;
        _peekUntil = 0;
        if (_dockPinned) _ = RefreshControlsAsync();
        UpdateDockVisibility();
        _dock.BringToTop();
        PushDockState();
    }

    private void SetDockEnabled(bool enabled)
    {
        _settings.DockEnabled = enabled;
        SettingsManager.Save(_settings);
        _dockPinned = false;
        _dockExpanded = false;
        if (!enabled) SetTool(null);
        UpdateDockVisibility();
        PushDockState();
        UpdateMenuState();
    }

    private void PushDockState()
    {
        var habitat = Habitats.Find(_settings.Habitat);
        var habitats = new JsonArray();
        foreach (var h in Habitats.All) habitats.Add(new JsonObject { ["id"] = h.Id, ["title"] = h.Title, ["accent"] = h.Accent });
        var state = new JsonObject
        {
            ["expanded"] = DockOpen,
            ["pinned"] = _dockPinned,
            ["edge"] = _settings.DockEdge,
            ["habitat"] = new JsonObject { ["id"] = habitat.Id, ["title"] = habitat.Title, ["accent"] = _controls.Accent ?? habitat.Accent },
            ["habitats"] = habitats,
            ["controls"] = _controls.Manifest["controls"]?.DeepClone() ?? new JsonArray(),
            ["activeTool"] = _activeTool?.Id,
            ["paused"] = _settings.Paused,
            ["running"] = _awake && _maxAppliedRate > 0,
            ["status"] = StatusText(),
            ["quality"] = _settings.Quality,
            ["population"] = _settings.Population,
            ["populationSupported"] = _controls.Population,
        };
        _dock.PushState(state.ToJsonString());
    }

    private void OnDockMessage(JsonElement message)
    {
        string? Text(string name) =>
            message.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        switch (Text("type"))
        {
            case "ready":
                PushDockState();
                break;
            case "control":
                if (Text("id") is { } id)
                    RunControl(id, message.TryGetProperty("value", out var value) ? value.GetRawText() : null);
                break;
            case "tool":
                SetTool(_controls.Find(Text("id")));
                break;
            case "scene":
                if (Text("id") is { } scene) SelectHabitat(scene);
                break;
            case "pause":
                TogglePause();
                break;
            case "pin":
                ToggleDockPinned();
                break;
            case "quality":
                if (Text("value") is { } quality) SelectQuality(quality);
                break;
            case "population":
                if (Text("value") is { } population) SelectPopulation(population);
                break;
            case "edge":
                _settings.DockEdge = Text("value") == "top" ? "top" : "bottom";
                SettingsManager.Save(_settings);
                _dock.Edge = _settings.DockEdge;
                PushDockState();
                break;
            case "hideDock":
                SetDockEnabled(false);
                _trayIcon.ShowBalloonTip(4000, "Dock hidden",
                    "Click the fish in the system tray, or press Ctrl+Alt+F, to bring it back.", ToolTipIcon.Info);
                break;
        }
    }

    private void OnHotkey(int id)
    {
        if (id == DOCK_HOTKEY_ID)
        {
            ToggleDockPinned();
        }
        else if (id == ESC_HOTKEY_ID)
        {
            _playOverlayManager.Exit();
        }
    }

    // ---- everything else ---------------------------------------------------------------------------

    private void TogglePause()
    {
        _settings.Paused = !_settings.Paused;
        if (_settings.Paused)
        {
            SetTool(null);
        }
        SettingsManager.Save(_settings);
        ApplyRate();
        UpdateMenuState();
        PushDockState();
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
        _dock.Reposition();
        _ = BuildWindowsAsync();
    }

    private void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        if (e.Reason == SessionSwitchReason.SessionLock)
        {
            _awake = false;
            SetTool(null);
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
            SetTool(null);
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

    // The desktop icon was clicked while already running: resume if paused and open the dock.
    private void OnActivateRequested()
    {
        Logger.Info("[Controller] Launched again while running; opening the dock.");
        if (_settings.Paused) TogglePause();
        if (!_dockPinned) ToggleDockPinned();
        _trayIcon.ShowBalloonTip(4000, "Desktop Habitats is running",
            "The dock at the edge of the screen has the scene's controls. Click the fish in the tray to open or close it.", ToolTipIcon.Info);
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
        NativeMethods.UnregisterHotKey(_messageWindow.Handle, DOCK_HOTKEY_ID);
        _playOverlayManager.Dispose();
        _mouseHookManager.Dispose();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _exposureTimer.Stop();
        _exposureTimer.Dispose();
        _dockTimer.Stop();
        _dockTimer.Dispose();
        _dock.Close();
        _dock.Dispose();
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
