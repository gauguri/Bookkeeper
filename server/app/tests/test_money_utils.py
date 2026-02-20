from decimal import Decimal

from app.utils import quantize_money


def test_quantize_money_rounds_half_up():
    assert quantize_money(Decimal("137.423")) == Decimal("137.42")
    assert quantize_money(Decimal("137.425")) == Decimal("137.43")


def test_quantize_money_accepts_common_types_and_none():
    assert quantize_money(12) == Decimal("12.00")
    assert quantize_money(12.3) == Decimal("12.30")
    assert quantize_money("12.345") == Decimal("12.35")
    assert quantize_money(None) is None
