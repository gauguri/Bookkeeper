import pytest

from app.auth import get_current_user
from app.main import app
from app.models import User


@pytest.fixture(autouse=True)
def override_auth(request):
    if request.node.get_closest_marker("real_auth"):
        yield
        return

    app.dependency_overrides[get_current_user] = lambda: User(
        id=1,
        company_id=1,
        email="admin@bedrock.local",
        full_name="Test Admin",
        password_hash="x",
        is_admin=True,
        is_active=True,
        role="admin",
    )
    yield
    app.dependency_overrides.pop(get_current_user, None)
