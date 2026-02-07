from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, List, Tuple


@dataclass(frozen=True)
class InvoiceLineInput:
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    tax_rate: Decimal


@dataclass(frozen=True)
class InvoiceTotals:
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal


def calculate_line_totals(line: InvoiceLineInput) -> Tuple[Decimal, Decimal, Decimal]:
    line_subtotal = (line.quantity * line.unit_price) - line.discount
    tax_amount = line_subtotal * line.tax_rate
    line_total = line_subtotal + tax_amount
    return (line_subtotal, tax_amount, line_total)


def calculate_invoice_totals(lines: Iterable[InvoiceLineInput]) -> InvoiceTotals:
    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    total = Decimal("0.00")
    for line in lines:
        line_subtotal, tax_amount, line_total = calculate_line_totals(line)
        subtotal += line_subtotal
        tax_total += tax_amount
        total += line_total
    return InvoiceTotals(subtotal=subtotal, tax_total=tax_total, total=total)


@dataclass(frozen=True)
class PaymentApplicationInput:
    invoice_id: int
    invoice_balance: Decimal
    applied_amount: Decimal


def validate_payment_applications(
    payment_amount: Decimal, applications: List[PaymentApplicationInput]
) -> None:
    if payment_amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")
    total_applied = sum(app.applied_amount for app in applications)
    if total_applied != payment_amount:
        raise ValueError("Applied amounts must equal the payment amount.")
    for application in applications:
        if application.applied_amount <= 0:
            raise ValueError("Applied amounts must be greater than zero.")
        if application.applied_amount > application.invoice_balance:
            raise ValueError("Applied amount exceeds invoice balance.")
