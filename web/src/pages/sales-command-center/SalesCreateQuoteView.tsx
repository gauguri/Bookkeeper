import { useNavigate } from "react-router-dom";
import CreateQuoteDrawer from "../../components/sales/CreateQuoteDrawer";

export default function SalesCreateQuoteView() {
  const navigate = useNavigate();
  return <CreateQuoteDrawer open mode="inline" onClose={() => navigate("/sales/command-center/quotes")} onCreated={(id, saveNew) => {
    if (saveNew) return;
    navigate(`/sales/quotes/${id}`);
  }} />;
}
