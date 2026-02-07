from decimal import Decimal

import pytest

from app.sales.calculations import (
    InvoiceLineInput,
    PaymentApplicationInput,
    calculate_invoice_totals,
    validate_payment_applications,
)


def test_calculate_invoice_totals():
    lines = [
        InvoiceLineInput(
            quantity=Decimal("2"),
            unit_price=Decimal("100.00"),
            discount=Decimal("10.00"),
            tax_rate=Decimal("0.10"),
        ),
        InvoiceLineInput(
            quantity=Decimal("1"),
            unit_price=Decimal("50.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
        ),
    ]
    totals = calculate_invoice_totals(lines)
    assert totals.subtotal == Decimal("240.00")
    assert totals.tax_total == Decimal("19.00")
    assert totals.total == Decimal("259.00")


def test_validate_payment_applications_blocks_overpayment():
    with pytest.raises(ValueError):
        validate_payment_applications(
            Decimal("100.00"),
            [
                PaymentApplicationInput(
                    invoice_id=1, invoice_balance=Decimal("80.00"), applied_amount=Decimal("100.00")
                )
            ],
        )


def test_validate_payment_applications_requires_exact_total():
    with pytest.raises(ValueError):
        validate_payment_applications(
            Decimal("100.00"),
            [
                PaymentApplicationInput(
                    invoice_id=1, invoice_balance=Decimal("100.00"), applied_amount=Decimal("60.00")
                )
            ],
        )
