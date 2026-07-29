import SwiggyAgent from "@/components/swiggy-agent";
import { providerInfo } from "@/lib/agent/provider";

// The footer names the live LLM endpoint, which is env-driven — read it per
// request so flipping LLM_PROVIDER/LLM_MODEL doesn't need a rebuild.
export const dynamic = "force-dynamic";

export default function Home() {
  const { label, model, shortModel } = providerInfo();
  return <SwiggyAgent provider={{ label, model, shortModel }} />;
}
