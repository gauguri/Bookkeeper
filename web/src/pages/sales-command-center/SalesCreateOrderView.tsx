import { useNavigate } from "react-router-dom";
import CreateOrderDrawer from "../../components/sales/CreateOrderDrawer";

export default function SalesCreateOrderView() {
  const navigate = useNavigate();
  return <CreateOrderDrawer open mode="inline" onClose={() => navigate("/sales/command-center/orders")} onCreated={(id, saveNew) => {
    if (saveNew) return;
    navigate(`/sales/orders/${id}`);
  }} />;
}
