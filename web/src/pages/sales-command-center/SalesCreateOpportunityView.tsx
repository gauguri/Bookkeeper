import { useNavigate } from "react-router-dom";
import CreateOpportunityDrawer from "../../components/sales/CreateOpportunityDrawer";

export default function SalesCreateOpportunityView() {
  const navigate = useNavigate();
  return <CreateOpportunityDrawer open mode="inline" onClose={() => navigate("/sales/command-center/opportunities")} onCreated={(id, saveNew) => {
    if (saveNew) return;
    navigate(`/sales/opportunities/${id}`);
  }} />;
}
