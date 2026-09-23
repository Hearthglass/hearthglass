using System.Drawing;
using System.Globalization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DesktopHabitats;

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
    private string _fishBehaviour = "shy";
    private string _population = "normal";
    private string _quality = "detail";
    private bool _playModeActive = false;

    public Screen TargetScreen => _screen;
    public string CurrentHabitat => _habitat;
    public int CurrentRate => _rate;
    public double CssScale => _cssScale;

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
        BackColor = habitat == "reefscape"
            ? Color.FromArgb(11, 24, 37)
            : Color.FromArgb(8, 14, 12);

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
            "DesktopHabitats",
            "WebView2Data");

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await _webView.EnsureCoreWebView2Async(env);

        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

        // Map virtual domain to local scenes directory
        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "desktop-habitats.local",
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

        _webView.CoreWebView2.WebMessageReceived += (_, args) =>
        {
            Logger.Info($"[Scene] {args.TryGetWebMessageAsString()}");
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
        // The scene stocks its tank and picks its render budget from the URL when it is built.
        var page = $"/scenes/{_habitat}/wallpaper.html?population={Uri.EscapeDataString(_population)}&quality={Uri.EscapeDataString(_quality)}";
        _webView.CoreWebView2.Navigate($"https://desktop-habitats.local{page}");
    }

    public void SetHabitat(string habitat)
    {
        if (_habitat == habitat) return;
        _habitat = habitat;
        BackColor = habitat == "reefscape"
            ? Color.FromArgb(11, 24, 37)
            : Color.FromArgb(8, 14, 12);
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

    public void AddFish()
    {
        if (!_loaded || _rate <= 0) return;
        _ = _webView.ExecuteScriptAsync("typeof window.habitatAddFish === 'function' && window.habitatAddFish();");
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

    public void SetFishBehaviour(string behaviour)
    {
        _fishBehaviour = behaviour;
        if (!_loaded) return;
        _ = _webView.ExecuteScriptAsync($"typeof window.habitatMode === 'function' && window.habitatMode('{_fishBehaviour}');");
    }

    public void SelectPhysical(Point? physStart, Point? physCurrent)
    {
        if (!_loaded || _rate <= 0) return;

        if (physStart == null || physCurrent == null)
        {
            _ = _webView.ExecuteScriptAsync("typeof window.habitatSelect === 'function' && window.habitatSelect(null);");
            return;
        }

        int minX = Math.Min(physStart.Value.X, physCurrent.Value.X);
        int maxX = Math.Max(physStart.Value.X, physCurrent.Value.X);
        int minY = Math.Min(physStart.Value.Y, physCurrent.Value.Y);
        int maxY = Math.Max(physStart.Value.Y, physCurrent.Value.Y);

        int clipMinX = Math.Max(minX, _screen.Bounds.Left);
        int clipMaxX = Math.Min(maxX, _screen.Bounds.Right);
        int clipMinY = Math.Max(minY, _screen.Bounds.Top);
        int clipMaxY = Math.Min(maxY, _screen.Bounds.Bottom);

        if (clipMinX >= clipMaxX || clipMinY >= clipMaxY)
        {
            _ = _webView.ExecuteScriptAsync("typeof window.habitatSelect === 'function' && window.habitatSelect(null);");
            return;
        }

        double cssX0 = (clipMinX - _screen.Bounds.Left) * _cssScale;
        double cssY0 = (clipMinY - _screen.Bounds.Top) * _cssScale;
        double cssX1 = (clipMaxX - _screen.Bounds.Left) * _cssScale;
        double cssY1 = (clipMaxY - _screen.Bounds.Top) * _cssScale;

        var x0 = cssX0.ToString("F1", CultureInfo.InvariantCulture);
        var y0 = cssY0.ToString("F1", CultureInfo.InvariantCulture);
        var x1 = cssX1.ToString("F1", CultureInfo.InvariantCulture);
        var y1 = cssY1.ToString("F1", CultureInfo.InvariantCulture);

        _ = _webView.ExecuteScriptAsync($"typeof window.habitatSelect === 'function' && window.habitatSelect({{ x0: {x0}, y0: {y0}, x1: {x1}, y1: {y1} }});");
    }

    public void SetPlayMode(bool active)
    {
        _playModeActive = active;
        if (!_loaded) return;
        var act = active ? "true" : "false";
        _ = _webView.ExecuteScriptAsync($"typeof window.habitatPlayMode === 'function' && window.habitatPlayMode({act});");
    }

    public void HerdPhysical(bool active, Point physPoint)
    {
        if (!_loaded || _rate <= 0) return;
        double cssX = (physPoint.X - _screen.Bounds.Left) * _cssScale;
        double cssY = (physPoint.Y - _screen.Bounds.Top) * _cssScale;
        var x = cssX.ToString("F1", CultureInfo.InvariantCulture);
        var y = cssY.ToString("F1", CultureInfo.InvariantCulture);
        var act = active ? "true" : "false";
        _ = _webView.ExecuteScriptAsync($"typeof window.habitatHerd === 'function' && window.habitatHerd({{ active: {act}, x: {x}, y: {y} }});");
    }

    public void ClearSelection()
    {
        if (!_loaded) return;
        _ = _webView.ExecuteScriptAsync("typeof window.habitatSelect === 'function' && window.habitatSelect('clear');");
    }

    public async Task<int> GetSelectedFishCountAsync()
    {
        if (!_loaded) return 0;
        try
        {
            var res = await _webView.ExecuteScriptAsync("window.habitatSelectedCount || 0;");
            if (int.TryParse(res, NumberStyles.Integer, CultureInfo.InvariantCulture, out int count))
            {
                return count;
            }
        }
        catch
        {
            // Ignore execution errors
        }
        return 0;
    }

    private void SendState()
    {
        if (!_loaded) return;
        var bat = _battery ? "true" : "false";
        var play = _playModeActive ? "true" : "false";
        _ = _webView.ExecuteScriptAsync($@"
            typeof window.habitatPower === 'function' && window.habitatPower({bat});
            typeof window.habitatRate === 'function' && window.habitatRate({_rate});
            typeof window.habitatMode === 'function' && window.habitatMode('{_fishBehaviour}');
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
