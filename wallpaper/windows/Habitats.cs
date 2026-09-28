using System.Drawing;

namespace Hearthglass;

// The scenes the app can show, each a directory under scenes/ with a wallpaper.html, the
// colour the window shows before the page has drawn, matched to each scene's own dark, and
// the accent the control dock takes on for it.
public static class Habitats
{
    public sealed record Habitat(string Id, string Title, Color Background, string Accent);

    public static readonly IReadOnlyList<Habitat> All =
    [
        new("riverscape", "Riverscape", Color.FromArgb(8, 14, 12), "#8fd6a8"),
        new("reefscape", "Reefscape", Color.FromArgb(11, 24, 37), "#5fd0e6"),
        new("moonspire", "Moonspire", Color.FromArgb(10, 10, 29), "#b69cff"),
        new("pixelreef", "Pixel Reef", Color.FromArgb(6, 22, 41), "#56c7ff"),
    ];

    public static Habitat Find(string? id) => All.FirstOrDefault(h => h.Id == id) ?? All[0];
}
