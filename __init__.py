"""URN Arcade Games - standalone playable ComfyUI frontend arcade nodes."""

WEB_DIRECTORY = "./web"

# Editable external WAV sound packs live under Sounds/<Game>/.
# Update packages intentionally omit Sounds so user-customised WAVs are preserved.
from pathlib import Path as _Path

_SOUNDS_DIR = (_Path(__file__).resolve().parent / "Sounds").resolve()
_ALLOWED_SOUND_GAMES = {"Pacman", "SpaceInvaders", "Frogger", "MissileCommand", "LunarLander"}

try:
    from aiohttp import web as _web
    from server import PromptServer as _PromptServer

    @_PromptServer.instance.routes.get("/urn_arcade/sounds/{game}/{filename}")
    async def _urn_arcade_sound(request):
        game = request.match_info.get("game", "")
        filename = request.match_info.get("filename", "")
        if game not in _ALLOWED_SOUND_GAMES or not filename.lower().endswith(".wav"):
            raise _web.HTTPNotFound()
        if _Path(filename).name != filename:
            raise _web.HTTPNotFound()
        path = (_SOUNDS_DIR / game / filename).resolve()
        game_dir = (_SOUNDS_DIR / game).resolve()
        if path.parent != game_dir or not path.is_file():
            raise _web.HTTPNotFound()
        return _web.FileResponse(path, headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        })
except Exception as _sound_route_error:
    print(f"[URN Arcade Games] WAV sound route unavailable: {_sound_route_error}")


class _BaseGameNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ()
    FUNCTION = "noop"
    OUTPUT_NODE = False
    CATEGORY = "URN Arcade Games"

    def noop(self, unique_id=None):
        return ()


class URNArcadePacMan(_BaseGameNode):
    DESCRIPTION = "Standalone PacMan-style arcade mini-game. No connections required."


class URNArcadeSpaceInvaders(_BaseGameNode):
    DESCRIPTION = "Standalone Space Invaders-style arcade mini-game. No connections required."


class URNArcadeFrogger(_BaseGameNode):
    DESCRIPTION = "Standalone Frogger-style arcade mini-game with road, river, logs, turtles and home slots."


class URNArcadeMissileCommand(_BaseGameNode):
    DESCRIPTION = "Standalone Missile Command-style arcade mini-game with crosshair targeting and interceptor missiles."


class URNArcadeLunarLander(_BaseGameNode):
    DESCRIPTION = "Standalone Lunar Lander-style vector arcade mini-game with gravity, thrust, fuel and precision landing pads."


NODE_CLASS_MAPPINGS = {
    "URNArcadePacMan": URNArcadePacMan,
    "URNArcadeSpaceInvaders": URNArcadeSpaceInvaders,
    "URNArcadeFrogger": URNArcadeFrogger,
    "URNArcadeMissileCommand": URNArcadeMissileCommand,
    "URNArcadeLunarLander": URNArcadeLunarLander,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "URNArcadePacMan": "URN Arcade PacMan",
    "URNArcadeSpaceInvaders": "URN Arcade Space Invaders",
    "URNArcadeFrogger": "URN Arcade Frogger",
    "URNArcadeMissileCommand": "URN Arcade Missile Command",
    "URNArcadeLunarLander": "URN Arcade Lunar Lander",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
