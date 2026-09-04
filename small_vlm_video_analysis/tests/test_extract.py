"""extract_frames の入力検証テスト。"""
import sys
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from extract import extract_frames


class _FakeCap:
    def isOpened(self):
        return True

    def get(self, prop):
        if prop == cv2.CAP_PROP_FPS:
            return 0
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return 10
        return 0

    def release(self):
        pass


class _FakeCapZeroFrames:
    def isOpened(self):
        return True

    def get(self, prop):
        if prop == cv2.CAP_PROP_FPS:
            return 30.0
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return 0
        return 0

    def release(self):
        self.released = True


def test_extract_frames_rejects_invalid_fps(tmp_path: Path):
    with pytest.raises(ValueError, match="fps"):
        extract_frames("dummy.mp4", str(tmp_path), fps=0)


def test_extract_frames_rejects_invalid_video_fps(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(cv2, "VideoCapture", lambda _p: _FakeCap())
    with pytest.raises(ValueError, match="FPS"):
        extract_frames("x.mp4", str(tmp_path))


def test_extract_frames_rejects_zero_frame_count(monkeypatch, tmp_path: Path):
    cap = _FakeCapZeroFrames()
    monkeypatch.setattr(cv2, "VideoCapture", lambda _p: cap)
    with pytest.raises(ValueError, match="フレーム数"):
        extract_frames("x.mp4", str(tmp_path))
    assert getattr(cap, "released", False)
