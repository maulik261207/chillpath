import io, zipfile
import pytest
from app.services.historical_import import iter_measurements, validate_zip, parse_archive

def test_semicolon_timestamp_and_missing_values():
    rows = list(iter_measurements(io.StringIO("Date;Time;Temperature;Humidity\n02.09.2024;09:35:25;21.2;\n"), "SENSOR01"))
    assert rows[0][1].isoformat() == "2024-09-02T09:35:25"
    assert rows[0][2] == 21.2 and rows[0][3] is None

def test_zip_path_traversal_rejected(tmp_path):
    path = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("../evil.csv", "x")
    with pytest.raises(ValueError, match="unsafe archive path"):
        validate_zip(path)

def test_archive_requires_exact_sensor_members(tmp_path):
    path = tmp_path / "partial.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("SENSOR01_preprocessed.csv", "Date;Time;Temperature;Humidity\n")
    with pytest.raises(ValueError, match="missing"):
        validate_zip(path)
