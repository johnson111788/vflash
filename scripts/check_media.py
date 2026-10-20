from pathlib import Path
root = Path(__file__).resolve().parents[1]
for path in (root / "assets/media").rglob("*.mp4"):
    with path.open("rb") as stream:
        header = stream.read(64)
    assert not header.startswith(b"version https://git-lfs.github.com/spec/"), f"Unresolved LFS pointer: {path}"
    assert header[4:8] == b"ftyp", f"Invalid MP4: {path}"
print("All deployed MP4 files contain real video data.")
