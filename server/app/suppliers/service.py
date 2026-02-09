from typing import Optional

from sqlalchemy.orm import Session

from app.models import Item, SupplierItem


def set_preferred_supplier(db: Session, item: Item, supplier_id: int) -> None:
    for link in item.supplier_items:
        link.is_preferred = link.supplier_id == supplier_id
    db.flush()


def get_supplier_link(db: Session, item_id: int, supplier_id: Optional[int]) -> Optional[SupplierItem]:
    if not supplier_id:
        return (
            db.query(SupplierItem)
            .filter(SupplierItem.item_id == item_id, SupplierItem.is_preferred.is_(True))
            .first()
        )
    return (
        db.query(SupplierItem)
        .filter(SupplierItem.item_id == item_id, SupplierItem.supplier_id == supplier_id)
        .first()
    )
