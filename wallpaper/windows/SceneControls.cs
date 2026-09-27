using System.Text.Json;
using System.Text.Json.Nodes;

namespace DesktopHabitats;

// What the scene on screen offers the control dock, as it answered window.habitatControls()
// (see scenes/shared/host-controls.js). The host only needs to know each control's kind,
// how a tool takes the mouse and whether a value is remembered; the dock gets it all.
public sealed class SceneControls
{
    public sealed record Control(string Id, string Kind, string Label, string Capture, bool Rapid, bool Persist);

    public static readonly SceneControls Empty = new(new JsonObject { ["controls"] = new JsonArray() }, []);

    public JsonObject Manifest { get; }
    public IReadOnlyList<Control> Controls { get; }

    private SceneControls(JsonObject manifest, IReadOnlyList<Control> controls)
    {
        Manifest = manifest;
        Controls = controls;
    }

    public Control? Find(string? id) => id == null ? null : Controls.FirstOrDefault(c => c.Id == id);

    public string? Accent => Manifest["accent"]?.GetValueKind() == JsonValueKind.String ? (string?)Manifest["accent"] : null;
    public bool Population => Manifest["population"]?.GetValueKind() == JsonValueKind.True;

    public static SceneControls Parse(string? json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json) || JsonNode.Parse(json) is not JsonObject manifest) return Empty;
            var controls = new List<Control>();
            if (manifest["controls"] is JsonArray list)
            {
                foreach (var node in list)
                {
                    if (node is not JsonObject c || Text(c, "id") is not { Length: > 0 } id) continue;
                    controls.Add(new Control(
                        id,
                        Text(c, "kind") ?? "action",
                        Text(c, "label") ?? id,
                        Text(c, "capture") == "overlay" ? "overlay" : "desktop",
                        c["rapid"]?.GetValueKind() == JsonValueKind.True,
                        c["persist"]?.GetValueKind() != JsonValueKind.False));
                }
            }
            return new SceneControls(manifest, controls);
        }
        catch (Exception ex)
        {
            Logger.Warn($"[Controls] Could not read the scene's controls: {ex.Message}");
            return Empty;
        }
    }

    private static string? Text(JsonObject o, string key) =>
        o[key]?.GetValueKind() == JsonValueKind.String ? (string?)o[key] : null;
}
