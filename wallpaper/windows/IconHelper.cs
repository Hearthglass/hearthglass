using System.Drawing;
using System.Drawing.Drawing2D;

namespace DesktopHabitats;

public static class IconHelper
{
    public static Icon CreateFishIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            using var brush = new SolidBrush(Color.FromArgb(235, 70, 185, 230));
            using var pen = new Pen(Color.FromArgb(255, 120, 215, 255), 1.5f);

            // Fish body path
            using var bodyPath = new GraphicsPath();
            bodyPath.AddBezier(
                new PointF(27, 16),
                new PointF(21, 7),
                new PointF(9, 9),
                new PointF(5, 16));
            bodyPath.AddBezier(
                new PointF(5, 16),
                new PointF(9, 23),
                new PointF(21, 25),
                new PointF(27, 16));
            bodyPath.CloseFigure();

            g.FillPath(brush, bodyPath);
            g.DrawPath(pen, bodyPath);

            // Tail fin
            using var tailPath = new GraphicsPath();
            tailPath.AddPolygon([
                new PointF(6, 16),
                new PointF(2, 9),
                new PointF(4, 16),
                new PointF(2, 23)
            ]);

            g.FillPath(brush, tailPath);
            g.DrawPath(pen, tailPath);

            // Eye
            using var eyeBrush = new SolidBrush(Color.White);
            g.FillEllipse(eyeBrush, 21, 13, 3, 3);

            using var pupilBrush = new SolidBrush(Color.FromArgb(10, 25, 45));
            g.FillEllipse(pupilBrush, 22.5f, 13.5f, 1.5f, 1.5f);
        }

        var hIcon = bmp.GetHicon();
        return Icon.FromHandle(hIcon);
    }
}
