using System.Drawing;
using System.Globalization;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Hearthglass;

public class WallpaperWindow : Form
{
    private readonly Screen _screen;
    private readonly string _assetsRoot;
    private readonly WebView2 _webView;
    private string _habitat;
    private bool _loaded = false;
    private bool _inside = false;
    private int _rate = 0;
    private bool _battery = false;
    private double _cssScale = 1.0;
    // The page has said its controls are ready since it last loaded.
    private bool _controlsReady = false;
    private string _population = "normal";
    private string _quality = "detail";
    private bool _playModeActive = false;

    public Screen TargetScreen => _screen;
    public string CurrentHabitat => _habitat;
    public int CurrentRate => _rate;
    public double CssScale => _cssScale;
    // The scene has installed or changed its dock controls; true the first time after a load.
    public event Action<WallpaperWindow, bool>? ControlsChanged;

    public WallpaperWindow(Screen screen, string assetsRoot, string habitat, string population, string quality)
    {
        _screen = screen;
        _assetsRoot = assetsRoot;
        _habitat = habitat;
        _population = population;
        _quality = quality;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = screen.Bounds;
        BackColor = Habitats.Find(habitat).Background;

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = BackColor
        };

        Controls.Add(_webView);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= NativeMethods.WS_EX_TOOLWINDOW | NativeMethods.WS_EX_NOACTIVATE;
            return cp;
        }
    }

    public async Task InitializeAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Hearthglass",
            "WebView2Data");

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await _webView.EnsureCoreWebView2Async(env);

        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

        // Map virtual domain to local scenes directory
        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "hearthglass.local",
            _assetsRoot,
            CoreWebView2HostResourceAccessKind.Allow);

        // Inject logging & pointer bridge
        await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
            const report = (text) => window.chrome.webview.postMessage(String(text));
            for (const level of ['error', 'warn']) {
                const original = console[level];
                console[level] = (...parts) => {
                    report(parts.map((part) => part && part.stack ? part.stack : part).join(' '));
                    original.apply(console, parts);
                };
            }
            addEventListener('error', (event) =>
                report(`${event.message} at ${event.filename}:${event.lineno}`));
            addEventListener('unhandledrejection', (event) => report(event.reason));

            window.habitatPointerCount = 0;
            window.habitatPointer = (x, y) => {
                const canvas = document.querySelector('#scene');
                window.habitatPointerCount++;
                if (canvas) {
                    canvas.dispatchEvent(
                        new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
                }
            };
            window.habitatPointerOut = () => {
                const canvas = document.querySelector('#scene');
                if (canvas) canvas.dispatchEvent(new PointerEvent('pointerleave'));
            };
            window.habitatClick = (x, y) => {
                const canvas = document.querySelector('#scene');
                if (canvas) {
                    canvas.dispatchEvent(
                        new PointerEvent('pointerdown', {
                            clientX: x,
                            clientY: y,
                            button: 0,
                            buttons: 1,
                            isPrimary: true,
                            bubbles: true
                        }));
                }
            };
        ");

        // Plain strings are the page's console errors; objects are messages for the host.
        _webView.CoreWebView2.WebMessageReceived += (_, args) =>
        {
            try
            {
                using var doc = JsonDocument.Parse(args.WebMessageAsJson);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.String)
                {
                    Logger.Info($"[Scene] {root.GetString()}");
                }
                else if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("type", out var type) &&
                         type.GetString() == "controls")
                {
                    bool first = !_controlsReady;
                    _controlsReady = true;
                    ControlsChanged?.Invoke(this, first);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"[Scene] Unreadable message: {ex.Message}");
            }
        };

        _webView.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess)
            {
                Logger.Info($"[WebView2] Navigation completed for {_habitat} on {_screen.DeviceName}");
                _loaded = true;
                UpdateCssScaleAsync();
                SendState();
            }
            else
            {
                Logger.Error($"[WebView2] Navigation failed: {args.WebErrorStatus} (HTTP {args.HttpStatusCode})");
            }
        };

        LoadScene();
    }

    private async void UpdateCssScaleAsync()
    {
        try
        {
            var result = await _webView.ExecuteScriptAsync("window.innerWidth");
            if (double.TryParse(result, NumberStyles.Any, CultureInfo.InvariantCulture, out double innerWidth) &&
                innerWidth > 0 && _screen.Bounds.Width > 0)
            {
                _cssScale = innerWidth / _screen.Bounds.Width;
                Logger.Info($"[WallpaperWindow] Screen {_screen.DeviceName} CSS scale: {_cssScale:F3} (innerWidth: {innerWidth}, screenWidth: {_screen.Bounds.Width})");
            }
        }
        catch (Exception ex)
        {
            Logger.Warn($"[WallpaperWindow] Failed to get window.innerWidth: {ex.Message}");
        }
    }

    private void LoadScene()
    {
        _loaded = false;
        _controlsReady = false;
        // The scene stocks its tank and picks its render budget from the URL when it is built.
        var page = $"/scenes/{_habitat}/wallpaper.html?population={Uri.EscapeDataString(_population)}&quality={Uri.EscapeDataString(_quality)}";
        _webView.CoreWebView2.Navigate($"https://hearthglass.local{page}");
    }

    public void SetHabitat(string habitat)
    {
        if (_habitat == habitat) return;
        _habitat = habitat;
        BackColor = Habitats.Find(habitat).Background;
        _webView.DefaultBackgroundColor = BackColor;
        LoadScene();
    }

    public void SetPopulation(string population)
    {
        if (_population == population) return;
        _population = population;
        LoadScene();
    }

    public void SetQuality(string quality)
    {
        if (_quality == quality) return;
        _quality = quality;
        LoadScene();
    }

    // The scene's dock controls as JSON (see scenes/shared/host-controls.js), or null.
    public async Task<string?> GetControlsJsonAsync()
    {
        if (!_loaded || !_controlsReady) return null;
        try
        {
            var result = await _webView.ExecuteScriptAsync(
                "typeof window.habitatControls === 'function' ? JSON.stringify(window.habitatControls()) : null");
            return result == "null" ? null : JsonSerializer.Deserialize<string>(result);
        }
        catch (Exception ex)
        {
            Logger.Warn($"[WallpaperWindow] Could not read the scene's controls: {ex.Message}");
            return null;
        }
    }

    // Runs a dock action, or sets a toggle or choice to a JSON value.
    public void RunControl(string id, string? valueJson)
    {
        if (!_loaded || !_controlsReady) return;
        var value = string.IsNullOrEmpty(valueJson) ? "undefined" : valueJson;
        _ = _webView.ExecuteScriptAsync(
            $"typeof window.habitatControl === 'function' && window.habitatControl({JsonSerializer.Serialize(id)}, {value});");
    }

    // A click with a dock tool, at a point on the screen.
    public void UseTap(string tool, Point physPoint)
    {
        if (!_loaded || _rate <= 0) return;
        var (x, y) = ToCss(physPoint);
        _ = _webView.ExecuteScriptAsync(
            $"typeof window.habitatUse === 'function' && window.habitatUse({JsonSerializer.Serialize(tool)}, {{ phase: 'tap', x: {x}, y: {y} }});");
    }

    private (string X, string Y) ToCss(Point physPoint)
    {
        double cssX = (physPoint.X - _screen.Bounds.Left) * _cssScale;
        double cssY = (physPoint.Y - _screen.Bounds.Top) * _cssScale;
        return (cssX.ToString("F1", CultureInfo.InvariantCulture), cssY.ToString("F1", CultureInfo.InvariantCulture));
    }

    // A drag with a dock tool. The scene decides what a drag that starts is for: for the
    // fish, begun on the ones held selected it picks them up ("herd"), anywhere else it draws
    // a marquee ("select"); a scene may also just take it ("herd") or ignore it ("none").
    // Points may lie off this screen; a marquee spanning monitors is shared.
    public async Task<string> BeginDragPhysical(string tool, Point start, Point current)
    {
        if (!_loaded || _rate <= 0) return "none";
        try
        {
            var result = await _webView.ExecuteScriptAsync(DragScript(tool, "start", start, current));
            return result.Trim('"');
        }
        catch
        {
            return "none";
        }
    }

    // "move", "end" or "cancel".
    public void DragPhysical(string tool, string phase, Point start, Point current)
    {
        if (!_loaded) return;
        _ = _webView.ExecuteScriptAsync(DragScript(tool, phase, start, current));
    }

    private string DragScript(string tool, string phase, Point start, Point current)
    {
        var (x0, y0) = ToCss(start);
        var (x, y) = ToCss(current);
        return $"typeof window.habitatUse === 'function' ? window.habitatUse({JsonSerializer.Serialize(tool)}, {{ phase: '{phase}', x0: {x0}, y0: {y0}, x: {x}, y: {y} }}) : 'none';";
    }

    public bool SetRate(int wanted)
    {
        if (wanted == _rate) return false;
        _rate = wanted;

        if (_rate == 0 && _inside)
        {
            if (_loaded)
            {
                _ = _webView.ExecuteScriptAsync("window.habitatPointerOut && window.habitatPointerOut();");
            }
            _inside = false;
        }

        SendState();
        return true;
    }

    public void SetPower(bool onBattery)
    {
        if (_battery == onBattery) return;
        _battery = onBattery;
        SendState();
    }

    public void Feed()
    {
        if (!_loaded || _rate <= 0) return;
        _ = _webView.ExecuteScriptAsync("typeof window.habitatFeed === 'function' && window.habitatFeed();");
    }

    public void SetPointer(Point? point)
    {
        if (!_loaded || _rate <= 0) return;

        if (point == null)
        {
            if (_inside)
            {
                _ = _webView.ExecuteScriptAsync("window.habitatPointerOut && window.habitatPointerOut();");
            }
            _inside = false;
            return;
        }

        _inside = true;
        double cssX = point.Value.X * _cssScale;
        double cssY = point.Value.Y * _cssScale;
        var x = cssX.ToString("F1", CultureInfo.InvariantCulture);
        var y = cssY.ToString("F1", CultureInfo.InvariantCulture);
        _ = _webView.ExecuteScriptAsync($"window.habitatPointer && window.habitatPointer({x}, {y});");
    }

    public void SetPointerPhysical(Point? physPoint)
    {
        if (!_loaded || _rate <= 0) return;

        if (physPoint == null)
        {
            if (_inside)
            {
                _ = _webView.ExecuteScriptAsync("window.habitatPointerOut && window.habitatPointerOut();");
            }
            _inside = false;
            return;
        }

        _inside = true;
        double cssX = (physPoint.Value.X - _screen.Bounds.Left) * _cssScale;
        double cssY = (physPoint.Value.Y - _screen.Bounds.Top) * _cssScale;
        var x = cssX.ToString("F1", CultureInfo.InvariantCulture);
        var y = cssY.ToString("F1", CultureInfo.InvariantCulture);
        _ = _webView.ExecuteScriptAsync($"window.habitatPointer && window.habitatPointer({x}, {y});");
    }

    public void ClickPhysical(Point physPoint)
    {
        if (!_loaded || _rate <= 0) return;

        double cssX = (physPoint.X - _screen.Bounds.Left) * _cssScale;
        double cssY = (physPoint.Y - _screen.Bounds.Top) * _cssScale;
        var x = cssX.ToString("F1", CultureInfo.InvariantCulture);
        var y = cssY.ToString("F1", CultureInfo.InvariantCulture);
        _ = _webView.ExecuteScriptAsync($"window.habitatClick && window.habitatClick({x}, {y});");
    }

    public void SetPlayMode(bool active)
    {
        _playModeActive = active;
        if (!_loaded) return;
        var act = active ? "true" : "false";
        _ = _webView.ExecuteScriptAsync($"typeof window.habitatPlayMode === 'function' && window.habitatPlayMode({act});");
    }

    public void ClearSelection()
    {
        if (!_loaded) return;
        _ = _webView.ExecuteScriptAsync("typeof window.habitatSelect === 'function' && window.habitatSelect('clear');");
    }

    private void SendState()
    {
        if (!_loaded) return;
        var bat = _battery ? "true" : "false";
        var play = _playModeActive ? "true" : "false";
        _ = _webView.ExecuteScriptAsync($@"
            typeof window.habitatPower === 'function' && window.habitatPower({bat});
            typeof window.habitatRate === 'function' && window.habitatRate({_rate});
            typeof window.habitatPlayMode === 'function' && window.habitatPlayMode({play});
        ");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _webView.Dispose();
        }
        base.Dispose(disposing);
    }
}
