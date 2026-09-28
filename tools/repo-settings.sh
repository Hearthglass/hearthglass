#!/bin/sh
# The GitHub repo page's sidebar and features, kept here so they are reviewable and
# repeatable. Edit, then rerun: sh tools/repo-settings.sh
# The social preview image cannot be set through the API; upload it once under
# Settings > General > Social preview (docs/images/reefscape-wide.png works well).
set -eu

repo=hearthglass/hearthglass

gh repo edit "$repo" \
	--description "Cozy living wallpapers for Windows and macOS: two 3D aquariums, a pixel-art reef and a wizard's moonlit observatory." \
	--enable-issues \
	--enable-wiki=false \
	--enable-projects=false \
	--delete-branch-on-merge

gh repo edit "$repo" \
	--add-topic live-wallpaper \
	--add-topic wallpaper \
	--add-topic desktop \
	--add-topic aquarium \
	--add-topic pixel-art \
	--add-topic threejs \
	--add-topic webgl \
	--add-topic windows \
	--add-topic macos

# Once the browser demo is on GitHub Pages, point the website link at it:
# gh repo edit "$repo" --homepage https://hearthglass.github.io/hearthglass/

echo "Updated https://github.com/$repo"
