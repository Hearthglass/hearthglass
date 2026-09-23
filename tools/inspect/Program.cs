using System;
using System.Text;
using System.Runtime.InteropServices;

class Program
{
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();

    static void Main()
    {
        IntPtr shell = GetShellWindow();
        var sbShell = new StringBuilder(256);
        GetClassName(shell, sbShell, 256);
        Console.WriteLine($"GetShellWindow: 0x{shell.ToInt64():X8} Class: {sbShell}");

        IntPtr dt = GetDesktopWindow();
        Console.WriteLine($"GetDesktopWindow: 0x{dt.ToInt64():X8}");

        int count = 0;
        EnumWindows((hWnd, lParam) =>
        {
            count++;
            var sbClass = new StringBuilder(256);
            GetClassName(hWnd, sbClass, 256);
            var sbText = new StringBuilder(256);
            GetWindowText(hWnd, sbText, 256);
            if (count <= 25 || sbClass.ToString().IndexOf("progman", StringComparison.OrdinalIgnoreCase) >= 0 || sbClass.ToString().IndexOf("worker", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                Console.WriteLine($"HWND: 0x{hWnd.ToInt64():X8} Class: {sbClass} Title: '{sbText}'");
            }
            return true;
        }, IntPtr.Zero);
        Console.WriteLine($"Total windows enumerated: {count}");
    }
}
