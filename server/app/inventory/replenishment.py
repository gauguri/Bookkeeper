from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from math import ceil
from typing import Iterable

from sqlalchemy.orm import Session, selectinload

from app.inventory import schemas
from app.models import Supplier, SupplierItem
from app.purchasing.service import create_purchase_order, po_total


def _safe_decimal(value: Decimal | float | int | None) -> Decimal:
    return Decimal(value or 0)


def _q2(value: Decimal | float | int | None) -> Decimal:
    return _safe_decimal(value).quantize(Decimal("0.01"))


def _urgency_for_row(row: schemas.InventoryItemRow, has_supplier_mapping: bool) -> str:
    if not has_supplier_mapping:
        return "critical"
    if row.available <= 0 or row.health_flag == "stockout":
        return "critical"
    if row.days_of_supply <= Decimal(row.lead_time_days) or row.health_flag in {"at_risk", "low_stock"}:
        return "high"
    if row.suggested_reorder_qty > 0:
        return "medium"
    return "low"


def _stockout_date(row: schemas.InventoryItemRow) -> date | None:
    if row.avg_daily_usage <= 0:
        return None
    if row.available <= 0:
        return datetime.utcnow().date()
    days_until_stockout = max(0, ceil(float(row.days_of_supply)))
    return datetime.utcnow().date() + timedelta(days=days_until_stockout)


def _default_unit_cost(link: SupplierItem | None) -> Decimal | None:
    if not link:
        return None
    default_cost = _q2(link.default_unit_cost)
    if default_cost > 0:
        return default_cost
    supplier_cost = _q2(link.supplier_cost)
    if supplier_cost > 0:
        return supplier_cost
    return None


def _estimated_order_value(quantity: Decimal, link: SupplierItem | None) -> Decimal:
    if not link:
        return Decimal("0.00")
    return _q2(quantity * _q2(link.landed_cost))


def _recommendation_reason(
    row: schemas.InventoryItemRow,
    recommended_qty: Decimal,
    target_days_supply: Decimal,
    min_order_qty: Decimal,
    has_supplier_mapping: bool,
) -> str:
    parts = [
        f"Projected available {row.available + row.inbound_qty:.2f} against target {recommended_qty + row.available + row.inbound_qty:.2f}",
        f"using {row.avg_daily_usage:.2f}/day demand, {row.lead_time_days}d lead time, and {row.safety_stock:.2f} safety stock.",
    ]
    if min_order_qty > 0:
        parts.append(f"Supplier MOQ raises the buy recommendation to {recommended_qty:.2f}.")
    else:
        parts.append(f"Target days of supply: {target_days_supply:.2f}.")
    if not has_supplier_mapping:
        parts.append("No active supplier mapping is available yet, so this item cannot be converted into a PO.")
    return " ".join(parts)


def build_replenishment_workbench(
    db: Session,
    rows: Iterable[schemas.InventoryItemRow],
    *,
    usage_days: int,
) -> schemas.ReplenishmentWorkbenchResponse:
    row_list = [row for row in rows if row.suggested_reorder_qty > 0 or row.health_flag in {"stockout", "low_stock", "at_risk"}]
    if not row_list:
        return schemas.ReplenishmentWorkbenchResponse(
            generated_at=datetime.utcnow(),
            usage_days=usage_days,
            summary=schemas.ReplenishmentWorkbenchSummary(),
            groups=[],
        )

    item_ids = [row.id for row in row_list]
    supplier_links = (
        db.query(SupplierItem)
        .options(selectinload(SupplierItem.supplier))
        .filter(SupplierItem.item_id.in_(item_ids))
        .all()
    )
    links_by_item: dict[int, list[SupplierItem]] = {}
    for link in supplier_links:
        links_by_item.setdefault(link.item_id, []).append(link)

    groups_map: dict[tuple[str, int | None], list[schemas.ReplenishmentRecommendationItem]] = {}

    for row in row_list:
        active_links = [
            link
            for link in links_by_item.get(row.id, [])
            if link.is_active and link.supplier and link.supplier.status == "active"
        ]
        preferred_link = next((link for link in active_links if link.is_preferred), None) or (active_links[0] if active_links else None)
        min_order_qty = _q2(preferred_link.min_order_qty if preferred_link else 0)
        recommended_qty = _q2(max(row.suggested_reorder_qty, min_order_qty))
        if recommended_qty <= 0:
            continue
        target_days_supply = _q2(row.days_of_supply + (recommended_qty / row.avg_daily_usage)) if row.avg_daily_usage > 0 else Decimal("0.00")
        has_supplier_mapping = preferred_link is not None and preferred_link.supplier is not None
        urgency = _urgency_for_row(row, has_supplier_mapping)
        recommendation = schemas.ReplenishmentRecommendationItem(
            item_id=row.id,
            item=row.item,
            sku=row.sku,
            supplier_id=preferred_link.supplier_id if preferred_link else None,
            supplier=preferred_link.supplier.name if preferred_link and preferred_link.supplier else None,
            available=row.available,
            inbound_qty=row.inbound_qty,
            reorder_point=row.reorder_point,
            safety_stock=row.safety_stock,
            avg_daily_usage=row.avg_daily_usage,
            days_of_supply=row.days_of_supply,
            target_days_supply=target_days_supply,
            suggested_order_qty=row.suggested_reorder_qty,
            recommended_order_qty=recommended_qty,
            lead_time_days=row.lead_time_days,
            min_order_qty=min_order_qty,
            unit_cost=_default_unit_cost(preferred_link),
            landed_unit_cost=_q2(preferred_link.landed_cost) if preferred_link else None,
            estimated_order_value=_estimated_order_value(recommended_qty, preferred_link),
            health_flag=row.health_flag,
            urgency=urgency,
            stockout_date=_stockout_date(row),
            alternative_supplier_count=max(0, len(active_links) - (1 if preferred_link else 0)),
            has_supplier_mapping=has_supplier_mapping,
            reason=_recommendation_reason(row, recommended_qty, target_days_supply, min_order_qty, has_supplier_mapping),
        )
        group_key = (
            preferred_link.supplier.name if preferred_link and preferred_link.supplier else "Unmapped items",
            preferred_link.supplier_id if preferred_link else None,
        )
        groups_map.setdefault(group_key, []).append(recommendation)

    urgency_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    groups: list[schemas.ReplenishmentSupplierGroup] = []
    for (supplier_name, supplier_id), items in groups_map.items():
        items.sort(key=lambda entry: (urgency_rank.get(entry.urgency, 9), entry.item.lower()))
        groups.append(
            schemas.ReplenishmentSupplierGroup(
                supplier_id=supplier_id,
                supplier=supplier_name,
                actionable=supplier_id is not None,
                lead_time_days=max((entry.lead_time_days for entry in items), default=None),
                recommendation_count=len(items),
                total_estimated_order_value=_q2(sum((entry.estimated_order_value for entry in items), Decimal("0"))),
                items=items,
            )
        )

    groups.sort(key=lambda group: (not group.actionable, group.supplier.lower()))

    all_items = [item for group in groups for item in group.items]
    summary = schemas.ReplenishmentWorkbenchSummary(
        total_recommendations=len(all_items),
        supplier_groups=len([group for group in groups if group.actionable]),
        unmapped_items=len([item for item in all_items if not item.has_supplier_mapping]),
        critical_items=len([item for item in all_items if item.urgency == "critical"]),
        total_estimated_order_value=_q2(sum((item.estimated_order_value for item in all_items), Decimal("0"))),
        recommended_units=_q2(sum((item.recommended_order_qty for item in all_items), Decimal("0"))),
    )
    return schemas.ReplenishmentWorkbenchResponse(
        generated_at=datetime.utcnow(),
        usage_days=usage_days,
        summary=summary,
        groups=groups,
    )


def create_replenishment_purchase_orders(
    db: Session,
    *,
    selections: Iterable[schemas.ReplenishmentSelection],
    notes: str | None = None,
) -> schemas.ReplenishmentPurchaseOrderCreateResponse:
    grouped: dict[int, dict[int, Decimal]] = {}
    for selection in selections:
        supplier_bucket = grouped.setdefault(selection.supplier_id, {})
        supplier_bucket[selection.item_id] = _q2(supplier_bucket.get(selection.item_id, Decimal("0")) + selection.quantity)

    created_orders: list[schemas.ReplenishmentPurchaseOrderCreated] = []
    for supplier_id, item_quantities in grouped.items():
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not supplier or supplier.status != "active":
            raise ValueError(f"Supplier #{supplier_id} is not available for replenishment.")

        lines = []
        for item_id, quantity in item_quantities.items():
            link = (
                db.query(SupplierItem)
                .filter(
                    SupplierItem.supplier_id == supplier_id,
                    SupplierItem.item_id == item_id,
                    SupplierItem.is_active.is_(True),
                )
                .first()
            )
            if not link:
                raise ValueError(f"Item #{item_id} is not mapped to supplier {supplier.name}.")
            if quantity <= 0:
                raise ValueError("Replenishment quantity must be greater than zero.")
            lines.append({"item_id": item_id, "quantity": quantity})

        po = create_purchase_order(
            db,
            {
                "supplier_id": supplier_id,
                "order_date": date.today(),
                "notes": notes or "Generated from the replenishment workbench.",
                "lines": lines,
            },
        )
        db.flush()
        created_orders.append(
            schemas.ReplenishmentPurchaseOrderCreated(
                id=po.id,
                po_number=po.po_number,
                supplier_id=supplier.id,
                supplier=supplier.name,
                line_count=len(po.lines),
                total=_q2(po_total(po)),
            )
        )

    return schemas.ReplenishmentPurchaseOrderCreateResponse(
        created_purchase_orders=created_orders,
        message=f"Created {len(created_orders)} draft purchase order(s) from replenishment recommendations.",
    )
