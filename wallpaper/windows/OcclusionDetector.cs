using System.Diagnostics;
using System.Drawing;

namespace Hearthglass;

public static class OcclusionDetector
{
    private static readonly uint CurrentPid = (uint)Process.GetCurrentProcess().Id;

    private static readonly HashSet<string> ShellClasses =
    [
        "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd",
        "Windows.UI.Core.CoreWindow", "NotifyIconOverflowWindow", "TopLevelWindowForOverflowXamlIsland"
    ];

    public static List<Rectangle> GetWindowBlockers()
    {
        var blockers = new List<Rectangle>();
        var sb = new System.Text.StringBuilder(256);

        NativeMethods.EnumWindows((hWnd, lParam) =>
        {
            if (!NativeMethods.IsWindowVisible(hWnd) || NativeMethods.IsIconic(hWnd)) return true;

            NativeMethods.GetWindowThreadProcessId(hWnd, out uint pid);
            if (pid == CurrentPid) return true;

            // Suspended UWP apps and windows on other virtual desktops are "visible" but cloaked.
            if (NativeMethods.DwmGetWindowAttribute(hWnd, NativeMethods.DWMWA_CLOAKED, out int cloaked, sizeof(int)) == 0 && cloaked != 0)
                return true;

            long ex = NativeMethods.GetWindowLongPtr(hWnd, NativeMethods.GWL_EXSTYLE).ToInt64();
            if ((ex & NativeMethods.WS_EX_TOOLWINDOW) != 0) return true;

            sb.Clear();
            NativeMethods.GetClassName(hWnd, sb, sb.Capacity);
            if (ShellClasses.Contains(sb.ToString())) return true;

            if (NativeMethods.GetWindowRect(hWnd, out var rect))
            {
                // Only consider windows with meaningful size
                if (rect.Width > 50 && rect.Height > 50)
                {
                    blockers.Add(new Rectangle(rect.Left, rect.Top, rect.Width, rect.Height));
                }
            }

            return true;
        }, IntPtr.Zero);

        return blockers;
    }

    public static double CalculateExposure(Rectangle screenBounds, List<Rectangle> blockers)
    {
        if (blockers.Count == 0) return 1.0;

        const int columns = 16;
        const int rows = 10;
        int free = 0;

        for (int col = 0; col < columns; col++)
        {
            for (int row = 0; row < rows; row++)
            {
                int x = (int)(screenBounds.Left + screenBounds.Width * (col + 0.5) / columns);
                int y = (int)(screenBounds.Top + screenBounds.Height * (row + 0.5) / rows);

                bool covered = false;
                for (int i = 0; i < blockers.Count; i++)
                {
                    if (blockers[i].Contains(x, y))
                    {
                        covered = true;
                        break;
                    }
                }

                if (!covered)
                {
                    free++;
                }
            }
        }

        return (double)free / (columns * rows);
    }
}
