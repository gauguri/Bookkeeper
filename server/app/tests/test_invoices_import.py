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


def test_sales_import_format_contract(client: TestClient):
    response = client.get("/api/invoices/import-format")

    assert response.status_code == 200
    payload = response.json()
    assert payload["sales_required_fields"] == [
        "sales_order_number",
        "order_date",
        "customer_number",
        "invoice_number",
        "invoice_date",
        "invoice_total",
    ]
    assert payload["line_required_fields"] == [
        "sales_order_number",
        "item_code",
        "quantity",
        "sell_price",
    ]
    assert payload["sales_sample_csv"].startswith("Sales Order Number,Order Date,Sales Person")
    assert payload["line_sample_csv"].startswith("Sales Order Number,Item Code,Quantity,Sell Price")


def test_sales_import_preview_flags_missing_customer_item_and_header_errors(client: TestClient):
    response = client.post(
        "/api/invoices/import-preview",
        json={
            "sales_csv": "\n".join(
                [
                    "Sales Order Number,Order Date,Sales Person,Customer Number,Customer PO Number,Comments,P.O. Number,ConvertFlag,Invoice Number,Invoice Date,Pay By Date,Discount Rate,InvoiceTotal,InvoicePayment,BackOrder,SentToPeachTree,OfficeComment,Paid,DeliverTo,ShipLabel,PrintLabel",
                    '3078,3/13/2001,MIKE,999,,3 MONTHS DELIVERY TIME,GR-08/2001,TRUE,5386,7/31/2001,8/30/2001,$183.00,"$3,140.00","$1,220.00",FALSE,FALSE,,TRUE,,TRUE,FALSE',
                    '3078,3/14/2001,MIKE,999,,DUPLICATE ORDER,GR-08/2001,TRUE,5387,7/31/2001,8/30/2001,$183.00,"$3,140.00","$1,220.00",FALSE,FALSE,,TRUE,,TRUE,FALSE',
                ]
            ),
            "sales_inventory_csv": "\n".join(
                [
                    "Sales Order Number,Item Code,Quantity,Sell Price,SInvAmount,Family Name,Item Status,ConvertFlag,Carrier,Family Name,Freight Rate,Inv Updated,InvoiceNumber,Ship To Name,Shipping Address,Shipping Address,City,State,Zipcode,DiscountRate,OceanFreightSurcharge,Marked",
                    '3078,UNKNOWN-ITEM,9,$240.00,"$2,160.00",ABRAMOV 2010236,SHIPPED,TRUE,,ABRAMOV 2010236,$0.00,TRUE,5386,,,,,,,0,$0.00,FALSE',
                ]
            ),
            "has_header": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 3
    messages = " ".join(" ".join(row["messages"]) for row in payload["rows"])
    assert "Customer Number does not match an existing customer." in messages
    assert "Sales Order Number is duplicated in the upload." in messages
    assert "Item Code does not match an existing item." in messages
    assert "Sales header row for this Sales Order Number has validation errors." in messages


def test_sales_import_creates_invoice_and_lines(client: TestClient):
    customer_response = client.post(
        "/api/customers",
        json={
            "customer_number": "570",
            "name": "Abramov Memorials",
            "payment_terms": "Net 30",
            "is_active": True,
        },
    )
    assert customer_response.status_code == 201

    item_response = client.post(
        "/api/items",
        json={
            "item_code": "1267",
            "sku": "1267",
            "name": "Legacy Monument",
            "unit_price": "240.00",
            "cost_price": "100.00",
            "is_active": True,
        },
    )
    assert item_response.status_code == 201

    preview_response = client.post(
        "/api/invoices/import-preview",
        json={
            "sales_csv": "\n".join(
                [
                    "Sales Order Number,Order Date,Sales Person,Customer Number,Customer PO Number,Comments,P.O. Number,ConvertFlag,Invoice Number,Invoice Date,Pay By Date,Discount Rate,InvoiceTotal,InvoicePayment,BackOrder,SentToPeachTree,OfficeComment,Paid,DeliverTo,ShipLabel,PrintLabel",
                    '3078,3/13/2001,MIKE,570,,3 MONTHS DELIVERY TIME,GR-08/2001,TRUE,5386,7/31/2001,8/30/2001,$183.00,"$2,160.00","$1,220.00",FALSE,FALSE,,TRUE,,TRUE,FALSE',
                ]
            ),
            "sales_inventory_csv": "\n".join(
                [
                    "Sales Order Number,Item Code,Quantity,Sell Price,SInvAmount,Family Name,Item Status,ConvertFlag,Carrier,Family Name,Freight Rate,Inv Updated,InvoiceNumber,Ship To Name,Shipping Address,Shipping Address,City,State,Zipcode,DiscountRate,OceanFreightSurcharge,Marked",
                    '3078,1267,9,$240.00,"$2,160.00",ABRAMOV 2010236,SHIPPED,TRUE,,ABRAMOV 2010236,$0.00,TRUE,5386,,,,,,,0,$0.00,FALSE',
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
        "/api/invoices/import",
        json={
            "sales_csv": "\n".join(
                [
                    "Sales Order Number,Order Date,Sales Person,Customer Number,Customer PO Number,Comments,P.O. Number,ConvertFlag,Invoice Number,Invoice Date,Pay By Date,Discount Rate,InvoiceTotal,InvoicePayment,BackOrder,SentToPeachTree,OfficeComment,Paid,DeliverTo,ShipLabel,PrintLabel",
                    '3078,3/13/2001,MIKE,570,,3 MONTHS DELIVERY TIME,GR-08/2001,TRUE,5386,7/31/2001,8/30/2001,$183.00,"$2,160.00","$1,220.00",FALSE,FALSE,,TRUE,,TRUE,FALSE',
                ]
            ),
            "sales_inventory_csv": "\n".join(
                [
                    "Sales Order Number,Item Code,Quantity,Sell Price,SInvAmount,Family Name,Item Status,ConvertFlag,Carrier,Family Name,Freight Rate,Inv Updated,InvoiceNumber,Ship To Name,Shipping Address,Shipping Address,City,State,Zipcode,DiscountRate,OceanFreightSurcharge,Marked",
                    '3078,1267,9,$240.00,"$2,160.00",ABRAMOV 2010236,SHIPPED,TRUE,,ABRAMOV 2010236,$0.00,TRUE,5386,,,,,,,0,$0.00,FALSE',
                ]
            ),
            "has_header": True,
        },
    )
    assert execute_response.status_code == 201
    execute_payload = execute_response.json()
    assert execute_payload["summary"]["create_count"] == 1
    assert execute_payload["imported_invoices"][0]["invoice_number"] == "5386"
    assert execute_payload["imported_invoices"][0]["line_count"] == 1

    invoices_response = client.get("/api/invoices")
    assert invoices_response.status_code == 200
    invoices_payload = invoices_response.json()
    assert len(invoices_payload) == 1
    assert invoices_payload[0]["invoice_number"] == "5386"
    assert invoices_payload[0]["status"] == "DRAFT"

    invoice_detail_response = client.get("/api/invoices/5386")
    assert invoice_detail_response.status_code == 200
    invoice_payload = invoice_detail_response.json()
    assert invoice_payload["customer"]["name"] == "Abramov Memorials"
    assert invoice_payload["total"] in {"2160.0", "2160.00", 2160}
    assert len(invoice_payload["lines"]) == 1
    assert invoice_payload["lines"][0]["description"] == "ABRAMOV 2010236"
    assert invoice_payload["lines"][0]["quantity"] in {"9.0", "9.00", 9}
    assert invoice_payload["lines"][0]["unit_cost"] in {"100.0", "100.00", 100}
