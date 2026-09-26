using System.Drawing;

namespace DesktopHabitats;

// The scenes the app can show, each a directory under scenes/ with a wallpaper.html, and
// the colour the window shows before the page has drawn, matched to each scene's own dark.
public static class Habitats
{
    public sealed record Habitat(string Id, string Title, Color Background);

    public static readonly IReadOnlyList<Habitat> All =
    [
        new("riverscape", "Riverscape", Color.FromArgb(8, 14, 12)),
        new("reefscape", "Reefscape", Color.FromArgb(11, 24, 37)),
        new("moonspire", "Moonspire", Color.FromArgb(10, 10, 29)),
        new("pixelreef", "Pixel Reef", Color.FromArgb(6, 22, 41)),
    ];

    public static Habitat Find(string? id) => All.FirstOrDefault(h => h.Id == id) ?? All[0];
}
