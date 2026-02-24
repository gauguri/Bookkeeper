import { useNavigate } from "react-router-dom";
import CreateAccountDrawer from "../../components/sales/CreateAccountDrawer";

export default function SalesCreateAccountView() {
  const navigate = useNavigate();
  return <CreateAccountDrawer open mode="inline" onClose={() => navigate("/sales/command-center/accounts")} onCreated={(id, saveNew) => {
    if (saveNew) return;
    navigate(`/sales/accounts/${id}`);
  }} />;
}
