"""Core inventory transaction engine.

Handles goods receipts, goods issues, stock transfers, adjustments, and reversals.
All operations are atomic, create immutable transaction records, and update stock ledger.
"""

from datetime import date, datetime
from decimal import Decimal
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    InvBatch,
    InvJournalEntry,
    InvStockOnHand,
    InvTransactionHeader,
    InvTransactionLine,
    InvValuationConfig,
    Item,
)

logger = logging.getLogger(__name__)

# Transaction type constants
TXN_GOODS_RECEIPT = "goods_receipt"
TXN_GOODS_ISSUE = "goods_issue"
TXN_STOCK_TRANSFER = "stock_transfer"
TXN_STOCK_ADJUSTMENT = "stock_adjustment"
TXN_RETURN_INBOUND = "return_inbound"
TXN_RETURN_OUTBOUND = "return_outbound"
TXN_REVERSAL = "reversal"

# Stock type constants
STOCK_UNRESTRICTED = "unrestricted"
STOCK_QUALITY = "quality_inspection"
STOCK_BLOCKED = "blocked"
STOCK_IN_TRANSIT = "in_transit"
STOCK_RESERVED = "reserved"


def _generate_txn_number(db: Session, prefix: str) -> str:
    """Generate a unique transaction number like GR-2026-000001."""
    year = datetime.utcnow().year
    pattern = f"{prefix}-{year}-%"
    max_num = (
        db.query(func.max(InvTransactionHeader.transaction_number))
        .filter(InvTransactionHeader.transaction_number.like(pattern))
        .scalar()
    )
    if max_num:
        seq = int(max_num.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}-{year}-{seq:06d}"


def _get_or_create_stock(
    db: Session,
    *,
    item_id: int,
    warehouse_id: int,
    stock_type: str = STOCK_UNRESTRICTED,
    bin_id: int | None = None,
    batch_id: int | None = None,
    serial_id: int | None = None,
    zone_id: int | None = None,
) -> InvStockOnHand:
    """Get existing stock record or create a new one with zero quantity."""
    stock = (
        db.query(InvStockOnHand)
        .filter(
            InvStockOnHand.item_id == item_id,
            InvStockOnHand.warehouse_id == warehouse_id,
            InvStockOnHand.bin_id == bin_id,
            InvStockOnHand.batch_id == batch_id,
            InvStockOnHand.serial_id == serial_id,
            InvStockOnHand.stock_type == stock_type,
        )
        .with_for_update()
        .first()
    )
    if stock:
        return stock
    stock = InvStockOnHand(
        item_id=item_id,
        warehouse_id=warehouse_id,
        zone_id=zone_id,
        bin_id=bin_id,
        batch_id=batch_id,
        serial_id=serial_id,
        stock_type=stock_type,
        quantity=Decimal("0"),
    )
    db.add(stock)
    db.flush()
    return stock


def _update_moving_average(db: Session, item_id: int, receipt_qty: Decimal, receipt_unit_cost: Decimal) -> None:
    """Recalculate moving average cost on receipt."""
    config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == item_id).first()
    if not config:
        config = InvValuationConfig(
            item_id=item_id,
            valuation_method="moving_average",
            moving_average_cost=receipt_unit_cost,
            last_valuation_date=datetime.utcnow(),
        )
        db.add(config)
        db.flush()
        return

    old_qty = (
        db.query(func.coalesce(func.sum(InvStockOnHand.quantity), 0))
        .filter(InvStockOnHand.item_id == item_id)
        .scalar()
    )
    old_qty = Decimal(str(old_qty))
    old_avg = Decimal(str(config.moving_average_cost or 0))

    # Stock was already incremented by the time this runs, so subtract receipt_qty for old
    pre_receipt_qty = old_qty - receipt_qty
    if pre_receipt_qty + receipt_qty > 0:
        new_avg = ((pre_receipt_qty * old_avg) + (receipt_qty * receipt_unit_cost)) / (pre_receipt_qty + receipt_qty)
        config.moving_average_cost = new_avg

    config.last_valuation_date = datetime.utcnow()


def _create_journal_entry_stub(
    db: Session,
    *,
    transaction_id: int,
    entry_date: date,
    debit_code: str,
    credit_code: str,
    amount: Decimal,
    description: str = "",
) -> InvJournalEntry:
    """Create an accounting journal entry stub for the transaction."""
    entry = InvJournalEntry(
        transaction_id=transaction_id,
        entry_date=entry_date,
        debit_account_code=debit_code,
        credit_account_code=credit_code,
        amount=amount,
        description=description,
    )
    db.add(entry)
    return entry


def goods_receipt(
    db: Session,
    *,
    warehouse_id: int,
    lines: list[dict],
    reference_type: str | None = None,
    reference_id: int | None = None,
    reference_number: str | None = None,
    transaction_date: date | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> InvTransactionHeader:
    """Create a goods receipt transaction — increase stock."""
    txn_date = transaction_date or date.today()
    txn_number = _generate_txn_number(db, "GR")

    header = InvTransactionHeader(
        transaction_number=txn_number,
        transaction_type=TXN_GOODS_RECEIPT,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        destination_warehouse_id=warehouse_id,
        transaction_date=txn_date,
        posting_date=txn_date,
        status="posted",
        notes=notes,
        created_by=created_by,
    )
    db.add(header)
    db.flush()

    total_value = Decimal("0")
    for idx, line_data in enumerate(lines, start=1):
        item_id = line_data["item_id"]
        qty = Decimal(str(line_data["quantity"]))
        unit_cost = Decimal(str(line_data.get("unit_cost") or 0))
        total_cost = qty * unit_cost

        txn_line = InvTransactionLine(
            transaction_header_id=header.id,
            item_id=item_id,
            line_number=idx,
            quantity=qty,
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
            destination_bin_id=line_data.get("destination_bin_id"),
            destination_stock_type=STOCK_UNRESTRICTED,
            unit_cost=unit_cost,
            total_cost=total_cost,
            reason_code_id=line_data.get("reason_code_id"),
            notes=line_data.get("notes"),
        )
        db.add(txn_line)

        # Update stock ledger
        stock = _get_or_create_stock(
            db,
            item_id=item_id,
            warehouse_id=warehouse_id,
            bin_id=line_data.get("destination_bin_id"),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
        )
        stock.quantity += qty
        stock.updated_at = datetime.utcnow()

        # Also update legacy Item.on_hand_qty for backward compatibility
        item = db.query(Item).filter(Item.id == item_id).first()
        if item:
            item.on_hand_qty = Decimal(str(item.on_hand_qty or 0)) + qty

        # Update moving average cost
        if unit_cost > 0:
            _update_moving_average(db, item_id, qty, unit_cost)

        total_value += total_cost

    # Journal entry stub: Debit Inventory, Credit GR/IR Clearing
    if total_value > 0:
        _create_journal_entry_stub(
            db,
            transaction_id=header.id,
            entry_date=txn_date,
            debit_code="1400",  # Inventory
            credit_code="2100",  # GR/IR Clearing
            amount=total_value,
            description=f"Goods Receipt {txn_number}",
        )

    db.flush()
    return header


def goods_issue(
    db: Session,
    *,
    warehouse_id: int,
    lines: list[dict],
    reference_type: str | None = None,
    reference_id: int | None = None,
    reference_number: str | None = None,
    transaction_date: date | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> InvTransactionHeader:
    """Create a goods issue transaction — decrease stock."""
    txn_date = transaction_date or date.today()
    txn_number = _generate_txn_number(db, "GI")

    header = InvTransactionHeader(
        transaction_number=txn_number,
        transaction_type=TXN_GOODS_ISSUE,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        source_warehouse_id=warehouse_id,
        transaction_date=txn_date,
        posting_date=txn_date,
        status="posted",
        notes=notes,
        created_by=created_by,
    )
    db.add(header)
    db.flush()

    total_value = Decimal("0")
    for idx, line_data in enumerate(lines, start=1):
        item_id = line_data["item_id"]
        qty = Decimal(str(line_data["quantity"]))

        # Check stock availability
        stock = _get_or_create_stock(
            db,
            item_id=item_id,
            warehouse_id=warehouse_id,
            bin_id=line_data.get("source_bin_id"),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
        )
        if stock.quantity < qty:
            raise ValueError(
                f"Insufficient stock for item {item_id}: available {stock.quantity}, requested {qty}"
            )

        # Get unit cost from valuation config or line data
        unit_cost = Decimal(str(line_data.get("unit_cost") or 0))
        if unit_cost == 0:
            config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == item_id).first()
            if config and config.moving_average_cost:
                unit_cost = config.moving_average_cost
        total_cost = qty * unit_cost

        txn_line = InvTransactionLine(
            transaction_header_id=header.id,
            item_id=item_id,
            line_number=idx,
            quantity=qty,
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
            source_bin_id=line_data.get("source_bin_id"),
            source_stock_type=STOCK_UNRESTRICTED,
            unit_cost=unit_cost,
            total_cost=total_cost,
            reason_code_id=line_data.get("reason_code_id"),
            notes=line_data.get("notes"),
        )
        db.add(txn_line)

        stock.quantity -= qty
        stock.updated_at = datetime.utcnow()

        # Update legacy
        item = db.query(Item).filter(Item.id == item_id).first()
        if item:
            item.on_hand_qty = Decimal(str(item.on_hand_qty or 0)) - qty

        total_value += total_cost

    # Journal entry: Debit COGS, Credit Inventory
    if total_value > 0:
        _create_journal_entry_stub(
            db,
            transaction_id=header.id,
            entry_date=txn_date,
            debit_code="5000",  # COGS
            credit_code="1400",  # Inventory
            amount=total_value,
            description=f"Goods Issue {txn_number}",
        )

    db.flush()
    return header


def stock_transfer(
    db: Session,
    *,
    source_warehouse_id: int,
    destination_warehouse_id: int,
    lines: list[dict],
    reference_number: str | None = None,
    transaction_date: date | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> InvTransactionHeader:
    """Transfer stock between warehouses. Single-step for same warehouse, two-step for different."""
    txn_date = transaction_date or date.today()
    txn_number = _generate_txn_number(db, "TR")

    header = InvTransactionHeader(
        transaction_number=txn_number,
        transaction_type=TXN_STOCK_TRANSFER,
        reference_number=reference_number,
        source_warehouse_id=source_warehouse_id,
        destination_warehouse_id=destination_warehouse_id,
        transaction_date=txn_date,
        posting_date=txn_date,
        status="posted",
        notes=notes,
        created_by=created_by,
    )
    db.add(header)
    db.flush()

    for idx, line_data in enumerate(lines, start=1):
        item_id = line_data["item_id"]
        qty = Decimal(str(line_data["quantity"]))

        # Decrement source
        source_stock = _get_or_create_stock(
            db,
            item_id=item_id,
            warehouse_id=source_warehouse_id,
            bin_id=line_data.get("source_bin_id"),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
        )
        if source_stock.quantity < qty:
            raise ValueError(
                f"Insufficient stock for transfer item {item_id}: available {source_stock.quantity}, requested {qty}"
            )
        source_stock.quantity -= qty
        source_stock.updated_at = datetime.utcnow()

        # Increment destination
        dest_stock = _get_or_create_stock(
            db,
            item_id=item_id,
            warehouse_id=destination_warehouse_id,
            bin_id=line_data.get("destination_bin_id"),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
        )
        dest_stock.quantity += qty
        dest_stock.updated_at = datetime.utcnow()

        unit_cost = Decimal(str(line_data.get("unit_cost") or 0))
        txn_line = InvTransactionLine(
            transaction_header_id=header.id,
            item_id=item_id,
            line_number=idx,
            quantity=qty,
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
            source_bin_id=line_data.get("source_bin_id"),
            destination_bin_id=line_data.get("destination_bin_id"),
            source_stock_type=STOCK_UNRESTRICTED,
            destination_stock_type=STOCK_UNRESTRICTED,
            unit_cost=unit_cost,
            total_cost=qty * unit_cost,
            notes=line_data.get("notes"),
        )
        db.add(txn_line)

    db.flush()
    return header


def stock_adjustment(
    db: Session,
    *,
    warehouse_id: int,
    lines: list[dict],
    reason_code_id: int | None = None,
    transaction_date: date | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> InvTransactionHeader:
    """Adjust stock quantities. Positive = increase, use quantity field. Adjustment direction determined by current vs desired."""
    txn_date = transaction_date or date.today()
    txn_number = _generate_txn_number(db, "ADJ")

    header = InvTransactionHeader(
        transaction_number=txn_number,
        transaction_type=TXN_STOCK_ADJUSTMENT,
        destination_warehouse_id=warehouse_id,
        transaction_date=txn_date,
        posting_date=txn_date,
        status="posted",
        notes=notes,
        created_by=created_by,
    )
    db.add(header)
    db.flush()

    total_value = Decimal("0")
    for idx, line_data in enumerate(lines, start=1):
        item_id = line_data["item_id"]
        qty = Decimal(str(line_data["quantity"]))  # positive = increase, negative = decrease
        unit_cost = Decimal(str(line_data.get("unit_cost") or 0))
        total_cost = abs(qty) * unit_cost

        stock = _get_or_create_stock(
            db,
            item_id=item_id,
            warehouse_id=warehouse_id,
            bin_id=line_data.get("destination_bin_id") or line_data.get("source_bin_id"),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
        )
        stock.quantity += qty
        if stock.quantity < 0:
            raise ValueError(f"Adjustment would make stock negative for item {item_id}")
        stock.updated_at = datetime.utcnow()

        # Update legacy
        item = db.query(Item).filter(Item.id == item_id).first()
        if item:
            item.on_hand_qty = Decimal(str(item.on_hand_qty or 0)) + qty

        txn_line = InvTransactionLine(
            transaction_header_id=header.id,
            item_id=item_id,
            line_number=idx,
            quantity=abs(qty),
            batch_id=line_data.get("batch_id"),
            serial_id=line_data.get("serial_id"),
            destination_bin_id=line_data.get("destination_bin_id"),
            destination_stock_type=STOCK_UNRESTRICTED,
            unit_cost=unit_cost,
            total_cost=total_cost,
            reason_code_id=line_data.get("reason_code_id") or reason_code_id,
            notes=line_data.get("notes"),
        )
        db.add(txn_line)
        total_value += total_cost

    # Journal entry: Adjustment account
    if total_value > 0:
        _create_journal_entry_stub(
            db,
            transaction_id=header.id,
            entry_date=txn_date,
            debit_code="5900",  # Inventory Adjustment
            credit_code="1400",  # Inventory
            amount=total_value,
            description=f"Stock Adjustment {txn_number}",
        )

    db.flush()
    return header


def reverse_transaction(
    db: Session,
    *,
    transaction_id: int,
    created_by: int | None = None,
) -> InvTransactionHeader:
    """Reverse a posted transaction by creating a mirror transaction."""
    original = db.query(InvTransactionHeader).filter(InvTransactionHeader.id == transaction_id).first()
    if not original:
        raise ValueError(f"Transaction {transaction_id} not found")
    if original.status != "posted":
        raise ValueError(f"Can only reverse posted transactions, current status: {original.status}")

    # Check if already reversed
    existing_reversal = (
        db.query(InvTransactionHeader)
        .filter(
            InvTransactionHeader.reversal_of_id == transaction_id,
            InvTransactionHeader.status == "posted",
        )
        .first()
    )
    if existing_reversal:
        raise ValueError(f"Transaction {transaction_id} is already reversed by {existing_reversal.transaction_number}")

    txn_date = date.today()
    txn_number = _generate_txn_number(db, "REV")

    reversal = InvTransactionHeader(
        transaction_number=txn_number,
        transaction_type=original.transaction_type,
        reference_type="reversal",
        reference_id=original.id,
        reference_number=original.transaction_number,
        source_warehouse_id=original.destination_warehouse_id,
        destination_warehouse_id=original.source_warehouse_id,
        transaction_date=txn_date,
        posting_date=txn_date,
        status="posted",
        reversal_of_id=original.id,
        notes=f"Reversal of {original.transaction_number}",
        created_by=created_by,
    )
    db.add(reversal)
    db.flush()

    # Reverse each line
    for orig_line in original.lines:
        rev_line = InvTransactionLine(
            transaction_header_id=reversal.id,
            item_id=orig_line.item_id,
            line_number=orig_line.line_number,
            quantity=orig_line.quantity,
            batch_id=orig_line.batch_id,
            serial_id=orig_line.serial_id,
            source_bin_id=orig_line.destination_bin_id,
            destination_bin_id=orig_line.source_bin_id,
            source_stock_type=orig_line.destination_stock_type,
            destination_stock_type=orig_line.source_stock_type,
            unit_cost=orig_line.unit_cost,
            total_cost=orig_line.total_cost,
            notes=f"Reversal of line {orig_line.line_number}",
        )
        db.add(rev_line)

        # Reverse stock movements
        qty = orig_line.quantity
        if original.transaction_type == TXN_GOODS_RECEIPT:
            # Undo receipt: decrement destination
            stock = _get_or_create_stock(
                db,
                item_id=orig_line.item_id,
                warehouse_id=original.destination_warehouse_id,
                bin_id=orig_line.destination_bin_id,
                batch_id=orig_line.batch_id,
                serial_id=orig_line.serial_id,
            )
            stock.quantity -= qty
            item = db.query(Item).filter(Item.id == orig_line.item_id).first()
            if item:
                item.on_hand_qty = Decimal(str(item.on_hand_qty or 0)) - qty

        elif original.transaction_type == TXN_GOODS_ISSUE:
            # Undo issue: increment source
            stock = _get_or_create_stock(
                db,
                item_id=orig_line.item_id,
                warehouse_id=original.source_warehouse_id,
                bin_id=orig_line.source_bin_id,
                batch_id=orig_line.batch_id,
                serial_id=orig_line.serial_id,
            )
            stock.quantity += qty
            item = db.query(Item).filter(Item.id == orig_line.item_id).first()
            if item:
                item.on_hand_qty = Decimal(str(item.on_hand_qty or 0)) + qty

        elif original.transaction_type == TXN_STOCK_TRANSFER:
            # Undo transfer: return to source, remove from dest
            dest_stock = _get_or_create_stock(
                db,
                item_id=orig_line.item_id,
                warehouse_id=original.destination_warehouse_id,
                bin_id=orig_line.destination_bin_id,
                batch_id=orig_line.batch_id,
                serial_id=orig_line.serial_id,
            )
            dest_stock.quantity -= qty

            source_stock = _get_or_create_stock(
                db,
                item_id=orig_line.item_id,
                warehouse_id=original.source_warehouse_id,
                bin_id=orig_line.source_bin_id,
                batch_id=orig_line.batch_id,
                serial_id=orig_line.serial_id,
            )
            source_stock.quantity += qty

    # Mark original as reversed
    original.status = "reversed"

    db.flush()
    return reversal


def list_transactions(
    db: Session,
    *,
    transaction_type: str | None = None,
    status: str | None = None,
    warehouse_id: int | None = None,
    item_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    limit: int = 25,
) -> tuple[list[InvTransactionHeader], int]:
    """List transactions with optional filters and pagination."""
    query = db.query(InvTransactionHeader)

    if transaction_type:
        query = query.filter(InvTransactionHeader.transaction_type == transaction_type)
    if status:
        query = query.filter(InvTransactionHeader.status == status)
    if warehouse_id:
        query = query.filter(
            (InvTransactionHeader.source_warehouse_id == warehouse_id)
            | (InvTransactionHeader.destination_warehouse_id == warehouse_id)
        )
    if item_id:
        query = query.join(InvTransactionLine).filter(InvTransactionLine.item_id == item_id)
    if date_from:
        query = query.filter(InvTransactionHeader.transaction_date >= date_from)
    if date_to:
        query = query.filter(InvTransactionHeader.transaction_date <= date_to)

    total = query.count()
    txns = (
        query.order_by(InvTransactionHeader.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return txns, total


def get_transaction(db: Session, transaction_id: int) -> InvTransactionHeader | None:
    """Get a single transaction with its lines."""
    return (
        db.query(InvTransactionHeader)
        .filter(InvTransactionHeader.id == transaction_id)
        .first()
    )
