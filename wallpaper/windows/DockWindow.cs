using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DesktopHabitats;

// The control dock: ui/dock.html in a small transparent window, always on top, that never
// takes focus, at the bottom (or top) centre of the main screen's working area. The page
// says how big it is drawn and the window is fitted around it; everything it is clicked for
// comes back through Message.
public sealed class DockWindow : Form
{
    private readonly WebView2 _webView;
    private readonly string _assetsRoot;
    private bool _ready;
    private string? _pendingState;
    private Size _content = new(160, 46);
    private string _edge = "bottom";

    // A message from the page (anything but its size).
    public event Action<JsonElement>? DockMessage;

    public DockWindow(string assetsRoot)
    {
        _assetsRoot = assetsRoot;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.Black;
        Bounds = Place(_content);
        _webView = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Transparent };
        Controls.Add(_webView);
    }

    public string Edge
    {
        get => _edge;
        set { _edge = value == "top" ? "top" : "bottom"; Reposition(); }
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= NativeMethods.WS_EX_TOOLWINDOW | NativeMethods.WS_EX_NOACTIVATE |
                          NativeMethods.WS_EX_TOPMOST | NativeMethods.WS_EX_NOREDIRECTIONBITMAP;
            return cp;
        }
    }

    protected override void WndProc(ref Message m)
    {
        // Clicking the dock leaves the focus with whatever app had it.
        if (m.Msg == NativeMethods.WM_MOUSEACTIVATE)
        {
            m.Result = (IntPtr)NativeMethods.MA_NOACTIVATE;
            return;
        }
        base.WndProc(ref m);
    }

    // Nothing is painted behind the page.
    protected override void OnPaintBackground(PaintEventArgs e) { }

    public async Task InitializeAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DesktopHabitats", "WebView2Data");
        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await _webView.EnsureCoreWebView2Async(env);
        var core = _webView.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.SetVirtualHostNameToFolderMapping("desktop-habitats.local", _assetsRoot, CoreWebView2HostResourceAccessKind.Allow);
        core.WebMessageReceived += OnWebMessage;
        core.Navigate("https://desktop-habitats.local/ui/dock.html");
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            using var doc = JsonDocument.Parse(args.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.String)
            {
                Logger.Info($"[Dock] {root.GetString()}");
                return;
            }
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "size")
            {
                _content = new Size(
                    Math.Clamp(root.GetProperty("width").GetInt32(), 40, 2400),
                    Math.Clamp(root.GetProperty("height").GetInt32(), 20, 1400));
                Reposition();
                return;
            }
            if (type == "ready")
            {
                _ready = true;
                if (_pendingState != null) PushState(_pendingState);
            }
            DockMessage?.Invoke(root.Clone());
        }
        catch (Exception ex)
        {
            Logger.Warn($"[Dock] Unreadable message: {ex.Message}");
        }
    }

    // The whole state as a JSON object; see ui/dock.js.
    public void PushState(string json)
    {
        _pendingState = json;
        if (!_ready || _webView.CoreWebView2 == null) return;
        _ = _webView.ExecuteScriptAsync($"window.dockState && window.dockState({json});");
    }

    private static Screen MainScreen => Screen.PrimaryScreen ?? Screen.AllScreens[0];

    private Rectangle Place(Size size)
    {
        var area = MainScreen.WorkingArea;
        int w = Math.Min(size.Width, area.Width), h = Math.Min(size.Height, area.Height);
        int x = area.Left + (area.Width - w) / 2;
        int y = _edge == "top" ? area.Top : area.Bottom - h;
        return new Rectangle(x, y, w, h);
    }

    public void Reposition()
    {
        var bounds = Place(_content);
        if (bounds == Bounds && IsHandleCreated) return;
        if (!IsHandleCreated) { Bounds = bounds; return; }
        NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, bounds.X, bounds.Y, bounds.Width, bounds.Height,
            NativeMethods.SWP_NOACTIVATE);
    }

    // Back above everything, including a tool's full-screen layer (also always on top).
    public void BringToTop()
    {
        if (!IsHandleCreated || !Visible) return;
        NativeMethods.SetWindowPos(Handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
            NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE);
    }

    public void SetShown(bool shown)
    {
        if (shown == Visible) return;
        if (shown)
        {
            Reposition();
            Show();
            BringToTop();
        }
        else
        {
            Hide();
        }
    }

    public bool ContainsCursor(int slack = 0)
    {
        if (!Visible) return false;
        var r = Bounds;
        r.Inflate(slack, slack);
        return r.Contains(Cursor.Position);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _webView.Dispose();
        base.Dispose(disposing);
    }
}
