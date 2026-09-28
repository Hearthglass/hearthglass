namespace Hearthglass;

internal static class Program
{
    private const string MutexName = "Hearthglass_SingleInstance_Mutex_2026";
    // Set by a second launch (the desktop icon clicked while running); the running copy waits on it.
    public const string ActivateEventName = "Hearthglass_Activate_2026";

    [STAThread]
    private static void Main()
    {
        Logger.Info("[Program] Hearthglass starting...");
        using var mutex = new Mutex(true, MutexName, out bool isOnlyInstance);
        if (!isOnlyInstance)
        {
            Logger.Info("[Program] Already running; asking the running copy to show itself.");
            if (EventWaitHandle.TryOpenExisting(ActivateEventName, out var activate))
            {
                using (activate) activate.Set();
            }
            return;
        }

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            Logger.Info("[Program] Launching WallpaperController...");
            Application.Run(new WallpaperController());
        }
        catch (Exception ex)
        {
            Logger.Error($"[Program] Unhandled exception: {ex.Message}\n{ex.StackTrace}");
            MessageBox.Show(
                $"An unexpected error occurred in Hearthglass:\n\n{ex.Message}\n{ex.StackTrace}",
                "Hearthglass Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
