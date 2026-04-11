import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    original_startup = list(app.router.on_startup)
    app.router.on_startup.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    app.router.on_startup.extend(original_startup)
    Base.metadata.drop_all(engine)


def test_purchase_order_import_format_contract(client: TestClient):
    response = client.get("/api/purchase-orders/import-format")

    assert response.status_code == 200
    payload = response.json()
    assert payload["purchase_order_required_fields"] == ["po_number", "order_date", "vendor_number"]
    assert payload["inventory_required_fields"] == ["po_number", "item_code", "quantity", "price"]
    assert payload["purchase_order_sample_csv"].startswith("P.O. Number,P.O. Date,Vendor Number")
    assert payload["inventory_sample_csv"].startswith("P.O. Number,Item Code,Quantity,Price")


def test_purchase_order_import_preview_flags_missing_vendor_and_item(client: TestClient):
    response = client.post(
        "/api/purchase-orders/import-preview",
        json={
            "purchase_orders_csv": "\n".join(
                [
                    "P.O. Number,P.O. Date,Vendor Number,Expected Ship Date,Comments,P.O. Status,Ship Line,Total for PO,InventoryUpdateOn,SentToPeachtree",
                    "GR-20/2010,9/8/2010,999,10/9/2010,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                ]
            ),
            "inventory_csv": "\n".join(
                [
                    "P.O. Number,Item Code,Quantity,Price,Family Name,Item Status,Sub Total Weight,Inv Updated",
                    "GR-20/2010,UNKNOWN-ITEM,4,$127.00,,,0.00,TRUE",
                ]
            ),
            "has_header": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 2
    messages = " ".join(" ".join(row["messages"]) for row in payload["rows"])
    assert "Vendor Number does not match any supplier" in messages
    assert "Item Code does not match any item" in messages


def test_purchase_order_import_creates_purchase_order_lines_and_inventory(client: TestClient):
    supplier_response = client.post(
        "/api/suppliers",
        json={
            "vendor_number": "62",
            "name": "Dahnay Logistics",
            "payment_terms": "Net 30",
            "currency": "USD",
            "status": "active",
        },
    )
    assert supplier_response.status_code == 201

    item_response = client.post(
        "/api/items",
        json={
            "item_code": "1053",
            "sku": "1053",
            "name": "Aurora Base",
            "unit_price": "250.00",
            "is_active": True,
        },
    )
    assert item_response.status_code == 201
    item_id = item_response.json()["id"]

    preview_response = client.post(
        "/api/purchase-orders/import-preview",
        json={
            "purchase_orders_csv": "\n".join(
                [
                    "P.O. Number,P.O. Date,Vendor Number,Expected Ship Date,Comments,P.O. Status,Ship Line,Total for PO,InventoryUpdateOn,SentToPeachtree",
                    "GR-20/2010,9/8/2010,62,10/9/2010,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                ]
            ),
            "inventory_csv": "\n".join(
                [
                    "P.O. Number,Item Code,Quantity,Price,Family Name,Item Status,Sub Total Weight,Inv Updated",
                    "GR-20/2010,1053,4,$127.00,,,0.00,TRUE",
                ]
            ),
            "has_header": True,
        },
    )
    assert preview_response.status_code == 200
    preview_payload = preview_response.json()
    assert preview_payload["summary"]["error_rows"] == 0
    assert preview_payload["summary"]["create_count"] == 1

    execute_response = client.post(
        "/api/purchase-orders/import",
        json={
            "purchase_orders_csv": "\n".join(
                [
                    "P.O. Number,P.O. Date,Vendor Number,Expected Ship Date,Comments,P.O. Status,Ship Line,Total for PO,InventoryUpdateOn,SentToPeachtree",
                    "GR-20/2010,9/8/2010,62,10/9/2010,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                ]
            ),
            "inventory_csv": "\n".join(
                [
                    "P.O. Number,Item Code,Quantity,Price,Family Name,Item Status,Sub Total Weight,Inv Updated",
                    "GR-20/2010,1053,4,$127.00,,,0.00,TRUE",
                ]
            ),
            "has_header": True,
        },
    )
    assert execute_response.status_code == 201
    execute_payload = execute_response.json()
    assert execute_payload["summary"]["create_count"] == 1
    assert execute_payload["imported_purchase_orders"][0]["po_number"] == "GR-20/2010"
    assert execute_payload["imported_purchase_orders"][0]["line_count"] == 1

    purchase_orders_response = client.get("/api/purchase-orders")
    assert purchase_orders_response.status_code == 200
    purchase_orders = purchase_orders_response.json()
    assert len(purchase_orders) == 1
    po_id = purchase_orders[0]["id"]
    assert purchase_orders[0]["po_number"] == "GR-20/2010"
    assert purchase_orders[0]["status"] == "RECEIVED"
    assert purchase_orders[0]["supplier_name"] == "Dahnay Logistics"

    purchase_order_detail = client.get(f"/api/purchase-orders/{po_id}")
    assert purchase_order_detail.status_code == 200
    po_detail_payload = purchase_order_detail.json()
    assert len(po_detail_payload["lines"]) == 1
    assert po_detail_payload["lines"][0]["item_name"] == "Aurora Base"
    assert po_detail_payload["lines"][0]["quantity"] in {"4.0", "4.00", 4}
    assert po_detail_payload["lines"][0]["qty_received"] in {"4.0", "4.00", 4}

    item_detail_response = client.get(f"/api/items/{item_id}/360")
    assert item_detail_response.status_code == 200
    item_payload = item_detail_response.json()["item"]
    assert item_payload["on_hand_qty"] in {"4.0", "4.00", 4}
    assert item_payload["preferred_supplier_name"] == "Dahnay Logistics"


def test_purchase_order_import_normalizes_legacy_blank_and_negative_values(client: TestClient):
    supplier_response = client.post(
        "/api/suppliers",
        json={
            "vendor_number": "66",
            "name": "Legacy Granite",
            "payment_terms": "Net 30",
            "currency": "USD",
            "status": "active",
        },
    )
    assert supplier_response.status_code == 201

    for item_code, item_name in [("3717", "Blank Price Item"), ("3419", "Negative Price Item"), ("3610", "Negative Qty Item"), ("10079", "Blank Qty Item")]:
        item_response = client.post(
            "/api/items",
            json={
                "item_code": item_code,
                "sku": item_code,
                "name": item_name,
                "unit_price": "100.00",
                "is_active": True,
            },
        )
        assert item_response.status_code == 201

    response = client.post(
        "/api/purchase-orders/import-preview",
        json={
            "purchase_orders_csv": "\n".join(
                [
                    "P.O. Number,P.O. Date,Vendor Number,Expected Ship Date,Comments,P.O. Status,Ship Line,Total for PO,InventoryUpdateOn,SentToPeachtree",
                    "GR-01/2004,9/8/2004,66,10/9/2004,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                    "GR-01/2026,9/8/2026,66,10/9/2026,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                    "GR-30/2003,9/8/2003,66,10/9/2003,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                    "GR-12/2016,9/8/2016,66,10/9/2016,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
                ]
            ),
            "inventory_csv": "\n".join(
                [
                    "P.O. Number,Item Code,Quantity,Price,Family Name,Item Status,Sub Total Weight,Inv Updated",
                    "GR-01/2004,3717,1,,,,0.00,TRUE",
                    'GR-01/2026,3419,1,"($1,530.00)",,,0.00,TRUE',
                    'GR-30/2003,3610,-1,"($526.00)",,,0.00,TRUE',
                    "GR-12/2016,10079,,,,,0.00,TRUE",
                ]
            ),
            "has_header": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 0
    assert payload["summary"]["skip_count"] == 1
    by_po = {row["po_number"]: row for row in payload["rows"] if row["source"] == "INVENTORY"}
    assert by_po["GR-01/2004"]["unit_cost"] in {"0.0", "0.00", 0, "0"}
    assert by_po["GR-01/2026"]["unit_cost"] in {"1530.0", "1530.00", 1530, "1530"}
    assert by_po["GR-30/2003"]["quantity"] in {"1.0", "1.00", 1, "1"}
    assert by_po["GR-30/2003"]["unit_cost"] in {"526.0", "526.00", 526, "526"}
    assert by_po["GR-12/2016"]["action"] == "SKIP"
