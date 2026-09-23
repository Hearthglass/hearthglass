namespace DesktopHabitats;

public static class Logger
{
    private static readonly string LogDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DesktopHabitats");
    private static readonly string LogFile = Path.Combine(LogDir, "desktop-habitats.log");
    private static readonly object LockObj = new();

    static Logger()
    {
        try
        {
            if (!Directory.Exists(LogDir))
            {
                Directory.CreateDirectory(LogDir);
            }
        }
        catch { }
    }

    public static void Info(string message) => Log("INFO", message);
    public static void Warn(string message) => Log("WARN", message);
    public static void Error(string message) => Log("ERROR", message);

    private static void Log(string level, string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}";
        Console.WriteLine(line);

        lock (LockObj)
        {
            try
            {
                File.AppendAllText(LogFile, line + Environment.NewLine);
            }
            catch { }
        }
    }
}
