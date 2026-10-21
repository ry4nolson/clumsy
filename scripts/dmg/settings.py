# dmgbuild settings — used by scripts/create-dmg.sh
# Paths come from the environment (dmgbuild execs this without __file__).
import os

_app = os.environ["CLUMSY_DMG_APP"]
_background = os.environ["CLUMSY_DMG_BACKGROUND"]
_icon = os.environ.get("CLUMSY_DMG_ICON", "")

files = [_app]
symlinks = {"Applications": "/Applications"}
hide_extensions = ["Clumsy.app"]
icon_locations = {
    "Clumsy.app": (160, 175),
    "Applications": (500, 175),
}

window_rect = ((200, 120), (660, 420))
background = _background

icon_size = 128
text_size = 12
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False

if _icon:
    icon = _icon

format = "UDZO"
compression_level = 9
