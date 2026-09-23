# Desktop Habitats

[![Desktop Habitats aquarium demo](docs/images/demo.gif)](docs/videos/demo.mp4)

Have you always wanted an aquarium? Now you can have it, right on your desktop :)

The fish react to your cursor and compete for food, while the plants sway in a slow current. There are two environments: **Riverscape**, a planted freshwater aquarium, and **Reefscape**, a saltwater tank.

![Reefscape, a saltwater tank with clownfish around an anemone](docs/images/reefscape-wide.png)

The scene is rendered live with Three.js and WebGL2. Everything runs locally, with no account or internet connection needed after setup. Desktop wallpaper support is **macOS only** for now; both environments also run in a browser. The Mac app starts with Riverscape and remembers the environment you pick from its menu.

## Install on Mac

You need macOS 13 or newer and the Xcode command line tools. To install the tools, open Terminal and run:

```sh
xcode-select --install
```

Wait for that installation to finish. Download and unzip this repository, or clone it, then open Terminal in the project folder and run:

```sh
sh wallpaper/install.sh
```

The script builds the app for your Mac, installs it at `~/Applications/Desktop Habitats.app`, and starts it. It also adds a login item so the aquarium starts when you sign in. Allow about 20 seconds for the first frame to appear.

During installation, macOS may ask whether Terminal can control System Events. This lets the installer set a still image of the aquarium as your desktop picture, underneath the animation. You can decline; the live wallpaper will still work.

## Install on Windows

You need Windows 10 or Windows 11 and the [.NET 8 SDK](https://dotnet.microsoft.com/download) (or run with pre-installed .NET 8 Desktop Runtime).

### Quick Install (Double-Click)
Simply **double-click [`Install.cmd`](Install.cmd)** in the project folder.

### Command Line
Or run in PowerShell / Terminal:

```powershell
powershell -ExecutionPolicy Bypass -File wallpaper/install.ps1
```

Or with npm:

```sh
npm run wallpaper:win
```

The script builds Desktop Habitats, installs it to `%LOCALAPPDATA%\Programs\DesktopHabitats`, adds a shortcut to your Start Menu and Startup folder, and starts the aquarium immediately.

### Uninstall
- **Double-click [`Uninstall.cmd`](Uninstall.cmd)** in the project folder
- Or open the Windows Start Menu and select **Uninstall Desktop Habitats**
- Or run `npm run unwallpaper:win` in PowerShell

## Use the wallpaper

Click the fish icon in the menu bar (macOS) or system tray (Windows):

- **Environment** switches every screen between Riverscape and Reefscape and remembers your choice.
- **Feed** drops ten pellets into each screen's tank, or eight in Reefscape. Uneaten pellets dissolve after 20–40 seconds of running simulation time in Riverscape and 36 seconds in Reefscape, measured from when they touch the water.
- **Pause / Resume** controls the animation. Your choice is remembered across restarts.
- **Quit** closes the app until you open it again or next sign in.

On Windows the tray menu also has:

- **Fish behaviour**: **Shy** fish dart away from a fast-moving cursor. **Curious** fish gather around a nearby cursor and lose interest after it sits still for a while; a sudden lunge still startles them.
- **Population**: Few, Normal, Lots or Crowded. Changing it restocks every tank.
- **Add a fish** sends one more fish swimming in from the side of the tank under your cursor, up to 20 extra. Added fish last until the population changes or the app restarts.
- **Click to feed**: a single click on empty desktop drops a pinch of food at that spot. Clicks on icons, double-clicks and quick repeats are ignored.
- **Select fish by dragging**: fish inside the blue box Windows draws when you drag on the desktop light up and turn to look.
- **Play mode** (or **Ctrl+Alt+F**): the desktop stops responding to the mouse so you can play with the fish. Drag to select fish, drag again to herd them, right-click to feed, and press Esc or Ctrl+Alt+F to leave. Play mode also ends by itself after a minute without input.

Move your cursor near the fish to see them react. Desktop icons, clicks and dragging work as usual outside play mode.

## FAQ

### Does it work on Windows or Linux?

Desktop wallpaper support is available for **macOS and Windows**. Linux users can still enjoy both environments directly in a browser.

### Will it drain my battery?

It uses more power than a still wallpaper because it renders a 3D scene. The amount depends on your Mac, screen resolution and number of displays. There isn't a measured battery-life estimate yet.

Both scenes use the same quality profiles and stop rendering when paused or hidden. The wallpaper also responds to window coverage, battery power, Low Power Mode and screen sleep.

With the default Balanced profile, both environments use these limits:

| Desktop state | Frame rate |
| --- | --- |
| Clearly visible, plugged in or on battery | Up to 30 fps |
| Mostly covered by windows | Up to 20 fps |
| Almost entirely covered | Stopped |
| Low Power Mode, locked screen or sleeping display | Stopped |

Pause it from the menu when you want a still aquarium, or quit to close the app completely. The browser previews offer Eco, Balanced and Detail profiles; actual frame rates depend on the device and scene. Battery life has not been measured.

### Does it monitor my keystrokes?

No. The wallpaper does not listen to typing in other apps or record keystrokes. Both browser previews handle Space to pause or resume, F for fullscreen, and H to hide or show controls while the aquarium has focus.

The wallpaper reads your cursor position so the fish can react. It also checks window positions and sizes to estimate how much of the desktop is visible. It does not capture the contents of those windows, store cursor history, or send this information anywhere.

### Does it need internet access or special permissions?

Once installed, the aquarium works offline. Its code, textures and Three.js library are bundled with the app. There are no analytics or external services.

The app does not request Accessibility, Input Monitoring or Screen Recording access. The optional System Events prompt during installation is for changing the still desktop picture.

### Why have the fish stopped moving?

Open the fish menu to see the current status. The wallpaper stops when it is almost entirely covered, in Low Power Mode, and while the screen is locked or asleep.

If Reduce Motion is enabled in macOS, the aquarium starts paused unless you have already saved a different choice. Choose **Resume** to animate it. Low Power Mode must be turned off before animation can resume.

### Can I use multiple monitors?

Yes. Each display gets its own aquarium, and **Feed** drops food on every display. Each tank renders separately, so more displays can increase power use.

### Do I need to leave Terminal open?

No. The installed app has its own copy of the scene and runs independently. You can close Terminal once installation finishes.

### How do I update it?

Download or pull the latest source, then rerun `sh wallpaper/install.sh` from the project folder. Editing the source alone does not update the installed app. If you installed the earlier Aquatica version, the installer removes its app and login item before starting Desktop Habitats. Its old still image and saved preference are left behind; the new app starts with its own preference.

### How do I remove it and get my old wallpaper back?

From the project folder, run:

```sh
sh wallpaper/uninstall.sh
```

Or use `npm run unwallpaper`. This stops the app, removes its login item and deletes the installed app.

The still image at `~/Pictures/Desktop Habitats.png` stays behind, along with the desktop picture setting. Choose your previous wallpaper in System Settings, then delete the image if you no longer want it. The saved pause and environment preferences are also retained.

## Try it in a browser

With Node.js 20 or newer, run this from the project folder:

```sh
npm start
```

Open [the local preview](http://127.0.0.1:8080). There is no `npm install` step; the library is included. Use `PORT=8081 npm start` if port 8080 is busy, and Ctrl+C to stop the server.

- Click the water to drop food.
- Move the pointer near the fish to interact.
- Swipe or scroll through the gallery, or use the left and right arrow keys. Open the image or name to enter a scene.
- Use **Pause / Resume**, **Feed**, **Fullscreen** and **Hide controls** in either scene. **Show controls** brings the controls back.
- Press **Space** to pause or resume, **F** for fullscreen, and **H** to hide or show controls while the aquarium has focus.
- **Quality** offers Eco (20 fps), Balanced (30 fps, the default) and Detail (60 fps). The selection is shared between the two scenes and remembered. These are frame-rate caps; lower profiles also reduce rendering resolution.

Reduce Motion starts the preview paused. Serve the page over HTTP; opening `index.html` directly will not load its JavaScript modules. Any static server also works, such as `python3 -m http.server 8080 --bind 127.0.0.1` if you have Python installed.


## Credits and license

Desktop Habitats is [MIT licensed](LICENSE). Three.js 0.180.0 is bundled under its [MIT license](vendor/THREE-LICENSE.txt).

The rock, wood and sand textures come from Poly Haven under [CC0](https://polyhaven.com/license): [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry), [Rough Wood](https://polyhaven.com/a/rough_wood) and [Sand 01](https://polyhaven.com/a/sand_01). Reefscape's rock mesh, pore maps, coral texture and organism meshes are procedural, generated by the scripts in `tools/`.
