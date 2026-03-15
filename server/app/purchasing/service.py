from datetime import date, datetime
from decimal import Decimal
import json
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.accounting.service import create_journal_entry
from app.gl import schemas as gl_schemas
from app.gl import service as gl_service
from app.inventory.service import land_inventory_from_purchase_order, receive_inventory
from app.models import (
    Account,
    CompanyCode,
    FiscalYearVariant,
    GLAccount,
    GLLedger,
    GLPostingLink,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseOrderSendLog,
    Supplier,
    SupplierItem,
)


COA_TO_GL_TYPE = {
    "ASSET": "ASSET",
    "LIABILITY": "LIABILITY",
    "EQUITY": "EQUITY",
    "INCOME": "REVENUE",
    "REVENUE": "REVENUE",
    "EXPENSE": "EXPENSE",
    "COGS": "EXPENSE",
    "OTHER": "EXPENSE",
}


def _next_po_number(db: Session) -> str:
    max_sequence = 0
    existing_numbers = db.query(PurchaseOrder.po_number).all()
    for (po_number,) in existing_numbers:
        if not po_number:
            continue
        match = re.search(r"(\d+)$", po_number)
        if not match:
            continue
        max_sequence = max(max_sequence, int(match.group(1)))
    return f"PO-{max_sequence + 1:05d}"


def po_items_subtotal(po: PurchaseOrder) -> Decimal:
    return sum((Decimal(line.qty_ordered or 0) * Decimal(line.unit_cost or 0) for line in po.lines), Decimal("0"))


def po_extra_costs_total(po: PurchaseOrder) -> Decimal:
    return Decimal(po.freight_cost or 0) + Decimal(po.tariff_cost or 0)


def po_total(po: PurchaseOrder) -> Decimal:
    return po_items_subtotal(po) + po_extra_costs_total(po)


def _supplier_item_link_or_error(db: Session, supplier_id: int, item: Item) -> SupplierItem:
    link = (
        db.query(SupplierItem)
        .filter(SupplierItem.supplier_id == supplier_id, SupplierItem.item_id == item.id)
        .first()
    )
    if link:
        return link

    supplier_name = db.query(Supplier.name).filter(Supplier.id == supplier_id).scalar() or f"Supplier #{supplier_id}"
    raise ValueError(
        f"Item {item.name} is not mapped to supplier {supplier_name}. Link supplier to item before creating PO."
    )


def _build_po_line(db: Session, supplier_id: int, payload: dict) -> PurchaseOrderLine:
    item = db.query(Item).filter(Item.id == payload["item_id"]).first()
    if not item:
        raise ValueError("Item not found.")

    link = _supplier_item_link_or_error(db, supplier_id, item)
    unit_cost = Decimal(payload.get("unit_cost") or (link.supplier_cost if link else 0))
    freight_cost = Decimal(payload.get("freight_cost") or (link.freight_cost if link else 0))
    tariff_cost = Decimal(payload.get("tariff_cost") or (link.tariff_cost if link else 0))
    landed_cost = unit_cost + freight_cost + tariff_cost
    return PurchaseOrderLine(
        item_id=item.id,
        qty_ordered=payload["quantity"],
        unit_cost=unit_cost,
        freight_cost=freight_cost,
        tariff_cost=tariff_cost,
        landed_cost=landed_cost,
    )


def create_purchase_order(db: Session, payload: dict) -> PurchaseOrder:
    lines_payload = payload.pop("lines")
    payload.setdefault("freight_cost", Decimal("0"))
    payload.setdefault("tariff_cost", Decimal("0"))
    if not payload.get("po_number"):
        payload["po_number"] = _next_po_number(db)
    po = PurchaseOrder(**payload)
    po.lines = [_build_po_line(db, po.supplier_id, line) for line in lines_payload]
    db.add(po)
    return po


def update_purchase_order(db: Session, po: PurchaseOrder, payload: dict) -> PurchaseOrder:
    if po.status not in {"DRAFT", "SENT"}:
        raise ValueError("Only DRAFT or SENT purchase orders can be edited.")

    lines_payload = payload.pop("lines", None)
    for key, value in payload.items():
        setattr(po, key, value)

    if lines_payload is not None:
        po.lines.clear()
        db.flush()
        po.lines = [_build_po_line(db, po.supplier_id, line) for line in lines_payload]
    return po


def send_purchase_order(db: Session, po: PurchaseOrder) -> PurchaseOrder:
    if not po.lines:
        raise ValueError("Purchase order must include at least one line item.")
    if any(Decimal(line.qty_ordered or 0) <= 0 for line in po.lines):
        raise ValueError("All line item quantities must be greater than zero.")

    supplier = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    if not supplier:
        raise ValueError("Supplier not found.")
    if not (supplier.email or supplier.phone):
        raise ValueError("Supplier must have contact info before sending.")

    log_payload = {
        "po_number": po.po_number,
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "email": supplier.email,
            "phone": supplier.phone,
        },
        "line_items": [
            {
                "item_id": line.item_id,
                "quantity": str(line.qty_ordered),
                "unit_cost": str(line.unit_cost),
            }
            for line in po.lines
        ],
        "items_subtotal": str(po_items_subtotal(po)),
        "extra_costs_total": str(po_extra_costs_total(po)),
        "total": str(po_total(po)),
    }
    db.add(
        PurchaseOrderSendLog(
            purchase_order_id=po.id,
            supplier_id=supplier.id,
            payload=json.dumps(log_payload),
        )
    )

    if not po.inventory_landed:
        land_inventory_from_purchase_order(db, po)
        po.inventory_landed = True
        po.landed_at = datetime.utcnow()

    po.status = "SENT"
    po.sent_at = datetime.utcnow()
    return po


def receive_purchase_order(db: Session, po: PurchaseOrder, payload: dict) -> PurchaseOrder:
    for line_payload in payload["lines"]:
        line = next((line for line in po.lines if line.id == line_payload["line_id"]), None)
        if not line:
            raise ValueError("Purchase order line not found.")
        qty_delta = Decimal(line_payload["qty_received"])
        line.qty_received = Decimal(line.qty_received or 0) + qty_delta
        item = db.query(Item).filter(Item.id == line.item_id).with_for_update().first()
        if item:
            receive_inventory(
                db,
                item=item,
                qty_delta=qty_delta,
                reference_type="PURCHASE_ORDER",
                reference_id=po.id,
            )
    if all(line.qty_received >= line.qty_ordered for line in po.lines):
        po.status = "RECEIVED"
    elif any(line.qty_received > 0 for line in po.lines):
        po.status = "PARTIALLY_RECEIVED"
    else:
        po.status = po.status or "DRAFT"
    if not po.order_date:
        po.order_date = date.today()
    return po


def find_inventory_account(db: Session) -> Account | None:
    return (
        db.query(Account)
        .filter((Account.code == "13100") | (func.lower(Account.name).like("%inventory%")))
        .order_by(Account.id.asc())
        .first()
    )


def find_cash_account(db: Session) -> Account | None:
    return (
        db.query(Account)
        .filter((Account.code == "10100") | (func.lower(Account.name).like("%cash%")))
        .order_by(Account.id.asc())
        .first()
    )


def _normal_balance_for_type(account_type: str) -> str:
    return "DEBIT" if account_type in {"ASSET", "EXPENSE"} else "CREDIT"


def _bootstrap_gl_context(db: Session, company_id: int | None) -> tuple[CompanyCode, GLLedger]:
    company_code = None
    if company_id is not None:
        company_code = db.query(CompanyCode).filter(CompanyCode.id == company_id).first()

    if not company_code:
        company_code = db.query(CompanyCode).order_by(CompanyCode.id.asc()).first()

    if not company_code:
        code = str(company_id or 1000).zfill(4)
        company_code = CompanyCode(code=code, name="Main Company", base_currency="USD")
        db.add(company_code)
        db.flush()

    fyv = db.query(FiscalYearVariant).filter(FiscalYearVariant.name == "K4").first()
    if not fyv:
        fyv = FiscalYearVariant(name="K4", periods_per_year=12, special_periods=4)
        db.add(fyv)
        db.flush()

    ledger = (
        db.query(GLLedger)
        .filter(GLLedger.company_code_id == company_code.id, GLLedger.is_leading.is_(True))
        .order_by(GLLedger.id.asc())
        .first()
    )
    if not ledger:
        ledger = GLLedger(
            company_code_id=company_code.id,
            name="Leading Ledger",
            currency=company_code.base_currency or "USD",
            fiscal_year_variant_id=fyv.id,
            is_leading=True,
        )
        db.add(ledger)
        db.flush()

    return company_code, ledger


def _sync_gl_accounts_from_coa(db: Session, company_code_id: int, company_id: int | None) -> None:
    coa_accounts = []
    if company_id is not None:
        coa_accounts = db.query(Account).filter(Account.company_id == company_id).all()
    if not coa_accounts:
        coa_accounts = db.query(Account).filter(Account.company_id == company_code_id).all()
    if not coa_accounts:
        fallback_company = db.query(Account.company_id).order_by(Account.company_id.asc()).first()
        if fallback_company is not None:
            coa_accounts = db.query(Account).filter(Account.company_id == fallback_company[0]).all()

    existing = {
        row.account_number: row
        for row in db.query(GLAccount).filter(GLAccount.company_code_id == company_code_id).all()
    }
    for coa in coa_accounts:
        account_code = (coa.code or "").strip()
        if not account_code:
            continue
        mapped_type = COA_TO_GL_TYPE.get((coa.type or "").upper(), "EXPENSE")
        gl_account = existing.get(account_code)
        if not gl_account:
            gl_account = GLAccount(
                company_code_id=company_code_id,
                account_number=account_code,
                name=coa.name,
                account_type=mapped_type,
                normal_balance=_normal_balance_for_type(mapped_type),
                is_control_account=False,
                is_active=bool(coa.is_active),
            )
            db.add(gl_account)
            existing[account_code] = gl_account
            continue

        gl_account.name = coa.name
        gl_account.account_type = mapped_type
        gl_account.normal_balance = _normal_balance_for_type(mapped_type)
        gl_account.is_active = bool(coa.is_active)

    db.flush()


def _resolve_gl_account_id(
    db: Session,
    *,
    coa_account_id: int,
    company_code_id: int,
    company_id: int | None,
) -> int:
    coa_account = db.query(Account).filter(Account.id == coa_account_id).first()
    if not coa_account:
        raise ValueError("One or more accounts were not found.")

    _sync_gl_accounts_from_coa(db, company_code_id=company_code_id, company_id=company_id)

    gl_account = None
    if coa_account.code:
        gl_account = (
            db.query(GLAccount)
            .filter(
                GLAccount.company_code_id == company_code_id,
                GLAccount.account_number == coa_account.code,
            )
            .first()
        )

    if not gl_account:
        gl_account = (
            db.query(GLAccount)
            .filter(
                GLAccount.company_code_id == company_code_id,
                GLAccount.name == coa_account.name,
            )
            .order_by(GLAccount.id.asc())
            .first()
        )

    if not gl_account:
        mapped_type = COA_TO_GL_TYPE.get((coa_account.type or "").upper(), "EXPENSE")
        gl_account = GLAccount(
            company_code_id=company_code_id,
            account_number=(coa_account.code or str(coa_account.id)).strip(),
            name=coa_account.name,
            account_type=mapped_type,
            normal_balance=_normal_balance_for_type(mapped_type),
            is_control_account=False,
            is_active=bool(coa_account.is_active),
        )
        db.add(gl_account)
        db.flush()

    return gl_account.id


def _post_purchase_order_receipt_to_gl(
    db: Session,
    *,
    po: PurchaseOrder,
    entry_date: date,
    memo: str | None,
    inventory_account_id: int,
    cash_account_id: int,
    amount: Decimal,
    company_id: int | None,
) -> None:
    existing_link = (
        db.query(GLPostingLink)
        .filter(GLPostingLink.source_module == "PURCHASE_ORDER", GLPostingLink.source_id == po.id)
        .first()
    )
    if existing_link:
        raise ValueError("This purchase order was already posted. You can view the existing entry.")

    company_code, ledger = _bootstrap_gl_context(db, company_id=company_id)
    debit_gl_account_id = _resolve_gl_account_id(
        db,
        coa_account_id=inventory_account_id,
        company_code_id=company_code.id,
        company_id=company_id,
    )
    credit_gl_account_id = _resolve_gl_account_id(
        db,
        coa_account_id=cash_account_id,
        company_code_id=company_code.id,
        company_id=company_id,
    )

    payload = gl_schemas.JournalCreate(
        company_code_id=company_code.id,
        ledger_id=ledger.id,
        document_type="PO",
        posting_date=entry_date,
        document_date=entry_date,
        currency=ledger.currency or company_code.base_currency or "USD",
        reference=po.po_number,
        header_text=memo or f"PO {po.po_number} landed cost",
        source_module="PURCHASING",
        created_by="system",
        idempotency_key=f"purchase_order_receipt:{po.id}",
        lines=[
            gl_schemas.JournalLineIn(
                gl_account_id=debit_gl_account_id,
                description=f"PO {po.po_number} landed cost",
                debit_amount=amount,
                credit_amount=Decimal("0.00"),
            ),
            gl_schemas.JournalLineIn(
                gl_account_id=credit_gl_account_id,
                description=f"PO {po.po_number} landed cost",
                debit_amount=Decimal("0.00"),
                credit_amount=amount,
            ),
        ],
    )
    header = gl_service.create_journal(db, payload)
    gl_service.post_journal(db, header, posted_by="system")
    db.add(
        GLPostingLink(
            source_module="PURCHASE_ORDER",
            source_id=po.id,
            gl_journal_header_id=header.id,
        )
    )
    db.flush()


def backfill_purchase_order_receipt_to_gl(db: Session, po: PurchaseOrder) -> bool:
    existing_link = (
        db.query(GLPostingLink)
        .filter(GLPostingLink.source_module == "PURCHASE_ORDER", GLPostingLink.source_id == po.id)
        .first()
    )
    if existing_link:
        return False

    entry = po.posted_journal_entry
    if not entry:
        raise ValueError(f"Purchase order {po.po_number} has no legacy journal entry to backfill.")

    debit_lines = [line for line in entry.lines if Decimal(line.debit or 0) > 0]
    credit_lines = [line for line in entry.lines if Decimal(line.credit or 0) > 0]
    if len(debit_lines) != 1 or len(credit_lines) != 1:
        raise ValueError(f"Purchase order {po.po_number} legacy journal entry is not a simple balanced two-line posting.")

    debit_line = debit_lines[0]
    credit_line = credit_lines[0]
    debit_amount = Decimal(debit_line.debit or 0)
    credit_amount = Decimal(credit_line.credit or 0)
    if debit_amount <= 0 or credit_amount <= 0 or debit_amount != credit_amount:
        raise ValueError(f"Purchase order {po.po_number} legacy journal entry is not balanced.")

    _post_purchase_order_receipt_to_gl(
        db,
        po=po,
        entry_date=entry.txn_date,
        memo=entry.description,
        inventory_account_id=debit_line.account_id,
        cash_account_id=credit_line.account_id,
        amount=debit_amount,
        company_id=entry.company_id,
    )
    return True

def post_purchase_order_receipt(
    db: Session,
    *,
    po: PurchaseOrder,
    entry_date: date,
    memo: str | None,
    inventory_account_id: int | None,
    cash_account_id: int | None,
) -> PurchaseOrder:
    existing_gl_link = (
        db.query(GLPostingLink)
        .filter(GLPostingLink.source_module == "PURCHASE_ORDER", GLPostingLink.source_id == po.id)
        .first()
    )
    if po.posted_journal_entry_id or existing_gl_link:
        raise ValueError("This purchase order was already posted. You can view the existing entry.")

    default_inventory = find_inventory_account(db)
    default_cash = find_cash_account(db)
    inventory_account_id = inventory_account_id or (default_inventory.id if default_inventory else None)
    cash_account_id = cash_account_id or (default_cash.id if default_cash else None)

    if not inventory_account_id or not cash_account_id:
        raise ValueError("Inventory and cash accounts are required to post this entry.")

    total = po_total(po)
    company_id = (db.query(Account.company_id).filter(Account.id == inventory_account_id).scalar() or 1)
    entry = create_journal_entry(
        db,
        company_id=company_id,
        entry_date=entry_date,
        memo=memo or f"PO {po.po_number} landed cost",
        source_type="PURCHASE_ORDER",
        source_id=po.id,
        debit_account_id=inventory_account_id,
        credit_account_id=cash_account_id,
        amount=total,
        mirror_to_gl=False,
    )
    _post_purchase_order_receipt_to_gl(
        db,
        po=po,
        entry_date=entry_date,
        memo=memo,
        inventory_account_id=inventory_account_id,
        cash_account_id=cash_account_id,
        amount=total,
        company_id=company_id,
    )

    po.posted_journal_entry_id = entry.id
    po.status = "RECEIVED"
    if not po.inventory_landed:
        land_inventory_from_purchase_order(db, po)
        po.inventory_landed = True
        po.landed_at = datetime.utcnow()
    return po










