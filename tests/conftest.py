from pathlib import Path
from uuid import uuid4
import pytest


@pytest.fixture
def tmp_path():
    # Keep each run's isolated DB in the ignored workspace artifact directory.
    # Windows sandbox temp directories may reject pytest's POSIX mode=0700.
    path = Path(__file__).resolve().parents[1] / "artifacts" / "tests" / str(uuid4())
    path.mkdir(parents=True)
    return path
