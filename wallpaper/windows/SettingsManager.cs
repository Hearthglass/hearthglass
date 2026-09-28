using System.Text.Json;
using Microsoft.Win32;

namespace Hearthglass;

public class AppSettings
{
    public string Habitat { get; set; } = "riverscape";
    public bool Paused { get; set; } = false;
    public bool StartWithWindows { get; set; } = false;
    // Only read to carry an old shy/curious choice over into SceneValues.
    public string FishBehaviour { get; set; } = "shy";
    public string Population { get; set; } = "normal";
    // Render quality passed to the scenes: "eco", "balanced" or "detail". Detail draws a
    // screen at full resolution; the lower two cap the pixel count and frame rate.
    public string Quality { get; set; } = "detail";
    // The control dock: shown at all, and at the "bottom" or "top" of the main screen.
    public bool DockEnabled { get; set; } = true;
    public string DockEdge { get; set; } = "bottom";
    // The dock opens by itself once, so it is found.
    public bool DockIntroShown { get; set; } = false;
    // Each scene's toggles and choices from the dock, as JSON values by control id.
    public Dictionary<string, Dictionary<string, string>> SceneValues { get; set; } = new();
}

public static class SettingsManager
{
    private static readonly string AppDataFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Hearthglass");
    private static readonly string SettingsFile = Path.Combine(AppDataFolder, "settings.json");
    private const string RegistryRunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "Hearthglass";

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsFile))
            {
                var json = File.ReadAllText(SettingsFile);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                if (settings != null)
                {
                    // A scene that is no longer shipped falls back to the first one.
                    settings.Habitat = Habitats.Find(settings.Habitat).Id;
                    settings.SceneValues ??= new();
                    // The old tray-wide fish behaviour becomes each fish scene's mood.
                    foreach (var fishScene in new[] { "riverscape", "reefscape", "pixelreef" })
                    {
                        if (!settings.SceneValues.TryGetValue(fishScene, out var values))
                            settings.SceneValues[fishScene] = values = new();
                        if (!values.ContainsKey("mood"))
                            values["mood"] = JsonSerializer.Serialize(settings.FishBehaviour == "curious" ? "curious" : "shy");
                    }
                    return settings;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to load settings: {ex.Message}");
        }

        return new AppSettings();
    }

    public static void Save(AppSettings settings)
    {
        try
        {
            if (!Directory.Exists(AppDataFolder))
            {
                Directory.CreateDirectory(AppDataFolder);
            }

            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to save settings: {ex.Message}");
        }
    }

    public static void SetStartWithWindows(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegistryRunKey, true);
            if (key == null) return;

            if (enable)
            {
                var exePath = Environment.ProcessPath;
                if (!string.IsNullOrEmpty(exePath))
                {
                    key.SetValue(AppName, $"\"{exePath}\"");
                }
            }
            else
            {
                key.DeleteValue(AppName, false);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to configure startup registry key: {ex.Message}");
        }
    }
}
